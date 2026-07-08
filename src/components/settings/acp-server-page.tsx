import { Loader2, Plug, Plus, Trash2, Unplug } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  useAcpServers,
  useConnectAcpServer,
  useDisconnectAcpServer,
  useRemoveAcpServer,
} from "@/hooks/use-acp-servers";
import { AcpServerForm } from "./acp-server-form";

interface AcpServerItemProps {
  connectMutation: { mutate: (args: { id: string }) => void };
  connectPending: boolean;
  disconnectMutation: { mutate: (args: { id: string }) => void };
  removeMutation: { mutate: (args: { id: string }) => void };
  server: {
    args: string[];
    command: string;
    id: string;
    name: string;
    status: string;
  };
}

function AcpServerItem({
  server,
  connectMutation,
  connectPending,
  disconnectMutation,
  removeMutation,
}: AcpServerItemProps) {
  const handleDisconnect = useCallback(
    () => disconnectMutation.mutate({ id: server.id }),
    [server.id, disconnectMutation.mutate]
  );
  const handleConnect = useCallback(
    () => connectMutation.mutate({ id: server.id }),
    [server.id, connectMutation.mutate]
  );
  const handleRemove = useCallback(
    () => removeMutation.mutate({ id: server.id }),
    [server.id, removeMutation.mutate]
  );

  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{server.name}</span>
            <Badge
              className="text-xs"
              variant={server.status === "connected" ? "default" : "outline"}
            >
              {server.status}
            </Badge>
          </div>
          <p className="mt-0.5 text-muted-foreground text-xs">
            {server.command} {server.args.join(" ")}
          </p>
        </div>
        <div className="flex gap-1">
          {server.status === "connected" ? (
            <Button onClick={handleDisconnect} size="sm" variant="outline">
              <Unplug className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              disabled={connectPending}
              onClick={handleConnect}
              size="sm"
              variant="outline"
            >
              <Plug className="h-4 w-4" />
            </Button>
          )}
          <Button onClick={handleRemove} size="sm" variant="outline">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AcpServerPage() {
  const { t } = useTranslation();
  const [formOpen, setFormOpen] = useState(false);
  const { data: servers, isLoading } = useAcpServers();
  const removeMutation = useRemoveAcpServer();
  const connectMutation = useConnectAcpServer();
  const disconnectMutation = useDisconnectAcpServer();

  const handleFormOpen = useCallback(() => setFormOpen(true), []);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">
          {t("settings.acp", "ACP Server 管理")}
        </h2>
        <Button onClick={handleFormOpen} size="sm">
          <Plus className="mr-1 h-4 w-4" />
          添加
        </Button>
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载中...
        </div>
      ) : null}
      <div className="space-y-3">
        {servers?.map((s) => (
          <AcpServerItem
            connectMutation={connectMutation}
            connectPending={connectMutation.isPending}
            disconnectMutation={disconnectMutation}
            key={s.id}
            removeMutation={removeMutation}
            server={s}
          />
        ))}
      </div>
      <AcpServerForm onOpenChange={setFormOpen} open={formOpen} />
    </div>
  );
}
