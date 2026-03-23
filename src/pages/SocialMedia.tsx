import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useUserRole } from "@/hooks/useUserRole";
import { useClinicSelector } from "@/hooks/useClinicSelector";
import { useClinicSelector } from "@/hooks/useClinicSelector";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Share2, LayoutDashboard, FileCheck, CalendarDays, ClipboardList, BarChart3, Ticket, Upload } from "lucide-react";
import { SocialOverview } from "@/components/social/SocialOverview";
import { lazy, Suspense } from "react";

import { TicketsTab } from "@/components/department/TicketsTab";
import { UploadsTab } from "@/components/department/UploadsTab";
import { useClinicServiceAccess } from "@/hooks/useClinicServiceAccess";
import { DepartmentAccessLocked } from "@/components/department/DepartmentAccessLocked";

const ContentRequestsContent = lazy(() => import("@/components/social/ContentRequestsContent"));
const ContentCalendarContent = lazy(() => import("@/components/social/ContentCalendarContent"));
const IntakeFormsContent = lazy(() => import("@/components/social/IntakeFormsContent"));
const AnalyticsContent = lazy(() => import("@/components/social/AnalyticsContent"));

const TabFallback = () => (
  <div className="py-12 flex items-center justify-center">
    <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const socialServices = ["Content Creation", "Post Scheduling", "Engagement Management", "Analytics Review", "Campaign Strategy", "Others"];

const allTabs = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "requests", label: "Content Requests", icon: FileCheck },
  { value: "tickets", label: "Tickets", icon: Ticket },
  { value: "calendar", label: "Calendar", icon: CalendarDays },
  { value: "intake", label: "Intake", icon: ClipboardList },
  { value: "analytics", label: "Analytics", icon: BarChart3 },
  { value: "uploads", label: "Uploads", icon: Upload },
];

export default function SocialMedia() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { role } = useUserRole();
  const { clinics, selectedClinic, selectedClinicId, setSelectedClinicId, loading: clinicsLoading } = useClinicSelector();
  const currentTab = searchParams.get("tab") || "overview";
  const { isLocked } = useClinicServiceAccess(selectedClinic, "social_media");

  const visibleTabs = role === "client" ? allTabs.filter(t => ["overview", "requests", "tickets"].includes(t.value)) : allTabs;

  const handleTabChange = (value: string) => {
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set("tab", value); return next; }, { replace: true });
  };

  const selectedClinicName = selectedClinic?.clinic_name;

  return (
    <DashboardLayout>
      <div className="space-y-4 dept-tint-social min-h-full -m-6 p-6" data-dept="Social Media">
        {/* Compact page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-[hsl(var(--dept-social))]/10 flex items-center justify-center">
              <Share2 className="h-4 w-4 text-[hsl(var(--dept-social))]" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">Social Media</h1>
              {selectedClinicName && <p className="text-xs text-muted-foreground -mt-0.5">{selectedClinicName}</p>}
            </div>
          </div>
        </div>

        {isLocked ? (
          <DepartmentAccessLocked clinicName={selectedClinicName} departmentName="Social Media" />
        ) : (
          <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="w-full justify-start bg-muted/50 h-10 p-1 overflow-x-auto">
              {visibleTabs.map(tab => (
                <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 text-xs data-[state=active]:shadow-sm">
                  <tab.icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.label.split(" ").pop()}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="overview" className="mt-4"><SocialOverview clinicId={selectedClinicId} /></TabsContent>
            <TabsContent value="requests" className="mt-4"><Suspense fallback={<TabFallback />}><ContentRequestsContent clinicId={selectedClinicId} /></Suspense></TabsContent>
            <TabsContent value="tickets" className="mt-4"><TicketsTab department="social_media" services={socialServices} clinicId={selectedClinicId} /></TabsContent>
            <TabsContent value="calendar" className="mt-4"><Suspense fallback={<TabFallback />}><ContentCalendarContent clinicId={selectedClinicId} /></Suspense></TabsContent>
            <TabsContent value="intake" className="mt-4"><Suspense fallback={<TabFallback />}><IntakeFormsContent clinicId={selectedClinicId} /></Suspense></TabsContent>
            <TabsContent value="analytics" className="mt-4"><Suspense fallback={<TabFallback />}><AnalyticsContent clinicId={selectedClinicId} /></Suspense></TabsContent>
            <TabsContent value="uploads" className="mt-4"><UploadsTab department="social_media" clinicId={selectedClinicId} /></TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
