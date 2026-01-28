/**
 * Ralph Sync Hook
 *
 * Called by `omnidev agents sync` to set up Ralph directory structure.
 */

import { existsSync, mkdirSync, chmodSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const RALPH_DIR = ".omni/state/ralph";
const PRDS_DIR = join(RALPH_DIR, "prds");
const COMPLETED_PRDS_DIR = join(RALPH_DIR, "completed-prds");
const SCRIPTS_DIR = join(RALPH_DIR, "scripts");
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
# Health check timeout in seconds (default: 120)
health_check_timeout = 120

# Free-form instructions for testing - URLs, credentials, context, etc.
# instructions = """
# URLs:
# - App: http://localhost:3000
# - Admin: http://localhost:3000/admin
# - API: http://localhost:3000/api
#
# Test Users:
# - Admin: admin@test.com / testpass123
# - User: user@test.com / testpass123
#
# Database is seeded with test data.
# """

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

const SETUP_SCRIPT = `#!/bin/bash
# Setup script - runs before testing
# Add commands to reset database, seed data, etc.

# Example:
# pnpm db:reset
# pnpm db:seed

echo "Setup complete"
`;

const START_SCRIPT = `#!/bin/bash
# Start script - starts the dev server in background
# Customize this for your project

# Example for Next.js/Node:
# pnpm dev > /tmp/ralph-dev-server.log 2>&1 &
# echo $! > /tmp/ralph-dev-server.pid

echo "Start script not configured - edit scripts/start.sh"
exit 1
`;

const HEALTH_CHECK_SCRIPT = `#!/bin/bash
# Health check script - verifies the project is ready for testing
# Exit 0 when ready, non-zero otherwise

# Example:
# curl -sf http://localhost:3000/api/health > /dev/null

echo "Health check not configured - edit scripts/health-check.sh"
exit 1
`;

const TEARDOWN_SCRIPT = `#!/bin/bash
# Teardown script - cleanup after testing
# Add commands to stop servers, clean up, etc.

# Example:
# if [ -f /tmp/ralph-dev-server.pid ]; then
#   kill $(cat /tmp/ralph-dev-server.pid) 2>/dev/null
#   rm /tmp/ralph-dev-server.pid
# fi

echo "Teardown complete"
`;

/**
 * Sync hook called by omnidev agents sync.
 * Creates directory structure, default config, and template scripts.
 */
export async function sync(): Promise<void> {
	// Create directory structure
	mkdirSync(RALPH_DIR, { recursive: true });
	mkdirSync(PRDS_DIR, { recursive: true });
	mkdirSync(COMPLETED_PRDS_DIR, { recursive: true });
	mkdirSync(SCRIPTS_DIR, { recursive: true });

	// Create status subdirectories (new structure)
	mkdirSync(join(PRDS_DIR, "pending"), { recursive: true });
	mkdirSync(join(PRDS_DIR, "testing"), { recursive: true });
	mkdirSync(join(PRDS_DIR, "completed"), { recursive: true });

	// Create default config if not exists
	if (!existsSync(CONFIG_PATH)) {
		await writeFile(CONFIG_PATH, DEFAULT_CONFIG);
	}

	// Create template scripts if they don't exist (don't overwrite)
	const scripts = [
		{ name: "setup.sh", content: SETUP_SCRIPT },
		{ name: "start.sh", content: START_SCRIPT },
		{ name: "health-check.sh", content: HEALTH_CHECK_SCRIPT },
		{ name: "teardown.sh", content: TEARDOWN_SCRIPT },
	];

	for (const script of scripts) {
		const scriptPath = join(SCRIPTS_DIR, script.name);
		if (!existsSync(scriptPath)) {
			await writeFile(scriptPath, script.content);
			// Make executable
			chmodSync(scriptPath, 0o755);
		}
	}
}
