# Extendo Artifact CLI -- Full Reference

## When to Use Artifacts

Use artifacts when you need a **structured response** from the user -- not free-form text. Artifacts present purpose-built UI on the user's device (buttons, checklists, drag-to-reorder lists, annotatable documents). The user responds through that UI, and you get structured data back.

**Use artifacts for:**
- Approvals and confirmations (yes/no)
- Choosing between options (multiple choice)
- Reviewing a list of items with per-item decisions (checklist)
- Prioritizing items by importance (ranking)
- Getting paragraph-level feedback on a document (document review)

**Do NOT use artifacts for:**
- Simple questions you can resolve in chat ("which file should I edit?")
- Status updates or informational messages (use `extendo send`)
- Anything where free-form text is the natural response (use `extendo send` + `extendo wait`)

**Mental model:** You create the artifact, the user sees it as a rich UI card on their phone, they interact with it, and you get the result back as structured JSON.

---

## Quick Reference -- Command Syntax

```bash
# Create an artifact (optionally block until user submits)
extendo artifact create <category> <name> --type <type> --title <title> [--description <text>] [options]

# Read current state of an artifact
extendo artifact get <category> <name> [--json] [--wait] [--timeout <s>]

# Update an artifact's payload (e.g., push a document revision)
extendo artifact update <category> <name> --payload <json> | --payload-file <path>

# List all artifacts, optionally filtered by status
extendo artifact list [--status <status>] [--json]

# Delete an artifact
extendo artifact delete <category> <name>
```

Global flags (apply to all commands): `--json`, `-b <name>` / `--backend <name>`, `--url <url>`, `--token <token>`

Use `-b <name>` to target a specific backend (e.g., `-b claude`, `-b slack`). Without it, the default backend from `extendo auth list` is used.

---

## Decision Type Guide

### yes_no

**When to use:** Binary approval/rejection. Deploy permission, go/no-go, confirm destructive action.

**Required flags:** `--type yes_no`, `--title`, `--prompt`

**Example:**
```bash
extendo artifact create decisions deploy-prod \
  --type yes_no \
  --title "Deploy v2.3.1 to production?" \
  --prompt "CI is green. All 847 tests pass. Ready to deploy?" \
  --wait --json
```

**Result shape:**
```json
{
  "payload": {
    "prompt": "CI is green. All 847 tests pass. Ready to deploy?",
    "decision": true
  }
}
```

The `decision` field is `true` (yes) or `false` (no).

---

### multiple_choice

**When to use:** Pick one (or several) from a set of named options. Model selection, strategy choice, config selection.

**Required flags:** `--type multiple_choice`, `--title`, `--prompt`, at least one `--option`

**Option format:** `--option id:label` or `--option id:label:description` (repeatable)

**Flags:** `--multi-select` allows the user to pick more than one option.

**Example:**
```bash
extendo artifact create decisions pick-model \
  --type multiple_choice \
  --title "Choose the base model" \
  --prompt "Which model for the summarization task?" \
  --option "gpt4o:GPT-4o:Best quality, highest cost" \
  --option "claude:Claude 3.5:Good balance" \
  --option "gemini:Gemini 2.5:Fastest, lowest cost" \
  --wait --json
```

**Result shape:**
```json
{
  "payload": {
    "prompt": "Which model for the summarization task?",
    "multiSelect": false,
    "options": [
      { "id": "gpt4o", "label": "GPT-4o", "description": "Best quality, highest cost" },
      { "id": "claude", "label": "Claude 3.5", "description": "Good balance" },
      { "id": "gemini", "label": "Gemini 2.5", "description": "Fastest, lowest cost" }
    ],
    "selected": ["gpt4o"]
  }
}
```

The `selected` array at the payload level contains the IDs of chosen options.

---

### checklist

**When to use:** A list of items that each need an independent approve/reject decision. Expense review, PR file-by-file approval, feature flag review.

**Required flags:** `--type checklist`, `--title`, at least one `--item`

**Item format:** `--item id:label` or `--item id:label:description` (repeatable)

**Example:**
```bash
extendo artifact create decisions expense-review \
  --type checklist \
  --title "Approve Q4 expenses" \
  --prompt "Review each expense and approve or reject" \
  --item "aws:AWS bill $12,400:Monthly infrastructure" \
  --item "figma:Figma $480:Design tool subscription" \
  --item "retreat:Team retreat $8,200:Offsite in March" \
  --completion all_answered \
  --wait --json
```

**Result shape:**
```json
{
  "payload": {
    "items": [
      { "id": "aws", "label": "AWS bill $12,400", "description": "Monthly infrastructure", "decision": "approved" },
      { "id": "figma", "label": "Figma $480", "description": "Design tool subscription", "decision": "approved" },
      { "id": "retreat", "label": "Team retreat $8,200", "description": "Offsite in March", "decision": "rejected", "comment": "Too expensive this quarter" }
    ]
  }
}
```

Each item gets `decision` of `"approved"` or `"rejected"`, plus an optional `comment`.

---

### ranking

**When to use:** The user needs to order items by priority. Sprint planning, feature prioritization, migration ordering.

**Required flags:** `--type ranking`, `--title`, at least one `--item`

**Item format:** `--item id:label` or `--item id:label:description` (repeatable)

**Example:**
```bash
extendo artifact create decisions sprint-priority \
  --type ranking \
  --title "Prioritize sprint backlog" \
  --prompt "Drag to reorder by priority (highest first)" \
  --item "auth:Add SSO login" \
  --item "perf:Fix slow dashboard query" \
  --item "mobile:Responsive layout" \
  --item "docs:Update API docs" \
  --wait --json
```

**Result shape:**
```json
{
  "payload": {
    "items": [
      { "id": "auth", "label": "Add SSO login" },
      { "id": "perf", "label": "Fix slow dashboard query" },
      { "id": "mobile", "label": "Responsive layout" },
      { "id": "docs", "label": "Update API docs" }
    ],
    "ranking": ["perf", "auth", "mobile", "docs"]
  }
}
```

The `ranking` array is ordered from highest to lowest priority (item IDs).

---

### categorize

**When to use:** Categorize items into named buckets. Bug severity triage, task categorization, priority buckets, kanban-style sorting.

**Required flags:** `--type categorize`, `--title`, `--prompt`, at least one `--heading`, at least one `--item`

**Heading format:** `--heading id:label` (repeatable)

**Item format:** `--item heading_id/id:label[:description]` (repeatable). The prefix before `/` assigns the item to its initial bucket.

**Example:**
```bash
extendo artifact create decisions bug-triage \
  --type categorize \
  --title "Categorize bugs by severity" \
  --prompt "Categorize these bugs by severity" \
  --heading "critical:Critical" \
  --heading "major:Major" \
  --heading "minor:Minor" \
  --item "critical/bug1:Auth crash:Users see white screen" \
  --item "major/bug2:Slow query" \
  --item "minor/bug3:Typo in footer" \
  --wait --json
```

**Result shape:**
```json
{
  "payload": {
    "type": "categorize",
    "prompt": "Categorize these bugs by severity",
    "headings": [
      { "id": "critical", "label": "Critical" },
      { "id": "major", "label": "Major" },
      { "id": "minor", "label": "Minor" }
    ],
    "items": [
      { "id": "bug1", "label": "Auth crash", "description": "Users see white screen" },
      { "id": "bug2", "label": "Slow query" },
      { "id": "bug3", "label": "Typo in footer" }
    ],
    "buckets": { "critical": ["bug1"], "major": ["bug2"], "minor": ["bug3"] },
    "categorize": { "critical": ["bug1", "bug2"], "major": [], "minor": ["bug3"] }
  }
}
```

- `buckets` is the initial assignment (the "question")
- `categorize` is the user's result (the "answer"), same shape as `buckets`
- On the device: iPhone shows collapsible sections with context menu to move between buckets; iPad shows a kanban board with drag-and-drop

---

### document_review

**When to use:** A markdown document the user reviews with per-paragraph annotations. RFCs, proposals, generated reports, contracts.

**Required flags:** `--type document_review`, `--title`, and either `--document-file <path>` or `--document <markdown>`

**Example:**
```bash
extendo artifact create decisions rfc-review \
  --type document_review \
  --title "Review: Auth Service RFC" \
  --prompt "Please review this RFC and leave your comments" \
  --document-file ./rfc-auth-service.md \
  --wait --json
```

**Result shape:**
```json
{
  "payload": {
    "paragraphs": [
      { "id": "p1", "text": "## Introduction\nThis RFC proposes..." },
      { "id": "p2", "text": "## Authentication Flow\nThe user authenticates..." }
    ],
    "annotations": [
      { "paragraphId": "p2", "comment": "Use refresh tokens instead of long-lived JWTs" },
      { "paragraphId": "p5", "comment": "localStorage is a security risk. Use httpOnly cookies." }
    ]
  }
}
```

The document is auto-split into paragraphs with stable IDs (`p1`, `p2`, ...). Each annotation references a `paragraphId`.

---

### dag

**When to use:** Visualize a directed acyclic graph -- system architecture, dependency trees, task flows. Each node can have a title, description, link, color, and outgoing arcs to other nodes.

**Required flags:** `--type dag`, `--title`, at least one `--node`

**Node format:** `--node id|title|description|link|color|arc1,arc2,...` (repeatable). Arcs are comma-separated IDs of nodes this node points to.

**Example:**
```bash
extendo artifact create decisions system-arch \
  --type dag \
  --title "System Architecture" \
  --prompt "Service dependency graph" \
  --node "api|API Server|Handles HTTP requests|https://github.com/repo|blue|db,cache,queue" \
  --node "db|Database|PostgreSQL 15|https://wiki/db|green" \
  --node "cache|Cache|Redis cluster|https://wiki/cache|orange" \
  --node "queue|Job Queue|Sidekiq workers|https://wiki/queue|purple|db" \
  --wait --json
```

**Result shape:**
```json
{
  "payload": {
    "type": "dag",
    "prompt": "Service dependency graph",
    "nodes": [
      { "id": "api", "title": "API Server", "description": "Handles HTTP requests", "link": "https://github.com/repo", "color": "blue", "arcs": ["db", "cache", "queue"] },
      { "id": "db", "title": "Database", "description": "PostgreSQL 15", "link": "https://wiki/db", "color": "green", "arcs": [] },
      { "id": "cache", "title": "Cache", "description": "Redis cluster", "link": "https://wiki/cache", "color": "orange", "arcs": [] },
      { "id": "queue", "title": "Job Queue", "description": "Sidekiq workers", "link": "https://wiki/queue", "color": "purple", "arcs": ["db"] }
    ]
  }
}
```

The `dag` type is display-only -- it renders an interactive graph on the device. There is no user-submitted decision payload. Use it for informational visualizations.

---

### progress_grid

**When to use:** Display a status matrix -- rows (items) vs columns (phases/stages). Each cell has a color indicating status. Useful for sprint boards, migration trackers, or multi-dimensional progress views.

**Required flags:** `--type progress_grid`, `--title`, `--columns`, at least one `--row`

**Column format:** `--columns "Abbrev:Label,Abbrev:Label,..."` -- comma-separated pairs.

**Row format:** `--row "name|link|color1|color2|..."` (repeatable). Colors map positionally to columns. Common colors: `green`, `yellow`, `red`, `gray`, `blue`, `orange`. Leave empty for no color.

**Example:**
```bash
extendo artifact create decisions sprint-tracker \
  --type progress_grid \
  --title "Sprint 42 Progress" \
  --prompt "Feature status across phases" \
  --columns "D:Design,I:Implement,T:Test,R:Review,S:Ship" \
  --row "Auth SSO|https://jira/AUTH-1|green|green|yellow|red|gray" \
  --row "Dashboard v2|https://jira/DASH-2|green|yellow|red|gray|gray" \
  --row "API pagination|https://jira/API-3|green|green|green|green|yellow" \
  --wait --json
```

**Result shape:**
```json
{
  "payload": {
    "type": "progress_grid",
    "prompt": "Feature status across phases",
    "columns": [
      { "abbrev": "D", "label": "Design" },
      { "abbrev": "I", "label": "Implement" },
      { "abbrev": "T", "label": "Test" },
      { "abbrev": "R", "label": "Review" },
      { "abbrev": "S", "label": "Ship" }
    ],
    "rows": [
      { "name": "Auth SSO", "link": "https://jira/AUTH-1", "colors": ["green", "green", "yellow", "red", "gray"] },
      { "name": "Dashboard v2", "link": "https://jira/DASH-2", "colors": ["green", "yellow", "red", "gray", "gray"] },
      { "name": "API pagination", "link": "https://jira/API-3", "colors": ["green", "green", "green", "green", "yellow"] }
    ]
  }
}
```

The `progress_grid` type is display-only -- it renders a colored status grid on the device. There is no user-submitted decision payload. Use it for informational dashboards.

---

## Workflow Patterns

### Pattern 1: Simple Blocking Decision

Create the artifact with `--wait`. Your process blocks until the user submits. Read the result and act on it.

```bash
# Ask for deployment approval, block until answered
RESULT=$(extendo artifact create decisions deploy-v2 \
  --type yes_no \
  --title "Deploy v2.0?" \
  --prompt "All tests pass. Deploy to production?" \
  --wait --json)

APPROVED=$(echo "$RESULT" | jq -r '.payload.decision')
if [ "$APPROVED" = "true" ]; then
  echo "Deploying..."
else
  echo "Deployment cancelled by user."
fi
```

### Pattern 2: Non-blocking with Deferred Wait

Create the artifact without `--wait`. Do other work. Come back later with `get --wait`.

```bash
# Create the decision (returns immediately)
extendo artifact create decisions model-choice \
  --type multiple_choice \
  --title "Pick deployment region" \
  --prompt "Where should we deploy?" \
  --option "us-east:US East:N. Virginia" \
  --option "eu-west:EU West:Ireland" \
  --option "ap-south:AP South:Mumbai"

# ... do other work while user decides ...

# Block until user submits
RESULT=$(extendo artifact get decisions model-choice --wait --json --timeout 7200)
SELECTED=$(echo "$RESULT" | jq -r '.payload.selected[0]')
echo "User chose: $SELECTED"
```

### Pattern 3: Document Review Revision Loop

Create a document review, read annotations, revise the document, push a new revision. Repeat until the user submits with no annotations (approval) or you converge.

```bash
# Round 1: Create the review
extendo artifact create decisions rfc-review \
  --type document_review \
  --title "Review: Auth RFC" \
  --document-file ./rfc-v1.md \
  --wait --json > /tmp/round1.json

ANNOTATION_COUNT=$(jq '.payload.annotations | length' /tmp/round1.json)

if [ "$ANNOTATION_COUNT" -gt 0 ]; then
  # Read annotations, revise the document (your agent logic here)
  # Then push revision 2 with change markers:
  extendo artifact update decisions rfc-review \
    --payload-file /tmp/revision2-payload.json

  # Wait for round 2
  extendo artifact get decisions rfc-review --wait --json > /tmp/round2.json
fi
```

The revision payload should include updated `paragraphs` with `change` markers (`"added"`, `"modified"`, `"removed"`) and `status` reset to `"pending"`.

### Pattern 4: Linking to a Conversation

Attach a conversation endpoint so the user can discuss the decision via voice before committing.

```bash
extendo artifact create decisions budget-approval \
  --type checklist \
  --title "Approve Q1 budget" \
  --item "infra:Infrastructure $45k" \
  --item "hiring:New hire $120k" \
  --item "tools:Tooling $8k" \
  --conversation "finance:q1-budget-discussion" \
  --wait --json
```

The `--conversation` value is `category:name` of an existing endpoint on the same backend. The user sees a "Discuss" button in the artifact UI that opens voice chat with that endpoint.

---

## Completion Modes

### `submit` (default)

The artifact is considered complete only when the user explicitly taps the Submit button. Use this for most decision types.

### `all_answered`

The artifact auto-completes when every item in the `items` array has a `decision` value. Use this with `checklist` type when you want the artifact to resolve as soon as the user has made a decision on every item, without requiring a separate submit tap.

```bash
extendo artifact create decisions pr-review \
  --type checklist \
  --title "Review PR changes" \
  --item "api:API changes" \
  --item "tests:Test coverage" \
  --item "docs:Documentation" \
  --completion all_answered \
  --wait --json
```

---

## Parsing Results

Always use `--json` when you need to programmatically read the result. Here are `jq` snippets for each type.

### Yes/No
```bash
RESULT=$(extendo artifact get decisions deploy --json)
echo "$RESULT" | jq -r '.payload.decision'          # true or false
```

### Multiple Choice (single select)
```bash
RESULT=$(extendo artifact get decisions model --json)
echo "$RESULT" | jq -r '.payload.selected[0]'
```

### Multiple Choice (multi select)
```bash
RESULT=$(extendo artifact get decisions features --json)
echo "$RESULT" | jq -r '.payload.selected[]'
```

### Checklist
```bash
RESULT=$(extendo artifact get decisions expenses --json)
# All items with their decisions
echo "$RESULT" | jq '.payload.items[] | {id, decision, comment}'
# Just approved items
echo "$RESULT" | jq -r '.payload.items[] | select(.decision == "approved") | .id'
# Just rejected items with comments
echo "$RESULT" | jq '.payload.items[] | select(.decision == "rejected") | {id, comment}'
```

### Ranking
```bash
RESULT=$(extendo artifact get decisions priorities --json)
echo "$RESULT" | jq -r '.payload.ranking[]'          # IDs in priority order
echo "$RESULT" | jq -r '.payload.ranking[0]'         # highest priority item
```

### Categorize
```bash
RESULT=$(extendo artifact get decisions bug-triage --json)
# Get the user's categorization result (bucket assignments)
echo "$RESULT" | jq '.payload.categorize'
# Items in a specific bucket
echo "$RESULT" | jq -r '.payload.categorize.critical[]'
# Count items per bucket
echo "$RESULT" | jq '.payload.categorize | to_entries[] | {key, count: (.value | length)}'
```

### Document Review
```bash
RESULT=$(extendo artifact get decisions rfc --json)
# All annotations
echo "$RESULT" | jq '.payload.annotations[] | {paragraphId, comment}'
# Count annotations
echo "$RESULT" | jq '.payload.annotations | length'
# Get text of annotated paragraphs alongside comments
echo "$RESULT" | jq '
  .payload as $p |
  $p.annotations[] |
  {
    paragraphId,
    comment,
    text: ($p.paragraphs[] | select(.id == .paragraphId) | .text)
  }'
```

### DAG
```bash
RESULT=$(extendo artifact get decisions arch --json)
# All nodes
echo "$RESULT" | jq '.payload.nodes[] | {id, title, color, arcs}'
# Find nodes with no outgoing arcs (leaf nodes)
echo "$RESULT" | jq -r '.payload.nodes[] | select(.arcs | length == 0) | .id'
```

### Progress Grid
```bash
RESULT=$(extendo artifact get decisions sprint --json)
# All rows with their colors
echo "$RESULT" | jq '.payload.rows[] | {name, colors}'
# Column headers
echo "$RESULT" | jq -r '.payload.columns[] | "\(.abbrev): \(.label)"'
```

---

## Artifact Lifecycle

```
pending  -->  in_progress  -->  submitted
                           -->  returned
                           -->  dismissed
```

- **pending** -- Agent created it. User has not opened it yet.
- **in_progress** -- User has opened/started interacting with it.
- **submitted** -- User finalized their response. Terminal state. CLI `--wait` unblocks here.
- **returned** -- Agent sent the artifact back for revision (e.g., document review round-trip). Terminal state. CLI `--wait` unblocks here.
- **dismissed** -- User dismissed/discarded the artifact without completing it. Terminal state. CLI `--wait` unblocks here.

The agent can mutate the artifact at any point before a terminal state (revise options, update the document, change the prompt). Once in a terminal state, the artifact is read-only.

---

## Error Handling

| Scenario | Exit code | What to do |
|---|---|---|
| Timeout (`--wait` exceeded) | 1 | Increase `--timeout`, or check that the user received the push notification. Verify the artifact exists with `artifact get`. |
| Artifact not found | Non-zero | Verify category and name are correct. Use `artifact list` to see what exists. |
| Server/network error | Non-zero | Check backend connectivity. Verify `--url` and `--token` are correct. |
| No `--payload` or `--payload-file` on update | 1 | You must provide one of the two flags. |

All errors print to stderr. Successful output goes to stdout.

---

## Anti-patterns

**Don't use artifacts for simple yes/no that could be a chat message.**
If the question is low-stakes and conversational ("should I continue?"), just send a message with `extendo send` and wait for a reply with `extendo wait`. Reserve artifacts for decisions that benefit from structured UI.

**Don't create without `--wait` and forget to check the result.**
If you create an artifact without `--wait`, you must eventually call `artifact get --wait` or `artifact get --json` to read the user's response. An unchecked artifact is a dead end.

**Don't create multiple artifacts simultaneously without tracking them.**
If you need to create several artifacts, track each one by its `category/name` and poll or wait on each. Consider whether a single checklist artifact would serve better than multiple yes/no artifacts.

**Don't use document_review for short text.**
If the content is a sentence or two, use `yes_no` ("Do you approve this text?") or `multiple_choice`. Document review is for multi-paragraph documents where per-paragraph annotation adds value.

**Don't forget `--json` when parsing results programmatically.**
Without `--json`, the output is human-readable text that is harder to parse reliably. Always use `--json` when you need to extract structured data.

**Don't re-create an artifact that already exists.**
`PUT` is idempotent by category/name. If you create `decisions/deploy-v2` twice, the second call replaces the first. If the user was mid-interaction with the first version, their work is lost. Use `artifact get` to check status before overwriting.
