import { Link, useLocation } from "@tanstack/react-router";
import {
  BookOpen,
  ExternalLink,
  House,
  MessageCircle,
  Plug,
  Settings,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { openExternalLink } from "@/actions/shell";
import LangToggle from "@/components/lang-toggle";
import ToggleTheme from "@/components/toggle-theme";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { usePlatform } from "@/hooks/use-platform";
import { cn } from "@/utils/tailwind";

export default function AppSidebar({
  className,
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { isMobile, state } = useSidebar();
  const platform = usePlatform();

  const isMacOS = platform === "darwin";
  const isExpanded = state === "expanded";
  const showTrafficLightSpace = isMacOS && isExpanded && !isMobile;

  const navItems = [
    { title: t("titleHomePage"), to: "/" as const, icon: House },
    { title: "对话", to: "/conversation" as const, icon: MessageCircle },
    { title: "渠道", to: "/channel" as const, icon: Plug },
    { title: "设置", to: "/settings" as const, icon: Settings },
    { title: t("titleSecondPage"), to: "/second" as const, icon: BookOpen },
    {
      title: t("documentation"),
      to: "https://docs.luanroger.dev/agentlink",
      icon: ExternalLink,
      external: true as const,
    },
  ];

  return (
    <Sidebar className={className} collapsible="offcanvas" {...props}>
      <SidebarHeader
        className={cn(
          "group draglayer flex h-10 flex-row items-center justify-between p-0",
          showTrafficLightSpace ? "pl-21" : "pl-2"
        )}
      >
        <SidebarTrigger
          className="no-drag h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100"
          size="icon-xs"
        />
        <div className="flex-1" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) =>
                "external" in item ? (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      onClick={() => openExternalLink(item.to)}
                      tooltip={item.title}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : (
                  <SidebarMenuItem key={item.to}>
                    <Link
                      className="flex w-full items-center gap-2 rounded-md p-2 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                      data-active={pathname === item.to}
                      to={item.to}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuItem>
                )
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center justify-between">
          <LangToggle />
          <ToggleTheme />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
