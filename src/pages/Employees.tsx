import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";
import { toast } from "sonner";
import { Plus, Trash2, Users, Search, X, Pencil, AlertTriangle, Activity } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import TeamActivityTab from "@/components/team/TeamActivityTab";

const TEAM_ROLES = [
  "Developer",
  "Maintenance",
  "Ads Strategist",
  "Ads Analyst",
  "Social & Concierge",
  "Meta Ads Specialist",
  "SEO Lead",
] as const;

interface Profile { id: string; full_name: string | null; email: string | null; team_role: string | null; }
interface UserRole { user_id: string; role: string; }
interface ClinicAssignment { user_id: string; clinic_names: string[]; clinic_ids: string[]; }
interface ClinicOption { id: string; clinic_name: string; }

export default function Employees() {
  const { role } = useUserRole();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [assignments, setAssignments] = useState<ClinicAssignment[]>([]);
  const [allClinics, setAllClinics] = useState<ClinicOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "concierge", team_role: "" });
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTeamRole, setFilterTeamRole] = useState("all");
  const [filterClinic, setFilterClinic] = useState("all");

  // Edit dialog state
  const [editDialogUser, setEditDialogUser] = useState<Profile | null>(null);
  const [editForm, setEditForm] = useState({ role: "", team_role: "", clinicIds: [] as string[] });
  const [savingEdit, setSavingEdit] = useState(false);
  const [clinicSearch, setClinicSearch] = useState("");

  const fetchData = async () => {
    const [profilesRes, rolesRes, clinicsRes, teamAssignRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, team_role"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("clinics").select("id, clinic_name"),
      (supabase.from("clinic_team_members" as any).select("user_id, clinic_id") as any),
    ]);
    setProfiles((profilesRes.data as Profile[]) || []);
    setRoles(rolesRes.data || []);

    const clinics = (clinicsRes.data || []) as ClinicOption[];
    setAllClinics(clinics);
    const clinicMap = Object.fromEntries(clinics.map(c => [c.id, c.clinic_name]));
    const teamData = (teamAssignRes.data || []) as { user_id: string; clinic_id: string }[];

    const assignMap = new Map<string, { names: string[]; ids: string[] }>();
    teamData.forEach((a: { user_id: string; clinic_id: string }) => {
      const name = clinicMap[a.clinic_id];
      if (name) {
        const existing = assignMap.get(a.user_id) || { names: [], ids: [] };
        existing.names.push(name);
        existing.ids.push(a.clinic_id);
        assignMap.set(a.user_id, existing);
      }
    });
    setAssignments(Array.from(assignMap.entries()).map(([user_id, { names, ids }]) => ({ user_id, clinic_names: names, clinic_ids: ids })));
    setLoading(false);
  };

  useEffect(() => {
    if (role !== "admin") return;
    fetchData();
  }, [role]);

  const staffProfiles = profiles.filter(p => {
    const r = roles.find(r => r.user_id === p.id)?.role;
    return r === "admin" || r === "concierge";
  });

  const filteredProfiles = staffProfiles
    .filter(p => {
      const q = searchQuery.toLowerCase();
      if (q && !(p.full_name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q))) return false;
      if (filterTeamRole !== "all" && p.team_role !== filterTeamRole) return false;
      if (filterClinic !== "all") {
        const clinicIds = getAssignedClinicIds(p.id);
        if (!clinicIds.includes(filterClinic)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const roleA = roles.find(r => r.user_id === a.id)?.role;
      const roleB = roles.find(r => r.user_id === b.id)?.role;
      if (roleA === "admin" && roleB !== "admin") return -1;
      if (roleA !== "admin" && roleB === "admin") return 1;
      return (a.full_name || "").localeCompare(b.full_name || "");
    });

  const getRole = (userId: string) => roles.find(r => r.user_id === userId)?.role || "unknown";
  const getAssignedClinics = (userId: string) => assignments.find(a => a.user_id === userId)?.clinic_names || [];
  const getAssignedClinicIds = (userId: string) => assignments.find(a => a.user_id === userId)?.clinic_ids || [];

  const openEditDialog = (user: Profile) => {
    setEditDialogUser(user);
    setEditForm({
      role: getRole(user.id),
      team_role: user.team_role || "",
      clinicIds: getAssignedClinicIds(user.id),
    });
    setClinicSearch("");
  };

  const handleSaveEdit = async () => {
    if (!editDialogUser) return;
    setSavingEdit(true);
    const userId = editDialogUser.id;
    const currentRole = getRole(userId);
    const currentTeamRole = editDialogUser.team_role || "";
    const currentClinicIds = getAssignedClinicIds(userId);

    // Update access level
    if (editForm.role !== currentRole) {
      const { error } = await supabase.from("user_roles").update({ role: editForm.role as any }).eq("user_id", userId);
      if (error) { toast.error("Failed to update access level"); setSavingEdit(false); return; }
    }

    // Update team role
    const newTeamRole = editForm.role === "admin" ? null : (editForm.team_role || null);
    if ((newTeamRole || "") !== currentTeamRole) {
      const { error } = await supabase.from("profiles").update({ team_role: newTeamRole } as any).eq("id", userId);
      if (error) { toast.error("Failed to update team role"); setSavingEdit(false); return; }
    }

    // Update clinic assignments
    const toAdd = editForm.clinicIds.filter(id => !currentClinicIds.includes(id));
    const toRemove = currentClinicIds.filter(id => !editForm.clinicIds.includes(id));
    for (const clinicId of toRemove) {
      await (supabase.from("clinic_team_members" as any).delete().eq("user_id", userId).eq("clinic_id", clinicId) as any);
    }
    for (const clinicId of toAdd) {
      await (supabase.from("clinic_team_members" as any).insert({ user_id: userId, clinic_id: clinicId } as any) as any);
    }

    setSavingEdit(false);
    setEditDialogUser(null);
    toast.success("Team member updated");
    await fetchData();
  };

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

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
        {/* Hero */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-[28px] sm:text-[34px] font-bold text-foreground tracking-tight leading-tight">Team Members</h1>
              <p className="text-muted-foreground mt-1 text-sm">Manage your agency team</p>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-lg shadow-sm w-full sm:w-auto"><Plus className="h-4 w-4 mr-2" />Add Team Member</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Team Member</DialogTitle>
                  <DialogDescription>Create a new account with a specific role.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2"><Label>Full Name</Label><Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Jane Doe" className="input-glow" /></div>
                  <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@example.com" className="input-glow" /></div>
                  <div className="space-y-2"><Label>Password</Label><Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min 8 characters" className="input-glow" /></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Access Level</Label>
                      <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="concierge">Member</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Team Role</Label>
                      <Select value={form.team_role} onValueChange={v => setForm(f => ({ ...f, team_role: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                        <SelectContent>
                          {TEAM_ROLES.map(r => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <DialogFooter className="flex-col gap-2 sm:flex-row">
                  <Button className="w-full sm:w-auto" disabled={creating} onClick={async () => {
                    if (!form.full_name || !form.email || !form.password) { toast.error("All fields are required"); return; }
                    if (form.password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
                    setCreating(true);
                    const { data, error } = await supabase.functions.invoke("create-team-member", {
                      body: { ...form, team_role: form.team_role || null },
                    });
                    setCreating(false);
                    if (error || data?.error) { toast.error(await extractEdgeFunctionError(error, data, "Failed to create team member")); return; }
                    toast.success("Team member created");
                    setForm({ full_name: "", email: "", password: "", role: "concierge", team_role: "" });
                    setDialogOpen(false);
                    await fetchData();
                  }}>
                    {creating ? "Creating…" : "Create Member"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
        </div>


        <Tabs defaultValue="members" className="space-y-4">
          <TabsList>
            <TabsTrigger value="members"><Users className="h-3.5 w-3.5 mr-1.5" />Members</TabsTrigger>
            <TabsTrigger value="activity"><Activity className="h-3.5 w-3.5 mr-1.5" />Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="members" className="space-y-4 mt-0">
        {/* Filter Bar */}
        <Card className="border-border/60">
          <CardContent className="py-3 px-3 sm:px-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3">
              <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8 h-9"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex flex-1 sm:flex-none gap-2">
                <Select value={filterTeamRole} onValueChange={setFilterTeamRole}>
                  <SelectTrigger className="flex-1 sm:w-[160px] h-9"><SelectValue placeholder="Team Role" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    {TEAM_ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterClinic} onValueChange={setFilterClinic}>
                  <SelectTrigger className="flex-1 sm:w-[180px] h-9"><SelectValue placeholder="Clinic" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Clinics</SelectItem>
                    {allClinics.map(c => <SelectItem key={c.id} value={c.id}>{c.clinic_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {(searchQuery || filterTeamRole !== "all" || filterClinic !== "all") && (
                <Button variant="ghost" size="sm" className="h-9 text-xs w-full sm:w-auto" onClick={() => { setSearchQuery(""); setFilterTeamRole("all"); setFilterClinic("all"); }}>
                  Clear filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <div className="inline-flex items-center gap-2">
              <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Loading team...
            </div>
          </CardContent></Card>
        ) : filteredProfiles.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
            <p>{staffProfiles.length === 0 ? "No team members found." : "No results match your filters."}</p>
          </CardContent></Card>
        ) : (
          <Card className="overflow-hidden border-border/60">
            <div className="overflow-x-auto">
            <Table className="data-table min-w-[760px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Access Level</TableHead>
                  <TableHead>Team Role</TableHead>
                  <TableHead>Assigned Clinics</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProfiles.map((p) => {
                  const userRole = getRole(p.id);
                  const assignedClinics = getAssignedClinics(p.id);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.full_name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{p.email || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={userRole === "admin" ? "default" : "secondary"} className="text-[11px]">
                          {userRole === "admin" ? "Admin" : "Member"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {userRole === "admin" ? (
                          <span className="text-xs text-muted-foreground italic">N/A</span>
                        ) : (
                          <span className="text-sm">{p.team_role || <span className="text-xs text-muted-foreground italic">Unassigned</span>}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {assignedClinics.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {assignedClinics.map((name, i) => (<Badge key={i} variant="secondary" className="text-[11px] rounded-full">{name}</Badge>))}
                          </div>
                        ) : (<span className="text-muted-foreground text-xs italic">None</span>)}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="sm" className="h-8" onClick={() => openEditDialog(p)} title="Edit member">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
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
          </TabsContent>

          <TabsContent value="activity" className="mt-0">
            <TeamActivityTab />
          </TabsContent>
        </Tabs>

        {/* Edit Member Dialog */}
        <Dialog open={!!editDialogUser} onOpenChange={(open) => { if (!open) setEditDialogUser(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit - {editDialogUser?.full_name || "Team Member"}</DialogTitle>
              <DialogDescription>Update access level, team role, and clinic assignments.</DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Access Level</Label>
                  <Select value={editForm.role} onValueChange={v => setEditForm(f => ({ ...f, role: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="concierge">Member</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editForm.role !== "admin" && (
                  <div className="space-y-2">
                    <Label>Team Role</Label>
                    <Select value={editForm.team_role} onValueChange={v => setEditForm(f => ({ ...f, team_role: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                      <SelectContent>
                        {TEAM_ROLES.map(r => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Assigned Clinics</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={clinicSearch}
                    onChange={(e) => setClinicSearch(e.target.value)}
                    placeholder="Search clinics…"
                    className="pl-8 h-9"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1 border rounded-xl p-2">
                  {allClinics.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-3">No active clinics found.</p>
                  ) : (() => {
                    // Build map of clinicId → names of same-role members (excluding current user)
                    const sameRoleMap = new Map<string, string[]>();
                    if (editForm.team_role && editDialogUser) {
                      const sameRoleProfiles = staffProfiles.filter(
                        p => p.id !== editDialogUser.id && p.team_role === editForm.team_role
                      );
                      sameRoleProfiles.forEach(p => {
                        const clinicIds = getAssignedClinicIds(p.id);
                        clinicIds.forEach(cId => {
                          const existing = sameRoleMap.get(cId) || [];
                          existing.push(p.full_name || p.email || "Unknown");
                          sameRoleMap.set(cId, existing);
                        });
                      });
                    }
                    const q = clinicSearch.trim().toLowerCase();
                    const visible = q
                      ? allClinics.filter(c => c.clinic_name.toLowerCase().includes(q))
                      : allClinics;
                    if (visible.length === 0) {
                      return <p className="text-sm text-muted-foreground text-center py-3">No clinics match "{clinicSearch}".</p>;
                    }
                    return visible.map(c => {
                      const existingMembers = sameRoleMap.get(c.id);
                      return (
                        <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-muted cursor-pointer">
                          <Checkbox
                            checked={editForm.clinicIds.includes(c.id)}
                            onCheckedChange={(checked) => {
                              setEditForm(f => ({
                                ...f,
                                clinicIds: checked ? [...f.clinicIds, c.id] : f.clinicIds.filter(id => id !== c.id),
                              }));
                            }}
                          />
                          <span className="text-sm flex items-center gap-1.5">
                            {c.clinic_name}
                            {existingMembers && existingMembers.length > 0 && (
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center gap-1 cursor-help">
                                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                      <span className="text-amber-600 dark:text-amber-400 text-xs">({existingMembers.join(", ")})</span>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="right">
                                    <p className="text-xs">This clinic already has {editForm.team_role === "Ads Analyst" ? "an" : "a"} {editForm.team_role} assigned</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </span>
                        </label>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => setEditDialogUser(null)}>Cancel</Button>
              <Button className="w-full sm:w-auto" disabled={savingEdit} onClick={handleSaveEdit}>
                {savingEdit ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete team member?</AlertDialogTitle>
            <AlertDialogDescription>Remove "{deleteTarget?.name}"? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
