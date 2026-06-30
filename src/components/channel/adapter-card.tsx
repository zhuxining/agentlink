import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useDisableAdapter } from "@/hooks/use-channels";
import type { AdapterStatus as AdapterStatusType } from "@/ipc/channel/schemas";
import { AdapterEnvDialog } from "./adapter-env-dialog";
import { AdapterStatus } from "./adapter-status";

interface Props {
  adapter: AdapterStatusType;
}

export function AdapterCard({ adapter }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const disableMutation = useDisableAdapter();

  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-sm">{adapter.name}</span>
            <AdapterStatus
              error={adapter.errorMessage}
              status={adapter.status}
            />
          </div>
          <p className="mt-0.5 text-muted-foreground text-xs">
            {adapter.description}
          </p>
        </div>
        <Switch
          checked={adapter.enabled}
          onCheckedChange={(checked) => {
            if (checked) {
              setDialogOpen(true);
            } else {
              disableMutation.mutate({ slug: adapter.slug });
            }
          }}
        />
      </CardContent>
      <AdapterEnvDialog
        name={adapter.name}
        onOpenChange={setDialogOpen}
        open={dialogOpen}
        slug={adapter.slug}
      />
    </Card>
  );
}
