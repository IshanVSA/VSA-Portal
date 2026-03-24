import { useSearchParams } from "react-router-dom";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { AnimatePresence, motion } from "framer-motion";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Globe, LayoutDashboard, Ticket, BarChart3, FileText, Upload, Eye, TrendingUp, Clock, Layers, HeartPulse } from "lucide-react";
import { DepartmentOverview } from "@/components/department/DepartmentOverview";
import { TicketsTab } from "@/components/department/TicketsTab";
import { WebsiteAnalyticsTab } from "@/components/department/WebsiteAnalyticsTab";
import { WebsiteReportsTab } from "@/components/department/WebsiteReportsTab";
import { UploadsTab } from "@/components/department/UploadsTab";
import { WebsiteHealthTab } from "@/components/department/WebsiteHealthTab";
import { useDepartmentTeam } from "@/hooks/useDepartmentTeam";
import { useClinicSelector } from "@/hooks/useClinicSelector";
import { useWebsiteKPIs } from "@/hooks/useWebsiteKPIs";
import { useUserRole } from "@/hooks/useUserRole";
import { useClinicServiceAccess } from "@/hooks/useClinicServiceAccess";
import { DepartmentAccessLocked } from "@/components/department/DepartmentAccessLocked";

const baseTabs = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "tickets", label: "Tickets", icon: Ticket },
  { value: "analytics", label: "Analytics", icon: BarChart3 },
  { value: "reports", label: "Reports", icon: FileText },
  { value: "uploads", label: "Uploads", icon: Upload },
];

const healthTab = { value: "health", label: "Health", icon: HeartPulse };

const services = [
  "Time Changes", "Pop-up Offers", "Third Party Integrations", "Payment Options",
  "Add/Remove Team Members", "New Forms", "Price List Updates", "Emergency", "Others",
];

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatChange(current: number, previous: number, suffix = ""): { text: string; type: "positive" | "negative" | "neutral" } {
  if (previous === 0 && current === 0) return { text: "No data", type: "neutral" };
  if (previous === 0) return { text: `+${current}${suffix} (new)`, type: "positive" };
  const diff = current - previous;
  const pct = Math.round((diff / previous) * 1000) / 10;
  const sign = pct >= 0 ? "+" : "";
  return { text: `${sign}${pct}% vs last week`, type: pct > 0 ? "positive" : pct < 0 ? "negative" : "neutral" };
}

export default function WebsiteDepartment() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get("tab") || "overview";
  const { clinics, selectedClinic, selectedClinicId, setSelectedClinicId, loading: clinicsLoading } = useClinicSelector();
  const { team } = useDepartmentTeam("website", selectedClinicId);
  const kpiData = useWebsiteKPIs(selectedClinicId);
  const { role } = useUserRole();
  const canViewHealth = role === "admin" || role === "concierge";
  const { isLocked, loading: accessLoading } = useClinicServiceAccess(selectedClinic, "website", clinicsLoading);
  const tabs = canViewHealth ? [...baseTabs, healthTab] : baseTabs;

  const selectedClinicName = selectedClinic?.clinic_name;

  const visitorsChange = formatChange(kpiData.visitorsToday, kpiData.visitorsLastWeek);
  const engagementChange = formatChange(kpiData.engagedSessions, kpiData.engagedSessionsPrev);
  const durationChange = formatChange(kpiData.avgSessionDuration, kpiData.avgSessionDurationPrev);
  const pagesChange = formatChange(kpiData.pagesPerSession, kpiData.pagesPerSessionPrev);

  const kpis = [
    { label: "Visitors Today", value: kpiData.loading ? "—" : kpiData.visitorsToday.toLocaleString(), change: kpiData.loading ? "" : visitorsChange.text, changeType: visitorsChange.type, icon: Eye, gradient: "blue" as const },
    { label: "Engaged Sessions", value: kpiData.loading ? "—" : kpiData.engagedSessions.toLocaleString(), change: kpiData.loading ? "" : engagementChange.text, changeType: engagementChange.type, icon: TrendingUp, gradient: "green" as const },
    { label: "Avg. Session", value: kpiData.loading ? "—" : formatDuration(kpiData.avgSessionDuration), change: kpiData.loading ? "" : durationChange.text, changeType: durationChange.type, icon: Clock, gradient: "amber" as const },
    { label: "Pages/Session", value: kpiData.loading ? "—" : kpiData.pagesPerSession.toString(), change: kpiData.loading ? "" : pagesChange.text, changeType: pagesChange.type, icon: Layers, gradient: "purple" as const },
  ];

  const trafficData = kpiData.dailyTraffic.length > 0 ? kpiData.dailyTraffic : [{ label: "—", value: 0 }];

  const handleTabChange = (v: string) => {
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set("tab", v); return next; }, { replace: true });
  };

  return (
    <>
      <div className="space-y-4 dept-tint-website min-h-full -m-6 p-6" data-dept="Website">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-[hsl(var(--dept-website))]/10 flex items-center justify-center">
              <Globe className="h-4 w-4 text-[hsl(var(--dept-website))]" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">Website</h1>
              {selectedClinicName && <p className="text-xs text-muted-foreground -mt-0.5">{selectedClinicName}</p>}
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {accessLoading ? (
            <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <DashboardSkeleton />
            </motion.div>
          ) : isLocked ? (
            <motion.div key="locked" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <DepartmentAccessLocked clinicName={selectedClinicName} departmentName="Website" />
            </motion.div>
          ) : (
            <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
                <TabsList className="w-full justify-start bg-muted/50 h-10 p-1 overflow-x-auto">
                  {tabs.map(tab => (
                    <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 text-xs data-[state=active]:shadow-sm">
                      <tab.icon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{tab.label}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value="overview" className="mt-4">
                  <DepartmentOverview kpis={kpis} services={services} trafficData={trafficData} trafficLabel="Weekly Traffic" team={team} department="website" accentColor="hsl(var(--dept-website))" clinicId={selectedClinicId} />
                </TabsContent>
                <TabsContent value="tickets" className="mt-4"><TicketsTab department="website" services={services} clinicId={selectedClinicId} /></TabsContent>
                <TabsContent value="analytics" className="mt-4"><WebsiteAnalyticsTab clinicId={selectedClinicId} /></TabsContent>
                <TabsContent value="reports" className="mt-4"><WebsiteReportsTab clinicId={selectedClinicId} /></TabsContent>
                <TabsContent value="uploads" className="mt-4"><UploadsTab department="website" clinicId={selectedClinicId} /></TabsContent>
                {canViewHealth && <TabsContent value="health" className="mt-4"><WebsiteHealthTab clinicId={selectedClinicId} /></TabsContent>}
              </Tabs>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
}
