import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, FileText, Clock, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ContentRequestCard } from "@/components/content-requests/ContentRequestCard";
import { StatsCard } from "@/components/StatsCard";

type RegeneratingMap = Record<string, boolean>;

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

export default function ContentRequestsContent({ clinicId }: { clinicId?: string }) {
  const { role } = useUserRole();
  const { user } = useAuth();
  const [requests, setRequests] = useState<ContentRequest[]>([]);
  const [versions, setVersions] = useState<Record<string, ContentVersion[]>>({});
  const [clinics, setClinics] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState<RegeneratingMap>({});
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    const isInitial = requests.length === 0;
    if (isInitial) setLoading(true);

    let query = supabase
      .from("content_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (clinicId) {
      query = query.eq("clinic_id", clinicId);
    }

    if (role === "admin") {
      query = query.in("status", ["concierge_preferred", "admin_approved", "client_selected", "final_approved"]);
    }

    const { data: reqData } = await query;
    const reqs = (reqData || []) as unknown as ContentRequest[];
    setRequests(reqs);

    if (reqs.length > 0) {
      const reqIds = reqs.map(r => r.id);
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

      const clinicIds = [...new Set(reqs.map(r => r.clinic_id))];
      const { data: clinicData } = await supabase
        .from("clinics")
        .select("id, clinic_name")
        .in("id", clinicIds);
      const map: Record<string, string> = {};
      (clinicData || []).forEach(c => { map[c.id] = c.clinic_name; });
      setClinics(map);

      setGeneratingIds(prev => {
        const next = new Set(prev);
        for (const id of next) {
          if (grouped[id] && grouped[id].length > 0) next.delete(id);
        }
        return next;
      });
    }
    setLoading(false);
  }, [role, clinicId]);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel("content-versions-changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "content_versions" }, () => {
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [role, user]);

  const sendForReview = async (requestId: string, versionId: string) => {
    await supabase.from("content_versions").update({ concierge_preferred: true }).eq("id", versionId);
    await supabase.from("content_requests").update({ status: "concierge_preferred" }).eq("id", requestId);
    toast.success("Sent for review!");
    fetchData();
  };

  const adminApprove = async (requestId: string, versionId: string) => {
    await supabase.from("content_versions").update({ admin_approved: true }).eq("id", versionId);
    const now = new Date();
    const autoApproveAt = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("content_requests").update({
      status: "admin_approved",
      sent_to_client_at: now.toISOString(),
      auto_approve_at: autoApproveAt,
    } as any).eq("id", requestId);
    toast.success("Content approved! Sent to client for selection. Auto-approves in 5 days.");
    fetchData();
  };

  const clientSelect = async (requestId: string, versionId: string, clinicId: string) => {
    await supabase.from("content_versions").update({ client_selected: true }).eq("id", versionId);
    await supabase.from("content_requests").update({ status: "client_selected" }).eq("id", requestId);
    toast.success("Selection submitted! Awaiting final admin approval.");
    fetchData();
  };

  const regenerateContent = async (requestId: string) => {
    const req = requests.find(r => r.id === requestId);
    if (!req) return;
    setRegenerating(prev => ({ ...prev, [requestId]: true }));
    setGeneratingIds(prev => new Set(prev).add(requestId));
    try {
      await supabase.from("content_versions").delete().eq("content_request_id", requestId);
      await supabase.from("content_requests").update({ status: "generated" }).eq("id", requestId);
      const { data, error } = await supabase.functions.invoke("generate-content", {
        body: { clinic_id: req.clinic_id, intake_data: req.intake_data },
      });
      if (error) throw error;
      const errorList = data?.errors || [];
      if (errorList.length > 0 && (!data?.versions || data.versions.length === 0)) {
        toast.error("Regeneration failed: " + errorList.map((e: any) => `${e.model}: ${e.error}`).join("; "));
      } else {
        toast.success("Content regenerated successfully!");
      }
    } catch (err: any) {
      toast.error("Regeneration failed: " + (err.message || "Unknown error"));
    } finally {
      setRegenerating(prev => ({ ...prev, [requestId]: false }));
      fetchData();
    }
  };

  const totalRequests = requests.length;
  const pendingCount = requests.filter(r => !["final_approved", "client_selected"].includes(r.status)).length;
  const completedCount = requests.filter(r => r.status === "final_approved").length;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Stats Row */}
      {!loading && totalRequests > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatsCard title="Total Requests" value={totalRequests} icon={FileText} index={0} />
          <StatsCard title="Pending Review" value={pendingCount} icon={Clock} index={1} changeType={pendingCount > 0 ? "negative" : "neutral"} change={pendingCount > 0 ? "Needs attention" : "All clear"} />
          <StatsCard title="Completed" value={completedCount} icon={CheckCircle2} index={2} changeType="positive" change={totalRequests > 0 ? `${Math.round((completedCount / totalRequests) * 100)}% completion rate` : ""} />
        </div>
      )}

      {/* Refresh */}
      {!loading && requests.length > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={async () => { setRefreshing(true); await fetchData(); setRefreshing(false); }} disabled={refreshing} className="gap-2">
            <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4">
          {[1, 2].map(i => (
            <Card key={i} className="animate-pulse">
              <div className="h-1 w-full bg-muted" />
              <div className="p-6 space-y-4">
                <div className="h-5 w-48 bg-muted rounded" />
                <div className="h-4 w-32 bg-muted rounded" />
                <div className="grid grid-cols-2 gap-4">
                  <div className="h-40 bg-muted rounded-xl" />
                  <div className="h-40 bg-muted rounded-xl" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : requests.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <div className="mx-auto h-16 w-16 rounded-2xl bg-accent flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <p className="font-semibold text-foreground text-lg mb-1">No content requests yet</p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {role === "client" ? "No content awaiting your approval at the moment."
                : role === "admin" ? "No concierge-preferred content awaiting your review."
                : "Generate content from the Intake tab to get started."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {requests.map((req, idx) => (
            <ContentRequestCard
              key={req.id}
              request={req}
              versions={versions[req.id] || []}
              clinicName={clinics[req.clinic_id] || "Unknown Clinic"}
              role={role}
              index={idx}
              onSendForReview={sendForReview}
              onAdminApprove={adminApprove}
              onClientSelect={clientSelect}
              onRegenerate={regenerateContent}
              isRegenerating={regenerating[req.id] || false}
              isGenerating={generatingIds.has(req.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
