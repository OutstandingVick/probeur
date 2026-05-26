import { createHash } from "node:crypto";
import { mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function nowIso() {
  return new Date().toISOString();
}

export function stableId(input) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 16);
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function appendJsonl(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(value)}\n`);
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function short(value) {
  if (!value) return "";
  const text = String(value);
  if (text.length <= 18) return text;
  return `${text.slice(0, 8)}...${text.slice(-6)}`;
}

export async function optionalImport(names) {
  for (const name of names) {
    try {
      return await import(name);
    } catch (error) {
      if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
    }
  }
  return null;
}
