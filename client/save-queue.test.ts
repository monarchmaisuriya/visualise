import { describe, expect, it } from "vitest";
import { DrawingConflictError, DrawingDeletedError, SaveQueue, type SaveStatus } from "./save-queue";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup() {
  const writes: { text: string; force: boolean; done: ReturnType<typeof deferred> }[] = [];
  const modified: boolean[] = [];
  const statuses: SaveStatus[] = [];
  let reloads = 0;
  const queue = new SaveQueue({
    write(text, force) {
      const done = deferred();
      writes.push({ text, force, done });
      return done.promise;
    },
    setModified: (value) => modified.push(value),
    onStatus: (status) => statuses.push(status),
    reload: () => {
      reloads++;
    },
  });
  return { queue, writes, modified, statuses, reloads: () => reloads };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("SaveQueue", () => {
  it("marks the tab modified as soon as the editor reports a change", () => {
    const { queue, modified } = setup();
    queue.markDirty();
    expect(modified).toEqual([true]);
  });

  it("writes the newest text only and never overlaps writes", async () => {
    const { queue, writes } = setup();
    queue.changed("a");
    queue.changed("b");
    queue.changed("c");
    expect(writes.map((w) => w.text)).toEqual(["a"]);
    writes[0]!.done.resolve();
    await tick();
    expect(writes.map((w) => w.text)).toEqual(["a", "c"]);
  });

  it("clears modified only when the last write lands and nothing newer is pending", async () => {
    const { queue, writes, modified } = setup();
    queue.changed("a");
    queue.markDirty();
    writes[0]!.done.resolve();
    await tick();
    expect(modified.at(-1)).toBe(true);
    queue.changed("b");
    writes[1]!.done.resolve();
    await tick();
    expect(modified.at(-1)).toBe(false);
  });

  it("reloads on an outside change while clean", () => {
    const { queue, reloads, statuses } = setup();
    queue.externalChange();
    expect(reloads()).toBe(1);
    expect(statuses.at(-1)?.kind ?? "clean").toBe("clean");
  });

  it("reports a conflict on an outside change while there are unsaved edits", () => {
    const { queue, reloads, statuses } = setup();
    queue.markDirty();
    queue.externalChange();
    expect(reloads()).toBe(0);
    expect(statuses.at(-1)).toEqual({ kind: "conflict" });
  });

  it("reports a conflict when a write is rejected as stale, and overwrite forces the newest text", async () => {
    const { queue, writes, statuses } = setup();
    queue.changed("mine");
    writes[0]!.done.reject(new DrawingConflictError());
    await tick();
    expect(statuses.at(-1)).toEqual({ kind: "conflict" });
    queue.changed("mine-2");
    expect(writes).toHaveLength(1);
    queue.resolveConflict("overwrite");
    expect(writes[1]).toMatchObject({ text: "mine-2", force: true });
  });

  it("reload after a conflict discards local edits and re-reads", async () => {
    const { queue, writes, modified, reloads } = setup();
    queue.changed("mine");
    writes[0]!.done.reject(new DrawingConflictError());
    await tick();
    queue.resolveConflict("reload");
    expect(reloads()).toBe(1);
    expect(modified.at(-1)).toBe(false);
  });

  it("reports a deleted file and stops writing", async () => {
    const { queue, writes, statuses } = setup();
    queue.changed("a");
    writes[0]!.done.reject(new DrawingDeletedError());
    await tick();
    expect(statuses.at(-1)).toEqual({ kind: "deleted" });
    queue.changed("b");
    expect(writes).toHaveLength(1);
  });

  it("shows other write failures and retries on the next edit", async () => {
    const { queue, writes, statuses } = setup();
    queue.changed("a");
    writes[0]!.done.reject(new Error("disk full"));
    await tick();
    expect(statuses.at(-1)).toEqual({ kind: "error", message: "disk full" });
    queue.changed("b");
    expect(writes[1]?.text).toBe("b");
  });
});
