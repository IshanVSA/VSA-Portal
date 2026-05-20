import { useEffect, useRef, useState } from "react";
import { Navigate, useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, Trash2, Pencil, Eye, EyeOff, DollarSign, Mail, Building2, ArrowLeft, UserCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ClinicLite { id: string; clinic_name: string; owner_user_id?: string | null; }
interface ClientLite { id: string; full_name: string | null; email: string | null; }
interface SubAccount {
  id: string;
  sub_user_id: string;
  parent_user_id: string;
  hide_financials: boolean;
  created_at: string;
  full_name?: string | null;
  email?: string | null;
  clinic_ids: string[];
}

export default function SubAccounts() {
  const { user } = useAuth();
  const { role, isSubAccount, isLoading: roleLoading } = useUserRole();
  const [searchParams] = useSearchParams();
  const isAdmin = role === "admin";
  // Admins can scope the page to a single parent client via ?parent=<uuid>
  const parentFilter = isAdmin ? searchParams.get("parent") : null;

  if (isSubAccount) return <Navigate to="/dashboard" replace />;

  const [allClinics, setAllClinics] = useState<ClinicLite[]>([]);
  const [clients, setClients] = useState<ClientLite[]>([]); // admin-only
  const [subs, setSubs] = useState<SubAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<SubAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SubAccount | null>(null);
  const [busy, setBusy] = useState(false);

  // Form
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [hideFin, setHideFin] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [parentUserId, setParentUserId] = useState<string>(""); // admin-only

  const resetForm = () => {
    setFullName(""); setEmail(""); setPassword(""); setHideFin(false); setPicked(new Set());
    setParentUserId(parentFilter ?? "");
  };

  const loadSeq = useRef(0);
  const load = async () => {
    if (!user) return;
    const mySeq = ++loadSeq.current;
    setLoading(true);

    if (isAdmin) {
      // Admin: load all clinics, all clients, all sub-accounts (optionally scoped to a parent)
      const [{ data: clinicRows }, { data: clientRoles }, { data: profRows }, allSubRowsRes] = await Promise.all([
        supabase.from("clinics").select("id, clinic_name, owner_user_id").order("clinic_name"),
        supabase.from("user_roles").select("user_id").eq("role", "client"),
        supabase.from("profiles").select("id, full_name, email"),
        (supabase.from("client_sub_accounts" as any)
          .select("id, sub_user_id, parent_user_id, hide_financials, created_at")
          .order("created_at", { ascending: false }) as any),
      ]);
      if (mySeq !== loadSeq.current) return;
      const clinicsAll = clinicRows ?? [];
      setAllClinics(clinicsAll);

      const clientIds = new Set((clientRoles ?? []).map((r: any) => r.user_id));
      const profsAll = (profRows ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>;
      const profMapAll = new Map(profsAll.map(p => [p.id, p]));
      setClients(profsAll.filter(p => clientIds.has(p.id)));

      const allSubBase = ((allSubRowsRes as any).data ?? []) as Array<{ id: string; sub_user_id: string; parent_user_id: string; hide_financials: boolean; created_at: string }>;
      if (allSubBase.length === 0) { setSubs([]); setLoading(false); return; }

      // Fetch ALL clinic assignments so we can match by clinic ownership too
      const allSubIds = allSubBase.map(s => s.id);
      const { data: allAssigns } = await (supabase.from("sub_account_clinics" as any)
        .select("sub_account_id, clinic_id").in("sub_account_id", allSubIds) as any);
      if (mySeq !== loadSeq.current) return;
      const assignMap = new Map<string, string[]>();
      (allAssigns ?? []).forEach((a: any) => {
        const arr = assignMap.get(a.sub_account_id) || [];
        arr.push(a.clinic_id); assignMap.set(a.sub_account_id, arr);
      });

      // Filter sub-accounts: include if parent_user_id matches OR any assigned clinic is owned by parentFilter
      let subBase = allSubBase;
      if (parentFilter) {
        const ownedClinicIds = new Set(clinicsAll.filter(c => c.owner_user_id === parentFilter).map(c => c.id));
        subBase = allSubBase.filter(s => {
          if (s.parent_user_id === parentFilter) return true;
          const cids = assignMap.get(s.id) ?? [];
          return cids.some(id => ownedClinicIds.has(id));
        });
      }

      setSubs(subBase.map(s => ({
        ...s,
        full_name: profMapAll.get(s.sub_user_id)?.full_name ?? null,
        email: profMapAll.get(s.sub_user_id)?.email ?? null,
        clinic_ids: assignMap.get(s.id) ?? [],
      })));
      setLoading(false);
      return;
    }

    // Client: original scoped view
    const [{ data: clinicRows }, { data: subRows }] = await Promise.all([
      supabase.from("clinics").select("id, clinic_name").eq("owner_user_id", user.id).order("clinic_name"),
      (supabase.from("client_sub_accounts" as any)
        .select("id, sub_user_id, parent_user_id, hide_financials, created_at")
        .eq("parent_user_id", user.id)
        .order("created_at", { ascending: false }) as any),
    ]);
    if (mySeq !== loadSeq.current) return;
    setAllClinics(clinicRows ?? []);

    const subBase = (subRows ?? []) as Array<{ id: string; sub_user_id: string; parent_user_id: string; hide_financials: boolean; created_at: string }>;
    if (subBase.length === 0) { setSubs([]); setLoading(false); return; }
    const userIds = subBase.map(s => s.sub_user_id);
    const subIds = subBase.map(s => s.id);

    const [{ data: profs }, { data: assigns }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email").in("id", userIds),
      (supabase.from("sub_account_clinics" as any)
        .select("sub_account_id, clinic_id")
        .in("sub_account_id", subIds) as any),
    ]);
    if (mySeq !== loadSeq.current) return;

    const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
    const assignMap = new Map<string, string[]>();
    (assigns ?? []).forEach((a: any) => {
      const arr = assignMap.get(a.sub_account_id) || [];
      arr.push(a.clinic_id);
      assignMap.set(a.sub_account_id, arr);
    });

    setSubs(subBase.map(s => ({
      ...s,
      full_name: profMap.get(s.sub_user_id)?.full_name ?? null,
      email: profMap.get(s.sub_user_id)?.email ?? null,
      clinic_ids: assignMap.get(s.id) ?? [],
    })));
    setLoading(false);
  };

  useEffect(() => { if (!roleLoading) load(); /* eslint-disable-next-line */ }, [user?.id, isAdmin, parentFilter, roleLoading]);

  const togglePick = (id: string) => {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Clinics shown in the create form. For admins, filter to those owned by the
  // selected parent client (admin must pick the parent first).
  const formClinics: ClinicLite[] = (() => {
    if (!isAdmin) return allClinics;
    if (!parentUserId) return [];
    return allClinics.filter(c => c.owner_user_id === parentUserId);
  })();

  const submitCreate = async () => {
    if (!fullName.trim() || !email.trim() || password.length < 8) {
      toast({ title: "Missing fields", description: "Full name, email, and password (min 8 chars) are required.", variant: "destructive" });
      return;
    }
    if (isAdmin && !parentUserId) {
      toast({ title: "Pick a client", description: "Choose which client this sub-account belongs to.", variant: "destructive" });
      return;
    }
    if (picked.size === 0) {
      toast({ title: "No clinics", description: "Assign at least one clinic.", variant: "destructive" });
      return;
    }
    setCreating(true);
    const body: Record<string, unknown> = {
      full_name: fullName.trim(), email: email.trim(), password,
      hide_financials: hideFin, clinic_ids: Array.from(picked),
    };
    if (isAdmin) body.parent_user_id = parentUserId;
    const { data, error } = await supabase.functions.invoke("create-sub-account", { body });
    setCreating(false);
    if (error || (data as any)?.error) {
      toast({ title: "Failed to create", description: (data as any)?.error || error?.message || "Unknown error", variant: "destructive" });
      return;
    }
    toast({ title: "Sub-account created", description: `${fullName} can now sign in.` });
    setOpenCreate(false); resetForm(); load();
  };

  const openEdit = (s: SubAccount) => {
    setEditTarget(s);
    setHideFin(s.hide_financials);
    setPicked(new Set(s.clinic_ids));
    if (isAdmin) setParentUserId(s.parent_user_id);
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    if (picked.size === 0) {
      toast({ title: "No clinics", description: "Assign at least one clinic.", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("update-sub-account", {
      body: { sub_account_id: editTarget.id, hide_financials: hideFin, clinic_ids: Array.from(picked) },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast({ title: "Failed to update", description: (data as any)?.error || error?.message, variant: "destructive" });
      return;
    }
    toast({ title: "Updated" });
    setEditTarget(null); resetForm(); load();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("delete-sub-account", {
      body: { sub_account_id: deleteTarget.id },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast({ title: "Failed to delete", description: (data as any)?.error || error?.message, variant: "destructive" });
      return;
    }
    toast({ title: "Sub-account deleted" });
    setDeleteTarget(null); load();
  };

  const clinicName = (id: string) => allClinics.find(c => c.id === id)?.clinic_name || "Unknown";
  const clientName = (id: string) => {
    const c = clients.find(x => x.id === id);
    return c?.full_name || c?.email || "Unknown client";
  };

  // For edit dialog, scope clinic picker to that sub-account's parent (admins).
  const editFormClinics: ClinicLite[] = (() => {
    if (!isAdmin || !editTarget) return allClinics;
    return allClinics.filter(c => c.owner_user_id === editTarget.parent_user_id);
  })();

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          {isAdmin && parentFilter && (
            <Link to="/clients" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2">
              <ArrowLeft className="h-3 w-3" /> Back to Clients
            </Link>
          )}
          <h1 className="text-[28px] sm:text-[34px] font-bold tracking-tight leading-tight">
            {isAdmin && parentFilter ? `Sub Accounts · ${clientName(parentFilter)}` : "Sub Accounts"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isAdmin
              ? "Create and manage sub-account logins on behalf of any client."
              : "Create logins for your team. Choose which clinics they can access and whether to hide financial data."}
          </p>
        </div>
        <Button onClick={() => { resetForm(); setOpenCreate(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Add Sub-Account
        </Button>
      </motion.div>

      {loading ? (
        <Card className="glass-card"><CardContent className="py-10 text-center text-sm text-muted-foreground">Loading…</CardContent></Card>
      ) : subs.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-16 text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center"><Mail className="h-6 w-6 text-muted-foreground" /></div>
            <div className="text-sm text-muted-foreground">No sub-accounts yet. Create one to give an employee access to selected clinics.</div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {subs.map((s, i) => (
            <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Card className="glass-card">
                <CardHeader className="pb-3 flex flex-row items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <CardTitle className="text-base truncate">{s.full_name || "(no name)"}</CardTitle>
                    <div className="text-xs text-muted-foreground truncate">{s.email}</div>
                    {isAdmin && (
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
                        <UserCircle2 className="h-3 w-3" /> Parent: {clientName(s.parent_user_id)}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {s.hide_financials ? (
                      <Badge variant="secondary" className="gap-1"><EyeOff className="h-3 w-3" /> Financials hidden</Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1"><Eye className="h-3 w-3" /> Full access</Badge>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(s)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Assigned clinics</div>
                  <div className="flex flex-wrap gap-1.5">
                    {s.clinic_ids.length === 0 && <span className="text-xs text-muted-foreground italic">No clinics assigned</span>}
                    {s.clinic_ids.map(id => (
                      <Badge key={id} variant="outline" className="gap-1"><Building2 className="h-3 w-3" />{clinicName(id)}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={openCreate} onOpenChange={(o) => { if (!o && !creating) { setOpenCreate(false); resetForm(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add sub-account</DialogTitle>
            <DialogDescription>The new user will be able to log in with this email and password.</DialogDescription>
          </DialogHeader>
          {isAdmin && (
            <div className="grid gap-2 mb-2">
              <Label>Parent client</Label>
              <Select value={parentUserId} onValueChange={(v) => { setParentUserId(v); setPicked(new Set()); }} disabled={!!parentFilter}>
                <SelectTrigger><SelectValue placeholder="Choose the client who owns this sub-account" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.full_name || c.email || c.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {parentUserId && formClinics.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">This client doesn't own any clinics yet.</p>
              )}
            </div>
          )}
          <SubAccountForm
            mode="create"
            fullName={fullName} setFullName={setFullName}
            email={email} setEmail={setEmail}
            password={password} setPassword={setPassword}
            hideFin={hideFin} setHideFin={setHideFin}
            clinics={formClinics} picked={picked} togglePick={togglePick}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setOpenCreate(false); resetForm(); }} disabled={creating}>Cancel</Button>
            <Button onClick={submitCreate} disabled={creating}>{creating ? "Creating…" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o && !busy) { setEditTarget(null); resetForm(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit sub-account</DialogTitle>
            <DialogDescription>{editTarget?.full_name} · {editTarget?.email}</DialogDescription>
          </DialogHeader>
          <SubAccountForm
            mode="edit"
            fullName="" setFullName={() => {}}
            email="" setEmail={() => {}}
            password="" setPassword={() => {}}
            hideFin={hideFin} setHideFin={setHideFin}
            clinics={editFormClinics} picked={picked} togglePick={togglePick}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setEditTarget(null); resetForm(); }} disabled={busy}>Cancel</Button>
            <Button onClick={submitEdit} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o && !busy) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sub-account?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  <span className="font-medium text-foreground">{deleteTarget?.full_name || deleteTarget?.email}</span>{" "}
                  will lose access immediately. This cannot be undone.
                </p>
                {isAdmin && deleteTarget && (
                  <div className="rounded-md border border-border/60 bg-muted/40 p-2 text-xs">
                    <div><span className="text-muted-foreground">Parent client:</span> <span className="font-medium text-foreground">{clientName(deleteTarget.parent_user_id)}</span></div>
                    <div><span className="text-muted-foreground">Email:</span> {deleteTarget.email || "—"}</div>
                    <div><span className="text-muted-foreground">Assigned clinics:</span> {deleteTarget.clinic_ids.length}</div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  The parent client account is not affected — only this sub-account login is removed.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={busy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {busy ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SubAccountForm(props: {
  mode: "create" | "edit";
  fullName: string; setFullName: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  hideFin: boolean; setHideFin: (v: boolean) => void;
  clinics: ClinicLite[]; picked: Set<string>; togglePick: (id: string) => void;
}) {
  const { mode, fullName, setFullName, email, setEmail, password, setPassword, hideFin, setHideFin, clinics, picked, togglePick } = props;
  return (
    <div className="space-y-4">
      {mode === "create" && (
        <>
          <div className="grid gap-2">
            <Label htmlFor="fn">Full name</Label>
            <Input id="fn" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="em">Email</Label>
            <Input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@clinic.com" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pw">Password (min 8 characters)</Label>
            <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </>
      )}

      <div className="rounded-lg border p-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="text-sm font-medium flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5" /> Hide financial data</div>
            <div className="text-xs text-muted-foreground">Hides Ad Spend, CPC, cost columns and budgets across the app.</div>
          </div>
          <Switch checked={hideFin} onCheckedChange={setHideFin} />
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Clinics this user can access</Label>
        <ScrollArea className="h-48 rounded-lg border">
          <div className="p-2 space-y-1">
            {clinics.length === 0 && <div className="text-xs text-muted-foreground p-2">No clinics available.</div>}
            {clinics.map(c => (
              <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer">
                <Checkbox checked={picked.has(c.id)} onCheckedChange={() => togglePick(c.id)} />
                <span className="text-sm">{c.clinic_name}</span>
              </label>
            ))}
          </div>
        </ScrollArea>
        <div className="text-xs text-muted-foreground">{picked.size} selected</div>
      </div>
    </div>
  );
}
