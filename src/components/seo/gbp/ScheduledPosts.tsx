import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarCheck, FileText, MapPin } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClinicGBPConfigs } from "@/hooks/useGeoClusters";
import { MONTH_NAMES } from "@/lib/gbp/hookRotation";
import { motion } from "framer-motion";

interface ScheduledPostsProps {
  clinicId?: string | null;
}

const POST_TYPE_LABELS: Record<string, string> = {
  WHATS_NEW: "What's New",
  PRODUCTS_SERVICES: "Products & Services",
};

export function ScheduledPosts({ clinicId: navClinicId }: ScheduledPostsProps) {
  const { configs } = useClinicGBPConfigs();
  const [internalClinicId, setInternalClinicId] = useState<string | null>(null);
  const selectedClinicId = navClinicId || internalClinicId;
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [clinicNames, setClinicNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (configs.length > 0) {
      const ids = configs.map(c => c.clinic_id);
      supabase.from("clinics").select("id, clinic_name").in("id", ids).then(({ data }) => {
        if (data) {
          const map: Record<string, string> = {};
          data.forEach(c => { map[c.id] = c.clinic_name; });
          setClinicNames(map);
        }
      });
    }
  }, [configs]);

  const { data: approvedPosts = [], isLoading } = useQuery({
    queryKey: ["gbp-scheduled-posts", selectedClinicId, selectedMonth, selectedYear],
    queryFn: async () => {
      if (!selectedClinicId) return [];
      const { data, error } = await supabase
        .from("gbp_post_history")
        .select("*")
        .eq("clinic_id", selectedClinicId)
        .eq("month", selectedMonth)
        .eq("year", selectedYear)
        .in("status", ["approved", "scheduled", "published", "failed"])
        .order("week_number");
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedClinicId,
  });

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return [current, current + 1];
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {!navClinicId && (
          <Select value={selectedClinicId || ""} onValueChange={setInternalClinicId}>
            <SelectTrigger className="w-[220px] h-9 text-xs">
              <SelectValue placeholder="Select clinic" />
            </SelectTrigger>
            <SelectContent>
              {configs.map(c => (
                <SelectItem key={c.clinic_id} value={c.clinic_id} className="text-xs">
                  {clinicNames[c.clinic_id] || c.clinic_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={String(selectedMonth)} onValueChange={v => setSelectedMonth(Number(v))}>
          <SelectTrigger className="w-[130px] h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTH_NAMES.map((m, i) => (
              <SelectItem key={i} value={String(i + 1)} className="text-xs">{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
          <SelectTrigger className="w-[100px] h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map(y => (
              <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : approvedPosts.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-dashed border-border/60">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-4">
                <CalendarCheck className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">No Scheduled Posts</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                No approved posts for {MONTH_NAMES[selectedMonth - 1]} {selectedYear} yet. Posts will appear here once approved by the team.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {approvedPosts.map((post: any) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Card className="h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-200">
                      Week {post.week_number}
                    </Badge>
                    <div className="flex items-center gap-1.5">
                      {post.status === "published" && (
                        <Badge className="text-[10px] bg-primary/15 text-primary border-primary/30">Published</Badge>
                      )}
                      {post.status === "scheduled" && (
                        <Badge className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-200">Scheduled</Badge>
                      )}
                      {post.status === "failed" && (
                        <Badge className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">Failed</Badge>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        {POST_TYPE_LABELS[post.post_type] || post.post_type}
                      </Badge>
                    </div>
                  </div>
                  {post.scheduled_publish_at && post.status !== "published" && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Publishes {new Date(post.scheduled_publish_at).toLocaleString()}
                    </p>
                  )}
                  {post.published_at && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Published {new Date(post.published_at).toLocaleString()}
                    </p>
                  )}
                  {post.publish_error && (
                    <p className="text-[10px] text-destructive mt-1 line-clamp-2">⚠ {post.publish_error}</p>
                  )}
                  <CardTitle className="text-sm mt-2">{post.topic}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
                    {post.post_content}
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      {post.primary_keyword}
                    </span>
                    {post.local_landmark_used && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {post.local_landmark_used}
                      </span>
                    )}
                  </div>
                  {post.cta_text && (
                    <div className="pt-1 border-t border-border/40">
                      <p className="text-xs font-medium text-primary">{post.cta_text}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
