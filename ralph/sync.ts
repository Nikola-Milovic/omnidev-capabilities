/**
 * Ralph Sync Hook
 *
 * Called by `omnidev agents sync` to set up Ralph state directory structure.
 * State is stored at $XDG_STATE_HOME/omnidev/ralph/<project-key>/.
 */

import { execSync } from "node:child_process";
import { loadConfig } from "./lib/core/config.js";
import { ensureStateDirs } from "./lib/core/paths.js";

/**
 * Sync hook called by omnidev agents sync.
 * Creates directory structure for PRDs at XDG state location.
 *
 * Configuration is stored in omni.toml under [ralph] section.
 * Scripts are configured via [ralph.scripts] with user-defined paths.
 */
export async function sync(): Promise<void> {
	const configResult = await loadConfig();
	if (!configResult.ok) {
		// Config not yet set up — nothing to sync
		return;
	}

	const config = configResult.data!;
	let repoRoot: string;
	try {
		repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim();
	} catch {
		// Not in a git repo — nothing to sync
		return;
	}

	ensureStateDirs(config.project_name, repoRoot);
}
