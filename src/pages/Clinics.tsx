import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { z } from "zod";
import { COMMON_TIMEZONES, getSafeTimeZone } from "@/lib/website-analytics";
import { isHttpsClinicWebsiteUrl, normalizeClinicWebsiteUrl } from "@/lib/clinic-website";
import { Plus, Search, Eye, Trash2, Pencil, Building2, Users, X, Loader2, Sparkles, Lock, ShieldCheck, RefreshCw, RotateCcw } from "lucide-react";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";
import { toast } from "sonner";
import { ClinicLogoUploader } from "@/components/clinic-detail/ClinicLogoUploader";
import { DepartmentTeamPicker } from "@/components/clinic-detail/DepartmentTeamPicker";
import { detectComplianceBody, getEffectiveComplianceBody, COMPLIANCE_BODY_OPTIONS } from "@/lib/compliance-body";
import { DisconnectAllGoogleAdsButton } from "@/components/clinics/DisconnectAllGoogleAdsButton";
import { ClientAccountsTab } from "@/components/clinics/ClientAccountsTab";

interface Clinic {
  id: string;
  clinic_name: string;
  status: string;
  assigned_concierge_id: string | null;
  owner_user_id: string | null;
  phone: string | null;
  address: string | null;
  website?: string | null;
  logo_url: string | null;
  compliance_body_override?: string | null;
  website_enabled?: boolean;
  seo_enabled?: boolean;
  google_ads_enabled?: boolean;
  ai_seo_enabled?: boolean;
  social_media_enabled?: boolean;
}

type ClinicAccessSettings = {
  website_enabled: boolean;
  seo_enabled: boolean;
  google_ads_enabled: boolean;
  ai_seo_enabled: boolean;
  social_media_enabled: boolean;
};

const defaultClinicAccessSettings: ClinicAccessSettings = {
  website_enabled: true,
  seo_enabled: true,
  google_ads_enabled: true,
  ai_seo_enabled: true,
  social_media_enabled: true,
};

const clinicAccessOptions: Array<{ key: keyof ClinicAccessSettings; label: string; description: string }> = [
  { key: "website_enabled", label: "Website", description: "Website tools, reports, and tickets" },
  { key: "seo_enabled", label: "SEO", description: "SEO analytics, rankings, and reports" },
  { key: "google_ads_enabled", label: "Google Ads", description: "Ads dashboards, analytics, and tickets" },
  { key: "ai_seo_enabled", label: "AI SEO", description: "AI SEO workspace access" },
  { key: "social_media_enabled", label: "Social Media", description: "Content, requests, and calendar tools" },
];

function getClinicServiceAccess(clinic: Clinic): ClinicAccessSettings {
  return {
    website_enabled: clinic.website_enabled ?? true,
    seo_enabled: clinic.seo_enabled ?? true,
    google_ads_enabled: clinic.google_ads_enabled ?? true,
    ai_seo_enabled: clinic.ai_seo_enabled ?? false,
    social_media_enabled: clinic.social_media_enabled ?? true,
  };
}

function ServiceAccessSelector({
  title,
  description,
  value,
  onToggle,
}: {
  title: string;
  description: string;
  value: ClinicAccessSettings;
  onToggle: (key: keyof ClinicAccessSettings) => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4">
      <div>
        <Label className="text-sm font-medium">{title}</Label>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {clinicAccessOptions.map((option) => {
          const enabled = value[option.key];

          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onToggle(option.key)}
              className={`rounded-xl border p-3 text-left transition-all ${enabled ? "border-primary/40 bg-primary/10" : "border-border bg-background hover:bg-muted/50"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{option.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {enabled ? <ShieldCheck className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                  {enabled ? "Enabled" : "Locked"}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface UserProfile {
  id: string;
  full_name: string | null;
  user_id: string | null;
}

interface TeamAssignment {
  clinic_id: string;
  user_id: string;
}

interface ExtractedClinicDetails {
  clinic_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  website?: string | null;
  timezone?: string | null;
  source_urls?: string[];
}

export default function Clinics() {
  const { role } = useUserRole();
  const { user, session } = useAuth();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [concierges, setConcierges] = useState<{ user_id: string; full_name: string }[]>([]);
  const [allStaff, setAllStaff] = useState<{ user_id: string; full_name: string; team_role: string | null }[]>([]);
  const [clients, setClients] = useState<{ user_id: string; full_name: string }[]>([]);
  const [teamAssignments, setTeamAssignments] = useState<TeamAssignment[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newWebsite, setNewWebsite] = useState("");
  const [newTimezone, setNewTimezone] = useState("");
  const [newOwnerId, setNewOwnerId] = useState("");
  const [newAccess, setNewAccess] = useState<ClinicAccessSettings>(defaultClinicAccessSettings);
  const [extractingWebsite, setExtractingWebsite] = useState(false);
  const [websiteDuplicate, setWebsiteDuplicate] = useState<string | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [clientMode, setClientMode] = useState<"existing" | "new">("existing");
  const [newClientForm, setNewClientForm] = useState({ full_name: "", email: "", password: "" });
  const [newClientErrors, setNewClientErrors] = useState<{ full_name?: string; email?: string; password?: string }>({});
  const [savingClinic, setSavingClinic] = useState(false);

  const [activeTab, setActiveTab] = useState<"clinics" | "clients">("clinics");

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editClinic, setEditClinic] = useState<Clinic | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editOwnerId, setEditOwnerId] = useState("");
  const [editAccess, setEditAccess] = useState<ClinicAccessSettings>(defaultClinicAccessSettings);
  const [editTeamMembers, setEditTeamMembers] = useState<string[]>([]);
  const [editComplianceOverride, setEditComplianceOverride] = useState<string | null>(null);
  const [refetchingWebsite, setRefetchingWebsite] = useState(false);

  // Team assignment dialog
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [teamDialogClinic, setTeamDialogClinic] = useState<Clinic | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchTeamAssignments = async () => {
    const { data } = await (supabase.from("clinic_team_members" as any).select("clinic_id, user_id") as any);
    setTeamAssignments((data as TeamAssignment[]) || []);
  };

  const fetchClinics = async () => {
    // RLS handles role-based filtering (admin sees all, concierge sees assigned + team, client sees owned)
    const { data } = await supabase.from("clinics").select("*").order("clinic_name", { ascending: true });
    setClinics(data || []);
    setLoading(false);
  };

  const fetchUsers = async () => {
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    if (!roles?.length) return;
    const staffIds = roles.filter(r => r.role === "admin" || r.role === "concierge").map(r => r.user_id);
    const conciergeIds = roles.filter(r => r.role === "concierge").map(r => r.user_id);
    const clientIds = roles.filter(r => r.role === "client").map(r => r.user_id);
    const allIds = [...new Set([...staffIds, ...clientIds])];
    if (!allIds.length) return;
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, team_role").in("id", allIds);
    const all = (profiles as any[] || []).map((p: any) => ({ user_id: p.id, full_name: p.full_name || "Unknown", team_role: p.team_role || null }));
    setAllStaff(all.filter(p => staffIds.includes(p.user_id)));
    setConcierges(all.filter(p => conciergeIds.includes(p.user_id)));
    setClients(all.filter(p => clientIds.includes(p.user_id)));
  };

  useEffect(() => {
    fetchClinics();
    if (role === "admin") {
      fetchUsers();
      fetchTeamAssignments();
    }
  }, [role, user]);

  const resetAddForm = () => {
    setNewName(""); setNewPhone(""); setNewEmail(""); setNewAddress(""); setNewWebsite(""); setNewTimezone(""); setNewOwnerId("");
    setNewAccess(defaultClinicAccessSettings);
    setExtractingWebsite(false);
    setWebsiteDuplicate(null);
    setCheckingDuplicate(false);
  };

  // Debounced duplicate website check
  useEffect(() => {
    const trimmed = newWebsite.trim();
    if (!trimmed) {
      setWebsiteDuplicate(null);
      return;
    }

    let normalizedUrl = "";
    try {
      normalizedUrl = normalizeClinicWebsiteUrl(trimmed);
    } catch {
      setWebsiteDuplicate(null);
      return;
    }

    setCheckingDuplicate(true);
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("clinics")
        .select("clinic_name")
        .eq("website", normalizedUrl)
        .limit(1);
      if (data && data.length > 0) {
        setWebsiteDuplicate(data[0].clinic_name);
      } else {
        setWebsiteDuplicate(null);
      }
      setCheckingDuplicate(false);
    }, 500);

    return () => { clearTimeout(timer); setCheckingDuplicate(false); };
  }, [newWebsite]);

  const toggleAddAccess = (key: keyof ClinicAccessSettings) => {
    setNewAccess((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleEditAccess = (key: keyof ClinicAccessSettings) => {
    setEditAccess((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const extractClinicFromWebsite = async () => {
    if (!newWebsite.trim()) {
      toast.error("Enter a clinic website first");
      return;
    }

    let normalizedWebsite = "";
    try {
      normalizedWebsite = normalizeClinicWebsiteUrl(newWebsite);
    } catch {
      toast.error("Please enter a valid website URL");
      return;
    }

    setNewWebsite(normalizedWebsite);
    setExtractingWebsite(true);

    try {
      // Always grab the freshest session token to avoid 401 on stale/revoked tokens
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token ?? session?.access_token;

      const { data, error } = await supabase.functions.invoke("extract-clinic-website", {
        body: { website: normalizedWebsite },
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });

      if (error) {
        toast.error(await extractEdgeFunctionError(error, data, "Failed to extract clinic details"));
        return;
      }

      const extracted = (data?.fields ?? null) as ExtractedClinicDetails | null;
      if (!extracted) {
        toast.error("No clinic details could be extracted from that website");
        return;
      }

      const nextTimezone = extracted.timezone && getSafeTimeZone(extracted.timezone) === extracted.timezone
        ? extracted.timezone
        : "";

      if (extracted.clinic_name) setNewName(extracted.clinic_name);
      if (extracted.phone) setNewPhone(extracted.phone);
      if (extracted.email) setNewEmail(extracted.email);
      if (extracted.address) setNewAddress(extracted.address);
      if (extracted.website) setNewWebsite(extracted.website);
      if (nextTimezone) setNewTimezone(nextTimezone);

      const extractedFieldCount = [
        extracted.clinic_name,
        extracted.phone,
        extracted.email,
        extracted.address,
        extracted.website,
        nextTimezone,
      ].filter(Boolean).length;

      if (extractedFieldCount >= 4) {
        toast.success(`Clinic details extracted${extracted.source_urls?.length ? ` from ${extracted.source_urls.length} pages` : ""}`);
      } else {
        toast("Partial details extracted - please review before saving");
      }
    } catch (invokeError) {
      toast.error(invokeError instanceof Error ? invokeError.message : "Failed to extract clinic details");
    } finally {
      setExtractingWebsite(false);
    }
  };

  const addClinic = async () => {
    if (!newName.trim()) return;

    const trimmedWebsite = newWebsite.trim();
    if (trimmedWebsite && !isHttpsClinicWebsiteUrl(trimmedWebsite)) {
      toast.error("Website URL must start with https://");
      return;
    }

    // Check for duplicate clinic by website
    if (trimmedWebsite) {
      const { data: existing } = await supabase
        .from("clinics")
        .select("id, clinic_name")
        .eq("website", trimmedWebsite)
        .limit(1);
      if (existing && existing.length > 0) {
        toast.error(`A clinic with this website already exists: "${existing[0].clinic_name}"`);
        return;
      }
    }

    const { data: clinicData, error } = await (supabase.from("clinics" as any).insert({
      clinic_name: newName.trim(),
      phone: newPhone || null,
      email: newEmail || null,
      address: newAddress || null,
      website: trimmedWebsite || null,
      timezone: newTimezone || null,
      owner_user_id: newOwnerId && newOwnerId !== "none" ? newOwnerId : null,
      ...newAccess,
    } as any).select("id").single() as any);
    if (error) { toast.error(error.message); return; }

    toast.success("Clinic added!");
    setDialogOpen(false);
    resetAddForm();
    fetchClinics();

    // Auto-run Layer 1 website extraction if a website was provided
    if (trimmedWebsite && clinicData?.id) {
      supabase.functions.invoke("extract-brand-dna", {
        body: { clinic_id: clinicData.id },
      }).then(({ error: extractErr }) => {
        if (extractErr) {
          console.warn("Auto website extraction failed:", extractErr);
        } else {
          toast.success("Website Brand DNA extracted automatically");
        }
      });
    }
  };

  const openEditDialog = (clinic: Clinic) => {
    setEditClinic(clinic);
    setEditName(clinic.clinic_name);
    setEditPhone(clinic.phone || "");
    setEditAddress(clinic.address || "");
    setEditOwnerId(clinic.owner_user_id || "none");
    setEditAccess({
      website_enabled: clinic.website_enabled ?? true,
      seo_enabled: clinic.seo_enabled ?? true,
      google_ads_enabled: clinic.google_ads_enabled ?? true,
      ai_seo_enabled: clinic.ai_seo_enabled ?? false,
      social_media_enabled: clinic.social_media_enabled ?? true,
    });
    setEditTeamMembers(
      teamAssignments.filter((a) => a.clinic_id === clinic.id).map((a) => a.user_id)
    );
    setEditComplianceOverride(clinic.compliance_body_override ?? null);
    setRefetchingWebsite(false);
    setEditDialogOpen(true);
  };

  const refetchClinicFromWebsite = async () => {
    if (!editClinic) return;
    const websiteUrl = (editClinic.website || "").trim();
    if (!websiteUrl) {
      toast.error("This clinic has no website on file. Add one first.");
      return;
    }
    setRefetchingWebsite(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token ?? session?.access_token;

      const { data, error } = await supabase.functions.invoke("extract-clinic-website", {
        body: { website: websiteUrl },
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });

      if (error) {
        toast.error(await extractEdgeFunctionError(error, data, "Failed to refetch clinic details"));
        return;
      }

      const extracted = (data?.fields ?? null) as ExtractedClinicDetails | null;
      if (!extracted) {
        toast.error("No clinic details could be extracted from the website");
        return;
      }

      const updates: string[] = [];
      if (extracted.clinic_name) { setEditName(extracted.clinic_name); updates.push("name"); }
      if (extracted.phone) { setEditPhone(extracted.phone); updates.push("phone"); }
      if (extracted.address) { setEditAddress(extracted.address); updates.push("address"); }

      if (updates.length === 0) {
        toast("No fields could be refreshed from the website");
      } else {
        toast.success(`Refreshed: ${updates.join(", ")}. Click Save Changes to persist.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to refetch clinic details");
    } finally {
      setRefetchingWebsite(false);
    }
  };

  const persistTeamAssignments = async (clinicId: string, nextMembers: string[]) => {
    const currentMembers = teamAssignments.filter(a => a.clinic_id === clinicId).map(a => a.user_id);
    const toAdd = nextMembers.filter(id => !currentMembers.includes(id));
    const toRemove = currentMembers.filter(id => !nextMembers.includes(id));

    const promises: Promise<any>[] = [];
    if (toAdd.length > 0) {
      promises.push(
        (supabase.from("clinic_team_members" as any).insert(
          toAdd.map(user_id => ({ clinic_id: clinicId, user_id }))
        ) as any)
      );
    }
    for (const userId of toRemove) {
      promises.push(
        (supabase.from("clinic_team_members" as any)
          .delete()
          .eq("clinic_id", clinicId)
          .eq("user_id", userId) as any)
      );
    }
    await Promise.all(promises);
  };

  const saveEdit = async () => {
    if (!editClinic || !editName.trim()) return;
    const autoBody = detectComplianceBody(editAddress || null);
    const overrideValue = editComplianceOverride && editComplianceOverride !== autoBody
      ? editComplianceOverride
      : null;
    const { error } = await (supabase.from("clinics" as any).update({
      clinic_name: editName.trim(),
      phone: editPhone || null,
      address: editAddress || null,
      owner_user_id: editOwnerId && editOwnerId !== "none" ? editOwnerId : null,
      compliance_body_override: overrideValue,
      ...editAccess,
    } as any).eq("id", editClinic.id) as any);
    if (error) { toast.error(error.message); return; }
    await persistTeamAssignments(editClinic.id, editTeamMembers);
    toast.success("Clinic updated!");
    setEditDialogOpen(false);
    setEditClinic(null);
    fetchClinics();
    fetchTeamAssignments();
  };

  const openTeamDialog = (clinic: Clinic) => {
    setTeamDialogClinic(clinic);
    const currentMembers = teamAssignments.filter(a => a.clinic_id === clinic.id).map(a => a.user_id);
    setSelectedMembers(currentMembers);
    setTeamDialogOpen(true);
  };

  const saveTeamAssignments = async () => {
    if (!teamDialogClinic) return;
    await persistTeamAssignments(teamDialogClinic.id, selectedMembers);
    toast.success("Team assignments updated");
    setTeamDialogOpen(false);
    fetchTeamAssignments();
  };

  const confirmDeleteClinic = async () => {
    if (!deleteTarget?.id) {
      toast.error("Missing clinic ID");
      return;
    }
    const targetId = deleteTarget.id;
    const targetName = deleteTarget.name;

    // Optimistic update: remove immediately from UI and close dialog
    const previousClinics = clinics;
    setClinics(prev => prev.filter(c => c.id !== targetId));
    setDeleteTarget(null);
    toast.success(`"${targetName}" deleted`);

    // Run delete in background
    const { error } = await (supabase.rpc("delete_clinic_by_id" as any, { _clinic_id: targetId }) as any);
    if (error) {
      // Rollback on failure
      setClinics(previousClinics);
      toast.error(error.message || "Failed to delete clinic. Restored.");
    }
  };


  const filtered = clinics.filter(c => c.clinic_name.toLowerCase().includes(search.toLowerCase()));
  const getClientName = (id: string | null) => !id ? null : clients.find(c => c.user_id === id)?.full_name || "Unknown";
  const getClinicTeam = (clinicId: string) => {
    const memberIds = teamAssignments.filter(a => a.clinic_id === clinicId).map(a => a.user_id);
    return allStaff.filter(s => memberIds.includes(s.user_id));
  };

  const toggleMember = (userId: string) => {
    setSelectedMembers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const timezoneOptions = newTimezone && !COMMON_TIMEZONES.includes(newTimezone)
    ? [newTimezone, ...COMMON_TIMEZONES]
    : COMMON_TIMEZONES;

  return (
    <>
      <div className="space-y-4 sm:space-y-6">
        {/* Hero */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <h1 className="text-[28px] sm:text-[34px] font-bold text-foreground tracking-tight leading-tight">Clinics</h1>
              <p className="text-muted-foreground mt-1 text-sm">{clinics.length} total clinics registered</p>
            </div>
            {role === "admin" && (
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <DisconnectAllGoogleAdsButton />
                <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetAddForm(); }}>
                  <DialogTrigger asChild>
                    <Button className="rounded-lg shadow-sm w-full sm:w-auto"><Plus className="h-4 w-4 mr-2" /> Add Clinic</Button>
                  </DialogTrigger>

                <DialogContent className="max-h-[85vh] overflow-y-auto max-w-[95vw] sm:max-w-lg">
                  <DialogHeader><DialogTitle>Add New Clinic</DialogTitle></DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <Label>Website URL</Label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          value={newWebsite}
                          onChange={e => setNewWebsite(e.target.value)}
                          placeholder="https://examplevet.com"
                          className="input-glow"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={extractClinicFromWebsite}
                          disabled={extractingWebsite || !newWebsite.trim()}
                          className="sm:w-auto"
                        >
                          {extractingWebsite ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                          Extract from Website
                        </Button>
                      </div>
                      {websiteDuplicate && (
                        <p className="text-xs text-destructive font-medium">⚠ A clinic with this website already exists: "{websiteDuplicate}"</p>
                      )}
                      {!websiteDuplicate && (
                        <p className="text-xs text-muted-foreground">Paste the clinic website, then extract name, phone, address, email, and timezone before saving.</p>
                      )}
                    </div>
                    <div className="space-y-2"><Label>Clinic Name</Label><Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Happy Paws Vet" className="input-glow" /></div>
                    <div className="space-y-2"><Label>Phone</Label><Input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="(555) 123-4567" className="input-glow" /></div>
                    <div className="space-y-2"><Label>Email</Label><Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="hello@clinic.com" className="input-glow" /></div>
                    <div className="space-y-2"><Label>Address</Label><Input value={newAddress} onChange={e => setNewAddress(e.target.value)} placeholder="123 Main St" className="input-glow" /></div>
                    <div className="space-y-2">
                      <Label>Timezone</Label>
                      <Select value={newTimezone || "none"} onValueChange={(value) => setNewTimezone(value === "none" ? "" : value)}>
                        <SelectTrigger><SelectValue placeholder="Select timezone..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No timezone selected</SelectItem>
                          {timezoneOptions.map((option) => (<SelectItem key={option} value={option}>{option}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Client Owner (Optional)</Label>
                      <Select value={newOwnerId} onValueChange={setNewOwnerId}>
                        <SelectTrigger><SelectValue placeholder="Select client..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No owner</SelectItem>
                          {clients.map(c => (<SelectItem key={c.user_id} value={c.user_id}>{c.full_name}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <ServiceAccessSelector
                      title="Service Access"
                      description="Choose which department workspaces this clinic can open. Disabled services will show a locked access state for non-admin users."
                      value={newAccess}
                      onToggle={toggleAddAccess}
                    />
                    <Button onClick={addClinic} className="w-full" disabled={!!websiteDuplicate || checkingDuplicate}>Add Clinic</Button>
                  </div>
                </DialogContent>
              </Dialog>
              </div>
            )}

        </div>


        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search clinics..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 input-glow" />
        </div>

        {/* Table */}
        <Card className="overflow-hidden border-border/60">
          {loading ? (
            <div className="p-12 text-center text-muted-foreground">
              <div className="inline-flex items-center gap-2">
                <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                Loading clinics...
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <Building2 className="h-5 w-5 text-muted-foreground" />
              </div>
              <p>No clinics found.</p>
            </div>
          ) : (
          <div className="overflow-x-auto">
            <Table className="data-table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Clinic Name</TableHead>
                  {role === "admin" && <TableHead className="hidden xl:table-cell">Service Access</TableHead>}
                  {role === "admin" && <TableHead>Team Members</TableHead>}
                  {role === "admin" && <TableHead className="hidden lg:table-cell">Client Owner</TableHead>}
                  
                  
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((clinic) => {
                  const clinicTeam = getClinicTeam(clinic.id);
                  const serviceAccess = getClinicServiceAccess(clinic);
                  return (
                    <TableRow key={clinic.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <ClinicLogoUploader
                            clinicId={clinic.id}
                            clinicName={clinic.clinic_name}
                            logoUrl={clinic.logo_url}
                            onChange={(url) => setClinics((prev) => prev.map((c) => c.id === clinic.id ? { ...c, logo_url: url } : c))}
                            size={36}
                            readOnly
                          />
                          <span>{clinic.clinic_name}</span>
                        </div>
                      </TableCell>
                      {role === "admin" && (
                        <TableCell className="hidden xl:table-cell">
                          <div className="flex flex-wrap gap-1.5">
                            {clinicAccessOptions.map((option) => {
                              const enabled = serviceAccess[option.key];

                              return (
                                <Badge
                                  key={option.key}
                                  variant="secondary"
                                  className={`rounded-full gap-1 text-[11px] ${enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                                >
                                  {enabled ? <ShieldCheck className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                                  {option.label}
                                </Badge>
                              );
                            })}
                          </div>
                        </TableCell>
                      )}
                      {role === "admin" && (
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {clinicTeam.length > 0 ? clinicTeam.map(m => (
                              <Badge key={m.user_id} variant="secondary" className="text-[11px] rounded-full gap-1">
                                {m.full_name}
                                {m.team_role && <span className="text-muted-foreground">· {m.team_role}</span>}
                              </Badge>
                            )) : (
                              <span className="text-muted-foreground text-xs italic">No team assigned</span>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 rounded-full"
                              onClick={() => openTeamDialog(clinic)}
                            >
                              <Users className="h-3 w-3 text-muted-foreground" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                      {role === "admin" && (
                        <TableCell className="hidden lg:table-cell">
                          <span className={clinic.owner_user_id ? "text-foreground" : "text-muted-foreground italic text-xs"}>
                            {getClientName(clinic.owner_user_id) || "No owner"}
                          </span>
                        </TableCell>
                      )}
                      
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {role === "admin" && (
                            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => openEditDialog(clinic)}>
                              <Pencil className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">Edit</span>
                            </Button>
                          )}
                          <Link to={`/clinics/${clinic.id}`}>
                            <Button variant="ghost" size="sm" className="h-8 text-xs"><Eye className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">View</span></Button>
                          </Link>
                          {role === "admin" && (
                            <Button variant="ghost" size="sm" className="h-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget({ id: clinic.id, name: clinic.clinic_name })}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          )}
        </Card>

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-h-[85vh] overflow-y-auto max-w-[95vw] sm:max-w-2xl">
            <DialogHeader><DialogTitle>Edit Clinic</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Clinic Name</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={refetchClinicFromWebsite}
                    disabled={refetchingWebsite || !editClinic?.website}
                    className="h-7 text-xs"
                    title={editClinic?.website ? `Refetch from ${editClinic.website}` : "No website on file"}
                  >
                    {refetchingWebsite
                      ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Refetching…</>
                      : <><RefreshCw className="h-3 w-3 mr-1" /> Refetch from website</>}
                  </Button>
                </div>
                <Input value={editName} onChange={e => setEditName(e.target.value)} className="input-glow" />
                {!editClinic?.website && (
                  <p className="text-[11px] text-muted-foreground">Add a website on this clinic to enable refetch.</p>
                )}
              </div>
              <div className="space-y-2"><Label>Phone</Label><Input value={editPhone} onChange={e => setEditPhone(e.target.value)} className="input-glow" /></div>
              <div className="space-y-2"><Label>Address</Label><Input value={editAddress} onChange={e => setEditAddress(e.target.value)} className="input-glow" /></div>
              {(() => {
                const autoBody = detectComplianceBody(editAddress || null);
                const effective = getEffectiveComplianceBody(editAddress || null, editComplianceOverride);
                const isOverride = !!editComplianceOverride && editComplianceOverride !== autoBody;
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <Label className="flex items-center gap-2">
                        Compliance Body
                        <Badge variant={isOverride ? "default" : "secondary"} className="text-[10px] rounded-full font-normal">
                          {isOverride ? "Manual override" : "Auto-detected"}
                        </Badge>
                      </Label>
                      {isOverride && (
                        <button
                          type="button"
                          onClick={() => setEditComplianceOverride(null)}
                          className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
                        >
                          <RotateCcw className="h-3 w-3" /> Reset to auto
                        </button>
                      )}
                    </div>
                    <Select
                      value={effective}
                      onValueChange={(val) => setEditComplianceOverride(val === autoBody ? null : val)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-[280px]">
                        {COMPLIANCE_BODY_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <span className="text-muted-foreground text-[10px] mr-1">[{opt.group}]</span>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      Used by AI for ad and promotion compliance checks. Override only if the auto-detected body is wrong for this clinic.
                    </p>
                  </div>
                );
              })()}
              <div className="space-y-2">
                <Label>Client Owner</Label>
                <Select value={editOwnerId} onValueChange={setEditOwnerId}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No owner</SelectItem>
                    {clients.map(c => (<SelectItem key={c.user_id} value={c.user_id}>{c.full_name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <ServiceAccessSelector
                title="Service Access"
                description="Update which department workspaces this clinic can access without changing stored ticket types or history."
                value={editAccess}
                onToggle={toggleEditAccess}
              />
              <div className="space-y-2">
                <Label>Team Members by Department</Label>
                <p className="text-xs text-muted-foreground">
                  Assign one or more staff to each department. Members appear in pickers, ticket pools, and team views for this clinic.
                </p>
                <DepartmentTeamPicker
                  staff={allStaff}
                  selected={editTeamMembers}
                  onToggle={(id) =>
                    setEditTeamMembers((prev) =>
                      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                    )
                  }
                />
              </div>
              <Button onClick={saveEdit} className="w-full">Save Changes</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Team Assignment Dialog */}
        <Dialog open={teamDialogOpen} onOpenChange={setTeamDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Assign Team Members</DialogTitle>
              <DialogDescription>
                Assign staff per department to <span className="font-medium text-foreground">{teamDialogClinic?.clinic_name}</span>. Each department can have multiple members.
              </DialogDescription>
            </DialogHeader>
            {allStaff.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No team members available</p>
            ) : (
              <DepartmentTeamPicker
                staff={allStaff}
                selected={selectedMembers}
                onToggle={toggleMember}
              />
            )}
            {selectedMembers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {selectedMembers.map(id => {
                  const m = allStaff.find(s => s.user_id === id);
                  return m ? (
                    <Badge key={id} variant="secondary" className="text-[11px] rounded-full gap-1 pr-1">
                      {m.full_name}
                      <button onClick={() => toggleMember(id)} className="ml-0.5 hover:text-destructive transition-colors">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ) : null;
                })}
              </div>
            )}
            <Button onClick={saveTeamAssignments} className="w-full mt-2">
              Save Assignments ({selectedMembers.length} selected)
            </Button>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete clinic?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <span className="font-semibold text-foreground">"{deleteTarget?.name}"</span>? This will permanently remove all associated data including team members, content, analytics, and tickets.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); confirmDeleteClinic(); }}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting…</> : "Delete clinic"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}
