import { Card, CardContent } from "@/components/ui/card";
import { Lock, ShieldAlert } from "lucide-react";

interface DepartmentAccessLockedProps {
  clinicName?: string;
  departmentName: string;
}

export function DepartmentAccessLocked({ clinicName, departmentName }: DepartmentAccessLockedProps) {
  return (
    <Card className="border-border/60 bg-muted/30">
      <CardContent className="flex flex-col items-center justify-center py-20 text-center sm:py-24">
        <div className="relative mb-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-muted sm:h-20 sm:w-20">
            <ShieldAlert className="h-8 w-8 text-muted-foreground sm:h-10 sm:w-10" />
          </div>
          <div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full border-4 border-background bg-destructive/10 sm:h-9 sm:w-9">
            <Lock className="h-4 w-4 text-destructive" />
          </div>
        </div>

        <h2 className="text-xl font-bold text-foreground">{departmentName} is locked</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          {clinicName ? `${clinicName} does not have access to this service. ` : "You do not have access to this service. "}
          Contact your admin to enable access.
        </p>
      </CardContent>
    </Card>
  );
}