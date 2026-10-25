/** How an editor reads, writes and watches one drawing, whatever owns the file. */
export interface DrawingSource {
  read(): Promise<string>;
  /** Rejects with DrawingConflictError or DrawingDeletedError (see save-queue.ts). */
  write(text: string, force: boolean): Promise<void>;
  /** Changes by anyone else; returns the unsubscribe function. */
  watch(listener: (event: "changed" | "deleted") => void): () => void;
  /** Path for the daemon's tldraw.com hand-off: workspace-relative or absolute. */
  readonly importPath: string;
}
