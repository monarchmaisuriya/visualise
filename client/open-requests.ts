/**
 * Drawings the Command Center asked the Visualise panel to open, by workspace. Workspace panels
 * take no params, so the command leaves the path here and the panel takes it when it opens.
 */
const requested = new Map<string, string>();

export function requestOpen(workspaceId: string, path: string): void {
  requested.set(workspaceId, path);
}

export function takeOpenRequest(workspaceId: string): string | null {
  const path = requested.get(workspaceId) ?? null;
  requested.delete(workspaceId);
  return path;
}
