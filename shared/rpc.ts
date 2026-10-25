import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

const workspaceId = z.string().min(1);
/** Workspace-relative `.tldr` path, forward slashes. */
const drawingPath = z.string().min(1).max(500);

export const listDrawingsRpc = defineRpc({
  name: "visualise.drawings.list",
  input: z.object({ workspaceId }),
  output: z.object({
    files: z.array(z.object({ path: drawingPath, size: z.number(), mtimeMs: z.number() })),
    truncated: z.boolean(),
  }),
});

export const statDrawingRpc = defineRpc({
  name: "visualise.drawings.stat",
  input: z.object({ workspaceId, path: drawingPath }),
  output: z.object({ exists: z.boolean(), version: z.string().nullable() }),
});

export const readDrawingRpc = defineRpc({
  name: "visualise.drawings.read",
  input: z.object({ workspaceId, path: drawingPath }),
  output: z.object({ text: z.string(), version: z.string() }),
});

export const writeDrawingRpc = defineRpc({
  name: "visualise.drawings.write",
  input: z.object({
    workspaceId,
    path: drawingPath,
    text: z.string(),
    /** Version the editor last saw. A different current version means the write is stale. */
    baseVersion: z.string(),
    /** Write even when the file changed since `baseVersion`. */
    force: z.boolean(),
  }),
  output: z.discriminatedUnion("status", [
    z.object({ status: z.literal("ok"), version: z.string() }),
    z.object({ status: z.literal("conflict"), version: z.string() }),
    z.object({ status: z.literal("deleted") }),
  ]),
});

export const createDrawingRpc = defineRpc({
  name: "visualise.drawings.create",
  input: z.object({ workspaceId }),
  output: z.object({ path: drawingPath, version: z.string() }),
});

export const runtimeInfoRpc = defineRpc({
  name: "visualise.runtime.info",
  input: z.object({}),
  output: z.object({ hash: z.string(), chunks: z.number().int(), bytes: z.number().int() }),
});

export const runtimeChunkRpc = defineRpc({
  name: "visualise.runtime.chunk",
  input: z.object({ hash: z.string(), index: z.number().int().min(0) }),
  output: z.object({ base64: z.string() }),
});

/** Make a one-time URL that serves the saved drawing to tldraw.com's import page. */
export const prepareImportRpc = defineRpc({
  name: "visualise.cloud.prepare_import",
  input: z.object({
    workspaceId,
    /** Workspace-relative, or absolute inside the workspace (file tabs know the absolute path). */
    path: z.string().min(1).max(4096),
  }),
  output: z.object({ importUrl: z.string().url(), expiresInSeconds: z.number().int() }),
});
