/**
 * While a GIF waits in the queue or is being made, the frames, photos and stickers it was given must
 * stay alive, even if the page changes them or is left. Freeing goes through whenFree(), which waits
 * until no GIF holds them any more.
 */
let holds = 0;
const waiting: (() => void)[] = [];

/** Keeps things alive for one GIF job; call the returned function (once is enough) when it's over. */
export function holdMemory() {
  holds++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    holds--;
    if (!holds) waiting.splice(0).forEach((fn) => fn());
  };
}

/** Runs `free` now, or once no GIF job holds memory. */
export const whenFree = (free: () => void) => void (holds ? waiting.push(free) : free());

export const memoryHeld = () => holds > 0;
