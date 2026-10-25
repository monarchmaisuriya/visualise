import type { PluginTheme } from "@getpaseo/plugin";
import { type PluginFilePanelProps, useRpc, useSettings } from "@getpaseo/plugin/client";
import { ExternalLink } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { prepareImportRpc, runtimeChunkRpc, runtimeInfoRpc } from "../shared/rpc";
import { licenseSettings } from "../shared/settings";
import type { DrawingSource } from "./drawing-source";
import { SaveQueue, type SaveStatus } from "./save-queue";
import { waitUntil } from "./wait-until";
import { type DrawingFrame, editorSupported, loadRuntimeHtml, mountDrawingFrame } from "./web";

const SAVE_WAIT_MS = 2000;
const LICENSE_URL = "https://tldraw.dev/pricing";

type Navigation = PluginFilePanelProps["navigation"];

function isDark(color: string): boolean {
  const hex = /^#([0-9a-f]{6})/i.exec(color)?.[1];
  if (!hex) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (0.299 * r! + 0.587 * g! + 0.114 * b!) / 255 < 0.5;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

interface Props {
  source: DrawingSource;
  theme: PluginTheme;
  workspaceId: string;
  navigation: Navigation;
  /** Called with the editor's unsaved state; the panel forwards it to its tab. */
  setModified(modified: boolean): void;
}

/**
 * One open drawing. The file is the source of truth: the iframe reports edits, the save queue
 * writes them through `source`, and outside changes reload the editor or raise a conflict.
 */
export function DrawingEditor({ source, theme, workspaceId, navigation, setModified }: Props) {
  const hostRef = useRef<unknown>(null);
  const frameRef = useRef<DrawingFrame | null>(null);
  const queueRef = useRef<SaveQueue | null>(null);
  const modifiedRef = useRef(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: "clean" });
  const [production, setProduction] = useState(false);
  const [loading, setLoading] = useState(true);
  const settings = useSettings(licenseSettings);
  const settingsLoading = settings.status === "loading";
  const licenseKey = settings.status === "ready" ? settings.values.licenseKey : "";
  const dark = isDark(theme.colors.surface0);
  const darkRef = useRef(dark);
  darkRef.current = dark;
  const setModifiedRef = useRef(setModified);
  setModifiedRef.current = setModified;

  const info = useRpc(runtimeInfoRpc);
  const chunk = useRpc(runtimeChunkRpc);
  const rpcRef = useRef({ info, chunk });
  rpcRef.current = { info, chunk };

  useEffect(() => {
    if (!editorSupported || settingsLoading) return;
    let disposed = false;
    let unwatch: (() => void) | null = null;
    setLoading(true);
    setLoadError(null);
    setRuntimeError(null);
    setSaveStatus({ kind: "clean" });

    const queue = new SaveQueue({
      write: (text, force) => source.write(text, force),
      setModified(modified) {
        modifiedRef.current = modified;
        setModifiedRef.current(modified);
      },
      onStatus: (status) => !disposed && setSaveStatus(status),
      reload() {
        source
          .read()
          .then((text) => frameRef.current?.send({ type: "replace", text }))
          .catch((error) => !disposed && setRuntimeError(`Could not reload the drawing: ${message(error)}`));
      },
    });
    queueRef.current = queue;

    (async () => {
      try {
        const [text, html] = await Promise.all([
          source.read(),
          loadRuntimeHtml({
            info: () => rpcRef.current.info({}),
            chunk: async (hash, index) => (await rpcRef.current.chunk({ hash, index })).base64,
          }),
        ]);
        if (disposed || !hostRef.current) return;
        frameRef.current = mountDrawingFrame(hostRef.current, html, (event) => {
          switch (event.type) {
            case "ready":
              setProduction(event.production);
              frameRef.current?.send({ type: "load", text, theme: darkRef.current ? "dark" : "light", licenseKey });
              setLoading(false);
              break;
            case "dirty":
              queue.markDirty();
              break;
            case "changed":
              queue.changed(event.text);
              break;
            case "error":
              setRuntimeError(event.message);
              break;
          }
        });
        unwatch = source.watch((change) => (change === "deleted" ? queue.deleted() : queue.externalChange()));
      } catch (error) {
        if (!disposed) {
          setLoadError(message(error));
          setLoading(false);
        }
      }
    })();

    return () => {
      disposed = true;
      unwatch?.();
      frameRef.current?.destroy();
      frameRef.current = null;
      queueRef.current = null;
    };
  }, [source, settingsLoading, licenseKey]);

  useEffect(() => {
    frameRef.current?.send({ type: "theme", theme: dark ? "dark" : "light" });
  }, [dark]);

  const styles = useMemo(
    () => ({
      bar: { flexDirection: "row" as const, alignItems: "center" as const, flexWrap: "wrap" as const, gap: 8, paddingHorizontal: 12, paddingVertical: 4 },
      muted: { color: theme.colors.foregroundMuted },
      danger: { color: theme.colors.statusDanger },
      warning: { color: theme.colors.statusWarning },
      button: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: theme.colors.border },
      buttonText: { color: theme.colors.foreground },
    }),
    [theme],
  );

  if (!editorSupported) {
    return (
      <View style={styles.bar}>
        <Text style={styles.muted}>The tldraw editor runs in the Paseo desktop and web apps.</Text>
      </View>
    );
  }

  const queue = queueRef.current;
  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <View style={styles.bar}>
        {loading ? <Text style={styles.muted}>Loading drawing…</Text> : null}
        {loadError ? <Text style={styles.danger}>{loadError}</Text> : null}
        {runtimeError ? <Text style={styles.danger}>{runtimeError}</Text> : null}
        {settings.status === "error" ? <Text style={styles.danger}>Could not read the licence key setting: {settings.error}</Text> : null}
        {production && !licenseKey && !loading ? (
          <Text style={styles.warning}>
            tldraw needs a licence key for daily use; without one the canvas goes blank after a few seconds. Add a key in
            Settings, Plugins, Visualise. <ExternalLink href={LICENSE_URL}>Get a key</ExternalLink>
          </Text>
        ) : null}
        {saveStatus.kind === "conflict" ? (
          <>
            <Text style={styles.warning}>This drawing changed on disk while you had unsaved edits.</Text>
            <Pressable accessibilityRole="button" style={styles.button} onPress={() => queue?.resolveConflict("reload")}>
              <Text style={styles.buttonText}>Reload (discard mine)</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.button} onPress={() => queue?.resolveConflict("overwrite")}>
              <Text style={styles.buttonText}>Overwrite</Text>
            </Pressable>
          </>
        ) : null}
        {saveStatus.kind === "deleted" ? <Text style={styles.danger}>This drawing was deleted; edits are no longer saved.</Text> : null}
        {saveStatus.kind === "error" ? <Text style={styles.danger}>Could not save: {saveStatus.message}</Text> : null}
        <View style={{ flex: 1 }} />
        {navigation?.openBrowser ? (
          <SendToTldraw
            source={source}
            workspaceId={workspaceId}
            openBrowser={navigation.openBrowser}
            isSaved={() => !modifiedRef.current}
            theme={theme}
          />
        ) : null}
      </View>
      <View ref={hostRef as never} style={{ flex: 1, minHeight: 0 }} />
    </View>
  );
}

interface SendProps {
  source: DrawingSource;
  workspaceId: string;
  openBrowser: NonNullable<NonNullable<Navigation>["openBrowser"]>;
  isSaved(): boolean;
  theme: PluginTheme;
}

type SendState = { kind: "idle" } | { kind: "confirm" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

/** Uploads a one-way copy of the saved drawing to the user's tldraw.com account, after a confirmation. */
function SendToTldraw({ source, workspaceId, openBrowser, isSaved, theme }: SendProps) {
  const [state, setState] = useState<SendState>({ kind: "idle" });
  const prepareImport = useRpc(prepareImportRpc);
  const name = source.importPath.split(/[\\/]/).pop() ?? source.importPath;
  const button = { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: theme.colors.border };
  const text = { color: theme.colors.foreground };
  const muted = { color: theme.colors.foregroundMuted };

  async function send() {
    setState({ kind: "sending" });
    try {
      if (!(await waitUntil(isSaved, SAVE_WAIT_MS))) throw new Error("The drawing is still saving; try again in a moment");
      const { importUrl } = await prepareImport({ workspaceId, path: source.importPath });
      openBrowser({ url: importUrl, workspaceId });
      setState({ kind: "sent" });
    } catch (error) {
      setState({ kind: "error", message: message(error) });
    }
  }

  switch (state.kind) {
    case "confirm":
      return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Text style={muted}>Upload a copy of {name} to your tldraw.com account? Edits there will not come back here.</Text>
          <Pressable accessibilityRole="button" style={button} onPress={() => void send()}>
            <Text style={text}>Upload copy</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={button} onPress={() => setState({ kind: "idle" })}>
            <Text style={text}>Cancel</Text>
          </Pressable>
        </View>
      );
    case "sending":
      return <Text style={muted}>Preparing the copy…</Text>;
    default:
      return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {state.kind === "sent" ? <Text style={muted}>Opened tldraw.com; sign in there within 10 minutes to save the copy.</Text> : null}
          {state.kind === "error" ? <Text style={{ color: theme.colors.statusDanger }}>{state.message}</Text> : null}
          <Pressable accessibilityRole="button" style={button} onPress={() => setState({ kind: "confirm" })}>
            <Text style={text}>Send to tldraw.com</Text>
          </Pressable>
        </View>
      );
  }
}
