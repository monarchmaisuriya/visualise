import { type PluginWorkspacePanelProps, useRpc, useTabState } from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { z } from "zod";
import { createDrawingRpc, listDrawingsRpc, readDrawingRpc, statDrawingRpc, writeDrawingRpc } from "../shared/rpc";
import { DrawingEditor } from "./drawing-editor";
import { takeOpenRequest } from "./open-requests";
import { createRpcSource } from "./rpc-source";
import { waitUntil } from "./wait-until";

const SAVE_WAIT_MS = 2000;
const selectionSchema = z.string().nullable();

/** The Visualise tab: lists the workspace's `.tldr` drawings, creates new ones, and edits one in place. */
export function DrawingsPanel({ workspaceId, theme, layout, navigation, tab, revision }: PluginWorkspacePanelProps) {
  const [selected, setSelected] = useTabState(tab, selectionSchema, null);
  const [notice, setNotice] = useState<string | null>(null);
  const modifiedRef = useRef(false);
  const rpc = {
    list: useRpc(listDrawingsRpc),
    create: useRpc(createDrawingRpc),
    read: useRpc(readDrawingRpc),
    stat: useRpc(statDrawingRpc),
    write: useRpc(writeDrawingRpc),
  };
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;

  useEffect(() => {
    const requested = takeOpenRequest(workspaceId);
    if (requested) void switchTo(requested);
    // `revision` changes when the Command Center reopens this panel.
  }, [workspaceId, revision]);

  const files = useQuery({
    queryKey: ["visualise", "drawings", workspaceId],
    queryFn: () => rpcRef.current.list({ workspaceId }),
    enabled: selected === null,
    refetchInterval: 5000,
  });

  const source = useMemo(
    () =>
      selected === null
        ? null
        : createRpcSource(
            {
              read: () => rpcRef.current.read({ workspaceId, path: selected }),
              stat: () => rpcRef.current.stat({ workspaceId, path: selected }),
              write: (input) => rpcRef.current.write({ workspaceId, path: selected, ...input }),
            },
            selected,
          ),
    [workspaceId, selected],
  );

  /** Leave the current drawing only once its edits are on disk, so switching never drops them. */
  async function switchTo(next: string | null) {
    if (!(await waitUntil(() => !modifiedRef.current, SAVE_WAIT_MS))) {
      setNotice("This drawing has unsaved edits; resolve them before switching.");
      return;
    }
    setNotice(null);
    modifiedRef.current = false;
    tab.setModified(false);
    setSelected(next);
  }

  async function createNew() {
    try {
      const created = await rpcRef.current.create({ workspaceId });
      await switchTo(created.path);
    } catch (error) {
      setNotice(`Could not create a drawing: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const pad = layout.compact ? 12 : 16;
  const button = { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: theme.colors.border };
  const text = { color: theme.colors.foreground };
  const muted = { color: theme.colors.foregroundMuted };

  return (
    <View style={{ flex: 1, minHeight: 0, backgroundColor: theme.colors.surface0 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: pad, paddingVertical: 6 }}>
        {selected !== null ? (
          <>
            <Pressable accessibilityRole="button" accessibilityLabel="Back to all drawings" style={button} onPress={() => void switchTo(null)}>
              <Text style={text}>All drawings</Text>
            </Pressable>
            <Text style={muted} numberOfLines={1}>
              {selected}
            </Text>
          </>
        ) : (
          <Text style={[text, { fontSize: 16, fontWeight: "600" }]}>Drawings</Text>
        )}
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" style={button} onPress={() => void createNew()}>
          <Text style={text}>New drawing</Text>
        </Pressable>
      </View>
      {notice ? <Text style={{ color: theme.colors.statusWarning, paddingHorizontal: pad }}>{notice}</Text> : null}
      {source ? (
        <DrawingEditor
          key={selected ?? ""}
          source={source}
          theme={theme}
          workspaceId={workspaceId}
          navigation={navigation}
          setModified={(modified) => {
            modifiedRef.current = modified;
            tab.setModified(modified);
          }}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: pad, gap: 6 }}>
          {files.status === "pending" ? <Text style={muted}>Looking for .tldr files…</Text> : null}
          {files.status === "error" ? <Text style={{ color: theme.colors.statusDanger }}>{files.error.message}</Text> : null}
          {files.data && files.data.files.length === 0 ? (
            <Text style={muted}>No .tldr drawings in this workspace yet. Press New drawing to start one.</Text>
          ) : null}
          {files.data?.files.map((file) => (
            <Pressable
              key={file.path}
              accessibilityRole="button"
              accessibilityLabel={`Open ${file.path}`}
              onPress={() => void switchTo(file.path)}
              style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 6, backgroundColor: theme.colors.surface1 }}
            >
              <Text style={text}>{file.path}</Text>
              <Text style={[muted, { fontSize: 12 }]}>
                {new Date(file.mtimeMs).toLocaleString()} · {Math.max(1, Math.round(file.size / 1024))} KB
              </Text>
            </Pressable>
          ))}
          {files.data?.truncated ? <Text style={muted}>Showing the first 500 drawings.</Text> : null}
        </ScrollView>
      )}
    </View>
  );
}
