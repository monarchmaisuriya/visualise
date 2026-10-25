import { z } from "zod";

export const colorSchemeSchema = z.enum(["light", "dark"]);

/** Messages the panel sends to the tldraw iframe. */
export const toRuntimeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("load"),
    /** `.tldr` JSON; empty text opens a new, empty drawing. */
    text: z.string(),
    theme: colorSchemeSchema,
    licenseKey: z.string(),
  }),
  /** The file changed on disk while the editor had no unsaved edits. */
  z.object({ type: z.literal("replace"), text: z.string() }),
  z.object({ type: z.literal("theme"), theme: colorSchemeSchema }),
]);
export type ToRuntime = z.infer<typeof toRuntimeSchema>;

/** Messages the tldraw iframe sends to the panel. */
export const fromRuntimeSchema = z.discriminatedUnion("type", [
  /** `production` is false in a development build, which tldraw runs without a licence key. */
  z.object({ type: z.literal("ready"), production: z.boolean() }),
  /** Sent at once on the first edit after a save, before the debounced `changed`. */
  z.object({ type: z.literal("dirty") }),
  z.object({ type: z.literal("changed"), text: z.string() }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type FromRuntime = z.infer<typeof fromRuntimeSchema>;
