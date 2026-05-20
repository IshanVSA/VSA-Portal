import { Eye } from "lucide-react";

export function ClientReadOnlyBanner() {
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border border-blue-500/20 bg-blue-500/5">
      <div className="h-7 w-7 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
        <Eye className="h-3.5 w-3.5 text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground">Read-only view</p>
        <p className="text-[11px] text-muted-foreground leading-snug">
          You can submit new tickets and review activity, but ticket status, assignee, and department are managed by your VSA Vet Media team.
        </p>
      </div>
    </div>
  );
}
