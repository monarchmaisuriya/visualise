import { randomBytes } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";

/** tldraw.com's import page fetches from this origin (the bare domain redirects to it). */
const ALLOWED_ORIGINS = new Set(["https://www.tldraw.com", "https://tldraw.com"]);
// Long enough to sign in to tldraw.com first: its import page fetches only after sign-in.
export const IMPORT_TTL_MS = 600_000;
const TOKEN_PATH = /^\/import\/([A-Za-z0-9_-]{43})\.tldr$/;

export interface ImportOffer {
  /** Loopback URL that serves the drawing once, to tldraw.com only. */
  fileUrl: string;
  expiresInSeconds: number;
}

export interface ImportServer {
  offer(bytes: Buffer): Promise<ImportOffer>;
  close(): Promise<void>;
}

/**
 * A loopback HTTP server, started on first use, that hands one drawing to tldraw.com's
 * `/import?url=` page. Each offer gets a 256-bit token that works once and expires after
 * IMPORT_TTL_MS. Only requests carrying an allowed Origin are answered; everything else is 404.
 * It answers Chromium's preflight for public-to-local requests without using up the token.
 */
export function createImportServer(now: () => number = Date.now): ImportServer {
  const offers = new Map<string, { bytes: Buffer; expiresAt: number }>();
  let listening: Promise<{ server: http.Server; port: number }> | null = null;

  function liveOffer(token: string) {
    const offer = offers.get(token);
    if (!offer) return null;
    if (offer.expiresAt <= now()) {
      offers.delete(token);
      return null;
    }
    return offer;
  }

  function handle(request: http.IncomingMessage, response: http.ServerResponse) {
    const token = TOKEN_PATH.exec(new URL(request.url ?? "/", "http://127.0.0.1").pathname)?.[1];
    const origin = request.headers.origin;
    const offer = token ? liveOffer(token) : null;
    if (!token || !offer || !origin || !ALLOWED_ORIGINS.has(origin)) {
      response.writeHead(404).end();
      return;
    }
    const cors = { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
    if (request.method === "OPTIONS") {
      response
        .writeHead(204, {
          ...cors,
          "Access-Control-Allow-Methods": "GET",
          "Access-Control-Allow-Private-Network": "true",
          "Access-Control-Max-Age": "60",
        })
        .end();
      return;
    }
    if (request.method !== "GET") {
      response.writeHead(404).end();
      return;
    }
    offers.delete(token);
    response
      .writeHead(200, {
        ...cors,
        "Content-Type": "application/vnd.tldraw+json",
        "Cache-Control": "no-store",
        "Content-Length": String(offer.bytes.length),
      })
      .end(offer.bytes);
  }

  function start() {
    listening ??= new Promise((resolve, reject) => {
      const server = http.createServer(handle);
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve({ server, port: (server.address() as AddressInfo).port }));
    });
    return listening;
  }

  return {
    async offer(bytes) {
      for (const token of [...offers.keys()]) liveOffer(token);
      const { port } = await start();
      const token = randomBytes(32).toString("base64url");
      offers.set(token, { bytes, expiresAt: now() + IMPORT_TTL_MS });
      return { fileUrl: `http://127.0.0.1:${port}/import/${token}.tldr`, expiresInSeconds: IMPORT_TTL_MS / 1000 };
    },
    async close() {
      offers.clear();
      const current = listening;
      listening = null;
      if (!current) return;
      const { server } = await current;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** tldraw.com's page that pulls a `.tldr` from a URL into the signed-in account. */
export function tldrawImportPageUrl(fileUrl: string): string {
  return `https://www.tldraw.com/import?url=${encodeURIComponent(fileUrl)}`;
}
