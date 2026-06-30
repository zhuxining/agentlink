import { createFileRoute } from "@tanstack/react-router";
import AcpServerPage from "@/components/settings/acp-server-page";

export const Route = createFileRoute("/settings")({
  component: AcpServerPage,
});
