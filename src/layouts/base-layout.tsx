import type React from "react";
import DragWindowRegion from "@/components/drag-window-region";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function BaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <DragWindowRegion title="agentlink" />
      <main className="h-screen p-2 pb-20">
        <TooltipProvider>{children}</TooltipProvider>
      </main>
    </>
  );
}
