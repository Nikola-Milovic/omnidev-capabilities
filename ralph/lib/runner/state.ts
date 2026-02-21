/**
 * Runner State Persistence
 *
 * Manages runner.json — the ephemeral session metadata file that tracks
 * which PRDs are running in which worktrees/panes.
 *
 * This file is NOT committed to git (it's session-specific).
 * It lives in .omni/state/ralph/runner.json in the main worktree.
 */

import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile, rename } from "node:fs/promises";
import { join, dirname } from "node:path";
import { type Result, ok, err } from "../results.js";
import type {
	RunnerState,
	RunInstance,
	RunStatus,
	PersistedRunInstance,
	SessionBackend,
} from "./types.js";

const RALPH_DIR = ".omni/state/ralph";
const RUNNER_STATE_FILE = "runner.json";

/**
 * Get the path to runner.json
 */
function getStatePath(cwd: string): string {
	return join(cwd, RALPH_DIR, RUNNER_STATE_FILE);
}

/**
 * Load runner state from disk
 */
export async function loadRunnerState(cwd: string): Promise<Result<RunnerState>> {
	const statePath = getStatePath(cwd);

	if (!existsSync(statePath)) {
		return ok({ session: "", runs: {} });
	}

	try {
		const content = await readFile(statePath, "utf-8");
		const state = JSON.parse(content) as RunnerState;
		return ok(state);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return err("STATE_READ_FAILED", `Failed to read runner state: ${msg}`);
	}
}

/**
 * Save runner state to disk (atomic write via rename)
 */
export async function saveRunnerState(cwd: string, state: RunnerState): Promise<Result<void>> {
	const statePath = getStatePath(cwd);
	const tmpPath = `${statePath}.tmp`;

	try {
		const dir = dirname(statePath);
		mkdirSync(dir, { recursive: true });

		await writeFile(tmpPath, JSON.stringify(state, null, 2));
		await rename(tmpPath, statePath);
		return ok(undefined);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return err("STATE_WRITE_FAILED", `Failed to save runner state: ${msg}`);
	}
}

/**
 * Add or update a run instance in state
 */
export async function upsertRun(
	cwd: string,
	sessionName: string,
	instance: RunInstance,
): Promise<Result<void>> {
	const stateResult = await loadRunnerState(cwd);
	if (!stateResult.ok) return err(stateResult.error!.code, stateResult.error!.message);

	const state = stateResult.data!;
	state.session = sessionName;
	state.runs[instance.prdName] = {
		worktree: instance.worktree,
		branch: instance.branch,
		paneId: instance.paneId,
		startedAt: instance.startedAt,
		status: instance.status,
		windowId: instance.windowId,
	};

	return saveRunnerState(cwd, state);
}

/**
 * Update the status of a run instance
 */
export async function updateRunStatus(
	cwd: string,
	prdName: string,
	status: RunStatus,
): Promise<Result<void>> {
	const stateResult = await loadRunnerState(cwd);
	if (!stateResult.ok) return err(stateResult.error!.code, stateResult.error!.message);

	const state = stateResult.data!;
	const run = state.runs[prdName];
	if (!run) return err("NOT_RUNNING", `No run found for PRD: ${prdName}`);

	run.status = status;
	return saveRunnerState(cwd, state);
}

/**
 * Remove a run instance from state
 */
export async function removeRun(cwd: string, prdName: string): Promise<Result<void>> {
	const stateResult = await loadRunnerState(cwd);
	if (!stateResult.ok) return err(stateResult.error!.code, stateResult.error!.message);

	const state = stateResult.data!;
	delete state.runs[prdName];
	return saveRunnerState(cwd, state);
}

/**
 * Get a single run instance from state
 */
export async function getRun(cwd: string, prdName: string): Promise<Result<RunInstance | null>> {
	const stateResult = await loadRunnerState(cwd);
	if (!stateResult.ok) return err(stateResult.error!.code, stateResult.error!.message);

	const state = stateResult.data!;
	const persisted = state.runs[prdName];
	if (!persisted) return ok(null);

	return ok(toRunInstance(prdName, persisted));
}

/**
 * Get all run instances from state
 */
export async function getAllRuns(cwd: string): Promise<Result<RunInstance[]>> {
	const stateResult = await loadRunnerState(cwd);
	if (!stateResult.ok) return err(stateResult.error!.code, stateResult.error!.message);

	const state = stateResult.data!;
	const instances = Object.entries(state.runs).map(([name, persisted]) =>
		toRunInstance(name, persisted),
	);

	return ok(instances);
}

/**
 * Reconcile persisted state with live session backend state.
 *
 * Marks instances as "stale" if their pane is dead. Returns reconciled list.
 */
export async function reconcile(
	cwd: string,
	session: SessionBackend,
): Promise<Result<RunInstance[]>> {
	const stateResult = await loadRunnerState(cwd);
	if (!stateResult.ok) return err(stateResult.error!.code, stateResult.error!.message);

	const state = stateResult.data!;
	const instances: RunInstance[] = [];
	let dirty = false;

	for (const [name, persisted] of Object.entries(state.runs)) {
		const instance = toRunInstance(name, persisted);

		// Check if the pane is still alive
		if (persisted.status === "running") {
			const aliveResult = await session.isPaneAlive(persisted.paneId);
			if (aliveResult.ok && !aliveResult.data) {
				instance.status = "stale";
				persisted.status = "stale";
				dirty = true;
			}
		}

		instances.push(instance);
	}

	// Persist changes if any instances were marked stale
	if (dirty) {
		await saveRunnerState(cwd, state);
	}

	return ok(instances);
}

/**
 * Convert persisted run data to a full RunInstance
 */
function toRunInstance(prdName: string, persisted: PersistedRunInstance): RunInstance {
	return {
		prdName,
		worktree: persisted.worktree,
		branch: persisted.branch,
		paneId: persisted.paneId,
		startedAt: persisted.startedAt,
		status: persisted.status,
		windowId: persisted.windowId,
	};
}
