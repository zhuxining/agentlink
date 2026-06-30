/** biome-ignore-all lint/performance/noBarrelFile: intentional public API surface for events domain */
import { getRecentEvents } from "./handlers";

export { registerEventCollector } from "./handlers";
export const events = { getRecentEvents };
