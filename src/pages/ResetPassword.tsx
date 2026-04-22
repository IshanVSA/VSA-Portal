import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import vsaLogo from "@/assets/vsa-logo.jpg";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const errorDescription =
          url.searchParams.get("error_description") ||
          new URLSearchParams(window.location.hash.replace(/^#/, "")).get("error_description");

        if (errorDescription) {
          toast.error(decodeURIComponent(errorDescription));
        }

        // PKCE flow: exchange ?code= for a session
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            toast.error(error.message);
          } else {
            // Clean the URL
            window.history.replaceState({}, document.title, "/reset-password");
            if (mounted) setReady(true);
            return;
          }
        }

        // Implicit/hash flow: supabase-js auto-detects access_token in the hash
        const { data: { session } } = await supabase.auth.getSession();
        if (session && mounted) setReady(true);
      } catch (err: any) {
        toast.error(err?.message ?? "Could not verify reset link");
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        if (mounted) setReady(true);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password updated successfully");
      navigate("/");
    }
    setLoading(false);
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <p className="text-muted-foreground">Verifying reset link...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center gap-3 mb-4">
          <img src={vsaLogo} alt="VSA Vet Media" className="h-8 w-8 rounded-lg object-cover" />
          <span className="font-semibold text-foreground text-sm">VSA Vet Media</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Set new password</h1>
          <p className="text-muted-foreground mt-1 text-sm">Enter your new password below</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} className="input-glow" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" required minLength={6} className="input-glow" />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Updating..." : "Update Password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
