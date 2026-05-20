import { useClinicSelector } from "@/hooks/useClinicSelector";
import { UnifiedReportTab } from "@/components/department/UnifiedReportTab";

export default function Reports() {
  const { selectedClinicId } = useClinicSelector();

  return (
    <div className="px-4 sm:px-6 py-6 space-y-6">
      <header className="px-1">
        <h1 className="text-[28px] font-bold tracking-tight">Reports</h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          Combined performance reports across all departments.
        </p>
      </header>

      {selectedClinicId ? (
        <UnifiedReportTab clinicId={selectedClinicId} />
      ) : (
        <div className="rounded-2xl bg-card border border-border/40 shadow-sm p-8 text-center text-[13px] text-muted-foreground">
          Select a clinic to generate a unified report.
        </div>
      )}
    </div>
  );
}

