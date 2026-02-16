import type { ProtocolEndpoint, ProtocolMessage, Artifact } from "./client.js";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function padEnd(s: string, len: number): string {
  return s.length >= len ? s : s + " ".repeat(len - s.length);
}

export function formatThreads(
  endpoints: ProtocolEndpoint[],
  json: boolean,
): string {
  if (json) return JSON.stringify(endpoints, null, 2);

  if (endpoints.length === 0) return "No threads found.";

  const header = `${padEnd("CATEGORY", 16)}${padEnd("NAME", 26)}${padEnd("DISPLAY NAME", 30)}LAST ACTIVITY`;
  const rows = endpoints.map((e) => {
    const activity = e.lastActivity ? relativeTime(e.lastActivity) : "-";
    return `${padEnd(e.category, 16)}${padEnd(e.name, 26)}${padEnd(e.displayName ?? "-", 30)}${activity}`;
  });
  return [header, ...rows].join("\n");
}

export function formatMessages(
  messages: ProtocolMessage[],
  json: boolean,
): string {
  if (json) return JSON.stringify(messages, null, 2);

  if (messages.length === 0) return "No messages.";

  return messages
    .map((m) => `[${formatTime(m.timestamp)}] ${m.author}: ${m.text}`)
    .join("\n");
}

function statusIcon(status: string): string {
  switch (status) {
    case "pending":
      return "\u23F3";
    case "in_progress":
      return "\uD83D\uDD04";
    case "submitted":
      return "\u2713";
    case "returned":
      return "\u21A9";
    default:
      return "?";
  }
}

export function formatArtifacts(
  artifacts: Artifact[],
  json: boolean,
): string {
  if (json) return JSON.stringify(artifacts, null, 2);

  if (artifacts.length === 0) return "No artifacts found.";

  const header = `${padEnd("STATUS", 14)}${padEnd("TYPE", 20)}${padEnd("CATEGORY/NAME", 30)}${padEnd("TITLE", 30)}UPDATED`;
  const rows = artifacts.map((a) => {
    const statusStr = `${statusIcon(a.status)} ${a.status}`;
    const parts = a.id.split(":");
    const idDisplay = parts.length >= 2 ? `${parts[0]}/${parts.slice(1).join(":")}` : a.id;
    const updated = a.updatedAt ? relativeTime(a.updatedAt) : "-";
    return `${padEnd(statusStr, 14)}${padEnd(a.type, 20)}${padEnd(idDisplay, 30)}${padEnd(a.title, 30)}${updated}`;
  });
  return [header, ...rows].join("\n");
}

function formatYesNo(artifact: Artifact): string {
  const payload = artifact.payload;
  if (payload.answer === true) {
    return `${artifact.title} \u2014 Yes \u2713`;
  } else if (payload.answer === false) {
    return `${artifact.title} \u2014 No \u2717`;
  }
  return `${artifact.title} \u2014 Pending`;
}

function formatMultipleChoice(artifact: Artifact): string {
  const payload = artifact.payload;
  const options = payload.options ?? [];
  const selectedIds: string[] = payload.selected ?? [];
  if (selectedIds.length > 0) {
    const labels = selectedIds
      .map((id: string) => options.find((o: any) => o.id === id)?.label ?? id)
      .join(", ");
    return `${artifact.title} \u2014 Selected: ${labels}`;
  }
  return `${artifact.title} \u2014 ${options.length} options, awaiting selection`;
}

function formatChecklist(artifact: Artifact): string {
  const payload = artifact.payload;
  const items = payload.items ?? [];
  const approved = items.filter((i: any) => i.decision === true).length;
  const rejected = items.filter((i: any) => i.decision === false).length;

  const lines: string[] = [];
  if (approved > 0 || rejected > 0) {
    lines.push(`${artifact.title} \u2014 ${approved} approved, ${rejected} rejected`);
  } else {
    lines.push(`${artifact.title} \u2014 ${items.length} items, awaiting decisions`);
  }
  lines.push("");
  for (const item of items) {
    if (item.decision === true) {
      lines.push(`  \u2713 ${item.label}`);
    } else if (item.decision === false) {
      lines.push(`  \u2717 ${item.label}`);
    } else {
      lines.push(`  - ${item.label} (no decision)`);
    }
    if (item.comment) {
      lines.push(`    Comment: "${item.comment}"`);
    }
  }
  return lines.join("\n");
}

function formatRanking(artifact: Artifact): string {
  const payload = artifact.payload;
  const items = payload.items ?? [];
  const ranking = payload.ranking;

  if (ranking && ranking.length > 0) {
    const lines = [`${artifact.title} \u2014 Ranked:`, ""];
    for (let i = 0; i < ranking.length; i++) {
      const itemId = ranking[i];
      const item = items.find((it: any) => it.id === itemId);
      lines.push(`  ${i + 1}. ${item ? item.label : itemId}`);
    }
    return lines.join("\n");
  }
  return `${artifact.title} \u2014 ${items.length} items, awaiting ranking`;
}

function formatCategorize(artifact: Artifact): string {
  const payload = artifact.payload;
  const headings = payload.headings ?? [];
  const items = payload.items ?? [];
  const arrangement = payload.categorize ?? payload.buckets ?? {};

  const lines = [`${artifact.title} \u2014 Categorize:`, ""];
  for (const heading of headings) {
    const itemIds: string[] = arrangement[heading.id] ?? [];
    lines.push(`  [${heading.label}] (${itemIds.length} items)`);
    for (const itemId of itemIds) {
      const item = items.find((it: any) => it.id === itemId);
      const label = item ? item.label : itemId;
      const desc = item?.description ? ` \u2014 ${item.description}` : "";
      lines.push(`    \u2022 ${label}${desc}`);
    }
  }
  return lines.join("\n");
}

function formatDocumentReview(artifact: Artifact): string {
  const payload = artifact.payload;
  const annotations = payload.annotations ?? [];

  const lines = [`${artifact.title} \u2014 ${annotations.length} annotations`];
  if (annotations.length > 0) {
    lines.push("");
    for (const ann of annotations) {
      const paragraphs = payload.paragraphs ?? [];
      const para = paragraphs.find((p: any) => p.id === ann.paragraphId);
      const paraText = para?.markdown ?? para?.text ?? "";
      const paraPreview = paraText
        ? paraText.slice(0, 50) + (paraText.length > 50 ? "..." : "")
        : ann.paragraphId;
      lines.push(`  ${ann.paragraphId} (${paraPreview}):`);
      lines.push(`     "${ann.comment}"`);
    }
  }
  return lines.join("\n");
}

export function formatArtifact(
  artifact: Artifact,
  json: boolean,
): string {
  if (json) return JSON.stringify(artifact, null, 2);

  let detail: string;
  switch (artifact.type) {
    case "yes_no":
      detail = formatYesNo(artifact);
      break;
    case "multiple_choice":
      detail = formatMultipleChoice(artifact);
      break;
    case "checklist":
      detail = formatChecklist(artifact);
      break;
    case "ranking":
      detail = formatRanking(artifact);
      break;
    case "categorize":
      detail = formatCategorize(artifact);
      break;
    case "document_review":
      detail = formatDocumentReview(artifact);
      break;
    default:
      detail = `${artifact.title} (${artifact.type}) \u2014 ${artifact.status}`;
  }

  const meta = [
    `ID: ${artifact.id}`,
    `Status: ${statusIcon(artifact.status)} ${artifact.status}`,
    `Created: ${artifact.createdAt}`,
    `Updated: ${artifact.updatedAt}`,
  ];
  if (artifact.description) {
    meta.push(`Description: ${artifact.description}`);
  }
  if (artifact.conversationLink) {
    meta.push(`Conversation: ${artifact.conversationLink.category}/${artifact.conversationLink.name}`);
  }

  return [...meta, "", detail].join("\n");
}
