import { getAdapter } from "chat/adapters";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEnableAdapter } from "@/hooks/use-channels";

interface Props {
  name: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  slug: string;
}

export function AdapterEnvDialog({ slug, name, open, onOpenChange }: Props) {
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const mutation = useEnableAdapter();
  const meta = getAdapter(slug);
  const envVars = meta?.env
    ? [...(meta.env.required ?? []), ...(meta.env.optional ?? [])]
    : [];

  const handleEnable = async () => {
    await mutation.mutateAsync({ slug, env: envValues });
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>配置 {name}</DialogTitle>
          <DialogDescription>请填写适配器所需的环境变量</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-4">
          {envVars.map((v) => (
            <div className="space-y-1" key={v.key}>
              <Label htmlFor={`env-${v.key}`}>
                {v.key}
                {v.secret && (
                  <span className="ml-1 text-destructive text-xs">(密钥)</span>
                )}
              </Label>
              <Input
                id={`env-${v.key}`}
                onChange={(e) =>
                  setEnvValues((p) => ({ ...p, [v.key]: e.target.value }))
                }
                placeholder={v.description}
                type={v.secret ? "password" : "text"}
                value={envValues[v.key] ?? ""}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            取消
          </Button>
          <Button disabled={mutation.isPending} onClick={handleEnable}>
            启用
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
