---
name: consolidate-findings
description: "Consolidate Ralph findings into OMNI.md. Use when findings have accumulated and need to be merged into project instructions. Cleans up findings file and updates OMNI.md with concise, crucial patterns."
---

# Consolidate Findings

Merge accumulated findings from Ralph orchestration into the project's OMNI.md file, keeping only the most valuable, project-specific patterns.

## The Job

When a user invokes this skill:

### 1. Read the Findings File

Read `.omni/state/ralph/findings.md` to see all accumulated findings from completed PRDs.

```bash
cat .omni/state/ralph/findings.md
```

If the file doesn't exist or is empty, inform the user there are no findings to consolidate.

### 2. Read the Current project instu

Read the project's `OMNI.md` file to understand existing patterns and instructions.

```bash
cat OMNI.md
```

If OMNI.md doesn't exist, you'll create it with the standard template.

### 3. Deep Analysis

**Think deeply about the patterns.** This is critical - the goal is to extract maximum value in minimum words.

For each finding, ask yourself:

1. **Is this project-specific?** Skip generic programming advice or library documentation that any LLM would know.
2. **Is this a repeating pattern?** Patterns that appear multiple times across PRDs are more valuable.
3. **Would this prevent mistakes?** Gotchas and corrections are highly valuable.
4. **Can it be made more concise?** Every word should earn its place.
5. **Does this duplicate existing OMNI.md content?** Merge with existing if so.

**Prioritize:**

- Gotchas and common mistakes specific to this codebase
- Non-obvious conventions that differ from defaults
- Architectural decisions and their rationale
- File/folder structure patterns
- Testing patterns specific to this project
- Error handling approaches unique to this codebase

**Exclude:**

- Generic TypeScript/JavaScript best practices
- Library documentation (e.g., "use `useState` for state")
- Obvious patterns the LLM would infer from code
- Temporary workarounds that have been fixed
- Outdated information superseded by newer findings

### 4. Update OMNI.md

Create or update `OMNI.md` with the consolidated patterns. Use this structure:

```markdown
# Project Instructions

[Brief project description - 1-2 sentences max]

## Critical Patterns

[Most important gotchas and must-follow conventions]

## Architecture

[Key architectural decisions and patterns]

## Conventions

[Code style, naming, file organization patterns specific to this project]

## Testing

[Testing patterns and approaches if non-standard]
```

**Guidelines for writing:**

- Each bullet should be actionable and specific
- Use imperative mood: "Use X" not "We use X"
- Maximum 3-5 bullets per section
- Delete sections that have no project-specific content
- Total OMNI.md should ideally fit in ~50 lines

### 5. Clear the Findings File

After successfully updating OMNI.md, clear the findings file:

```bash
echo "# Ralph Findings\n\n" > .omni/state/ralph/findings.md
```

This prevents the same findings from being processed again.

### 6. Report to User

Summarize what was done:

- How many findings were processed
- What patterns were added/updated in OMNI.md
- What was removed as non-essential

## Example Consolidation

**Before (findings.md):**

```markdown
## [2026-01-15] user-auth

### Patterns
- Use zod for validation
- API routes in /api folder
- Use Prisma for database

### Learnings
- Forgot to add index on email column, queries were slow
- Had to use `skipLibCheck: true` because of type conflicts

## [2026-01-20] dashboard

### Patterns
- Use zod for validation
- Components in /components folder

### Learnings
- Always add index for columns used in WHERE clauses
- Dashboard used wrong date format, should be ISO 8601
```

**After (OMNI.md additions):**

```markdown
## Critical Patterns

- Add database indexes for all columns used in WHERE/JOIN clauses
- Use ISO 8601 date format (`YYYY-MM-DDTHH:mm:ssZ`) throughout
- `skipLibCheck: true` required in tsconfig due to type conflicts
```

Note: "Use zod" and "Use Prisma" were excluded - too generic. The index pattern was deduplicated. The date format gotcha was captured.

## When to Run This Skill

- After completing several PRDs
- When findings.md gets large (>100 lines)
- Before starting a new major feature (to have updated context)
- Periodically (e.g., weekly) during active development
