import type { RpcInput } from "@getpaseo/plugin";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type {
  createDrawingRpc,
  listDrawingsRpc,
  prepareImportRpc,
  readDrawingRpc,
  statDrawingRpc,
  writeDrawingRpc,
} from "../shared/rpc";
import { createDrawing, listDrawings, readDrawing, readDrawingBytes, statDrawing, writeDrawing } from "./drawings";
import { type ImportServer, tldrawImportPageUrl } from "./import-route";
import { toWorkspaceRelative } from "./paths";
import { workspaceDirectory } from "./workspace";

export async function handleList({ workspaceId }: RpcInput<typeof listDrawingsRpc>, { paseo }: PluginHandlerContext) {
  return listDrawings(await workspaceDirectory(paseo, workspaceId));
}

export async function handleStat(input: RpcInput<typeof statDrawingRpc>, { paseo }: PluginHandlerContext) {
  return statDrawing(await workspaceDirectory(paseo, input.workspaceId), input.path);
}

export async function handleRead(input: RpcInput<typeof readDrawingRpc>, { paseo }: PluginHandlerContext) {
  return readDrawing(await workspaceDirectory(paseo, input.workspaceId), input.path);
}

export async function handleWrite(input: RpcInput<typeof writeDrawingRpc>, { paseo }: PluginHandlerContext) {
  const root = await workspaceDirectory(paseo, input.workspaceId);
  const result = await writeDrawing(root, input.path, input.text, input.baseVersion, input.force);
  if (result.status !== "ok") console.log(`[visualise] write of ${input.path} refused: ${result.status}`);
  return result;
}

export async function handleCreate({ workspaceId }: RpcInput<typeof createDrawingRpc>, { paseo }: PluginHandlerContext) {
  return createDrawing(await workspaceDirectory(paseo, workspaceId));
}

/** Reads the saved file from disk (the source of truth) and offers it to tldraw.com once. */
export async function handlePrepareImport(
  imports: ImportServer,
  input: RpcInput<typeof prepareImportRpc>,
  { paseo }: PluginHandlerContext,
) {
  const root = await workspaceDirectory(paseo, input.workspaceId);
  const bytes = await readDrawingBytes(root, await toWorkspaceRelative(root, input.path));
  const offer = await imports.offer(bytes);
  console.log(`[visualise] offered ${bytes.length} bytes to tldraw.com for ${offer.expiresInSeconds} s`);
  return { importUrl: tldrawImportPageUrl(offer.fileUrl), expiresInSeconds: offer.expiresInSeconds };
}
