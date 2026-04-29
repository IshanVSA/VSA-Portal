import { useEffect, useState } from "react";
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
import { Plus, Trash2, UserCheck, Mail, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface Profile { id: string; full_name: string | null; email: string | null; welcome_email_sent_at: string | null; welcome_email_last_attempt_at: string | null; welcome_email_last_error: string | null; }
interface UserRole { user_id: string; role: string; }
interface ClinicAssignment { user_id: string; clinic_names: string[]; }

export default function ClientsPage() {
  const { role } = useUserRole();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [assignments, setAssignments] = useState<ClinicAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [creating, setCreating] = useState(false);

  const fetchData = async () => {
    const [profilesRes, rolesRes, clinicsRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, welcome_email_sent_at, welcome_email_last_attempt_at, welcome_email_last_error"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("clinics").select("owner_user_id, clinic_name"),
    ]);
    const allRoles = rolesRes.data || [];
    const clientUserIds = allRoles.filter(r => r.role === "client").map(r => r.user_id);
    setProfiles((profilesRes.data || []).filter(p => clientUserIds.includes(p.id)));
    setRoles(allRoles);

    const clinics = clinicsRes.data || [];
    const assignMap = new Map<string, string[]>();
    clinics.forEach(c => {
      if (c.owner_user_id) {
        const existing = assignMap.get(c.owner_user_id) || [];
        existing.push(c.clinic_name);
        assignMap.set(c.owner_user_id, existing);
      }
    });
    setAssignments(Array.from(assignMap.entries()).map(([user_id, clinic_names]) => ({ user_id, clinic_names })));
    setLoading(false);
  };

  useEffect(() => {
    if (role !== "admin") return;
    fetchData();
  }, [role]);

  const getAssignedClinics = (userId: string) => assignments.find(a => a.user_id === userId)?.clinic_names || [];

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const handleResendWelcome = async (userId: string, name: string) => {
    setResendingId(userId);
    const { data, error } = await supabase.functions.invoke("resend-welcome-email", { body: { user_id: userId } });
    setResendingId(null);
    if (error || data?.error) { toast.error(await extractEdgeFunctionError(error, data, "Failed to send welcome email")); return; }
    const sentAt = (data as any)?.welcome_email_sent_at as string | undefined;
    toast.success(`Welcome email sent to ${name}${sentAt ? ` at ${new Date(sentAt).toLocaleString()}` : ""}`);
    if (sentAt) {
      setProfiles((prev) => prev.map((p) => (p.id === userId ? { ...p, welcome_email_sent_at: sentAt } : p)));
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
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-lg shadow-sm w-full sm:w-auto"><Plus className="h-4 w-4 mr-2" />Add Client</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Client</DialogTitle>
                  <DialogDescription>Create a new client account.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2"><Label>Full Name</Label><Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Jane Doe" className="input-glow" /></div>
                  <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@example.com" className="input-glow" /></div>
                  <div className="space-y-2"><Label>Password</Label><Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min 8 characters" className="input-glow" /></div>
                </div>
                <DialogFooter className="flex-col gap-2 sm:flex-row">
                  <Button className="w-full sm:w-auto" disabled={creating} onClick={async () => {
                    if (!form.full_name || !form.email || !form.password) { toast.error("All fields are required"); return; }
                    if (form.password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
                    setCreating(true);
                    const { data, error } = await supabase.functions.invoke("create-team-member", { body: { ...form, role: "client" } });
                    setCreating(false);
                    if (error || data?.error) { toast.error(await extractEdgeFunctionError(error, data, "Failed to create client")); return; }
                    toast.success("Client created");
                    setForm({ full_name: "", email: "", password: "" });
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
          <Card className="overflow-hidden border-border/60">
            <Table className="data-table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Clinics</TableHead>
                  <TableHead>Welcome Email</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((p) => {
                  const assignedClinics = getAssignedClinics(p.id);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.full_name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{p.email || "—"}</TableCell>
                      <TableCell>
                        {assignedClinics.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {assignedClinics.map((name, i) => (<Badge key={i} variant="secondary" className="text-[11px] rounded-full">{name}</Badge>))}
                          </div>
                        ) : (<span className="text-muted-foreground text-xs italic">None</span>)}
                      </TableCell>
                      <TableCell>
                        {p.welcome_email_sent_at ? (
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="secondary" className="text-[11px] rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20">
                                  Sent · {formatSentAt(p.welcome_email_sent_at)}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent side="right">{new Date(p.welcome_email_sent_at).toLocaleString()}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <Badge variant="outline" className="text-[11px] rounded-full text-muted-foreground">Never sent</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8"
                                disabled={resendingId === p.id}
                                onClick={() => handleResendWelcome(p.id, p.full_name || "client")}
                              >
                                {resendingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="right">Resend welcome email</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <Button variant="ghost" size="sm" className="h-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget({ id: p.id, name: p.full_name || "User" })}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
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
    </>
  );
}
