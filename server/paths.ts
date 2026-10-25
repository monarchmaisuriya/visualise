// Adapted from lerenn/paseo-excalidraw server/paths.ts (MIT, Copyright (c) 2026 Louis Fradin).
import { promises as fs } from "node:fs";
import path from "node:path";
import { DRAWING_EXTENSION, isDrawingFileName } from "../shared/drawing-files";

export class PathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathError";
  }
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  if (relative === "") return true;
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function lstatOrNull(target: string) {
  try {
    return await fs.lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Resolve a workspace-relative `.tldr` path to a real absolute path guaranteed to sit inside
 * `root`. Rejects absolute paths, `..` escapes and symlinks (to the file or any ancestor) that
 * lead outside the workspace. Works for files that do not exist yet: the deepest existing
 * ancestor is resolved through symlinks and re-checked.
 */
export async function resolveDrawingPath(root: string, relative: string): Promise<string> {
  if (typeof relative !== "string" || relative.length === 0 || relative.includes("\0")) {
    throw new PathError("Invalid path");
  }
  if (path.isAbsolute(relative) || /^[a-zA-Z]:[\\/]/.test(relative) || relative.startsWith("\\")) {
    throw new PathError("Path must be relative to the workspace");
  }
  const normalized = path.normalize(relative);
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    throw new PathError("Path escapes the workspace");
  }
  if (!isDrawingFileName(path.basename(normalized))) {
    throw new PathError(`Only ${DRAWING_EXTENSION} files are supported, got ${JSON.stringify(path.basename(normalized))}`);
  }

  const realRoot = await fs.realpath(root);
  const target = path.resolve(realRoot, normalized);
  if (!isInside(realRoot, target)) throw new PathError("Path escapes the workspace");

  let existing = target;
  const missing: string[] = [];
  while ((await lstatOrNull(existing)) === null) {
    const parent = path.dirname(existing);
    if (parent === existing) throw new PathError("Path escapes the workspace");
    missing.unshift(path.basename(existing));
    existing = parent;
  }
  const realExisting = await fs.realpath(existing).catch(() => {
    throw new PathError("Cannot resolve path");
  });
  if (!isInside(realRoot, realExisting)) throw new PathError("Path escapes the workspace");
  const resolved = path.join(realExisting, ...missing);
  if (!isInside(realRoot, resolved)) throw new PathError("Path escapes the workspace");
  return resolved;
}

/**
 * The workspace-relative form of a path a client sent: relative paths pass through, absolute ones
 * (file tabs know only the absolute path) must lie inside the workspace. `resolveDrawingPath` still
 * re-checks the result.
 */
export async function toWorkspaceRelative(root: string, candidate: string): Promise<string> {
  if (!path.isAbsolute(candidate)) return candidate;
  const realRoot = await fs.realpath(root);
  const realCandidate = await fs.realpath(candidate).catch(() => {
    throw new PathError(`File not found: ${candidate}`);
  });
  if (!isInside(realRoot, realCandidate)) throw new PathError("Path escapes the workspace");
  return path.relative(realRoot, realCandidate).split(path.sep).join("/");
}
