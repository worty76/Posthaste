/**
 * Persists the capture text shortly after each keystroke.
 *
 * Writes are serialised on one chain so they reach the database in order,
 * and `cancel()` waits for a write already in flight. That matters at save
 * time: a late draft write landing after the note was saved would bring
 * back a draft of text the user has already filed.
 */
export class DraftSync {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: { content: string; category: string | null } | null = null;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly write: (content: string, category: string | null) => Promise<void>,
    private readonly onError: (e: unknown) => void,
    private readonly delayMs = 250,
  ) {}

  schedule(content: string, category: string | null) {
    this.pending = { content, category };
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delayMs);
  }

  /** Writes any pending text now and resolves once it is stored. */
  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const next = this.pending;
    this.pending = null;
    if (next) {
      this.chain = this.chain
        .then(() => this.write(next.content, next.category))
        .catch(this.onError);
    }
    return this.chain;
  }

  /** Drops any pending text and resolves once in-flight writes finish. */
  cancel(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
    return this.chain;
  }
}
