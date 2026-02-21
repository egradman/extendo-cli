import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface BackendConfig {
  url: string;
  token: string;
}

export interface Config {
  // Legacy single-backend fields (migrated on read)
  url?: string;
  token?: string;
  // Multi-backend
  backends?: Record<string, BackendConfig>;
  default?: string;
}

const CONFIG_DIR = join(homedir(), ".config", "extendo");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export function readConfig(): Config | null {
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(raw) as Config;
  } catch {
    return null;
  }
}

export function writeConfig(config: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
}

/** Migrate legacy { url, token } to { backends: { default: { url, token } }, default: "default" } */
function migrate(config: Config): Config {
  if (config.url && config.token && !config.backends) {
    return {
      backends: { default: { url: config.url, token: config.token } },
      default: "default",
    };
  }
  return config;
}

/** Resolve a backend by name (or use default).
 *  Priority: 1) env vars  2) config file */
export function resolveBackend(name?: string): BackendConfig | null {
  // Environment variables override config when no specific backend is requested
  if (!name) {
    const envUrl = process.env.EXTENDO_URL;
    const envToken = process.env.EXTENDO_TOKEN;
    if (envUrl && envToken) {
      return { url: envUrl.replace(/\/$/, ""), token: envToken };
    }
  }

  const raw = readConfig();
  if (!raw) return null;
  const config = migrate(raw);
  if (!config.backends) return null;

  const key = name ?? config.default;
  if (!key) return null;
  return config.backends[key] ?? null;
}

/** Add or update a named backend. */
export function setBackend(name: string, backend: BackendConfig): void {
  const raw = readConfig() ?? {};
  const config = migrate(raw);
  const backends = config.backends ?? {};
  backends[name] = backend;
  const updated: Config = { backends, default: config.default ?? name };
  writeConfig(updated);
}

/** Set the default backend name. */
export function setDefault(name: string): void {
  const raw = readConfig() ?? {};
  const config = migrate(raw);
  if (!config.backends?.[name]) {
    throw new Error(`No backend named "${name}". Available: ${Object.keys(config.backends ?? {}).join(", ")}`);
  }
  writeConfig({ ...config, default: name });
}

/** List all configured backends. */
export function listBackends(): { name: string; url: string; isDefault: boolean }[] {
  const raw = readConfig();
  if (!raw) return [];
  const config = migrate(raw);
  if (!config.backends) return [];
  return Object.entries(config.backends).map(([name, b]) => ({
    name,
    url: b.url,
    isDefault: name === config.default,
  }));
}

/** Remove a named backend. */
export function removeBackend(name: string): void {
  const raw = readConfig() ?? {};
  const config = migrate(raw);
  if (!config.backends?.[name]) {
    throw new Error(`No backend named "${name}"`);
  }
  delete config.backends[name];
  if (config.default === name) {
    const remaining = Object.keys(config.backends);
    config.default = remaining[0];
  }
  writeConfig(config);
}
