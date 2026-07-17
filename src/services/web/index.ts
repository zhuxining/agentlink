/** biome-ignore-all lint/performance/noBarrelFile: intentional public API surface for the web module */

export { createLocalWebAdapter } from "./adapter";
export type { WebHttpServer } from "./server";
export { createWebHttpServer } from "./server";
