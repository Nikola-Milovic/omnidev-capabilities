/**
 * Ralph Sync Hook
 *
 * Called by `omnidev agents sync` to set up Ralph directory structure.
 */

import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const RALPH_DIR = ".omni/state/ralph";
const PRDS_DIR = join(RALPH_DIR, "prds");
const COMPLETED_PRDS_DIR = join(RALPH_DIR, "completed-prds");
const CONFIG_PATH = join(RALPH_DIR, "config.toml");

const DEFAULT_CONFIG = `[ralph]
default_agent = "claude"
default_iterations = 10

[testing]
# Instructions for project verification (shown to test agent)
project_verification_instructions = "Run pnpm lint, pnpm typecheck, and pnpm test. All must pass without errors."
# Max iterations for test agent (default: 5)
test_iterations = 5
# Enable web testing with Playwriter MCP
web_testing_enabled = false
# Base URL for web testing
web_testing_base_url = "http://localhost:3000"

[agents.claude]
command = "npx"
args = ["-y", "@anthropic-ai/claude-code", "--model", "sonnet", "--dangerously-skip-permissions", "-p"]

[agents.codex]
command = "npx"
args = ["-y", "@openai/codex", "exec", "-c", "shell_environment_policy.inherit=all", "--dangerously-bypass-approvals-and-sandbox", "-"]

[agents.amp]
command = "amp"
args = ["--dangerously-allow-all"]
`;

/**
 * Sync hook called by omnidev agents sync.
 * Creates directory structure, default config, and updates .gitignore.
 */
export async function sync(): Promise<void> {
	// Create directory structure
	mkdirSync(RALPH_DIR, { recursive: true });
	mkdirSync(PRDS_DIR, { recursive: true });
	mkdirSync(COMPLETED_PRDS_DIR, { recursive: true });

	// Create status subdirectories (new structure)
	mkdirSync(join(PRDS_DIR, "pending"), { recursive: true });
	mkdirSync(join(PRDS_DIR, "testing"), { recursive: true });
	mkdirSync(join(PRDS_DIR, "completed"), { recursive: true });

	// Create default config if not exists
	if (!existsSync(CONFIG_PATH)) {
		await writeFile(CONFIG_PATH, DEFAULT_CONFIG);
	}
}
