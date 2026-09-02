import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { CalendarDays, ArrowRight, AlertTriangle, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSM2Generation } from "@/hooks/useSM2Generation";
import SM2CalendarView from "@/components/social/SM2CalendarView";

const ACTIVE_GEN_STATUSES = ["queued", "running", "retrying"];

interface Props {
  clinicId?: string;
  isClient?: boolean;
  /** Tab to open when clicking the header button */
  targetTab?: string;
}

/**
 * Shows the current month's content calendar for a clinic, using the same
 * calendar UI as the Content tab (read-only, no send/approve actions).
 */
export function OverviewMonthCalendar({ clinicId, isClient = false, targetTab }: Props) {
  const [, setSearchParams] = useSearchParams();
  const { generations, isLoading } = useSM2Generation(clinicId);

  const monthKey = format(new Date(), "yyyy-MM");
  const gen = useMemo(
    () => (generations || []).find((g) => g.month_year === monthKey),
    [generations, monthKey]
  );

  const goTab = (tab: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      return next;
    });
  };

  const tab = targetTab || (isClient ? "content-review" : "generation");

  return (
    <Card className="overflow-hidden border-border/50 animate-fade-in">
      <CardHeader className="border-b border-border/40 bg-muted/20 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <CardTitle className="text-sm sm:text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary shrink-0" />
            <span className="truncate">{format(new Date(), "MMMM yyyy")} Content Calendar</span>
          </CardTitle>
          <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">
            This month&apos;s posts for this clinic.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => goTab(tab)} className="shrink-0 w-full sm:w-auto h-8 text-xs">
          Open content <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
        </Button>
      </CardHeader>
      <CardContent className="p-3 sm:p-4">
        {isLoading ? (
          <div className="h-64 bg-muted/40 rounded-xl animate-pulse" />
        ) : !gen ? (
          <div className="py-12 text-center">
            <CalendarDays className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              No content calendar for {format(new Date(), "MMMM yyyy")} yet.
            </p>
          </div>
        ) : ACTIVE_GEN_STATUSES.includes(gen.approval_status) ? (
          <div className="py-10 text-center space-y-2">
            <RefreshCw className="h-6 w-6 mx-auto text-primary animate-spin" />
            <p className="text-sm font-medium">Pipeline running for {format(new Date(), "MMMM yyyy")}</p>
            <p className="text-xs text-muted-foreground">The calendar appears once generation completes.</p>
          </div>
        ) : gen.approval_status === "generation_failed" ? (
          <div className="py-8 text-center space-y-2">
            <AlertTriangle className="h-6 w-6 mx-auto text-destructive" />
            <p className="text-sm font-medium">Generation failed</p>
            {gen.failure_reason && (
              <p className="text-xs text-muted-foreground max-w-md mx-auto">{gen.failure_reason}</p>
            )}
          </div>
        ) : (
          <SM2CalendarView
            generationId={gen.id}
            monthYear={gen.month_year}
            approvalStatus={gen.approval_status}
            isClient={isClient}
            sentToClientAt={gen.sent_to_client_at}
            readOnly
          />
        )}
      </CardContent>
    </Card>
  );
}
