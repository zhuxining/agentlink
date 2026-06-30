import { safeStorage } from "electron";
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

function deriveEncryptionKey(): string | undefined {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn(
      "[agentlink] safeStorage not available, credentials will be stored in plaintext"
    );
    return;
  }
  // 使用固定 salt 派生加密密钥
  return safeStorage.encryptString("agentlink-config-key").toString("base64");
}

export const configStore = new Store<ConfigSchema>({
  name: "agentlink-config",
  defaults: { adapters: {}, acpServers: [] },
  encryptionKey: deriveEncryptionKey(),
});

export type { AcpServerEntry, AdapterCredentials, ConfigSchema };
