import { useSearchParams } from "react-router-dom";

import { useUserRole } from "@/hooks/useUserRole";
import { useClinicSelector } from "@/hooks/useClinicSelector";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Share2, LayoutDashboard, FileCheck, CalendarDays, ClipboardList, BarChart3, Ticket, Upload, MessageSquare } from "lucide-react";
import { SocialOverview } from "@/components/social/SocialOverview";
import { lazy, Suspense } from "react";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { AnimatePresence, motion } from "framer-motion";

import { TicketsTab } from "@/components/department/TicketsTab";
import { UploadsTab } from "@/components/department/UploadsTab";
import { useClinicServiceAccess } from "@/hooks/useClinicServiceAccess";
import { DepartmentAccessLocked } from "@/components/department/DepartmentAccessLocked";
import { DepartmentChat } from "@/components/department/DepartmentChat";
import { useDepartmentChatUnread } from "@/hooks/useDepartmentChatUnread";

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

const baseTabs = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "requests", label: "Content Requests", icon: FileCheck },
  { value: "tickets", label: "Tickets", icon: Ticket },
  { value: "calendar", label: "Calendar", icon: CalendarDays },
  { value: "intake", label: "Intake", icon: ClipboardList },
  { value: "analytics", label: "Analytics", icon: BarChart3 },
  { value: "uploads", label: "Uploads", icon: Upload },
];
const chatTab = { value: "chat", label: "Team Chat", icon: MessageSquare };

export default function SocialMedia() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { role } = useUserRole();
  const { clinics, selectedClinic, selectedClinicId, setSelectedClinicId, loading: clinicsLoading } = useClinicSelector();
  const currentTab = searchParams.get("tab") || "overview";
  const { isLocked, loading: accessLoading } = useClinicServiceAccess(selectedClinic, "social_media", clinicsLoading);

  const isStaff = role === "admin" || role === "concierge";
  const { unreadCount, markAsRead } = useDepartmentChatUnread("social_media", selectedClinicId);
  const visibleTabs = role === "client" ? baseTabs.filter(t => ["overview", "requests", "tickets"].includes(t.value)) : [...baseTabs, ...(isStaff ? [chatTab] : [])];

  const handleTabChange = (value: string) => {
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set("tab", value); return next; }, { replace: true });
  };

  const selectedClinicName = selectedClinic?.clinic_name;

  return (
    <>
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

        <AnimatePresence mode="wait">
          {accessLoading ? (
            <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <DashboardSkeleton />
            </motion.div>
          ) : isLocked ? (
            <motion.div key="locked" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <DepartmentAccessLocked clinicName={selectedClinicName} departmentName="Social Media" />
            </motion.div>
          ) : (
            <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
                <TabsList className="w-full justify-start bg-muted/50 h-10 p-1 overflow-x-auto">
                  {visibleTabs.map(tab => (
                    <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 text-xs data-[state=active]:shadow-sm relative">
                      <tab.icon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{tab.label}</span>
                      <span className="sm:hidden">{tab.label.split(" ").pop()}</span>
                      {tab.value === "chat" && unreadCount > 0 && currentTab !== "chat" && (
                        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      )}
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
                {isStaff && <TabsContent value="chat" className="mt-4"><DepartmentChat department="social_media" clinicId={selectedClinicId} /></TabsContent>}
              </Tabs>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
