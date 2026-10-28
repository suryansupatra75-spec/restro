/**
 * In-process write lock queue for SQLite.
 * Ensures concurrent write transactions execute sequentially without colliding
 * on the Windows filesystem SQLite lock or causing P1008 timeout errors.
 */

let writeQueue: Promise<unknown> = Promise.resolve();

export async function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = writeQueue;
  let resolveCurrent: () => void;
  const current = new Promise<void>((resolve) => {
    resolveCurrent = resolve;
  });
  writeQueue = current;

  try {
    await previous;
  } catch {
    // Ignore error from previous operation so chain continues
  }

  try {
    return await fn();
  } finally {
    resolveCurrent!();
  }
}
