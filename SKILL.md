---
name: extendo-cli
description: Communicate with a human user via Extendo — send messages, wait for replies, create structured decisions (yes/no, multiple choice, checklist, ranking, categorize, document review, DAG, progress grid), and build human decision gates into agent workflows. The user sees rich UI on their phone and responds. Triggers on "send message to user", "ask user", "get approval", "create decision", "artifact", "extendo", "human gate", "gate on user", "block until user decides", "approval gate", "extendo gate", "dag", "progress grid", "status grid", or any task requiring human input via mobile push notifications.
metadata:
  author: egradman
  version: "0.1.0"
---

# Extendo CLI — Agent Skill

Extendo is a CLI that connects agents to human users via mobile push notifications. You send messages and create structured decisions; the user sees rich UI on their phone and responds.

## Prerequisites

Verify with `npx extendo-cli auth list` to see configured backends. Use `-b <name>` to target a specific backend (e.g., `-b claude`, `-b slack`). Without it, the default backend is used.

## Messaging

### Send a message
```bash
npx extendo-cli send <category> <name> "Your message here"
npx extendo-cli send <category> <name> "msg" --context "Extra system context"
npx extendo-cli send <category> <name> "msg" --context-file ./context.md
```

### Create a new thread
```bash
npx extendo-cli new <category> "First message for the new thread"
npx extendo-cli new <category> "msg" --context "System context for the thread"
npx extendo-cli new <category> "msg" --context-file ./context.md
```

### Read messages
```bash
npx extendo-cli read <category> <name>
```

### Wait for a reply (blocks until new message appears)
```bash
npx extendo-cli wait <category> <name> --timeout 300
```

### List all threads
```bash
npx extendo-cli threads [--json]
```

### Update thread title and note
```bash
npx extendo-cli thread update <category> <name> --title "Custom Title" --note "What's happening now"
```

**Proactive thread naming:** When working in an Extendo thread, always set the title and note to reflect the current activity. Update the note as your task progresses so the user can see status at a glance without opening the thread.

```bash
# At the start of work
npx extendo-cli thread update claude my-session --title "Refactoring auth module" --note "Reading existing code"

# As work progresses
npx extendo-cli thread update claude my-session --note "Running tests — 3 of 12 passing"

# When done
npx extendo-cli thread update claude my-session --note "Complete — all tests passing"
```

**When to use messaging:** Status updates, open-ended questions, conversational exchanges. If you need a structured response (yes/no, pick from options, approve items), use artifacts instead.

## Artifacts (Structured Decisions)

Use artifacts when you need a **structured response** — not free-form text. Artifacts present purpose-built UI on the user's device (buttons, checklists, drag-to-reorder lists, annotatable documents). The user responds through that UI, and you get structured JSON back.

For the full artifact reference including all decision types, workflow patterns, result shapes, and jq parsing snippets, read the reference doc: [references/artifact-reference.md](references/artifact-reference.md)

### Quick Reference

```bash
npx extendo-cli artifact create <category> <name> --type <type> --title <title> [--description <text>] [options]
npx extendo-cli artifact get <category> <name> [--json] [--wait] [--timeout <s>]
npx extendo-cli artifact update <category> <name> --payload <json> | --payload-file <path>
npx extendo-cli artifact list [--status <status>] [--json]
npx extendo-cli artifact delete <category> <name>
```

### Decision Types at a Glance

| Type | When to Use | Key Flags |
|---|---|---|
| `yes_no` | Binary approval/rejection | `--prompt` |
| `multiple_choice` | Pick from options | `--option id:label[:desc]`, `--multi-select` |
| `checklist` | Per-item approve/reject | `--item id:label[:desc]`, `--completion all_answered` |
| `ranking` | Priority ordering | `--item id:label[:desc]` |
| `categorize` | Categorize into buckets (kanban on iPad) | `--heading id:label`, `--item heading/id:label[:desc]` |
| `document_review` | Per-paragraph annotation | `--document-file` or `--document` |
| `dag` | Directed graph visualization | `--node id\|title\|desc\|link\|color\|arc1,arc2,...` |
| `progress_grid` | Status grid (rows x columns) | `--columns Abbrev:Label,...`, `--row name\|link\|c1\|c2\|...` |

### Minimal Examples

```bash
# Yes/no decision
npx extendo-cli artifact create decisions deploy \
  --type yes_no --title "Deploy to prod?" --prompt "All tests pass." --wait --json

# Multiple choice
npx extendo-cli artifact create decisions model \
  --type multiple_choice --title "Pick model" --prompt "Which one?" \
  --option "a:Option A" --option "b:Option B" --wait --json

# Checklist
npx extendo-cli artifact create decisions review \
  --type checklist --title "Review items" \
  --item "x:Item X" --item "y:Item Y" --wait --json

# DAG (directed acyclic graph)
npx extendo-cli artifact create decisions arch \
  --type dag --title "Architecture" --prompt "System dependencies" \
  --node "api|API Server|Handles requests|https://link|blue|db,cache" \
  --node "db|Database|Postgres|https://link|green" \
  --node "cache|Cache|Redis|https://link|orange" --wait --json

# Progress grid (status matrix)
npx extendo-cli artifact create decisions sprint \
  --type progress_grid --title "Sprint Status" --prompt "Current progress" \
  --columns "D:Design,I:Implement,T:Test,R:Review" \
  --row "Auth flow|https://link|green|yellow|red|gray" \
  --row "Dashboard|https://link|green|green|yellow|red" --wait --json
```

Always use `--json` when parsing results programmatically. Always use `--wait` unless you need to do other work while the user decides (then use `artifact get --wait` later).

### Linking Artifacts to Conversations

Use `--conversation category:name` to link an artifact to an existing conversation thread. The user sees a "Discuss" button in the artifact UI that jumps to that thread, and the conversation shows a banner linking back to pending decisions.

```bash
npx extendo-cli artifact create decisions deploy \
  --type yes_no --title "Deploy?" --prompt "Ready?" \
  --conversation "ops:deploy-thread" \
  --wait --json
```

## Global Flags

All commands accept: `--json`, `-b <name>` / `--backend <name>`, `--url <url>`, `--token <token>`

## Human Decision Gates

For blocking an agent workflow on a human decision (approval gates, selection gates, review gates, etc.), see [extendo-gate.md](extendo-gate.md).

## Auth Management

```bash
npx extendo-cli auth add <name> <url> <token>      # Add/update a backend
npx extendo-cli auth list                           # Show all backends
npx extendo-cli auth default <name>                 # Set default
npx extendo-cli auth remove <name>                  # Remove a backend
```
