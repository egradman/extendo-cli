# Extendo CLI

[![Demo](https://img.youtube.com/vi/X5Dv9fU7Lb8/maxresdefault.jpg)](https://youtu.be/X5Dv9fU7Lb8)

**Human-in-the-loop decisions for AI agents.**

Extendo lets your agents ask humans for structured decisions — approvals, choices, reviews, prioritization — delivered as rich UI via mobile push notifications. The human responds on their phone; the agent gets structured JSON back and continues.

```bash
# Agent asks for deploy approval → user sees a yes/no card on their phone
./scripts/extendo artifact create ops deploy \
  --type yes_no --title "Deploy to prod?" \
  --prompt "All 847 tests pass. Ship it?" \
  --wait --json
```

```json
{ "payload": { "answer": true } }
```

No Slack threads. No email. No "reply YES to confirm." Purpose-built UI for each decision type.

### Quick idea capture

With a self-hosted backend, Extendo also works in the other direction. Capture ideas from your Apple Watch or iPhone's Action Button — speak a thought when inspiration strikes, and direct it to the right agent later. Start new Claude Code or Codex sessions in your repos, kick off Slack threads (handy for connecting to OpenClaw), or queue up ideas as conversation threads that agents can pick up and act on.

## Quickstart

### 1. Get the Extendo app

Extendo is an iOS app. Install it on your iPhone or iPad via [TestFlight](https://extendo.sh).

### 2. Connect to the public backend

Visit **[public.extendo.sh](https://public.extendo.sh)** to get an API token. Scan the QR code with the Extendo app on your phone to add the backend.

```bash
./scripts/extendo auth add public https://public.extendo.sh <your-token>
```

With the public backend, your agent can create artifacts and push them to your phone, then block until you respond. Everything in the [What can it do?](#what-can-it-do) section works out of the box. Limitations: the public backend uses on-device TTS (supply your own `GEMINI_API_KEY` for server-side TTS), and you can't initiate conversations from the app.

> **Self-hosting:** With a personal backend you can initiate new conversations with your agents right from the app — which makes the Apple Watch and Action Button quick-capture features genuinely useful. You also get server-side TTS, lower latency, and full control. See [extendo-backends](https://github.com/egradman/extendo-backends) for self-hosting on Cloudflare Workers or inside a Tailnet.

### 3. Try it

```bash
# Send a message to your phone
./scripts/extendo new test "Hello from the CLI!"

# Ask a yes/no question and wait for the answer
./scripts/extendo artifact create test first-decision \
  --type yes_no --title "Is it working?" --prompt "Tap approve if you see this." \
  --wait --json
```

### 4. Add the agent skill (optional)

Extendo includes a skill file (`SKILL.md`) that teaches AI agents how to use the CLI. Install it with:

```bash
npx skills add egradman/extendo-cli
```

## What can it do?

### Messaging

Send messages to a human and wait for replies:

```bash
./scripts/extendo new project "Starting the auth refactor. I'll check in when I hit a decision point."
./scripts/extendo send project my-thread "Found 3 approaches. Creating a decision artifact."
./scripts/extendo wait project my-thread --timeout 300
```

### Structured Decisions

Create artifacts that render as purpose-built UI on the user's device. The agent blocks (or polls) until the user submits.

| Type | What the user sees | Use case |
|---|---|---|
| `yes_no` | Yes / No buttons | Deploy gates, destructive action confirmation |
| `multiple_choice` | Radio buttons or checkboxes | Model selection, strategy choice |
| `checklist` | Per-item approve/reject switches | Expense review, PR file-by-file approval |
| `ranking` | Drag-to-reorder list | Sprint prioritization, migration ordering |
| `categorize` | Kanban board (iPad) / collapsible sections (iPhone) | Bug triage, task bucketing |
| `document_review` | Per-paragraph annotation | RFC review, contract review |
| `dag` | Interactive directed graph | Architecture diagrams, dependency visualization |
| `progress_grid` | Colored status matrix | Sprint trackers, migration dashboards |

### Decision Gates

Block an agent workflow until a human decides:

```bash
# Create a conversation thread for context
THREAD=$(./scripts/extendo new ops "Requesting deploy approval for v2.3.1" --json | jq -r .endpoint.name)

# Create a linked yes/no gate — blocks until the user taps Yes or No
RESULT=$(./scripts/extendo artifact create ops deploy-v2 \
  --type yes_no \
  --title "Deploy v2.3.1 to production?" \
  --prompt "CI green. 847 tests pass. No regressions." \
  --conversation "ops:$THREAD" \
  --wait --json)

if [ "$(echo "$RESULT" | jq -r '.payload.answer')" = "true" ]; then
  echo "Deploying..."
else
  echo "Aborted."
fi
```

## Concepts

Extendo has two core primitives: **endpoints** and **artifacts**. Both are addressed by `category/name`.

**Endpoints** are chat threads — a sequence of messages between an agent and a human. An endpoint lives at `category/name` (e.g. `ops/deploy-v2`). Categories can map to whatever makes sense for your backend — Slack channels, repos, project names. Names identify a specific conversation within that category (a Slack thread, a Claude Code session, an OpenClaw session, etc.).

**Artifacts** are structured decisions — a typed payload (yes/no, checklist, ranking, etc.) that renders as purpose-built UI on the user's device. An artifact also lives at `category/name`.

An artifact can optionally **link to an endpoint** via `--conversation category:name`. When linked, the user sees a "Discuss" button on the artifact that jumps to the conversation, and the conversation shows a banner linking back to pending decisions. This lets you pair a rich decision UI with a free-form chat thread for context.

## CLI Reference

### Messaging

```bash
./scripts/extendo new <category> "message"              # Create a new thread
./scripts/extendo send <category> <name> "message"      # Send to existing thread
./scripts/extendo read <category> <name>                # Read messages
./scripts/extendo wait <category> <name> --timeout 300  # Block until reply
./scripts/extendo threads                               # List all threads
./scripts/extendo thread update <cat> <name> --title "..." --note "..."
```

Both `send` and `new` accept `--context <text>` or `--context-file <path>` to inject system context.

### Artifacts

```bash
./scripts/extendo artifact create <cat> <name> --type <type> --title <title> [options]
./scripts/extendo artifact get <cat> <name> [--wait] [--timeout <s>] [--json]
./scripts/extendo artifact update <cat> <name> --payload <json> | --payload-file <path>
./scripts/extendo artifact list [--status <status>] [--json]
./scripts/extendo artifact delete <cat> <name>
```

### Auth

Extendo supports multiple backends. Each backend has a name, URL, and API token. The first backend you add becomes the default.

```bash
# Add a backend (first one added becomes the default)
./scripts/extendo auth add public https://public.extendo.sh <your-token>

# Add another backend
./scripts/extendo auth add work https://extendo.your-company.com <work-token>

# List configured backends
./scripts/extendo auth list
#   public (default)  https://public.extendo.sh
#   work              https://extendo.your-company.com

# Switch the default
./scripts/extendo auth default work

# Use a specific backend for one command
./scripts/extendo send ops deploy "Shipping v2.3" -b public

# Remove a backend
./scripts/extendo auth remove public
```

Config is stored at `~/.config/extendo/config.json`.

### Global Flags

All commands accept: `--json`, `-b <name>` / `--backend <name>`, `--url <url>`, `--token <token>`

## Documentation

- **[SKILL.md](SKILL.md)** — Full skill reference for AI agents
- **[references/artifact-reference.md](references/artifact-reference.md)** — Complete artifact type guide with result shapes and jq snippets
- **[extendo-gate.md](extendo-gate.md)** — Decision gate patterns for agent workflows

## Architecture

Extendo is three components:

| Component | What it does | Repo |
|---|---|---|
| **extendo-cli** | CLI + agent skill. Sends messages and creates artifacts via HTTP API. | You're here |
| **extendo-backends** | Cloudflare Workers that store threads, artifacts, and send push notifications. Backends currently provided for Claude Code and Slack. | [extendo-backends](https://github.com/egradman/extendo-backends) |
| **Extendo iOS app** | iPhone/iPad app that renders artifacts as native UI and sends responses back. | Private (TestFlight) |

### Protocol (public backend)

```mermaid
sequenceDiagram
    participant Agent
    participant CLI as extendo-cli
    participant Server as Backend
    participant APN as APNs Relay
    participant App as iOS App

    Agent->>CLI: needs human input
    CLI->>Server: PUT /artifacts/cat/name
    CLI->>CLI: polls for response
    Server->>APN: new artifact notification
    APN->>App: push notification
    App->>App: user sees artifact, decides
    App->>Server: PUT /artifacts/cat/name (response)
    CLI->>Server: GET /artifacts/cat/name (poll)
    Server->>CLI: artifact with payload
    CLI->>Agent: structured result
```

### Quick capture (self-hosted backend)

```mermaid
sequenceDiagram
    participant Watch as Apple Watch / Action Button
    participant App as iOS App
    participant Server as Backend
    participant Agent

    Watch->>App: voice capture
    App->>App: speech-to-text
    Note over App: user reviews transcription,<br/>picks destination endpoint
    App->>Server: POST message to endpoint
    Server->>Agent: new session (e.g. Claude Code session,<br/>Slack thread, etc.)
    loop back-and-forth
        Agent->>Server: messages + artifacts
        Server->>App: push notifications
        App->>Server: user responses
        Server->>Agent: structured results
    end
    Note over App,Agent: user may reuse this session<br/>or treat it as ephemeral
```

## Artifact Types

### Yes / No

Binary approval gates. PR stats, test results, reviews — all in the prompt. Tap and done.

![Yes / No](https://extendo.sh/screenshots/yes-no-merge.jpg)

```bash
extendo artifact create demo merge-gate \
  --type yes_no \
  --title "Merge to main?" \
  --prompt "PR #247 — Add rate limiting middleware
12 files changed, +340 -28
All 847 tests passing
2 approving reviews
No merge conflicts"
```

### Multiple Choice

Pick one from a list. Each option has a title and description so agents can give you full context.

![Multiple Choice](https://extendo.sh/screenshots/multiple-choice.jpg)

```bash
extendo artifact create demo implementation-choice \
  --type multiple_choice \
  --title "Where should we implement the rate limiter?" \
  --prompt "Each option has trade-offs for latency, state, and complexity." \
  --option "backend:Backend API:Express middleware — simple, per-instance counters" \
  --option "core:Core Library:Shared logic — reusable across services, needs Redis" \
  --option "edge:Edge / CDN:Cloudflare Workers — lowest latency, limited state" \
  --option "gateway:API Gateway:Kong/Nginx — centralized, no code changes needed"
```

### Checklist

Select multiple items. Review and approve sprint tasks, feature flags, or deployment checklists.

![Checklist](https://extendo.sh/screenshots/checklist.jpg)

```bash
extendo artifact create demo todo-checklist \
  --type checklist \
  --title "Sprint Tasks" \
  --prompt "Review and approve each task for this sprint" \
  --item "migrate-db:Migrate user table to new schema:Adds email_verified column" \
  --item "fix-auth:Fix OAuth callback race condition:Users get 403 after Google login" \
  --item "cache-layer:Add Redis caching to /api/feed:P95 latency 1.2s, target 200ms" \
  --item "dark-mode:Implement dark mode toggle:CSS custom properties in place" \
  --item "onboard-flow:Redesign onboarding flow:New Figma mocks from design" \
  --item "api-docs:Update OpenAPI spec for v2 endpoints:Three new endpoints" \
  --completion all_answered
```

### Categorize

Drag items into categories. Kanban-style triage — sort tickets into priority buckets from your phone.

![Categorize](https://extendo.sh/screenshots/categorize.jpg)

```bash
extendo artifact create demo kanban-triage \
  --type categorize \
  --title "Sprint Triage" \
  --prompt "Drag tickets into the right priority bucket" \
  --heading "p0:P0 — Ship Today" \
  --heading "p1:P1 — This Sprint" \
  --heading "p2:P2 — Next Sprint" \
  --heading "backlog:Backlog" \
  --item "p0/ENG-401:Login crash on iOS 18" \
  --item "p0/ENG-388:Payment webhook timeout" \
  --item "p1/ENG-412:Dashboard slow query" \
  --item "p1/ENG-395:Add SSO for enterprise" \
  --item "p2/ENG-420:Migrate to Postgres 16" \
  --item "p2/ENG-433:Redesign settings page" \
  --item "backlog/ENG-441:Add CSV export" \
  --item "backlog/ENG-445:Dark mode for admin panel" \
  --item "p1/ENG-402:Fix email threading" \
  --item "backlog/ENG-450:Upgrade React to v19"
```

### Document Review

Read and annotate specs, plans, or diffs right on your phone. Approve or send back with feedback.

![Document Review](https://extendo.sh/screenshots/document-review.jpg)

```bash
extendo artifact create demo ios-dark-mode-spec-review \
  --type document_review \
  --title "Spec Review: iOS Dark Mode" \
  --prompt "Review the dark mode spec. Approve or annotate." \
  --document "# Dark mode support with Settings toggle

## Summary
Add dark mode support with a user-facing appearance
picker in Settings. Three modes: System, Light, Dark.

## What needs to change
1. New @AppStorage key — appearanceMode
2. SettingsView — new Appearance section
3. Apply .preferredColorScheme() at root
4. Review AccentColor contrast in dark mode"
```

### DAG

Dependency graphs rendered natively on your phone. Track which agents are active, which steps are done, and what's blocked.

![DAG](https://extendo.sh/screenshots/dag.jpg)

```bash
extendo artifact create demo molecule-dag \
  --type dag \
  --title "thread-sort-filter" \
  --prompt "Molecule in progress — 2 agents active" \
  --node "spec|Discover & Specify|Write spec|#34C759|review-spec" \
  --node "review-spec|Human Review: Spec|Review spec|#34C759|plan" \
  --node "plan|Plan|Create implementation plan|#34C759|review-plan" \
  --node "review-plan|Human Review: Plan|Review plan|#34C759|worktree,decompose" \
  --node "worktree|Create Worktree|Set up feature branch|#34C759|impl-sort,impl-filter" \
  --node "decompose|Decompose|Break into subtasks|#34C759|impl-sort,impl-filter" \
  --node "impl-sort|BackendManager: sort|Sort by activity|#007AFF|impl-empty,agent-review" \
  --node "impl-filter|SidebarView: filter|Add filter chips|#007AFF|agent-review" \
  --node "impl-empty|SidebarView: empty state|Empty states|#8E8E93|agent-review" \
  --node "agent-review|Agent Review|Automated review|#8E8E93|human-review" \
  --node "human-review|Human Review: Final|Final review|#8E8E93|merge" \
  --node "merge|Merge & Cleanup|Merge to main|#8E8E93"
```

### Progress Grid

Track multiple workstreams at a glance. Each row is a feature, each column is a pipeline stage.

![Progress Grid](https://extendo.sh/screenshots/progress-grid.jpg)

```bash
extendo artifact create demo progress-grid \
  --type progress_grid \
  --title "Extendo Molecules" \
  --prompt "Feature pipeline status" \
  --columns "SP:Spec,PL:Plan,IM:Impl,RV:Review,MG:Merge" \
  --row "dag-artifact||green|green|green|green|green" \
  --row "progress-grid-artifact||green|green|green|green|green" \
  --row "thread-sort-filter||green|green|yellow|gray|gray" \
  --row "thread-list-metadata||green|yellow|gray|gray|gray" \
  --row "artifact-deep-links||yellow|gray|gray|gray|gray" \
  --row "decision-tombstones||green|green|green|yellow|gray"
```

### Dark Mode

All artifact types support dark mode, following your system appearance settings.

![Dark Mode](https://extendo.sh/screenshots/dark-mode-choice.jpg)

## License

MIT
