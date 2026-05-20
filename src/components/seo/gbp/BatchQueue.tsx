import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ListOrdered, Play, Shield, ChevronDown, CheckCircle2, XCircle, AlertTriangle, Users, RefreshCw } from "lucide-react";
import { useGBPBatches } from "@/hooks/useGBPBatches";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import type { CollisionCheckResult } from "@/lib/gbp/types";

const statusColors: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  in_progress: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  qa: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  complete: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
};

function CollisionResults({ result }: { result: CollisionCheckResult }) {
  const checks = [
    { label: "Topic Overlap", ...result.topic_overlap },
    { label: "Hook Style Match", ...result.hook_style_match },
    { label: "Shared Keywords", ...result.shared_keywords },
    { label: "Landmark Collision", ...result.landmark_collision },
  ];

  return (
    <div className="space-y-1.5 mt-2 p-2 bg-muted/30 rounded-xl border border-border/30">
      <p className="text-[11px] font-medium text-muted-foreground mb-1">Collision Check</p>
      {checks.map((c) => (
        <div key={c.label} className="flex items-start gap-1.5">
          {c.pass ? (
            <CheckCircle2 className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />
          ) : (
            <XCircle className="h-3 w-3 text-destructive mt-0.5 shrink-0" />
          )}
          <div>
            <span className="text-[11px] font-medium">{c.label}</span>
            {c.details.length > 0 && (
              <ul className="mt-0.5">
                {c.details.map((d, i) => (
                  <li key={i} className="text-[10px] text-muted-foreground">• {d}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

interface BatchQueueProps {
  clinicId?: string | null;
}

export function BatchQueue({ clinicId }: BatchQueueProps) {
  const { role } = useUserRole();
  const isAdmin = role === "admin";
  const { batches, isLoading, generateQueue, runCollisionCheck } = useGBPBatches();
  const [clusterNames, setClusterNames] = useState<Record<string, string>>({});
  const [clinicNames, setClinicNames] = useState<Record<string, string>>({});

  // Fetch cluster & clinic names
  useEffect(() => {
    if (batches.length === 0) return;
    const clusterIds = batches.map(b => b.cluster_id).filter(Boolean) as string[];
    const clinicIds = batches.flatMap(b => b.clinics);

    if (clusterIds.length > 0) {
      supabase.from("geo_clusters").select("cluster_id, region").in("cluster_id", clusterIds).then(({ data }) => {
        if (data) {
          const map: Record<string, string> = {};
          data.forEach(c => { map[c.cluster_id] = c.region; });
          setClusterNames(map);
        }
      });
    }

    if (clinicIds.length > 0) {
      supabase.from("clinics").select("id, clinic_name").in("id", [...new Set(clinicIds)]).then(({ data }) => {
        if (data) {
          const map: Record<string, string> = {};
          data.forEach(c => { map[c.id] = c.clinic_name; });
          setClinicNames(map);
        }
      });
    }
  }, [batches]);

  // Filter batches to only show the one containing the selected clinic.
  // Fallback: if no batch matches (e.g., clinic just added before rebuild), show all
  // so the queue is never mysteriously empty.
  const filteredBatches = useMemo(() => {
    if (!clinicId) return batches;
    const matched = batches.filter(b => b.clinics.includes(clinicId));
    return matched.length > 0 ? matched : batches;
  }, [batches, clinicId]);

  const totalClinics = new Set(filteredBatches.flatMap(b => b.clinics)).size;
  const completedBatches = filteredBatches.filter(b => b.status === "complete").length;
  const progressPct = filteredBatches.length > 0 ? Math.round((completedBatches / filteredBatches.length) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Controls */}
      {isAdmin && (
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-4 px-4 flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              Batches reflect current cluster groupings and update automatically when clinics are added or removed.
            </span>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs shrink-0"
              onClick={() => generateQueue.mutate()}
              disabled={generateQueue.isPending}
            >
              <RefreshCw className={`h-3 w-3 ${generateQueue.isPending ? "animate-spin" : ""}`} />
              {generateQueue.isPending ? "Generating..." : batches.length > 0 ? "Regenerate Batches" : "Generate Batches"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Progress */}
      {filteredBatches.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all rounded-full" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="text-xs text-muted-foreground">{completedBatches}/{filteredBatches.length} batches • {totalClinics} clinics</span>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
      )}

      {!isLoading && filteredBatches.length === 0 && (
        <Card className="border-dashed border-border/60">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-4">
              <ListOrdered className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">No Batches Configured</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              {clinicId ? "This clinic is not in any batch." : isAdmin ? "Click 'Generate Batches' to create the batch queue for all configured clinics." : "The admin needs to generate the batch queue."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Batch Cards */}
      <div className="space-y-2">
        {filteredBatches.map((batch, idx) => (
          <motion.div key={batch.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
            <Collapsible>
              <Card className="border-border/50">
                <CollapsibleTrigger asChild>
                  <CardHeader className="py-3 px-4 cursor-pointer hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-xs font-semibold">
                          Batch #{batch.batch_number}
                          {batch.cluster_id && (
                            <span className="font-normal text-muted-foreground ml-1.5">
                              - {clusterNames[batch.cluster_id] || batch.cluster_id}
                            </span>
                          )}
                          {!batch.cluster_id && <span className="font-normal text-muted-foreground ml-1.5">- Solo</span>}
                        </CardTitle>
                        <Badge variant="outline" className={`text-[10px] ${statusColors[batch.status || "queued"]}`}>
                          {(batch.status || "queued").replace("_", " ")}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] gap-0.5">
                          <Users className="h-2.5 w-2.5" />
                          {batch.clinics.length}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {isAdmin && batch.clinics.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[11px] gap-1"
                            onClick={(e) => { e.stopPropagation(); runCollisionCheck.mutate(batch.id); }}
                            disabled={runCollisionCheck.isPending}
                          >
                            <Shield className="h-3 w-3" />
                            Collision Check
                          </Button>
                        )}
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0 pb-3 px-4">
                    <div className="space-y-1.5">
                      {batch.clinics.map(cId => (
                        <div key={cId} className="flex items-center justify-between text-xs bg-muted/20 rounded px-2 py-1.5 border border-border/20">
                          <span>{clinicNames[cId] || cId.slice(0, 8)}</span>
                        </div>
                      ))}
                    </div>
                    {batch.collision_check && <CollisionResults result={batch.collision_check} />}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
