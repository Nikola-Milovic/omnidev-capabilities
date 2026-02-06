# Council System - Multi-Agent Deliberation Architecture

## Overview

A command-line system where multiple AI "counselors" with distinct personas deliberate on topics through sequential argumentation. Counselors are anonymized in the forum (using names like Bob, Alice) - their underlying LLM/personality is private. Specialized "clerks" handle research and exploration tasks before deliberation.

## Core Concept

```
User creates topic → Clerks gather context (optional) → Counselors debate (10-20 rounds) → Each summarizes → Synthesis counselor produces final output
```

## Command Structure

```bash
council topic create <name>    # Create new topic, opens editor for input
council topic list             # List all topics
council topic show <name>      # View topic details

council deliberate <name>      # Start/resume deliberation on topic
council status <name>          # Check deliberation status
```

## Directory Structure

### State Directory: `~/.omni/state/council/`

```
~/.omni/state/council/
├── topics/
│   └── <topic-name>/
│       ├── manifest.yaml              # Topic metadata, status, round count
│       ├── topic.md                   # User's topic input
│       │
│       ├── context/                   # Clerk outputs (shared with all counselors)
│       │   ├── research.md            # Research Clerk findings (web search)
│       │   ├── exploration.md         # Exploration Clerk findings (codebase)
│       │   └── ...                    # Other clerk outputs
│       │
│       ├── forum/
│       │   └── discussion.md          # Public forum - anonymized names only
│       │
│       ├── counselors/                # Private counselor data
│       │   ├── bob/
│       │   │   ├── identity.yaml      # provider: claude, personality: analytical
│       │   │   ├── private-notes.md   # Internal reasoning (not shared)
│       │   │   └── summary.md         # Final summary (end of deliberation)
│       │   ├── alice/
│       │   │   └── ...
│       │   └── carol/
│       │       └── ...
│       │
│       └── output/
│           └── synthesis.md           # Final synthesized output
```

## Topic Input Format (`topic.md`)

When user runs `council topic create auth-redesign`:

```markdown
---
created: 2025-01-30T10:00:00Z
status: draft
counselors:
  - name: bob
  - name: alice
  - name: carol
clerks: [research, exploration]
max_rounds: 15
---

## Topic

<!-- What are we deliberating about? -->
We need to redesign the authentication system to support OAuth and SSO.

## Constraints

<!-- Rules that must be respected - counselors cannot violate these -->
- Must maintain backward compatibility with existing sessions
- Developer experience is the top priority
- No breaking changes to public API

## Goals

<!-- What does success look like? -->
- Clear migration path from current system
- Simple, testable implementation
- Support for multiple OAuth providers

## Notes

<!-- Additional context, rough thoughts, references -->
- Current system is in src/auth/
- We use JWT tokens currently
- Team prefers state machines over event-driven
```

## Counselor Identity System

### Private Identity (`counselors/<name>/identity.yaml`)
```yaml
name: bob
provider: claude
personality: analytical
system_prompt: |
  You are a careful, analytical thinker who focuses on edge cases,
  error handling, and rigorous analysis. Be skeptical of complexity.
```

### In the Forum - Anonymous
```markdown
### Bob - 10:05:23

**Assessment:**
After reviewing the clerk's exploration notes, I believe the current
auth system has several pain points...

**Proposal:**
I recommend a state machine approach because...
```

The forum only shows "Bob" - no mention of Claude, no mention of "analytical personality". This prevents bias and lets the ideas stand on their own merit.

## Clerk System

Clerks are specialized agents that prepare context BEFORE deliberation begins. They run once, write their findings to `context/`, and don't participate in the discussion.

### Available Clerks

| Clerk | Purpose | Output File |
|-------|---------|-------------|
| `exploration` | Search codebase for relevant code | `context/exploration.md` |
| `research` | Web search for external context | `context/research.md` |
| `summary` | Summarize long documents | `context/summary.md` |

### Clerk Output Format (`context/exploration.md`)
```markdown
# Codebase Exploration

## Relevant Files

### src/auth/session.ts
- Session management, uses state machine pattern
- Key functions: `createSession`, `validateSession`, `refreshToken`
- ~200 lines

### src/auth/middleware.ts
- Express middleware for auth
- Checks JWT tokens
- ~80 lines

## Existing Patterns
- State machine for session lifecycle (CREATED → ACTIVE → EXPIRED)
- JWT tokens stored in httpOnly cookies
- Refresh token rotation

## Potential Impact Areas
- All routes using `requireAuth` middleware
- Frontend session storage in localStorage
```

## Deliberation Workflow

### Phase 1: Topic Creation
```bash
$ council topic create auth-redesign
Creating new topic: auth-redesign
Opening topic file in editor...

[User fills in topic.md, saves, closes editor]

Topic created: auth-redesign
  Counselors: Bob, Alice, Carol
  Clerks: exploration, research
  Max rounds: 15

Run 'council deliberate auth-redesign' to begin.
```

### Phase 2: Clerk Preparation
```bash
$ council deliberate auth-redesign
Starting deliberation on: auth-redesign

[Clerk Phase]
Exploration Clerk is analyzing the codebase...
  → Found 8 relevant files
  → Noted existing patterns
  → Wrote findings to context/exploration.md

Research Clerk is searching the web...
  → Searched: "OAuth 2.0 best practices 2025"
  → Searched: "SSO implementation patterns"
  → Wrote findings to context/research.md

Context prepared. Beginning deliberation...
```

### Phase 3: Deliberation Rounds
```bash
[Round 1]

Bob:
  "After reviewing the exploration notes, I see we currently use a state
  machine pattern. I propose we extend this with..."

Alice:
  "I agree with Bob's foundation. However, I'd like to explore whether
  we could simplify by..."

Carol:
  "Both approaches have merit. Given our constraint of maintaining
  backward compatibility, I suggest..."

[Round 2]

Bob:
  "Carol raises a good point about backward compatibility. Let me
  refine my proposal..."

...

[Round 12]

Bob:
  "I think we've converged on the phased approach. I'm satisfied with
  Carol's latest refinement."

Alice:
  "Agreed. The hybrid model addresses my earlier concerns about
  complexity."

Carol:
  "Consensus reached. Let me summarize the key decisions..."
```

### Phase 4: Summaries
```bash
[Summary Phase]
Each counselor is preparing their final summary...

Bob's Summary:
  [Reads from counselors/bob/summary.md]

Alice's Summary:
  [Reads from counselors/alice/summary.md]

Carol's Summary:
  [Reads from counselors/carol/summary.md]
```

### Phase 5: Synthesis
```bash
[Synthesis Phase]
Synthesis Counselor is combining all perspectives...

Final output written to: output/synthesis.md

Done! View results:
  cat ~/.omni/state/council/topics/auth-redesign/output/synthesis.md
```

## Forum Format (`forum/discussion.md`)

```markdown
# Council Deliberation: auth-redesign

Started: 2025-01-30T10:00:00Z
Counselors: Bob, Alice, Carol

---

## Round 1

### Bob - 10:05:23

**Context Review:**
The exploration clerk found a state machine pattern in `src/auth/session.ts`.
This is a good foundation.

**Proposal:**
I recommend extending the existing state machine with OAuth states:
1. Add OAUTH_PENDING state for redirect flow
2. Add OAUTH_LINKED state for connected accounts

**Concerns:**
- Token refresh logic needs rethinking for OAuth tokens
- Need to handle provider-specific quirks

---

### Alice - 10:07:45

**Response to Bob:**
The state machine extension makes sense. I'd add:
- Consider a factory pattern for different OAuth providers
- Each provider has different token lifetimes

**Alternative:**
What if we use a separate "LinkedAccount" entity instead of extending
the session state machine? This separates concerns.

---

### Carol - 10:09:12

**Synthesis:**
I see merit in both approaches. Given our backward compatibility constraint:

**Recommended Approach:**
1. Keep existing session state machine unchanged
2. Add new LinkedAccount entity (Alice's suggestion)
3. Session delegates to LinkedAccount for OAuth operations (combines both)

**Practical Note:**
This allows us to ship incrementally without breaking existing auth.

---

## Round 2

### Bob - 10:11:34

**Response:**
Carol's synthesis is elegant. I withdraw my original state machine
extension proposal in favor of the LinkedAccount approach.

**Refinement:**
We should define the LinkedAccount interface...
```

## Configuration (`omni.toml`)

```toml
[council]
state_dir = "~/.omni/state/council"
default_max_rounds = 15
synthesis_counselor = "claude"  # Who synthesizes at the end

# Provider definitions - how to invoke each AI
[council.providers.claude]
command = "claude"
args = ["-p", "{prompt_file}", "--output-format", "stream-json"]

[council.providers.gemini]
command = "gemini"
args = ["--prompt", "{prompt_file}"]

[council.providers.codex]
command = "codex"
args = ["{prompt_file}"]

# Clerk definitions - specialized context gatherers
[council.clerks.exploration]
description = "Explores codebase for relevant code and patterns"
provider = "claude"  # Which AI to use for this clerk

[council.clerks.research]
description = "Searches web for external context"
provider = "claude"

# Personality definitions - how counselors should think
[council.personalities.analytical]
description = "Focuses on edge cases, error handling, and rigorous analysis"
system_prompt = """
You are a careful, analytical thinker. Focus on:
- Edge cases and error handling
- Potential security issues
- Testing implications
Be skeptical of complexity. Prefer proven patterns.
"""

[council.personalities.creative]
description = "Explores unconventional solutions and questions assumptions"
system_prompt = """
You are a creative thinker who challenges assumptions. Focus on:
- Alternative approaches that others might miss
- Simplifications that could eliminate complexity
- Novel patterns from other domains
Don't be afraid to propose unconventional ideas.
"""

[council.personalities.practical]
description = "Prioritizes simplicity, team capabilities, and constraints"
system_prompt = """
You are a practical thinker focused on real-world execution. Focus on:
- Team capabilities and learning curve
- Deployment and migration concerns
- Time and resource constraints
Ground discussions in practical reality.
"""

# Preset counselor configurations
[council.presets.default]
counselors = [
  { name = "bob", provider = "claude", personality = "analytical" },
  { name = "alice", provider = "gemini", personality = "creative" },
  { name = "carol", provider = "claude", personality = "practical" }
]
clerks = ["exploration"]
max_rounds = 15
```

## Implementation Structure

```
council/
├── packages/
│   ├── cli/
│   │   ├── src/
│   │   │   ├── index.ts           # CLI entry, parseArgs
│   │   │   ├── commands/
│   │   │   │   ├── topic.ts       # topic create/list/show
│   │   │   │   ├── deliberate.ts  # deliberate <name>
│   │   │   │   └── status.ts      # status <name>
│   │   │   ├── config.ts          # Load omni.toml
│   │   │   └── types.ts
│   │   └── package.json
│   │
│   └── lib/
│       ├── src/
│       │   ├── index.ts           # Public API
│       │   ├── topic.ts           # Topic CRUD
│       │   ├── facilitator.ts     # Orchestrates deliberation
│       │   ├── counselor.ts       # Counselor abstraction
│       │   ├── clerk.ts           # Clerk abstraction
│       │   ├── clerks/
│       │   │   ├── exploration.ts # Codebase exploration
│       │   │   ├── research.ts    # Web research
│       │   │   └── base.ts        # Base clerk class
│       │   ├── providers/
│       │   │   ├── claude.ts
│       │   │   ├── gemini.ts
│       │   │   ├── codex.ts
│       │   │   └── base.ts
│       │   ├── forum.ts           # Forum file management
│       │   ├── synthesis.ts       # Final synthesis logic
│       │   └── templates/
│       │       ├── topic.md
│       │       └── synthesis.md
│       └── package.json
│
└── omni.toml                      # Example config
```

## Key Implementation Details

### 1. Counselor Interface
```typescript
interface Counselor {
  // Public name (shown in forum)
  name: string;

  // Private identity (not shown in forum)
  provider: Provider;
  personality: Personality;

  // Generate a response given context
  respond(context: DeliberationContext): AsyncGenerator<string>;

  // Generate final summary
  summarize(context: SummaryContext): Promise<string>;
}
```

### 2. Clerk Interface
```typescript
interface Clerk {
  name: string;           // "exploration", "research", etc.
  description: string;
  provider: Provider;

  // Gather context and write to file
  gather(topic: Topic): Promise<ClerkOutput>;
}

interface ClerkOutput {
  filename: string;       // "exploration.md"
  content: string;
  metadata?: Record<string, unknown>;
}
```

### 3. Facilitator Loop
```typescript
async function runDeliberation(topic: Topic): Promise<void> {
  // Phase 1: Run clerks
  for (const clerk of topic.clerks) {
    console.log(`${clerk.name} Clerk is gathering context...`);
    const output = await clerk.gather(topic);
    await writeContext(topic, output);
  }

  // Phase 2: Deliberation rounds
  for (let round = 1; round <= topic.maxRounds; round++) {
    console.log(`\n[Round ${round}]`);

    for (const counselor of topic.counselors) {
      const context = buildContext(topic, counselor, round);

      console.log(`\n${counselor.name}:`);

      let response = "";
      for await (const chunk of counselor.respond(context)) {
        process.stdout.write(chunk);
        response += chunk;
      }

      await appendToForum(topic, counselor, round, response);
      await updatePrivateNotes(topic, counselor, response);
    }

    // Check for convergence signals
    if (await checkConvergence(topic)) {
      console.log("\n[Convergence detected]");
      break;
    }
  }

  // Phase 3: Each counselor summarizes
  console.log("\n[Summary Phase]");
  for (const counselor of topic.counselors) {
    const summary = await counselor.summarize(buildSummaryContext(topic));
    await writeSummary(topic, counselor, summary);
    console.log(`${counselor.name}'s summary written.`);
  }

  // Phase 4: Synthesis
  console.log("\n[Synthesis Phase]");
  const synthesisCounselor = getSynthesisCounselor(topic.config);
  const synthesis = await synthesisCounselor.synthesize(topic);
  await writeSynthesis(topic, synthesis);

  console.log(`\nDone! View: ${topic.outputPath}/synthesis.md`);
}
```

## Implementation Phases

### Phase 1: Core Infrastructure (MVP)
1. Topic management (create, list, show)
2. Single counselor deliberation (Claude only)
3. Basic forum file management
4. Interactive output streaming

**Test**: Create topic, run deliberation with one counselor, see output.

### Phase 2: Multi-Counselor + Anonymity
1. Multiple counselors with different names
2. Identity files (private provider/personality mapping)
3. Anonymous forum output (names only)

**Test**: Three counselors debate, forum shows only names.

### Phase 3: Clerk System
1. Clerk abstraction
2. Exploration clerk (codebase search)
3. Research clerk (web search)
4. Context file writing

**Test**: Clerks gather context before deliberation begins.

### Phase 4: Summary + Synthesis
1. Each counselor produces summary
2. Synthesis counselor combines all
3. Final output generation

**Test**: Full workflow from topic creation to synthesis.

### Phase 5: Polish
1. Pause/resume support
2. Better terminal UI (colors, spinners)
3. Error handling and recovery
4. Configuration validation

## Verification

```bash
# 1. Create a topic
council topic create test-auth

# 2. View the topic
council topic show test-auth

# 3. Start deliberation
council deliberate test-auth

# 4. Check status (if paused)
council status test-auth

# 5. View final output
cat ~/.omni/state/council/topics/test-auth/output/synthesis.md

# 6. View forum discussion
cat ~/.omni/state/council/topics/test-auth/forum/discussion.md
```

## Files to Reference

- **CLI pattern**: `ralph-orchestrator/packages/daemon/src/index.ts`
- **Config loading**: `ralph-orchestrator/packages/daemon/src/config.ts`
- **Process spawning**: Use `Bun.spawn()` for provider execution
