import { Button } from "@/components/ui/button";
import { LogOut, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function TermsBlockedScreen() {
  const { signOut } = useAuth();

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="text-center space-y-6 max-w-md px-6">
        <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <ShieldAlert className="h-8 w-8 text-destructive" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Access Suspended</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Your access has been temporarily suspended pending review. A member of the VSA team will contact you within two business days to discuss your concerns.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={signOut} className="gap-2">
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
