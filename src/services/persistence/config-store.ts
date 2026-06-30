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

export const configStore = new Store<ConfigSchema>({
  name: "agentlink-config",
  defaults: { adapters: {}, acpServers: [] },
});

export type { AcpServerEntry, AdapterCredentials, ConfigSchema };
