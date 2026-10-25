// File IO adapted from lerenn/paseo-excalidraw server/files.ts (MIT, Copyright (c) 2026 Louis Fradin).
import { createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { isDrawingFileName } from "../shared/drawing-files";
import { emptyDrawingText } from "./empty-drawing.gen";
import { PathError, resolveDrawingPath } from "./paths";

export const MAX_DRAWING_BYTES = 50 * 1024 * 1024;
const MAX_LISTED = 500;
const MAX_DEPTH = 8;
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git", ".hg", ".svn", "dist", "build"]);
export const NEW_DRAWINGS_DIRECTORY = "drawings";

export function versionOf(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/** Reject text that is not a `.tldr` document before it reaches the disk. */
export function validateDrawingText(text: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new PathError("Content is not valid JSON");
  }
  const file = parsed as { tldrawFileFormatVersion?: unknown; records?: unknown; schema?: unknown };
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof file.tldrawFileFormatVersion !== "number" ||
    !Array.isArray(file.records) ||
    typeof file.schema !== "object"
  ) {
    throw new PathError('Content is not a tldraw file (expected {"tldrawFileFormatVersion", "schema", "records"})');
  }
}

// One writer per file: every read-modify-write in this process goes through here.
const locks = new Map<string, Promise<unknown>>();
function withFileLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  const tail = next.catch(() => undefined);
  locks.set(key, tail);
  void tail.then(() => {
    if (locks.get(key) === tail) locks.delete(key);
  });
  return next;
}

async function readIfExists(absolute: string): Promise<Buffer | null> {
  try {
    const stat = await fs.stat(absolute);
    if (!stat.isFile()) throw new PathError("Not a file");
    if (stat.size > MAX_DRAWING_BYTES) throw new PathError(`File is larger than ${MAX_DRAWING_BYTES / 1024 / 1024} MB`);
    return await fs.readFile(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function atomicWrite(absolute: string, content: string | Buffer): Promise<void> {
  const temporary = path.join(path.dirname(absolute), `.${path.basename(absolute)}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    await fs.writeFile(temporary, content);
    await fs.rename(temporary, absolute);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

export async function listDrawings(root: string) {
  const realRoot = await fs.realpath(root);
  const files: { path: string; size: number; mtimeMs: number }[] = [];
  let truncated = false;
  async function walk(directory: string, depth: number): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= MAX_LISTED) {
        truncated = true;
        return;
      }
      const full = path.join(directory, entry.name);
      // Symlinks are never followed while listing, so a link cannot lead outside the workspace.
      if (entry.isDirectory() && depth < MAX_DEPTH && !SKIPPED_DIRECTORIES.has(entry.name) && !entry.name.startsWith(".")) {
        await walk(full, depth + 1);
      } else if (entry.isFile() && isDrawingFileName(entry.name)) {
        const stat = await fs.stat(full);
        files.push({ path: path.relative(realRoot, full).split(path.sep).join("/"), size: stat.size, mtimeMs: stat.mtimeMs });
      }
    }
  }
  await walk(realRoot, 0);
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return { files, truncated };
}

export async function readDrawing(root: string, relative: string): Promise<{ text: string; version: string }> {
  const bytes = await readIfExists(await resolveDrawingPath(root, relative));
  if (bytes === null) throw new PathError(`File not found: ${relative}`);
  return { text: bytes.toString("utf8"), version: versionOf(bytes) };
}

export async function readDrawingBytes(root: string, relative: string): Promise<Buffer> {
  const bytes = await readIfExists(await resolveDrawingPath(root, relative));
  if (bytes === null) throw new PathError(`File not found: ${relative}`);
  return bytes;
}

// Hashing re-reads the file; skip that while mtime and size are unchanged (the 1 s poll hits this).
const statCache = new Map<string, { stamp: string; version: string }>();

export async function statDrawing(root: string, relative: string): Promise<{ exists: boolean; version: string | null }> {
  const absolute = await resolveDrawingPath(root, relative);
  let stat;
  try {
    stat = await fs.stat(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { exists: false, version: null };
    throw error;
  }
  const stamp = `${stat.mtimeMs}:${stat.size}`;
  const cached = statCache.get(absolute);
  if (cached?.stamp === stamp) return { exists: true, version: cached.version };
  const bytes = await readIfExists(absolute);
  if (bytes === null) return { exists: false, version: null };
  const version = versionOf(bytes);
  statCache.set(absolute, { stamp, version });
  return { exists: true, version };
}

export type WriteResult = { status: "ok"; version: string } | { status: "conflict"; version: string } | { status: "deleted" };

/** Write only if the file is still at `baseVersion`, unless `force`. Never recreates a deleted file. */
export async function writeDrawing(
  root: string,
  relative: string,
  text: string,
  baseVersion: string,
  force: boolean,
): Promise<WriteResult> {
  validateDrawingText(text);
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length > MAX_DRAWING_BYTES) throw new PathError(`Drawing is larger than ${MAX_DRAWING_BYTES / 1024 / 1024} MB`);
  const absolute = await resolveDrawingPath(root, relative);
  return withFileLock(absolute, async () => {
    const current = await readIfExists(absolute);
    if (current === null) return { status: "deleted" };
    const currentVersion = versionOf(current);
    if (!force && currentVersion !== baseVersion) return { status: "conflict", version: currentVersion };
    if (current.equals(bytes)) return { status: "ok", version: currentVersion };
    await atomicWrite(absolute, bytes);
    return { status: "ok", version: versionOf(bytes) };
  });
}

/** Create `drawings/untitled-<n>.tldr` with the first free n, holding an empty tldraw document. */
export async function createDrawing(root: string): Promise<{ path: string; version: string }> {
  for (let n = 1; n <= 1000; n++) {
    const relative = `${NEW_DRAWINGS_DIRECTORY}/untitled-${n}.tldr`;
    const absolute = await resolveDrawingPath(root, relative);
    const created = await withFileLock(absolute, async () => {
      if ((await readIfExists(absolute)) !== null) return false;
      await fs.mkdir(path.dirname(absolute), { recursive: true });
      // mkdir may have followed a symlink created meanwhile; re-validate before writing.
      await atomicWrite(await resolveDrawingPath(root, relative), emptyDrawingText);
      return true;
    });
    if (created) return { path: relative, version: versionOf(emptyDrawingText) };
  }
  throw new PathError(`No free name: ${NEW_DRAWINGS_DIRECTORY}/untitled-1.tldr to untitled-1000.tldr all exist`);
}
