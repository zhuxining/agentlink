// src/utils/async-queue.ts

/**
 * Bridges a push-based callback API to a pull-based AsyncIterable.
 *
 * Producers call push() to enqueue items and close() when done.
 * Consumers iterate over iter() to receive items as they arrive;
 * iteration completes when close() is called and the queue drains.
 */
export class AsyncQueue<T> {
  private readonly items: T[] = [];
  private closed = false;
  private readonly resolvers: Array<(result: IteratorResult<T>) => void> = [];

  push(item: T): void {
    if (this.closed) {
      return;
    }
    const resolver = this.resolvers.shift();
    if (resolver) {
      resolver({ done: false, value: item });
    } else {
      this.items.push(item);
    }
  }

  close(): void {
    this.closed = true;
    while (this.resolvers.length > 0) {
      const resolver = this.resolvers.shift();
      resolver?.({ done: true, value: undefined as never });
    }
  }

  iter(): AsyncIterable<T> {
    const self = this;
    return {
      [Symbol.asyncIterator]() {
        return {
          next(): Promise<IteratorResult<T>> {
            if (self.items.length > 0) {
              return Promise.resolve({
                done: false,
                value: self.items.shift() as T,
              });
            }
            if (self.closed) {
              return Promise.resolve({
                done: true,
                value: undefined as never,
              });
            }
            return new Promise((resolve) => {
              self.resolvers.push(resolve);
            });
          },
        };
      },
    };
  }
}
