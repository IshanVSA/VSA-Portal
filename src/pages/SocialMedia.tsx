import { useSearchParams } from "react-router-dom";

import { useUserRole } from "@/hooks/useUserRole";
import { useClinicSelector } from "@/hooks/useClinicSelector";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Share2, LayoutDashboard, BarChart3, Ticket, Upload, MessageSquare, Dna, Sparkles, Eye, SlidersHorizontal, MapPin, Tag, Megaphone } from "lucide-react";
import { ComingSoonTab } from "@/components/department/ComingSoonTab";
import { GBPPostsTab } from "@/components/seo/gbp/GBPPostsTab";
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
import { usePendingCounts } from "@/hooks/usePendingCounts";
import { useBrandDNA } from "@/hooks/useBrandDNA";
import { BrandDNAForm } from "@/components/social/BrandDNAForm";


const PromotionModule = lazy(() => import("@/components/social/PromotionModule"));

const AnalyticsContent = lazy(() => import("@/components/social/SocialAnalyticsTab"));
const BrandDNATab = lazy(() => import("@/components/social/BrandDNATab"));
const ContentGenerationTab = lazy(() => import("@/components/social/ContentGenerationTab"));
const ClientContentReview = lazy(() => import("@/components/social/ClientContentReview"));
const ClientPostsTab = lazy(() => import("@/components/social/ClientPostsTab"));
const ContentThemeSliders = lazy(() => import("@/components/social/ContentThemeSliders"));
const MetaAdsTab = lazy(() => import("@/components/social/MetaAdsTab"));

const TabFallback = () => (
  <div className="py-12 flex items-center justify-center">
    <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const socialServices = ["Content Creation", "Post Scheduling", "Engagement Management", "Analytics Review", "Campaign Strategy", "Others"];

const baseTabs = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  
  { value: "tickets", label: "Tickets", icon: Ticket },
  { value: "promotions", label: "Active Promotions", icon: Tag },
  
  { value: "analytics", label: "Analytics", icon: BarChart3 },
  { value: "uploads", label: "Files", icon: Upload },
];
const chatTab = { value: "chat", label: "Team Chat", icon: MessageSquare };
const dnaTab = { value: "brand-dna", label: "Brand DNA", icon: Dna };
const generationTab = { value: "generation", label: "Generate", icon: Sparkles };
const gbpPostsTab = { value: "gbp-posts", label: "GBP Posts", icon: MapPin };
const contentReviewTab = { value: "my-posts", label: "My Posts", icon: Eye };
const themeSlidersTab = { value: "preferences", label: "Preferences", icon: SlidersHorizontal };
const metaAdsTab = { value: "meta-ads", label: "Meta Ads", icon: Megaphone };

export default function SocialMedia() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { role } = useUserRole();
  const { clinics, selectedClinic, selectedClinicId, setSelectedClinicId, loading: clinicsLoading } = useClinicSelector();
  const currentTab = searchParams.get("tab") || "overview";
  const { isLocked, loading: accessLoading } = useClinicServiceAccess(selectedClinic, "social_media", clinicsLoading);
  const { dna, isLoading: dnaLoading, isCompleted: dnaCompleted } = useBrandDNA(selectedClinicId);

  const isStaff = role === "admin" || role === "concierge";
  const isClient = role === "client";
  const { unreadCount, markAsRead } = useDepartmentChatUnread("social_media", selectedClinicId);
  const { socialPending } = usePendingCounts(selectedClinicId);

  // Client gate: if DNA not completed, show the form instead
  const showDNAGate = isClient && !dnaLoading && !dnaCompleted && !isLocked;

  const visibleTabs = isClient
    ? [
        baseTabs.find(t => t.value === "overview")!,
        contentReviewTab,
        baseTabs.find(t => t.value === "tickets")!,
        baseTabs.find(t => t.value === "promotions")!,
        baseTabs.find(t => t.value === "analytics")!,
        baseTabs.find(t => t.value === "uploads")!,
        gbpPostsTab,
        dnaTab,
        themeSlidersTab,
        metaAdsTab,
      ]
    : [...baseTabs, generationTab, gbpPostsTab, dnaTab, themeSlidersTab, metaAdsTab, ...(isStaff ? [chatTab] : [])];

  const handleTabChange = (value: string) => {
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set("tab", value); return next; }, { replace: true });
  };

  const selectedClinicName = selectedClinic?.clinic_name;

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
              <BrandDNAForm
                clinicId={selectedClinicId!}
                onComplete={() => {
                  // DNA submitted, the query will refetch and gate will disappear
                }}
              />
            </motion.div>
          ) : (
            <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
                <div className="sticky top-14 z-20 -mx-3 sm:-mx-4 lg:-mx-8 px-3 sm:px-4 lg:px-8 py-2 bg-background/85 backdrop-blur-md border-b border-border/40">
                <TabsList className="w-full justify-start bg-muted/50 h-10 p-1 overflow-x-auto flex-nowrap tabs-scroll">
                  {visibleTabs.map(tab => {
                    // Show actionable count on the tab the user owns:
                    //  • client → "My Posts"
                    //  • staff  → "Generate"
                    const showSocialBadge =
                      socialPending > 0 &&
                      ((isClient && tab.value === "my-posts") ||
                        (isStaff && tab.value === "generation")) &&
                      currentTab !== tab.value;
                    const showChatBadge = tab.value === "chat" && unreadCount > 0 && currentTab !== "chat";
                    return (
                      <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 text-xs data-[state=active]:shadow-sm relative">
                        <tab.icon className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{tab.label}</span>
                        <span className="sm:hidden">{tab.label.split(" ").pop()}</span>
                        {showChatBadge && (
                          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </span>
                        )}
                        {showSocialBadge && (
                          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                            {socialPending > 99 ? "99+" : socialPending}
                          </span>
                        )}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
                </div>


                <TabsContent value="overview" className="mt-4"><SocialOverview clinicId={selectedClinicId} /></TabsContent>
                
                <TabsContent value="tickets" className="mt-4"><TicketsTab department="social_media" services={socialServices} clinicId={selectedClinicId} /></TabsContent>
                <TabsContent value="my-posts" className="mt-4"><Suspense fallback={<TabFallback />}><ClientPostsTab clinicId={selectedClinicId} /></Suspense></TabsContent>
                <TabsContent value="preferences" className="mt-4"><Suspense fallback={<TabFallback />}><ContentThemeSliders clinicId={selectedClinicId} /></Suspense></TabsContent>
                <TabsContent value="promotions" className="mt-4"><Suspense fallback={<TabFallback />}><PromotionModule clinicId={selectedClinicId} /></Suspense></TabsContent>
                
                <TabsContent value="analytics" className="mt-4"><Suspense fallback={<TabFallback />}><AnalyticsContent clinicId={selectedClinicId} /></Suspense></TabsContent>
                <TabsContent value="uploads" className="mt-4"><UploadsTab department="social_media" clinicId={selectedClinicId} /></TabsContent>
                <TabsContent value="gbp-posts" className="mt-4"><GBPPostsTab clinicId={selectedClinicId} /></TabsContent>
                <TabsContent value="brand-dna" className="mt-4"><Suspense fallback={<TabFallback />}><BrandDNATab clinicId={selectedClinicId} /></Suspense></TabsContent>
                <TabsContent value="meta-ads" className="mt-4"><Suspense fallback={<TabFallback />}><MetaAdsTab clinicId={selectedClinicId} /></Suspense></TabsContent>
                {isStaff && (
                  <>
                    <TabsContent value="generation" className="mt-4"><Suspense fallback={<TabFallback />}><ContentGenerationTab clinicId={selectedClinicId} /></Suspense></TabsContent>
                    <TabsContent value="chat" className="mt-4"><DepartmentChat department="social_media" clinicId={selectedClinicId} onVisible={markAsRead} /></TabsContent>
                  </>
                )}
              </Tabs>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
