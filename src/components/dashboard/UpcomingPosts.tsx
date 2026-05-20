import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Facebook, Instagram } from "lucide-react";
import type { DashboardFilter } from "./AdminDashboard";
// Card removed in iOS pass
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface UpcomingPost {
  id: string;
  title: string;
  platform: string;
  status: string;
  scheduled_date: string;
  clinic_id: string | null;
  clinic_name: string;
}

const platformConfig = (platform: string) => {
  if (platform.toLowerCase().includes("instagram"))
    return { icon: Instagram, color: "border-l-pink-500", label: "IG" };
  return { icon: Facebook, color: "border-l-blue-500", label: "FB" };
};

const statusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "approved":
    case "published": return "default";
    case "pending": return "outline";
    case "rejected": return "destructive";
    default: return "secondary";
  }
};

export default function UpcomingPosts({ filter }: { filter?: DashboardFilter } = {}) {
  const [allPosts, setAllPosts] = useState<UpcomingPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const today = new Date().toISOString().split("T")[0];
      // Fetch a bit more so client-side filter still has rows to show
      const { data } = await supabase
        .from("content_posts")
        .select("id, title, platform, status, scheduled_date, clinic_id, clinics(clinic_name)")
        .gte("scheduled_date", today)
        .order("scheduled_date", { ascending: true })
        .limit(40);

      const mapped: UpcomingPost[] = (data || []).map((p: any) => ({
        id: p.id,
        title: p.title,
        platform: p.platform,
        status: p.status,
        scheduled_date: p.scheduled_date,
        clinic_id: p.clinic_id || null,
        clinic_name: p.clinics?.clinic_name || "Unknown",
      }));
      setAllPosts(mapped);
      setLoading(false);
    };
    fetch();
  }, []);

  const posts = allPosts
    .filter(p => {
      if (filter?.clinicId && p.clinic_id !== filter.clinicId) return false;
      if (filter?.status === "pending" && p.status !== "pending") return false;
      return true;
    })
    .slice(0, 7);

  if (loading) return null;

  return (
    <Card className="border-border/60">
      <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">Upcoming Posts</h3>
        <Link to="/content-calendar">
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-primary">
            Calendar <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      </div>
      <CardContent className="p-0">
        {posts.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground mb-2">No upcoming posts scheduled.</p>
            <Link to="/content-calendar">
              <Button size="sm" variant="outline" className="text-xs">Schedule a Post</Button>
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {posts.map((post) => {
              const pcfg = platformConfig(post.platform);
              const PIcon = pcfg.icon;
              return (
                <li key={post.id} className={cn(
                  "flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors border-l-2",
                  pcfg.color
                )}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <PIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{post.title}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{post.clinic_name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-muted-foreground hidden sm:inline tabular-nums">
                      {format(parseISO(post.scheduled_date), "MMM d")}
                    </span>
                    <Badge variant={statusVariant(post.status)} className="rounded-full text-[10px]">{post.status}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
