---
name: code-review
description: "Deep codebase review to find dead code, bad patterns, hardcoded values, hacky workarounds, and technical debt. Uses parallel agents to thoroughly analyze the codebase and report issues."
aliases: [review, cleanup, audit, debt]
---

# Code Review Skill

Deep codebase analysis using parallel agents to find code quality issues and technical debt. **Default to production/enterprise-level scrutiny** — do not assume MVP scope unless the user explicitly says otherwise.

## What This Skill Finds

| Category | Examples |
|----------|----------|
| **Dead Code** | Unused exports, unreferenced functions, commented-out code |
| **Bad Patterns** | God objects, circular dependencies, prop drilling |
| **Hardcoded Values** | Magic numbers, hardcoded URLs, embedded credentials |
| **Hacky Workarounds** | `// TODO`, `// HACK`, `// FIXME`, `any` casts, `@ts-ignore` |
| **Inconsistencies** | Mixed patterns, naming inconsistencies, style violations |
| **Performance Issues** | N+1 queries, missing indexes, unnecessary re-renders |
| **Security Concerns** | Exposed secrets, SQL injection risks, XSS vulnerabilities |

## Execution Strategy

**YOU ARE AN ORCHESTRATOR. Use subagents for all analysis.**

### Phase 1: Discovery (Parallel Exploration)

Launch multiple explore agents in parallel to scan different aspects:

```
// All in parallel with run_in_background: true
Task(subagent_type="Explore", model="haiku", prompt="Find all TODO, FIXME, HACK, XXX comments in the codebase. List file:line and the comment content.")

Task(subagent_type="Explore", model="haiku", prompt="Find all uses of 'any', 'as unknown', '@ts-ignore', '@ts-expect-error' in TypeScript files. These are type escape hatches that may indicate problems.")

Task(subagent_type="Explore", model="haiku", prompt="Find all hardcoded URLs, API endpoints, ports, and IP addresses. Look for patterns like 'http://', 'https://', 'localhost', ':3000', ':8080'.")

Task(subagent_type="Explore", model="haiku", prompt="Find all magic numbers and hardcoded strings that should be constants. Look for numbers in conditionals, timeouts, array indices, etc.")

Task(subagent_type="Explore", model="haiku", prompt="Find all commented-out code blocks (not documentation comments). Look for patterns of commented function bodies, imports, or logic.")

Task(subagent_type="Explore", model="haiku", prompt="Find all console.log, console.error, console.warn statements that might be debug leftovers.")
```

### Phase 2: Structural Analysis (Medium Depth)

After discovery, analyze structure:

```
Task(subagent_type="Explore", model="sonnet", prompt="Analyze the import graph. Find circular dependencies, deeply nested imports, and files that import too many modules (>10 imports).")

Task(subagent_type="Explore", model="sonnet", prompt="Find large files (>300 lines) that may need splitting. Identify god objects/modules that do too many things.")

Task(subagent_type="Explore", model="sonnet", prompt="Find unused exports. Look for exported functions, types, and constants that are never imported elsewhere.")

Task(subagent_type="Explore", model="sonnet", prompt="Find inconsistent patterns. Compare similar files (e.g., all API routes, all components) and note where patterns diverge.")
```

### Phase 3: Deep Review (Targeted)

For areas identified as problematic, use architect for deeper analysis:

```
Task(subagent_type="general-purpose", model="sonnet", prompt="Review [specific file/module] for: error handling gaps, missing edge cases, potential race conditions, and security issues.")
```

## Output Format

Create a structured findings report:

```markdown
# Code Review Findings

**Date:** [Date]
**Scope:** [Directories/files reviewed]

## Summary

| Category | Count | Severity |
|----------|-------|----------|
| Dead Code | X | Low |
| Type Escapes | X | Medium |
| Hardcoded Values | X | Medium |
| TODO/FIXME | X | Info |
| Security Concerns | X | High |

## Critical Issues (Fix Immediately)

### [Issue Title]
- **Location:** `file.ts:123`
- **Problem:** [Description]
- **Suggested Fix:** [How to fix]

## High Priority

### [Issue Title]
...

## Medium Priority

### [Issue Title]
...

## Low Priority / Tech Debt

### [Issue Title]
...

## Patterns to Refactor

[Describe recurring patterns that should be addressed systematically]

## Recommended Actions

1. [First action]
2. [Second action]
...
```

## Severity Classification

| Severity | Criteria | Action |
|----------|----------|--------|
| **Critical** | Security vulnerabilities, data loss risks, production blockers | Fix before next deploy |
| **High** | Broken functionality, major performance issues, exposed secrets | Fix this sprint |
| **Medium** | Bad patterns, hardcoded values, missing error handling | Plan to fix |
| **Low** | Code style, minor inconsistencies, TODOs | Fix opportunistically |
| **Info** | Suggestions, potential improvements | Consider for future |

## Scope Options

When invoking, you can specify scope:

- `/code-review` - Review entire codebase
- `/code-review src/api` - Review specific directory
- `/code-review --focus security` - Focus on security issues
- `/code-review --focus performance` - Focus on performance issues
- `/code-review --focus dead-code` - Focus on unused code

## Agent Selection Guide

| Task | Agent | Model |
|------|-------|-------|
| File pattern search | `Explore` | haiku |
| Structural analysis | `Explore` | sonnet |
| Deep code analysis | `general-purpose` | sonnet |
| Security review | `general-purpose` | sonnet |
| Architecture review | `general-purpose` | opus |

## Example Invocation

User: `/code-review`

1. **Read OMNI.md** for project context
2. **Scan codebase structure** to understand scope
3. **Launch Phase 1 agents** in parallel (6+ agents)
4. **Collect results** as agents complete
5. **Launch Phase 2 agents** based on findings
6. **Synthesize report** with prioritized findings
7. **Present to user** with recommended actions

## Follow-up Actions

After review, the user may want to:
- Create a PRD to address critical issues
- Run `/consolidate-findings` to add learnings to OMNI.md
- Fix specific issues immediately

Offer these options after presenting findings.
