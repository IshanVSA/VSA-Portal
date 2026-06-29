import { useSearchParams } from "react-router-dom";
import { useState, useMemo } from "react";

import { useUserRole } from "@/hooks/useUserRole";
import { useClinicSelector } from "@/hooks/useClinicSelector";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Share2, LayoutGrid, ChartColumn, Ticket, Upload, MessageCircle, Dna, Sparkles, Eye, SlidersHorizontal, MapPin, Tag, Megaphone, FileText, ListChecks, Users, Briefcase } from "lucide-react";
import { NewTicketDialog } from "@/components/department/NewTicketDialog";
import { GBPPostsTab } from "@/components/seo/gbp/GBPPostsTab";
import { SocialOverview } from "@/components/social/SocialOverview";
import { lazy, Suspense } from "react";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { AnimatePresence, motion } from "framer-motion";

import { TicketsTab } from "@/components/department/TicketsTab";
import { UploadsTab } from "@/components/department/UploadsTab";
import { useClinicServiceAccess } from "@/hooks/useClinicServiceAccess";
import { DepartmentAccessLocked } from "@/components/department/DepartmentAccessLocked";
import { AdminServiceLockNotice } from "@/components/department/AdminServiceLockNotice";
import { DepartmentChat } from "@/components/department/DepartmentChat";
import { useDepartmentChatUnread } from "@/hooks/useDepartmentChatUnread";
import { TasksTab } from "@/components/department/tasks/TasksTab";
import { useMyOpenTaskCount } from "@/hooks/useDepartmentTasks";
import { usePendingCounts } from "@/hooks/usePendingCounts";
import { useBrandDNA } from "@/hooks/useBrandDNA";
import { BrandDNAForm } from "@/components/social/BrandDNAForm";

const PromotionModule = lazy(() => import("@/components/social/PromotionModule"));
const AnalyticsContent = lazy(() => import("@/components/social/SocialAnalyticsTab"));
const BrandDNATab = lazy(() => import("@/components/social/BrandDNATab"));
const ContentGenerationTab = lazy(() => import("@/components/social/ContentGenerationTab"));
const ClientPostsTab = lazy(() => import("@/components/social/ClientPostsTab"));
const ContentThemeSliders = lazy(() => import("@/components/social/ContentThemeSliders"));
const MetaAdsTab = lazy(() => import("@/components/social/MetaAdsTab"));

const TabFallback = () => (
  <div className="py-12 flex items-center justify-center">
    <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const socialServices = ["Content Creation", "Post Scheduling", "Engagement Management", "Analytics Review", "Campaign Strategy", "Others"];

type SubTabDef = { value: string; label: string; icon: React.ElementType };
type GroupDef = { value: string; label: string; icon: React.ElementType; subs: SubTabDef[] };

// Legacy ?tab= values → {group, sub}
const LEGACY_MAP: Record<string, { group: string; sub?: string }> = {
  overview: { group: "overview" },
  tickets: { group: "work", sub: "tickets" },
  tasks: { group: "work", sub: "tasks" },
  promotions: { group: "content", sub: "promotions" },
  generation: { group: "content", sub: "generation" },
  "gbp-posts": { group: "content", sub: "gbp-posts" },
  "brand-dna": { group: "content", sub: "brand-dna" },
  preferences: { group: "content", sub: "preferences" },
  "my-posts": { group: "content", sub: "my-posts" },
  analytics: { group: "performance", sub: "analytics" },
  "meta-ads": { group: "performance", sub: "meta-ads" },
  uploads: { group: "performance", sub: "uploads" },
  chat: { group: "messages", sub: "chat" },
  "client-chat": { group: "messages", sub: "client-chat" },
};

export default function SocialMedia() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { role } = useUserRole();
  const { selectedClinic, selectedClinicId, loading: clinicsLoading } = useClinicSelector();
  const { isLocked, isAdminBypass, loading: accessLoading } = useClinicServiceAccess(selectedClinic, "social_media", clinicsLoading);
  const { isLoading: dnaLoading, isCompleted: dnaCompleted } = useBrandDNA(selectedClinicId);
  const [contentRequestOpen, setContentRequestOpen] = useState(false);

  const isStaff = role === "admin" || role === "concierge";
  const isClient = role === "client";
  const { unreadCount, markAsRead } = useDepartmentChatUnread("social_media", selectedClinicId);
  const { unreadCount: clientUnreadCount, markAsRead: markClientAsRead } = useDepartmentChatUnread("social_media", selectedClinicId, "client");
  const myOpenTasks = useMyOpenTaskCount("social_media", selectedClinicId);
  const { socialPending } = usePendingCounts(selectedClinicId);

  const showDNAGate = isClient && !dnaLoading && !dnaCompleted && !isLocked;

  // Build grouped tab config per role
  const groups: GroupDef[] = useMemo(() => {
    const contentSubs: SubTabDef[] = isClient
      ? [
          { value: "my-posts", label: "My Posts", icon: Eye },
          { value: "gbp-posts", label: "GBP Posts", icon: MapPin },
          { value: "promotions", label: "Promotions", icon: Tag },
          { value: "brand-dna", label: "Brand DNA", icon: Dna },
          { value: "preferences", label: "Preferences", icon: SlidersHorizontal },
        ]
      : [
          { value: "generation", label: "Generate", icon: Sparkles },
          { value: "gbp-posts", label: "GBP Posts", icon: MapPin },
          { value: "promotions", label: "Promotions", icon: Tag },
          { value: "brand-dna", label: "Brand DNA", icon: Dna },
          { value: "preferences", label: "Preferences", icon: SlidersHorizontal },
        ];

    const performanceSubs: SubTabDef[] = [
      { value: "analytics", label: "Analytics", icon: ChartColumn },
      { value: "meta-ads", label: "Meta Ads", icon: Megaphone },
      { value: "uploads", label: "Files", icon: Upload },
    ];

    const workSubs: SubTabDef[] = isStaff
      ? [
          { value: "tickets", label: "Tickets", icon: Ticket },
          { value: "tasks", label: "Tasks", icon: ListChecks },
        ]
      : [{ value: "tickets", label: "Tickets", icon: Ticket }];

    const messagesSubs: SubTabDef[] = isStaff
      ? [
          { value: "client-chat", label: "Client Chat", icon: Users },
          { value: "chat", label: "Team Chat", icon: MessageCircle },
        ]
      : [{ value: "client-chat", label: "Concierge Chat", icon: Users }];

    return [
      { value: "overview", label: "Overview", icon: LayoutGrid, subs: [] },
      { value: "content", label: "Content", icon: Sparkles, subs: contentSubs },
      { value: "performance", label: "Performance", icon: ChartColumn, subs: performanceSubs },
      { value: "work", label: "Work", icon: Briefcase, subs: workSubs },
      { value: "messages", label: "Messages", icon: MessageCircle, subs: messagesSubs },
    ];
  }, [isClient, isStaff]);

  // Resolve current group + sub from URL (with legacy mapping)
  const rawTab = searchParams.get("tab") || "overview";
  const rawSub = searchParams.get("sub");
  const { currentGroup, currentSub } = useMemo(() => {
    // If rawTab matches a group, use it
    const groupMatch = groups.find((g) => g.value === rawTab);
    if (groupMatch) {
      const sub = rawSub && groupMatch.subs.some((s) => s.value === rawSub)
        ? rawSub
        : groupMatch.subs[0]?.value;
      return { currentGroup: groupMatch.value, currentSub: sub };
    }
    // Legacy mapping
    const legacy = LEGACY_MAP[rawTab];
    if (legacy) {
      const g = groups.find((gr) => gr.value === legacy.group);
      const sub = legacy.sub && g?.subs.some((s) => s.value === legacy.sub)
        ? legacy.sub
        : g?.subs[0]?.value;
      return { currentGroup: legacy.group, currentSub: sub };
    }
    return { currentGroup: "overview", currentSub: undefined as string | undefined };
  }, [rawTab, rawSub, groups]);

  const handleGroupChange = (value: string) => {
    const g = groups.find((gr) => gr.value === value);
    const firstSub = g?.subs[0]?.value;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", value);
      if (firstSub) next.set("sub", firstSub); else next.delete("sub");
      return next;
    }, { replace: true });
  };

  const handleSubChange = (value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", currentGroup);
      next.set("sub", value);
      return next;
    }, { replace: true });
  };

  const selectedClinicName = selectedClinic?.clinic_name;

  // Group-level badge counts
  const groupBadges: Record<string, { count: number; tone: "amber" | "primary" | "destructive" }> = {
    content: { count: socialPending, tone: "amber" },
    work: { count: myOpenTasks, tone: "primary" },
    messages: { count: unreadCount + clientUnreadCount, tone: "destructive" },
  };

  const toneClass = (tone: "amber" | "primary" | "destructive") =>
    tone === "amber"
      ? "bg-amber-500 text-white"
      : tone === "primary"
      ? "bg-primary text-primary-foreground"
      : "bg-destructive text-destructive-foreground";

  // Sub-tab badge counts
  const subBadgeFor = (sub: string): { count: number; tone: "amber" | "primary" | "destructive" } | null => {
    if (sub === "my-posts" && isClient && socialPending > 0) return { count: socialPending, tone: "amber" };
    if (sub === "generation" && isStaff && socialPending > 0) return { count: socialPending, tone: "amber" };
    if (sub === "tasks" && myOpenTasks > 0) return { count: myOpenTasks, tone: "primary" };
    if (sub === "chat" && unreadCount > 0) return { count: unreadCount, tone: "destructive" };
    if (sub === "client-chat" && clientUnreadCount > 0) return { count: clientUnreadCount, tone: "destructive" };
    return null;
  };

  const activeGroup = groups.find((g) => g.value === currentGroup);

  return (
    <>
      <div className="space-y-4 dept-tint-social min-h-full -m-3 p-3 sm:-m-4 sm:p-4 lg:-m-8 lg:p-8" data-dept="Social Media">
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
          {selectedClinicId && !isLocked && (
            <Button
              size="sm"
              onClick={() => setContentRequestOpen(true)}
              className="gap-1.5"
            >
              <FileText className="h-3.5 w-3.5" />
              Content Request
            </Button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {accessLoading || dnaLoading ? (
            <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <DashboardSkeleton />
            </motion.div>
          ) : isLocked ? (
            <motion.div key="locked" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <DepartmentAccessLocked clinicName={selectedClinicName} departmentName="Social Media" />
            </motion.div>
          ) : showDNAGate ? (
            <motion.div key="dna-gate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <BrandDNAForm clinicId={selectedClinicId!} onComplete={() => {}} />
            </motion.div>
          ) : (
            <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="space-y-3">
              {isAdminBypass && <AdminServiceLockNotice clinicName={selectedClinicName} departmentName="Social Media" />}

              {/* Parent tabs */}
              <Tabs value={currentGroup} onValueChange={handleGroupChange} className="w-full">
                <div className="sticky top-14 z-20 -mx-3 sm:-mx-4 lg:-mx-8 px-3 sm:px-4 lg:px-8 py-2 bg-background/85 backdrop-blur-md border-b border-border/40 space-y-2">
                  <TabsList className="w-full justify-start bg-muted/50 h-10 p-1 overflow-x-auto flex-nowrap tabs-scroll">
                    {groups.map((g) => {
                      const badge = groupBadges[g.value];
                      const showBadge = badge && badge.count > 0 && currentGroup !== g.value;
                      return (
                        <TabsTrigger key={g.value} value={g.value} className="gap-1.5 text-xs data-[state=active]:shadow-sm relative flex-1 min-w-[88px]">
                          <g.icon className="h-3.5 w-3.5 shrink-0" />
                          <span className="whitespace-nowrap">{g.label}</span>
                          {showBadge && (
                            <span className={`absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full text-[10px] font-bold flex items-center justify-center px-1 ${toneClass(badge.tone)}`}>
                              {badge.count > 99 ? "99+" : badge.count}
                            </span>
                          )}
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>

                  {/* Sub tabs (only if the active group has any) */}
                  {activeGroup && activeGroup.subs.length > 0 && (
                    <Tabs value={currentSub} onValueChange={handleSubChange} className="w-full">
                      <TabsList className="w-full justify-start bg-muted/30 h-9 p-0.5 overflow-x-auto flex-nowrap tabs-scroll border border-border/40">
                        {activeGroup.subs.map((s) => {
                          const sb = subBadgeFor(s.value);
                          const showSb = sb && currentSub !== s.value;
                          return (
                            <TabsTrigger key={s.value} value={s.value} className="gap-1.5 text-xs data-[state=active]:shadow-sm relative">
                              <s.icon className="h-3.5 w-3.5 shrink-0" />
                              <span className="whitespace-nowrap">{s.label}</span>
                              {showSb && (
                                <span className={`absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full text-[10px] font-bold flex items-center justify-center px-1 ${toneClass(sb!.tone)}`}>
                                  {sb!.count > 99 ? "99+" : sb!.count}
                                </span>
                              )}
                            </TabsTrigger>
                          );
                        })}
                      </TabsList>
                    </Tabs>
                  )}
                </div>

                {/* Group panels */}
                <TabsContent value="overview" className="mt-4">
                  <SocialOverview clinicId={selectedClinicId} />
                </TabsContent>

                <TabsContent value="content" className="mt-4">
                  {currentSub === "my-posts" && (
                    <Suspense fallback={<TabFallback />}><ClientPostsTab clinicId={selectedClinicId} /></Suspense>
                  )}
                  {currentSub === "generation" && (
                    <Suspense fallback={<TabFallback />}><ContentGenerationTab clinicId={selectedClinicId} /></Suspense>
                  )}
                  {currentSub === "gbp-posts" && <GBPPostsTab clinicId={selectedClinicId} />}
                  {currentSub === "promotions" && (
                    <Suspense fallback={<TabFallback />}><PromotionModule clinicId={selectedClinicId} /></Suspense>
                  )}
                  {currentSub === "brand-dna" && (
                    <Suspense fallback={<TabFallback />}><BrandDNATab clinicId={selectedClinicId} /></Suspense>
                  )}
                  {currentSub === "preferences" && (
                    <Suspense fallback={<TabFallback />}><ContentThemeSliders clinicId={selectedClinicId} /></Suspense>
                  )}
                </TabsContent>

                <TabsContent value="performance" className="mt-4">
                  {currentSub === "analytics" && (
                    <Suspense fallback={<TabFallback />}><AnalyticsContent clinicId={selectedClinicId} /></Suspense>
                  )}
                  {currentSub === "meta-ads" && (
                    <Suspense fallback={<TabFallback />}><MetaAdsTab clinicId={selectedClinicId} /></Suspense>
                  )}
                  {currentSub === "uploads" && (
                    <UploadsTab department="social_media" clinicId={selectedClinicId} />
                  )}
                </TabsContent>

                <TabsContent value="work" className="mt-4">
                  {currentSub === "tickets" && (
                    <TicketsTab department="social_media" services={socialServices} clinicId={selectedClinicId} />
                  )}
                  {currentSub === "tasks" && isStaff && (
                    <TasksTab department="social_media" clinicId={selectedClinicId} />
                  )}
                </TabsContent>

                <TabsContent value="messages" className="mt-4">
                  {currentSub === "client-chat" && (
                    <DepartmentChat variant="client" department="social_media" clinicId={selectedClinicId} onVisible={markClientAsRead} />
                  )}
                  {currentSub === "chat" && isStaff && (
                    <DepartmentChat department="social_media" clinicId={selectedClinicId} onVisible={markAsRead} />
                  )}
                </TabsContent>
              </Tabs>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <NewTicketDialog
        open={contentRequestOpen}
        onOpenChange={setContentRequestOpen}
        department="social_media"
        services={socialServices}
        clinicId={selectedClinicId || undefined}
        defaultType="Content Request"
        onCreated={() => setContentRequestOpen(false)}
      />
    </>
  );
}
