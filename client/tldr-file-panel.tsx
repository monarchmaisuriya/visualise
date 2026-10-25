import type { PluginFilePanelProps } from "@getpaseo/plugin/client";
import { useMemo } from "react";
import { View } from "react-native";
import { DrawingEditor } from "./drawing-editor";
import { createFileSource } from "./file-source";

/** A `.tldr` file tab. Paseo's file handle owns reads, writes and conflict checks. */
export function TldrFilePanel({ file, theme, workspaceId, navigation, tab }: PluginFilePanelProps) {
  const source = useMemo(() => createFileSource(file), [file]);
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
      <DrawingEditor
        source={source}
        theme={theme}
        workspaceId={workspaceId}
        navigation={navigation}
        setModified={(modified) => tab.setModified(modified)}
      />
    </View>
  );
}
