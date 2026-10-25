/** The file changed on disk since this editor last read or wrote it. */
export class DrawingConflictError extends Error {
  constructor() {
    super("The drawing changed on disk");
    this.name = "DrawingConflictError";
  }
}

/** The file no longer exists. */
export class DrawingDeletedError extends Error {
  constructor() {
    super("The drawing was deleted");
    this.name = "DrawingDeletedError";
  }
}

export type SaveStatus =
  | { kind: "clean" }
  | { kind: "conflict" }
  | { kind: "deleted" }
  | { kind: "error"; message: string };

export interface SaveQueueDeps {
  /** Rejects with DrawingConflictError or DrawingDeletedError; `force` skips the conflict check. */
  write(text: string, force: boolean): Promise<void>;
  setModified(modified: boolean): void;
  onStatus(status: SaveStatus): void;
  /** Re-read the file and replace the editor's document with it. */
  reload(): void;
}

/**
 * The only owner of save rules for both panels: newest text wins, writes never overlap, the tab is
 * marked unsaved the moment the editor changes, and an outside change never overwrites unsaved
 * edits silently.
 */
export class SaveQueue {
  private pending: string | null = null;
  private latest: string | null = null;
  private editorDirty = false;
  private writing = false;
  private status: SaveStatus = { kind: "clean" };
  private modified = false;

  constructor(private readonly deps: SaveQueueDeps) {}

  /** The editor has changes it has not sent yet. */
  markDirty(): void {
    this.editorDirty = true;
    this.syncModified();
  }

  /** The editor's full document after its latest changes. */
  changed(text: string): void {
    this.editorDirty = false;
    this.pending = text;
    this.latest = text;
    if (this.status.kind === "error") this.setStatus({ kind: "clean" });
    this.syncModified();
    void this.pump(false);
  }

  /** The file changed on disk, written by someone else. */
  externalChange(): void {
    if (this.status.kind === "conflict" || this.status.kind === "deleted") return;
    if (this.modified) {
      this.setStatus({ kind: "conflict" });
      return;
    }
    this.deps.reload();
  }

  deleted(): void {
    this.setStatus({ kind: "deleted" });
  }

  resolveConflict(choice: "reload" | "overwrite"): void {
    if (this.status.kind !== "conflict") return;
    this.setStatus({ kind: "clean" });
    if (choice === "reload") {
      this.pending = null;
      this.latest = null;
      this.editorDirty = false;
      this.syncModified();
      this.deps.reload();
      return;
    }
    this.pending ??= this.latest;
    void this.pump(true);
  }

  private async pump(force: boolean): Promise<void> {
    if (this.writing || this.pending === null || this.status.kind !== "clean") return;
    const text = this.pending;
    this.pending = null;
    this.writing = true;
    try {
      await this.deps.write(text, force);
    } catch (error) {
      if (error instanceof DrawingConflictError) {
        this.pending ??= text;
        this.setStatus({ kind: "conflict" });
      } else if (error instanceof DrawingDeletedError) {
        this.setStatus({ kind: "deleted" });
      } else {
        this.pending ??= text;
        this.setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      this.writing = false;
    }
    this.syncModified();
    await this.pump(false);
  }

  private syncModified(): void {
    const next = this.editorDirty || this.writing || this.pending !== null;
    if (next === this.modified) return;
    this.modified = next;
    this.deps.setModified(next);
  }

  private setStatus(status: SaveStatus): void {
    this.status = status;
    this.deps.onStatus(status);
  }
}
