/**
 * Everything one page wires up, so a client-side navigation can undo it.
 * Listeners, observers, timers, and frames registered here end with dispose().
 */
export class Scope {
  private undo: Array<() => void> = [];
  private disposed = false;

  get alive(): boolean {
    return !this.disposed;
  }

  add(fn: () => void): void {
    if (this.disposed) fn();
    else this.undo.push(fn);
  }

  on<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    fn: (e: WindowEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ): void;
  on<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    fn: (e: DocumentEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ): void;
  on<K extends keyof HTMLElementEventMap>(
    target: Element,
    type: K,
    fn: (e: HTMLElementEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ): void;
  on(target: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void;
  on(target: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void {
    target.addEventListener(type, fn, opts);
    this.add(() => target.removeEventListener(type, fn, opts));
  }

  observe<T extends { disconnect(): void }>(observer: T): T {
    this.add(() => observer.disconnect());
    return observer;
  }

  timeout(fn: () => void, ms: number): number {
    const id = window.setTimeout(fn, ms);
    this.add(() => window.clearTimeout(id));
    return id;
  }

  dispose(): void {
    this.disposed = true;
    for (const fn of this.undo.splice(0).reverse()) {
      try {
        fn();
      } catch {
        /* One failed cleanup must not keep the rest alive. */
      }
    }
  }
}
