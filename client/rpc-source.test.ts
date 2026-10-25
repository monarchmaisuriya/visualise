import { afterEach, describe, expect, it, vi } from "vitest";
import { createRpcSource, type DrawingRpc } from "./rpc-source";
import { DrawingConflictError, DrawingDeletedError } from "./save-queue";

afterEach(() => vi.useRealTimers());

function fakeRpc(initialVersion = "v1") {
  const disk = { version: initialVersion, exists: true };
  const rpc: DrawingRpc = {
    read: vi.fn(async () => ({ text: "doc", version: disk.version })),
    stat: vi.fn(async () => ({ exists: disk.exists, version: disk.exists ? disk.version : null })),
    write: vi.fn(async ({ baseVersion, force }) => {
      if (!disk.exists) return { status: "deleted" as const };
      if (!force && baseVersion !== disk.version) return { status: "conflict" as const, version: disk.version };
      disk.version = `${disk.version}+`;
      return { status: "ok" as const, version: disk.version };
    }),
  };
  return { rpc, disk };
}

describe("RPC drawing source", () => {
  it("writes against the version it last read and maps refusals to errors", async () => {
    const { rpc, disk } = fakeRpc();
    const source = createRpcSource(rpc, "a.tldr");
    await source.read();
    await source.write("x", false);
    disk.version = "someone-else";
    await expect(source.write("y", false)).rejects.toBeInstanceOf(DrawingConflictError);
    disk.exists = false;
    await expect(source.write("y", true)).rejects.toBeInstanceOf(DrawingDeletedError);
  });

  it("reports outside changes and deletion, but not its own writes", async () => {
    vi.useFakeTimers();
    const { rpc, disk } = fakeRpc();
    const source = createRpcSource(rpc, "a.tldr");
    await source.read();
    const events: string[] = [];
    const stop = source.watch((event) => events.push(event));
    await source.write("x", false);
    await vi.advanceTimersByTimeAsync(1100);
    expect(events).toEqual([]);
    disk.version = "outside";
    await vi.advanceTimersByTimeAsync(1100);
    expect(events).toEqual(["changed"]);
    disk.exists = false;
    await vi.advanceTimersByTimeAsync(1100);
    expect(events).toEqual(["changed", "deleted"]);
    stop();
  });

  it("ignores a status check that started before its own write finished", async () => {
    vi.useFakeTimers();
    const { rpc } = fakeRpc();
    let releaseStat!: () => void;
    const source = createRpcSource(rpc, "a.tldr");
    await source.read();
    vi.mocked(rpc.stat).mockImplementationOnce(
      () => new Promise((resolve) => (releaseStat = () => resolve({ exists: true, version: "v1" }))),
    );
    const events: string[] = [];
    source.watch((event) => events.push(event));
    await vi.advanceTimersByTimeAsync(1000);
    await source.write("x", false);
    releaseStat();
    await vi.advanceTimersByTimeAsync(0);
    expect(events).toEqual([]);
  });
});
