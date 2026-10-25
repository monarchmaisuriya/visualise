import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach } from "vitest";

/** A fresh temporary directory per test, removed afterwards. */
export function useTempDir(): () => Promise<string> {
  const made: string[] = [];
  afterEach(async () => {
    await Promise.all(made.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });
  return async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "visualise-test-"));
    made.push(dir);
    return dir;
  };
}
