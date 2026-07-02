import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IOSGroup, IOSRow, IOSFieldRow } from "@/components/ui/ios-list";
import { toast } from "sonner";
import { describeError } from "@/lib/edge-function-error";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import {
  User, Key, Sparkles, Bell, Palette,
  Shield, Save, Mail, Eye, EyeOff, Building2, BarChart3, AtSign, IdCard,
} from "lucide-react";
import { ClinicLogoUploader } from "@/components/clinic-detail/ClinicLogoUploader";

type ClinicLite = { id: string; clinic_name: string; logo_url: string | null };

export default function Settings() {
  const { user } = useAuth();
  const { role } = useUserRole();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get("tab") || "profile";

  const [fullName, setFullName] = useState("");
  const [teamRole, setTeamRole] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showMetaKey, setShowMetaKey] = useState(false);
  const [showGoogleKey, setShowGoogleKey] = useState(false);
  const [clinics, setClinics] = useState<ClinicLite[]>([]);
  const [clinicsLoading, setClinicsLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name, team_role").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data?.full_name) setFullName(data.full_name);
        if ((data as any)?.team_role) setTeamRole((data as any).team_role);
      });
  }, [user]);

  useEffect(() => {
    if (!user || role === "admin" || !role) return;
    setClinicsLoading(true);
    supabase
      .from("clinics")
      .select("id, clinic_name, logo_url")
      .order("clinic_name", { ascending: true })
      .then(({ data }) => {
        setClinics((data ?? []) as ClinicLite[]);
        setClinicsLoading(false);
      });
  }, [user, role]);

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);
    if (error) { toast.error("Failed to save"); setSaving(false); return; }
    await supabase.auth.updateUser({ data: { full_name: fullName } });
    toast.success("Profile updated");
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
    { value: "profile", label: "Profile" },
    { value: "integrations", label: "Integrations" },
    { value: "ai", label: "Tony AI" },
    { value: "notifications", label: "Notifications" },
    { value: "branding", label: "Branding" },
  ];
  const baseTabs = [
    { value: "profile", label: "Profile" },
    { value: "clinic", label: "Clinic" },
    { value: "notifications", label: "Notifications" },
  ];
  const tabs = role === "admin" ? adminTabs : baseTabs;

  const fieldInput = "h-9 border-0 bg-transparent px-0 text-[15px] placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none text-right";

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <header className="px-1">
        <h1 className="text-[28px] font-bold tracking-tight">Settings</h1>
        <p className="text-[13px] text-muted-foreground mt-1">Manage your account &amp; preferences</p>
      </header>

      <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
        <div className="tabs-scroll">
          <TabsList className="inline-flex w-max min-w-full justify-start">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="whitespace-nowrap">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ─── Profile ─── */}
        <TabsContent value="profile" className="mt-5 space-y-6">
          <IOSGroup header="Personal Information" footer="Your name appears in greetings and team activity.">
            <IOSFieldRow icon={<User />} tone="blue" label="Name">
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" className={fieldInput} />
            </IOSFieldRow>
            <IOSRow icon={<AtSign />} tone="indigo" label="Email" value={user?.email || "—"} />
            <IOSRow icon={<Shield />} tone="gray" label="Role" value={<span className="capitalize">{role === "concierge" ? (teamRole || "Member") : (role || "")}</span>} />
          </IOSGroup>
          <div className="flex justify-end px-1">
            <Button onClick={saveProfile} disabled={saving} className="gap-2 rounded-full">
              <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </TabsContent>

        {/* ─── Clinic Photo ─── */}
        {role !== "admin" && (
          <TabsContent value="clinic" className="mt-5 space-y-6">
            <IOSGroup header="Clinic Photo" footer="PNG, JPEG, or WebP up to 2 MB. Hover the photo to upload, change, or remove.">
              {clinicsLoading ? (
                <div className="px-4 py-4 text-[13px] text-muted-foreground">Loading your clinics…</div>
              ) : clinics.length === 0 ? (
                <div className="px-4 py-4 text-[13px] text-muted-foreground">
                  No clinics linked to your account yet. Please contact your account manager.
                </div>
              ) : (
                clinics.map((c) => (
                  <div key={c.id} className="flex items-center gap-4 px-4 py-3">
                    <ClinicLogoUploader
                      clinicId={c.id}
                      clinicName={c.clinic_name}
                      logoUrl={c.logo_url}
                      size={56}
                      onChange={(url) =>
                        setClinics((prev) => prev.map((x) => (x.id === c.id ? { ...x, logo_url: url } : x)))
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-medium text-foreground truncate">{c.clinic_name}</p>
                      <p className="text-[12px] text-muted-foreground">Hover to upload or replace.</p>
                    </div>
                  </div>
                ))
              )}
            </IOSGroup>
          </TabsContent>
        )}

        {/* ─── Integrations ─── */}
        {role === "admin" && (
          <TabsContent value="integrations" className="mt-5 space-y-6">
            <IOSGroup header="API Integrations" footer="Connect third-party services for analytics and ads.">
              <IOSFieldRow icon={<IdCard />} tone="blue" label="Meta">
                <div className="relative">
                  <Input placeholder="Meta API key" type={showMetaKey ? "text" : "password"} className={fieldInput + " pr-7"} />
                  <button type="button" onClick={() => setShowMetaKey(!showMetaKey)} className="absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showMetaKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </IOSFieldRow>
              <IOSFieldRow icon={<IdCard />} tone="green" label="Google Ads">
                <div className="relative">
                  <Input placeholder="Google Ads API key" type={showGoogleKey ? "text" : "password"} className={fieldInput + " pr-7"} />
                  <button type="button" onClick={() => setShowGoogleKey(!showGoogleKey)} className="absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showGoogleKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </IOSFieldRow>
            </IOSGroup>
            <div className="flex justify-end px-1">
              <Button variant="outline" className="gap-2 rounded-full">
                <Save className="h-4 w-4" /> Save API Keys
              </Button>
            </div>
          </TabsContent>
        )}

        {/* ─── Tony AI ─── */}
        {role === "admin" && (
          <TabsContent value="ai" className="mt-5 space-y-6">
            <IOSGroup header="Default Prompt Template" footer="Used as the base prompt when Tony AI generates content for clinics.">
              <div className="px-4 py-3">
                <Textarea
                  rows={6}
                  defaultValue="Generate a comprehensive monthly marketing plan for a veterinary clinic including content calendar, captions, reel ideas, hashtags, ad copy, and email newsletter."
                  className="border-0 bg-transparent px-0 py-0 text-[14px] font-mono resize-none focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none min-h-[120px]"
                />
              </div>
            </IOSGroup>
            <div className="flex justify-end px-1">
              <Button variant="outline" className="gap-2 rounded-full">
                <Save className="h-4 w-4" /> Save Template
              </Button>
            </div>
          </TabsContent>
        )}

        {/* ─── Notifications ─── */}
        <TabsContent value="notifications" className="mt-5 space-y-6">
          <IOSGroup header="Notifications" footer="Control how and when you receive notifications.">
            {[
              { title: "Email notifications", desc: "Email when content is submitted for review", icon: <Mail />, tone: "blue" as const, defaultChecked: true },
              { title: "Weekly digest", desc: "Weekly performance summary email", icon: <BarChart3 />, tone: "purple" as const, defaultChecked: false },
              { title: "Push notifications", desc: "Browser notifications for urgent items", icon: <Bell />, tone: "red" as const, defaultChecked: false },
            ].map((item) => (
              <IOSRow
                key={item.title}
                icon={item.icon}
                tone={item.tone}
                label={item.title}
                sublabel={item.desc}
                rightSlot={<Switch defaultChecked={item.defaultChecked} />}
              />
            ))}
          </IOSGroup>
        </TabsContent>

        {/* ─── Branding ─── */}
        {role === "admin" && (
          <TabsContent value="branding" className="mt-5 space-y-6">
            <IOSGroup header="Agency Branding">
              <IOSFieldRow icon={<Palette />} tone="pink" label="Name">
                <Input defaultValue="VSA Vetmedia" className={fieldInput} />
              </IOSFieldRow>
              <IOSFieldRow icon={<Palette />} tone="orange" label="Primary">
                <div className="flex items-center gap-2 justify-end">
                  <Input defaultValue="#6366f1" type="color" className="w-9 h-7 p-0.5 rounded-md cursor-pointer border-border" />
                  <Input defaultValue="#6366f1" className={fieldInput + " w-24 font-mono"} />
                </div>
              </IOSFieldRow>
            </IOSGroup>
            <div className="flex justify-end px-1">
              <Button variant="outline" className="gap-2 rounded-full">
                <Save className="h-4 w-4" /> Save Branding
              </Button>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
