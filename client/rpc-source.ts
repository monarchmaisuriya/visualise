import type { DrawingSource } from "./drawing-source";
import { DrawingConflictError, DrawingDeletedError } from "./save-queue";

const POLL_MS = 1000;

/** The drawing RPCs bound to one workspace and path. */
export interface DrawingRpc {
  read(): Promise<{ text: string; version: string }>;
  stat(): Promise<{ exists: boolean; version: string | null }>;
  write(input: { text: string; baseVersion: string; force: boolean }): Promise<
    { status: "ok"; version: string } | { status: "conflict"; version: string } | { status: "deleted" }
  >;
}

/**
 * A drawing read and written through plugin RPC, for the Visualise panel (which has no file
 * handle). Writes carry the last version this source saw, so the daemon refuses stale ones; a
 * 1 s status poll reports changes made by anyone else.
 */
export function createRpcSource(rpc: DrawingRpc, path: string): DrawingSource {
  let base = "";
  // Bumped by every read and write; a poll that began before the bump compares against an old base.
  let epoch = 0;
  let writing = false;

  return {
    importPath: path,
    async read() {
      const file = await rpc.read();
      base = file.version;
      epoch++;
      return file.text;
    },
    async write(text, force) {
      writing = true;
      try {
        const result = await rpc.write({ text, baseVersion: base, force });
        if (result.status === "deleted") throw new DrawingDeletedError();
        if (result.status === "conflict") throw new DrawingConflictError();
        base = result.version;
        epoch++;
      } finally {
        writing = false;
      }
    },
    watch(listener) {
      let polling = false;
      const timer = setInterval(async () => {
        if (polling || writing) return;
        polling = true;
        const started = epoch;
        try {
          const stat = await rpc.stat();
          if (writing || epoch !== started) return;
          if (!stat.exists) listener("deleted");
          else if (stat.version !== base) listener("changed");
        } catch (error) {
          console.warn(`[visualise] could not check ${path} for changes: ${error instanceof Error ? error.message : error}`);
        } finally {
          polling = false;
        }
      }, POLL_MS);
      return () => clearInterval(timer);
    },
  };
}
