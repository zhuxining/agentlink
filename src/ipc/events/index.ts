/** biome-ignore-all lint/performance/noBarrelFile: intentional public API surface for events domain */
import { getRecentEvents, subscribe } from "./handlers";

export { registerEventCollector } from "./handlers";
export const events = { getRecentEvents, subscribe };
