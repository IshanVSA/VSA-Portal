import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, XCircle, Clock, Loader2, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { useBlogRuns, type BlogRun } from "@/hooks/useBlogRuns";
import { draftToHtml } from "@/lib/draft-to-html";

const STAGE_LABELS: Record<string, string> = {
  validate_injection: "Validate injection",
  load_context: "Load context",
  read_site: "Read site",
  choose_spoke: "Choose spoke",
  serp_scan: "SERP scan",
  resolve_compliance: "Resolve compliance",
  allocate_hazards: "Allocate hazards",
  write_spoke: "Write spoke",
  build_schema: "Build schema",
  checker: "Independent checker",
  human_gate: "Human gate",
};
const STAGE_ORDER = Object.keys(STAGE_LABELS);

function StageDot({ status }: { status?: string }) {
  const s = status ?? "queued";
  const cls =
    s === "ok" ? "bg-green-500" :
    s === "running" ? "bg-blue-500 animate-pulse" :
    s === "fail" ? "bg-red-500" :
    s === "pending" ? "bg-amber-500" : "bg-muted-foreground/30";
  return <span className={`inline-block w-2 h-2 rounded-full ${cls}`} />;
}
function DraftPreview({ text, wordCount }: { text: string; wordCount?: number }) {
  const [mode, setMode] = useState<"rendered" | "raw">("rendered");
  const html = useMemo(() => draftToHtml(text), [text]);
  return (
    <details className="border rounded p-2" open>
      <summary className="text-xs font-medium cursor-pointer flex items-center justify-between gap-2">
        <span>Draft{wordCount ? ` (${wordCount} words)` : ""}</span>
        <span className="flex gap-1 border rounded p-0.5" onClick={(e) => e.preventDefault()}>
          <button
            type="button"
            onClick={() => setMode("rendered")}
            className={`px-2 py-0.5 rounded text-[10px] ${mode === "rendered" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >Rendered</button>
          <button
            type="button"
            onClick={() => setMode("raw")}
            className={`px-2 py-0.5 rounded text-[10px] ${mode === "raw" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >Raw</button>
        </span>
      </summary>
      {mode === "rendered" ? (
        <div
          className="prose prose-sm dark:prose-invert mt-2 max-w-none max-h-96 overflow-auto text-sm"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="mt-2 whitespace-pre-wrap text-xs max-h-96 overflow-auto">{text}</pre>
      )}
    </details>
  );
}


function RunCard({ run }: { run: BlogRun }) {
  const { humanGate } = useBlogRuns(run.clinic_id);
  const [open, setOpen] = useState(run.status !== "approved");
  const [notes, setNotes] = useState(run.human_gate?.notes ?? "");

  const spokeTitle = run.injection?.ASSIGNED_SPOKE?.title ?? "(spoke pending)";
  const statusColor =
    run.status === "approved" ? "bg-green-500/10 text-green-700" :
    run.status === "rejected" ? "bg-red-500/10 text-red-700" :
    run.status === "awaiting_human_gate" ? "bg-amber-500/10 text-amber-700" :
    run.status === "failed" ? "bg-red-500/10 text-red-700" :
    "bg-blue-500/10 text-blue-700";

  const checker = run.checker_report;
  const failedChecks = checker?.checks?.filter((c: any) => c.status === "FAIL") ?? [];

  return (
    <div className="border rounded-lg">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition">
        <div className="flex items-center gap-2 text-left min-w-0">
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <div className="min-w-0">
            <div className="font-medium truncate">{spokeTitle}</div>
            <div className="text-xs text-muted-foreground">
              {new Date(run.created_at).toLocaleString()} · {run.current_stage ?? "queued"}
            </div>
          </div>
        </div>
        <Badge className={`text-xs capitalize ${statusColor}`}>{run.status.replace(/_/g, " ")}</Badge>
      </button>

      {open && (
        <div className="border-t p-4 space-y-4">
          {/* Stage timeline */}
          <div className="space-y-1.5">
            {STAGE_ORDER.map((s) => {
              const st = run.stages?.[s];
              return (
                <div key={s} className="flex items-center gap-2 text-xs">
                  <StageDot status={st?.status} />
                  <span className="w-40 text-muted-foreground">{STAGE_LABELS[s]}</span>
                  <span className="flex-1 truncate">{st?.result ?? st?.error ?? st?.note ?? ""}</span>
                  {st?.duration_ms != null && <span className="text-muted-foreground">{Math.round(st.duration_ms)}ms</span>}
                </div>
              );
            })}
          </div>

          {run.error && (
            <div className="p-2 rounded bg-red-500/10 text-red-700 text-xs flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {run.error}
            </div>
          )}

          {/* Draft preview */}
          {run.draft?.text && <DraftPreview text={run.draft.text} wordCount={run.draft.word_count} />}

          {/* Checker report */}
          {checker && (
            <div className="border rounded p-2">
              <div className="flex items-center gap-2 text-xs font-medium mb-2">
                {checker.overall === "PASS" ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                Independent checker: {checker.overall}
              </div>
              {failedChecks.length > 0 && (
                <ul className="text-xs space-y-1">
                  {failedChecks.map((c: any, i: number) => (
                    <li key={i} className="text-red-700">✗ {c.name}: {c.note}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Human gate */}
          {run.status === "awaiting_human_gate" && (
            <div className="border rounded p-3 space-y-2 bg-amber-500/5">
              <div className="text-xs font-medium">Human gate — SEO lead review</div>
              <ul className="text-xs text-muted-foreground list-disc pl-5">
                <li>Verify any local references, landmarks, and neighbourhood claims</li>
                <li>Confirm clinician byline and accreditations are real</li>
                <li>Confirm compliance rules are honoured for {run.compliance_resolution?.governing_body}</li>
              </ul>
              <Textarea
                placeholder="Reviewer notes (required for Request Changes)…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => humanGate.mutate({ run_id: run.id, decision: "approve", notes })}
                  disabled={humanGate.isPending}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => humanGate.mutate({ run_id: run.id, decision: "request_changes", notes })}
                  disabled={humanGate.isPending || notes.trim().length < 5}
                  title={notes.trim().length < 5 ? "Add reviewer notes first" : "Send back to backlog for a fresh run"}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" /> Request Changes
                </Button>
              </div>
            </div>
          )}

          {run.human_gate?.decision && (
            <div className="text-xs text-muted-foreground">
              {run.human_gate.decision === "approve" ? "Approved" : "Rejected"} at{" "}
              {run.human_gate.at ? new Date(run.human_gate.at).toLocaleString() : ""}
              {run.human_gate.notes && <> — {run.human_gate.notes}</>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function BlogRunsPanel({ clinicId }: { clinicId: string }) {
  const { runs, startRun } = useBlogRuns(clinicId);
  const list = runs.data ?? [];
  const active = list.filter((r) => r.status === "running" || r.status === "queued" || r.status === "awaiting_human_gate");
  const done = list.filter((r) => !active.includes(r));

  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">Pipeline runs</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Live stage timeline, checker, and human gate</p>
        </div>
        <Button onClick={() => startRun.mutate(undefined)} disabled={startRun.isPending}>
          {startRun.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Clock className="h-4 w-4 mr-2" />}
          Run next spoke
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {runs.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!runs.isLoading && !list.length && <p className="text-sm text-muted-foreground">No runs yet.</p>}

        {active.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active</div>
            {active.map((r) => <RunCard key={r.id} run={r} />)}
          </div>
        )}
        {done.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">History</div>
            {done.map((r) => <RunCard key={r.id} run={r} />)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
