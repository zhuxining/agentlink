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
  // 传给 ACP Server 完整的当前环境变量，加上用户自定义 env
  const childEnv = { ...process.env, ...env };

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
