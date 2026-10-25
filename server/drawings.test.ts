import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDrawing, listDrawings, readDrawing, statDrawing, versionOf, writeDrawing } from "./drawings";
import { useTempDir } from "./test-temp-dir";

const tempDir = useTempDir();
const doc = (marker: string) => JSON.stringify({ tldrawFileFormatVersion: 1, schema: {}, records: [{ id: marker }] });

describe("drawing files", () => {
  it("creates numbered drawings with a valid empty tldraw document", async () => {
    const root = await tempDir();
    const first = await createDrawing(root);
    const second = await createDrawing(root);
    expect([first.path, second.path]).toEqual(["drawings/untitled-1.tldr", "drawings/untitled-2.tldr"]);
    const text = await readFile(path.join(root, first.path), "utf8");
    expect(JSON.parse(text)).toMatchObject({ tldrawFileFormatVersion: 1, records: [] });
    expect(first.version).toBe(versionOf(text));
  });

  it("writes when the base version matches and reports a conflict when it does not", async () => {
    const root = await tempDir();
    const { path: file, version } = await createDrawing(root);
    const ok = await writeDrawing(root, file, doc("a"), version, false);
    expect(ok.status).toBe("ok");
    const stale = await writeDrawing(root, file, doc("b"), version, false);
    expect(stale.status).toBe("conflict");
    expect((await readDrawing(root, file)).text).toBe(doc("a"));
  });

  it("overwrites a newer file when forced", async () => {
    const root = await tempDir();
    const { path: file, version } = await createDrawing(root);
    await writeDrawing(root, file, doc("a"), version, false);
    const forced = await writeDrawing(root, file, doc("b"), version, true);
    expect(forced.status).toBe("ok");
    expect((await readDrawing(root, file)).text).toBe(doc("b"));
  });

  it("never recreates a deleted file", async () => {
    const root = await tempDir();
    const { path: file, version } = await createDrawing(root);
    await rm(path.join(root, file));
    expect(await writeDrawing(root, file, doc("a"), version, true)).toEqual({ status: "deleted" });
    expect(await statDrawing(root, file)).toEqual({ exists: false, version: null });
  });

  it("rejects content that is not a tldraw file", async () => {
    const root = await tempDir();
    const { path: file, version } = await createDrawing(root);
    await expect(writeDrawing(root, file, "{}", version, false)).rejects.toThrow("Content is not a tldraw file");
    await expect(writeDrawing(root, file, "nope", version, false)).rejects.toThrow("Content is not valid JSON");
  });

  it("lists .tldr files, skipping hidden and dependency folders", async () => {
    const root = await tempDir();
    await createDrawing(root);
    await writeFile(path.join(root, "top.tldr"), doc("t"));
    await writeFile(path.join(root, "notes.md"), "x");
    await import("node:fs/promises").then((fs) => fs.mkdir(path.join(root, "node_modules"), { recursive: true }));
    await writeFile(path.join(root, "node_modules", "dep.tldr"), doc("d"));
    const listed = await listDrawings(root);
    expect(listed.files.map((f) => f.path).sort()).toEqual(["drawings/untitled-1.tldr", "top.tldr"]);
  });
});
