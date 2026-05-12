import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";
import { toast } from "sonner";
import { Plus, Trash2, UserCheck, Mail, Loader2, Check, ChevronDown, Building2, Activity, UserCircle2, Clock4, Users, Search, Pencil, Handshake } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PartnershipsDialog } from "@/components/clients/PartnershipsDialog";

interface Profile { id: string; full_name: string | null; email: string | null; welcome_email_sent_at: string | null; welcome_email_last_attempt_at: string | null; welcome_email_last_error: string | null; }
interface UserRole { user_id: string; role: string; }
interface ClinicAssignment { user_id: string; clinic_names: string[]; }
interface ClinicOption { id: string; clinic_name: string; owner_user_id: string | null; }
interface ActivityRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  parent_user_id: string | null;
  first_login_at: string | null;
  last_seen_at: string | null;
  login_count: number;
}
type ActivityFilter = "all" | "active" | "never";

const clientSchema = z.object({
  full_name: z.string().trim().min(1, "Full name is required").max(100, "Full name must be less than 100 characters"),
  email: z.string().trim().min(1, "Email is required").email("Invalid email address").max(255, "Email must be less than 255 characters"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128, "Password must be less than 128 characters"),
});

export default function ClientsPage() {
  const { role } = useUserRole();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [assignments, setAssignments] = useState<ClinicAssignment[]>([]);
  const [allClinics, setAllClinics] = useState<ClinicOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [formErrors, setFormErrors] = useState<{ full_name?: string; email?: string; password?: string }>({});
  const [selectedClinicIds, setSelectedClinicIds] = useState<string[]>([]);
  const [clinicPickerOpen, setClinicPickerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const fetchData = async () => {
    const [profilesRes, rolesRes, clinicsRes, activityRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, welcome_email_sent_at, welcome_email_last_attempt_at, welcome_email_last_error"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("clinics").select("id, clinic_name, owner_user_id").order("clinic_name"),
      (supabase as any).rpc("get_client_login_summary"),
    ]);
    const allRoles = rolesRes.data || [];
    const clientUserIds = allRoles.filter(r => r.role === "client").map(r => r.user_id);
    setProfiles((profilesRes.data || []).filter(p => clientUserIds.includes(p.id)));
    setRoles(allRoles);

    const clinics = clinicsRes.data || [];
    setAllClinics(clinics);
    const assignMap = new Map<string, string[]>();
    clinics.forEach(c => {
      if (c.owner_user_id) {
        const existing = assignMap.get(c.owner_user_id) || [];
        existing.push(c.clinic_name);
        assignMap.set(c.owner_user_id, existing);
      }
    });
    setAssignments(Array.from(assignMap.entries()).map(([user_id, clinic_names]) => ({ user_id, clinic_names })));
    setActivity((activityRes.data as ActivityRow[] | null) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (role !== "admin") return;
    fetchData();
  }, [role]);

  const getAssignedClinics = (userId: string) => assignments.find(a => a.user_id === userId)?.clinic_names || [];

  // Activity helpers (admin-only metrics on the Clients page)
  const activityByUser = new Map(activity.map(a => [a.user_id, a]));
  const subAccountsByParent = new Map<string, ActivityRow[]>();
  for (const a of activity) {
    if (a.role === "sub_client" && a.parent_user_id) {
      const arr = subAccountsByParent.get(a.parent_user_id) || [];
      arr.push(a);
      subAccountsByParent.set(a.parent_user_id, arr);
    }
  }
  const clientRows = activity.filter(a => a.role === "client");
  const totalClients = clientRows.length;
  const everLoggedIn = clientRows.filter(a => !!a.last_seen_at).length;
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const activeLast30 = clientRows.filter(a => a.last_seen_at && new Date(a.last_seen_at).getTime() >= thirtyDaysAgo).length;

  const formatLastSeen = (iso: string | null) => {
    if (!iso) return null;
    try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); } catch { return null; }
  };

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", email: "" });
  const [editErrors, setEditErrors] = useState<{ full_name?: string; email?: string }>({});
  const [savingEdit, setSavingEdit] = useState(false);

  const openEdit = (p: Profile) => {
    setEditTarget(p);
    setEditForm({ full_name: p.full_name || "", email: p.email || "" });
    setEditErrors({});
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    const schema = z.object({
      full_name: z.string().trim().min(1, "Full name is required").max(100),
      email: z.string().trim().email("Invalid email address").max(255),
    });
    const parsed = schema.safeParse(editForm);
    if (!parsed.success) {
      const errs: { full_name?: string; email?: string } = {};
      for (const i of parsed.error.issues) {
        const k = i.path[0] as "full_name" | "email";
        if (k && !errs[k]) errs[k] = i.message;
      }
      setEditErrors(errs);
      return;
    }
    setSavingEdit(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: parsed.data.full_name, email: parsed.data.email })
      .eq("id", editTarget.id);
    setSavingEdit(false);
    if (error) { toast.error(error.message || "Failed to update client"); return; }
    toast.success("Client updated");
    setProfiles((prev) => prev.map((x) => x.id === editTarget.id ? { ...x, full_name: parsed.data.full_name, email: parsed.data.email } : x));
    setEditTarget(null);
  };

  const handleResendWelcome = async (userId: string, name: string) => {
    setResendingId(userId);
    const { data, error } = await supabase.functions.invoke("resend-welcome-email", { body: { user_id: userId } });
    setResendingId(null);
    const attemptedAt = (data as any)?.welcome_email_last_attempt_at as string | undefined;
    if (error || data?.error) {
      const msg = await extractEdgeFunctionError(error, data, "Failed to send welcome email");
      toast.error(msg);
      const at = attemptedAt || new Date().toISOString();
      setProfiles((prev) => prev.map((p) => (p.id === userId ? { ...p, welcome_email_last_attempt_at: at, welcome_email_last_error: msg } : p)));
      return;
    }
    const sentAt = (data as any)?.welcome_email_sent_at as string | undefined;
    toast.success(`Welcome email sent to ${name}${sentAt ? ` at ${new Date(sentAt).toLocaleString()}` : ""}`);
    if (sentAt) {
      setProfiles((prev) => prev.map((p) => (p.id === userId ? { ...p, welcome_email_sent_at: sentAt, welcome_email_last_attempt_at: sentAt, welcome_email_last_error: null } : p)));
    } else {
      await fetchData();
    }
  };

  const formatSentAt = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { data, error } = await supabase.functions.invoke("delete-user", {
      body: { user_id: deleteTarget.id },
    });
    if (error || data?.error) { toast.error(await extractEdgeFunctionError(error, data, "Failed to delete user")); setDeleteTarget(null); return; }
    toast.success(`"${deleteTarget.name}" removed`);
    setDeleteTarget(null);
    await fetchData();
  };

  return (
    <>
      <div className="space-y-6">
        <div className="hero-section">
          <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <UserCheck className="h-5 w-5 text-primary" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Manage</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">Clients</h1>
              <p className="text-muted-foreground mt-0.5 text-xs sm:text-sm">Manage your clinic clients</p>
            </div>
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setFormErrors({}); setSelectedClinicIds([]); } }}>
              <DialogTrigger asChild>
                <Button className="rounded-lg shadow-sm w-full sm:w-auto"><Plus className="h-4 w-4 mr-2" />Add Client</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Client</DialogTitle>
                  <DialogDescription>Create a new client account.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input value={form.full_name} onChange={e => { setForm(f => ({ ...f, full_name: e.target.value })); if (formErrors.full_name) setFormErrors(p => ({ ...p, full_name: undefined })); }} placeholder="Jane Doe" className="input-glow" aria-invalid={!!formErrors.full_name} />
                    {formErrors.full_name && <p className="text-xs text-destructive">{formErrors.full_name}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" autoComplete="email" value={form.email} onChange={e => { setForm(f => ({ ...f, email: e.target.value })); if (formErrors.email) setFormErrors(p => ({ ...p, email: undefined })); }} onBlur={() => {
                      const r = clientSchema.shape.email.safeParse(form.email);
                      setFormErrors(p => ({ ...p, email: r.success ? undefined : r.error.issues[0]?.message }));
                    }} placeholder="jane@example.com" className="input-glow" aria-invalid={!!formErrors.email} />
                    {formErrors.email && <p className="text-xs text-destructive">{formErrors.email}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <Input type="password" value={form.password} onChange={e => { setForm(f => ({ ...f, password: e.target.value })); if (formErrors.password) setFormErrors(p => ({ ...p, password: undefined })); }} placeholder="Min 8 characters" className="input-glow" aria-invalid={!!formErrors.password} />
                    {formErrors.password && <p className="text-xs text-destructive">{formErrors.password}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Assign Clinics <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Popover open={clinicPickerOpen} onOpenChange={setClinicPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
                          <span className="flex items-center gap-2 truncate">
                            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                            {selectedClinicIds.length === 0
                              ? <span className="text-muted-foreground">Select clinics to assign…</span>
                              : <span className="truncate">{selectedClinicIds.length} clinic{selectedClinicIds.length === 1 ? "" : "s"} selected</span>}
                          </span>
                          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search clinics…" />
                          <CommandList>
                            <CommandEmpty>No clinics found.</CommandEmpty>
                            <CommandGroup>
                              <ScrollArea className="max-h-64">
                                {allClinics.map((c) => {
                                  const checked = selectedClinicIds.includes(c.id);
                                  const ownedByOther = !!c.owner_user_id;
                                  return (
                                    <CommandItem
                                      key={c.id}
                                      value={c.clinic_name}
                                      onSelect={() => {
                                        setSelectedClinicIds((prev) => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id]);
                                      }}
                                      className="flex items-center gap-2"
                                    >
                                      <div className={cn("flex h-4 w-4 items-center justify-center rounded border border-primary/40", checked && "bg-primary text-primary-foreground")}>
                                        {checked && <Check className="h-3 w-3" />}
                                      </div>
                                      <span className="flex-1 truncate">{c.clinic_name}</span>
                                      {ownedByOther && <Badge variant="outline" className="text-[10px] rounded-full">Assigned</Badge>}
                                    </CommandItem>
                                  );
                                })}
                              </ScrollArea>
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {selectedClinicIds.some(id => allClinics.find(c => c.id === id)?.owner_user_id) && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">Some selected clinics already have an owner. Saving will reassign them to this new client.</p>
                    )}
                  </div>
                </div>
                <DialogFooter className="flex-col gap-2 sm:flex-row">
                  <Button className="w-full sm:w-auto" disabled={creating} onClick={async () => {
                    const parsed = clientSchema.safeParse(form);
                    if (!parsed.success) {
                      const errs: { full_name?: string; email?: string; password?: string } = {};
                      for (const issue of parsed.error.issues) {
                        const key = issue.path[0] as "full_name" | "email" | "password";
                        if (key && !errs[key]) errs[key] = issue.message;
                      }
                      setFormErrors(errs);
                      toast.error(parsed.error.issues[0]?.message || "Please fix the highlighted fields");
                      return;
                    }
                    setFormErrors({});
                    setCreating(true);
                    const { data, error } = await supabase.functions.invoke("create-team-member", { body: { ...parsed.data, role: "client" } });
                    if (error || data?.error) { setCreating(false); toast.error(await extractEdgeFunctionError(error, data, "Failed to create client")); return; }
                    const newUserId = (data as any)?.id as string | undefined;
                    if (newUserId && selectedClinicIds.length > 0) {
                      const { error: assignErr } = await supabase
                        .from("clinics")
                        .update({ owner_user_id: newUserId })
                        .in("id", selectedClinicIds);
                      if (assignErr) {
                        toast.warning(`Client created, but assigning clinics failed: ${assignErr.message}`);
                      } else {
                        toast.success(`Client created and assigned to ${selectedClinicIds.length} clinic${selectedClinicIds.length === 1 ? "" : "s"}`);
                      }
                    } else {
                      toast.success("Client created");
                    }
                    setCreating(false);
                    setForm({ full_name: "", email: "", password: "" });
                    setSelectedClinicIds([]);
                    setDialogOpen(false);
                    await fetchData();
                  }}>
                    {creating ? "Creating…" : "Create Client"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>


        {!loading && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="border-border/60">
              <CardContent className="flex items-center gap-3 py-4">
                <div className="rounded-lg bg-primary/10 p-2"><UserCircle2 className="h-4 w-4 text-primary" /></div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Total clients</p>
                  <p className="text-xl font-semibold text-foreground">{totalClients}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardContent className="flex items-center gap-3 py-4">
                <div className="rounded-lg bg-emerald-500/10 p-2"><Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /></div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Logged in ever</p>
                  <p className="text-xl font-semibold text-foreground">{everLoggedIn}<span className="text-sm font-normal text-muted-foreground"> / {totalClients}</span></p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardContent className="flex items-center gap-3 py-4">
                <div className="rounded-lg bg-amber-500/10 p-2"><Clock4 className="h-4 w-4 text-amber-600 dark:text-amber-400" /></div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Active last 30 days</p>
                  <p className="text-xl font-semibold text-foreground">{activeLast30}<span className="text-sm font-normal text-muted-foreground"> / {totalClients}</span></p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {!loading && profiles.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Filter</span>
            {(["all", "active", "never"] as ActivityFilter[]).map((f) => (
              <Button
                key={f}
                variant={activityFilter === f ? "default" : "outline"}
                size="sm"
                className="h-7 rounded-full px-3 text-xs"
                onClick={() => setActivityFilter(f)}
              >
                {f === "all" ? "All" : f === "active" ? "Active 30d" : "Never logged in"}
              </Button>
            ))}
            <div className="relative ml-auto w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or email..."
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>
        )}

        {loading ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <div className="inline-flex items-center gap-2">
              <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Loading clients...
            </div>
          </CardContent></Card>
        ) : profiles.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <UserCheck className="h-5 w-5 text-muted-foreground" />
            </div>
            <p>No clients found.</p>
          </CardContent></Card>
        ) : (
          <>
            {/* Mobile (<sm): card list */}
            <div className="grid gap-3 sm:hidden">
              {profiles
                .filter((p) => {
                  const a = activityByUser.get(p.id);
                  if (activityFilter === "never" && a?.last_seen_at) return false;
                  if (activityFilter === "active" && !(a?.last_seen_at && new Date(a.last_seen_at).getTime() >= thirtyDaysAgo)) return false;
                  const q = searchQuery.trim().toLowerCase();
                  if (!q) return true;
                  return (p.full_name || "").toLowerCase().includes(q) || (p.email || "").toLowerCase().includes(q);
                })
                .map((p) => {
                  const assignedClinics = getAssignedClinics(p.id);
                  const a = activityByUser.get(p.id);
                  const subs = subAccountsByParent.get(p.id) || [];
                  const lastSeen = a?.last_seen_at;
                  const seenLabel = formatLastSeen(lastSeen ?? null);
                  const sentAt = p.welcome_email_sent_at;
                  const attemptAt = p.welcome_email_last_attempt_at;
                  const lastErr = p.welcome_email_last_error;
                  const failedLatest = !!lastErr && (!sentAt || (attemptAt && new Date(attemptAt) > new Date(sentAt)));
                  return (
                    <Card key={p.id} className="border-border/60">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{p.full_name || "—"}</p>
                            <p className="text-xs text-muted-foreground truncate">{p.email || "—"}</p>
                          </div>
                          {lastSeen ? (
                            <Badge variant="secondary" className="text-[10px] rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 shrink-0">
                              {seenLabel}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] rounded-full text-muted-foreground shrink-0">Never</Badge>
                          )}
                        </div>

                        {assignedClinics.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {assignedClinics.map((name, i) => (
                              <Badge key={i} variant="secondary" className="text-[10px] rounded-full">{name}</Badge>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40">
                          <div className="text-[10px] text-muted-foreground">
                            {failedLatest ? (
                              <span className="text-destructive">Welcome: failed</span>
                            ) : sentAt ? (
                              <span>Welcome: sent {formatSentAt(sentAt)}</span>
                            ) : (
                              <span>Welcome: never sent</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button asChild variant="ghost" size="sm" className="h-8 px-2">
                              <Link to={`/sub-accounts?parent=${p.id}`} aria-label="Manage sub-accounts">
                                <Users className="h-3.5 w-3.5" />
                                {subs.length > 0 && <span className="ml-1 text-[11px]">{subs.length}</span>}
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2"
                              onClick={() => openEdit(p)}
                              aria-label="Edit client"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2"
                              disabled={resendingId === p.id}
                              onClick={() => handleResendWelcome(p.id, p.full_name || "client")}
                              aria-label="Resend welcome email"
                            >
                              {resendingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget({ id: p.id, name: p.full_name || "User" })}
                              aria-label="Delete client"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>

            {/* Tablet/Desktop (>=sm): table with horizontal scroll if needed */}
            <Card className="hidden sm:block overflow-hidden border-border/60">
              <div className="w-full overflow-x-auto">
                <Table className="data-table min-w-[760px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden md:table-cell">Email</TableHead>
                      <TableHead>Clinics</TableHead>
                      <TableHead className="hidden lg:table-cell">Last seen</TableHead>
                      <TableHead className="hidden lg:table-cell">Welcome</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profiles
                      .filter((p) => {
                        const a = activityByUser.get(p.id);
                        if (activityFilter === "never" && a?.last_seen_at) return false;
                        if (activityFilter === "active" && !(a?.last_seen_at && new Date(a.last_seen_at).getTime() >= thirtyDaysAgo)) return false;
                        const q = searchQuery.trim().toLowerCase();
                        if (!q) return true;
                        return (p.full_name || "").toLowerCase().includes(q) || (p.email || "").toLowerCase().includes(q);
                      })
                      .map((p) => {
                      const assignedClinics = getAssignedClinics(p.id);
                      const a = activityByUser.get(p.id);
                      const subs = subAccountsByParent.get(p.id) || [];
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium align-top">
                            <div className="space-y-0.5">
                              <div className="truncate max-w-[180px]">{p.full_name || "—"}</div>
                              <div className="md:hidden text-[11px] text-muted-foreground truncate max-w-[180px]">{p.email || "—"}</div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground align-top">
                            <span className="truncate max-w-[220px] inline-block align-bottom">{p.email || "—"}</span>
                          </TableCell>
                          <TableCell className="align-top">
                            {assignedClinics.length > 0 ? (
                              <div className="flex flex-wrap gap-1 max-w-[220px]">
                                {assignedClinics.map((name, i) => (<Badge key={i} variant="secondary" className="text-[11px] rounded-full">{name}</Badge>))}
                              </div>
                            ) : (<span className="text-muted-foreground text-xs italic">None</span>)}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell align-top">
                            {(() => {
                              const lastSeen = a?.last_seen_at;
                              const seenLabel = formatLastSeen(lastSeen ?? null);
                              const badge = lastSeen
                                ? (
                                  <Badge variant="secondary" className="text-[11px] rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20">
                                    {seenLabel}
                                  </Badge>
                                )
                                : (
                                  <Badge variant="outline" className="text-[11px] rounded-full text-muted-foreground">Never</Badge>
                                );
                              const tooltipBody = (
                                <div className="space-y-1 text-xs">
                                  <div>
                                    {lastSeen ? `Last seen ${new Date(lastSeen).toLocaleString()}` : "Has not logged into the portal yet"}
                                  </div>
                                  {a?.first_login_at && (
                                    <div className="text-muted-foreground">First login {new Date(a.first_login_at).toLocaleDateString()}</div>
                                  )}
                                  {typeof a?.login_count === "number" && a.login_count > 0 && (
                                    <div className="text-muted-foreground">Total sessions: {a.login_count}</div>
                                  )}
                                  {subs.length > 0 && (
                                    <div className="pt-1 mt-1 border-t border-border/40">
                                      <div className="font-medium text-foreground">Sub-accounts ({subs.length})</div>
                                      {subs.map(s => (
                                        <div key={s.user_id} className="flex justify-between gap-3">
                                          <span className="truncate">{s.full_name || s.email || "—"}</span>
                                          <span className="text-muted-foreground">{s.last_seen_at ? formatLastSeen(s.last_seen_at) : "Never"}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                              return (
                                <TooltipProvider delayDuration={200}>
                                  <Tooltip>
                                    <TooltipTrigger asChild><span>{badge}</span></TooltipTrigger>
                                    <TooltipContent side="right" className="max-w-xs">{tooltipBody}</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell align-top">
                            {(() => {
                              const sentAt = p.welcome_email_sent_at;
                              const attemptAt = p.welcome_email_last_attempt_at;
                              const lastErr = p.welcome_email_last_error;
                              const failedLatest = !!lastErr && (!sentAt || (attemptAt && new Date(attemptAt) > new Date(sentAt)));
                              if (failedLatest) {
                                return (
                                  <TooltipProvider delayDuration={200}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge variant="secondary" className="text-[11px] rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20">
                                          Failed{attemptAt ? ` · ${formatSentAt(attemptAt)}` : ""}
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent side="right">
                                        {lastErr}
                                        {attemptAt ? ` (${new Date(attemptAt).toLocaleString()})` : ""}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              }
                              if (sentAt) {
                                return (
                                  <TooltipProvider delayDuration={200}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge variant="secondary" className="text-[11px] rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20">
                                          Sent · {formatSentAt(sentAt)}
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent side="right">{new Date(sentAt).toLocaleString()}</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              }
                              return <Badge variant="outline" className="text-[11px] rounded-full text-muted-foreground">Never sent</Badge>;
                            })()}
                          </TableCell>
                          <TableCell className="text-right align-top whitespace-nowrap">
                            <div className="inline-flex items-center gap-0.5">
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button asChild variant="ghost" size="sm" className="h-8 px-2">
                                      <Link to={`/sub-accounts?parent=${p.id}`}>
                                        <Users className="h-3.5 w-3.5" />
                                        {subs.length > 0 && (
                                          <span className="ml-1 text-[11px] text-muted-foreground">{subs.length}</span>
                                        )}
                                      </Link>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="left">Manage sub-accounts</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => openEdit(p)}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="left">Edit client</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 px-2"
                                      disabled={resendingId === p.id}
                                      onClick={() => handleResendWelcome(p.id, p.full_name || "client")}
                                    >
                                      {resendingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="left">Resend welcome email</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <Button variant="ghost" size="sm" className="h-8 px-2 text-destructive hover:text-destructive" onClick={() => setDeleteTarget({ id: p.id, name: p.full_name || "User" })}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </>
        )}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove client?</AlertDialogTitle>
            <AlertDialogDescription>Remove "{deleteTarget?.name}"? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
            <DialogDescription>Update the client's display name and email shown in the portal.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input
                value={editForm.full_name}
                onChange={(e) => { setEditForm((f) => ({ ...f, full_name: e.target.value })); if (editErrors.full_name) setEditErrors((p) => ({ ...p, full_name: undefined })); }}
                aria-invalid={!!editErrors.full_name}
              />
              {editErrors.full_name && <p className="text-xs text-destructive">{editErrors.full_name}</p>}
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => { setEditForm((f) => ({ ...f, email: e.target.value })); if (editErrors.email) setEditErrors((p) => ({ ...p, email: undefined })); }}
                aria-invalid={!!editErrors.email}
              />
              {editErrors.email && <p className="text-xs text-destructive">{editErrors.email}</p>}
              <p className="text-[11px] text-muted-foreground">Note: this updates the displayed email. The login email is unchanged.</p>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setEditTarget(null)} disabled={savingEdit}>Cancel</Button>
            <Button className="w-full sm:w-auto" onClick={saveEdit} disabled={savingEdit}>
              {savingEdit ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
