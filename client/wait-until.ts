/** Resolve true once `done()` holds, or false after `timeoutMs`. */
export async function waitUntil(done: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!done()) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return true;
}
