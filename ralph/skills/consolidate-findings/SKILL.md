---
name: consolidate-findings
description: "Consolidate Ralph findings into OMNI.md. Use when findings have accumulated and need to be merged into project instructions. Cleans up findings file and updates OMNI.md with concise, crucial patterns."
---

# Consolidate Findings

Merge accumulated findings from Ralph orchestration into the project's OMNI.md file, keeping only the most valuable, project-specific patterns.

<Use_When>
- After completing several PRDs and findings have accumulated
- When findings.md exceeds ~100 lines
- Before starting a new major feature (to have updated context)
- Periodically during active development
</Use_When>

<Do_Not_Use_When>
- No findings.md exists or it's empty — nothing to consolidate
- OMNI.md was just updated — check if findings have changed since last consolidation
</Do_Not_Use_When>

## The Job

When a user invokes this skill:

### 1. Read the Findings File

Read `.omni/state/ralph/findings.md` to see all accumulated findings from completed PRDs.

If the file doesn't exist or is empty, inform the user there are no findings to consolidate.

### 2. Read the Current Project Instructions

Read the project's `OMNI.md` file to understand existing patterns and instructions.

If OMNI.md doesn't exist, you'll create it with the standard template.

### 3. Analyze Findings

<Analysis_Criteria>

For each finding, evaluate:

1. **Is this project-specific?** Skip generic programming advice or library documentation that any LLM would know.
2. **Is this a repeating pattern?** Patterns that appear multiple times across PRDs are more valuable.
3. **Would this prevent mistakes?** Gotchas and corrections are highly valuable.
4. **Can it be made more concise?** Every word should earn its place.
5. **Does this duplicate existing OMNI.md content?** Merge with existing if so.

**Include:**

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

</Analysis_Criteria>

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

<Examples>

**Good consolidation** (input → output):

Input (findings.md):
```markdown
## [2026-01-15] user-auth
### Patterns
- Use zod for validation
- API routes in /api folder
### Learnings
- Forgot to add index on email column, queries were slow
- Had to use `skipLibCheck: true` because of type conflicts

## [2026-01-20] dashboard
### Patterns
- Use zod for validation
### Learnings
- Always add index for columns used in WHERE clauses
- Dashboard used wrong date format, should be ISO 8601
```

Output (OMNI.md additions):
```markdown
## Critical Patterns
- Add database indexes for all columns used in WHERE/JOIN clauses
- Use ISO 8601 date format (`YYYY-MM-DDTHH:mm:ssZ`) throughout
- `skipLibCheck: true` required in tsconfig due to type conflicts
```

"Use zod" and "Use Prisma" were excluded — too generic. The index pattern was deduplicated. The date format gotcha was captured.

**Bad consolidation**: Copies all findings verbatim into OMNI.md without filtering, deduplicating, or condensing. Includes generic advice like "use TypeScript" alongside project-specific patterns.

</Examples>
