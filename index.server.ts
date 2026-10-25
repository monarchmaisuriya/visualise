import type { PluginServerContext } from "@getpaseo/plugin/server";
import { type PreparedRuntime, prepareRuntime, runtimeChunk } from "./server/assets";
import {
  handleCreate,
  handleList,
  handlePrepareImport,
  handleRead,
  handleStat,
  handleWrite,
} from "./server/handlers";
import { createImportServer } from "./server/import-route";
import { runtimeHtml } from "./server/runtime.gen";
import {
  createDrawingRpc,
  listDrawingsRpc,
  prepareImportRpc,
  readDrawingRpc,
  runtimeChunkRpc,
  runtimeInfoRpc,
  statDrawingRpc,
  writeDrawingRpc,
} from "./shared/rpc";
import { licenseSettings } from "./shared/settings";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(licenseSettings);

  // Gzipped on first use, not at every plugin start.
  let prepared: PreparedRuntime | null = null;
  const runtime = () => (prepared ??= prepareRuntime(runtimeHtml));
  server.handle(runtimeInfoRpc, () => ({ hash: runtime().hash, chunks: runtime().chunks.length, bytes: runtime().bytes }));
  server.handle(runtimeChunkRpc, ({ hash, index }) => runtimeChunk(runtime(), hash, index));

  server.handle(listDrawingsRpc, handleList);
  server.handle(statDrawingRpc, handleStat);
  server.handle(readDrawingRpc, handleRead);
  server.handle(writeDrawingRpc, handleWrite);
  server.handle(createDrawingRpc, handleCreate);

  const imports = createImportServer();
  server.handle(prepareImportRpc, (input, context) => handlePrepareImport(imports, input, context));

  return () => imports.close();
}
