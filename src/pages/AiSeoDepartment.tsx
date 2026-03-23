import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { useAiSeoAccess } from "@/hooks/useAiSeoAccess";
import { Skeleton } from "@/components/ui/skeleton";
import { useClinicSelector } from "@/hooks/useClinicSelector";
import { useClinicSelector } from "@/hooks/useClinicSelector";
import { DepartmentAccessLocked } from "@/components/department/DepartmentAccessLocked";

export default function AiSeoDepartment() {
  const { clinics, selectedClinicId, selectedClinic, setSelectedClinicId, loading: clinicsLoading } = useClinicSelector();
  const { hasAccess, isLoading } = useAiSeoAccess(selectedClinicId || undefined);

  return (
    <DashboardLayout>
      <div className="space-y-4 dept-tint-ai-seo min-h-full -m-6 p-6" data-dept="AI SEO">
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
        ) : (
          <DepartmentAccessLocked clinicName={selectedClinic?.clinic_name} departmentName="AI SEO" />
        )}
      </div>
    </DashboardLayout>
  );
}
