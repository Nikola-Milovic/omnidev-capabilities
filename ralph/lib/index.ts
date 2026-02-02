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
	DocsConfig,
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

// Schemas (Zod validation)
export {
	StoryStatusSchema,
	PRDStatusSchema,
	StorySchema,
	LastRunSchema,
	PRDMetricsSchema,
	PRDSchema,
	AgentConfigSchema,
	TestingConfigSchema,
	ScriptsConfigSchema,
	DocsConfigSchema,
	RalphConfigSchema,
	TestResultSchema,
	TestReportSchema,
	TestIssueSchema,
	DependencyInfoSchema,
	PRDSummarySchema,
	validatePRD,
	validateStory,
	validateRalphConfig,
	type StoryStatusZ,
	type PRDStatusZ,
	type StoryZ,
	type LastRunZ,
	type PRDMetricsZ,
	type PRDZ,
	type AgentConfigZ,
	type TestingConfigZ,
	type ScriptsConfigZ,
	type DocsConfigZ,
	type RalphConfigZ,
	type TestResultZ,
	type TestReportZ,
	type TestIssueZ,
	type DependencyInfoZ,
	type PRDSummaryZ,
} from "./schemas.js";

// Core - State Machine
export {
	PRDStateMachine,
	StoryStateMachine,
	DisplayStateMachine,
	type DisplayState,
} from "./core/state-machine.js";

// Core - PRD Store
export {
	PRDStore,
	getDefaultStore,
	createStore,
} from "./core/prd-store.js";

// Core - Config (Result-based API)
export {
	loadConfig,
	getAgentConfig,
	hasAgent,
	getTestingConfig,
	getScriptsConfig,
} from "./core/config.js";

// Core - Logger
export {
	type LogLevel,
	type LogContext,
	type LogEntry,
	type LogOutput,
	ConsoleOutput,
	FileOutput,
	EventOutput,
	MemoryOutput,
	Logger,
	getLogger,
	configureLogger,
	createLogger,
} from "./core/logger.js";

// Orchestration - Agent Runner
export {
	type RunOptions as AgentRunOptions,
	type AgentResult,
	AgentRunner,
	getAgentRunner,
	createAgentRunner,
} from "./orchestration/agent-runner.js";

// Orchestration - Engine
export {
	type EngineContext,
	type EngineEvent,
	type RunOptions as EngineRunOptions,
	type DevelopmentResult,
	type TestRunResult,
	OrchestrationEngine,
	getEngine,
	createEngine,
} from "./orchestration/engine.js";

// Legacy State management (for backward compatibility)
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

// Legacy Orchestration (for backward compatibility)
// loadRalphConfig throws on error (legacy behavior)
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

// Event-based API (for daemon integration)
export {
	createOrchestrator,
	Orchestrator,
	type OrchestratorEvent,
	type OrchestratorOptions,
} from "./events.js";

// High-level API (structured results for CLI and daemon)
export {
	getPRDState,
	startDevelopment,
	runTests,
	getActions,
	canTransition,
	type RunOptions,
} from "./api.js";

// Documentation
export {
	DOCUMENTATION_PRINCIPLES,
	DOCUMENTATION_OUTPUT_FORMAT,
	findDocFiles,
	generateDocumentationUpdatePrompt,
	parseDocumentationUpdates,
	applyDocumentationUpdates,
	updateDocumentation,
	type DocFile,
	type DocumentationContext,
} from "./documentation.js";

// Result types
export {
	type Result,
	type StartResult,
	type TestResult as TestingResult,
	type StateResult,
	type TransitionResult,
	type PRDDisplayState,
	type ErrorCode,
	ok,
	err,
	ErrorCodes,
	computeDisplayState,
	isValidTransition,
	getAvailableActions,
} from "./results.js";
