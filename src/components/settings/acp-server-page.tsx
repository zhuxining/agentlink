import { Loader2, Plug, Plus, Trash2, Unplug } from "lucide-react";
import { useState } from "react";
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

export default function AcpServerPage() {
  const { t } = useTranslation();
  const [formOpen, setFormOpen] = useState(false);
  const { data: servers, isLoading } = useAcpServers();
  const removeMutation = useRemoveAcpServer();
  const connectMutation = useConnectAcpServer();
  const disconnectMutation = useDisconnectAcpServer();

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">
          {t("settings.acp", "ACP Server 管理")}
        </h2>
        <Button onClick={() => setFormOpen(true)} size="sm">
          <Plus className="mr-1 h-4 w-4" />
          添加
        </Button>
      </div>
      {isLoading && (
        <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载中...
        </div>
      )}
      <div className="space-y-3">
        {servers?.map((s) => (
          <Card key={s.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{s.name}</span>
                  <Badge
                    className="text-xs"
                    variant={s.status === "connected" ? "default" : "outline"}
                  >
                    {s.status}
                  </Badge>
                </div>
                <p className="mt-0.5 text-muted-foreground text-xs">
                  {s.command} {s.args.join(" ")}
                </p>
              </div>
              <div className="flex gap-1">
                {s.status === "connected" ? (
                  <Button
                    onClick={() => disconnectMutation.mutate({ id: s.id })}
                    size="sm"
                    variant="outline"
                  >
                    <Unplug className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    disabled={connectMutation.isPending}
                    onClick={() => connectMutation.mutate({ id: s.id })}
                    size="sm"
                    variant="outline"
                  >
                    <Plug className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  onClick={() => removeMutation.mutate({ id: s.id })}
                  size="sm"
                  variant="outline"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <AcpServerForm onOpenChange={setFormOpen} open={formOpen} />
    </div>
  );
}
