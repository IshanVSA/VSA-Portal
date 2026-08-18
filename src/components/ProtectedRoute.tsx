import { useState, useEffect, useRef } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole, type AppRole } from "@/hooks/useUserRole";
import { useUserDepartments, type DepartmentType } from "@/hooks/useUserDepartments";
import { useTermsAcceptance } from "@/hooks/useTermsAcceptance";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { TermsAcceptanceModal } from "@/components/terms/TermsAcceptanceModal";
import { StaffAcknowledgmentModal } from "@/components/terms/StaffAcknowledgmentModal";
import { logAuthError } from "@/lib/auth-error-log";
import AccessDenied from "@/pages/AccessDenied";

interface Props {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
  allowedDepartments?: DepartmentType[];
}

export function ProtectedRoute({ children, allowedRoles, allowedDepartments }: Props) {
  const { user, loading, hasStoredToken, signOut, recoverSession } = useAuth();
  const { role, isLoading } = useUserRole();
  const { departments, isAllAccess, isLoading: deptsLoading } = useUserDepartments();
  const { hasAccepted, currentVersion, isLoading: termsLoading } = useTermsAcceptance();
  const [timedOut, setTimedOut] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryFailed, setRecoveryFailed] = useState(false);
  const recoveryAttempts = useRef(0);
  const location = useLocation();

  const allLoading = loading || isLoading || termsLoading || (allowedDepartments ? deptsLoading : false);

  useEffect(() => {
    if (!allLoading) return;
    const timer = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(timer);
  }, [allLoading]);

  // Bootstrap finished without a user but storage still has a token — the
  // session is very likely just stale. Silently re-establish it (2 attempts)
  // instead of dead-ending the user on an error screen.
  const stuckWithToken = !allLoading && !user && hasStoredToken;

  useEffect(() => {
    if (!stuckWithToken || recovering || recoveryFailed) return;
    if (recoveryAttempts.current >= 2) {
      setRecoveryFailed(true);
      return;
    }
    recoveryAttempts.current += 1;
    setRecovering(true);
    let cancelled = false;
    const attempt = recoveryAttempts.current;
    (async () => {
      // Small backoff on the second try.
      if (attempt > 1) await new Promise((r) => setTimeout(r, 1200));
      const ok = await recoverSession();
      if (cancelled) return;
      setRecovering(false);
      if (!ok && attempt >= 2) {
        setRecoveryFailed(true);
        void logAuthError({
          context: "session_recovery",
          errorMessage: "Session recovery failed after 2 attempts (stored refresh token could not be exchanged)",
          friendlyMessage: "We couldn't restore your session. Please sign in again.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stuckWithToken, recovering, recoveryFailed, recoverSession]);

  if (recovering) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if ((timedOut && allLoading) || (stuckWithToken && recoveryFailed)) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-sm">
          <p className="text-muted-foreground text-sm">
            Having trouble loading your account. Try refreshing the page, or sign out and back in.
          </p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              Refresh
            </Button>
            <Button variant="destructive" size="sm" onClick={signOut} className="gap-2">
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
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

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <AccessDenied attemptedPath={location.pathname} requiredRoles={allowedRoles} />;
  }

  // Department-level gate (concierge only). Admin & client bypass via isAllAccess.
  if (allowedDepartments && !isAllAccess) {
    const userDepts = departments ?? [];
    const ok = allowedDepartments.some((d) => userDepts.includes(d));
    if (!ok) return <AccessDenied attemptedPath={location.pathname} />;
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
