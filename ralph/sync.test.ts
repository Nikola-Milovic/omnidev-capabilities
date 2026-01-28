import assert from "node:assert";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, it } from "node:test";
import { sync } from "./sync.ts";

const testDir = "test-ralph-sync";

beforeEach(() => {
	// Create test directory
	mkdirSync(testDir, { recursive: true });
	// Change to test directory
	process.chdir(testDir);
});

afterEach(() => {
	// Change back to original directory
	process.chdir("..");
	// Clean up test directory
	if (existsSync(testDir)) {
		rmSync(testDir, { recursive: true, force: true });
	}
});

it("creates .omni/state/ralph directory structure", async () => {
	await sync();

	assert.strictEqual(existsSync(".omni/state/ralph"), true);
	assert.strictEqual(existsSync(".omni/state/ralph/prds"), true);
	assert.strictEqual(existsSync(".omni/state/ralph/prds/pending"), true);
	assert.strictEqual(existsSync(".omni/state/ralph/prds/testing"), true);
	assert.strictEqual(existsSync(".omni/state/ralph/prds/completed"), true);
});

it("is idempotent - safe to run multiple times", async () => {
	await sync();
	await sync();
	await sync();

	assert.strictEqual(existsSync(".omni/state/ralph"), true);
	assert.strictEqual(existsSync(".omni/state/ralph/prds"), true);
	assert.strictEqual(existsSync(".omni/state/ralph/prds/pending"), true);
	assert.strictEqual(existsSync(".omni/state/ralph/prds/testing"), true);
	assert.strictEqual(existsSync(".omni/state/ralph/prds/completed"), true);
});

it("handles existing directory structure gracefully", async () => {
	mkdirSync(".omni/state/ralph/prds/pending", { recursive: true });
	mkdirSync(".omni/state/ralph/prds/testing", { recursive: true });
	mkdirSync(".omni/state/ralph/prds/completed", { recursive: true });

	await sync();

	assert.strictEqual(existsSync(".omni/state/ralph"), true);
	assert.strictEqual(existsSync(".omni/state/ralph/prds/pending"), true);
});

it("preserves existing PRDs and files", async () => {
	mkdirSync(".omni/state/ralph/prds/pending/my-prd", { recursive: true });
	await writeFile(".omni/state/ralph/prds/pending/my-prd/prd.json", '{"name":"my-prd"}');

	await sync();

	assert.strictEqual(existsSync(".omni/state/ralph/prds/pending/my-prd/prd.json"), true);
	const content = await readFile(".omni/state/ralph/prds/pending/my-prd/prd.json", "utf-8");
	assert.strictEqual(content, '{"name":"my-prd"}');
});
