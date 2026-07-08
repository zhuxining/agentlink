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
  private readonly statusState: Record<
    string,
    { status: AdapterEntry["status"]; errorMessage?: string }
  > = {};

  list(): AdapterEntry[] {
    const { statusState } = this;
    const creds = configStore.get("adapters", {});
    return SUPPORTED.map((slug) => {
      const meta = getAdapter(slug);
      if (!meta) {
        return null;
      }
      const saved = creds[slug];
      const tracked = statusState[slug] ?? { status: "disconnected" as const };
      return {
        description: meta.description,
        enabled: saved?.enabled ?? false,
        env: saved?.env ?? {},
        errorMessage: tracked.errorMessage,
        name: meta.name,
        slug,
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
    creds[slug] = { enabled: true, env };
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

  setStatus(
    slug: string,
    status: AdapterEntry["status"],
    errorMessage?: string
  ): void {
    this.statusState[slug] = { errorMessage, status };
  }

  async buildAdapterMap(): Promise<Record<string, Adapter>> {
    const map: Record<string, Adapter> = {};
    const creds = configStore.get("adapters", {});
    for (const slug of SUPPORTED) {
      const saved = creds[slug];
      if (!saved?.enabled) {
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: sequential needed — loadAdapter mutates env vars per-iteration
      const adapter = await this.loadAdapter(slug, saved.env);
      if (adapter) {
        map[slug] = adapter;
      }
    }
    return map;
  }

  /**
   * Inject env vars, dynamic-import the ESM-only adapter package,
   * and return the constructed Adapter instance. Returns null on failure.
   */
  private async loadAdapter(
    slug: string,
    env: Record<string, string>
  ): Promise<Adapter | null> {
    const prev: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(env)) {
      prev[k] = process.env[k];
      process.env[k] = v;
    }
    try {
      const pkg = resolvePkg(slug);
      const mod = (await import(pkg)) as Record<string, unknown>;
      const meta = getAdapter(slug);
      const exportName = meta?.factoryExport ?? "createAdapter";
      const factory = mod[exportName] as (
        cfg?: Record<string, unknown>
      ) => Adapter;
      // biome-ignore lint/suspicious/noUnnecessaryConditions: factory is dynamically resolved, may be absent at runtime
      if (!factory) {
        throw new Error(`Factory export "${exportName}" not found in ${pkg}`);
      }
      return factory({});
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[AdapterRegistry] Failed to load adapter "${slug}":`, err);
      this.setStatus(slug, "error", message);
      return null;
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
}
