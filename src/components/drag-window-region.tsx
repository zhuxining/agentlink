import type { ReactNode } from "react";
import { closeWindow, maximizeWindow, minimizeWindow } from "@/actions/window";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { usePlatform } from "@/hooks/use-platform";
import { cn } from "@/utils/tailwind";

interface DragWindowRegionProps {
  className?: string;
  title?: ReactNode;
}

export default function DragWindowRegion({
  title,
  className,
}: DragWindowRegionProps) {
  const platform = usePlatform();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  if (platform === "darwin") {
    return (
      <div
        className={cn(
          "group draglayer flex h-10 w-full items-center bg-background",
          className
        )}
      >
        {isCollapsed && (
          <SidebarTrigger
            className="no-drag ml-[84px] h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100"
            size="icon-xs"
          />
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-10 w-full items-center justify-between bg-background",
        className
      )}
    >
      <div className="group draglayer flex h-full flex-1 items-center gap-2">
        {isCollapsed && (
          <SidebarTrigger
            className="no-drag ml-2 h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100"
            size="icon-xs"
          />
        )}
        {title && (
          <div className="select-none whitespace-nowrap pl-4 text-gray-400 text-xs">
            {title}
          </div>
        )}
      </div>
      <WindowButtons />
    </div>
  );
}

function WindowButtons() {
  return (
    <div className="flex">
      <button
        className="no-drag p-2 hover:bg-slate-300"
        onClick={minimizeWindow}
        title="Minimize"
        type="button"
      >
        <svg
          aria-hidden="true"
          height="12"
          role="img"
          viewBox="0 0 12 12"
          width="12"
        >
          <rect fill="currentColor" height="1" width="10" x="1" y="6" />
        </svg>
      </button>
      <button
        className="no-drag p-2 hover:bg-slate-300"
        onClick={maximizeWindow}
        title="Maximize"
        type="button"
      >
        <svg
          aria-hidden="true"
          height="12"
          role="img"
          viewBox="0 0 12 12"
          width="12"
        >
          <rect
            fill="none"
            height="9"
            stroke="currentColor"
            width="9"
            x="1.5"
            y="1.5"
          />
        </svg>
      </button>
      <button
        className="no-drag p-2 hover:bg-red-300"
        onClick={closeWindow}
        title="Close"
        type="button"
      >
        <svg
          aria-hidden="true"
          height="12"
          role="img"
          viewBox="0 0 12 12"
          width="12"
        >
          <polygon
            fill="currentColor"
            fillRule="evenodd"
            points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1"
          />
        </svg>
      </button>
    </div>
  );
}
