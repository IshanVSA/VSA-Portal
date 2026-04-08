import { useMonthlySignals } from "@/hooks/useMonthlySignals";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { FileText, ImagePlus } from "lucide-react";

interface Props {
  clinicId: string | undefined;
}

const STOCK_LIMIT = 12;

export default function PostLimitTracker({ clinicId }: Props) {
  const { signals } = useMonthlySignals(clinicId);

  const stockCount = signals?.stock_post_count || 0;
  const clientAssetCount = signals?.client_asset_post_count || 0;
  const pct = Math.min(100, Math.round((stockCount / STOCK_LIMIT) * 100));
  const remaining = Math.max(0, STOCK_LIMIT - stockCount);

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Monthly Post Usage
          </p>
          <Badge variant={remaining === 0 ? "destructive" : remaining <= 3 ? "secondary" : "outline"} className="text-xs">
            {remaining} stock posts remaining
          </Badge>
        </div>
        <Progress value={pct} className="h-2 mb-3" />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <FileText className="h-3 w-3" /> {stockCount}/{STOCK_LIMIT} stock posts
          </span>
          <span className="flex items-center gap-1">
            <ImagePlus className="h-3 w-3" /> {clientAssetCount} client asset posts (unlimited)
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
