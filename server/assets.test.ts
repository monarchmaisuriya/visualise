import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { prepareRuntime, runtimeChunk } from "./assets";

describe("runtime chunks", () => {
  it("round-trips the runtime HTML through gzip chunks", () => {
    const html = `<html>${"x".repeat(2_000_000)}${Math.random()}</html>`;
    const runtime = prepareRuntime(html);
    const parts = runtime.chunks.map((_, index) => Buffer.from(runtimeChunk(runtime, runtime.hash, index).base64, "base64"));
    expect(gunzipSync(Buffer.concat(parts)).toString("utf8")).toBe(html);
  });

  it("refuses a stale hash", () => {
    const runtime = prepareRuntime("<html></html>");
    expect(() => runtimeChunk(runtime, "stale", 0)).toThrow("The editor was updated");
  });
});
