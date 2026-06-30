import type { Adapter } from "chat";
import { getAdapter } from "chat/adapters";
import { configStore } from "@/services/persistence";

const SUPPORTED = ["telegram", "lark"] as const;
const PKG_OVERRIDE: Record<string, string> = {
  lark: "@larksuite/vercel-chat-adapter",
};

function resolvePkg(slug: string): string {
  return PKG_OVERRIDE[slug] ?? getAdapter(slug)?.packageName ?? "";
}

export interface AdapterEntry {
  description: string;
  enabled: boolean;
  env: Record<string, string>;
  errorMessage?: string;
  name: string;
  slug: string;
  status: "disconnected" | "connecting" | "connected" | "error";
}

export class AdapterRegistry {
  list(): AdapterEntry[] {
    const creds = configStore.get("adapters", {});
    return SUPPORTED.map((slug) => {
      const meta = getAdapter(slug);
      if (!meta) {
        return null;
      }
      const saved = creds[slug];
      return {
        slug,
        name: meta.name,
        description: meta.description,
        enabled: saved?.enabled ?? false,
        env: saved?.env ?? {},
        status: "disconnected" as const,
      };
    }).filter(Boolean) as AdapterEntry[];
  }

  getEnabled(): AdapterEntry[] {
    return this.list().filter((a) => a.enabled);
  }

  get(slug: string): AdapterEntry | undefined {
    return this.list().find((a) => a.slug === slug);
  }

  enable(slug: string, env: Record<string, string>): void {
    const creds = configStore.get("adapters", {});
    creds[slug] = { env, enabled: true };
    configStore.set("adapters", creds);
  }

  disable(slug: string): void {
    const creds = configStore.get("adapters", {});
    if (creds[slug]) {
      creds[slug].enabled = false;
      configStore.set("adapters", creds);
    }
  }

  async buildAdapterMap(): Promise<Record<string, Adapter>> {
    const map: Record<string, Adapter> = {};
    const creds = configStore.get("adapters", {});
    for (const slug of SUPPORTED) {
      const saved = creds[slug];
      if (!saved?.enabled) {
        continue;
      }
      // 适配器从 process.env 读取凭据，需注入后再加载
      const prev: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(saved.env)) {
        prev[k] = process.env[k];
        process.env[k] = v;
      }
      try {
        const pkg = resolvePkg(slug);
        // ESM-only 包，必须用 import() 而非 require()
        const mod = (await import(pkg)) as Record<string, unknown>;
        const meta = getAdapter(slug);
        const factory = mod[meta?.factoryExport ?? "createAdapter"] as (
          cfg?: Record<string, unknown>
        ) => Adapter;
        map[slug] = factory({});
      } catch (err) {
        console.error(
          `[AdapterRegistry] Failed to load adapter "${slug}":`,
          err
        );
      } finally {
        for (const [k, p] of Object.entries(prev)) {
          if (p === undefined) {
            delete process.env[k];
          } else {
            process.env[k] = p;
          }
        }
      }
    }
    return map;
  }
}
