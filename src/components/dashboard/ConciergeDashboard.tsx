import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import KPICard from "./KPICard";
import { Building2, FileText, Megaphone, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import UpcomingPosts from "./UpcomingPosts";
import RecentActivity from "./RecentActivity";
import MyTickets from "./MyTickets";
import OpenTicketsList from "./OpenTicketsList";
import { formatDisplayName } from "@/lib/display-name";

interface Clinic {
  id: string;
  clinic_name: string;
  status: string;
}

export default function ConciergeDashboard() {
  const { user } = useAuth();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [postCount, setPostCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      // RLS now handles concierge clinic visibility (assigned_concierge_id + clinic_team_members)
      const { data: clinicData } = await supabase
        .from("clinics").select("id, clinic_name, status")
        .eq("status", "active");
      const assignedClinics = clinicData || [];
      setClinics(assignedClinics);
      if (assignedClinics.length > 0) {
        const clinicIds = assignedClinics.map(c => c.id);
        const [totalRes, pendingRes] = await Promise.all([
          supabase.from("content_posts").select("id").in("clinic_id", clinicIds),
          supabase.from("content_posts").select("id").in("clinic_id", clinicIds).eq("status", "pending"),
        ]);
        setPostCount((totalRes.data || []).length);
        setPendingCount((pendingRes.data || []).length);
      }
      setLoading(false);
    };
    fetchData();
  }, [user]);

  const statusLine = [
    `${clinics.length} assigned clinic${clinics.length !== 1 ? "s" : ""}`,
    pendingCount > 0 && `${pendingCount} pending review`,
  ].filter(Boolean).join(" · ");

  return (
    <div className="space-y-5">
      {/* Compact Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-4 border-b border-border/60">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            {user?.user_metadata?.full_name ? `${formatDisplayName(user.user_metadata.full_name as string)}'s Dashboard` : "Dashboard"}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">{statusLine}</p>
        </div>
        <Badge variant="secondary" className="rounded-full text-xs w-fit">{clinics.length} assigned</Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KPICard label="Assigned Clinics" value={clinics.length} icon={Building2} index={0} gradient="blue" />
        <KPICard label="Total Posts" value={postCount} icon={FileText} index={1} gradient="purple" />
        <KPICard label="Pending Review" value={pendingCount} icon={Megaphone} index={2} gradient="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <MyTickets />
        <UpcomingPosts />
        <RecentActivity />
      </div>

      <div>
        <h2 className="section-header mb-3">Your Clinics</h2>
        {loading ? (
          <DashboardSkeleton />
        ) : clinics.length === 0 ? (
          <Card className="border-border/60">
            <CardContent className="py-10 text-center">
              <p className="text-sm text-muted-foreground">No clinics assigned to you yet. Contact your admin.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {clinics.map((clinic) => (
              <Card key={clinic.id} className="group border-border/60 hover:shadow-md transition-shadow">
                <CardContent className="py-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-md bg-primary/8 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-primary">{clinic.clinic_name.charAt(0)}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{clinic.clinic_name}</p>
                      <Badge variant={clinic.status === "active" ? "default" : "secondary"} className="rounded-full text-[10px] mt-0.5">{clinic.status}</Badge>
                    </div>
                  </div>
                  <Link to={`/clinics/${clinic.id}`}>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-primary">
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
