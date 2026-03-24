import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import {
  Settings as SettingsIcon, User, Key, Sparkles, Bell, Palette,
  Shield, Save, Mail, Eye, EyeOff,
} from "lucide-react";
import { motion } from "framer-motion";

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.35, ease: "easeOut" as const },
  }),
};

export default function Settings() {
  const { user } = useAuth();
  const { role } = useUserRole();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get("tab") || "profile";

  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);
  const [showMetaKey, setShowMetaKey] = useState(false);
  const [showGoogleKey, setShowGoogleKey] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.full_name) setFullName(data.full_name); });
  }, [user]);

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);
    if (error) toast.error("Failed to save"); else toast.success("Profile updated");
    setSaving(false);
  };

  const handleTabChange = (v: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", v);
      return next;
    }, { replace: true });
  };

  const adminTabs = [
    { value: "profile", label: "Profile", icon: User },
    { value: "integrations", label: "Integrations", icon: Key },
    { value: "ai", label: "AI Templates", icon: Sparkles },
    { value: "notifications", label: "Notifications", icon: Bell },
    { value: "branding", label: "Branding", icon: Palette },
  ];

  const baseTabs = [
    { value: "profile", label: "Profile", icon: User },
    { value: "notifications", label: "Notifications", icon: Bell },
  ];

  const tabs = role === "admin" ? adminTabs : baseTabs;

  return (
    <>
      <div className="space-y-4 sm:space-y-6">
        {/* Hero Header */}
        <div className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-[hsl(280,65%,55%)] p-5 sm:p-8 text-primary-foreground shadow-lg">
          <div className="absolute inset-0 dot-grid opacity-10" />
          <div className="relative z-10">
            <div className="flex items-center gap-2.5 sm:gap-3 mb-2">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-primary-foreground/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                <SettingsIcon className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold">Settings</h1>
                <p className="text-primary-foreground/70 text-xs sm:text-sm font-medium -mt-0.5">
                  Manage your account &amp; preferences
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="w-full justify-start bg-muted/50 h-11 p-1 overflow-x-auto">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="gap-1.5 text-xs sm:text-sm data-[state=active]:shadow-sm"
              >
                <tab.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ─── Profile ─── */}
          <TabsContent value="profile" className="mt-4 space-y-4">
            <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0}>
              <Card className="glass-card overflow-hidden">
                <CardHeader className="border-b border-border/40 bg-muted/20">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Personal Information</CardTitle>
                      <CardDescription className="text-xs">Update your name and view account details</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-5 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Full Name</Label>
                      <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input-glow" placeholder="Your full name" />
                    </div>
                    <div className="space-y-2">
                      <Label>Email Address</Label>
                      <Input defaultValue={user?.email || ""} disabled className="bg-muted/30" />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <Input value={role || ""} disabled className="capitalize bg-muted/30" />
                      </div>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex justify-end">
                    <Button onClick={saveProfile} disabled={saving} className="gap-2 rounded-lg">
                      <Save className="h-4 w-4" />
                      {saving ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          {/* ─── Integrations (admin) ─── */}
          {role === "admin" && (
            <TabsContent value="integrations" className="mt-4 space-y-4">
              <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0}>
                <Card className="glass-card overflow-hidden">
                  <CardHeader className="border-b border-border/40 bg-muted/20">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Key className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">API Integrations</CardTitle>
                        <CardDescription className="text-xs">Connect third-party services for analytics and ads</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-5 space-y-6">
                    <div className="grid gap-6 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <span className="inline-flex h-5 w-5 rounded bg-[hsl(221,83%,53%)]/10 items-center justify-center text-[10px] font-bold text-primary">M</span>
                          Meta (Facebook/Instagram)
                        </Label>
                        <div className="relative">
                          <Input placeholder="Meta API key" type={showMetaKey ? "text" : "password"} className="input-glow pr-10" />
                          <button type="button" onClick={() => setShowMetaKey(!showMetaKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                            {showMetaKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground">Social media analytics integration</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <span className="inline-flex h-5 w-5 rounded bg-success/10 items-center justify-center text-[10px] font-bold text-success">G</span>
                          Google Ads
                        </Label>
                        <div className="relative">
                          <Input placeholder="Google Ads API key" type={showGoogleKey ? "text" : "password"} className="input-glow pr-10" />
                          <button type="button" onClick={() => setShowGoogleKey(!showGoogleKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                            {showGoogleKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground">Ad performance data integration</p>
                      </div>
                    </div>
                    <Separator />
                    <div className="flex justify-end">
                      <Button variant="outline" className="gap-2 rounded-lg">
                        <Save className="h-4 w-4" />
                        Save API Keys
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </TabsContent>
          )}

          {/* ─── AI Templates (admin) ─── */}
          {role === "admin" && (
            <TabsContent value="ai" className="mt-4 space-y-4">
              <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0}>
                <Card className="glass-card overflow-hidden">
                  <CardHeader className="border-b border-border/40 bg-muted/20">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Sparkles className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Default Prompt Template</CardTitle>
                        <CardDescription className="text-xs">Base prompt used for AI content generation</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-5 space-y-4">
                    <div className="space-y-2">
                      <Label>AI Content Generation Prompt</Label>
                      <Textarea
                        rows={5}
                        defaultValue="Generate a comprehensive monthly marketing plan for a veterinary clinic including content calendar, captions, reel ideas, hashtags, ad copy, and email newsletter."
                        className="input-glow font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">This template is used as the base prompt when generating content for clinics</p>
                    </div>
                    <Separator />
                    <div className="flex justify-end">
                      <Button variant="outline" className="gap-2 rounded-lg">
                        <Save className="h-4 w-4" />
                        Save Template
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </TabsContent>
          )}

          {/* ─── Notifications ─── */}
          <TabsContent value="notifications" className="mt-4 space-y-4">
            <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0}>
              <Card className="glass-card overflow-hidden">
                <CardHeader className="border-b border-border/40 bg-muted/20">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Bell className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Notification Preferences</CardTitle>
                      <CardDescription className="text-xs">Control how and when you receive notifications</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-5 space-y-1">
                  {[
                    { title: "Email notifications", desc: "Receive email when content is submitted for review", icon: Mail, defaultChecked: true },
                    { title: "Weekly digest", desc: "Receive weekly performance summary email", icon: BarChart3Icon, defaultChecked: false },
                    { title: "Push notifications", desc: "Browser notifications for urgent items", icon: Bell, defaultChecked: false },
                  ].map((item, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                            <item.icon className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{item.title}</p>
                            <p className="text-xs text-muted-foreground">{item.desc}</p>
                          </div>
                        </div>
                        <Switch defaultChecked={item.defaultChecked} />
                      </div>
                      {i < 2 && <Separator />}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>

          {/* ─── Branding (admin) ─── */}
          {role === "admin" && (
            <TabsContent value="branding" className="mt-4 space-y-4">
              <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0}>
                <Card className="glass-card overflow-hidden">
                  <CardHeader className="border-b border-border/40 bg-muted/20">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Palette className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Agency Branding</CardTitle>
                        <CardDescription className="text-xs">Customize your agency identity and colors</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-5 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Agency Name</Label>
                        <Input defaultValue="VSA Vetmedia" className="input-glow" />
                      </div>
                      <div className="space-y-2">
                        <Label>Primary Color</Label>
                        <div className="flex items-center gap-3">
                          <Input defaultValue="#6366f1" type="color" className="w-12 h-10 p-1 rounded-lg cursor-pointer border-border" />
                          <Input defaultValue="#6366f1" className="w-28 font-mono text-sm input-glow" />
                        </div>
                      </div>
                    </div>
                    <Separator />
                    <div className="flex justify-end">
                      <Button variant="outline" className="gap-2 rounded-lg">
                        <Save className="h-4 w-4" />
                        Save Branding
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </>
  );
}

// Tiny inline icon alias to avoid importing BarChart3 from lucide
function BarChart3Icon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" />
    </svg>
  );
}
