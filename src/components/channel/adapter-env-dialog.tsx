import { getAdapter } from "chat/adapters";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  const [optionalOpen, setOptionalOpen] = useState(false);
  const mutation = useEnableAdapter();
  const meta = getAdapter(slug);
  const required = meta?.env?.required ?? [];
  const optional = meta?.env?.optional ?? [];

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
          {required.map((v) => (
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

          {optional.length > 0 && (
            <Collapsible onOpenChange={setOptionalOpen} open={optionalOpen}>
              <CollapsibleTrigger className="flex w-full items-center gap-1 rounded px-1 py-1.5 text-muted-foreground text-xs hover:bg-muted/50">
                {optionalOpen ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
                可选配置 ({optional.length})
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-3">
                {optional.map((v) => (
                  <div className="space-y-1" key={v.key}>
                    <Label htmlFor={`env-${v.key}`}>
                      {v.key}
                      {v.secret && (
                        <span className="ml-1 text-destructive text-xs">
                          (密钥)
                        </span>
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
              </CollapsibleContent>
            </Collapsible>
          )}
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
