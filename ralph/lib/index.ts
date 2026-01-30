/**
 * Ralph Library - Core functionality for PRD-driven development
 *
 * This module exports all the core functionality used by both the CLI and the daemon.
 * It provides a clean API for:
 * - State management (PRDs, stories, progress)
 * - Orchestration (running agents, iteration loops)
 * - Testing (QA automation, verification)
 * - Configuration loading
 */

// Types
export type {
	AgentConfig,
	DependencyInfo,
	LastRun,
	PRD,
	PRDMetrics,
	PRDStatus,
	PRDSummary,
	RalphConfig,
	ScriptsConfig,
	Story,
	StoryStatus,
	TestingConfig,
	TestIssue,
	TestReport,
	TestResult,
} from "./types.js";

// State management
export {
	addFixStory,
	appendProgress,
	appendToFindings,
	buildDependencyGraph,
	canStartPRD,
	clearTestResults,
	ensureDirectories,
	extractAndSaveFindings,
	extractFindings,
	findPRDLocation,
	getNextFixStoryId,
	getNextStory,
	getPRD,
	getPRDSummaries,
	getProgress,
	getSpec,
	getTestResultsDir,
	getUnmetDependencies,
	hasBlockedStories,
	isPRDComplete,
	isPRDCompleteOrArchived,
	listPRDs,
	listPRDsByStatus,
	markPRDCompleted,
	markPRDStarted,
	migrateToStatusFolders,
	movePRD,
	needsMigration,
	savePRD,
	unblockStory,
	updateLastRun,
	updateMetrics,
	updatePRD,
	updateStoryStatus,
} from "./state.js";

// Orchestration
export {
	loadRalphConfig,
	runAgent,
	runOrchestration,
	type RunAgentOptions,
} from "./orchestrator.js";

// Prompt generation
export { generateFindingsExtractionPrompt, generatePrompt } from "./prompt.js";

// Verification
export {
	generateSimpleVerification,
	generateVerification,
	generateVerificationPrompt,
	getVerification,
	getVerificationPath,
	hasVerification,
	saveVerification,
} from "./verification.js";

// Testing
export {
	detectTestResult,
	extractIssues,
	generateTestPrompt,
	parseTestReport,
	runTesting,
	saveTestReport,
} from "./testing.js";
