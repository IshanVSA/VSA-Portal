import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, LayoutGrid, Users, ShieldCheck, Hash, Link2, Map, Bot } from "lucide-react";
import { useAiSeoAccess } from "@/hooks/useAiSeoAccess";
import { Skeleton } from "@/components/ui/skeleton";
import { useClinicSelector } from "@/hooks/useClinicSelector";
import { DepartmentAccessLocked } from "@/components/department/DepartmentAccessLocked";
import { AdminServiceLockNotice } from "@/components/department/AdminServiceLockNotice";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DepartmentChat } from "@/components/department/DepartmentChat";
import { useDepartmentChatUnread } from "@/hooks/useDepartmentChatUnread";
import { useSearchAtlasClinicConfig, isSearchAtlasConfigured } from "@/hooks/useSearchAtlas";
import { SearchAtlasEmptyState } from "@/components/ai-seo/SearchAtlasEmptyState";
import { SearchAtlasOverviewCard } from "@/components/ai-seo/SearchAtlasOverviewCard";
import { SearchAtlasSiteAuditTab } from "@/components/ai-seo/SearchAtlasSiteAuditTab";
import { SearchAtlasKeywordsTab } from "@/components/ai-seo/SearchAtlasKeywordsTab";
import { SearchAtlasBacklinksTab } from "@/components/ai-seo/SearchAtlasBacklinksTab";
import { SearchAtlasHeatmapTab } from "@/components/ai-seo/SearchAtlasHeatmapTab";
import { SearchAtlasLLMTab } from "@/components/ai-seo/SearchAtlasLLMTab";

const dataTabs = [
  { value: "backlinks", label: "Backlinks", icon: Link2 },
  { value: "llm", label: "LLM Visibility", icon: Bot },
  { value: "keywords", label: "Keyword Rankings", icon: Hash },
  { value: "heatmap", label: "Local SEO Heatmap", icon: Map },
];
const clientChatTab = { value: "client-chat", label: "Client Chat", icon: Users };

export default function AiSeoDepartment() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get("tab") || "backlinks";
  const { selectedClinicId, selectedClinic, loading: clinicsLoading } = useClinicSelector();
  const { hasAccess, isLoading } = useAiSeoAccess(selectedClinicId || undefined);
  const { data: saConfig, isLoading: saLoading } = useSearchAtlasClinicConfig(selectedClinicId);
  const clinicAiSeoEnabled = selectedClinic?.ai_seo_enabled ?? false;
  const isAdminBypass = hasAccess && !!selectedClinic && !clinicAiSeoEnabled;
  const { unreadCount: clientUnreadCount, markAsRead: markClientAsRead } = useDepartmentChatUnread("seo", selectedClinicId, "client");

  const tabs = [...dataTabs, clientChatTab];

  const handleTabChange = (value: string) => {
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set("tab", value); return next; }, { replace: true });
  };

  const configured = isSearchAtlasConfigured(saConfig);

  return (
    <div className="space-y-4 dept-tint-ai-seo min-h-full -m-3 p-3 sm:-m-4 sm:p-4 lg:-m-8 lg:p-8" data-dept="AI SEO">
      <div className="flex flex-col gap-2 pb-3 border-b border-border/60 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-[hsl(var(--dept-ai-seo))]/10 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-[hsl(var(--dept-ai-seo))]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground tracking-tight">AI SEO</h1>
            {selectedClinic?.clinic_name && <p className="text-xs text-muted-foreground -mt-0.5">{selectedClinic.clinic_name}</p>}
          </div>
        </div>
      </div>

      {isLoading || clinicsLoading ? (
        <div className="space-y-4"><Skeleton className="h-40 w-full" /></div>
      ) : hasAccess ? (
        <div className="space-y-3">
          {isAdminBypass && <AdminServiceLockNotice clinicName={selectedClinic?.clinic_name} departmentName="AI SEO" />}
          <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
            <div className="sticky top-14 z-20 -mx-3 sm:-mx-4 lg:-mx-8 px-3 sm:px-4 lg:px-8 py-2 bg-background/85 backdrop-blur-md border-b border-border/40">
              <TabsList className="w-full justify-start bg-muted/50 h-10 p-1 overflow-x-auto flex-nowrap tabs-scroll">
                {tabs.map(tab => (
                  <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 text-xs data-[state=active]:shadow-sm relative">
                    <tab.icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="whitespace-nowrap">{tab.label}</span>
                    {tab.value === "client-chat" && clientUnreadCount > 0 && currentTab !== "client-chat" && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                        {clientUnreadCount > 99 ? "99+" : clientUnreadCount}
                      </span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>


            <TabsContent value="keywords" className="mt-4">
              {saLoading ? <Skeleton className="h-64" /> : configured
                ? <SearchAtlasKeywordsTab config={saConfig!} clinicId={selectedClinicId} />
                : <SearchAtlasEmptyState clinicId={selectedClinicId} />}
            </TabsContent>

            <TabsContent value="backlinks" className="mt-4">
              {saLoading ? <Skeleton className="h-64" /> : configured
                ? <SearchAtlasBacklinksTab config={saConfig!} clinicId={selectedClinicId} />
                : <SearchAtlasEmptyState clinicId={selectedClinicId} />}
            </TabsContent>

            <TabsContent value="heatmap" className="mt-4">
              {saLoading ? <Skeleton className="h-96" /> : configured
                ? <SearchAtlasHeatmapTab config={saConfig!} clinicId={selectedClinicId} />
                : <SearchAtlasEmptyState clinicId={selectedClinicId} />}
            </TabsContent>

            <TabsContent value="llm" className="mt-4">
              {saLoading ? <Skeleton className="h-64" /> : configured
                ? <SearchAtlasLLMTab config={saConfig!} clinicId={selectedClinicId} />
                : <SearchAtlasEmptyState clinicId={selectedClinicId} />}
            </TabsContent>

            <TabsContent value="client-chat" className="mt-4">
              <DepartmentChat variant="client" department="seo" clinicId={selectedClinicId} onVisible={markClientAsRead} />
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <DepartmentAccessLocked clinicName={selectedClinic?.clinic_name} departmentName="AI SEO" />
      )}
    </div>
  );
}
