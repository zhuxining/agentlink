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
  /** Track per-adapter status state, persisted in memory only */
  private statusState: Record<string, { status: AdapterEntry["status"]; errorMessage?: string }> = {};

  list(): AdapterEntry[] {
    const statusState = this.statusState;
    const creds = configStore.get("adapters", {});
    return SUPPORTED.map((slug) => {
      const meta = getAdapter(slug);
      if (!meta) {
        return null;
      }
      const saved = creds[slug];
      const tracked = statusState[slug] ?? { status: "disconnected" as const };
      return {
        slug,
        name: meta.name,
        description: meta.description,
        enabled: saved?.enabled ?? false,
        env: saved?.env ?? {},
        errorMessage: tracked.errorMessage,
        status: tracked.status,
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
    this.statusState[slug] = { status: "connecting" };
  }

  disable(slug: string): void {
    const creds = configStore.get("adapters", {});
    if (creds[slug]) {
      creds[slug].enabled = false;
      configStore.set("adapters", creds);
    }
    this.statusState[slug] = { status: "disconnected" };
  }

  setStatus(slug: string, status: AdapterEntry["status"], errorMessage?: string): void {
    this.statusState[slug] = { status, errorMessage };
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
        if (!factory) {
          throw new Error(`Factory export "${meta?.factoryExport ?? "createAdapter"}" not found in ${pkg}`);
        }
        map[slug] = factory({});
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[AdapterRegistry] Failed to load adapter "${slug}":`,
          err
        );
        this.setStatus(slug, "error", message);
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
