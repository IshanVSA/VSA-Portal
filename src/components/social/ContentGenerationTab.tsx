import { useState } from "react";
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
import { Sparkles, RefreshCw, FileText, Eye, AlertTriangle, CheckCircle, Clock, Send } from "lucide-react";
import { format } from "date-fns";

interface Props {
  clinicId: string | undefined;
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

  const dnaScore = dna?.completeness_score || 0;
  const canGenerate = dnaScore >= 50;

  const handleGenerate = async () => {
    // Save signals first
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
                {/* DNA Score Check */}
                <div className="flex items-center gap-2 p-3 rounded-lg border">
                  {dnaScore >= 70 ? <CheckCircle className="h-5 w-5 text-green-500" /> : <AlertTriangle className="h-5 w-5 text-amber-500" />}
                  <div>
                    <p className="text-sm font-medium">DNA Completeness: {dnaScore}%</p>
                    <p className="text-xs text-muted-foreground">
                      {dnaScore >= 90 ? "Full generation ready" : dnaScore >= 70 ? "Generate with warnings" : dnaScore >= 50 ? "Limited generation" : "Cannot generate"}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Clinic News This Month</Label>
                  <Textarea
                    placeholder="New staff, equipment, renovations, awards... Type NONE if nothing."
                    value={clinicNews}
                    onChange={(e) => setClinicNews(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Facebook-Specific This Month</Label>
                  <Textarea
                    placeholder="Local community activity from Facebook groups..."
                    value={fbSpecific}
                    onChange={(e) => setFbSpecific(e.target.value)}
                    rows={2}
                  />
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

      {/* Cannot generate warning */}
      {!canGenerate && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <p className="text-sm">DNA Completeness Score is {dnaScore}% (below 50). Complete the Brand DNA profile before generating content.</p>
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
                <CardContent className="py-3 flex items-center justify-between">
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
                      <Button variant="ghost" size="sm" onClick={() => setViewingHtml(gen.html_file_path)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    {gen.approval_status === "pending" && gen.html_file_path && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => sendToClient.mutate(gen.id)}
                        disabled={sendToClient.isPending}
                        className="gap-1.5 text-xs"
                      >
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
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* HTML Viewer Dialog */}
      {viewingHtml && (
        <Dialog open={!!viewingHtml} onOpenChange={() => setViewingHtml(null)}>
          <DialogContent className="max-w-5xl h-[85vh]">
            <DialogHeader>
              <DialogTitle>Generated Content Preview</DialogTitle>
            </DialogHeader>
            <iframe
              src={(() => {
                const { data } = supabase.storage.from("department-files").getPublicUrl(viewingHtml);
                return data.publicUrl;
              })()}
              className="w-full flex-1 rounded-lg border"
              style={{ height: "calc(85vh - 80px)" }}
              sandbox="allow-same-origin"
              title="SM2 Content Preview"
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: typeof CheckCircle }> = {
    pending: { label: "Pending Review", variant: "outline", icon: Clock },
    approved_client: { label: "Client Approved", variant: "default", icon: CheckCircle },
    approved_auto: { label: "Auto-Approved", variant: "secondary", icon: CheckCircle },
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

// Need this import for the iframe URL
import { supabase } from "@/integrations/supabase/client";
