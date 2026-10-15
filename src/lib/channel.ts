/** Turns callback-style progress into an async iterable the queue can consume. */
export function channel<T>() {
  const items: T[] = [];
  let wake: (() => void) | null = null;
  let done = false;
  let failure: unknown = null;

  const notify = () => {
    wake?.();
    wake = null;
  };

  return {
    push(item: T) {
      items.push(item);
      notify();
    },
    close() {
      done = true;
      notify();
    },
    fail(err: unknown) {
      failure = err ?? new Error('Failed');
      done = true;
      notify();
    },
    async *[Symbol.asyncIterator](): AsyncGenerator<T> {
      for (;;) {
        while (items.length) yield items.shift() as T;
        if (failure) throw failure;
        if (done) return;
        await new Promise<void>((r) => (wake = r));
      }
    },
  };
}

export const abortError = () => new DOMException('Cancelled', 'AbortError');
