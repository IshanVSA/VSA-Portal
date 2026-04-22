import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye, CalendarDays, Sparkles } from "lucide-react";
import { lazy, Suspense } from "react";
import { useSM2Generation } from "@/hooks/useSM2Generation";

const ClientContentReview = lazy(() => import("./ClientContentReview"));
const ClientContentCalendar = lazy(() => import("./ClientContentCalendar"));

interface Props {
  clinicId: string | undefined;
}

const Fallback = () => (
  <div className="py-12 flex items-center justify-center">
    <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

export default function ClientPostsTab({ clinicId }: Props) {
  const [tab, setTab] = useState("review");
  const { generations } = useSM2Generation(clinicId);

  // Count generations awaiting client action
  const pendingCount = (generations || []).filter(
    (g) => g.sent_to_client_at && g.approval_status === "sent_to_client"
  ).length;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <Card className="bg-gradient-to-br from-[hsl(var(--dept-social))]/10 via-card to-card border-[hsl(var(--dept-social))]/20">
        <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[hsl(var(--dept-social))]/15 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-[hsl(var(--dept-social))]" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight">My Social Media Posts</h2>
              <p className="text-xs text-muted-foreground">
                Review pending posts and view your full content calendar
              </p>
            </div>
          </div>
          {pendingCount > 0 && (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 gap-1.5">
              <Eye className="h-3 w-3" />
              {pendingCount} {pendingCount === 1 ? "batch" : "batches"} need your review
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Sub-tabs */}
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="bg-muted/50 h-10 p-1">
          <TabsTrigger value="review" className="gap-1.5 text-xs data-[state=active]:shadow-sm relative">
            <Eye className="h-3.5 w-3.5" />
            Pending Review
            {pendingCount > 0 && (
              <span className="ml-1 min-w-[16px] h-4 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5 text-xs data-[state=active]:shadow-sm">
            <CalendarDays className="h-3.5 w-3.5" />
            Content Calendar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="review" className="mt-4">
          <Suspense fallback={<Fallback />}>
            <ClientContentReview clinicId={clinicId} />
          </Suspense>
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <Suspense fallback={<Fallback />}>
            <ClientContentCalendar clinicId={clinicId} />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
