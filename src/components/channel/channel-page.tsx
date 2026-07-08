import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAdapters } from "@/hooks/use-channels";
import { AdapterCard } from "./adapter-card";

export default function ChannelPage() {
  const { t } = useTranslation();
  const { data: adapters, isLoading } = useAdapters();

  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("channel.adapters", "渠道管理")}</CardTitle>
          <CardDescription>
            {t("channel.adaptersDesc", "配置和管理 Chat SDK 平台适配器")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中...
            </div>
          ) : null}
          <div className="space-y-3">
            {adapters?.map((a) => (
              <AdapterCard adapter={a} key={a.slug} />
            ))}
          </div>
          {adapters?.length === 0 && !isLoading && (
            <p className="py-4 text-center text-muted-foreground text-sm">
              暂无可用适配器
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
