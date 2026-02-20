# Extendo CLI

**Human-in-the-loop decisions for AI agents.**

Extendo lets your agents ask humans for structured decisions — approvals, choices, reviews, prioritization — delivered as rich UI via mobile push notifications. The human responds on their phone; the agent gets structured JSON back and continues.

```bash
# Agent asks for deploy approval → user sees a yes/no card on their phone
extendo artifact create ops deploy \
  --type yes_no --title "Deploy to prod?" \
  --prompt "All 847 tests pass. Ship it?" \
  --wait --json
```

```json
{ "payload": { "decision": true } }
```

No Slack threads. No email. No "reply YES to confirm." Purpose-built UI for each decision type.

## Quickstart

### 1. Install

```bash
npm install -g extendo
```

### 2. Get the Extendo app

Extendo is an iOS app. Install it on your iPhone or iPad via TestFlight (invite link coming soon).

### 3. Connect to the public backend

Visit **[public.extendo.sh](https://public.extendo.sh)** to get an API token. Scan the QR code with the Extendo app on your phone to add the backend.

```bash
extendo auth add public https://public.extendo.sh <your-token>
```

> **Note:** The public backend is the fastest way to try Extendo, but for production use you'll get a better experience hosting your own infrastructure — tighter integration with your agents, lower latency, and full control. See [extendo-backends](https://github.com/egradman/extendo-backends) for self-hosting on Cloudflare Workers or inside a Tailnet.

### 4. Add the Claude Code skill (optional)

If you use [Claude Code](https://docs.anthropic.com/en/docs/claude-code), install the skill so Claude knows how to use Extendo automatically:

```bash
npx skills add github:extendo-cli
```

## What can it do?

### Messaging

Send messages to a human and wait for replies:

```bash
extendo new project "Starting the auth refactor. I'll check in when I hit a decision point."
extendo send project my-thread "Found 3 approaches. Creating a decision artifact."
extendo wait project my-thread --timeout 300
```

### Structured Decisions

Create artifacts that render as purpose-built UI on the user's device. The agent blocks (or polls) until the user submits.

| Type | What the user sees | Use case |
|---|---|---|
| `yes_no` | Approve / Reject buttons | Deploy gates, destructive action confirmation |
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
THREAD=$(extendo new ops "Requesting deploy approval for v2.3.1" --json | jq -r .endpoint.name)

# Create a linked yes/no gate — blocks until the user taps Approve or Reject
RESULT=$(extendo artifact create ops deploy-v2 \
  --type yes_no \
  --title "Deploy v2.3.1 to production?" \
  --prompt "CI green. 847 tests pass. No regressions." \
  --conversation "ops:$THREAD" \
  --wait --json)

if [ "$(echo "$RESULT" | jq -r '.payload.decision')" = "true" ]; then
  echo "Deploying..."
else
  echo "Aborted."
fi
```

## CLI Reference

### Messaging

```bash
extendo new <category> "message"              # Create a new thread
extendo send <category> <name> "message"      # Send to existing thread
extendo read <category> <name>                # Read messages
extendo wait <category> <name> --timeout 300  # Block until reply
extendo threads                               # List all threads
extendo thread update <cat> <name> --title "..." --note "..."
```

Both `send` and `new` accept `--context <text>` or `--context-file <path>` to inject system context.

### Artifacts

```bash
extendo artifact create <cat> <name> --type <type> --title <title> [options]
extendo artifact get <cat> <name> [--wait] [--timeout <s>] [--json]
extendo artifact update <cat> <name> --payload <json> | --payload-file <path>
extendo artifact list [--status <status>] [--json]
extendo artifact delete <cat> <name>
```

### Auth

```bash
extendo auth add <name> <url> <token>   # Add/update a backend
extendo auth list                       # Show configured backends
extendo auth default <name>             # Set default backend
extendo auth remove <name>              # Remove a backend
```

### Global Flags

All commands accept: `--json`, `-b <name>` / `--backend <name>`, `--url <url>`, `--token <token>`

## Documentation

- **[SKILL.md](SKILL.md)** — Full skill reference (loaded automatically by Claude Code)
- **[references/artifact-reference.md](references/artifact-reference.md)** — Complete artifact type guide with result shapes and jq snippets
- **[extendo-gate.md](extendo-gate.md)** — Decision gate patterns for agent workflows

## Architecture

Extendo is three components:

| Component | What it does | Repo |
|---|---|---|
| **extendo-cli** | CLI + agent skill. Sends messages and creates artifacts via HTTP API. | You're here |
| **extendo-backends** | Cloudflare Workers that store threads, artifacts, and send push notifications. | [extendo-backends](https://github.com/egradman/extendo-backends) |
| **Extendo iOS app** | iPhone/iPad app that renders artifacts as native UI and sends responses back. | Private (TestFlight) |

```
Agent (CLI) ──HTTP──▶ Backend (CF Worker) ──APNs──▶ iOS App
                              ▲                         │
                              └────── HTTP response ────┘
```

## License

MIT
