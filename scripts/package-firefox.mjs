#!/usr/bin/env node
// Builds a Firefox .xpi (a plain zip with manifest.json at its root) from src/.
// Only uses node built-ins. Run `tsc` first (`npm run package:firefox` does).
//
// usage: node scripts/package-firefox.mjs [--out path/to/file.xpi]
// default output: builds/better-ccc-<version>-firefox.xpi
//
// The archive is reproducible: entries are sorted and use a fixed timestamp.

import { readFileSync, readdirSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, relative, dirname, resolve, sep } from "node:path";
import { deflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "src");

const manifest = JSON.parse(readFileSync(join(srcDir, "manifest.json"), "utf8"));

const outArgIndex = process.argv.indexOf("--out");
const outPath = resolve(
  outArgIndex !== -1 && process.argv[outArgIndex + 1]
    ? process.argv[outArgIndex + 1]
    : join(root, "builds", `better-ccc-${manifest.version}-firefox.xpi`)
);

// * =========================
// * collect files

/** paths relative to src/, always with "/" separators */
function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (entry.isFile()) {
      files.push(relative(srcDir, full).split(sep).join("/"));
    }
  }
  return files;
}

const excluded = (path) =>
  path.endsWith(".ts") || // sources and .d.ts
  path.endsWith(".js.map") ||
  path.startsWith("types/"); // type-only modules, never loaded

const files = walk(srcDir)
  .filter((path) => !excluded(path))
  .sort();

// * =========================
// * validate manifest references

const errors = [];
const warnings = [];
const fileSet = new Set(files);
const requireFile = (path, from) => {
  if (!fileSet.has(path)) errors.push(`${from}: "${path}" is missing (did you run tsc?)`);
};

for (const [i, cs] of (manifest.content_scripts ?? []).entries()) {
  for (const path of [...(cs.js ?? []), ...(cs.css ?? [])]) {
    requireFile(path, `content_scripts[${i}]`);
  }
}
for (const path of manifest.background?.scripts ?? []) {
  requireFile(path, "background.scripts");
}
if (!manifest.background?.scripts?.length) {
  errors.push("background.scripts is required by Firefox (it has no service_worker support)");
}
for (const path of Object.values(manifest.icons ?? {})) requireFile(path, "icons");
const actionIcon = manifest.action?.default_icon;
for (const path of typeof actionIcon === "string" ? [actionIcon] : Object.values(actionIcon ?? {})) {
  requireFile(path, "action.default_icon");
}
for (const war of manifest.web_accessible_resources ?? []) {
  for (const path of war.resources ?? []) {
    if (!path.includes("*")) requireFile(path, "web_accessible_resources");
  }
}

const gecko = manifest.browser_specific_settings?.gecko;
if (!gecko?.id) errors.push("browser_specific_settings.gecko.id is missing");
if (!gecko?.data_collection_permissions) {
  warnings.push("browser_specific_settings.gecko.data_collection_permissions is missing (required by AMO)");
}

// a stale .js whose .ts was deleted would be packaged silently: warn about it
for (const path of files) {
  if (path.endsWith(".js")) {
    const ts = join(srcDir, path.replace(/\.js$/, ".ts"));
    try {
      if (statSync(ts).mtimeMs > statSync(join(srcDir, path)).mtimeMs + 1000) {
        warnings.push(`${path} is older than its .ts source (run tsc)`);
      }
    } catch {
      warnings.push(`${path} has no .ts source (stale build output?)`);
    }
  }
}

for (const w of warnings) console.warn(`warning: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  process.exit(1);
}

// * =========================
// * minimal zip writer (deflate, no zip64; plenty for an extension)

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// fixed timestamp for reproducible archives: 1980-01-01 00:00
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

// manifest.json first, then the rest in sorted order
const entries = ["manifest.json", ...files.filter((f) => f !== "manifest.json")];

const localParts = [];
const centralParts = [];
let offset = 0;

for (const path of entries) {
  const data = readFileSync(join(srcDir, path));
  const deflated = deflateRawSync(data, { level: 9 });
  const useDeflate = deflated.length < data.length;
  const body = useDeflate ? deflated : data;
  const name = Buffer.from(path, "utf8");
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0x0800, 6); // utf-8 names
  local.writeUInt16LE(useDeflate ? 8 : 0, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE((3 << 8) | 20, 4); // made by: unix
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(useDeflate ? 8 : 0, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(((0o100644 << 16) >>> 0), 38); // -rw-r--r--
  central.writeUInt32LE(offset, 42);

  localParts.push(local, name, body);
  centralParts.push(central, name);
  offset += local.length + name.length + body.length;
}

const centralSize = centralParts.reduce((sum, b) => sum + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, Buffer.concat([...localParts, ...centralParts, end]));

const shown = relative(process.cwd(), outPath);
console.log(`${!shown || shown.startsWith("..") ? outPath : shown}: ${entries.length} files, ${offset + centralSize + 22} bytes`);
