import { createMemoryState } from "@chat-adapter/state-memory";
import type { StateAdapter } from "chat";

let state: StateAdapter | null = null;

export function createStateAdapter(): StateAdapter {
  if (!state) {
    state = createMemoryState();
  }
  return state;
}
