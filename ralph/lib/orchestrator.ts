/**
 * Ralph Orchestrator
 *
 * Handles agent spawning and iteration loops for PRD-driven development.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { generatePrompt } from "./prompt.js";
import {
	extractAndSaveFindings,
	getNextStory,
	getPRD,
	hasBlockedStories,
	isPRDComplete,
	markPRDCompleted,
	markPRDStarted,
	movePRD,
	savePRD,
	updateLastRun,
	updateMetrics,
	updateStoryStatus,
} from "./state.js";
import type { AgentConfig, RalphConfig, Story } from "./types.js";

const CONFIG_PATH = "omni.toml";

// Track current state for Ctrl+C handler
let currentPrdName: string | null = null;
let currentStory: Story | null = null;
let isShuttingDown = false;

/**
 * Loads Ralph configuration from omni.toml [ralph] section
 */
export async function loadRalphConfig(): Promise<RalphConfig> {
	if (!existsSync(CONFIG_PATH)) {
		throw new Error("omni.toml not found. Create it with a [ralph] section.");
	}

	const content = await readFile(CONFIG_PATH, "utf-8");

	// Parse TOML manually (simple parser for our needs)
	const lines = content.split("\n");
	const config: Partial<RalphConfig> = {
		agents: {},
		testing: {},
		scripts: {},
	};

	let currentSection: string | null = null;
	let currentAgent: string | null = null;
	let inMultilineString = false;
	let multilineKey: string | null = null;
	let multilineValue = "";

	for (const line of lines) {
		const trimmed = line.trim();

		// Handle multiline strings (triple quotes)
		if (inMultilineString) {
			if (trimmed === '"""') {
				// End of multiline string
				inMultilineString = false;
				if (currentSection === "ralph.testing" && multilineKey === "instructions") {
					if (!config.testing) config.testing = {};
					config.testing.instructions = multilineValue.trim();
				}
				multilineKey = null;
				multilineValue = "";
			} else {
				multilineValue += `${line}\n`;
			}
			continue;
		}

		// Skip empty lines and comments (when not in multiline)
		if (trimmed === "" || trimmed.startsWith("#")) {
			continue;
		}

		// Section headers
		if (trimmed.startsWith("[")) {
			const match = trimmed.match(/^\[([^\]]+)\]$/);
			if (match) {
				const section = match[1];
				if (section === "ralph") {
					currentSection = "ralph";
					currentAgent = null;
				} else if (section === "ralph.testing") {
					currentSection = "ralph.testing";
					currentAgent = null;
				} else if (section === "ralph.scripts") {
					currentSection = "ralph.scripts";
					currentAgent = null;
				} else if (section?.startsWith("ralph.agents.")) {
					currentSection = "ralph.agents";
					currentAgent = section.slice("ralph.agents.".length);
					if (!config.agents) {
						config.agents = {};
					}
					config.agents[currentAgent] = { command: "", args: [] };
				} else {
					// Not a ralph section, ignore
					currentSection = null;
					currentAgent = null;
				}
			}
			continue;
		}

		// Check for multiline string start
		if (trimmed.includes('= """')) {
			const keyMatch = trimmed.match(/^(\w+)\s*=\s*"""/);
			if (keyMatch) {
				inMultilineString = true;
				multilineKey = keyMatch[1] ?? null;
				// Check if there's content after the opening """
				const afterQuotes = trimmed.slice(trimmed.indexOf('"""') + 3);
				if (afterQuotes) {
					multilineValue = `${afterQuotes}\n`;
				}
				continue;
			}
		}

		// Key-value pairs
		const match = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
		if (match) {
			const [, key, value] = match;
			if (!key || !value) {
				continue;
			}

			if (currentSection === "ralph") {
				if (key === "default_agent") {
					config.default_agent = value.replace(/["']/g, "");
				} else if (key === "default_iterations") {
					config.default_iterations = Number.parseInt(value, 10);
				}
			} else if (currentSection === "ralph.testing") {
				if (!config.testing) {
					config.testing = {};
				}
				if (key === "project_verification_instructions") {
					config.testing.project_verification_instructions = value.replace(/["']/g, "");
				} else if (key === "test_iterations") {
					config.testing.test_iterations = Number.parseInt(value, 10);
				} else if (key === "web_testing_enabled") {
					config.testing.web_testing_enabled = value.replace(/["']/g, "") === "true";
				} else if (key === "instructions" && !value.startsWith('"""')) {
					config.testing.instructions = value.replace(/["']/g, "");
				} else if (key === "health_check_timeout") {
					config.testing.health_check_timeout = Number.parseInt(value, 10);
				}
			} else if (currentSection === "ralph.scripts") {
				if (!config.scripts) {
					config.scripts = {};
				}
				const scriptValue = value.replace(/["']/g, "");
				if (key === "setup") {
					config.scripts.setup = scriptValue;
				} else if (key === "start") {
					config.scripts.start = scriptValue;
				} else if (key === "health_check") {
					config.scripts.health_check = scriptValue;
				} else if (key === "teardown") {
					config.scripts.teardown = scriptValue;
				}
			} else if (currentSection === "ralph.agents" && currentAgent) {
				const agent = config.agents?.[currentAgent];
				if (!agent) {
					continue;
				}

				if (key === "command") {
					agent.command = value.replace(/["']/g, "");
				} else if (key === "args") {
					// Parse array
					const arrayMatch = value.match(/\[(.*)\]/);
					if (arrayMatch?.[1]) {
						agent.args = arrayMatch[1].split(",").map((arg) => arg.trim().replace(/["']/g, ""));
					}
				}
			}
		}
	}

	// Validate required fields
	if (!config.default_agent || !config.default_iterations) {
		throw new Error(
			"Invalid Ralph config in omni.toml: missing required fields (default_agent, default_iterations)",
		);
	}

	return config as RalphConfig;
}

/**
 * Options for running an agent
 */
export interface RunAgentOptions {
	/** Stream output in real-time (for agents that support --output-format stream-json) */
	stream?: boolean;
}

/**
 * Context for accumulating stream content
 */
interface StreamContext {
	/** Accumulated plain text from assistant messages (for parsing) */
	plainText: string;
}

/**
 * Parse and display a stream-json line from Claude Code
 * Returns extracted text content for accumulation
 */
function handleStreamLine(line: string, ctx: StreamContext): void {
	try {
		const event = JSON.parse(line);

		switch (event.type) {
			case "assistant": {
				// Extract text content from assistant messages
				const content = event.message?.content;
				if (Array.isArray(content)) {
					for (const block of content) {
						if (block.type === "text" && block.text) {
							process.stdout.write(block.text);
							ctx.plainText += block.text;
						} else if (block.type === "tool_use") {
							console.log(`\n[Tool: ${block.name}]`);
						}
					}
				}
				break;
			}
			case "user": {
				// Tool results - don't log these (too verbose)
				break;
			}
			case "result": {
				// Final result - show summary
				if (event.result) {
					console.log(`\n\n--- Agent finished ---`);
					if (event.duration_ms) {
						console.log(`Duration: ${Math.round(event.duration_ms / 1000)}s`);
					}
					if (event.num_turns) {
						console.log(`Turns: ${event.num_turns}`);
					}
					// The result field contains the final text - use it if we haven't accumulated enough
					if (event.result && typeof event.result === "string") {
						// Only use result if plainText is empty (edge case)
						if (!ctx.plainText.trim()) {
							ctx.plainText = event.result;
						}
					}
				}
				break;
			}
			// Ignore system/init events
		}
	} catch {
		// Not JSON or parse error - print as-is for non-Claude agents
		if (line.trim()) {
			console.log(line);
			ctx.plainText += `${line}\n`;
		}
	}
}

/**
 * Spawns an agent process with the given prompt.
 */
export async function runAgent(
	prompt: string,
	agentConfig: AgentConfig,
	options?: RunAgentOptions,
): Promise<{ output: string; exitCode: number }> {
	const stream = options?.stream ?? false;

	return new Promise((resolve, reject) => {
		const proc = spawn(agentConfig.command, agentConfig.args, {
			stdio: ["pipe", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";
		let lineBuffer = "";
		const streamCtx: StreamContext = { plainText: "" };

		proc.stdout?.on("data", (data) => {
			const chunk = data.toString();
			stdout += chunk;

			if (stream) {
				// Buffer and process complete lines for stream-json format
				lineBuffer += chunk;
				const lines = lineBuffer.split("\n");
				// Keep the last incomplete line in buffer
				lineBuffer = lines.pop() ?? "";

				for (const line of lines) {
					if (line.trim()) {
						handleStreamLine(line, streamCtx);
					}
				}
			}
		});

		proc.stderr?.on("data", (data) => {
			const chunk = data.toString();
			stderr += chunk;

			if (stream) {
				// Show stderr immediately
				process.stderr.write(chunk);
			}
		});

		proc.on("error", (error) => {
			reject(error);
		});

		proc.on("close", (code) => {
			// Process any remaining buffered content
			if (stream && lineBuffer.trim()) {
				handleStreamLine(lineBuffer, streamCtx);
			}

			// When streaming, return the accumulated plain text for parsing
			// Otherwise return raw stdout/stderr
			const output = stream && streamCtx.plainText ? streamCtx.plainText : stdout + stderr;
			resolve({ output, exitCode: code ?? 1 });
		});

		// Write prompt to stdin
		if (proc.stdin) {
			proc.stdin.write(prompt);
			proc.stdin.end();
		}
	});
}

/**
 * Parse story status updates from agent output.
 * Looks for patterns like:
 * - "Story US-001 completed"
 * - "Marked US-001 as completed"
 * - JSON blocks with status updates
 */
function parseStatusFromOutput(output: string, storyId: string): "completed" | "blocked" | null {
	// Look for explicit completion messages
	const completionPatterns = [
		new RegExp(`${storyId}\\s+completed`, "i"),
		new RegExp(`marked\\s+${storyId}\\s+as\\s+completed`, "i"),
		new RegExp(`${storyId}.*status.*completed`, "i"),
		/All checks pass/i,
		/Committed changes/i,
	];

	let completionHints = 0;
	for (const pattern of completionPatterns) {
		if (pattern.test(output)) {
			completionHints++;
		}
	}

	// Look for blocking patterns
	const blockPatterns = [
		new RegExp(`${storyId}.*blocked`, "i"),
		/cannot\s+(complete|proceed)/i,
		/unclear requirements/i,
		/missing.*dependencies/i,
	];

	for (const pattern of blockPatterns) {
		if (pattern.test(output)) {
			return "blocked";
		}
	}

	// If we have multiple completion hints, consider it completed
	if (completionHints >= 2) {
		return "completed";
	}

	// Look for JSON status updates in output
	const jsonMatch = output.match(/\{[^}]*"status"\s*:\s*"(completed|blocked)"[^}]*\}/i);
	if (jsonMatch?.[1]) {
		return jsonMatch[1] as "completed" | "blocked";
	}

	return null;
}

/**
 * Handle Ctrl+C - save state and exit gracefully
 */
async function handleShutdown(): Promise<void> {
	if (isShuttingDown) return;
	isShuttingDown = true;

	console.log("\n\nInterrupted! Saving state...");

	if (currentPrdName && currentStory) {
		// Update lastRun in PRD
		await updateLastRun(currentPrdName, {
			timestamp: new Date().toISOString(),
			storyId: currentStory.id,
			reason: "user_interrupted",
			summary: `Interrupted while working on ${currentStory.id}: ${currentStory.title}`,
		});

		console.log(`Saved state: stopped at ${currentStory.id}`);
	}

	process.exit(0);
}

/**
 * Runs the orchestration loop for a PRD.
 */
export async function runOrchestration(prdName: string, agentOverride?: string): Promise<void> {
	const config = await loadRalphConfig();

	const agentName = agentOverride ?? config.default_agent;
	const maxIterations = config.default_iterations;

	// Validate agent exists
	const agentConfig = config.agents[agentName];
	if (!agentConfig) {
		throw new Error(
			`Agent '${agentName}' not found in config. Available: ${Object.keys(config.agents).join(", ")}`,
		);
	}

	// Set up Ctrl+C handler
	currentPrdName = prdName;
	process.on("SIGINT", handleShutdown);
	process.on("SIGTERM", handleShutdown);

	console.log(`Starting orchestration for PRD: ${prdName}`);
	console.log(`Using agent: ${agentName}`);
	console.log(`Max iterations: ${maxIterations}`);
	console.log(`Press Ctrl+C to stop\n`);

	// Mark PRD as started (records timestamp on first run)
	await markPRDStarted(prdName);

	// Check for blocked stories first
	const blocked = await hasBlockedStories(prdName);
	if (blocked.length > 0) {
		console.log("🚫 Blocked stories found:\n");
		for (const story of blocked) {
			console.log(`  ${story.id}: ${story.title}`);
			if (story.questions.length > 0) {
				console.log("  Questions:");
				for (let i = 0; i < story.questions.length; i++) {
					const q = story.questions[i];
					const ans = story.answers?.[i];
					if (ans) {
						console.log(`    ${i + 1}. ${q}`);
						console.log(`       Answer: ${ans}`);
					} else {
						console.log(`    ${i + 1}. ${q}`);
					}
				}
			}
			console.log();
		}
		console.log("Please resolve these before continuing.");
		console.log(`Use 'omnidev ralph start ${prdName}' to be prompted to answer questions.`);
		return;
	}

	for (let i = 0; i < maxIterations; i++) {
		if (isShuttingDown) break;

		console.log(`\n=== Iteration ${i + 1}/${maxIterations} ===`);

		// Get current PRD and next story
		const prd = await getPRD(prdName);
		const story = await getNextStory(prdName);

		if (!story) {
			console.log("All stories complete!");

			// Mark PRD as completed
			await markPRDCompleted(prdName);

			// Extract findings and move to testing
			console.log("Extracting findings...");
			await extractAndSaveFindings(prdName);

			console.log("Moving PRD to testing...");
			await movePRD(prdName, "testing");

			// Generate verification checklist
			console.log("Generating verification checklist...");
			try {
				const { generateVerification, generateSimpleVerification } = await import(
					"./verification.js"
				);
				try {
					await generateVerification(prdName, agentConfig, runAgent);
					console.log("Verification checklist generated with LLM.");
				} catch {
					console.log("LLM generation failed, using simple generator...");
					await generateSimpleVerification(prdName);
				}
			} catch (error) {
				console.log(`Warning: Could not generate verification checklist: ${error}`);
			}

			// Update lastRun
			await updateLastRun(prdName, {
				timestamp: new Date().toISOString(),
				storyId: "ALL",
				reason: "completed",
				summary: "All stories completed. PRD moved to testing for verification.",
			});

			console.log("\nPRD moved to testing. Next steps:");
			console.log(`  omnidev ralph test ${prdName}              # run automated tests`);
			console.log(`  omnidev ralph complete ${prdName}          # if verified`);
			console.log(`  omnidev ralph prd ${prdName} --move pending # if issues found`);

			return;
		}

		// Update current story for Ctrl+C handler
		currentStory = story;

		// Check if story has been stuck for too many iterations
		const iterationCount = (story.iterationCount ?? 0) + 1;
		if (iterationCount > 3 && story.status === "in_progress") {
			console.log(
				`⚠️  Story ${story.id} has been in_progress for ${iterationCount} iterations without completing.`,
			);
			console.log("Auto-blocking story for manual review.");
			await updateStoryStatus(prdName, story.id, "blocked", [
				`Story has been attempted ${iterationCount} times without successful completion. Please review the implementation and acceptance criteria.`,
			]);

			await updateLastRun(prdName, {
				timestamp: new Date().toISOString(),
				storyId: story.id,
				reason: "blocked",
				summary: `Auto-blocked after ${iterationCount} failed iterations`,
			});

			return;
		}

		// Mark story as in_progress and increment iteration count
		await updateStoryStatus(prdName, story.id, "in_progress");

		// Update iteration count in the story
		const prdForIterationUpdate = await getPRD(prdName);
		const storyToUpdate = prdForIterationUpdate.stories.find((s) => s.id === story.id);
		if (storyToUpdate) {
			storyToUpdate.iterationCount = iterationCount;
			await savePRD(prdName, prdForIterationUpdate);
		}

		console.log(`Working on: ${story.id} - ${story.title} (iteration ${iterationCount})`);

		// Generate prompt
		const prompt = await generatePrompt(prd, story, prdName);

		// Run agent with streaming output
		console.log("Spawning agent...\n");
		const { output, exitCode } = await runAgent(prompt, agentConfig, { stream: true });

		// Log exit code (output already streamed)
		console.log(`\n--- Exit Code: ${exitCode} ---\n`);

		// Track iteration
		await updateMetrics(prdName, { iterations: 1 });

		// Try to parse token usage from Claude Code output
		const inputMatch = output.match(/Input:\s*([\d,]+)/i);
		const outputMatch = output.match(/Output:\s*([\d,]+)/i);
		if (inputMatch?.[1] || outputMatch?.[1]) {
			await updateMetrics(prdName, {
				inputTokens: inputMatch?.[1] ? Number.parseInt(inputMatch[1].replace(/,/g, ""), 10) : 0,
				outputTokens: outputMatch?.[1] ? Number.parseInt(outputMatch[1].replace(/,/g, ""), 10) : 0,
			});
		}

		// Check for completion signal
		if (output.includes("<promise>COMPLETE</promise>")) {
			console.log("Agent signaled completion!");

			// Check if ALL stories are actually completed
			const allComplete = await isPRDComplete(prdName);

			if (allComplete) {
				// Mark PRD as completed
				await markPRDCompleted(prdName);

				// Extract findings and move to testing
				console.log("Extracting findings...");
				await extractAndSaveFindings(prdName);

				console.log("Moving PRD to testing...");
				await movePRD(prdName, "testing");

				// Generate verification checklist
				console.log("Generating verification checklist...");
				try {
					const { generateVerification, generateSimpleVerification } = await import(
						"./verification.js"
					);
					try {
						await generateVerification(prdName, agentConfig, runAgent);
						console.log("Verification checklist generated with LLM.");
					} catch {
						console.log("LLM generation failed, using simple generator...");
						await generateSimpleVerification(prdName);
					}
				} catch (error) {
					console.log(`Warning: Could not generate verification checklist: ${error}`);
				}

				await updateLastRun(prdName, {
					timestamp: new Date().toISOString(),
					storyId: "ALL",
					reason: "completed",
					summary: "All stories completed. PRD moved to testing for verification.",
				});

				console.log("\nPRD moved to testing. Next steps:");
				console.log(`  omnidev ralph test ${prdName}              # run automated tests`);
				console.log(`  omnidev ralph complete ${prdName}          # if verified`);
				console.log(`  omnidev ralph prd ${prdName} --move pending # if issues found`);
			} else {
				// Agent signaled completion but there are still pending stories
				await updateLastRun(prdName, {
					timestamp: new Date().toISOString(),
					storyId: story.id,
					reason: "story_completed",
					summary: `Story ${story.id} completed, more stories pending`,
				});
			}

			return;
		}

		// Check if story was marked as completed or blocked
		const updatedPrd = await getPRD(prdName);
		const updatedStory = updatedPrd.stories.find((s) => s.id === story.id);

		if (updatedStory?.status === "completed") {
			console.log(`✓ Story ${story.id} completed`);

			// Reset iteration count on completion
			if (updatedStory.iterationCount && updatedStory.iterationCount > 0) {
				updatedStory.iterationCount = 0;
				await savePRD(prdName, updatedPrd);
			}

			await updateLastRun(prdName, {
				timestamp: new Date().toISOString(),
				storyId: story.id,
				reason: "story_completed",
				summary: `Story ${story.id} completed successfully`,
			});
		} else if (updatedStory?.status === "blocked") {
			console.log(`\n🚫 Story ${story.id} is blocked`);
			if (updatedStory.questions.length > 0) {
				console.log("\nQuestions to resolve:");
				for (let i = 0; i < updatedStory.questions.length; i++) {
					console.log(`  ${i + 1}. ${updatedStory.questions[i]}`);
				}
				console.log(
					`\nRun 'omnidev ralph start ${prdName}' again to be prompted to answer these questions.`,
				);
			}

			await updateLastRun(prdName, {
				timestamp: new Date().toISOString(),
				storyId: story.id,
				reason: "blocked",
				summary: `Blocked on ${story.id}: ${updatedStory.questions.join("; ")}`,
			});

			return;
		} else {
			// Story is still in_progress - try to infer status from agent output
			console.log(`⚠️  Story ${story.id} still in_progress (status not updated in PRD file)`);

			const inferredStatus = parseStatusFromOutput(output, story.id);

			if (inferredStatus === "completed") {
				console.log(`Inferred from output: story completed. Updating PRD...`);
				await updateStoryStatus(prdName, story.id, "completed");
				console.log(`✓ Story ${story.id} marked as completed`);
			} else if (inferredStatus === "blocked") {
				console.log(`Inferred from output: story blocked. Updating PRD...`);
				await updateStoryStatus(prdName, story.id, "blocked", [
					"Agent indicated this story is blocked. Please review the output above for details.",
				]);
				console.log(`🚫 Story ${story.id} marked as blocked`);
				return;
			} else {
				console.log(
					"Could not infer status from output. Story remains in_progress for next iteration.",
				);
				console.log(
					"Hint: Agent should explicitly update the prd.json file or indicate completion.",
				);
			}
		}
	}

	console.log(`\nReached max iterations (${maxIterations})`);
	console.log("Run 'omnidev ralph start' again to continue.");

	await updateLastRun(prdName, {
		timestamp: new Date().toISOString(),
		storyId: currentStory?.id ?? "unknown",
		reason: "user_interrupted",
		summary: `Reached max iterations while working on ${currentStory?.id}`,
	});
}
