import { useState } from "react";
import { useGeoClusters, useClinicGBPConfigs } from "@/hooks/useGeoClusters";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, ChevronDown, ChevronRight, Pencil, Trash2, MapPin, Settings2, Users, RefreshCw } from "lucide-react";
import { ClinicGBPConfigForm } from "./ClinicGBPConfigForm";
import type { GeoCluster, ClusterPosition, TopicVariant } from "@/lib/gbp/types";
import { getHookStyleForPosition } from "@/lib/gbp/hookRotation";

export function ClusterManager() {
  const { role } = useUserRole();
  const isAdmin = role === "admin";
  const { clusters, isLoading, upsertCluster, deleteCluster } = useGeoClusters();
  const { configs } = useClinicGBPConfigs();
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCluster, setEditingCluster] = useState<Partial<GeoCluster> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [showConfigSection, setShowConfigSection] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const queryClient = useQueryClient();

  const handleRebuild = async () => {
    setRebuilding(true);
    try {
      const { error } = await supabase.rpc("rebuild_geo_clusters" as any);
      if (error) throw error;
      toast.success("Clusters and batches rebuilt from clinic addresses");
      queryClient.invalidateQueries({ queryKey: ["geo-clusters"] });
      queryClient.invalidateQueries({ queryKey: ["clinic-gbp-configs"] });
      queryClient.invalidateQueries({ queryKey: ["gbp-batches"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to rebuild clusters");
    } finally {
      setRebuilding(false);
    }
  };

  // Fetch all clinics for reference
  const { data: allClinics = [] } = useQuery({
    queryKey: ["clinics-for-clusters"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clinics").select("id, clinic_name").order("clinic_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const clinicNameMap = Object.fromEntries(allClinics.map(c => [c.id, c.clinic_name]));

  const handleSaveCluster = async () => {
    if (!editingCluster?.cluster_id || !editingCluster?.region) {
      toast.error("Cluster ID and Region are required");
      return;
    }
    try {
      await upsertCluster.mutateAsync({
        cluster_id: editingCluster.cluster_id,
        region: editingCluster.region,
        clinics: editingCluster.clinics ?? [],
        is_solo: (editingCluster.clinics?.length ?? 0) <= 1,
      });
      toast.success("Cluster saved");
      setEditDialogOpen(false);
      setEditingCluster(null);
    } catch (e: any) {
      toast.error(e.message || "Failed to save cluster");
    }
  };

  const handleDeleteCluster = async () => {
    if (!deleteTarget) return;
    try {
      await deleteCluster.mutateAsync(deleteTarget);
      toast.success("Cluster deleted");
      setDeleteTarget(null);
    } catch (e: any) {
      toast.error(e.message || "Failed to delete cluster");
    }
  };

  const sharedClusters = clusters.filter(c => !c.is_solo);
  const soloClusters = clusters.filter(c => c.is_solo);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-emerald-500" />
          <h2 className="text-sm font-bold text-foreground">Geographic Clusters</h2>
          <Badge variant="secondary" className="text-xs">{clusters.length} clusters</Badge>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={handleRebuild} disabled={rebuilding}>
              <RefreshCw className={`h-3 w-3 ${rebuilding ? "animate-spin" : ""}`} />
              {rebuilding ? "Rebuilding..." : "Auto-Rebuild from Addresses"}
            </Button>
            <Button size="sm" className="gap-1.5 text-xs" onClick={() => { setEditingCluster({ cluster_id: "", region: "", clinics: [], is_solo: false }); setEditDialogOpen(true); }}>
              <Plus className="h-3 w-3" /> Add Cluster
            </Button>
          </div>
        )}
      </div>

      {/* Shared Clusters */}
      {sharedClusters.length > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Users className="h-3 w-3" /> Shared Clusters ({sharedClusters.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {sharedClusters.map(cluster => (
              <ClusterRow
                key={cluster.cluster_id}
                cluster={cluster}
                clinicNameMap={clinicNameMap}
                configs={configs}
                expanded={expandedCluster === cluster.cluster_id}
                onToggle={() => setExpandedCluster(expandedCluster === cluster.cluster_id ? null : cluster.cluster_id)}
                isAdmin={isAdmin}
                onEdit={() => { setEditingCluster(cluster); setEditDialogOpen(true); }}
                onDelete={() => setDeleteTarget(cluster.cluster_id)}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Solo Clusters */}
      {soloClusters.length > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Solo Clusters - No Collision Risk ({soloClusters.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {soloClusters.map(cluster => (
              <ClusterRow
                key={cluster.cluster_id}
                cluster={cluster}
                clinicNameMap={clinicNameMap}
                configs={configs}
                expanded={expandedCluster === cluster.cluster_id}
                onToggle={() => setExpandedCluster(expandedCluster === cluster.cluster_id ? null : cluster.cluster_id)}
                isAdmin={isAdmin}
                onEdit={() => { setEditingCluster(cluster); setEditDialogOpen(true); }}
                onDelete={() => setDeleteTarget(cluster.cluster_id)}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {clusters.length === 0 && (
        <Card className="border-dashed border-border/60">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <MapPin className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">No clusters configured</p>
            <p className="text-xs text-muted-foreground mb-4">Add clusters to group nearby clinics and prevent content collision.</p>
            {isAdmin && (
              <Button size="sm" onClick={() => { setEditingCluster({ cluster_id: "", region: "", clinics: [], is_solo: false }); setEditDialogOpen(true); }}>
                <Plus className="h-3 w-3 mr-1" /> Create First Cluster
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Clinic GBP Config Section */}
      <Collapsible open={showConfigSection} onOpenChange={setShowConfigSection}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between text-xs h-9">
            <span className="flex items-center gap-2"><Settings2 className="h-3.5 w-3.5" /> Clinic GBP Configuration</span>
            {showConfigSection ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
            <ClinicGBPConfigForm clusters={clusters} />
          </motion.div>
        </CollapsibleContent>
      </Collapsible>

      {/* Edit/Add Cluster Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCluster?.id ? "Edit Cluster" : "Add Cluster"}</DialogTitle>
            <DialogDescription>Configure the geographic cluster and assign clinics.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Cluster ID</Label>
                <Input
                  value={editingCluster?.cluster_id ?? ""}
                  onChange={e => setEditingCluster(prev => prev ? { ...prev, cluster_id: e.target.value.toUpperCase() } : prev)}
                  placeholder="e.g. VAN-WEST"
                  className="text-xs h-8"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Region</Label>
                <Input
                  value={editingCluster?.region ?? ""}
                  onChange={e => setEditingCluster(prev => prev ? { ...prev, region: e.target.value } : prev)}
                  placeholder="e.g. Vancouver"
                  className="text-xs h-8"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Clinics in Cluster</Label>
              <div className="border rounded-xl p-2 max-h-40 overflow-y-auto space-y-1">
                {allClinics.map(clinic => {
                  const isSelected = editingCluster?.clinics?.includes(clinic.id) ?? false;
                  return (
                    <label key={clinic.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 px-1.5 py-1 rounded">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          setEditingCluster(prev => {
                            if (!prev) return prev;
                            const clinics = prev.clinics ?? [];
                            return {
                              ...prev,
                              clinics: isSelected ? clinics.filter(id => id !== clinic.id) : [...clinics, clinic.id],
                            };
                          });
                        }}
                        className="rounded"
                      />
                      {clinic.clinic_name}
                    </label>
                  );
                })}
                {allClinics.length === 0 && <p className="text-xs text-muted-foreground">No clinics found.</p>}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveCluster} disabled={upsertCluster.isPending}>
              {upsertCluster.isPending ? "Saving..." : "Save Cluster"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Cluster</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the cluster "{deleteTarget}". Clinics won't be removed, but their cluster assignment will need to be updated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCluster} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

// ─── Cluster Row Component ─────────────────────────────────────────
interface ClusterRowProps {
  cluster: GeoCluster;
  clinicNameMap: Record<string, string>;
  configs: any[];
  expanded: boolean;
  onToggle: () => void;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function ClusterRow({ cluster, clinicNameMap, configs, expanded, onToggle, isAdmin, onEdit, onDelete }: ClusterRowProps) {
  const positions: ClusterPosition[] = ['A', 'B', 'C', 'D'];

  return (
    <div className="border-b last:border-b-0 border-border/40">
      <div
        className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          <span className="text-sm font-medium">{cluster.cluster_id}</span>
          <Badge variant="outline" className="text-[10px]">{cluster.region}</Badge>
          <span className="text-xs text-muted-foreground">{cluster.clinics.length} clinic{cluster.clinics.length !== 1 ? 's' : ''}</span>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}><Pencil className="h-3 w-3" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDelete}><Trash2 className="h-3 w-3" /></Button>
          </div>
        )}
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
            <div className="px-4 pb-3">
              <Table>
                <TableHeader>
                  <TableRow>
                     <TableHead className="text-xs">Clinic</TableHead>
                     <TableHead className="text-xs w-20">Position</TableHead>
                     <TableHead className="text-xs w-20">Hook</TableHead>
                     <TableHead className="text-xs w-28">Landmarks</TableHead>
                     <TableHead className="text-xs w-20">Radius</TableHead>
                     <TableHead className="text-xs w-20">Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cluster.clinics.map((clinicId, idx) => {
                    const config = configs.find(c => c.clinic_id === clinicId);
                    return (
                      <TableRow key={clinicId}>
                        <TableCell className="text-xs">{clinicNameMap[clinicId] ?? clinicId.slice(0, 8)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px] font-mono">
                            {config?.cluster_position ?? positions[idx] ?? '—'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {config?.cluster_position ? (
                            <Badge variant="outline" className="text-[10px] font-mono">
                              {getHookStyleForPosition(new Date().getMonth() + 1, config.cluster_position as TopicVariant)}
                            </Badge>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {config?.local_landmarks?.join(', ') || '—'}
                        </TableCell>
                        <TableCell className="text-xs">{config?.geo_radius_km ?? 7} km</TableCell>
                        <TableCell>
                          {config?.hospital_type ? (
                            <Badge variant="outline" className="text-[10px]">TYPE {config.hospital_type}</Badge>
                          ) : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
