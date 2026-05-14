import { useState, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole, type AppRole } from "@/hooks/useUserRole";
import { useUserDepartments, type DepartmentType } from "@/hooks/useUserDepartments";
import { useTermsAcceptance } from "@/hooks/useTermsAcceptance";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { TermsAcceptanceModal } from "@/components/terms/TermsAcceptanceModal";
import { StaffAcknowledgmentModal } from "@/components/terms/StaffAcknowledgmentModal";
import AccessDenied from "@/pages/AccessDenied";

interface Props {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
  allowedDepartments?: DepartmentType[];
}

export function ProtectedRoute({ children, allowedRoles }: Props) {
  const { user, loading, signOut } = useAuth();
  const { role, isLoading } = useUserRole();
  const { hasAccepted, currentVersion, isLoading: termsLoading } = useTermsAcceptance();
  const [timedOut, setTimedOut] = useState(false);
  const location = useLocation();

  const allLoading = loading || isLoading || termsLoading;

  useEffect(() => {
    if (!allLoading) return;
    const timer = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(timer);
  }, [allLoading]);

  if (timedOut && allLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-sm">
          <p className="text-muted-foreground text-sm">
            Having trouble loading your account. You can try signing out and back in.
          </p>
          <Button variant="destructive" size="sm" onClick={signOut} className="gap-2">
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>
    );
  }

  if (allLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <AccessDenied attemptedPath={location.pathname} requiredRoles={allowedRoles} />;
  }

  // Terms acceptance gate — admins bypass
  if (!hasAccepted && currentVersion && role !== "admin") {
    if (role === "concierge") {
      return <StaffAcknowledgmentModal currentVersion={currentVersion} />;
    }
    // client or unknown role
    return <TermsAcceptanceModal currentVersion={currentVersion} />;
  }

  return <>{children}</>;
}
