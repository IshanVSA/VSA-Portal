import { Lock } from "lucide-react";

interface AdminServiceLockNoticeProps {
  clinicName?: string;
  departmentName: string;
}

/**
 * Shown to admins when the currently selected clinic has this department/service
 * disabled. Admins still have full access — this is purely informational so they
 * can see the lock status from the department view itself, without opening the
 * Clinics tab.
 */
export function AdminServiceLockNotice({ clinicName, departmentName }: AdminServiceLockNoticeProps) {
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border border-amber-500/25 bg-amber-500/5">
      <div className="h-7 w-7 rounded-md bg-amber-500/10 flex items-center justify-center shrink-0">
        <Lock className="h-3.5 w-3.5 text-amber-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground">
          {departmentName} is locked for {clinicName || "this clinic"}
        </p>
        <p className="text-[11px] text-muted-foreground leading-snug">
          The client cannot see this department. You have admin access — enable it from the Clinics tab to unlock it for them.
        </p>
      </div>
    </div>
  );
}
