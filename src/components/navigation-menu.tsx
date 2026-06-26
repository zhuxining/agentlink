import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { openExternalLink } from "@/actions/shell";
import {
  NavigationMenu as NavigationMenuBase,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";

export default function NavigationMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <NavigationMenuBase className="px-2 text-muted-foreground">
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuLink
            className={navigationMenuTriggerStyle()}
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigate({ to: "/" });
            }}
          >
            {t("titleHomePage")}
          </NavigationMenuLink>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink
            className={navigationMenuTriggerStyle()}
            href="/second"
            onClick={(e) => {
              e.preventDefault();
              navigate({ to: "/second" });
            }}
          >
            {t("titleSecondPage")}
          </NavigationMenuLink>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink
            className={navigationMenuTriggerStyle()}
            href="https://docs.luanroger.dev/agentlink"
            onClick={(e) => {
              e.preventDefault();
              openExternalLink("https://docs.luanroger.dev/agentlink");
            }}
          >
            {t("documentation")}
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenuBase>
  );
}
