# Extendo Gate — Human Decision Gates for Agent Workflows

A gate is a point in an agent workflow where execution blocks until a human makes a structured decision on their phone. The agent sends a decision via Extendo, waits for the response, then acts on it.

## Prerequisites

- A configured backend (`./scripts/extendo auth list`)
- The `extendo-cli` skill provides the full artifact reference — this skill focuses on the gating *pattern*

## Core Workflow

Every gate follows the same four-phase pattern:

### Phase 1: Create a conversation thread

Start a new Extendo thread explaining what the gate is about. Capture the thread UUID for linking.

```bash
THREAD=$(./scripts/extendo new "<category>" \
  "Context message explaining why the user needs to make a decision." \
  --json | jq -r .endpoint.name)
```

The `<category>` is typically the repo path or project identifier (e.g., `my-project` or `ops`).

### Phase 2: Create a linked artifact with `--wait`

Create the structured decision and link it to the conversation thread. The `--wait` flag blocks the process until the user submits their response.

```bash
RESULT=$(./scripts/extendo artifact create "<category>" "<gate-name>" \
  --type <type> \
  --title "Decision title" \
  --prompt "Question for the user" \
  [type-specific flags] \
  --conversation "<category>:$THREAD" \
  --wait --json)
```

**Naming convention:** Use a unique, descriptive name for the artifact to avoid collisions. If your orchestrator assigns IDs (e.g., task IDs, issue IDs), use those.

**Timeout:** `--wait` defaults to 3600 seconds (1 hour). Override with `--timeout <seconds>`. When running as a subagent, ensure the Bash tool timeout exceeds the artifact timeout (use `timeout: 600000` for 10-minute waits).

### Phase 3: Parse the response

Extract structured data from the JSON result using `jq`. The payload shape depends on the artifact type.

### Phase 4: Act on the result

Update state, trigger downstream work, or branch on the decision.

## Gate Recipes

### Approval Gate (yes/no)

Block until the user approves or rejects.

```bash
THREAD=$(./scripts/extendo new "$CATEGORY" "Requesting approval: $CONTEXT" --json | jq -r .endpoint.name)

RESULT=$(./scripts/extendo artifact create "$CATEGORY" "$GATE_NAME" \
  --type yes_no \
  --title "Approve this action?" \
  --prompt "$DETAILS" \
  --conversation "$CATEGORY:$THREAD" \
  --wait --json)

APPROVED=$(echo "$RESULT" | jq -r '.payload.decision')
if [ "$APPROVED" = "true" ]; then
  # proceed
else
  # abort or take alternate action
fi
```

### Selection Gate (multiple choice)

Block until the user picks from options.

```bash
RESULT=$(./scripts/extendo artifact create "$CATEGORY" "$GATE_NAME" \
  --type multiple_choice \
  --title "Choose an option" \
  --prompt "Which approach?" \
  --option "a:Option A:Description of A" \
  --option "b:Option B:Description of B" \
  --option "c:Option C:Description of C" \
  --conversation "$CATEGORY:$THREAD" \
  --wait --json)

SELECTED=$(echo "$RESULT" | jq -r '.payload.selected[0]')
```

For multi-select, add `--multi-select` and iterate over `.payload.selected[]`.

### Review Gate (checklist)

Block until the user approves/rejects each item independently.

```bash
RESULT=$(./scripts/extendo artifact create "$CATEGORY" "$GATE_NAME" \
  --type checklist \
  --title "Review these items" \
  --prompt "Approve or reject each item" \
  --item "item1:First item:Details" \
  --item "item2:Second item:Details" \
  --completion all_answered \
  --conversation "$CATEGORY:$THREAD" \
  --wait --json)

# Approved items
echo "$RESULT" | jq -r '.payload.items[] | select(.decision == "approved") | .id'
# Rejected items with comments
echo "$RESULT" | jq '.payload.items[] | select(.decision == "rejected") | {id, comment}'
```

### Priority Gate (ranking)

Block until the user orders items by priority.

```bash
RESULT=$(./scripts/extendo artifact create "$CATEGORY" "$GATE_NAME" \
  --type ranking \
  --title "Prioritize these items" \
  --prompt "Drag to reorder (highest priority first)" \
  --item "a:Task A" \
  --item "b:Task B" \
  --item "c:Task C" \
  --conversation "$CATEGORY:$THREAD" \
  --wait --json)

# IDs in priority order (highest first)
echo "$RESULT" | jq -r '.payload.ranking[]'
TOP_PRIORITY=$(echo "$RESULT" | jq -r '.payload.ranking[0]')
```

### Triage Gate (categorize)

Block until the user sorts items into buckets (kanban on iPad).

```bash
RESULT=$(./scripts/extendo artifact create "$CATEGORY" "$GATE_NAME" \
  --type categorize \
  --title "Categorize these items" \
  --prompt "Sort into the right buckets" \
  --heading "now:Do Now" \
  --heading "next:Do Next" \
  --heading "later:Do Later" \
  --item "now/item1:Fix auth crash" \
  --item "next/item2:Add logging" \
  --item "later/item3:Refactor tests" \
  --conversation "$CATEGORY:$THREAD" \
  --wait --json)

# User's categorization (may differ from initial assignment)
echo "$RESULT" | jq '.payload.categorize'
```

### Document Review Gate

Block until the user annotates a document with per-paragraph comments.

```bash
RESULT=$(./scripts/extendo artifact create "$CATEGORY" "$GATE_NAME" \
  --type document_review \
  --title "Review this document" \
  --prompt "Leave comments on any paragraphs that need changes" \
  --document-file ./document.md \
  --conversation "$CATEGORY:$THREAD" \
  --wait --json)

ANNOTATION_COUNT=$(echo "$RESULT" | jq '.payload.annotations | length')
echo "$RESULT" | jq '.payload.annotations[] | {paragraphId, comment}'
```

## Spawning a Gate as a Subagent

To execute a gate from a parent agent without blocking the parent, use the Task tool with `subagent_type: "general-purpose"` and `mode: "bypassPermissions"`. Include the full gate instructions in the prompt. The subagent blocks on `--wait` while the parent continues other work.

## Error Handling

| Scenario | Mitigation |
|---|---|
| User never responds | Set `--timeout` to a reasonable SLA. Handle exit code 1 as timeout. |
| Artifact already exists | Use a unique artifact name to avoid collisions. Check with `./scripts/extendo artifact get` before creating. |
| Network error during wait | The artifact persists server-side. Resume polling with `./scripts/extendo artifact get --wait`. |
