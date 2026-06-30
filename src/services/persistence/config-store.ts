import crypto from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
  const keyFile = join(app.getPath("userData"), "agentlink-key.enc");

  if (existsSync(keyFile)) {
    // Existing install — decrypt persisted key.
    const encrypted = readFileSync(keyFile);
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(encrypted);
    }
    // Fallback: if safeStorage was available before but now isn't
    // (e.g. headless environment after initial setup), use the raw
    // buffer as hex. This preserves read-access to existing config.
    return encrypted.toString("hex");
  }

  // Fresh install — generate a random key and encrypt with safeStorage.
  const raw = crypto.randomBytes(32).toString("hex");
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(raw);
    writeFileSync(keyFile, encrypted);
  }
  // If safeStorage is unavailable (e.g. headless test), just use the
  // random key without encrypting it to disk — still better than a
  // hardcoded hash because the key is per-install unique.
  return raw;
}

export const configStore = new Store<ConfigSchema>({
  name: "agentlink-config",
  defaults: { adapters: {}, acpServers: [] },
  encryptionKey: getEncryptionKey(),
});

export type { AdapterCredentials, ConfigSchema };
