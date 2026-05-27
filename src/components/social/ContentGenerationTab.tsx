import { useState, useEffect, useMemo, useRef } from "react";
import { useSM2Generation, STAGE_LABELS, nextStageLabel } from "@/hooks/useSM2Generation";
import { formatDistanceToNow } from "date-fns";
import { useMonthlySignals } from "@/hooks/useMonthlySignals";
import { useBrandDNA } from "@/hooks/useBrandDNA";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, RefreshCw, FileText, Eye, AlertTriangle, CheckCircle, Clock, Send, TrendingUp, Heart, Share2, MessageCircle, CalendarDays, Pencil, ShieldAlert, ShieldCheck, ChevronLeft, ChevronRight, StopCircle } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import HtmlEditorDialog from "./HtmlEditorDialog";
import SM2CalendarView from "./SM2CalendarView";
import AddPostHeaderButton from "./AddPostHeaderButton";
import ClientContentCalendar from "./ClientContentCalendar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { computeBrandDNAScore } from "@/lib/brand-dna-score";

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

interface ContentSettings {
  promotion_requested: boolean;
  team_spotlight_requested: boolean;
  pricing_on_website: boolean;
  pricing_in_posts: string;
  patient_consent: string;
  end_of_life_content: string;
}

const DEFAULT_SETTINGS: ContentSettings = {
  promotion_requested: false,
  team_spotlight_requested: false,
  pricing_on_website: false,
  pricing_in_posts: "not_requested",
  patient_consent: "NOT_CONFIRMED",
  end_of_life_content: "not_requested",
};

function buildMonthOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ value, label: format(d, "MMMM yyyy") });
  }
  return out;
}

const ACTIVE_GEN_STATUSES = ["queued", "processing", "retrying"];

export default function ContentGenerationTab({ clinicId }: Props) {
  const { dna } = useBrandDNA(clinicId);
  const { generations, currentGeneration, generate, sendCopyForReview, sendFinalForReview, isLoading, pollForCompletion, cancelGeneration } = useSM2Generation(clinicId);
  const [stopTargetId, setStopTargetId] = useState<string | null>(null);

  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const [targetMonth, setTargetMonth] = useState<string>(monthOptions[1]?.value || monthOptions[0].value);
  const [viewingGenerationId, setViewingGenerationId] = useState<string | null>(null);

  const { signals, upsertSignals } = useMonthlySignals(clinicId, targetMonth);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [clinicNews, setClinicNews] = useState("");
  const [fbSpecific, setFbSpecific] = useState("");
  const [budget, setBudget] = useState("300");
  const [viewingHtml, setViewingHtml] = useState<{ generationId: string } | null>(null);
  const [editingHtml, setEditingHtml] = useState<string | null>(null);
  const [topPerformers, setTopPerformers] = useState<PerformanceData[]>([]);
  const [contentSettings, setContentSettings] = useState<ContentSettings>(DEFAULT_SETTINGS);
  const calendarRef = useRef<HTMLDivElement | null>(null);

  // One generation per month — prioritize the one furthest along the client workflow
  // (approved > sent for review > copy approved > ...) over merely newest.
  const sortedGens = useMemo(() => {
    // Higher = further along the client-facing workflow → preferred for display.
    const statusPriority = (s: string | null | undefined): number => {
      switch (s) {
        case "approved_client":
        case "approved_auto": return 100;
        case "sent_for_final_review": return 90;
        case "final_changes_requested": return 85;
        case "copy_approved": return 80;
        case "sent_for_copy_review": return 70;
        case "copy_changes_requested": return 65;
        case "pending": return 50;
        case "processing":
        case "retrying":
        case "queued": return 30;
        case "generation_failed": return 10;
        default: return 40;
      }
    };
    const all = (generations || []).slice().sort((a, b) => {
      if (a.month_year !== b.month_year) return a.month_year < b.month_year ? 1 : -1;
      // Within same month: prefer higher workflow priority, then newest created_at
      const pa = statusPriority(a.approval_status);
      const pb = statusPriority(b.approval_status);
      if (pa !== pb) return pb - pa;
      const ca = new Date((a as any).created_at || 0).getTime();
      const cb = new Date((b as any).created_at || 0).getTime();
      return cb - ca;
    });
    const seen = new Set<string>();
    const deduped: typeof all = [];
    for (const g of all) {
      if (seen.has(g.month_year)) continue;
      seen.add(g.month_year);
      deduped.push(g);
    }
    return deduped;
  }, [generations]);

  // Pick the generation whose calendar should display
  const selectedGen = useMemo(() => {
    if (viewingGenerationId) {
      const found = sortedGens.find((g) => g.id === viewingGenerationId);
      if (found) return found;
      // viewingGenerationId may point to a superseded gen — fall back to same month
      const fromAll = (generations || []).find((g) => g.id === viewingGenerationId);
      if (fromAll) {
        const sameMonth = sortedGens.find((g) => g.month_year === fromAll.month_year);
        if (sameMonth) return sameMonth;
      }
    }
    if (currentGeneration) {
      const sameMonth = sortedGens.find((g) => g.month_year === currentGeneration.month_year);
      if (sameMonth) return sameMonth;
    }
    return sortedGens[0] || null;
  }, [viewingGenerationId, sortedGens, currentGeneration, generations]);

  const selectedIndex = selectedGen ? sortedGens.findIndex((g) => g.id === selectedGen.id) : -1;

  const goPrevGen = () => {
    if (selectedIndex < 0 || selectedIndex >= sortedGens.length - 1) return;
    setViewingGenerationId(sortedGens[selectedIndex + 1].id);
  };
  const goNextGen = () => {
    if (selectedIndex <= 0) return;
    setViewingGenerationId(sortedGens[selectedIndex - 1].id);
  };


  const dnaScore = computeBrandDNAScore(dna as any);
  const canGenerate = dnaScore >= 50;

  // Fetch top performers and content settings
  useEffect(() => {
    if (!clinicId) return;
    const fetchData = async () => {
      const [perfRes, clinicRes] = await Promise.all([
        supabase
          .from("sm2_post_performance")
          .select("post_number, platform, likes, shares, comments, reach")
          .eq("clinic_id", clinicId)
          .order("reach", { ascending: false })
          .limit(5),
        supabase
          .from("clinics")
          .select("content_settings")
          .eq("id", clinicId)
          .maybeSingle(),
      ]);
      setTopPerformers((perfRes.data as PerformanceData[]) || []);
      if (clinicRes.data?.content_settings) {
        setContentSettings(clinicRes.data.content_settings as any);
      }
    };
    fetchData();
  }, [clinicId]);

  const handleGenerate = async () => {
    await upsertSignals.mutateAsync({
      clinic_news_this_month: clinicNews || "NONE",
      facebook_specific_this_month: fbSpecific || "",
      monthly_budget: parseFloat(budget) || 300,
    } as any);
    setPreflightOpen(false);
    generate.mutate(targetMonth, {
      onSuccess: (data: any) => {
        if (data?.generation_id) setViewingGenerationId(data.generation_id);
      },
    });
  };

  const monthLabel = useMemo(() => {
    const [y, m] = targetMonth.split("-");
    return format(new Date(parseInt(y), parseInt(m) - 1), "MMMM yyyy");
  }, [targetMonth]);

  const activeGates = [
    { label: "Promotions", active: contentSettings.promotion_requested },
    { label: "Team Spotlights", active: contentSettings.team_spotlight_requested },
    { label: "Patient Content", active: contentSettings.patient_consent === "CONFIRMED" },
    { label: "Pricing", active: contentSettings.pricing_on_website && contentSettings.pricing_in_posts === "requested" },
    { label: "End-of-Life", active: contentSettings.end_of_life_content === "requested" },
  ];

  return (
    <Tabs defaultValue="pipeline" className="space-y-4">
      <TabsList className="bg-muted/50 h-9">
        <TabsTrigger value="pipeline" className="gap-1.5 text-xs">
          <Sparkles className="h-3.5 w-3.5" /> Content Generation
        </TabsTrigger>
        <TabsTrigger value="calendar" className="gap-1.5 text-xs">
          <CalendarDays className="h-3.5 w-3.5" /> Content Calendar
        </TabsTrigger>
      </TabsList>

      <TabsContent value="calendar" className="mt-0">
        <ClientContentCalendar clinicId={clinicId} />
      </TabsContent>

      <TabsContent value="pipeline" className="mt-0 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Content Generation</h2>
          <p className="text-xs text-muted-foreground">SM2 v2.1 - 8-Agent Pipeline &middot; {monthLabel}</p>
        </div>
        <div className="flex gap-2">
          {selectedGen?.html_file_path && (
            <Button variant="outline" size="sm" onClick={() => setViewingHtml(selectedGen.html_file_path!)} className="gap-2">
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
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Pre-Generation Setup &middot; {monthLabel}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {/* Target Month */}
                <div className="space-y-2">
                  <Label>Target Month</Label>
                  <Select value={targetMonth} onValueChange={setTargetMonth}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {monthOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Posts and statutory holidays will be generated for this month.
                  </p>
                </div>
                {/* DNA Score */}
                <div className="flex items-center gap-2 p-3 rounded-lg border">
                  {dnaScore >= 70 ? <CheckCircle className="h-5 w-5 text-green-500" /> : <AlertTriangle className="h-5 w-5 text-amber-500" />}
                  <div>
                    <p className="text-sm font-medium">DNA Completeness: {dnaScore}%</p>
                    <p className="text-xs text-muted-foreground">
                      {dnaScore >= 90 ? "Full generation ready" : dnaScore >= 70 ? "Generate with warnings" : dnaScore >= 50 ? "Limited generation" : "Cannot generate"}
                    </p>
                  </div>
                </div>

                {/* Hard Gates Status */}
                <div className="p-3 rounded-lg border bg-muted/20">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldAlert className="h-4 w-4 text-destructive" />
                    <p className="text-sm font-medium">Content Safety Hard Gates</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {activeGates.map((gate) => (
                      <Badge
                        key={gate.label}
                        variant={gate.active ? "default" : "destructive"}
                        className="text-[10px] gap-1"
                      >
                        {gate.active ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
                        {gate.label}: {gate.active ? "ON" : "BLOCKED"}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">Blocked gates = zero content of that type. Manage in Preferences tab.</p>
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
                    <p className="text-[10px] text-muted-foreground mt-1.5">Auto-populated from clinic province.</p>
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

      {/* Calendar view — always rendered, follows the selected generation */}
      <Card ref={calendarRef as any}>
        <CardContent className="pt-6 space-y-4">
          {sortedGens.length > 0 && (
            <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-border/50">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={goPrevGen}
                  disabled={selectedIndex >= sortedGens.length - 1 || selectedIndex < 0}
                  aria-label="Older generation"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Select
                  value={selectedGen?.id || ""}
                  onValueChange={(id) => setViewingGenerationId(id)}
                >
                  <SelectTrigger className="h-8 min-w-[200px] text-sm">
                    <SelectValue placeholder="Select a generation" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedGens.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {format(new Date(g.month_year + "-01T00:00:00"), "MMMM yyyy")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={goNextGen}
                  disabled={selectedIndex <= 0}
                  aria-label="Newer generation"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-3">
                {selectedGen
                  && !ACTIVE_GEN_STATUSES.includes(selectedGen.approval_status)
                  && !["copy_approved","sent_for_final_review","final_changes_requested","approved_client","approved_auto"].includes(selectedGen.approval_status) && (
                  <AddPostHeaderButton
                    generationId={selectedGen.id}
                    monthYear={selectedGen.month_year}
                  />
                )}
                <p className="text-[11px] text-muted-foreground">
                  Viewing {sortedGens.length} month{sortedGens.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>
          )}

          {!selectedGen ? (
            <div className="py-12 text-center">
              <CalendarDays className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No content generated yet. Use <span className="font-medium text-foreground">Generate Content</span> to create a calendar for any month.
              </p>
            </div>
          ) : ACTIVE_GEN_STATUSES.includes(selectedGen.approval_status) ? (
            <div className="py-10 text-center space-y-2">
              <RefreshCw className="h-6 w-6 mx-auto text-primary animate-spin" />
              <p className="text-sm font-medium">
                Pipeline running for {format(new Date(selectedGen.month_year + "-01T00:00:00"), "MMMM yyyy")}
              </p>
              <p className="text-xs text-muted-foreground">
                The calendar will appear automatically once generation completes.
              </p>
            </div>
          ) : selectedGen.approval_status === "generation_failed" ? (
            <div className="py-8 text-center space-y-2">
              <AlertTriangle className="h-6 w-6 mx-auto text-destructive" />
              <p className="text-sm font-medium">Generation failed</p>
              {selectedGen.failure_reason && (
                <p className="text-xs text-muted-foreground max-w-md mx-auto">{selectedGen.failure_reason}</p>
              )}
            </div>
          ) : (
            <SM2CalendarView
              generationId={selectedGen.id}
              monthYear={selectedGen.month_year}
              approvalStatus={selectedGen.approval_status}
              isClient={false}
              onSendCopyForReview={() => sendCopyForReview.mutate(selectedGen.id)}
              onSendFinalForReview={() => sendFinalForReview.mutate(selectedGen.id)}
              sendPending={sendCopyForReview.isPending || sendFinalForReview.isPending}
              sentToClientAt={selectedGen.sent_to_client_at}
            />
          )}
        </CardContent>
      </Card>

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
              <Card
                key={gen.id}
                className={`border-border/60 transition-colors cursor-pointer hover:border-primary/40 ${selectedGen?.id === gen.id ? "border-primary/60 bg-primary/5" : ""}`}
                onClick={() => {
                  setViewingGenerationId(gen.id);
                  calendarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                <CardContent className="py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <FileText className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {format(new Date(gen.month_year + "-01T00:00:00"), "MMMM yyyy")}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <Badge variant={gen.generation_confidence_score >= 90 ? "default" : gen.generation_confidence_score >= 70 ? "secondary" : "destructive"} className="text-[10px]">
                            {gen.generation_confidence_score}% confidence
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            DNA {gen.dna_completeness_score}%
                          </Badge>
                          <StatusBadge status={gen.approval_status} stage={(gen as any).pipeline_stage} />
                          {(gen.approval_status === "processing" || gen.approval_status === "queued" || gen.approval_status === "retrying") && gen.last_attempt_at && (
                            <span className="text-[10px] text-muted-foreground">
                              updated {formatDistanceToNow(new Date(gen.last_attempt_at), { addSuffix: true })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
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
                      {ACTIVE_GEN_STATUSES.includes(gen.approval_status) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setStopTargetId(gen.id)}
                          disabled={cancelGeneration.isPending}
                          className="gap-1.5 text-xs text-destructive hover:text-destructive"
                        >
                          <StopCircle className="h-3.5 w-3.5" />
                          Stop
                        </Button>
                      )}
                      {(gen.approval_status === "copy_changes_requested" || gen.approval_status === "final_changes_requested") && (
                        <Button variant="outline" size="sm" onClick={() => { setPreflightOpen(true); }} className="gap-1.5 text-xs">
                          <RefreshCw className="h-3.5 w-3.5" />
                          Regenerate
                        </Button>
                      )}
                      {(gen.approval_status === "pending" || gen.approval_status === "copy_changes_requested") && gen.html_file_path && (
                        <Button variant="outline" size="sm" onClick={() => sendCopyForReview.mutate(gen.id)} disabled={sendCopyForReview.isPending} className="gap-1.5 text-xs">
                          <Send className="h-3.5 w-3.5" />
                          {gen.approval_status === "copy_changes_requested" ? "Resend copy" : "Send copy to client"}
                        </Button>
                      )}
                      {(gen.approval_status === "copy_approved" || gen.approval_status === "final_changes_requested") && gen.html_file_path && (
                        <Button variant="outline" size="sm" onClick={() => sendFinalForReview.mutate(gen.id)} disabled={sendFinalForReview.isPending} className="gap-1.5 text-xs">
                          <Send className="h-3.5 w-3.5" />
                          Send final for approval
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
                  {gen.approval_status === "generation_failed" && (gen as any).failure_reason && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 ml-12">
                      <p className="text-xs font-medium text-destructive mb-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Failure Reason
                      </p>
                      <p className="text-sm">{(gen as any).failure_reason}</p>
                    </div>
                  )}
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

      {/* HTML Editor Dialog */}
      {editingHtml && (
        <HtmlEditorDialog filePath={editingHtml} onClose={() => setEditingHtml(null)} />
      )}
      </TabsContent>

      <AlertDialog open={!!stopTargetId} onOpenChange={(o) => !o && setStopTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop content generation?</AlertDialogTitle>
            <AlertDialogDescription>
              This cancels the in-progress pipeline immediately. The run will be marked as failed and you can start a new generation when ready.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep running</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (stopTargetId) cancelGeneration.mutate(stopTargetId);
                setStopTargetId(null);
              }}
            >
              Stop generation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Tabs>
  );
}

function StatusBadge({ status, stage }: { status: string; stage?: string | null }) {
  const config: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: typeof CheckCircle }> = {
    queued: { label: "Queued", variant: "secondary", icon: Clock },
    processing: { label: "Pipeline Running", variant: "secondary", icon: RefreshCw },
    retrying: { label: "Retrying", variant: "secondary", icon: RefreshCw },
    pending: { label: "Pending Review", variant: "outline", icon: Clock },
    sent_for_copy_review: { label: "Awaiting Client Copy Approval", variant: "secondary", icon: Send },
    copy_changes_requested: { label: "Copy Changes Requested", variant: "destructive", icon: AlertTriangle },
    copy_approved: { label: "Copy Approved · Add Visuals", variant: "default", icon: CheckCircle },
    sent_for_final_review: { label: "Awaiting Final Approval", variant: "secondary", icon: Send },
    final_changes_requested: { label: "Final Changes Requested", variant: "destructive", icon: AlertTriangle },
    approved_client: { label: "Client Approved", variant: "default", icon: CheckCircle },
    approved_auto: { label: "Auto-Approved", variant: "secondary", icon: CheckCircle },
    generation_failed: { label: "Generation Failed", variant: "destructive", icon: AlertTriangle },
    rejected: { label: "Rejected", variant: "destructive", icon: AlertTriangle },
  };
  const c = config[status] || config.pending;
  const isSpinning = status === "processing" || status === "retrying";
  const stageLabel = (status === "processing" || status === "queued")
    ? nextStageLabel(stage)
    : null;
  return (
    <Badge variant={c.variant} className="text-[10px] gap-1">
      <c.icon className={`h-3 w-3 ${isSpinning ? "animate-spin" : ""}`} />
      {stageLabel ? `Running: ${stageLabel}` : c.label}
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
        const text = await res.text();
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
