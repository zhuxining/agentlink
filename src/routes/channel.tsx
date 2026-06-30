import { createFileRoute } from "@tanstack/react-router";
import ChannelPage from "@/components/channel/channel-page";

export const Route = createFileRoute("/channel")({
  component: ChannelPage,
});
