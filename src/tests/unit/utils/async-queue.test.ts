// src/tests/unit/utils/async-queue.test.ts
import { describe, expect, it } from "vitest";
import { AsyncQueue } from "@/utils/async-queue";

describe("AsyncQueue", () => {
  it("yields pushed items in order", async () => {
    const queue = new AsyncQueue<string>();
    queue.push("a");
    queue.push("b");
    queue.close();

    const collected: string[] = [];
    for await (const item of queue.iter()) {
      collected.push(item);
    }
    expect(collected).toEqual(["a", "b"]);
  });

  it("yields items pushed after iteration starts", async () => {
    const queue = new AsyncQueue<string>();
    const collected: string[] = [];
    const consume = (async () => {
      for await (const item of queue.iter()) {
        collected.push(item);
      }
    })();
    queue.push("x");
    queue.push("y");
    queue.close();
    await consume;
    expect(collected).toEqual(["x", "y"]);
  });

  it("completes immediately when closed before iteration", async () => {
    const queue = new AsyncQueue<string>();
    queue.close();
    const collected: string[] = [];
    for await (const item of queue.iter()) {
      collected.push(item);
    }
    expect(collected).toEqual([]);
  });

  it("stops iteration when closed mid-stream", async () => {
    const queue = new AsyncQueue<number>();
    queue.push(1);
    const collected: number[] = [];
    const consume = (async () => {
      for await (const item of queue.iter()) {
        collected.push(item);
      }
    })();
    queue.push(2);
    queue.close();
    await consume;
    expect(collected).toEqual([1, 2]);
  });
});
