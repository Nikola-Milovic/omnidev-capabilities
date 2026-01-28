# Ralph - PRD-Driven Development Orchestrator

Ralph automates feature development by breaking PRDs (Product Requirements Documents) into stories and orchestrating AI agents to implement them iteratively. It includes a full QA feedback loop with automated testing.

## Getting Started

Ralph is a capability for [OmniDev](https://github.com/frmlabz/omnidev). Install OmniDev first, then run:

```bash
omnidev init
omnidev add cap --github frmlabz/omnidev-capabilities --path ralph
omnidev sync
```

This creates the Ralph directory structure at `.omni/state/ralph/`.

## Commands

```bash
# List all PRDs with status
omnidev ralph list

# Show detailed status of a PRD
omnidev ralph status <prd-name>

# Start working on a PRD (runs AI agent iterations)
omnidev ralph start <prd-name>

# Run automated tests for a PRD
omnidev ralph test <prd-name>

# View progress log
omnidev ralph progress <prd-name>

# View spec file
omnidev ralph spec <prd-name>

# Complete a PRD manually (extract findings, move to completed)
omnidev ralph complete <prd-name>

# Move PRD between states manually
omnidev ralph prd <prd-name> --move <status>
```

## PRD Lifecycle

PRDs move through three states:

```
┌──────────┐    ┌──────────┐    ┌───────────┐
│ PENDING  │───▶│ TESTING  │───▶│ COMPLETED │
│          │    │          │    │           │
└──────────┘    └──────────┘    └───────────┘
     ▲               │
     │               │ PRD_FAILED
     │               ▼
     │         ┌──────────┐
     └─────────│ Fix Story│
               │ Created  │
               └──────────┘
```

| Status | Description |
|--------|-------------|
| `pending` | Active development - stories being implemented |
| `testing` | All stories done, verification checklist generated, ready for testing |
| `completed` | Verified and findings extracted |

### Automatic Transitions

1. **All stories complete** → PRD moves to `testing`, verification.md auto-generated
2. **Tests pass (PRD_VERIFIED)** → PRD moves to `completed`, findings extracted
3. **Tests fail (PRD_FAILED)** → Fix story created, PRD moves back to `pending`

## Testing Workflow

When all stories are completed, Ralph automatically:
1. Generates `verification.md` - a checklist of things to test
2. Moves the PRD to `testing` status

Run automated tests:

```bash
omnidev ralph test my-feature
```

The test agent will:
- Run project quality checks (lint, typecheck, tests)
- Go through the verification checklist
- Take screenshots of any issues (with Playwriter)
- Save API responses for debugging

### Test Result Signals

The test agent outputs one of these signals:

**Success:**
```
<test-result>PRD_VERIFIED</test-result>
```
→ PRD automatically moves to `completed`

**Failure:**
```
<test-result>PRD_FAILED</test-result>
<issues>
- Issue description 1
- Issue description 2
</issues>
```
→ Fix story created (FIX-001, FIX-002, etc.), PRD moves back to `pending`

## PRD Structure

Each PRD lives in `.omni/state/ralph/prds/<status>/<prd-name>/` with these files:

| File | Description |
|------|-------------|
| `prd.json` | PRD definition with metadata and stories |
| `spec.md` | Detailed feature requirements |
| `progress.txt` | Log of work done across iterations |
| `verification.md` | Auto-generated test checklist (in testing status) |
| `test-results/` | Test evidence folder |

### prd.json

```json
{
  "name": "feature-name",
  "description": "Brief description",
  "stories": [
    {
      "id": "US-001",
      "title": "Story title",
      "acceptanceCriteria": ["Criterion 1", "Criterion 2"],
      "status": "pending",
      "priority": 1,
      "questions": []
    }
  ]
}
```

Story statuses: `pending`, `in_progress`, `completed`, `blocked`

### test-results/

Created during testing:

```
test-results/
├── report.md           # Main test report
├── screenshots/        # Issue screenshots
│   └── issue-001.png
└── api-responses/      # API test results
    └── endpoint.json
```

## Configuration

Agent and testing configuration lives in `.omni/state/ralph/config.toml`:

```toml
[ralph]
default_agent = "claude"
default_iterations = 10

[testing]
# Instructions shown to test agent
project_verification_instructions = "pnpm lint, pnpm typecheck, pnpm test must pass"
test_iterations = 5
# Enable web testing with Playwriter MCP
web_testing_enabled = true
web_testing_base_url = "http://localhost:3000"

[agents.claude]
command = "npx"
args = ["-y", "@anthropic-ai/claude-code", "--model", "sonnet", "--dangerously-skip-permissions", "-p"]

[agents.codex]
command = "npx"
args = ["-y", "@openai/codex", "exec", "-c", "shell_environment_policy.inherit=all", "--dangerously-bypass-approvals-and-sandbox", "-"]
```

### Web Testing with Playwriter

When `web_testing_enabled = true`, the test agent receives instructions for using Playwriter MCP:

```bash
# Create session and isolated page
playwriter session new
playwriter -s 1 -e "state.myPage = await context.newPage()"
playwriter -s 1 -e "await state.myPage.goto('http://localhost:3000')"

# Check page state
playwriter -s 1 -e "console.log(await accessibilitySnapshot({ page: state.myPage }))"

# Take screenshots
playwriter -s 1 -e "await state.myPage.screenshot({ path: 'test-results/screenshots/issue-001.png', scale: 'css' })"
```

## Findings

When completing a PRD, Ralph extracts patterns and learnings into `.omni/state/ralph/findings.md`. This serves as institutional knowledge for the codebase.

## Dependencies

PRDs can depend on other PRDs via the `dependencies` array. A PRD cannot start until all its dependencies are completed.

```json
{
  "name": "user-dashboard",
  "dependencies": ["user-auth", "database-setup"]
}
```

## Full QA Cycle Example

```bash
# 1. Create PRD (via /prd skill or manually)

# 2. Start development
omnidev ralph start my-feature
# Agent implements stories iteratively
# When all stories complete → moves to testing

# 3. Run tests
omnidev ralph test my-feature

# 4a. If PRD_VERIFIED → automatically completed!

# 4b. If PRD_FAILED → fix story created
omnidev ralph start my-feature  # Fix the issues
# Back to step 3

# 5. View completed PRD findings
cat .omni/state/ralph/findings.md
```
