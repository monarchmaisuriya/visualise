import type { PluginClientContext } from "@getpaseo/plugin/client";
import { DrawingsPanel } from "./client/drawings-panel";
import { requestOpen } from "./client/open-requests";
import { LicenseSettingsScreen } from "./client/settings-screen";
import { TldrFilePanel } from "./client/tldr-file-panel";
import { createDrawingRpc } from "./shared/rpc";

export default function contribute(client: PluginClientContext) {
  const removers = [
    client.addFilePanel({ id: "tldr", title: "tldraw", icon: "PenTool", files: { extensions: ["tldr"] }, Component: TldrFilePanel }),
    client.addWorkspacePanel({
      id: "drawings",
      title: "Visualise",
      icon: "PenTool",
      locations: ["workspace", "explorer"],
      Component: DrawingsPanel,
    }),
    client.addSettingsScreen({ id: "license", title: "Visualise", icon: "PenTool", Component: LicenseSettingsScreen }),
    client.addCommandCenterItem({
      id: "open-drawings",
      title: "Open tldraw drawings",
      icon: "PenTool",
      keywords: ["tldraw", "visualise", "drawing", "whiteboard", "draw"],
      context: "workspace",
      onSelect({ openPanel }) {
        openPanel("drawings");
      },
    }),
    client.addCommandCenterItem({
      id: "new-drawing",
      title: "New tldraw drawing",
      icon: "PenTool",
      keywords: ["tldraw", "visualise", "drawing", "whiteboard", "new"],
      context: "workspace",
      async onSelect({ workspace, rpc, openPanel }) {
        const created = await rpc(createDrawingRpc, { workspaceId: workspace.id });
        requestOpen(workspace.id, created.path);
        openPanel("drawings");
      },
    }),
  ];
  return () => {
    for (const remove of removers) remove();
  };
}
