import { mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDrawingPath, toWorkspaceRelative } from "./paths";
import { useTempDir } from "./test-temp-dir";

const tempDir = useTempDir();

describe("resolveDrawingPath", () => {
  it("resolves a nested .tldr path inside the workspace, even before it exists", async () => {
    const root = await tempDir();
    const resolved = await resolveDrawingPath(root, "drawings/a.tldr");
    expect(resolved.endsWith(path.join("drawings", "a.tldr"))).toBe(true);
  });

  it.each([
    ["../x.tldr", "Path escapes the workspace"],
    ["a/../../x.tldr", "Path escapes the workspace"],
    ["/etc/x.tldr", "Path must be relative to the workspace"],
    ["notes.md", "Only .tldr files are supported"],
    ["drawings/.hidden.tldr", "Only .tldr files are supported"],
    ["", "Invalid path"],
  ])("rejects %j", async (candidate, message) => {
    const root = await tempDir();
    await expect(resolveDrawingPath(root, candidate)).rejects.toThrow(message);
  });

  it("rejects a symlinked folder that leads outside the workspace", async () => {
    const root = await tempDir();
    const outside = await tempDir();
    await symlink(outside, path.join(root, "link"));
    await expect(resolveDrawingPath(root, "link/x.tldr")).rejects.toThrow("Path escapes the workspace");
  });
});

describe("toWorkspaceRelative", () => {
  it("turns an absolute path inside the workspace into a relative one", async () => {
    const root = await tempDir();
    await mkdir(path.join(root, "d"));
    await writeFile(path.join(root, "d", "a.tldr"), "{}");
    expect(await toWorkspaceRelative(root, path.join(root, "d", "a.tldr"))).toBe("d/a.tldr");
  });

  it("rejects an absolute path outside the workspace", async () => {
    const root = await tempDir();
    const outside = await tempDir();
    await writeFile(path.join(outside, "a.tldr"), "{}");
    await expect(toWorkspaceRelative(root, path.join(outside, "a.tldr"))).rejects.toThrow("Path escapes the workspace");
  });
});
