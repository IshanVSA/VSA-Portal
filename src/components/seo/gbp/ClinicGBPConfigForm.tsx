import { useState } from "react";
import { useClinicGBPConfigs } from "@/hooks/useGeoClusters";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Search, Save } from "lucide-react";
import type { GeoCluster, ClinicGBPConfig, HospitalType, Jurisdiction, ClusterPosition } from "@/lib/gbp/types";

interface Props {
  clusters: GeoCluster[];
}

export function ClinicGBPConfigForm({ clusters }: Props) {
  const { role } = useUserRole();
  const isAdmin = role === "admin";
  const { configs, isLoading, upsertConfig } = useClinicGBPConfigs();
  const [search, setSearch] = useState("");
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<ClinicGBPConfig>>({});

  const { data: allClinics = [] } = useQuery({
    queryKey: ["clinics-for-gbp-config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clinics").select("id, clinic_name, phone, website").order("clinic_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredClinics = allClinics.filter(c =>
    c.clinic_name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelectClinic = (clinicId: string) => {
    setSelectedClinicId(clinicId);
    const existing = configs.find(c => c.clinic_id === clinicId);
    const clinic = allClinics.find(c => c.id === clinicId);
    if (existing) {
      setFormData(existing);
    } else {
      setFormData({
        clinic_id: clinicId,
        phone_number: clinic?.phone ?? "",
        website_url: clinic?.website ?? "",
        hospital_type: undefined,
        jurisdiction: undefined,
        neighbourhood: "",
        local_landmarks: [],
        top_services: [],
        geo_radius_km: 7,
        cluster_id: null,
        cluster_position: null,
      });
    }
  };

  const handleSave = async () => {
    if (!selectedClinicId) return;
    try {
      await upsertConfig.mutateAsync({
        clinic_id: selectedClinicId,
        ...formData,
      } as any);
      toast.success("GBP configuration saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save configuration");
    }
  };

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  return (
    <div className="space-y-4">
      {/* Clinic Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search clinics..."
          className="pl-8 text-xs h-8"
        />
      </div>

      {search && !selectedClinicId && (
        <Card className="border-border/60">
          <CardContent className="p-1 max-h-40 overflow-y-auto">
            {filteredClinics.map(clinic => (
              <button
                key={clinic.id}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 rounded transition-colors"
                onClick={() => handleSelectClinic(clinic.id)}
              >
                {clinic.clinic_name}
              </button>
            ))}
            {filteredClinics.length === 0 && (
              <p className="text-xs text-muted-foreground px-3 py-2">No clinics found</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Config Form */}
      {selectedClinicId && (
        <Card className="border-border/60">
          <CardContent className="pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{allClinics.find(c => c.id === selectedClinicId)?.clinic_name}</Badge>
                {configs.find(c => c.clinic_id === selectedClinicId) && (
                  <Badge variant="secondary" className="text-[10px]">Configured</Badge>
                )}
              </div>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setSelectedClinicId(null); setSearch(""); }}>
                Change Clinic
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Hospital Type</Label>
                <Select
                  value={formData.hospital_type?.toString() ?? ""}
                  onValueChange={v => updateField("hospital_type", parseInt(v) as HospitalType)}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">TYPE 1 (Full Hospital)</SelectItem>
                    <SelectItem value="2">TYPE 2 (ER + Hours)</SelectItem>
                    <SelectItem value="3">TYPE 3 (General Practice)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Jurisdiction</Label>
                <Select
                  value={formData.jurisdiction ?? ""}
                  onValueChange={v => updateField("jurisdiction", v as Jurisdiction)}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BC">BC</SelectItem>
                    <SelectItem value="CA-OTHER">CA (Other)</SelectItem>
                    <SelectItem value="US">US</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Geo Radius (km)</Label>
                <Input
                  type="number"
                  value={formData.geo_radius_km ?? 7}
                  onChange={e => updateField("geo_radius_km", parseInt(e.target.value) || 7)}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Cluster</Label>
                <Select
                  value={formData.cluster_id ?? ""}
                  onValueChange={v => updateField("cluster_id", v || null)}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {clusters.map(c => (
                      <SelectItem key={c.cluster_id} value={c.cluster_id}>{c.cluster_id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Position</Label>
                <Select
                  value={formData.cluster_position ?? ""}
                  onValueChange={v => updateField("cluster_position", v as ClusterPosition || null)}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Auto" /></SelectTrigger>
                  <SelectContent>
                    {['A', 'B', 'C', 'D'].map(p => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Phone Number</Label>
                <Input
                  value={formData.phone_number ?? ""}
                  onChange={e => updateField("phone_number", e.target.value)}
                  className="h-8 text-xs"
                  placeholder="604-555-1234"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Neighbourhood</Label>
                <Input
                  value={formData.neighbourhood ?? ""}
                  onChange={e => updateField("neighbourhood", e.target.value)}
                  className="h-8 text-xs"
                  placeholder="e.g. Kitsilano"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Website URL</Label>
                <Input
                  value={formData.website_url ?? ""}
                  onChange={e => updateField("website_url", e.target.value)}
                  className="h-8 text-xs"
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Local Landmarks (comma-separated)</Label>
              <Input
                value={formData.local_landmarks?.join(", ") ?? ""}
                onChange={e => updateField("local_landmarks", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
                className="h-8 text-xs"
                placeholder="e.g. Stanley Park, Granville Island"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Top Services (comma-separated)</Label>
              <Input
                value={formData.top_services?.join(", ") ?? ""}
                onChange={e => updateField("top_services", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
                className="h-8 text-xs"
                placeholder="e.g. Dental Cleaning, Vaccines, Surgery"
              />
            </div>

            {isAdmin && (
              <Button size="sm" className="gap-1.5 text-xs" onClick={handleSave} disabled={upsertConfig.isPending}>
                <Save className="h-3 w-3" />
                {upsertConfig.isPending ? "Saving..." : "Save Configuration"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
