import { useNavigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserRole } from "@/hooks/useUserRole";

interface Props {
  attemptedPath?: string;
  requiredRoles?: string[];
}

export default function AccessDenied({ attemptedPath, requiredRoles }: Props) {
  const navigate = useNavigate();
  const { role } = useUserRole();

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-6">
      <div className="glass-card max-w-md w-full p-10 text-center space-y-6 rounded-2xl">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 mx-auto">
          <ShieldAlert className="h-7 w-7 text-destructive" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Access Denied</h1>
          <p className="text-sm text-muted-foreground">
            You don&apos;t have permission to view this page.
          </p>
          {attemptedPath && (
            <p className="text-xs text-muted-foreground/70 font-mono break-all">
              {attemptedPath}
            </p>
          )}
          {requiredRoles && requiredRoles.length > 0 && (
            <p className="text-xs text-muted-foreground pt-2">
              Required role{requiredRoles.length > 1 ? "s" : ""}:{" "}
              <span className="font-medium text-foreground">{requiredRoles.join(", ")}</span>
              {role && (
                <>
                  {" · "}Your role:{" "}
                  <span className="font-medium text-foreground">{role}</span>
                </>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Go back
          </Button>
          <Button onClick={() => navigate("/", { replace: true })}>
            Go to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
