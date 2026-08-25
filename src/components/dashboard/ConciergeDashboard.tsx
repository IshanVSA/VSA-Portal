import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { StatusMetric, MetricDivider } from "./StatusMetric";
import { Building2, FileText, Megaphone, ArrowRight } from "lucide-react";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import UpcomingPosts from "./UpcomingPosts";
import RecentActivity from "./RecentActivity";
import MyTickets from "./MyTickets";
import MyTasks from "./MyTasks";
import { cn } from "@/lib/utils";

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

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
      <div className="overflow-hidden rounded-3xl border border-border/60 bg-card/70 shadow-sm backdrop-blur-sm divide-y divide-border/50">
        {/* HERO */}
        <section className="relative overflow-hidden bg-gradient-to-br from-card via-card to-muted/30 px-4 py-7 sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-[hsl(var(--dept-social))]/10 blur-3xl" />
          <div className="relative space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {user?.user_metadata?.full_name
                ? `Welcome back, ${formatDisplayName(user.user_metadata.full_name as string)}`
                : "Welcome back"}
            </h1>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                {clinics.length} assigned clinic{clinics.length !== 1 ? "s" : ""}
              </span>
              {pendingCount > 0 && (
                <span className="inline-flex items-center gap-1.5 text-warning">
                  <FileText className="h-3.5 w-3.5" />
                  {pendingCount} awaiting review
                </span>
              )}
            </p>
          </div>
        </section>

        {/* STATUS STRIP */}
        <section className="px-4 py-4 sm:px-8">
          <div className="relative grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:gap-x-8">
            <div className="relative">
              <StatusMetric
                label="Assigned Clinics"
                value={clinics.length}
                caption="active accounts"
                icon={Building2}
                tone="primary"
                index={0}
              />
            </div>
            <div className="relative">
              <MetricDivider />
              <StatusMetric
                label="Total Posts"
                value={postCount}
                caption="across your clinics"
                icon={FileText}
                tone="neutral"
                index={1}
              />
            </div>
            <div className="relative">
              <MetricDivider from="sm" />
              <StatusMetric
                label="Pending Review"
                value={pendingCount}
                caption={pendingCount > 0 ? "awaiting action" : "all caught up"}
                icon={Megaphone}
                tone={pendingCount > 0 ? "warning" : "success"}
                index={2}
              />
            </div>
          </div>
        </section>

        {/* WORK QUEUES */}
        <section className="px-4 py-5 sm:px-8">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <MyTickets />
            <MyTasks />
          </div>
        </section>

        {/* CONTENT & ACTIVITY */}
        <section className="px-4 py-5 sm:px-8">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <UpcomingPosts />
            <RecentActivity />
          </div>
        </section>

        {/* CLINICS */}
        <section className="px-4 py-5 sm:px-8">
          <header className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold tracking-tight text-foreground">Your Clinics</h3>
              <p className="text-[11px] text-muted-foreground">Accounts assigned to you</p>
            </div>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold tabular-nums text-foreground">
              {clinics.length}
            </span>
          </header>
          {loading ? (
            <DashboardSkeleton />
          ) : clinics.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No clinics assigned to you yet. Contact your admin.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-x-8 md:grid-cols-2 xl:grid-cols-3">
              {clinics.map((clinic) => (
                <li key={clinic.id} className="border-b border-border/40 last:border-0 md:[&:nth-last-child(-n+2)]:border-0">
                  <Link
                    to={`/clinics/${clinic.id}`}
                    className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/50"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-bold text-primary ring-1 ring-inset ring-border/40">
                      {clinic.clinic_name.charAt(0)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{clinic.clinic_name}</span>
                      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className={cn("h-1.5 w-1.5 rounded-full", clinic.status === "active" ? "bg-success" : "bg-muted-foreground")} />
                        {clinic.status}
                      </span>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </motion.div>
  );
}
