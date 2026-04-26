import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { ClientJourney as ClientJourneyComponent } from "@/components/clinic-detail/ClientJourney";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Milestone, Building2 } from "lucide-react";
import { PageTransition } from "@/components/PageTransition";

interface ClinicOption {
  id: string;
  clinic_name: string;
}

export default function ClientJourneyPage() {
  const { role } = useUserRole();
  const { user } = useAuth();
  const [clinics, setClinics] = useState<ClinicOption[]>([]);
  const [selectedClinicId, setSelectedClinicId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchClinics() {
      setLoading(true);
      if (role === "admin") {
        const { data } = await supabase
          .from("clinics")
          .select("id, clinic_name")
          .order("clinic_name");
        setClinics(data ?? []);
        if (data && data.length > 0) setSelectedClinicId(data[0].id);
      } else if (role === "concierge" && user) {
        const { data: teamRows } = await supabase
          .from("clinic_team_members")
          .select("clinic_id")
          .eq("user_id", user.id);
        const clinicIds = teamRows?.map((r) => r.clinic_id) ?? [];
        if (clinicIds.length > 0) {
          const { data } = await supabase
            .from("clinics")
            .select("id, clinic_name")
            .in("id", clinicIds)
            .order("clinic_name");
          setClinics(data ?? []);
          if (data && data.length > 0) setSelectedClinicId(data[0].id);
        }
      } else if (role === "client" && user) {
        const { data } = await supabase
          .from("clinics")
          .select("id, clinic_name")
          .eq("owner_user_id", user.id)
          .order("clinic_name");
        setClinics(data ?? []);
        if (data && data.length > 0) setSelectedClinicId(data[0].id);
      }
      setLoading(false);
    }
    if (role && user) fetchClinics();
  }, [role, user]);

  if (loading) {
    return (
      <PageTransition>
        <div className="p-6 space-y-4">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          <div className="h-64 bg-muted animate-pulse rounded" />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-primary/10 shrink-0">
              <Milestone className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">Client Journey</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">Track onboarding progress across all phases</p>
            </div>
          </div>

          {clinics.length > 1 && (
            <Select value={selectedClinicId} onValueChange={setSelectedClinicId}>
              <SelectTrigger className="w-full sm:w-[260px]">
                <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Select clinic" />
              </SelectTrigger>
              <SelectContent>
                {clinics.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.clinic_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {selectedClinicId ? (
          <ClientJourneyComponent clinicId={selectedClinicId} readOnly={role === "client"} />
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Milestone className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-medium">No Clinics Available</h3>
              <p className="text-sm text-muted-foreground mt-1">
                You don't have any clinics assigned yet.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </PageTransition>
  );
}
