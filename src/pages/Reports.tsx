import { useClinicSelector } from "@/hooks/useClinicSelector";
import { UnifiedReportTab } from "@/components/department/UnifiedReportTab";
import { FileText } from "lucide-react";

export default function Reports() {
  const { selectedClinicId, setSelectedClinicId, clinics, loading: clinicsLoading } = useClinicSelector();

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        {/* Hero Header */}
        <div className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-[hsl(280,65%,55%)] p-5 sm:p-8 text-primary-foreground shadow-lg">
          <div className="absolute inset-0 dot-grid opacity-10" />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-primary-foreground/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold">Unified Reports</h1>
                <p className="text-primary-foreground/70 text-xs sm:text-sm font-medium -mt-0.5">
                  Combined performance reports across all departments
                </p>
              </div>
            </div>
          </div>
        </div>

        {selectedClinicId ? (
          <UnifiedReportTab clinicId={selectedClinicId} />
        ) : (
          <p className="text-muted-foreground text-sm text-center py-12">Select a clinic to generate a unified report.</p>
        )}
      </div>
    </DashboardLayout>
  );
}
