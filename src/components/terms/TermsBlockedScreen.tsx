import { Button } from "@/components/ui/button";
import { LogOut, ShieldAlert, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  onReviewAgain?: () => void;
}

export function TermsBlockedScreen({ onReviewAgain }: Props) {
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
          {onReviewAgain && (
            <p className="text-muted-foreground text-xs leading-relaxed pt-2">
              Changed your mind? You can review the Privacy Policy & Terms of Use again and accept to restore access immediately.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 items-center">
          {onReviewAgain && (
            <Button onClick={onReviewAgain} size="sm" className="gap-2 w-full max-w-[220px]">
              <RefreshCw className="h-4 w-4" />
              Review Terms Again
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={signOut} className="gap-2 w-full max-w-[220px]">
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
