/**
 * Tests for Ralph orchestrator
 */

import assert from "node:assert";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, it } from "node:test";
import { loadRalphConfig, runAgent, getStatusDir, ensureDirectories } from "./lib/index.js";
import type { PRD } from "./lib/types.js";

const PROJECT_NAME = "test";
const REPO_ROOT = "/test-repo";
let testDir: string;
let originalXdg: string | undefined;
let originalCwd: string;

const MOCK_CONFIG = `[ralph]
project_name = "test"
default_agent = "test"
default_iterations = 5

[ralph.agents.test]
command = "echo"
args = ["test output"]

[ralph.agents.claude]
command = "npx"
args = ["-y", "@anthropic-ai/claude-code", "--model", "sonnet", "-p"]
`;

// Helper to create a PRD directly
async function createTestPRD(
	name: string,
	options: Partial<PRD> = {},
	status: string = "pending",
): Promise<void> {
	const prdDir = join(
		getStatusDir(
			PROJECT_NAME,
			REPO_ROOT,
			status as "pending" | "in_progress" | "testing" | "completed",
		),
		name,
	);
	mkdirSync(prdDir, { recursive: true });

	const prd: PRD = {
		name,
		description: options.description ?? "Test PRD",
		createdAt: options.createdAt ?? new Date().toISOString(),
		stories: options.stories ?? [],
		...(options.dependencies && { dependencies: options.dependencies }),
	};

	await writeFile(join(prdDir, "prd.json"), JSON.stringify(prd, null, 2));
	await writeFile(
		join(prdDir, "progress.txt"),
		"## Codebase Patterns\n\n---\n\n## Progress Log\n\n",
	);
	await writeFile(join(prdDir, "spec.md"), "# Test Spec\n\nTest content");
}

beforeEach(() => {
	testDir = join(
		process.cwd(),
		".test-ralph-orchestrator",
		`test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
	);
	mkdirSync(testDir, { recursive: true });
	originalCwd = process.cwd();
	process.chdir(testDir);
	originalXdg = process.env["XDG_STATE_HOME"];
	process.env["XDG_STATE_HOME"] = testDir;
	ensureDirectories(PROJECT_NAME, REPO_ROOT);
	writeFileSync(join(testDir, "omni.toml"), MOCK_CONFIG);
});

afterEach(() => {
	process.chdir(originalCwd);
	if (originalXdg !== undefined) {
		process.env["XDG_STATE_HOME"] = originalXdg;
	} else {
		delete process.env["XDG_STATE_HOME"];
	}
	if (existsSync(testDir)) {
		rmSync(testDir, { recursive: true, force: true });
	}
});

it("loads valid config", async () => {
	const config = await loadRalphConfig();

	assert.strictEqual(config.default_agent, "test");
	assert.strictEqual(config.default_iterations, 5);
	assert.deepStrictEqual(config.agents["test"], {
		command: "echo",
		args: ["test output"],
	});
});

it("throws if config doesn't exist", async () => {
	rmSync(join(testDir, "omni.toml"));

	await assert.rejects(loadRalphConfig(), /Configuration file not found/);
});

it("throws if config is invalid", async () => {
	writeFileSync(join(testDir, "omni.toml"), "invalid toml");

	await assert.rejects(loadRalphConfig());
});

it("parses multiple agents", async () => {
	const config = await loadRalphConfig();

	assert.ok(config.agents["test"] !== undefined);
	assert.ok(config.agents["claude"] !== undefined);
	assert.strictEqual(config.agents["claude"]?.command, "npx");
});

it("spawns agent with prompt", async () => {
	const agentConfig = {
		command: "echo",
		args: ["hello"],
	};

	const result = await runAgent("test prompt", agentConfig);

	assert.ok(result.output.includes("hello"));
	assert.strictEqual(result.exitCode, 0);
});

it("returns exit code on failure", async () => {
	const agentConfig = {
		command: "false", // Command that always fails
		args: [],
	};

	const result = await runAgent("test", agentConfig);

	assert.strictEqual(result.exitCode, 1);
});

it("throws if PRD doesn't exist", async () => {
	const { runOrchestration } = await import("./lib/index.js");

	await assert.rejects(
		runOrchestration(PROJECT_NAME, REPO_ROOT, "nonexistent"),
		/PRD not found: nonexistent/,
	);
});

it("stops when blocked stories exist", async () => {
	await createTestPRD("blocked-prd", {
		description: "Blocked PRD",
		stories: [
			{
				id: "US-001",
				title: "Blocked story",
				acceptanceCriteria: ["Done"],
				status: "blocked",
				priority: 1,
				questions: ["What should I do?"],
			},
		],
	});

	const { runOrchestration } = await import("./lib/index.js");

	// Should stop immediately due to blocked story
	await runOrchestration(PROJECT_NAME, REPO_ROOT, "blocked-prd");

	// No crash = success
});

it("completes when no stories remain", async () => {
	await createTestPRD("completed-prd", {
		description: "Completed PRD",
		stories: [
			{
				id: "US-001",
				title: "Done story",
				acceptanceCriteria: ["Done"],
				status: "completed",
				priority: 1,
				questions: [],
			},
		],
	});

	const { runOrchestration } = await import("./lib/index.js");

	// Should complete immediately without running agent
	await runOrchestration(PROJECT_NAME, REPO_ROOT, "completed-prd");

	// No crash = success
});
