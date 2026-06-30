import crypto from "node:crypto";
import Store from "electron-store";

interface AdapterCredentials {
  [slug: string]: { env: Record<string, string>; enabled: boolean };
}

interface AcpServerEntry {
  args: string[];
  command: string;
  env?: Record<string, string>;
  id: string;
  name: string;
}

interface ConfigSchema {
  acpServers: AcpServerEntry[];
  adapters: AdapterCredentials;
}

// 使用固定 hash 作为 encryptionKey，提供基础 at-rest 混淆
// 后续可以改进为 safeStorage 加密存储的随机 key
const ENCRYPTION_KEY = crypto
  .createHash("sha256")
  .update("agentlink-config-key")
  .digest("hex");

export const configStore = new Store<ConfigSchema>({
  name: "agentlink-config",
  defaults: { adapters: {}, acpServers: [] },
  encryptionKey: ENCRYPTION_KEY,
});

export type { AcpServerEntry, AdapterCredentials, ConfigSchema };
