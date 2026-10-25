import { getAssetUrlsByImport } from "@tldraw/assets/imports";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { type Editor, parseTldrawJsonFile, serializeTldrawJson, Tldraw } from "tldraw";
import tldrawCss from "tldraw/tldraw.css";
import type { FromRuntime, ToRuntime } from "../shared/runtime-protocol";

// This file runs inside the sandboxed iframe and is bundled by scripts/build-runtime.mjs, outside
// the plugin compiler. The iframe has an opaque origin: no storage, no network, no parent access.

const CHANGE_DEBOUNCE_MS = 400;

const style = document.createElement("style");
// tldraw's menus inherit the page font and expect the host to set one; use the system UI font.
style.textContent = `${tldrawCss}\nhtml,body,#root{height:100%;margin:0;overflow:hidden;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}`;
document.head.appendChild(style);

const assetUrls = getAssetUrlsByImport();

function post(message: FromRuntime) {
  window.parent.postMessage(message, "*");
}

let editor: Editor | null = null;
let changeCount = 0;
let dirty = false;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Replace the document with `text` without counting it as a user edit. Empty text keeps a new document. */
function applyText(target: Editor, text: string) {
  if (text.trim() === "") return;
  const parsed = parseTldrawJsonFile({ json: text, schema: target.store.schema });
  if (!parsed.ok) throw new Error(`Not a readable tldraw file (${parsed.error.type})`);
  const snapshot = parsed.value.getStoreSnapshot();
  target.store.mergeRemoteChanges(() => {
    target.loadSnapshot(snapshot);
  });
}

async function emitChanged() {
  timer = null;
  if (!editor) return;
  const seen = changeCount;
  try {
    const text = await serializeTldrawJson(editor);
    post({ type: "changed", text });
    // Edits made while serializing are not in `text`; keep the panel's unsaved mark on.
    dirty = changeCount !== seen;
    if (dirty) {
      post({ type: "dirty" });
      timer = setTimeout(() => void emitChanged(), CHANGE_DEBOUNCE_MS);
    }
  } catch (error) {
    post({ type: "error", message: `Could not save the drawing: ${String(error)}` });
  }
}

function onMount(mounted: Editor, text: string, theme: "light" | "dark") {
  editor = mounted;
  mounted.user.updateUserPreferences({ colorScheme: theme, locale: "en" });
  try {
    applyText(mounted, text);
  } catch (error) {
    post({ type: "error", message: String(error instanceof Error ? error.message : error) });
  }
  if (mounted.getCurrentPageShapeIds().size > 0) mounted.zoomToFit({ animation: { duration: 0 } });
  mounted.store.listen(
    () => {
      changeCount++;
      if (!dirty) {
        dirty = true;
        post({ type: "dirty" });
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void emitChanged(), CHANGE_DEBOUNCE_MS);
    },
    { source: "user", scope: "document" },
  );
}

const root = createRoot(document.getElementById("root")!);
let loaded = false;

// Hand-rolled shape check mirroring shared/runtime-protocol.ts, to keep zod out of the iframe.
function asToRuntime(data: unknown): ToRuntime | null {
  if (typeof data !== "object" || data === null) return null;
  const m = data as Record<string, unknown>;
  const themeOk = m.theme === "light" || m.theme === "dark";
  switch (m.type) {
    case "load":
      return typeof m.text === "string" && themeOk && typeof m.licenseKey === "string" ? (m as ToRuntime) : null;
    case "replace":
      return typeof m.text === "string" ? (m as ToRuntime) : null;
    case "theme":
      return themeOk ? (m as ToRuntime) : null;
    default:
      return null;
  }
}

window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  const message = asToRuntime(event.data);
  if (!message) return;
  try {
    switch (message.type) {
      case "load": {
        if (loaded) return;
        loaded = true;
        const { text, theme, licenseKey } = message;
        console.info(`[visualise] licence key present: ${licenseKey ? "yes" : "no"}`);
        root.render(
          createElement(Tldraw, {
            licenseKey: licenseKey || undefined,
            assetUrls,
            onMount: (mounted: Editor) => onMount(mounted, text, theme),
          }),
        );
        break;
      }
      case "replace":
        if (editor) applyText(editor, message.text);
        break;
      case "theme":
        editor?.user.updateUserPreferences({ colorScheme: message.theme });
        break;
    }
  } catch (error) {
    post({ type: "error", message: String(error instanceof Error ? error.message : error) });
  }
});

window.addEventListener("error", (event) => post({ type: "error", message: String(event.message) }));
post({ type: "ready", production: process.env.NODE_ENV === "production" });
