# oh-my-claudecode-slim

A lightweight multi-agent orchestration layer for [Claude Code](https://claude.ai/claude-code). Six specialized agents with clear delegation rules — no bloat, no magic, just better task routing.

Inspired by [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim). A Claude Code port of the full version exists at [oh-my-claudecode](https://github.com/yeachan-heo/oh-my-claudecode) — this is the lean alternative.

---

## What it does

Installs a `CLAUDE.md` orchestrator prompt and six specialist sub-agents into Claude Code. You get smarter task routing, parallelism, and the right model at the right cost — without a heavy framework.

### The Six Agents

| Agent | Role | Model |
|-------|------|-------|
| **Explorer** | Codebase search and pattern discovery | sonnet-4-6 |
| **Oracle** | Architecture decisions, code review, YAGNI | opus-4-5 |
| **Fixer** | Bounded implementation, test writing | sonnet-4-6 |
| **Librarian** | Official docs, API references, examples | sonnet-4-6 |
| **Designer** | UI/UX, responsive layouts, design systems | sonnet-4-6 |
| **Council** | Multi-perspective deliberation for critical choices | opus-4-5 |

---

## Installation

### Quick start (recommended)

```bash
npx oh-my-claudecode-slim install
```

Choose **global** to install in `~/.claude` (active in all Claude Code sessions), or **local** to install in `./.claude` (current project only).

Non-interactive:
```bash
npx oh-my-claudecode-slim install --global
npx oh-my-claudecode-slim install --local
```

### Via Claude Code plugin marketplace

```
/plugin marketplace add https://github.com/YOUR_USERNAME/oh-my-claudecode-slim
```

Then run the installer from within Claude Code:

```
install oh-my-claudecode-slim globally
```

Or from your terminal:

```bash
npx oh-my-claudecode-slim install --global
```

### Manual install

```bash
git clone https://github.com/YOUR_USERNAME/oh-my-claudecode-slim.git
cd oh-my-claudecode-slim
node bin/install.js install --global
```

---

## Verify your setup

Start a new Claude Code session and try:

```
ping all agents
```

Or something concrete:

```
use the explorer agent to find all TypeScript files in src/
```

```
ask oracle to review the authentication module for security issues
```

```
have fixer write unit tests for the validate() function in utils/validators.ts
```

---

## How it works

The `CLAUDE.md` system prompt turns the main Claude Code agent into an orchestrator with clear rules for when to delegate vs. act directly. Each agent is defined in `.claude/agents/` (or `~/.claude/agents/` for global installs) as a markdown file with a system prompt and model configuration.

### Delegation rules at a glance

| Agent | Delegate when | Skip when |
|-------|--------------|-----------|
| **Explorer** | Discovering what exists before acting | You know the path and need the content |
| **Oracle** | Decision has long-term consequences, stuck after 2+ attempts | Routine decisions, first fix attempt |
| **Fixer** | Task is bounded and context is already clear | Unclear requirements, single-line edits |
| **Librarian** | Library API is unfamiliar or version-specific | Standard usage you're confident about |
| **Designer** | Users will see and interact with it | Backend or logic-only changes |
| **Council** | Stakes are high enough for multiple perspectives | Speed matters, routine work |

---

## Customizing agents

Each agent is a plain markdown file. Edit the system prompt body to change behavior, or swap the `model` field in the frontmatter.

**Global install:** `~/.claude/agents/<agent>.md`
**Local install:** `.claude/agents/<agent>.md`

Available models:
- `claude-sonnet-4-6` — fast and capable (default for most agents)
- `claude-opus-4-5-20251101` — most capable, most expensive (oracle, council)

Example: use opus for oracle but sonnet for council to save cost:

```markdown
---
name: council
description: ...
model: claude-sonnet-4-6
---
```

---

## Uninstall

```bash
npx oh-my-claudecode-slim uninstall --global
# or
npx oh-my-claudecode-slim uninstall --local
```

This strips the OMCS block from your `CLAUDE.md` (preserving any other content) and removes the agent files.

---

## Updating

```bash
npx oh-my-claudecode-slim@latest install --global
```

The installer detects existing OMCS markers and updates the block in-place, preserving any user content outside the markers.

---

## Philosophy

**Slim means:**
- Six agents with clear, non-overlapping roles
- Delegation rules that tell you *when not to delegate*
- No framework, no runtime, no TypeScript compilation — just markdown files and one small Node.js installer
- Easy to read, easy to edit, easy to delete

**Not slim:**
- Autonomous workflows that run without your input
- 20+ agents for every conceivable specialty
- Heavy tooling that touches your environment in unexpected ways

---

## Credits

- [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim) — the original slim version for OpenCode
- [oh-my-claudecode](https://github.com/yeachan-heo/oh-my-claudecode) — the full-featured Claude Code port

---

MIT License
