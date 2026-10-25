// Adapted from lerenn/paseo-excalidraw server/assets.ts (MIT, Copyright (c) 2026 Louis Fradin).
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

// Raw bytes per RPC chunk; base64 makes it ~1.33x. Keeps every frame far below relay limits.
const CHUNK_BYTES = 384 * 1024;

export interface PreparedRuntime {
  hash: string;
  chunks: Buffer[];
  bytes: number;
}

/** Gzip once; the content hash lets clients cache the runtime and skip the transfer next time. */
export function prepareRuntime(html: string): PreparedRuntime {
  const compressed = gzipSync(Buffer.from(html, "utf8"), { level: 9 });
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < compressed.length; offset += CHUNK_BYTES) {
    chunks.push(compressed.subarray(offset, offset + CHUNK_BYTES));
  }
  return { hash: createHash("sha256").update(compressed).digest("hex").slice(0, 16), chunks, bytes: compressed.length };
}

export function runtimeChunk(runtime: PreparedRuntime, hash: string, index: number): { base64: string } {
  if (hash !== runtime.hash) throw new Error("The editor was updated; close and reopen the drawing");
  const chunk = runtime.chunks[index];
  if (!chunk) throw new Error(`No runtime chunk ${index}; the runtime has ${runtime.chunks.length}`);
  return { base64: chunk.toString("base64") };
}
