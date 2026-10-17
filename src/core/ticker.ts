/**
 * One requestAnimationFrame loop for the whole library. It only runs while at
 * least one task asks for another frame, so idle pages cost nothing.
 *
 * Tasks run in two phases per frame: `read` (layout measurements) for every
 * task first, then `write` (style mutations). This avoids layout thrashing
 * when many surfaces animate at once.
 */
export interface FrameTask {
  /** Measure. Return false to skip `write` this frame. */
  read?(now: number): boolean | void;
  /** Mutate. Return true to request another frame. */
  write(now: number, dt: number): boolean | void;
}

const tasks = new Set<FrameTask>();
const pending = new Set<FrameTask>();
let handle = 0;
let last = 0;

function frame(now: number): void {
  handle = 0;
  const dt = last ? Math.min(0.1, Math.max(0, (now - last) / 1000)) : 1 / 60;
  last = now;
  const batch = Array.from(pending);
  pending.clear();
  const skip = new Set<FrameTask>();
  for (const t of batch) {
    if (!tasks.has(t)) continue;
    if (t.read && t.read(now) === false) skip.add(t);
  }
  for (const t of batch) {
    if (!tasks.has(t) || skip.has(t)) continue;
    if (t.write(now, dt)) pending.add(t);
  }
  if (pending.size) handle = requestAnimationFrame(frame);
  else last = 0;
}

/** Register a task; it is idle until `wake` is called. */
export function addTask(task: FrameTask): () => void {
  tasks.add(task);
  return () => {
    tasks.delete(task);
    pending.delete(task);
  };
}

/** Ask for `task` to run on the next frame. */
export function wake(task: FrameTask): void {
  if (!tasks.has(task)) tasks.add(task);
  pending.add(task);
  if (!handle && typeof requestAnimationFrame === "function") handle = requestAnimationFrame(frame);
}
