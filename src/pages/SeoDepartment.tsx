import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { AnimatePresence, motion } from "framer-motion";
import { useSearchParams } from "react-router-dom";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SearchCode, LayoutGrid, FileText, Upload, Globe, Link2, Hash, TrendingUp, MessageCircle, BookOpen, ListChecks, BarChart3 } from "lucide-react";
import { DepartmentOverview } from "@/components/department/DepartmentOverview";
import { SeoReportsTab } from "@/components/department/SeoReportsTab";
import { UploadsTab } from "@/components/department/UploadsTab";
import { useDepartmentTeam } from "@/hooks/useDepartmentTeam";
import { useClinicSelector } from "@/hooks/useClinicSelector";
import { useSeoAnalytics } from "@/hooks/useSeoAnalytics";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SeoKeyword } from "@/hooks/useSeoAnalytics";
import { useClinicServiceAccess } from "@/hooks/useClinicServiceAccess";
import { DepartmentAccessLocked } from "@/components/department/DepartmentAccessLocked";
import { AdminServiceLockNotice } from "@/components/department/AdminServiceLockNotice";
import { DepartmentChat } from "@/components/department/DepartmentChat";
import { useDepartmentChatUnread } from "@/hooks/useDepartmentChatUnread";
import { BlogTab } from "@/components/seo/blog/BlogTab";
import { TasksTab } from "@/components/department/tasks/TasksTab";
import { useMyOpenTaskCount } from "@/hooks/useDepartmentTasks";
import { SeoTrafficTab } from "@/components/department/SeoTrafficTab";




const commonTabs = [
  { value: "overview", label: "Overview", icon: LayoutGrid },
  { value: "traffic", label: "Traffic", icon: BarChart3 },
  { value: "reports", label: "Reports", icon: FileText },

  { value: "uploads", label: "Files", icon: Upload },
];
const chatTab = { value: "chat", label: "Team Chat", icon: MessageCircle };
const clientChatTab = { value: "client-chat", label: "Client Chat", icon: MessageCircle };
const tasksTabDef = { value: "tasks", label: "Tasks", icon: ListChecks };
const blogTab = { value: "blog", label: "Blog", icon: BookOpen };
function TopKeywordsCard({ keywords }: { keywords: SeoKeyword[] }) {
  if (keywords.length === 0) {
    return (
      <Card className="border-border/60">
        <div className="px-4 py-3 border-b border-border/40">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Hash className="h-3.5 w-3.5 text-muted-foreground" /> Top Keywords
          </h3>
        </div>
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground text-center">No keyword data yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60">
      <div className="px-4 py-3 border-b border-border/40">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Hash className="h-3.5 w-3.5 text-muted-foreground" /> Top Keywords
        </h3>
      </div>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Keyword</TableHead>
              <TableHead className="text-right w-20">Position</TableHead>
              <TableHead className="text-right w-20">Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keywords.map((kw, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="font-medium">{kw.keyword}</TableCell>
                <TableCell className="text-right tabular-nums">{kw.position}</TableCell>
                <TableCell className={`text-right tabular-nums font-medium ${kw.change.startsWith("+") ? "text-success" : kw.change.startsWith("-") ? "text-destructive" : ""}`}>
                  {kw.change}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

const fallbackKpis = [
  { label: "Domain Authority", value: 0, icon: Globe, gradient: "blue" as const },
  { label: "Backlinks", value: 0, icon: Link2, gradient: "green" as const },
  { label: "Keywords Top 10", value: 0, icon: Hash, gradient: "amber" as const },
  { label: "Organic Traffic", value: 0, icon: TrendingUp, gradient: "purple" as const },
];

export default function SeoDepartment() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab") || "overview";
  const currentTab = rawTab === "analytics" ? "overview" : rawTab;
  const { clinics, selectedClinic, selectedClinicId, setSelectedClinicId, loading: clinicsLoading } = useClinicSelector();
  const { team } = useDepartmentTeam("seo", selectedClinicId);
  const { latest, trafficData, topKeywords } = useSeoAnalytics(selectedClinicId);
  const { role } = useUserRole();
  const { isLocked, isAdminBypass, loading: accessLoading } = useClinicServiceAccess(selectedClinic, "seo", clinicsLoading);
  const isClient = role === "client";
  const isStaff = !isClient;
  const { unreadCount, markAsRead } = useDepartmentChatUnread("seo", selectedClinicId);
  const { unreadCount: clientUnread, markAsRead: markClientRead } = useDepartmentChatUnread("seo", selectedClinicId, "client");
  const myOpenTasks = useMyOpenTaskCount("seo", selectedClinicId);
  const tabs = isStaff ? [...commonTabs, blogTab, clientChatTab, tasksTabDef, chatTab] : [...commonTabs, blogTab, clientChatTab];

  const selectedClinicName = selectedClinic?.clinic_name;

  const kpis = latest
    ? [
        { label: "Domain Authority", value: latest.domain_authority, icon: Globe, gradient: "blue" as const },
        { label: "Backlinks", value: latest.backlinks.toLocaleString(), icon: Link2, gradient: "green" as const },
        { label: "Keywords Top 10", value: latest.keywords_top_10, icon: Hash, gradient: "amber" as const },
        { label: "Organic Traffic", value: latest.organic_traffic.toLocaleString(), icon: TrendingUp, gradient: "purple" as const },
      ]
    : fallbackKpis;

  const handleTabChange = (v: string) => {
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set("tab", v); return next; }, { replace: true });
  };

  return (
    <>
      <div className="space-y-4 dept-tint-seo min-h-full -m-3 p-3 sm:-m-4 sm:p-4 lg:-m-8 lg:p-8" data-dept="SEO">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-[hsl(var(--dept-seo))]/10 flex items-center justify-center">
              <SearchCode className="h-4 w-4 text-[hsl(var(--dept-seo))]" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">SEO</h1>
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
              <DepartmentAccessLocked clinicName={selectedClinicName} departmentName="SEO" />
            </motion.div>
          ) : (
            <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="space-y-3">
              {isAdminBypass && <AdminServiceLockNotice clinicName={selectedClinicName} departmentName="SEO" />}
              <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
                <div className="sticky top-14 z-20 -mx-3 sm:-mx-4 lg:-mx-8 px-3 sm:px-4 lg:px-8 py-2 bg-background/85 backdrop-blur-md border-b border-border/40">
                <TabsList className="w-full justify-start bg-muted/50 h-10 p-1 overflow-x-auto flex-nowrap tabs-scroll">
                  {tabs.map(tab => (
                    <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 text-xs data-[state=active]:shadow-sm relative">
                      <tab.icon strokeWidth={1.5} className="h-4 w-4" />
                      <span className="hidden sm:inline">{tab.label}</span>
                      {tab.value === "chat" && unreadCount > 0 && currentTab !== "chat" && (
                        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      )}
                      {tab.value === "client-chat" && clientUnread > 0 && currentTab !== "client-chat" && (
                        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                          {clientUnread > 99 ? "99+" : clientUnread}
                        </span>
                      )}
                      {tab.value === "tasks" && myOpenTasks > 0 && currentTab !== "tasks" && (
                        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1">
                          {myOpenTasks > 99 ? "99+" : myOpenTasks}
                        </span>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
                </div>

                <TabsContent value="overview" className="mt-4">
                  <DepartmentOverview kpis={kpis} trafficData={trafficData.length > 0 ? trafficData : [{ label: "No data", value: 0 }]} trafficLabel="Organic Traffic Trend" team={team} department="seo" accentColor="hsl(var(--dept-seo))" extraSection={<TopKeywordsCard keywords={topKeywords} />} clinicId={selectedClinicId} hideQuickActions />
                </TabsContent>
                <TabsContent value="traffic" className="mt-4"><SeoTrafficTab clinicId={selectedClinicId} /></TabsContent>
                <TabsContent value="reports" className="mt-4"><SeoReportsTab clinicId={selectedClinicId} /></TabsContent>
                
                <TabsContent value="uploads" className="mt-4"><UploadsTab department="seo" clinicId={selectedClinicId} /></TabsContent>
                <TabsContent value="blog" className="mt-4"><BlogTab clinicId={selectedClinicId} /></TabsContent>
                {isStaff && <TabsContent value="tasks" className="mt-4"><TasksTab department="seo" clinicId={selectedClinicId} /></TabsContent>}
                {isStaff && <TabsContent value="chat" className="mt-4"><DepartmentChat department="seo" clinicId={selectedClinicId} onVisible={markAsRead} /></TabsContent>}
              </Tabs>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>

  );
}
