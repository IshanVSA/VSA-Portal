import { useState, useEffect, useMemo } from "react";
import { useSM2Generation } from "@/hooks/useSM2Generation";
import { useMonthlySignals } from "@/hooks/useMonthlySignals";
import { useBrandDNA } from "@/hooks/useBrandDNA";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Sparkles, RefreshCw, FileText, Eye, AlertTriangle, CheckCircle, Clock, Send, TrendingUp, Heart, Share2, MessageCircle, CalendarDays, Pencil } from "lucide-react";
import HtmlEditorDialog from "./HtmlEditorDialog";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  clinicId: string | undefined;
}

interface PerformanceData {
  post_number: number;
  platform: string;
  likes: number;
  shares: number;
  comments: number;
  reach: number;
}

export default function ContentGenerationTab({ clinicId }: Props) {
  const { dna } = useBrandDNA(clinicId);
  const { signals, upsertSignals, currentMonth } = useMonthlySignals(clinicId);
  const { generations, currentGeneration, generate, sendToClient, isLoading } = useSM2Generation(clinicId);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [clinicNews, setClinicNews] = useState("");
  const [fbSpecific, setFbSpecific] = useState("");
  const [budget, setBudget] = useState("300");
  const [viewingHtml, setViewingHtml] = useState<string | null>(null);
  const [editingHtml, setEditingHtml] = useState<string | null>(null);
  const [topPerformers, setTopPerformers] = useState<PerformanceData[]>([]);

  const dnaScore = dna?.completeness_score || 0;
  const canGenerate = dnaScore >= 50;

  // Fetch top performers
  useEffect(() => {
    if (!clinicId) return;
    const fetchPerformance = async () => {
      const { data } = await supabase
        .from("sm2_post_performance")
        .select("post_number, platform, likes, shares, comments, reach")
        .eq("clinic_id", clinicId)
        .order("reach", { ascending: false })
        .limit(5);
      setTopPerformers((data as PerformanceData[]) || []);
    };
    fetchPerformance();
  }, [clinicId]);

  const handleGenerate = async () => {
    await upsertSignals.mutateAsync({
      clinic_news_this_month: clinicNews || "NONE",
      facebook_specific_this_month: fbSpecific || "",
      monthly_budget: parseFloat(budget) || 300,
    } as any);
    setPreflightOpen(false);
    generate.mutate(currentMonth);
  };

  const monthLabel = (() => {
    const [y, m] = currentMonth.split("-");
    return format(new Date(parseInt(y), parseInt(m) - 1), "MMMM yyyy");
  })();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Content Generation</h2>
          <p className="text-xs text-muted-foreground">SM2 DNA-Aware Engine &middot; {monthLabel}</p>
        </div>
        <div className="flex gap-2">
          {currentGeneration?.html_file_path && (
            <Button variant="outline" size="sm" onClick={() => setViewingHtml(currentGeneration.html_file_path)} className="gap-2">
              <Eye className="h-4 w-4" /> View Content
            </Button>
          )}
          <Dialog open={preflightOpen} onOpenChange={setPreflightOpen}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={!canGenerate || generate.isPending} className="gap-2">
                {generate.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {generate.isPending ? "Generating..." : "Generate Content"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Pre-Generation Setup — {monthLabel}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="flex items-center gap-2 p-3 rounded-lg border">
                  {dnaScore >= 70 ? <CheckCircle className="h-5 w-5 text-green-500" /> : <AlertTriangle className="h-5 w-5 text-amber-500" />}
                  <div>
                    <p className="text-sm font-medium">DNA Completeness: {dnaScore}%</p>
                    <p className="text-xs text-muted-foreground">
                      {dnaScore >= 90 ? "Full generation ready" : dnaScore >= 70 ? "Generate with warnings" : dnaScore >= 50 ? "Limited generation" : "Cannot generate"}
                    </p>
                  </div>
                </div>

                {/* Statutory Holidays Preview */}
                {signals?.statutory_holidays && (signals.statutory_holidays as any[]).length > 0 && (
                  <div className="p-3 rounded-lg border bg-muted/20">
                    <div className="flex items-center gap-2 mb-2">
                      <CalendarDays className="h-4 w-4 text-primary" />
                      <p className="text-sm font-medium">Statutory Holidays This Month</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(signals.statutory_holidays as any[]).map((h: any, i: number) => (
                        <Badge key={i} variant="outline" className="text-[10px]">
                          {h.name}{h.day ? ` (${h.day})` : ""}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1.5">Auto-populated from clinic province. Holidays will be respected in content scheduling.</p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Clinic News This Month</Label>
                  <Textarea placeholder="New staff, equipment, renovations, awards... Type NONE if nothing." value={clinicNews} onChange={(e) => setClinicNews(e.target.value)} rows={3} />
                </div>
                <div className="space-y-2">
                  <Label>Facebook-Specific This Month</Label>
                  <Textarea placeholder="Local community activity from Facebook groups..." value={fbSpecific} onChange={(e) => setFbSpecific(e.target.value)} rows={2} />
                </div>
                <div className="space-y-2">
                  <Label>Monthly Budget ({signals?.currency || "CAD"})</Label>
                  <Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPreflightOpen(false)}>Cancel</Button>
                <Button onClick={handleGenerate} disabled={generate.isPending} className="gap-2">
                  {generate.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Generate 10 Posts
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {!canGenerate && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <p className="text-sm">DNA Completeness Score is {dnaScore}% (below 50). Complete the Brand DNA profile before generating content.</p>
          </CardContent>
        </Card>
      )}

      {/* Top Performers Card */}
      {topPerformers.length > 0 && (
        <Card className="overflow-hidden animate-fade-in">
          <CardHeader className="border-b border-border/40 bg-muted/20 pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Top Performers
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-2.5">
              {topPerformers.map((p, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-muted-foreground w-5">#{p.post_number}</span>
                    <Badge variant="outline" className="text-[10px]">{p.platform}</Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{p.likes}</span>
                    <span className="flex items-center gap-1"><Share2 className="h-3 w-3" />{p.shares}</span>
                    <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{p.comments}</span>
                    <Badge variant="secondary" className="text-[10px]">{p.reach.toLocaleString()} reach</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Generation History */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">Generation History</h3>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>
        ) : !generations?.length ? (
          <Card>
            <CardContent className="py-8 text-center">
              <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No content has been generated yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {generations.map((gen) => (
              <Card key={gen.id} className="border-border/60">
                <CardContent className="py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <FileText className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {format(new Date(gen.month_year + "-01"), "MMMM yyyy")}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant={gen.generation_confidence_score >= 90 ? "default" : gen.generation_confidence_score >= 70 ? "secondary" : "destructive"} className="text-[10px]">
                            {gen.generation_confidence_score}% confidence
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            DNA {gen.dna_completeness_score}%
                          </Badge>
                          <StatusBadge status={gen.approval_status} />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(gen.created_at), "MMM d, h:mm a")}
                      </span>
                      {gen.html_file_path && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => setViewingHtml(gen.html_file_path)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditingHtml(gen.html_file_path)} title="Edit Content">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                        </Button>
                      )}
                      {gen.approval_status === "pending" && gen.html_file_path && (
                        <Button variant="outline" size="sm" onClick={() => sendToClient.mutate(gen.id)} disabled={sendToClient.isPending} className="gap-1.5 text-xs">
                          <Send className="h-3.5 w-3.5" />
                          Send to Client
                        </Button>
                      )}
                      {gen.sent_to_client_at && (
                        <Badge variant="secondary" className="text-[10px] gap-1">
                          <Send className="h-3 w-3" />
                          Sent {format(new Date(gen.sent_to_client_at), "MMM d")}
                        </Badge>
                      )}
                      {gen.client_feedback && (
                        <Badge variant="destructive" className="text-[10px]">Has Feedback</Badge>
                      )}
                    </div>
                  </div>
                  {gen.client_feedback && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 ml-12">
                      <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                        <MessageCircle className="h-3 w-3" /> Client Feedback
                      </p>
                      <p className="text-sm">{gen.client_feedback}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* HTML Viewer Dialog */}
      {viewingHtml && (
        <HtmlPreviewDialog filePath={viewingHtml} onClose={() => setViewingHtml(null)} />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: typeof CheckCircle }> = {
    pending: { label: "Pending Review", variant: "outline", icon: Clock },
    sent_to_client: { label: "Sent to Client", variant: "secondary", icon: Send },
    approved_client: { label: "Client Approved", variant: "default", icon: CheckCircle },
    approved_auto: { label: "Auto-Approved", variant: "secondary", icon: CheckCircle },
    feedback_submitted: { label: "Client Feedback", variant: "destructive", icon: AlertTriangle },
    rejected: { label: "Rejected", variant: "destructive", icon: AlertTriangle },
  };
  const c = config[status] || config.pending;
  return (
    <Badge variant={c.variant} className="text-[10px] gap-1">
      <c.icon className="h-3 w-3" />
      {c.label}
    </Badge>
  );
}

function HtmlPreviewDialog({ filePath, onClose }: { filePath: string; onClose: () => void }) {
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHtml = async () => {
      try {
        const { data } = supabase.storage.from("department-files").getPublicUrl(filePath);
        const res = await fetch(data.publicUrl);
        if (!res.ok) throw new Error("Failed to fetch");
        let text = await res.text();
        // Always inject a robust tab-switching script at the end
        const robustScript = `<script>
(function(){
  // Override any existing switchTab with a robust version
  window.switchTab = function(tab) {
    // Try multiple possible ID patterns
    var clientIds = ['client-view','clientView','client_view'];
    var qaIds = ['qa-view','qaView','qa_view','team-qa-view','teamQaView','team-qa'];
    function show(ids) { for(var i=0;i<ids.length;i++){var el=document.getElementById(ids[i]);if(el){el.style.display='block';return true;}} return false; }
    function hide(ids) { for(var i=0;i<ids.length;i++){var el=document.getElementById(ids[i]);if(el){el.style.display='none';}} }
    if(tab==='client'){show(clientIds);hide(qaIds);}
    else{hide(clientIds);show(qaIds);}
    // Update active classes on tab buttons
    var buttons = document.querySelectorAll('.tab-button,[onclick*="switchTab"]');
    buttons.forEach(function(b){b.classList.remove('active');});
    if(event&&event.target)event.target.classList.add('active');
  };
})();
</script>`;
        text = text.replace('</body>', robustScript + '</body>');
        setHtmlContent(text);
      } catch (err) {
        console.error("Failed to load HTML preview:", err);
        setHtmlContent("<html><body><p>Failed to load content preview.</p></body></html>");
      } finally {
        setLoading(false);
      }
    };
    fetchHtml();
  }, [filePath]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[85vh]">
        <DialogHeader>
          <DialogTitle>Generated Content Preview</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center flex-1">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <iframe
            srcDoc={htmlContent || ""}
            className="w-full flex-1 rounded-lg border bg-white"
            style={{ height: "calc(85vh - 80px)" }}
            sandbox="allow-same-origin allow-scripts"
            title="SM2 Content Preview"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
