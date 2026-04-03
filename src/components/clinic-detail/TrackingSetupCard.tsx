import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Code, Copy, CheckCircle, Activity } from "lucide-react";
import { toast } from "sonner";

interface TrackingSetupCardProps {
  clinicId: string;
}

export function TrackingSetupCard({ clinicId }: TrackingSetupCardProps) {
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<{ total: number; lastEvent: string | null }>({ total: 0, lastEvent: null });

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const snippet = `<script src="${supabaseUrl}/functions/v1/track-pageview?clinic=${clinicId}"></script>`;

  useEffect(() => {
    const fetchStats = async () => {
      const { count } = await (supabase as any)
        .from("website_pageviews")
        .select("*", { count: "exact", head: true })
        .eq("clinic_id", clinicId);

      const { data: latest } = await (supabase as any)
        .from("website_pageviews")
        .select("created_at")
        .eq("clinic_id", clinicId)
        .order("created_at", { ascending: false })
        .limit(1) as { data: { created_at: string }[] | null };

      setStats({
        total: count || 0,
        lastEvent: latest?.[0]?.created_at || null,
      });
    };
    fetchStats();
  }, [clinicId]);

  const handleCopy = () => {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    toast.success("Tracking snippet copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Code className="h-4 w-4" />
          Website Tracking
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Paste this script tag before the closing <code className="text-xs bg-muted px-1 py-0.5 rounded">&lt;/body&gt;</code> tag on the clinic's website to start tracking page views.
        </p>

        <div className="relative">
          <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all text-foreground">
            {snippet}
          </pre>
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-1.5 right-1.5"
            onClick={handleCopy}
          >
            {copied ? <CheckCircle className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Total views:</span>
            <Badge variant="secondary">{stats.total.toLocaleString()}</Badge>
          </div>
          {stats.lastEvent && (
            <div className="text-xs text-muted-foreground">
              Last event: {new Date(stats.lastEvent).toLocaleString()}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
