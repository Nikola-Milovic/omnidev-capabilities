/**
 * Documentation Update Module
 *
 * Handles automatic documentation updates when a PRD is completed.
 * Analyzes what features/modules were changed and updates relevant docs.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentConfig, PRD } from "./types.js";
import { getPRD, getProgress, getSpec } from "./state.js";

/**
 * Documentation principles - shared between automated updates and skills
 */
export const DOCUMENTATION_PRINCIPLES = `## Documentation Principles

- **Be concise**: Every sentence should add value. Remove fluff.
- **Focus on the "why"**: Explain rationale, not just mechanics.
- **Document patterns**: If there's a convention, name it and explain when to use it.
- **Keep it current**: Remove or update outdated information.
- **Respect scope**: Only update what's relevant to the PRD changes.

## Content Guidelines

- Keep content **concise and clear** - avoid verbose explanations
- Focus on **core functionality** and **high-level concepts**
- Explain **why** things work a certain way, not just what they do
- Document **patterns** - naming conventions, terminology, architectural decisions
- Maintain consistency with existing doc style
- Update "Last updated" date if the doc has one (use today's date)`;

/**
 * Output format instructions for documentation updates
 */
export const DOCUMENTATION_OUTPUT_FORMAT = `## Output Format

For each doc file you update, use this format:

\`\`\`
<doc-update file="filename.md">
<reason>Brief explanation of why this doc needs updating</reason>
<changes>
Summary of what you're changing
</changes>
<content>
[Full updated content of the file - this will replace the entire file]
</content>
</doc-update>
\`\`\`

If no documentation updates are needed, output:

\`\`\`
<doc-update-result>NO_UPDATES_NEEDED</doc-update-result>
<reason>Explanation of why no docs need updating</reason>
\`\`\`

Important:
- Only update docs that are genuinely affected by the PRD changes
- Preserve existing content that isn't related to the changes
- Maintain the existing structure and formatting style of each doc
- Include the "Last updated" date if the doc has one (use today's date)`;

export interface DocFile {
	path: string;
	name: string;
	content: string;
}

export interface DocumentationContext {
	prd: PRD;
	spec: string;
	progress: string;
	relevantDocs: DocFile[];
}

/**
 * Find documentation files in a directory
 */
export function findDocFiles(docsPath: string): DocFile[] {
	if (!existsSync(docsPath)) {
		return [];
	}

	const docs: DocFile[] = [];

	try {
		const entries = readdirSync(docsPath, { withFileTypes: true });

		for (const entry of entries) {
			if (entry.isFile() && entry.name.endsWith(".md")) {
				const filePath = join(docsPath, entry.name);
				try {
					const content = readFileSync(filePath, "utf-8");
					docs.push({
						path: filePath,
						name: entry.name,
						content,
					});
				} catch {
					// Skip files that can't be read
				}
			}
		}
	} catch {
		// Directory not readable
	}

	return docs;
}

/**
 * Generate the documentation update prompt for the agent.
 *
 * This prompt instructs the agent to:
 * 1. Analyze the PRD and what was changed
 * 2. Search for relevant documentation files
 * 3. Update docs with concise, clear content focused on core functionality
 */
export async function generateDocumentationUpdatePrompt(
	prdName: string,
	docsPath: string,
): Promise<{ prompt: string; context: DocumentationContext } | null> {
	const prd = await getPRD(prdName);
	const progressContent = await getProgress(prdName);

	let specContent = "";
	try {
		specContent = await getSpec(prdName);
	} catch {
		specContent = "(spec.md not found)";
	}

	// Find all doc files
	const allDocs = findDocFiles(docsPath);

	if (allDocs.length === 0) {
		console.log(`No documentation files found in ${docsPath}`);
		return null;
	}

	// Create a summary of available docs for the agent
	const docsSummary = allDocs
		.map((doc) => {
			// Extract first heading and first paragraph as summary
			const lines = doc.content.split("\n");
			const heading = lines.find((l) => l.startsWith("# "))?.replace("# ", "") || doc.name;
			const firstPara = lines.find((l) => l.trim() && !l.startsWith("#"))?.slice(0, 200) || "";
			return `- **${doc.name}**: ${heading}\n  ${firstPara}${firstPara.length >= 200 ? "..." : ""}`;
		})
		.join("\n");

	const prompt = `# Documentation Update Task

You are updating project documentation after completing a PRD. Your goal is to ensure documentation stays accurate and reflects the current state of the system.

## Completed PRD Information

**Name:** ${prd.name}
**Description:** ${prd.description}
**Stories Completed:** ${prd.stories.filter((s) => s.status === "completed").length}/${prd.stories.length}

### Feature Specification

\`\`\`markdown
${specContent.slice(0, 8000)}${specContent.length > 8000 ? "\n...(truncated)" : ""}
\`\`\`

### Implementation Progress Log

\`\`\`
${progressContent.slice(0, 15000)}${progressContent.length > 15000 ? "\n...(truncated)" : ""}
\`\`\`

## Available Documentation Files

Documentation path: \`${docsPath}\`

${docsSummary}

## Your Task

1. **Analyze what changed**: Review the PRD spec and progress log to understand what features, modules, or patterns were added or modified.

2. **Identify relevant docs**: Determine which documentation files (if any) should be updated based on the changes. Look for:
   - Direct feature overlap (e.g., PRD changed events → check events.md)
   - Terminology changes that affect existing docs
   - New patterns or conventions that should be documented
   - Architecture changes that affect system docs

3. **Update documentation**: For each relevant doc file, make updates following the principles below.

${DOCUMENTATION_PRINCIPLES}

${DOCUMENTATION_OUTPUT_FORMAT}
`;

	return {
		prompt,
		context: {
			prd,
			spec: specContent,
			progress: progressContent,
			relevantDocs: allDocs,
		},
	};
}

/**
 * Parse documentation updates from agent output
 */
export function parseDocumentationUpdates(
	output: string,
): { file: string; reason: string; changes: string; content: string }[] {
	const updates: { file: string; reason: string; changes: string; content: string }[] = [];

	// Check if no updates needed
	if (output.includes("<doc-update-result>NO_UPDATES_NEEDED</doc-update-result>")) {
		return [];
	}

	// Parse doc-update blocks
	const updateRegex =
		/<doc-update file="([^"]+)">\s*<reason>([\s\S]*?)<\/reason>\s*<changes>([\s\S]*?)<\/changes>\s*<content>([\s\S]*?)<\/content>\s*<\/doc-update>/g;

	let match = updateRegex.exec(output);
	while (match !== null) {
		// All groups are guaranteed to exist by the regex pattern
		updates.push({
			file: match[1]!,
			reason: match[2]!.trim(),
			changes: match[3]!.trim(),
			content: match[4]!.trim(),
		});
		match = updateRegex.exec(output);
	}

	return updates;
}

/**
 * Apply documentation updates from agent output
 */
export async function applyDocumentationUpdates(
	output: string,
	docsPath: string,
): Promise<{ updated: string[]; skipped: string[]; errors: string[] }> {
	const { writeFileSync } = await import("node:fs");

	const updates = parseDocumentationUpdates(output);
	const results = {
		updated: [] as string[],
		skipped: [] as string[],
		errors: [] as string[],
	};

	if (updates.length === 0) {
		return results;
	}

	for (const update of updates) {
		const filePath = join(docsPath, update.file);

		// Verify the file exists (we only update existing docs, don't create new ones)
		if (!existsSync(filePath)) {
			results.skipped.push(`${update.file} (file not found)`);
			continue;
		}

		try {
			writeFileSync(filePath, update.content, "utf-8");
			results.updated.push(update.file);
			console.log(`  ✓ Updated ${update.file}: ${update.changes.split("\n")[0]}`);
		} catch (error) {
			const errMsg = error instanceof Error ? error.message : String(error);
			results.errors.push(`${update.file}: ${errMsg}`);
		}
	}

	return results;
}

/**
 * Run documentation update for a completed PRD.
 *
 * This is the main entry point called after a PRD transitions to completed.
 */
export async function updateDocumentation(
	prdName: string,
	docsPath: string,
	agentConfig: AgentConfig,
	runAgentFn: (
		prompt: string,
		config: AgentConfig,
	) => Promise<{ output: string; exitCode: number }>,
): Promise<{ updated: string[]; skipped: string[]; errors: string[] }> {
	console.log("\nAnalyzing documentation for updates...");

	const promptResult = await generateDocumentationUpdatePrompt(prdName, docsPath);

	if (!promptResult) {
		console.log("No documentation found to update.");
		return { updated: [], skipped: [], errors: [] };
	}

	console.log(`Found ${promptResult.context.relevantDocs.length} documentation files to analyze.`);

	// Run the agent with the documentation update prompt
	const { output } = await runAgentFn(promptResult.prompt, agentConfig);

	// Apply the updates
	const results = await applyDocumentationUpdates(output, docsPath);

	// Summary
	if (results.updated.length > 0) {
		console.log(`\n📝 Documentation updated: ${results.updated.length} file(s)`);
	} else {
		console.log("\n📝 No documentation updates needed.");
	}

	if (results.errors.length > 0) {
		console.log(`⚠️  Errors: ${results.errors.join(", ")}`);
	}

	return results;
}
