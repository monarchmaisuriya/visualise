import { type PluginFile, PluginFileConflictError, PluginFileDeletedError } from "@getpaseo/plugin/client";
import type { DrawingSource } from "./drawing-source";
import { DrawingConflictError, DrawingDeletedError } from "./save-queue";

/** A drawing in a Paseo file tab: Paseo's file handle owns reading, writing and conflict checks. */
export function createFileSource(file: PluginFile): DrawingSource {
  return {
    importPath: file.path,
    read: () => file.readText(),
    async write(text, force) {
      try {
        await file.writeText(text, { force });
      } catch (error) {
        if (error instanceof PluginFileConflictError) throw new DrawingConflictError();
        if (error instanceof PluginFileDeletedError) throw new DrawingDeletedError();
        throw error;
      }
    },
    watch: (listener) =>
      file.watch((event) => {
        switch (event.type) {
          case "changed":
            listener("changed");
            break;
          case "deleted":
            listener("deleted");
            break;
        }
      }),
  };
}
