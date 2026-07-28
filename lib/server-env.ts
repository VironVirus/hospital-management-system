import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

declare global {
  var __stGiannaServerEnvLoaded: boolean | undefined;
}

function parseEnvValue(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function loadServerEnv() {
  if (global.__stGiannaServerEnvLoaded) return;
  global.__stGiannaServerEnvLoaded = true;

  const fallbackFile = path.join(process.cwd(), "env");
  if (!existsSync(fallbackFile)) return;

  const content = readFileSync(fallbackFile, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key]?.trim()) continue;
    process.env[key] = parseEnvValue(rawValue);
  }
}
