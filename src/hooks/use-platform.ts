import { useEffect, useState } from "react";
import { getPlatform } from "@/actions/app";
import { ipc } from "@/ipc/manager";

function guessPlatform(): string | null {
  if (typeof navigator === "undefined") {
    return null;
  }
  const ua = navigator.userAgent;
  if (ua.includes("Mac")) {
    return "darwin";
  }
  if (ua.includes("Win")) {
    return "win32";
  }
  if (ua.includes("Linux")) {
    return "linux";
  }
  return null;
}

export function usePlatform() {
  const [platform, setPlatform] = useState<string | null>(guessPlatform);

  useEffect(() => {
    let active = true;

    // Wait for the IPC bridge to be ready before making any request.
    ipc
      .ready()
      .then(() => getPlatform())
      .then((value) => {
        if (!active) {
          return;
        }
        setPlatform(value);
      })
      .catch((error) => {
        console.error("Failed to detect platform", error);
      });

    return () => {
      active = false;
    };
  }, []);

  return platform;
}
