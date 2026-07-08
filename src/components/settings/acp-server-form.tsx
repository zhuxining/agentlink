import { useCallback, useState } from "react";
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
import { useAddAcpServer } from "@/hooks/use-acp-servers";

/** 支持双引号、单引号的简易 shell 分割实现 */
function splitArgs(input: string): string[] {
  const args: string[] = [];
  const re = /[^\s"']+|["']([^"']*)["']/g;
  const trimmed = input.trim();
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: required for regex exec in loop
  while ((match = re.exec(trimmed)) !== null) {
    args.push(match[1] ?? match[0]);
  }
  return args;
}

interface Props {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function AcpServerForm({ open, onOpenChange }: Props) {
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [argsStr, setArgsStr] = useState("");
  const mutation = useAddAcpServer();

  const handleAdd = useCallback(async () => {
    const id = `acp-${Date.now()}`;
    const args = splitArgs(argsStr);
    await mutation.mutateAsync({ args, command, id, name });
    setName("");
    setCommand("");
    setArgsStr("");
    onOpenChange(false);
  }, [argsStr, command, mutation, name, onOpenChange]);

  const handleCancel = useCallback(() => onOpenChange(false), [onOpenChange]);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value),
    []
  );
  const handleCommandChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setCommand(e.target.value),
    []
  );
  const handleArgsChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setArgsStr(e.target.value),
    []
  );

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>添加 ACP Server</DialogTitle>
          <DialogDescription>
            配置要连接的 Agent Client Protocol 服务器
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-4">
          <div className="space-y-1">
            <Label htmlFor="acp-name">名称</Label>
            <Input
              id="acp-name"
              onChange={handleNameChange}
              placeholder="如: Claude Agent"
              value={name}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="acp-cmd">命令</Label>
            <Input
              id="acp-cmd"
              onChange={handleCommandChange}
              placeholder="如: npx"
              value={command}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="acp-args">参数 (空格分隔)</Label>
            <Input
              id="acp-args"
              onChange={handleArgsChange}
              placeholder="如: @anthropic/claude-agent"
              value={argsStr}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleCancel} variant="outline">
            取消
          </Button>
          <Button
            disabled={mutation.isPending || !name || !command}
            onClick={handleAdd}
          >
            添加
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
