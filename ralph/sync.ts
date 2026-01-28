/**
 * Ralph Sync Hook
 *
 * Called by `omnidev agents sync` to set up Ralph directory structure.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";

const RALPH_DIR = ".omni/state/ralph";
const PRDS_DIR = join(RALPH_DIR, "prds");

/**
 * Sync hook called by omnidev agents sync.
 * Creates directory structure for PRDs.
 *
 * Configuration is now stored in omni.toml under [ralph] section.
 * Scripts are configured via [ralph.scripts] with user-defined paths.
 */
export async function sync(): Promise<void> {
	// Create directory structure
	mkdirSync(RALPH_DIR, { recursive: true });
	mkdirSync(join(PRDS_DIR, "pending"), { recursive: true });
	mkdirSync(join(PRDS_DIR, "testing"), { recursive: true });
	mkdirSync(join(PRDS_DIR, "completed"), { recursive: true });
}
