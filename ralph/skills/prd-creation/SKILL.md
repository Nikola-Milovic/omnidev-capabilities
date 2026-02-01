---
name: prd
description: "Generate a Product Requirements Document (PRD) for a new feature. Use when planning a feature, starting a new project, or when asked to create a PRD. Triggers on: create a prd, write prd for, plan this feature, requirements for, spec out."
---

# PRD Generator

Create structured PRDs for Ralph orchestration to enable AI-driven development.

## The Job

When a user requests a PRD:

### 1. Research & Explore

**Before interviewing**, gather context using specialized agents so you can ask informed questions:

#### Use the `explore` agent to understand the codebase:
- Find existing patterns and conventions
- Locate related code that the feature will integrate with
- Identify dependencies and constraints
- Understand the project structure

Example explorations:
- "Where is authentication handled?"
- "What patterns are used for API endpoints?"
- "Find existing database schemas"

#### Use the `research` agent for external knowledge:
- Best practices for the feature type
- Library/framework documentation
- Common pitfalls and edge cases
- Security considerations

Example research:
- "Best practices for file upload handling"
- "OAuth 2.0 implementation patterns"
- "Rate limiting strategies"

**This context helps you ask better questions** and identify constraints the user may not be aware of.

### 2. Interview the User

With codebase and domain knowledge in hand, conduct an **in-depth interview using the AskUserQuestion tool**.

**Interview approach:**

- Ask about **anything relevant**: technical implementation, UI/UX design, user flows, performance concerns, security implications, tradeoffs, edge cases, error handling, future extensibility, integration points, data modeling, state management, testing strategy, deployment considerations, etc.
- **Avoid obvious questions** - use your research and codebase exploration to ask informed, specific questions that demonstrate understanding
- **Continue interviewing in multiple rounds** until you have a complete picture - don't rush to finish
- **Surface tradeoffs** you've identified and ask the user to choose between approaches
- **Challenge assumptions** - if something seems unclear or potentially problematic, probe deeper

**Topics to explore (as relevant to the feature):**

- **Technical implementation**: Architecture decisions, patterns to follow, performance requirements, scalability concerns
- **UI/UX**: User flows, interaction patterns, responsive design, accessibility, error states, loading states, empty states
- **Data & state**: Data structures, storage, caching, synchronization, validation rules
- **Integration**: How it connects to existing systems, API contracts, backwards compatibility
- **Edge cases**: Failure modes, race conditions, concurrent access, resource limits
- **Security**: Authentication, authorization, input validation, data exposure
- **Testing**: What needs to be tested, acceptance criteria, how to verify correctness
- **Tradeoffs**: Speed vs. quality, simplicity vs. flexibility, consistency vs. innovation

**Use the AskUserQuestion tool** to present options, gather preferences, and validate your understanding. Keep interviewing until you have enough detail to write a comprehensive spec that an implementer could follow without further clarification.

### 3. Create the PRD Folder Structure

PRDs are stored in status-based folders:
- `pending/` - PRDs not yet started
- `in_progress/` - PRDs actively being worked on
- `testing/` - PRDs with all stories complete, awaiting verification
- `completed/` - Verified and finished PRDs

Create new PRDs in the `pending` folder:

```
.omni/state/ralph/prds/pending/<prd-name>/
  ├── prd.json       # Orchestration file with stories
  ├── spec.md        # Detailed feature specification
  └── progress.txt   # Progress log (empty initially)
```

When `omnidev ralph start` is run, the PRD moves to `in_progress/`.

### 4. Write the Spec File (spec.md)

The spec describes WHAT the feature should do (requirements), NOT HOW to implement it.

```markdown
# Feature Name

## Overview

Brief description of the feature and its purpose.

## Goals

- Goal 1
- Goal 2

## Requirements

### Functional Requirements

- FR-1: Description of requirement
- FR-2: Description of requirement

### Edge Cases

- What happens when X?
- How to handle Y?

## Acceptance Criteria

The feature is complete when:

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] All tests pass
- [ ] No type errors
```

### 5. Write the PRD File (prd.json)

Break down the work into stories (manageable chunks):

```json
{
  "name": "feature-name",
  "description": "Brief description of the feature",
  "createdAt": "2026-01-10T12:00:00Z",
  "dependencies": [],
  "stories": [
    {
      "id": "US-001",
      "title": "Story title",
      "acceptanceCriteria": [
        "Criterion 1",
        "Criterion 2"
      ],
      "status": "pending",
      "priority": 1,
      "questions": []
    }
  ]
}
```

**PRD fields:**

- `name`: Unique identifier (matches folder name)
- `description`: Brief description of the feature
- `createdAt`: ISO timestamp of creation
- `dependencies`: Array of PRD names that must be completed first (can be empty)

**Story fields:**

- `id`: Unique identifier (US-001, US-002, etc.)
- `title`: Short descriptive title
- `acceptanceCriteria`: Array of verifiable criteria for this chunk
- `status`: "pending" | "in_progress" | "completed" | "blocked"
- `priority`: 1-10 (lower = higher priority, do first)
- `questions`: Array of questions when blocked (empty initially)

### Dependencies

If this PRD depends on other PRDs being completed first, add them to the `dependencies` array:

```json
{
  "name": "user-dashboard",
  "dependencies": ["auth-system", "user-profile"],
  ...
}
```

**When to use dependencies:**

- The feature requires code from another PRD
- There's a logical order (e.g., database schema before API)
- Multiple PRDs are planned and should run in sequence

**Note:** `omnidev ralph start` will refuse to run a PRD with incomplete dependencies.

### 6. Create Empty Progress File

```
## Codebase Patterns

(Patterns discovered during implementation will be added here)

---

## Progress Log

Started: [Date]
```

### 7. Review with PRD Reviewer

**Before finalizing**, run the `prd-reviewer` agent to validate the PRD.

The reviewer is an expert software architect and product manager who checks:

#### Goal Alignment
- Is the problem clearly stated?
- Are goals specific and measurable?
- Is there scope creep?
- Can we objectively determine success?

#### Structural Quality
- Do early stories establish foundations (schema, types, config)?
- Are stories ordered so each builds on previous work?
- Is there a final story for end-to-end verification?
- Is each story completable in one iteration?
- Are acceptance criteria verifiable?

**The reviewer will provide:**
- Critical issues that MUST be fixed
- Recommendations that SHOULD be addressed
- Missing stories to add
- A verdict: READY TO PROCEED or NEEDS REVISION

**If the verdict is NEEDS REVISION:**
1. Address the critical issues
2. Update spec.md and prd.json
3. Run the reviewer again

**Only proceed when the reviewer approves the PRD.**

## Best Practices

### Story Breakdown

- **5-10 stories** is typical for a feature
- **Order by dependency** - foundational work first (priority 1-2)
- **Scope appropriately** - each story completable in one iteration
- **Verifiable criteria** - acceptance criteria must be testable

### Example Stories

```json
{
  "id": "US-001",
  "title": "Set up database schema",
  "acceptanceCriteria": [
    "Migration file created",
    "Tables created with correct columns",
    "Indexes added for common queries",
    "Types generated and passing"
  ],
  "status": "pending",
  "priority": 1,
  "questions": []
}
```

```json
{
  "id": "US-002",
  "title": "Implement API endpoints",
  "acceptanceCriteria": [
    "GET endpoint returns data",
    "POST endpoint creates records",
    "Validation errors return 400",
    "Tests written and passing"
  ],
  "status": "pending",
  "priority": 2,
  "questions": []
}
```

## Quality Checks

The `prd-reviewer` agent validates these automatically, but keep them in mind while writing:

- [ ] User has confirmed understanding of requirements
- [ ] spec.md describes the feature requirements clearly
- [ ] All stories have unique IDs in sequence
- [ ] Priorities are ordered correctly (1-10, no gaps)
- [ ] Acceptance criteria are specific and verifiable
- [ ] Stories build on each other logically
- [ ] First story sets up foundations (schema, types, config)
- [ ] Last story validates the complete feature

## After Creation (Post-Review)

Tell the user:

```
PRD created at .omni/state/ralph/prds/<pending>/<name>/

To start Ralph orchestration:
  omnidev ralph start <name>

To check status:
  omnidev ralph status <name>
```
