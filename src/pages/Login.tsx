import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import vsaLogo from "@/assets/vsa-logo.jpg";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Map any raw error string (technical or otherwise) into a friendly,
 * non-technical message suitable for end users. Strips out things like
 * "Edge Function", HTTP status codes, "non-2xx", stack traces, etc.
 */
function toFriendlyResetError(raw: string): string {
  const msg = (raw || "").toLowerCase();

  if (!msg) return "We couldn't send the reset link. Please try again in a moment.";

  if (msg.includes("no account") || msg.includes("not found") || msg.includes("404")) {
    return "We couldn't find an account with that email address. Please check the spelling and try again.";
  }
  if (msg.includes("rate") || msg.includes("too many") || msg.includes("429")) {
    return "Too many attempts right now. Please wait a minute and try again.";
  }
  if (msg.includes("timeout") || msg.includes("timed out")) {
    return "The request took too long. Please check your connection and try again.";
  }
  if (msg.includes("network") || msg.includes("fetch") || msg.includes("unreachable")) {
    return "We're having trouble reaching the email service. Please try again in a moment.";
  }
  if (msg.includes("invalid") && msg.includes("email")) {
    return "That doesn't look like a valid email address. Please check and try again.";
  }
  if (msg.includes("auth")) {
    return "The email service is temporarily unavailable. Please try again shortly or contact support.";
  }

  // Strip technical jargon from any leftover message
  if (
    msg.includes("edge function") ||
    msg.includes("non-2xx") ||
    msg.includes("status code") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503")
  ) {
    return "Something went wrong on our end. Please try again in a moment.";
  }

  // If it's already a clean human sentence, keep it; otherwise generic fallback
  if (raw.length < 160 && !raw.includes("{") && !raw.includes("Error:")) {
    return raw;
  }
  return "We couldn't send the reset link. Please try again in a moment.";
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resetSentInfo, setResetSentInfo] = useState<{ expiresAt: string; minutes: number } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) {
      const m = (error.message || "").toLowerCase();
      if (m.includes("invalid") && (m.includes("credential") || m.includes("login"))) {
        toast.error("The email or password you entered is incorrect. Please try again.");
      } else if (m.includes("email not confirmed")) {
        toast.error("Please confirm your email address before signing in.");
      } else if (m.includes("rate") || m.includes("too many")) {
        toast.error("Too many sign-in attempts. Please wait a minute and try again.");
      } else if (m.includes("network") || m.includes("fetch")) {
        toast.error("We're having trouble connecting. Please check your internet and try again.");
      } else {
        toast.error("We couldn't sign you in. Please try again.");
      }
    }
    else {
      const from = (location.state as { from?: { pathname: string; search?: string } } | null)?.from;
      const dest = from ? `${from.pathname}${from.search ?? ""}` : "/";
      navigate(dest, { replace: true });
    }
    setLoading(false);
  };

  const formatExpiry = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(undefined, {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        month: "short",
        day: "numeric",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left panel - clean brand panel */}
      <div className="hidden lg:flex lg:flex-1 relative items-center justify-center p-12 bg-[hsl(222,47%,6%)]">
        <div className="max-w-sm relative z-10">
          <img src={vsaLogo} alt="VSA Vet Media" className="h-14 w-14 rounded-2xl object-cover mb-8 shadow-2xl" />
          <h2 className="text-3xl font-bold text-white mb-3 tracking-tight">Digital Marketing Simplified.</h2>
          <p className="text-[hsl(215,20%,55%)] text-base leading-relaxed">
            Manage your veterinary clinic's online presence from one powerful dashboard.
          </p>
          <div className="mt-10 flex items-center gap-3">
            <div className="h-1 w-8 rounded-full bg-[hsl(var(--primary))]" />
            <div className="h-1 w-4 rounded-full bg-[hsl(var(--primary))]/30" />
            <div className="h-1 w-4 rounded-full bg-[hsl(var(--primary))]/10" />
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 relative flex items-center justify-center p-6 bg-white">
        <div className="w-full max-w-sm space-y-6 text-gray-900">
          <div className="lg:hidden flex items-center gap-3 mb-4">
            <img src={vsaLogo} alt="VSA Vet Media" className="h-8 w-8 rounded-lg object-cover" />
            <span className="font-semibold text-gray-900 text-sm">VSA Vet Media</span>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Welcome back</h1>
            <p className="text-gray-500 mt-1 text-sm">Sign in to your dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-gray-700">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required className="input-glow border-gray-200 bg-white text-gray-900 placeholder:text-gray-400" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-gray-700">Password</Label>
                <button type="button" onClick={() => setForgotMode(true)} className="text-xs text-primary hover:underline">Forgot password?</button>
              </div>
              <div className="relative">
                <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} className="input-glow border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 pr-10" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Loading..." : "Sign In"}
            </Button>
          </form>

          {forgotMode && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white rounded-xl border border-gray-200 p-6 w-full max-w-sm space-y-4 shadow-xl">
                <h2 className="text-lg font-bold text-gray-900">Reset your password</h2>
                {resetSentInfo ? (
                  <>
                    <p className="text-sm text-gray-600">
                      We've sent a reset link to <span className="font-medium text-gray-900">{resetEmail}</span>.
                    </p>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      ⏱ This link expires in about <strong>{resetSentInfo.minutes} minutes</strong>
                      {" "}(around <strong>{formatExpiry(resetSentInfo.expiresAt)}</strong>). Request a new one if it expires.
                    </div>
                    <Button className="w-full" onClick={() => { setForgotMode(false); setResetSentInfo(null); setResetEmail(""); }}>
                      Done
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-600">Enter your email and we'll send you a reset link. Links expire after about 60 minutes.</p>
                    <Input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="input-glow border-gray-200 bg-white text-gray-900 placeholder:text-gray-400"
                    />
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1 bg-white text-gray-900 border-gray-200 hover:bg-gray-50" onClick={() => setForgotMode(false)}>Cancel</Button>
                      <Button className="flex-1" disabled={resetLoading} onClick={async () => {
                        if (!resetEmail) { toast.error("Please enter your email address"); return; }
                        setResetLoading(true);
                        const { data, error } = await supabase.functions.invoke("request-password-reset", {
                          body: { email: resetEmail },
                        });
                        if (error || (data && (data as any).error)) {
                          const raw = await extractEdgeFunctionError(error, data, "");
                          const friendly = toFriendlyResetError(raw);
                          toast.error(friendly);
                        } else {
                          const d = data as any;
                          toast.success("Reset link sent! Please check your email.");
                          setResetSentInfo({
                            expiresAt: d?.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                            minutes: d?.expiresInMinutes ?? 60,
                          });
                        }
                        setResetLoading(false);
                      }}>{resetLoading ? "Sending..." : "Send Reset Link"}</Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="absolute bottom-6 right-6 text-xs text-muted-foreground space-x-3">
          <a href="/privacy-policy" className="hover:text-foreground underline">Privacy Policy</a>
          <span>·</span>
          <a href="/terms-of-service" className="hover:text-foreground underline">Terms of Service</a>
        </div>
      </div>
    </div>
  );
}
