/**
 * Ralph Orchestrator
 *
 * Handles agent spawning and iteration loops for PRD-driven development.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { generatePrompt } from "./prompt.ts";
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
} from "./state.ts";
import type { AgentConfig, RalphConfig, Story } from "./types.d.ts";

const RALPH_DIR = ".omni/state/ralph";
const CONFIG_PATH = join(RALPH_DIR, "config.toml");

// Track current state for Ctrl+C handler
let currentPrdName: string | null = null;
let currentStory: Story | null = null;
let isShuttingDown = false;

/**
 * Loads Ralph configuration from .omni/ralph/config.toml
 */
export async function loadRalphConfig(): Promise<RalphConfig> {
	if (!existsSync(CONFIG_PATH)) {
		throw new Error("Ralph config not found. Run 'omnidev sync' first.");
	}

	const content = await readFile(CONFIG_PATH, "utf-8");

	// Parse TOML manually (simple parser for our needs)
	const lines = content.split("\n");
	const config: Partial<RalphConfig> = {
		agents: {},
		testing: {},
	};

	let currentSection: string | null = null;
	let currentAgent: string | null = null;

	for (const line of lines) {
		const trimmed = line.trim();

		// Skip empty lines and comments
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
				} else if (section === "testing") {
					currentSection = "testing";
					currentAgent = null;
				} else if (section?.startsWith("agents.")) {
					currentSection = "agents";
					currentAgent = section.slice("agents.".length);
					if (!config.agents) {
						config.agents = {};
					}
					config.agents[currentAgent] = { command: "", args: [] };
				}
			}
			continue;
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
			} else if (currentSection === "testing") {
				if (!config.testing) {
					config.testing = {};
				}
				if (key === "project_verification_instructions") {
					config.testing.project_verification_instructions = value.replace(/["']/g, "");
				} else if (key === "test_iterations") {
					config.testing.test_iterations = Number.parseInt(value, 10);
				} else if (key === "web_testing_enabled") {
					config.testing.web_testing_enabled = value.replace(/["']/g, "") === "true";
				} else if (key === "web_testing_base_url") {
					config.testing.web_testing_base_url = value.replace(/["']/g, "");
				}
			} else if (currentSection === "agents" && currentAgent) {
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
		throw new Error("Invalid Ralph config: missing required fields");
	}

	return config as RalphConfig;
}

/**
 * Spawns an agent process with the given prompt.
 */
export async function runAgent(
	prompt: string,
	agentConfig: AgentConfig,
): Promise<{ output: string; exitCode: number }> {
	return new Promise((resolve, reject) => {
		const proc = spawn(agentConfig.command, agentConfig.args, {
			stdio: ["pipe", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";

		proc.stdout?.on("data", (data) => {
			stdout += data.toString();
		});

		proc.stderr?.on("data", (data) => {
			stderr += data.toString();
		});

		proc.on("error", (error) => {
			reject(error);
		});

		proc.on("close", (code) => {
			resolve({ output: stdout + stderr, exitCode: code ?? 1 });
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

		// Run agent
		console.log("Spawning agent...");
		const { output, exitCode } = await runAgent(prompt, agentConfig);

		// Log output
		console.log("\n--- Agent Output ---");
		console.log(output);
		console.log(`--- Exit Code: ${exitCode} ---\n`);

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
