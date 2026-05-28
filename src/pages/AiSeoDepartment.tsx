import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, LayoutGrid, Users } from "lucide-react";
import { useAiSeoAccess } from "@/hooks/useAiSeoAccess";
import { Skeleton } from "@/components/ui/skeleton";
import { useClinicSelector } from "@/hooks/useClinicSelector";
import { DepartmentAccessLocked } from "@/components/department/DepartmentAccessLocked";
import { AdminServiceLockNotice } from "@/components/department/AdminServiceLockNotice";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DepartmentChat } from "@/components/department/DepartmentChat";
import { useDepartmentChatUnread } from "@/hooks/useDepartmentChatUnread";

const baseTabs = [
  { value: "overview", label: "Overview", icon: LayoutGrid },
];
const clientChatTab = { value: "client-chat", label: "Client Chat", icon: Users };

export default function AiSeoDepartment() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get("tab") || "overview";
  const { clinics, selectedClinicId, selectedClinic, setSelectedClinicId, loading: clinicsLoading } = useClinicSelector();
  const { hasAccess, isLoading } = useAiSeoAccess(selectedClinicId || undefined);
  const clinicAiSeoEnabled = selectedClinic?.ai_seo_enabled ?? false;
  const isAdminBypass = hasAccess && !!selectedClinic && !clinicAiSeoEnabled;
  const { unreadCount: clientUnreadCount, markAsRead: markClientAsRead } = useDepartmentChatUnread("ai_seo", selectedClinicId, "client");

  const tabs = [...baseTabs, clientChatTab];

  const handleTabChange = (value: string) => {
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set("tab", value); return next; }, { replace: true });
  };

  return (
    <>
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
          <div className="space-y-4">
            <Skeleton className="h-40 w-full" />
          </div>
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

              <TabsContent value="overview" className="mt-4">
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                      <Sparkles className="h-7 w-7 text-primary" />
                    </div>
                    <h3 className="text-xl font-bold text-foreground mb-2">AI SEO</h3>
                    <p className="text-sm text-muted-foreground max-w-md">
                      Our AI-powered SEO tools are coming soon. Stay tuned for intelligent keyword research, automated content optimization, and smart ranking insights.
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                      <Sparkles className="h-3 w-3" /> Coming Soon
                    </span>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="client-chat" className="mt-4">
                <DepartmentChat variant="client" department="ai_seo" clinicId={selectedClinicId} onVisible={markClientAsRead} />
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <DepartmentAccessLocked clinicName={selectedClinic?.clinic_name} departmentName="AI SEO" />
        )}
      </div>
    </>
  );
}
