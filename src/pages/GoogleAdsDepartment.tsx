import { useSearchParams } from "react-router-dom";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { AnimatePresence, motion } from "framer-motion";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Megaphone, LayoutDashboard, Ticket, BarChart3, FileText, Upload, DollarSign, MousePointerClick, Percent, Eye, MessageSquare } from "lucide-react";
import { DepartmentOverview } from "@/components/department/DepartmentOverview";
import { TicketsTab } from "@/components/department/TicketsTab";
import { GoogleAdsAnalyticsTab } from "@/components/department/GoogleAdsAnalyticsTab";
import { GoogleAdsReportsTab } from "@/components/department/GoogleAdsReportsTab";
import { UploadsTab } from "@/components/department/UploadsTab";
import { useDepartmentTeam } from "@/hooks/useDepartmentTeam";
import { useClinicSelector } from "@/hooks/useClinicSelector";
import { useGoogleAdsKPIs } from "@/hooks/useGoogleAdsKPIs";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useClinicServiceAccess } from "@/hooks/useClinicServiceAccess";
import { DepartmentAccessLocked } from "@/components/department/DepartmentAccessLocked";
import { useUserRole } from "@/hooks/useUserRole";
import { DepartmentChat } from "@/components/department/DepartmentChat";
import { useDepartmentChatUnread } from "@/hooks/useDepartmentChatUnread";

const baseTabs = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "tickets", label: "Tickets", icon: Ticket },
  { value: "analytics", label: "Analytics", icon: BarChart3 },
  { value: "reports", label: "Reports", icon: FileText },
  { value: "uploads", label: "Files", icon: Upload },
];
const chatTab = { value: "chat", label: "Team Chat", icon: MessageSquare };

const services = ["Dashboard Access", "Analytics Review", "Monthly Performance Report", "Call Volume Issues", "Wrong Call Tracking", "Campaign Adjustments", "Others"];
const quickActions = ["Call Volume Issues", "Wrong Call Tracking", "Others"];

export default function GoogleAdsDepartment() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get("tab") || "overview";
  const { clinics, selectedClinic, selectedClinicId, setSelectedClinicId, loading: clinicsLoading } = useClinicSelector();
  const { team } = useDepartmentTeam("google_ads", selectedClinicId);
  const adsData = useGoogleAdsKPIs(selectedClinicId);
  const { isLocked, loading: accessLoading } = useClinicServiceAccess(selectedClinic, "google_ads", clinicsLoading);
  const { role } = useUserRole();
  const isStaff = role === "admin" || role === "concierge";
  const { unreadCount, markAsRead } = useDepartmentChatUnread("google_ads", selectedClinicId);
  const tabs = isStaff ? [...baseTabs, chatTab] : baseTabs;
  const selectedClinicName = selectedClinic?.clinic_name;

  const kpis = [
    { label: "Ad Spend", value: adsData.loading ? "—" : `$${adsData.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, change: "Last 30 days", changeType: "neutral" as const, icon: DollarSign, gradient: "blue" as const },
    { label: "Clicks", value: adsData.loading ? "—" : adsData.clicks.toLocaleString(), change: adsData.hasData ? `CTR: ${adsData.ctr}%` : "", changeType: "neutral" as const, icon: MousePointerClick, gradient: "green" as const },
    { label: "Impressions", value: adsData.loading ? "—" : adsData.impressions.toLocaleString(), change: "Last 30 days", changeType: "neutral" as const, icon: Eye, gradient: "amber" as const },
    { label: "Avg. CPC", value: adsData.loading ? "—" : `$${adsData.cpc.toFixed(2)}`, change: adsData.hasData ? `Spend: $${adsData.cost.toFixed(0)}` : "", changeType: "neutral" as const, icon: Percent, gradient: "purple" as const },
  ];

  const trafficData = adsData.dailyTrend.length > 0 ? adsData.dailyTrend : [{ label: "—", value: 0 }];

  const campaignsCard = adsData.hasData && adsData.campaigns.length > 0 ? (
    <Card className="border-border/60">
      <div className="px-4 py-3 border-b border-border/40">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Megaphone className="h-3.5 w-3.5 text-muted-foreground" /> Top Campaigns
        </h3>
      </div>
      <CardContent className="p-0">
        <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">CPC</TableHead>
                <TableHead className="text-right">CTR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {adsData.campaigns.map(c => (
              <TableRow key={c.name}>
                <TableCell className="font-medium truncate max-w-[180px]">{c.name}</TableCell>
                <TableCell className="text-right tabular-nums">{c.spend}</TableCell>
                <TableCell className="text-right tabular-nums">{c.clicks}</TableCell>
                <TableCell className="text-right tabular-nums">{c.cpc}</TableCell>
                <TableCell className="text-right tabular-nums">{c.ctr}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  ) : undefined;

  return (
    <>
      <div className="space-y-4 dept-tint-ads min-h-full -m-3 p-3 sm:-m-4 sm:p-4 lg:-m-8 lg:p-8" data-dept="Google Ads">
        {/* Compact page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-[hsl(var(--dept-ads))]/10 flex items-center justify-center">
              <Megaphone className="h-4 w-4 text-[hsl(var(--dept-ads))]" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">Google Ads</h1>
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
              <DepartmentAccessLocked clinicName={selectedClinicName} departmentName="Google Ads" />
            </motion.div>
          ) : (
            <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <Tabs value={currentTab} onValueChange={(v) => setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set("tab", v); return next; }, { replace: true })} className="w-full">
                <TabsList className="w-full justify-start bg-muted/50 h-10 p-1 overflow-x-auto flex-nowrap tabs-scroll">
                  {tabs.map(tab => (
                    <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 text-xs data-[state=active]:shadow-sm relative">
                      <tab.icon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{tab.label}</span>
                      {tab.value === "chat" && unreadCount > 0 && currentTab !== "chat" && (
                        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value="overview" className="mt-4">
                  <DepartmentOverview kpis={kpis} services={quickActions} trafficData={trafficData} trafficLabel="Weekly Click Trend" team={team} department="google_ads" accentColor="hsl(var(--dept-ads))" extraSection={campaignsCard} clinicId={selectedClinicId} />
                </TabsContent>
                <TabsContent value="tickets" className="mt-4"><TicketsTab department="google_ads" services={services} clinicId={selectedClinicId} /></TabsContent>
                <TabsContent value="analytics" className="mt-4"><GoogleAdsAnalyticsTab clinicId={selectedClinicId} /></TabsContent>
                <TabsContent value="reports" className="mt-4"><GoogleAdsReportsTab clinicId={selectedClinicId} /></TabsContent>
                <TabsContent value="uploads" className="mt-4"><UploadsTab department="google_ads" clinicId={selectedClinicId} /></TabsContent>
                {isStaff && <TabsContent value="chat" className="mt-4"><DepartmentChat department="google_ads" clinicId={selectedClinicId} onVisible={markAsRead} /></TabsContent>}
              </Tabs>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
