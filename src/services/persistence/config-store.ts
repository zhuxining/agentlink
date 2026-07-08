import crypto from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, safeStorage } from "electron";
import Store from "electron-store";

interface AdapterCredentials {
  [slug: string]: { env: Record<string, string>; enabled: boolean };
}

export interface AcpServerEntry {
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

/** Derive the encryption key for electron-store using safeStorage.
 *
 * On first run, generates a random 32-byte key, encrypts it with the
 * OS keychain via safeStorage, and persists the ciphertext to a file.
 * On subsequent runs, reads and decrypts that file.
 */
function getEncryptionKey(): string {
  const userDataDir = app.getPath("userData");
  const keyFile = join(userDataDir, "agentlink-key.enc");
  const configFile = join(userDataDir, "agentlink-config.json");

  if (existsSync(keyFile)) {
    // Existing safeStorage install — decrypt persisted key.
    const encrypted = readFileSync(keyFile);
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(encrypted);
    }
    return encrypted.toString("hex");
  }

  // Fresh install (no key.enc) — but old config.json may exist from
  // before the safeStorage migration. Overwrite it so it gets
  // recreated with the new key below.
  if (existsSync(configFile)) {
    try {
      unlinkSync(configFile);
    } catch {
      // best-effort; Store will overwrite it anyway
    }
  }

  // Generate a random key and encrypt with safeStorage.
  const raw = crypto.randomBytes(32).toString("hex");
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(raw);
    writeFileSync(keyFile, encrypted);
  }
  return raw;
}

export const configStore = new Store<ConfigSchema>({
  defaults: { acpServers: [], adapters: {} },
  encryptionKey: getEncryptionKey(),
  name: "agentlink-config",
});

export type { AdapterCredentials, ConfigSchema };
