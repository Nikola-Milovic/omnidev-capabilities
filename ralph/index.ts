/**
 * Ralph Capability - AI Agent Orchestrator
 *
 * Provides PRD-driven development through iterative AI agent invocations.
 */

import type { CapabilityExport } from "@omnidev-ai/capability";
import { ralphRoutes } from "./cli.js";
import { sync } from "./sync.js";
import { DOCUMENTATION_PRINCIPLES, DOCUMENTATION_OUTPUT_FORMAT } from "./lib/documentation.js";

/**
 * Generate the update-docs skill markdown using shared documentation principles
 */
function generateUpdateDocsSkill(): string {
	return `---
name: update-docs
description: "Update project documentation based on a completed PRD. Analyzes what features/modules were changed and updates relevant docs in the configured docs path."
---

# Update Documentation

Update project documentation based on a completed PRD's changes. This skill analyzes the PRD's spec and progress log to understand what was changed, then finds and updates relevant documentation files.

## Usage

\`\`\`
/update-docs <prd-name>
\`\`\`

Where \`<prd-name>\` is the name of a completed PRD to analyze.

## The Job

When a user invokes this skill:

### 1. Load Configuration

Read the Ralph configuration to get the docs path:

\`\`\`bash
cat ralph.toml
\`\`\`

Look for the \`[docs]\` section with the \`path\` setting. If not configured, ask the user where their docs are located.

### 2. Find the PRD

Locate the PRD in the completed directory:

\`\`\`bash
ls .omni/state/ralph/prds/completed/
\`\`\`

If the PRD isn't found in completed, check other statuses (testing, in_progress) and inform the user.

### 3. Read PRD Context

Read the PRD's spec and progress to understand what was changed:

\`\`\`bash
cat .omni/state/ralph/prds/completed/<prd-name>/spec.md
cat .omni/state/ralph/prds/completed/<prd-name>/progress.txt
cat .omni/state/ralph/prds/completed/<prd-name>/prd.json
\`\`\`

### 4. Analyze Documentation

List all documentation files in the configured docs path:

\`\`\`bash
ls -la <docs-path>/*.md
\`\`\`

For each doc file, read the content and determine if it's relevant to the PRD changes.

### 5. Identify Relevant Docs

Look for documentation that might need updates based on:

- **Direct feature overlap**: PRD changed events → check events.md
- **Terminology changes**: New naming conventions that affect existing docs
- **New patterns**: Architectural patterns that should be documented
- **System changes**: Infrastructure or configuration changes

### 6. Update Documentation

For each relevant doc file, update it following these principles:

${DOCUMENTATION_PRINCIPLES}

${DOCUMENTATION_OUTPUT_FORMAT}

### 7. Report Changes

After updating, summarize:

- Which docs were updated and why
- What key changes were made
- Any docs that were analyzed but didn't need updates

## Example

\`\`\`
/update-docs user-authentication
\`\`\`

This would:
1. Read the \`user-authentication\` PRD from completed
2. Analyze the spec to see authentication was added
3. Find \`auth-and-secrets.md\` in docs
4. Update it with the new authentication patterns
5. Report what was changed

## When to Use This Skill

- After manually completing a PRD (without auto docs update)
- To re-run documentation updates for a past PRD
- When you've made changes that affect documentation
- To verify documentation is in sync with implementation

## Configuration

Add to your \`ralph.toml\`:

\`\`\`toml
[docs]
path = "docs"  # Relative to project root
auto_update = true  # Auto-update on PRD completion (default: true)
\`\`\`
`;
}

// Default export: Structured capability export
export default {
	cliCommands: {
		ralph: ralphRoutes,
	},

	skills: [
		{
			skillMd: generateUpdateDocsSkill(),
		},
	],

	gitignore: ["ralph/", "*.ralph.log"],

	sync,
} satisfies CapabilityExport;

// Re-export everything from lib for programmatic usage
export * from "./lib/index.js";
