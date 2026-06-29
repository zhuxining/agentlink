import { useLocation, useNavigate } from "@tanstack/react-router";
import { BookOpen, ExternalLink, House } from "lucide-react";
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
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { isMobile, state } = useSidebar();
  const platform = usePlatform();

  const isMacOS = platform === "darwin";
  const isExpanded = state === "expanded";
  const showTrafficLightSpace = isMacOS && isExpanded && !isMobile;

  const navItems = [
    { title: t("titleHomePage"), to: "/", icon: House },
    { title: t("titleSecondPage"), to: "/second", icon: BookOpen },
    {
      title: t("documentation"),
      to: "https://docs.luanroger.dev/agentlink",
      icon: ExternalLink,
      external: true,
    },
  ];

  return (
    <Sidebar className={className} collapsible="offcanvas" {...props}>
      <SidebarHeader
        className={cn(
          "group draglayer flex h-10 flex-row items-center justify-between p-0",
          showTrafficLightSpace ? "pl-[84px]" : "pl-2"
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
              {navItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    isActive={"external" in item ? false : pathname === item.to}
                    onClick={() => {
                      if ("external" in item) {
                        openExternalLink(item.to);
                      } else {
                        navigate({ to: item.to });
                      }
                    }}
                    tooltip={item.title}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
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
