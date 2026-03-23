import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { COMMON_TIMEZONES, getSafeTimeZone } from "@/lib/website-analytics";
import { isHttpsClinicWebsiteUrl, normalizeClinicWebsiteUrl } from "@/lib/clinic-website";
import { Plus, Search, Eye, Trash2, ChevronDown, Pencil, Building2, Users, X, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface Clinic {
  id: string;
  clinic_name: string;
  status: string;
  assigned_concierge_id: string | null;
  owner_user_id: string | null;
  phone: string | null;
  address: string | null;
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
  const [extractingWebsite, setExtractingWebsite] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [metaPageAccessToken, setMetaPageAccessToken] = useState("");
  const [metaPageId, setMetaPageId] = useState("");
  const [metaInstagramBusinessId, setMetaInstagramBusinessId] = useState("");
  const [googleRefreshToken, setGoogleRefreshToken] = useState("");
  const [googleCustomerId, setGoogleCustomerId] = useState("");
  const [googleLoginCustomerId, setGoogleLoginCustomerId] = useState("");

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editClinic, setEditClinic] = useState<Clinic | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editOwnerId, setEditOwnerId] = useState("");

  // Team assignment dialog
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [teamDialogClinic, setTeamDialogClinic] = useState<Clinic | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  const fetchTeamAssignments = async () => {
    const { data } = await (supabase.from("clinic_team_members" as any).select("clinic_id, user_id") as any);
    setTeamAssignments((data as TeamAssignment[]) || []);
  };

  const fetchClinics = async () => {
    let query = supabase.from("clinics").select("*");
    if (role === "concierge") query = query.eq("assigned_concierge_id", user?.id);
    if (role === "client") query = query.eq("owner_user_id", user?.id);
    const { data } = await query;
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
    setExtractingWebsite(false);
    setCredentialsOpen(false);
    setMetaPageAccessToken(""); setMetaPageId(""); setMetaInstagramBusinessId("");
    setGoogleRefreshToken(""); setGoogleCustomerId(""); setGoogleLoginCustomerId("");
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
      const { data, error } = await supabase.functions.invoke("extract-clinic-website", {
        body: { website: normalizedWebsite },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });

      if (error) {
        toast.error(error.message);
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
        toast("Partial details extracted — please review before saving");
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

    const { data: clinicData, error } = await supabase.from("clinics").insert({
      clinic_name: newName.trim(),
      phone: newPhone || null,
      email: newEmail || null,
      address: newAddress || null,
      website: trimmedWebsite || null,
      timezone: newTimezone || null,
      owner_user_id: newOwnerId && newOwnerId !== "none" ? newOwnerId : null,
    }).select("id").single();
    if (error) { toast.error(error.message); return; }

    const hasMetaCreds = metaPageAccessToken || metaPageId || metaInstagramBusinessId;
    const hasGoogleCreds = googleRefreshToken || googleCustomerId || googleLoginCustomerId;
    if (hasMetaCreds || hasGoogleCreds) {
      await supabase.from("clinic_api_credentials").insert({
        clinic_id: clinicData.id,
        meta_page_access_token: metaPageAccessToken || null,
        meta_page_id: metaPageId || null,
        meta_instagram_business_id: metaInstagramBusinessId || null,
        google_ads_refresh_token: googleRefreshToken || null,
        google_ads_customer_id: googleCustomerId || null,
        google_ads_login_customer_id: googleLoginCustomerId || null,
      });
    }
    toast.success("Clinic added!");
    setDialogOpen(false);
    resetAddForm();
    fetchClinics();
  };

  const openEditDialog = (clinic: Clinic) => {
    setEditClinic(clinic);
    setEditName(clinic.clinic_name);
    setEditPhone(clinic.phone || "");
    setEditAddress(clinic.address || "");
    setEditOwnerId(clinic.owner_user_id || "none");
    setEditDialogOpen(true);
  };

  const saveEdit = async () => {
    if (!editClinic || !editName.trim()) return;
    const { error } = await supabase.from("clinics").update({
      clinic_name: editName.trim(),
      phone: editPhone || null,
      address: editAddress || null,
      owner_user_id: editOwnerId && editOwnerId !== "none" ? editOwnerId : null,
    }).eq("id", editClinic.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Clinic updated!");
    setEditDialogOpen(false);
    setEditClinic(null);
    fetchClinics();
  };

  const openTeamDialog = (clinic: Clinic) => {
    setTeamDialogClinic(clinic);
    const currentMembers = teamAssignments.filter(a => a.clinic_id === clinic.id).map(a => a.user_id);
    setSelectedMembers(currentMembers);
    setTeamDialogOpen(true);
  };

  const saveTeamAssignments = async () => {
    if (!teamDialogClinic) return;
    const clinicId = teamDialogClinic.id;
    const currentMembers = teamAssignments.filter(a => a.clinic_id === clinicId).map(a => a.user_id);

    const toAdd = selectedMembers.filter(id => !currentMembers.includes(id));
    const toRemove = currentMembers.filter(id => !selectedMembers.includes(id));

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
    toast.success("Team assignments updated");
    setTeamDialogOpen(false);
    fetchTeamAssignments();
  };

  const deleteClinic = async (clinicId: string) => {
    const { error } = await supabase.from("clinics").delete().eq("id", clinicId);
    if (error) { toast.error(error.message); } else {
      toast.success("Clinic deleted");
      setClinics(prev => prev.filter(c => c.id !== clinicId));
    }
  };

  const toggleStatus = async (clinicId: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    const { error } = await supabase.from("clinics").update({ status: newStatus }).eq("id", clinicId);
    if (!error) setClinics(prev => prev.map(c => c.id === clinicId ? { ...c, status: newStatus } : c));
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
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        {/* Hero */}
        <div className="hero-section">
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="h-5 w-5 text-primary" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Manage</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">Clinics</h1>
              <p className="text-muted-foreground mt-0.5 text-xs sm:text-sm">{clinics.length} total clinics registered</p>
            </div>
            {role === "admin" && (
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
                      <p className="text-xs text-muted-foreground">Paste the clinic website, then extract name, phone, address, email, and timezone before saving.</p>
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
                    <Collapsible open={credentialsOpen} onOpenChange={setCredentialsOpen}>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" className="w-full justify-between px-0 hover:bg-transparent">
                          <span className="text-sm font-medium text-muted-foreground">API Credentials (Optional)</span>
                          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${credentialsOpen ? "rotate-180" : ""}`} />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-4 pt-2">
                        <div className="space-y-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Meta / Instagram</p>
                          <div className="space-y-2"><Label className="text-xs">Page Access Token</Label><Input value={metaPageAccessToken} onChange={e => setMetaPageAccessToken(e.target.value)} placeholder="EAAGm..." type="password" className="input-glow" /></div>
                          <div className="space-y-2"><Label className="text-xs">Page ID</Label><Input value={metaPageId} onChange={e => setMetaPageId(e.target.value)} placeholder="123456789" className="input-glow" /></div>
                          <div className="space-y-2"><Label className="text-xs">Instagram Business ID</Label><Input value={metaInstagramBusinessId} onChange={e => setMetaInstagramBusinessId(e.target.value)} placeholder="17841..." className="input-glow" /></div>
                        </div>
                        <div className="space-y-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Google Ads</p>
                          <div className="space-y-2"><Label className="text-xs">Refresh Token</Label><Input value={googleRefreshToken} onChange={e => setGoogleRefreshToken(e.target.value)} placeholder="1//0..." type="password" className="input-glow" /></div>
                          <div className="space-y-2"><Label className="text-xs">Customer ID</Label><Input value={googleCustomerId} onChange={e => setGoogleCustomerId(e.target.value)} placeholder="123-456-7890" className="input-glow" /></div>
                          <div className="space-y-2"><Label className="text-xs">Login Customer ID (MCC)</Label><Input value={googleLoginCustomerId} onChange={e => setGoogleLoginCustomerId(e.target.value)} placeholder="123-456-7890" className="input-glow" /></div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                    <Button onClick={addClinic} className="w-full">Add Clinic</Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
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
                  {role === "admin" && <TableHead>Team Members</TableHead>}
                  {role === "admin" && <TableHead className="hidden lg:table-cell">Client Owner</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Phone</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((clinic) => {
                  const clinicTeam = getClinicTeam(clinic.id);
                  return (
                    <TableRow key={clinic.id}>
                      <TableCell className="font-medium">{clinic.clinic_name}</TableCell>
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
                      <TableCell>
                        <Badge
                          variant={clinic.status === "active" ? "default" : "secondary"}
                          className={`rounded-full text-[11px] ${role === "admin" ? "cursor-pointer" : ""}`}
                          onClick={() => role === "admin" && toggleStatus(clinic.id, clinic.status)}
                        >
                          {clinic.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm hidden sm:table-cell">{clinic.phone || "—"}</TableCell>
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
                            <Button variant="ghost" size="sm" className="h-8 text-destructive hover:text-destructive" onClick={() => deleteClinic(clinic.id)}>
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
          <DialogContent>
            <DialogHeader><DialogTitle>Edit Clinic</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2"><Label>Clinic Name</Label><Input value={editName} onChange={e => setEditName(e.target.value)} className="input-glow" /></div>
              <div className="space-y-2"><Label>Phone</Label><Input value={editPhone} onChange={e => setEditPhone(e.target.value)} className="input-glow" /></div>
              <div className="space-y-2"><Label>Address</Label><Input value={editAddress} onChange={e => setEditAddress(e.target.value)} className="input-glow" /></div>
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
              <Button onClick={saveEdit} className="w-full">Save Changes</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Team Assignment Dialog */}
        <Dialog open={teamDialogOpen} onOpenChange={setTeamDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Assign Team Members</DialogTitle>
              <DialogDescription>
                Select team members to assign to <span className="font-medium text-foreground">{teamDialogClinic?.clinic_name}</span>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1 max-h-[50vh] overflow-y-auto py-2">
              {allStaff.map(member => (
                <label
                  key={member.user_id}
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <Checkbox
                    checked={selectedMembers.includes(member.user_id)}
                    onCheckedChange={() => toggleMember(member.user_id)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{member.full_name}</p>
                    {member.team_role && (
                      <p className="text-xs text-muted-foreground">{member.team_role}</p>
                    )}
                  </div>
                </label>
              ))}
              {allStaff.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No team members available</p>
              )}
            </div>
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
      </div>
    </DashboardLayout>
  );
}
