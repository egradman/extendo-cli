---
name: setae
description: This skill should be used when the agent needs to communicate with a human user via Setae — sending messages, waiting for replies, creating structured decisions (artifacts), or managing backend configurations. Triggers on tasks involving user communication, approvals, reviews, rankings, checklists, or document feedback through the Setae CLI.
version: 0.1.0
---

# Setae CLI — Agent Skill

Setae is a CLI that connects agents to human users via mobile push notifications. You send messages and create structured decisions; the user sees rich UI on their phone and responds.

## Prerequisites

The `setae` CLI must be on your PATH. Verify with `setae config list` to see configured backends. Use `-b <name>` to target a specific backend (e.g., `-b claude`, `-b slack`). Without it, the default backend is used.

## Messaging

### Send a message
```bash
setae send <category> <name> "Your message here"
```

### Create a new thread
```bash
setae new <category> "First message for the new thread"
```

### Read messages
```bash
setae read <category> <name>
```

### Wait for a reply (blocks until new message appears)
```bash
setae wait <category> <name> --timeout 300
```

### List all threads
```bash
setae threads [--json]
```

**When to use messaging:** Status updates, open-ended questions, conversational exchanges. If you need a structured response (yes/no, pick from options, approve items), use artifacts instead.

## Artifacts (Structured Decisions)

Use artifacts when you need a **structured response** — not free-form text. Artifacts present purpose-built UI on the user's device (buttons, checklists, drag-to-reorder lists, annotatable documents). The user responds through that UI, and you get structured JSON back.

For the full artifact reference including all decision types, workflow patterns, result shapes, and jq parsing snippets, read the reference doc:

```
${CLAUDE_PLUGIN_ROOT}/skills/setae/references/artifact-reference.md
```

### Quick Reference

```bash
setae artifact create <category> <name> --type <type> --title <title> [options]
setae artifact get <category> <name> [--json] [--wait] [--timeout <s>]
setae artifact update <category> <name> --payload <json> | --payload-file <path>
setae artifact list [--status <status>] [--json]
setae artifact delete <category> <name>
```

### Decision Types at a Glance

| Type | When to Use | Key Flags |
|---|---|---|
| `yes_no` | Binary approval/rejection | `--prompt` |
| `multiple_choice` | Pick from options | `--option id:label[:desc]`, `--multi-select` |
| `checklist` | Per-item approve/reject | `--item id:label[:desc]`, `--completion all_answered` |
| `ranking` | Priority ordering | `--item id:label[:desc]` |
| `document_review` | Per-paragraph annotation | `--document-file` or `--document` |

### Minimal Examples

```bash
# Yes/no decision
setae artifact create decisions deploy \
  --type yes_no --title "Deploy to prod?" --prompt "All tests pass." --wait --json

# Multiple choice
setae artifact create decisions model \
  --type multiple_choice --title "Pick model" --prompt "Which one?" \
  --option "a:Option A" --option "b:Option B" --wait --json

# Checklist
setae artifact create decisions review \
  --type checklist --title "Review items" \
  --item "x:Item X" --item "y:Item Y" --wait --json
```

Always use `--json` when parsing results programmatically. Always use `--wait` unless you need to do other work while the user decides (then use `artifact get --wait` later).

## Global Flags

All commands accept: `--json`, `-b <name>` / `--backend <name>`, `--url <url>`, `--token <token>`

## Config Management

```bash
setae config add <name> <url> <token>   # Add/update a backend
setae config list                        # Show all backends
setae config default <name>              # Set default
setae config remove <name>               # Remove a backend
```
