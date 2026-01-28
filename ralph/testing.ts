/**
 * Ralph Testing Orchestration
 *
 * Handles test execution for PRDs with Playwriter integration and QA feedback loop.
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadRalphConfig, runAgent } from "./orchestrator.ts";
import {
	addFixStory,
	clearTestResults,
	extractAndSaveFindings,
	findPRDLocation,
	getTestResultsDir,
	getPRD,
	getProgress,
	getSpec,
	movePRD,
} from "./state.ts";
import type { RalphConfig, TestReport, TestResult } from "./types.d.ts";
import { getVerification, hasVerification } from "./verification.ts";

/**
 * Playwriter instructions for web testing
 */
function getPlaywriterInstructions(baseUrl: string): string {
	return `
## Web Testing with Playwriter MCP

You have access to the Playwriter MCP for browser automation. Use it to test web UI.

### Session Setup (REQUIRED FIRST STEP)

Before any web testing, create a session and your own page:

\`\`\`bash
# Create a new session (outputs session id, e.g., 1)
playwriter session new

# IMPORTANT: Create your own page to avoid interference from other agents
playwriter -s 1 -e "state.myPage = await context.newPage()"

# Navigate to the app
playwriter -s 1 -e "await state.myPage.goto('${baseUrl}')"
\`\`\`

### Checking Page State

After any action, verify what happened:

\`\`\`bash
# Get accessibility snapshot (shows interactive elements with aria-ref)
playwriter -s 1 -e "console.log(await accessibilitySnapshot({ page: state.myPage }))"

# Or take a screenshot with labels for visual verification
playwriter -s 1 -e "await screenshotWithAccessibilityLabels({ page: state.myPage })"
\`\`\`

### Interacting with Elements

Use aria-ref from the accessibility snapshot:

\`\`\`bash
# Click an element
playwriter -s 1 -e "await state.myPage.locator('aria-ref=e5').click()"

# Fill an input
playwriter -s 1 -e "await state.myPage.locator('aria-ref=e10').fill('test value')"

# Wait for navigation
playwriter -s 1 -e "await state.myPage.waitForLoadState('domcontentloaded')"
\`\`\`

### Taking Screenshots for Evidence

Save screenshots to the test-results folder:

\`\`\`bash
# Screenshot on success
playwriter -s 1 -e "await state.myPage.screenshot({ path: 'test-results/screenshots/success-001.png', scale: 'css' })"

# Screenshot on failure (ALWAYS do this when something fails)
playwriter -s 1 -e "await state.myPage.screenshot({ path: 'test-results/screenshots/issue-001.png', scale: 'css' })"
\`\`\`

### Network Interception (for API testing via browser)

\`\`\`bash
# Set up request interception
playwriter -s 1 -e "state.requests = []; state.myPage.on('response', r => { if (r.url().includes('/api/')) state.requests.push({ url: r.url(), status: r.status() }) })"

# Trigger action that makes API call
playwriter -s 1 -e "await state.myPage.locator('aria-ref=e5').click()"

# Check captured requests
playwriter -s 1 -e "console.log(JSON.stringify(state.requests, null, 2))"
\`\`\`

### Session Management

\`\`\`bash
# List sessions
playwriter session list

# Reset if connection issues
playwriter session reset 1
\`\`\`

### Important Notes

- ALWAYS use \`state.myPage\` instead of \`page\` to avoid conflicts
- Take screenshots of ANY issues you find
- Save API responses to test-results/api-responses/
- Clean up: \`playwriter -s 1 -e "await state.myPage.close()"\` when done
`;
}

/**
 * Generate the test prompt for the agent
 */
export async function generateTestPrompt(prdName: string, config: RalphConfig): Promise<string> {
	const prd = await getPRD(prdName);
	const status = findPRDLocation(prdName);

	// Load all context files
	let specContent = "";
	try {
		specContent = await getSpec(prdName);
	} catch {
		specContent = "(spec.md not found)";
	}

	let verificationContent = "";
	try {
		verificationContent = await getVerification(prdName);
	} catch {
		verificationContent =
			"(verification.md not found - generate it first with 'omnidev ralph verify')";
	}

	let progressContent = "";
	try {
		progressContent = await getProgress(prdName);
	} catch {
		progressContent = "(no progress log)";
	}

	// Get project verification instructions from config
	const projectInstructions =
		config.testing?.project_verification_instructions ||
		"Run project quality checks (lint, typecheck, tests) to ensure code quality.";

	// Web testing instructions
	const webTestingEnabled = config.testing?.web_testing_enabled ?? false;
	const baseUrl = config.testing?.web_testing_base_url || "http://localhost:3000";
	const playwriterSection = webTestingEnabled ? getPlaywriterInstructions(baseUrl) : "";

	// Format PRD JSON (truncated for prompt size)
	const prdJson = JSON.stringify(prd, null, 2);

	// Get test results directory path
	const testResultsDir = getTestResultsDir(prdName) || "test-results";

	return `# Testing Task: ${prd.name}

You are a QA testing agent. Your job is to verify that the feature implementation is correct and complete.

## CRITICAL: Test Result Signals

At the end of your testing, you MUST output one of these signals:

**If ALL tests pass:**
\`\`\`
<test-result>PRD_VERIFIED</test-result>
\`\`\`

**If ANY tests fail:**
\`\`\`
<test-result>PRD_FAILED</test-result>
<issues>
- Issue description 1
- Issue description 2
</issues>
\`\`\`

These signals determine what happens next:
- PRD_VERIFIED → PRD moves to completed automatically
- PRD_FAILED → Fix story created, PRD moves back to pending

## Project Verification Instructions

**IMPORTANT:** ${projectInstructions}

Run these checks FIRST before any other testing.

## Test Results Directory

Save all evidence to: \`${testResultsDir}/\`
- Screenshots: \`${testResultsDir}/screenshots/\`
- API responses: \`${testResultsDir}/api-responses/\`

${playwriterSection}

## API Testing

Test API endpoints directly with curl:

\`\`\`bash
# GET request
curl -s http://localhost:3000/api/endpoint | tee ${testResultsDir}/api-responses/endpoint-get.json

# POST request
curl -s -X POST -H "Content-Type: application/json" -d '{"key":"value"}' http://localhost:3000/api/endpoint | tee ${testResultsDir}/api-responses/endpoint-post.json
\`\`\`

## PRD (Product Requirements Document)

\`\`\`json
${prdJson.slice(0, 3000)}${prdJson.length > 3000 ? "\n...(truncated)" : ""}
\`\`\`

## Specification

\`\`\`markdown
${specContent.slice(0, 5000)}${specContent.length > 5000 ? "\n...(truncated)" : ""}
\`\`\`

## Verification Checklist

This is what you need to verify:

\`\`\`markdown
${verificationContent}
\`\`\`

## Progress Log (Implementation Details)

\`\`\`
${progressContent.slice(0, 5000)}${progressContent.length > 5000 ? "\n...(truncated)" : ""}
\`\`\`

## Testing Process

1. **Start a testing session in progress.txt**

   Append a new testing session entry to progress.txt:
   \`\`\`markdown
   ---

   ## [Testing Session] ${new Date().toISOString().split("T")[0]}

   **Checklist Progress:**
   (update as you go through items)

   **Issues Found:**
   (document any failures here)

   **API Tests:**
   (record API test results)

   ---
   \`\`\`

2. **Run project quality checks first**
   - Lint, typecheck, tests, formatting
   - Update progress.txt with results
   - If any fail, document and report PRD_FAILED

3. **Go through verification checklist**
   - Test each item systematically
   - **Update verification.md** - change \`[ ]\` to \`[x]\` for passing items
   - Take screenshots of failures
   - Save API responses
   - Update progress.txt as you go

4. **For web testing (if applicable)**
   - Create Playwriter session
   - Use state.myPage for isolation
   - Screenshot any visual issues

5. **Update verification.md with final results**
   - Mark all tested items: \`[x]\` for pass, \`[ ]\` for fail
   - Add notes next to failed items explaining why

6. **Document findings in progress.txt**
   - Complete the testing session entry
   - List all issues found with details

7. **Output final signal**
   - PRD_VERIFIED if everything passes
   - PRD_FAILED with issues list if anything fails

## Output Format

Create a detailed report, then output your signal:

\`\`\`markdown
# Test Report: ${prd.name}

## Project Quality Checks
- [x] Linting: PASS
- [x] Type checking: PASS
- [ ] Tests: FAIL - 2 tests failed in auth.test.ts

## Verification Results

### Passed
- [x] User can log in
- [x] Dashboard loads correctly

### Failed
- [ ] User profile shows wrong email - Screenshot: screenshots/issue-001.png

## Summary
- Total: 10
- Passed: 8
- Failed: 2
\`\`\`

Then:

\`\`\`
<test-result>PRD_FAILED</test-result>
<issues>
- Tests failing in auth.test.ts
- User profile shows wrong email
</issues>
\`\`\`

## File Paths

PRD files are located at:
- PRD: .omni/state/ralph/prds/${status}/${prdName}/prd.json
- Spec: .omni/state/ralph/prds/${status}/${prdName}/spec.md
- Progress: .omni/state/ralph/prds/${status}/${prdName}/progress.txt (append testing session here)
- Verification: .omni/state/ralph/prds/${status}/${prdName}/verification.md (update checkboxes here)
- Test Results: .omni/state/ralph/prds/${status}/${prdName}/test-results/

## Important

- **Always update progress.txt** with your testing session - this creates a history
- **Always update verification.md** to reflect actual test results - mark items [x] or [ ]
- The next developer (or fix story agent) will read these to understand what was tested

Begin testing now. Be thorough and always output your final signal.
`;
}

/**
 * Detect test result signal from agent output
 */
export function detectTestResult(output: string): "verified" | "failed" | null {
	if (output.includes("<test-result>PRD_VERIFIED</test-result>")) {
		return "verified";
	}
	if (output.includes("<test-result>PRD_FAILED</test-result>")) {
		return "failed";
	}
	return null;
}

/**
 * Extract issues from agent output
 */
export function extractIssues(output: string): string[] {
	const match = output.match(/<issues>([\s\S]*?)<\/issues>/);
	const issuesContent = match?.[1];
	if (!issuesContent) return [];

	return issuesContent
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.startsWith("-"))
		.map((line) => line.slice(1).trim())
		.filter((line) => line.length > 0);
}

/**
 * Parse test results from agent output
 */
export function parseTestReport(output: string, prdName: string): TestReport {
	const results: TestResult[] = [];
	let passed = 0;
	let failed = 0;

	// Try to extract the test-report section or use full output
	const reportMatch = output.match(/<test-report>([\s\S]*?)<\/test-report>/);
	const reportContent: string = reportMatch?.[1] ?? output;

	// Parse passed items
	const passedMatches = reportContent.matchAll(/- \[x\]\s*(.+?)(?:\n|$)/gi);
	for (const match of passedMatches) {
		const item = match[1]?.trim();
		if (item) {
			results.push({ item, passed: true });
			passed++;
		}
	}

	// Parse failed items
	const failedMatches = reportContent.matchAll(
		/- \[ \]\s*(.+?)(?:\s*-\s*\*\*Reason:\*\*\s*(.+?))?(?:\n|$)/gi,
	);
	for (const match of failedMatches) {
		const item = match[1]?.trim();
		const reason = match[2]?.trim();
		if (item && !item.toLowerCase().includes("skipped")) {
			results.push({ item, passed: false, reason });
			failed++;
		}
	}

	return {
		prdName,
		timestamp: new Date().toISOString(),
		testResults: results,
		summary: {
			total: passed + failed,
			passed,
			failed,
		},
		agentOutput: output,
	};
}

/**
 * Save test report to file
 */
export async function saveTestReport(prdName: string, report: TestReport): Promise<string> {
	const testResultsDir = getTestResultsDir(prdName);
	if (!testResultsDir) {
		throw new Error(`PRD not found: ${prdName}`);
	}

	const reportPath = join(testResultsDir, "report.md");

	// Format as markdown
	const lines: string[] = [];
	lines.push(`# Test Report: ${prdName}`);
	lines.push("");
	lines.push(`**Tested:** ${report.timestamp}`);
	lines.push("");
	lines.push("## Summary");
	lines.push("");
	lines.push(`- **Total:** ${report.summary.total}`);
	lines.push(`- **Passed:** ${report.summary.passed}`);
	lines.push(`- **Failed:** ${report.summary.failed}`);
	lines.push("");

	if (report.testResults.length > 0) {
		const passedResults = report.testResults.filter((r) => r.passed);
		const failedResults = report.testResults.filter((r) => !r.passed);

		if (passedResults.length > 0) {
			lines.push("## Passed");
			lines.push("");
			for (const result of passedResults) {
				lines.push(`- [x] ${result.item}`);
			}
			lines.push("");
		}

		if (failedResults.length > 0) {
			lines.push("## Failed");
			lines.push("");
			for (const result of failedResults) {
				if (result.reason) {
					lines.push(`- [ ] ${result.item} - **Reason:** ${result.reason}`);
				} else {
					lines.push(`- [ ] ${result.item}`);
				}
			}
			lines.push("");
		}
	}

	lines.push("---");
	lines.push("");
	lines.push("## Full Agent Output");
	lines.push("");
	lines.push("```");
	lines.push(report.agentOutput || "(no output)");
	lines.push("```");

	await writeFile(reportPath, lines.join("\n"));
	return reportPath;
}

/**
 * Run testing for a PRD with QA feedback loop
 */
export async function runTesting(
	prdName: string,
	agentOverride?: string,
): Promise<{ report: TestReport; result: "verified" | "failed" | "unknown" }> {
	const config = await loadRalphConfig();

	const agentName = agentOverride ?? config.default_agent;

	// Validate agent exists
	const agentConfig = config.agents[agentName];
	if (!agentConfig) {
		throw new Error(
			`Agent '${agentName}' not found in config. Available: ${Object.keys(config.agents).join(", ")}`,
		);
	}

	// Check PRD exists
	const status = findPRDLocation(prdName);
	if (!status) {
		throw new Error(`PRD not found: ${prdName}`);
	}

	// Warn if not in testing status
	if (status !== "testing") {
		console.log(`\n⚠️  PRD "${prdName}" is in ${status} status (not testing).`);
		console.log("Testing is typically done after all stories are complete.\n");
	}

	// Check for verification.md
	if (!hasVerification(prdName)) {
		console.log(`\n⚠️  No verification.md found for "${prdName}".`);
		console.log("Generating verification checklist first...\n");

		const { generateVerification, generateSimpleVerification } = await import("./verification.js");

		try {
			await generateVerification(prdName, agentConfig, runAgent);
			console.log("Verification checklist generated.\n");
		} catch {
			console.log("Failed to generate with LLM, using simple generator...\n");
			await generateSimpleVerification(prdName);
		}
	}

	// Clear previous test results
	console.log("Clearing previous test results...");
	await clearTestResults(prdName);

	console.log(`\nStarting testing for PRD: ${prdName}`);
	console.log(`Using agent: ${agentName}`);
	if (config.testing?.web_testing_enabled) {
		console.log(`Web testing: enabled (${config.testing.web_testing_base_url})`);
	}
	console.log("");

	// Generate test prompt
	const prompt = await generateTestPrompt(prdName, config);

	// Run agent
	console.log("Spawning test agent...\n");
	const { output, exitCode } = await runAgent(prompt, agentConfig);

	// Log output
	console.log("\n--- Agent Output ---");
	console.log(output);
	console.log(`--- Exit Code: ${exitCode} ---\n`);

	// Parse results
	const report = parseTestReport(output, prdName);

	// Detect test result signal
	const testResult = detectTestResult(output);
	const issues = extractIssues(output);

	// Save report
	console.log("Saving test report...");
	const reportPath = await saveTestReport(prdName, report);

	// Handle result
	if (testResult === "verified") {
		console.log("\n✅ PRD_VERIFIED signal detected!");
		console.log("All tests passed. Moving PRD to completed...\n");

		// Extract findings
		console.log("Extracting findings...");
		await extractAndSaveFindings(prdName);

		// Move to completed
		await movePRD(prdName, "completed");

		console.log(`\n🎉 PRD "${prdName}" has been completed!`);
		console.log(`Findings saved to .omni/state/ralph/findings.md`);
		console.log(`Test report: ${reportPath}`);

		return { report, result: "verified" };
	}

	if (testResult === "failed") {
		console.log("\n❌ PRD_FAILED signal detected!");
		console.log(`Issues found: ${issues.length}`);

		for (const issue of issues) {
			console.log(`  - ${issue}`);
		}

		// Create fix story
		console.log("\nCreating fix story...");
		const testResultsRelPath = `test-results/report.md`;
		const fixStoryId = await addFixStory(prdName, issues, testResultsRelPath);

		// Move back to pending
		console.log("Moving PRD back to pending...");
		await movePRD(prdName, "pending");

		console.log(`\n📋 Fix story created: ${fixStoryId}`);
		console.log(`PRD "${prdName}" moved back to pending.`);
		console.log(
			`\nTo view issues: cat .omni/state/ralph/prds/pending/${prdName}/test-results/report.md`,
		);
		console.log(`To fix issues: omnidev ralph start ${prdName}`);

		return { report, result: "failed" };
	}

	// No clear signal detected
	console.log("\n⚠️  No clear test result signal detected.");
	console.log(
		"Agent should output <test-result>PRD_VERIFIED</test-result> or <test-result>PRD_FAILED</test-result>",
	);
	console.log(`\nTest report saved to: ${reportPath}`);
	console.log("\nManual action required:");
	console.log(`  omnidev ralph complete ${prdName}    # if tests passed`);
	console.log(`  omnidev ralph prd ${prdName} --move pending  # if issues found`);

	return { report, result: "unknown" };
}
