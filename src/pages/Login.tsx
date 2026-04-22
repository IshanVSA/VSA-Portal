import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import vsaLogo from "@/assets/vsa-logo.jpg";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast.error(error.message);
    else navigate("/");
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen">
      {/* Left panel - clean brand panel */}
      <div className="hidden lg:flex lg:flex-1 relative items-center justify-center p-12 bg-[hsl(222,47%,6%)]">
        <div className="max-w-sm relative z-10">
          <img src={vsaLogo} alt="VSA Vet Media" className="h-14 w-14 rounded-2xl object-cover mb-8 shadow-2xl" />
          <h2 className="text-3xl font-bold text-white mb-3 tracking-tight">Digital Marketing - Simplified.</h2>
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
                <p className="text-sm text-gray-600">Enter your email and we'll send you a reset link.</p>
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
                    if (!resetEmail) { toast.error("Enter your email"); return; }
                    setResetLoading(true);
                    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, { redirectTo: `${window.location.origin}/reset-password` });
                    if (error) toast.error(error.message);
                    else { toast.success("Check your email for the reset link"); setForgotMode(false); }
                    setResetLoading(false);
                  }}>{resetLoading ? "Sending..." : "Send Reset Link"}</Button>
                </div>
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
