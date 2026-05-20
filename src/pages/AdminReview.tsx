import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ShieldCheck, ChevronDown, Eye, Check, Calendar, FileText, RefreshCw, ThumbsUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReviewSkeleton } from "@/components/DashboardSkeleton";
import { format } from "date-fns";
import { toast } from "sonner";
import { ContentPostCard } from "@/components/content-requests/ContentPostCard";

interface ContentRequest {
  id: string;
  clinic_id: string;
  created_by_concierge_id: string;
  intake_data: any;
  status: string;
  created_at: string;
}

interface ContentVersion {
  id: string;
  content_request_id: string;
  model_name: string;
  generated_content: any;
  concierge_preferred: boolean;
  admin_approved: boolean;
  client_selected: boolean;
  created_at: string;
}

export default function AdminReview() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<ContentRequest[]>([]);
  const [versions, setVersions] = useState<Record<string, ContentVersion[]>>({});
  const [clinics, setClinics] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({});
  const [approving, setApproving] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    const isInitial = requests.length === 0;
    if (isInitial) setLoading(true);

    // Fetch client_selected requests awaiting final admin approval
    const { data: reqData } = await supabase
      .from("content_requests")
      .select("*")
      .eq("status", "client_selected")
      .order("created_at", { ascending: false });

    // Also fetch final_approved for history
    const { data: approvedData } = await supabase
      .from("content_requests")
      .select("*")
      .eq("status", "final_approved")
      .order("created_at", { ascending: false })
      .limit(10);

    const allReqs = [...(reqData || []), ...(approvedData || [])] as unknown as ContentRequest[];
    setRequests(allReqs);

    if (allReqs.length > 0) {
      const reqIds = allReqs.map(r => r.id);
      const { data: verData } = await supabase
        .from("content_versions")
        .select("*")
        .in("content_request_id", reqIds);

      const grouped: Record<string, ContentVersion[]> = {};
      ((verData || []) as unknown as ContentVersion[]).forEach(v => {
        if (!grouped[v.content_request_id]) grouped[v.content_request_id] = [];
        grouped[v.content_request_id].push(v);
      });
      setVersions(grouped);

      const clinicIds = [...new Set(allReqs.map(r => r.clinic_id))];
      const { data: clinicData } = await supabase
        .from("clinics")
        .select("id, clinic_name")
        .in("id", clinicIds);
      const map: Record<string, string> = {};
      (clinicData || []).forEach(c => { map[c.id] = c.clinic_name; });
      setClinics(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel("admin:review")
      .on("postgres_changes", { event: "*", schema: "public", table: "content_requests" }, fetchData)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const finalApprove = async (requestId: string) => {
    const req = requests.find(r => r.id === requestId);
    if (!req) return;

    setApproving(prev => ({ ...prev, [requestId]: true }));

    try {
      // Find the client-selected version
      const reqVersions = versions[requestId] || [];
      const selectedVersion = reqVersions.find(v => v.client_selected);
      if (!selectedVersion) {
        toast.error("No client-selected version found.");
        return;
      }

      const clinicId = req.clinic_id;
      const content = selectedVersion.generated_content as any;
      const posts = content?.posts || [];
      const intake = req.intake_data as any;
      const selectedMonth = intake?.selectedMonth;

      // Determine month boundaries for date clamping
      let monthStart: string | null = null;
      let monthEnd: string | null = null;
      if (selectedMonth) {
        try {
          const parsed = new Date(selectedMonth + " 1");
          if (!isNaN(parsed.getTime())) {
            const year = parsed.getFullYear();
            const month = parsed.getMonth();
            monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
            const lastDay = new Date(year, month + 1, 0).getDate();
            monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
          }
        } catch {}
      }

      // Create posts in content_posts
      for (const post of posts) {
        let scheduledDate = post.suggested_date || null;
        if (scheduledDate && monthStart && monthEnd) {
          if (scheduledDate < monthStart || scheduledDate > monthEnd) {
            scheduledDate = null;
          }
        }

        const { data: insertedPost } = await supabase.from("content_posts").insert({
          clinic_id: clinicId,
          title: post.hook || post.theme || "Untitled Post",
          caption: post.caption || post.main_copy || null,
          platform: (post.platform || "instagram").toLowerCase(),
          content_type: (post.content_type || "IMAGE").toUpperCase(),
          scheduled_date: scheduledDate,
          status: "scheduled",
          workflow_stage: "final_approved",
          tags: [post.goal_type, post.funnel_stage, post.service_highlighted].filter(Boolean),
          compliance_note: post.compliance_note || null,
          content: post.main_copy || null,
        }).select("id").single();

        if (insertedPost) {
          await supabase.from("post_workflow").insert({
            post_id: insertedPost.id,
            stage: "final_approved",
          });

          await supabase.from("post_activity_log").insert({
            post_id: insertedPost.id,
            action: "final_approved",
            actor_id: user?.id || null,
            metadata: { request_id: requestId, version_id: selectedVersion.id },
          });
        }
      }

      // Update request status
      await supabase.from("content_requests")
        .update({ status: "final_approved" })
        .eq("id", requestId);

      toast.success("Content final approved! Posts added to the Content Calendar.");
      fetchData();
    } catch (err: any) {
      toast.error("Approval failed: " + (err.message || "Unknown error"));
    } finally {
      setApproving(prev => ({ ...prev, [requestId]: false }));
    }
  };

  const pendingRequests = requests.filter(r => r.status === "client_selected");
  const completedRequests = requests.filter(r => r.status === "final_approved");

  return (
    <>
      <div className="min-h-full px-4 sm:px-6 py-6">
        <div className="space-y-6">
          <header className="px-1">
            <h1 className="text-[28px] font-bold tracking-tight">Admin Review</h1>
            <p className="text-[13px] text-muted-foreground mt-1 max-w-lg">
              Final review of client-selected content before publishing to the Content Calendar.
            </p>
          </header>

          {/* Refresh */}
          {!loading && requests.length > 0 && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  setRefreshing(true);
                  await fetchData();
                  setRefreshing(false);
                }}
                disabled={refreshing}
                className="gap-2"
              >
                <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                {refreshing ? "Refreshing…" : "Refresh"}
              </Button>
            </div>
          )}

          {loading ? (
            <ReviewSkeleton />
          ) : pendingRequests.length === 0 && completedRequests.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center">
                <div className="mx-auto h-16 w-16 rounded-2xl bg-accent flex items-center justify-center mb-4">
                  <ShieldCheck className="h-8 w-8 text-primary" />
                </div>
                <p className="font-semibold text-foreground text-lg mb-1">No content awaiting review</p>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Client-selected content will appear here for your final approval before being added to the Content Calendar.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Pending section */}
              {pendingRequests.length > 0 && (
                <div className="space-y-4">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                    Awaiting Final Approval ({pendingRequests.length})
                  </h2>
                  {pendingRequests.map((req, idx) => (
                    <ReviewCard
                      key={req.id}
                      request={req}
                      versions={versions[req.id] || []}
                      clinicName={clinics[req.clinic_id] || "Unknown Clinic"}
                      index={idx}
                      isOpen={openCards[req.id] ?? false}
                      onToggle={() => setOpenCards(prev => ({ ...prev, [req.id]: !prev[req.id] }))}
                      onApprove={() => finalApprove(req.id)}
                      isApproving={approving[req.id] || false}
                      isPending
                    />
                  ))}
                </div>
              )}

              {/* Completed section */}
              {completedRequests.length > 0 && (
                <div className="space-y-4">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                    Recently Approved ({completedRequests.length})
                  </h2>
                  {completedRequests.map((req, idx) => (
                    <ReviewCard
                      key={req.id}
                      request={req}
                      versions={versions[req.id] || []}
                      clinicName={clinics[req.clinic_id] || "Unknown Clinic"}
                      index={idx}
                      isOpen={openCards[req.id] ?? false}
                      onToggle={() => setOpenCards(prev => ({ ...prev, [req.id]: !prev[req.id] }))}
                      isPending={false}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// Sub-component for each review card
function ReviewCard({
  request,
  versions,
  clinicName,
  index,
  isOpen,
  onToggle,
  onApprove,
  isApproving,
  isPending,
}: {
  request: ContentRequest;
  versions: ContentVersion[];
  clinicName: string;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
  onApprove?: () => void;
  isApproving?: boolean;
  isPending: boolean;
}) {
  const intake = request.intake_data as any;
  const selectedVersion = versions.find(v => v.client_selected);
  const content = selectedVersion?.generated_content as any;
  const posts = content?.posts || [];

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <Card
        className={cn(
          "animate-fade-in overflow-hidden transition-all duration-300 border-l-4",
          isPending ? "border-l-warning" : "border-l-success"
        )}
        style={{ animationDelay: `${index * 60}ms`, animationFillMode: "both" }}
      >
        <CardHeader className="px-4 sm:px-6 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-bold text-foreground">{clinicName}</h3>
                <Badge className={cn(
                  "text-[10px] font-semibold border-0 rounded-full px-2.5 py-0.5",
                  isPending ? "bg-warning/15 text-warning" : "bg-success/15 text-success"
                )}>
                  {isPending ? "⏳ Awaiting Approval" : "✅ Approved"}
                </Badge>
              </div>
              <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                <span>{format(new Date(request.created_at), "MMM d, yyyy")}</span>
                {intake?.selectedMonth && (
                  <Badge variant="outline" className="text-[10px] py-0 rounded-full">
                    <Calendar className="h-3 w-3 mr-1" /> {intake.selectedMonth}
                  </Badge>
                )}
                {posts.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] py-0 rounded-full">
                    <FileText className="h-3 w-3 mr-1" /> {posts.length} posts
                  </Badge>
                )}
                {selectedVersion && (
                  <Badge className="bg-primary/10 text-primary text-[10px] py-0 rounded-full border-0">
                    <Check className="h-3 w-3 mr-1" /> Client Approved
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {posts.length > 0 && (
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Eye className="h-3.5 w-3.5" />
                    {isOpen ? "Hide" : "View"} Content
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
                  </Button>
                </CollapsibleTrigger>
              )}
              {isPending && onApprove && (
                <Button
                  size="sm"
                  className="bg-gradient-to-r from-success to-success/90 hover:from-success/90 hover:to-success/80 text-success-foreground shadow-sm"
                  onClick={onApprove}
                  disabled={isApproving}
                >
                  {isApproving ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 mr-1.5" />
                  )}
                  {isApproving ? "Approving…" : "Final Approve"}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CollapsibleContent>
          {posts.length > 0 && (
            <CardContent className="px-4 sm:px-6 pt-0">
              <div className="rounded-lg border border-border/40 bg-muted/20 p-4">
                <div className="flex flex-col">
                  {posts.map((post: any, i: number) => (
                    <ContentPostCard
                      key={i}
                      post={post}
                      index={i}
                      isLast={i === posts.length - 1}
                    />
                  ))}
                </div>
              </div>
            </CardContent>
          )}
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
