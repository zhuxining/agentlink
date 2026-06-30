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
  // 仅传递 ACP Server 必需的环境变量，避免泄漏 host 凭据
  const allowedKeys = new Set([
    "PATH",
    "HOME",
    "SHELL",
    "NODE_PATH",
    "CLICOLOR",
    "FORCE_COLOR",
    "TERM",
    "LANG",
    "LC_ALL",
    "TZ",
  ]);
  const childEnv: Record<string, string> = {};
  for (const key of allowedKeys) {
    const val = process.env[key];
    if (val) {
      childEnv[key] = val;
    }
  }
  if (env) {
    Object.assign(childEnv, env);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: childEnv,
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to spawn ACP server: ${err.message}`));
    });

    const timeout = setTimeout(() => {
      if (child.exitCode !== null) {
        reject(new Error(`ACP server exited with code ${child.exitCode}`));
        return;
      }

      const writable = new WritableStream<Uint8Array>({
        write(chunk) {
          child.stdin.write(chunk);
        },
        close() {
          child.stdin.end();
        },
      });

      const readable = new ReadableStream<Uint8Array>({
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
        cancel() {
          child.stdout?.destroy();
        },
      });

      resolve({ stream: ndJsonStream(writable, readable), process: child });
    }, 500);
  });
}
