export const DRAWING_EXTENSION = ".tldr";

/** A `.tldr` file name that is not hidden. */
export function isDrawingFileName(name: string): boolean {
  return name.toLowerCase().endsWith(DRAWING_EXTENSION) && name.length > DRAWING_EXTENSION.length && !name.startsWith(".");
}
