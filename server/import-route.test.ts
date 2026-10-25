import { afterEach, describe, expect, it } from "vitest";
import { createImportServer, IMPORT_TTL_MS, type ImportServer, tldrawImportPageUrl } from "./import-route";

let server: ImportServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

const TLDRAW = "https://www.tldraw.com";
const body = Buffer.from('{"tldrawFileFormatVersion":1}');

function get(url: string, origin?: string, method = "GET") {
  return fetch(url, { method, headers: origin ? { Origin: origin } : {} });
}

describe("one-time import route", () => {
  it("serves the drawing once to tldraw.com with CORS, then 404s", async () => {
    server = createImportServer();
    const { fileUrl } = await server.offer(body);
    const first = await get(fileUrl, TLDRAW);
    expect(first.status).toBe(200);
    expect(first.headers.get("access-control-allow-origin")).toBe(TLDRAW);
    expect(first.headers.get("content-type")).toBe("application/vnd.tldraw+json");
    expect(await first.text()).toBe(body.toString());
    expect((await get(fileUrl, TLDRAW)).status).toBe(404);
  });

  it("answers the private-network preflight without using up the token", async () => {
    server = createImportServer();
    const { fileUrl } = await server.offer(body);
    const preflight = await get(fileUrl, TLDRAW, "OPTIONS");
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-private-network")).toBe("true");
    expect((await get(fileUrl, TLDRAW)).status).toBe(200);
  });

  it("refuses other origins and requests without an origin", async () => {
    server = createImportServer();
    const { fileUrl } = await server.offer(body);
    expect((await get(fileUrl, "https://evil.example")).status).toBe(404);
    expect((await get(fileUrl)).status).toBe(404);
    expect((await get(fileUrl, TLDRAW)).status).toBe(200);
  });

  it("refuses an expired token", async () => {
    let now = 1_000;
    server = createImportServer(() => now);
    const { fileUrl } = await server.offer(body);
    now += IMPORT_TTL_MS;
    expect((await get(fileUrl, TLDRAW)).status).toBe(404);
  });

  it("refuses unknown paths and tokens", async () => {
    server = createImportServer();
    const { fileUrl } = await server.offer(body);
    const base = new URL(fileUrl).origin;
    expect((await get(`${base}/`, TLDRAW)).status).toBe(404);
    expect((await get(`${base}/import/${"a".repeat(43)}.tldr`, TLDRAW)).status).toBe(404);
  });

  it("listens on loopback only and builds tldraw.com's import URL", async () => {
    server = createImportServer();
    const { fileUrl } = await server.offer(body);
    expect(new URL(fileUrl).hostname).toBe("127.0.0.1");
    expect(tldrawImportPageUrl(fileUrl)).toBe(`https://www.tldraw.com/import?url=${encodeURIComponent(fileUrl)}`);
  });
});
