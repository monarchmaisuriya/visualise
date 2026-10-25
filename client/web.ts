// Adapted from lerenn/paseo-excalidraw client/web.ts (MIT, Copyright (c) 2026 Louis Fradin).
import { Platform } from "react-native";
import { fromRuntimeSchema, type FromRuntime, type ToRuntime } from "../shared/runtime-protocol";

// This plugin typechecks without the DOM library. Declare only what this module uses.
interface FrameElement {
  style: Record<string, string>;
  srcdoc: string;
  title: string;
  setAttribute(name: string, value: string): void;
  remove(): void;
  contentWindow: { postMessage(message: unknown, targetOrigin: string): void } | null;
}
interface MessageEventLike {
  source: unknown;
  data: unknown;
}
declare const window: {
  addEventListener(type: "message", listener: (event: MessageEventLike) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEventLike) => void): void;
};
declare const document: { createElement(tag: "iframe"): FrameElement };
declare function atob(data: string): string;
declare class Blob {
  constructor(parts: unknown[]);
  stream(): { pipeThrough(transform: unknown): unknown };
}
declare class DecompressionStream {
  constructor(format: "gzip");
}
declare class Response {
  constructor(body: unknown);
  text(): Promise<string>;
}

/** The editor needs a browser document; native apps show a notice instead. */
export const editorSupported = Platform.OS === "web";

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// The runtime is ~4 MB; fetch it once per page load per content hash.
let runtimeCache: { hash: string; html: Promise<string> } | null = null;

export interface RuntimeSource {
  info(): Promise<{ hash: string; chunks: number }>;
  chunk(hash: string, index: number): Promise<string>;
}

/** The tldraw iframe document, gunzipped. Cached by content hash. */
export async function loadRuntimeHtml(source: RuntimeSource): Promise<string> {
  if (!editorSupported) throw new Error("The tldraw editor runs in the Paseo desktop and web apps only");
  const { hash, chunks } = await source.info();
  if (runtimeCache?.hash === hash) return runtimeCache.html;
  const html = (async () => {
    const parts = await Promise.all(
      Array.from({ length: chunks }, async (_, index) => base64ToBytes(await source.chunk(hash, index))),
    );
    const stream = new Blob(parts).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).text();
  })();
  runtimeCache = { hash, html };
  html.catch(() => {
    if (runtimeCache?.html === html) runtimeCache = null;
  });
  return html;
}

export interface DrawingFrame {
  send(message: ToRuntime): void;
  destroy(): void;
}

/**
 * Mount the tldraw runtime in a sandboxed iframe inside `host` (the DOM node behind a React Native
 * Web View). No `allow-same-origin`: the iframe has an opaque origin, its own React and CSS, no
 * storage and, by its CSP, no network. Only messages from that iframe's window, matching the
 * protocol schema, reach `onMessage`.
 */
export function mountDrawingFrame(host: unknown, html: string, onMessage: (message: FromRuntime) => void): DrawingFrame {
  if (!editorSupported) throw new Error("The tldraw editor runs in the Paseo desktop and web apps only");
  const frame = document.createElement("iframe");
  frame.title = "tldraw";
  frame.setAttribute("sandbox", "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals");
  frame.setAttribute("allow", "clipboard-read; clipboard-write");
  Object.assign(frame.style, { width: "100%", height: "100%", border: "0", display: "block", background: "transparent" });
  frame.srcdoc = html;
  const listener = (event: MessageEventLike) => {
    if (event.source !== frame.contentWindow) return;
    const parsed = fromRuntimeSchema.safeParse(event.data);
    if (parsed.success) onMessage(parsed.data);
  };
  window.addEventListener("message", listener);
  (host as { appendChild(child: FrameElement): void }).appendChild(frame);
  return {
    send(message) {
      // The frame's origin is opaque, so "*" is the only target; the payload is the user's own drawing.
      frame.contentWindow?.postMessage(message, "*");
    },
    destroy() {
      window.removeEventListener("message", listener);
      frame.remove();
    },
  };
}
