#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { resolveBackend, setBackend, setDefault, listBackends, removeBackend } from "./config.js";
import { SetaeClient, SetaeClientError, type Artifact } from "./client.js";
import { formatThreads, formatMessages, formatArtifacts, formatArtifact } from "./format.js";

function getClient(opts: { url?: string; token?: string; backend?: string }): SetaeClient {
  // Explicit --url/--token override everything
  if (opts.url && opts.token) {
    return new SetaeClient(opts.url, opts.token);
  }
  const resolved = resolveBackend(opts.backend);
  if (!resolved) {
    if (opts.backend) {
      console.error(`No backend named "${opts.backend}". Run: setae config list`);
    } else {
      console.error("No backend configured. Run: setae auth add <name> <url> <token>");
    }
    process.exit(1);
  }
  return new SetaeClient(resolved.url, resolved.token);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8").trimEnd();
}

const program = new Command();

program
  .name("setae")
  .description("CLI for interacting with setae backends")
  .option("--json", "output as JSON")
  .option("--url <url>", "backend URL (overrides config)")
  .option("--token <token>", "bearer token (overrides config)")
  .option("-b, --backend <name>", "backend name (from config)");

// --- Auth commands ---

const auth = program
  .command("auth")
  .description("manage backend authentication");

auth
  .command("add <name> <url> <token>")
  .description("add or update a named backend")
  .action((name: string, url: string, token: string) => {
    setBackend(name, { url: url.replace(/\/$/, ""), token });
    console.log(`Saved backend "${name}" → ${url}`);
  });

auth
  .command("default <name>")
  .description("set the default backend")
  .action((name: string) => {
    try {
      setDefault(name);
      console.log(`Default backend set to "${name}"`);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

auth
  .command("list")
  .description("list configured backends")
  .action(() => {
    const backends = listBackends();
    if (backends.length === 0) {
      console.log("No backends configured. Run: setae auth add <name> <url> <token>");
      return;
    }
    for (const b of backends) {
      const marker = b.isDefault ? " (default)" : "";
      console.log(`  ${b.name}${marker}  ${b.url}`);
    }
  });

auth
  .command("remove <name>")
  .description("remove a backend")
  .action((name: string) => {
    try {
      removeBackend(name);
      console.log(`Removed backend "${name}"`);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

// --- Thread commands ---

program
  .command("threads")
  .description("list all threads")
  .action(async (_opts, cmd) => {
    const globals = cmd.optsWithGlobals();
    const client = getClient(globals);
    const data = await client.listEndpoints();
    console.log(formatThreads(data.endpoints, !!globals.json));
  });

program
  .command("read <category> <name>")
  .description("read messages from a thread")
  .action(async (category: string, name: string, _opts, cmd) => {
    const globals = cmd.optsWithGlobals();
    const client = getClient(globals);
    const data = await client.readMessages(category, name);
    console.log(formatMessages(data.messages, !!globals.json));
  });

program
  .command("send <category> <name> [text]")
  .description("send a message to a thread")
  .action(async (category: string, name: string, text: string | undefined, _opts, cmd) => {
    const globals = cmd.optsWithGlobals();
    const client = getClient(globals);
    const message = text ?? await readStdin();
    if (!message) {
      console.error("No message text provided. Pass as argument or pipe via stdin.");
      process.exit(1);
    }
    const res = await client.postMessage(category, name, message);
    if (globals.json) {
      console.log(JSON.stringify(res, null, 2));
    } else {
      console.log(`Sent to ${res.endpoint.category}/${res.endpoint.name}`);
    }
  });

program
  .command("new <category> [text]")
  .description("create a new thread")
  .action(async (category: string, text: string | undefined, _opts, cmd) => {
    const globals = cmd.optsWithGlobals();
    const client = getClient(globals);
    const message = text ?? await readStdin();
    if (!message) {
      console.error("No message text provided. Pass as argument or pipe via stdin.");
      process.exit(1);
    }
    const res = await client.postMessage(category, "__new__", message);
    if (globals.json) {
      console.log(JSON.stringify(res, null, 2));
    } else {
      console.log(`Created ${res.endpoint.category}/${res.endpoint.name}`);
    }
  });

const thread = program
  .command("thread")
  .description("manage thread metadata");

thread
  .command("update <category> <name>")
  .description("set thread title and/or note")
  .option("--title <title>", "set display name")
  .option("--note <note>", "set note")
  .action(async (category: string, name: string, opts, cmd) => {
    const globals = cmd.optsWithGlobals();
    if (!opts.title && !opts.note) {
      console.error("Provide at least one of: --title, --note");
      process.exit(1);
    }
    const client = getClient(globals);
    const updates: { displayName?: string; note?: string } = {};
    if (opts.title) updates.displayName = opts.title;
    if (opts.note) updates.note = opts.note;
    const res = await client.updateEndpointMeta(category, name, updates);
    if (globals.json) {
      console.log(JSON.stringify(res, null, 2));
    } else {
      console.log(`Updated ${category}/${name}`);
      if (res.meta.displayName) console.log(`  title: ${res.meta.displayName}`);
      if (res.meta.note) console.log(`  note: ${res.meta.note}`);
    }
  });

program
  .command("wait <category> <name>")
  .description("block until a new message appears")
  .option("--timeout <seconds>", "timeout in seconds", "300")
  .action(async (category: string, name: string, opts, cmd) => {
    const globals = cmd.optsWithGlobals();
    const client = getClient(globals);
    const timeoutMs = parseInt(opts.timeout, 10) * 1000;
    const deadline = Date.now() + timeoutMs;

    // Snapshot current messages
    const snapshot = await client.readMessages(category, name);
    const knownCount = snapshot.messages.length;

    let since = new Date().toISOString();

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));

      const pollRes = await client.poll(since);
      since = pollRes.serverTime;

      const match = pollRes.updates.find(
        (u) => u.category === category && u.name === name,
      );
      if (match) {
        const fresh = await client.readMessages(category, name);
        const newMessages = fresh.messages.slice(knownCount);
        if (newMessages.length > 0) {
          console.log(formatMessages(newMessages, !!globals.json));
          process.exit(0);
        }
      }
    }

    console.error("Timed out waiting for new messages.");
    process.exit(1);
  });

// --- Artifact commands ---

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

function parseItemSpec(spec: string): { id: string; label: string; description?: string } {
  const parts = spec.split(":");
  if (parts.length < 2) {
    throw new Error(`Invalid format "${spec}". Expected id:label or id:label:description`);
  }
  const [id, label, ...rest] = parts;
  const description = rest.length > 0 ? rest.join(":") : undefined;
  return { id, label, description };
}

function parseCategorizeItemSpec(spec: string): { headingId: string; id: string; label: string; description?: string } {
  const slashIdx = spec.indexOf("/");
  if (slashIdx < 0) {
    throw new Error(`Invalid categorize item format "${spec}". Expected heading_id/id:label[:description]`);
  }
  const headingId = spec.slice(0, slashIdx);
  const rest = spec.slice(slashIdx + 1);
  const parsed = parseItemSpec(rest);
  return { headingId, ...parsed };
}

function parseConversationLink(value: string): { category: string; name: string } {
  const idx = value.indexOf(":");
  if (idx < 0) {
    throw new Error(`Invalid conversation link "${value}". Expected category:name`);
  }
  return { category: value.slice(0, idx), name: value.slice(idx + 1) };
}

function buildPayload(opts: Record<string, any>): Record<string, any> {
  const prompt = opts.prompt ?? opts.title;
  switch (opts.type) {
    case "yes_no":
      return { type: opts.type, prompt };
    case "multiple_choice":
      return {
        type: opts.type,
        prompt,
        multiSelect: !!opts.multiSelect,
        options: (opts.option ?? []).map((spec: string) => {
          const parsed = parseItemSpec(spec);
          return { id: parsed.id, label: parsed.label, description: parsed.description, selected: false };
        }),
      };
    case "checklist":
      return {
        type: opts.type,
        prompt,
        items: (opts.item ?? []).map((spec: string) => {
          const parsed = parseItemSpec(spec);
          return { id: parsed.id, label: parsed.label, description: parsed.description };
        }),
      };
    case "ranking":
      return {
        type: opts.type,
        prompt,
        items: (opts.item ?? []).map((spec: string) => {
          const parsed = parseItemSpec(spec);
          return { id: parsed.id, label: parsed.label, description: parsed.description };
        }),
      };
    case "categorize": {
      const headings = (opts.heading ?? []).map((spec: string) => {
        const parsed = parseItemSpec(spec);
        return { id: parsed.id, label: parsed.label };
      });
      const headingIds = new Set(headings.map((h: { id: string }) => h.id));
      const buckets: Record<string, string[]> = {};
      for (const h of headings) {
        buckets[h.id] = [];
      }
      const items = (opts.item ?? []).map((spec: string) => {
        const parsed = parseCategorizeItemSpec(spec);
        if (!headingIds.has(parsed.headingId)) {
          throw new Error(`Unknown heading "${parsed.headingId}" in item "${spec}". Valid headings: ${[...headingIds].join(", ")}`);
        }
        buckets[parsed.headingId].push(parsed.id);
        return { id: parsed.id, label: parsed.label, description: parsed.description };
      });
      return { type: opts.type, prompt, headings, items, buckets };
    }
    case "document_review": {
      let markdown = opts.document ?? "";
      if (opts.documentFile) {
        markdown = readFileSync(opts.documentFile, "utf-8");
      }
      // Split into paragraphs for review
      const paragraphs = markdown
        .split(/\n\n+/)
        .filter((p: string) => p.trim())
        .map((text: string, i: number) => ({ id: `p${i + 1}`, markdown: text.trim() }));
      return { type: opts.type, prompt, document: markdown, paragraphs, annotations: [] };
    }
    default:
      return {};
  }
}

async function waitForArtifact(
  client: SetaeClient,
  category: string,
  name: string,
  timeoutMs: number,
  completion: string | { field: string; condition: string },
): Promise<Artifact> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    const artifact = await client.getArtifact(category, name);
    if (artifact.status === "submitted" || artifact.status === "returned" || artifact.status === "dismissed") return artifact;
    if (
      typeof completion === "object" &&
      completion.condition === "all_answered"
    ) {
      if (
        artifact.payload.items?.every(
          (item: any) => item.decision !== undefined,
        )
      ) {
        return artifact;
      }
    }
  }
  console.error("Timed out waiting for artifact submission");
  process.exit(1);
}

function handleClientError(err: unknown, category?: string, name?: string): never {
  if (err instanceof SetaeClientError) {
    if (err.statusCode === 404) {
      console.error(`Artifact not found: ${category}/${name}`);
      process.exit(2);
    }
    if (err.statusCode === 409) {
      console.error("Artifact has been submitted and cannot be modified");
      process.exit(1);
    }
    if (err.statusCode >= 500) {
      console.error(err.message);
      process.exit(3);
    }
  }
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const artifact = program
  .command("artifact")
  .description("manage artifacts (decisions, reviews, checklists)");

artifact
  .command("create <category> <name>")
  .description("create a new artifact")
  .requiredOption("--type <type>", "artifact type (multiple_choice, yes_no, checklist, ranking, document_review, categorize)")
  .requiredOption("--title <title>", "artifact title")
  .option("--prompt <prompt>", "question text")
  .option("--description <text>", "longer description/context")
  .option("--option <value>", "option as id:label[:desc] (repeatable, for multiple_choice)", collect, [])
  .option("--item <value>", "item as id:label[:desc] (repeatable, for checklist/ranking/categorize)", collect, [])
  .option("--heading <value>", "heading as id:label (repeatable, for categorize)", collect, [])
  .option("--multi-select", "allow multiple selections (multiple_choice)")
  .option("--document-file <path>", "load markdown from file (document_review)")
  .option("--document <markdown>", "inline markdown (document_review)")
  .option("--conversation <cat:name>", "link to conversation endpoint")
  .option("--completion <mode>", "completion mode: submit (default) or all_answered", "submit")
  .option("--wait", "block until artifact is submitted")
  .option("--timeout <seconds>", "timeout for --wait in seconds", "3600")
  .action(async (category: string, name: string, opts, cmd) => {
    const globals = cmd.optsWithGlobals();
    const client = getClient(globals);

    const completionValue =
      opts.completion === "all_answered"
        ? { field: "items", condition: "all_answered" }
        : "submit";

    const body = {
      type: opts.type,
      title: opts.title,
      status: "pending",
      description: opts.description,
      conversationLink: opts.conversation
        ? parseConversationLink(opts.conversation)
        : undefined,
      completion: completionValue,
      payload: buildPayload(opts),
    };

    let created: Artifact;
    try {
      created = await client.putArtifact(category, name, body);
    } catch (err) {
      handleClientError(err, category, name);
    }

    if (opts.wait) {
      const timeoutMs = parseInt(opts.timeout, 10) * 1000;
      const result = await waitForArtifact(client, category, name, timeoutMs, completionValue);
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(JSON.stringify(created, null, 2));
    }
  });

artifact
  .command("get <category> <name>")
  .description("get an artifact")
  .option("--wait", "block until artifact is submitted")
  .option("--timeout <seconds>", "timeout for --wait in seconds", "3600")
  .action(async (category: string, name: string, opts, cmd) => {
    const globals = cmd.optsWithGlobals();
    const client = getClient(globals);

    try {
      if (opts.wait) {
        const timeoutMs = parseInt(opts.timeout, 10) * 1000;
        const current = await client.getArtifact(category, name);
        const result = await waitForArtifact(client, category, name, timeoutMs, current.completion);
        console.log(JSON.stringify(result, null, 2));
      } else {
        const result = await client.getArtifact(category, name);
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (err) {
      handleClientError(err, category, name);
    }
  });

artifact
  .command("update <category> <name>")
  .description("update an artifact payload")
  .option("--payload-file <path>", "JSON file with payload updates")
  .option("--payload <json>", "inline JSON payload updates")
  .action(async (category: string, name: string, opts, cmd) => {
    const globals = cmd.optsWithGlobals();
    const client = getClient(globals);

    let payloadUpdate: Record<string, any>;
    if (opts.payloadFile) {
      payloadUpdate = JSON.parse(readFileSync(opts.payloadFile, "utf-8"));
    } else if (opts.payload) {
      payloadUpdate = JSON.parse(opts.payload);
    } else {
      console.error("Provide --payload or --payload-file");
      process.exit(1);
    }

    try {
      const existing = await client.getArtifact(category, name);
      const merged = {
        ...existing,
        payload: { ...existing.payload, ...payloadUpdate },
      };
      const updated = await client.putArtifact(category, name, merged);
      console.log(JSON.stringify(updated, null, 2));
    } catch (err) {
      handleClientError(err, category, name);
    }
  });

artifact
  .command("list")
  .description("list all artifacts")
  .option("--status <status>", "filter by status")
  .action(async (opts, cmd) => {
    const globals = cmd.optsWithGlobals();
    const client = getClient(globals);
    try {
      const data = await client.listArtifacts(opts.status);
      console.log(JSON.stringify(data.artifacts, null, 2));
    } catch (err) {
      handleClientError(err);
    }
  });

artifact
  .command("delete <category> <name>")
  .description("delete an artifact")
  .action(async (category: string, name: string, _opts, cmd) => {
    const globals = cmd.optsWithGlobals();
    const client = getClient(globals);
    try {
      await client.deleteArtifact(category, name);
      console.log(`Deleted artifact ${category}/${name}`);
    } catch (err) {
      handleClientError(err, category, name);
    }
  });

program.parseAsync().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
