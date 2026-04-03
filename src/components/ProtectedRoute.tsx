import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole, type AppRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

interface Props {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}

export function ProtectedRoute({ children, allowedRoles }: Props) {
  const { user, loading, signOut } = useAuth();
  const { role, isLoading } = useUserRole();
  const [timedOut, setTimedOut] = useState(false);

  // Safety: if loading takes longer than 8 seconds, show an escape hatch
  useEffect(() => {
    if (!loading && !isLoading) return;
    const timer = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(timer);
  }, [loading, isLoading]);

  if (timedOut && (loading || isLoading)) {
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

  if (loading || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
