import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ChevronDown, ChevronRight, Copy } from "lucide-react";
import { useBlogRuns, type BlogRun } from "@/hooks/useBlogRuns";
import { draftToHtml } from "@/lib/draft-to-html";
import { toast } from "sonner";

function ApprovedCard({ run }: { run: BlogRun }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"rendered" | "raw">("rendered");
  const title = run.injection?.ASSIGNED_SPOKE?.title ?? "(spoke)";
  const draft: string = run.draft?.text ?? "";
  const html = useMemo(() => draftToHtml(draft), [draft]);
  const approvedAt = run.human_gate?.at ?? run.completed_at ?? run.created_at;
  const notes = run.human_gate?.notes;

  return (
    <div className="border rounded-lg">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
          <div className="min-w-0">
            <div className="font-medium truncate">{title}</div>
            <div className="text-xs text-muted-foreground">
              Approved {new Date(approvedAt).toLocaleString()}
              {run.draft?.word_count ? ` · ${run.draft.word_count} words` : ""}
            </div>
          </div>
        </div>
        <Badge className="bg-green-500/10 text-green-700 text-xs">Approved</Badge>
      </button>

      {open && (
        <div className="border-t p-4 space-y-3">
          {notes && (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Reviewer notes:</span> {notes}
            </div>
          )}

          {draft ? (
            <div className="border rounded p-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium">Approved draft</span>
                <div className="flex items-center gap-1">
                  <span className="flex gap-1 border rounded p-0.5">
                    <button
                      type="button"
                      onClick={() => setMode("rendered")}
                      className={`px-2 py-0.5 rounded text-[10px] ${mode === "rendered" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                    >
                      Rendered
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("raw")}
                      className={`px-2 py-0.5 rounded text-[10px] ${mode === "raw" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                    >
                      Raw
                    </button>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px]"
                    onClick={() => {
                      navigator.clipboard.writeText(draft);
                      toast.success("Draft copied");
                    }}
                  >
                    <Copy className="h-3 w-3 mr-1" /> Copy
                  </Button>
                </div>
              </div>
              {mode === "rendered" ? (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none max-h-[600px] overflow-auto text-sm"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              ) : (
                <pre className="whitespace-pre-wrap text-xs max-h-[600px] overflow-auto">{draft}</pre>
              )}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">No draft text captured for this run.</div>
          )}
        </div>
      )}
    </div>
  );
}

export function BlogApprovedPanel({ clinicId }: { clinicId: string }) {
  const { runs } = useBlogRuns(clinicId);
  const approved = (runs.data ?? []).filter((r) => r.status === "approved");

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-lg">Approved blogs</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Runs that passed the Human Gate. Ready to publish to WordPress.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {runs.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!runs.isLoading && approved.length === 0 && (
          <p className="text-sm text-muted-foreground">No approved blogs yet.</p>
        )}
        {approved.map((r) => (
          <ApprovedCard key={r.id} run={r} />
        ))}
      </CardContent>
    </Card>
  );
}
