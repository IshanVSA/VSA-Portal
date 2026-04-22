import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import KPICard from "./KPICard";
import { Building2, FileText, BarChart3, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import UpcomingPosts from "./UpcomingPosts";
import RecentActivity from "./RecentActivity";
import { ClinicLogoUploader } from "@/components/clinic-detail/ClinicLogoUploader";

interface Clinic {
  id: string;
  clinic_name: string;
  logo_url: string | null;
}

export default function ClientDashboard() {
  const { user } = useAuth();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [postCount, setPostCount] = useState(0);
  const [analyticsCount, setAnalyticsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const { data: clinicData } = await supabase
        .from("clinics").select("id, clinic_name, logo_url")
        .eq("owner_user_id", user.id);
      const owned = clinicData || [];
      setClinics(owned);
      if (owned.length > 0) {
        const clinicIds = owned.map(c => c.id);
        const [postsRes, analyticsRes] = await Promise.all([
          supabase.from("content_posts").select("id").in("clinic_id", clinicIds),
          supabase.from("analytics").select("id").in("clinic_id", clinicIds),
        ]);
        setPostCount((postsRes.data || []).length);
        setAnalyticsCount((analyticsRes.data || []).length);
      }
      setLoading(false);
    };
    fetchData();
  }, [user]);

  return (
    <div className="space-y-5">
      {/* Compact Header */}
      <div className="pb-4 border-b border-border/60">
        <h1 className="text-xl font-bold text-foreground tracking-tight">
          {user?.user_metadata?.full_name ? `${(user.user_metadata.full_name as string).split(" ")[0]}'s Portal` : "Client Portal"}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · {clinics.length} clinic{clinics.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KPICard label="Your Clinics" value={clinics.length} icon={Building2} index={0} gradient="blue" />
        <KPICard label="Content Posts" value={postCount} icon={FileText} index={1} gradient="purple" />
        <KPICard label="Analytics Records" value={analyticsCount} icon={BarChart3} index={2} gradient="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <UpcomingPosts />
        <RecentActivity />
      </div>

      {loading ? (
        <DashboardSkeleton />
      ) : clinics.length === 0 ? (
        <Card className="border-border/60">
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground mb-3">No clinics linked to your account yet.</p>
            <p className="text-xs text-muted-foreground">Contact your account manager to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <h2 className="section-header">Your Clinics</h2>
          {clinics.map((clinic) => (
            <Card key={clinic.id} className="group border-border/60 hover:shadow-md transition-shadow">
              <CardContent className="py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <ClinicLogoUploader
                    clinicId={clinic.id}
                    clinicName={clinic.clinic_name}
                    logoUrl={clinic.logo_url}
                    size={36}
                    onChange={(url) => setClinics((prev) => prev.map((c) => c.id === clinic.id ? { ...c, logo_url: url } : c))}
                  />
                  <span className="font-medium text-sm text-foreground">{clinic.clinic_name}</span>
                </div>
                <Link to={`/clinics/${clinic.id}`}>
                  <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-primary">
                    View <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
