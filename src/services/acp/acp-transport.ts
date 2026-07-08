import { type ChildProcess, spawn } from "node:child_process";
import type { Stream } from "@agentclientprotocol/sdk";
import { ndJsonStream } from "@agentclientprotocol/sdk";

export interface AcpTransport {
  process: ChildProcess;
  stream: Stream;
}

export function createStdioStream(
  command: string,
  args: string[],
  env?: Record<string, string>
): Promise<AcpTransport> {
  // 过滤危险环境变量，同时保留 API key 等必要变量
  const blockPrefixes = [
    "LD_",
    "DYLD_",
    "BASH_ENV",
    "NODE_OPTIONS",
    "PYTHONPATH",
    "PERL5OPT",
    "RUBYOPT",
  ];
  const childEnv: Record<string, string> = {};
  for (const [key, val] of Object.entries(process.env)) {
    const isBlocked = blockPrefixes.some((p) => key.startsWith(p));
    if (!isBlocked && val !== undefined) {
      childEnv[key] = val;
    }
  }
  if (env) {
    Object.assign(childEnv, env);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: childEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Safety timeout: if the spawn event doesn't fire within 10s,
    // reject. This is a backstop, not an artificial delay — spawn
    // normally fires within the same event-loop tick.
    const timeout = setTimeout(() => {
      reject(new Error(`ACP server spawn timed out: "${command}"`));
    }, 10_000);

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to spawn ACP server: ${err.message}`));
    });

    // Resolve as soon as the process spawns successfully (pipes are
    // available immediately). If the process exits very quickly with
    // a non-zero code, it still spawned — the exit handler fires
    // asynchronously after spawn.
    child.on("spawn", () => {
      clearTimeout(timeout);

      const writable = new WritableStream<Uint8Array>({
        close() {
          child.stdin.end();
        },
        write(chunk) {
          const ok = child.stdin.write(chunk);
          if (!ok) {
            // Backpressure: the kernel buffer is full.
            // The write will drain naturally via the 'drain' event.
            // We don't pause here since ACP streaming chunks are
            // typically small and this is a best-effort relay.
          }
        },
      });
      child.stdin.on("error", (err) => {
        console.error("[AcpTransport] stdin error:", err);
      });

      const readable = new ReadableStream<Uint8Array>({
        cancel() {
          child.stdout?.destroy();
        },
        start(ctrl) {
          child.stdout?.on("data", (c: Buffer) =>
            ctrl.enqueue(new Uint8Array(c))
          );
          child.stdout?.on("end", () => ctrl.close());
          child.stdout?.on("error", (e) => ctrl.error(e));
          child.stderr.on("data", (c: Buffer) => {
            process.stderr.write(c);
          });
        },
      });

      resolve({ process: child, stream: ndJsonStream(writable, readable) });
    });
  });
}
