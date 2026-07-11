import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, RefreshCw, Play, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { useBlogBacklog } from "@/hooks/useBlogBacklog";
import { useBlogRuns } from "@/hooks/useBlogRuns";

export function BlogBacklogPanel({ clinicId }: { clinicId: string }) {
  const { backlog, regenerate } = useBlogBacklog(clinicId);
  const { startRun } = useBlogRuns(clinicId);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const clusters = backlog.data ?? [];
  const isEmpty = !backlog.isLoading && clusters.length === 0;

  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">Content Backlog</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Clusters and spokes generated from clinic DNA</p>
        </div>
        <div className="flex gap-2">
          {isEmpty ? (
            <Button onClick={() => regenerate.mutate(false)} disabled={regenerate.isPending}>
              {regenerate.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Generate backlog from DNA
            </Button>
          ) : (
            <Button variant="outline" onClick={() => regenerate.mutate(true)} disabled={regenerate.isPending}>
              {regenerate.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Regenerate
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {backlog.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {isEmpty && <p className="text-sm text-muted-foreground">No backlog yet. Generate one from the clinic's DNA.</p>}
        <div className="space-y-3">
          {clusters.map((c) => {
            const open = expanded[c.id] ?? true;
            return (
              <div key={c.id} className="border rounded-lg">
                <button
                  onClick={() => setExpanded((p) => ({ ...p, [c.id]: !open }))}
                  className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition"
                >
                  <div className="flex items-center gap-2 text-left">
                    {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <div>
                      <div className="font-medium">{c.cluster_name}</div>
                      {c.rationale && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{c.rationale}</div>}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">{c.spokes?.length ?? 0} spokes</Badge>
                </button>
                {open && (
                  <div className="border-t divide-y">
                    {c.spokes?.map((s) => (
                      <div key={s.id} className="flex items-center justify-between gap-3 p-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{s.title}</div>
                          <div className="text-xs text-muted-foreground flex gap-2 flex-wrap mt-0.5">
                            {s.target_keyword && <span>kw: {s.target_keyword}</span>}
                            {s.angle && <span>· {s.angle}</span>}
                          </div>
                        </div>
                        <Badge variant="secondary" className="text-xs shrink-0 capitalize">{s.status.replace("_", " ")}</Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={s.status !== "backlog"}
                          onClick={() => startRun.mutate(s.id)}
                        >
                          <Play className="h-3.5 w-3.5 mr-1" />
                          Run
                        </Button>
                      </div>
                    ))}
                    {!c.spokes?.length && <div className="p-3 text-xs text-muted-foreground">No spokes yet.</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
