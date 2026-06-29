import type React from "react";
import AppSidebar from "@/components/app-sidebar";
import DragWindowRegion from "@/components/drag-window-region";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function BaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col">
      <SidebarProvider className="min-h-0 flex-1" defaultOpen>
        <TooltipProvider>
          <AppSidebar />
          <SidebarInset>
            <DragWindowRegion title="agentlink" />
            <div className="flex h-10 items-center px-4 md:hidden">
              <SidebarTrigger />
            </div>
            <div className="flex-1 p-6 pt-0">{children}</div>
          </SidebarInset>
        </TooltipProvider>
      </SidebarProvider>
    </div>
  );
}
