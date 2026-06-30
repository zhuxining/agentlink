/** biome-ignore-all lint/performance/noBarrelFile: intentional public API surface for the persistence module */
export type {
  AcpServerEntry,
  AdapterCredentials,
  ConfigSchema,
} from "./config-store";
export { configStore } from "./config-store";
export { closeDatabase, getDatabase } from "./database";
export { createStateAdapter } from "./state-adapter";
