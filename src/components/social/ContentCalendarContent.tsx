import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { NewPostDialog } from "@/components/content-calendar/NewPostDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Download, Plus, CalendarDays, List, ChevronsUpDown, FileText, FileSpreadsheet, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { CalendarSkeleton } from "@/components/DashboardSkeleton";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
import { toast } from "sonner";
import { MonthlyView } from "@/components/content-calendar/MonthlyView";
import { ListView } from "@/components/content-calendar/ListView";
import { PostInspector } from "@/components/content-calendar/PostInspector";
import type { ContentPost } from "@/components/content-calendar/PostChip";

interface Clinic { id: string; clinic_name: string; }
type ViewMode = "monthly" | "list";

const STATUS_OPTIONS = ["all", "draft", "scheduled", "posted", "flagged", "failed"] as const;
const PLATFORM_OPTIONS = ["all", "facebook", "instagram", "tiktok"] as const;
const CONTENT_TYPE_OPTIONS = ["all", "IMAGE", "VIDEO", "REEL", "CAROUSEL", "STORY"] as const;

export default function ContentCalendarContent({ clinicId: externalClinicId }: { clinicId?: string }) {
  const { role } = useUserRole();
  const { user } = useAuth();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [selectedClinicId, setSelectedClinicId] = useState("");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [clinicPopoverOpen, setClinicPopoverOpen] = useState(false);
  const [newPostOpen, setNewPostOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("monthly");
  const [selectedPost, setSelectedPost] = useState<ContentPost | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [filterContentType, setFilterContentType] = useState("all");

  const filteredPosts = useMemo(() => {
    return posts.filter(p => {
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      if (filterPlatform !== "all" && p.platform !== filterPlatform) return false;
      if (filterContentType !== "all" && p.content_type !== filterContentType) return false;
      return true;
    });
  }, [posts, filterStatus, filterPlatform, filterContentType]);

  const hasActiveFilters = filterStatus !== "all" || filterPlatform !== "all" || filterContentType !== "all";

  useEffect(() => {
    if (externalClinicId) {
      setSelectedClinicId(externalClinicId);
      return;
    }
    const fetchClinics = async () => {
      let query = supabase.from("clinics").select("id, clinic_name");
      if (role === "concierge") query = query.eq("assigned_concierge_id", user?.id);
      if (role === "client") query = query.eq("owner_user_id", user?.id);
      const { data } = await query;
      setClinics(data || []);
      if (data && data.length > 0 && !selectedClinicId) setSelectedClinicId(data[0].id);
    };
    fetchClinics();
  }, [role, user, externalClinicId]);

  useEffect(() => {
    if (!selectedClinicId) return;
    setLoading(true);
    const start = format(startOfMonth(currentMonth), "yyyy-MM-dd");
    const end = format(endOfMonth(currentMonth), "yyyy-MM-dd");
    supabase.from("content_posts").select("*")
      .eq("clinic_id", selectedClinicId)
      .in("status", ["scheduled", "posted", "failed", "flagged", "draft", "approved", "pending"])
      .gte("scheduled_date", start).lte("scheduled_date", end)
      .order("scheduled_date", { ascending: true })
      .then(({ data }) => { setPosts((data as any as ContentPost[]) || []); setLoading(false); });
  }, [selectedClinicId, currentMonth]);

  const handlePostClick = (post: ContentPost) => setSelectedPost(post);

  const getExportData = () => {
    if (filteredPosts.length === 0) { toast.error("No posts to export."); return null; }
    const headers = ["Title", "Platform", "Content Type", "Scheduled Date", "Time", "Status", "Caption"];
    const rows = filteredPosts.map(p => [p.title, p.platform, p.content_type, p.scheduled_date || "", p.scheduled_time?.slice(0, 5) || "", p.status, p.caption || ""]);
    return { headers, rows, count: filteredPosts.length };
  };

  const handleExportCSV = () => {
    try {
      const data = getExportData();
      if (!data) return;
      const csv = [data.headers, ...data.rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `content-calendar-${format(currentMonth, "yyyy-MM")}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${data.count} posts as CSV.`);
    } catch { toast.error("Export failed."); }
  };

  const handleExportPDF = async () => {
    try {
      const data = getExportData();
      if (!data) return;
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");
      const { addVSALogoToAllPages } = await import("@/lib/pdf-logo");
      const doc = new jsPDF({ orientation: "landscape" });
      const clinicName = clinics.find(c => c.id === selectedClinicId)?.clinic_name || "All Clinics";
      doc.setFontSize(16); doc.text(`Content Calendar - ${clinicName}`, 14, 18);
      doc.setFontSize(10); doc.text(format(currentMonth, "MMMM yyyy"), 14, 25);
      autoTable(doc, { head: [data.headers], body: data.rows, startY: 30, styles: { fontSize: 7, cellPadding: 2 }, headStyles: { fillColor: [59, 130, 246] } });
      await addVSALogoToAllPages(doc);
      doc.save(`content-calendar-${format(currentMonth, "yyyy-MM")}.pdf`);
      toast.success(`Exported ${data.count} posts as PDF.`);
    } catch { toast.error("PDF export failed."); }
  };

  return (
    <>
      <div className="flex h-[calc(100vh-280px)]">
        <div className={cn("flex-1 overflow-y-auto transition-all duration-200 space-y-4 p-1", selectedPost && "pr-0")}>
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <Popover open={clinicPopoverOpen} onOpenChange={setClinicPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full sm:w-[260px] justify-between text-sm">
                    {selectedClinicId ? `🐾 ${clinics.find(c => c.id === selectedClinicId)?.clinic_name}` : "Select clinic..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[260px] p-0 z-50 bg-popover" align="start">
                  <Command>
                    <CommandInput placeholder="Search clinics..." />
                    <CommandList>
                      <CommandEmpty>No clinic found.</CommandEmpty>
                      <CommandGroup>
                        {clinics.map(c => (
                          <CommandItem key={c.id} value={c.clinic_name} onSelect={() => { setSelectedClinicId(c.id); setClinicPopoverOpen(false); }} className="cursor-pointer">
                            🐾 {c.clinic_name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}><ChevronLeft className="h-4 w-4" /></Button>
                <span className="text-base font-semibold text-foreground min-w-[140px] text-center">{format(currentMonth, "MMMM yyyy")}</span>
                <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center border border-border rounded-md">
                <Button variant={viewMode === "monthly" ? "default" : "ghost"} size="icon" className="h-8 w-8 rounded-r-none" onClick={() => setViewMode("monthly")}><CalendarDays className="h-4 w-4" /></Button>
                <Button variant={viewMode === "list" ? "default" : "ghost"} size="icon" className="h-8 w-8 rounded-l-none" onClick={() => setViewMode("list")}><List className="h-4 w-4" /></Button>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs sm:text-sm"><Download className="h-4 w-4 mr-1.5" /> Export</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleExportCSV}><FileSpreadsheet className="h-4 w-4 mr-2" /> CSV</DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportPDF}><FileText className="h-4 w-4 mr-2" /> PDF</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="sm" className="text-xs sm:text-sm" onClick={() => setNewPostOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New Post</Button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>{STATUS_OPTIONS.map(s => (<SelectItem key={s} value={s} className="text-xs capitalize">{s === "all" ? "All Statuses" : s}</SelectItem>))}</SelectContent>
            </Select>
            <Select value={filterPlatform} onValueChange={setFilterPlatform}>
              <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Platform" /></SelectTrigger>
              <SelectContent>{PLATFORM_OPTIONS.map(p => (<SelectItem key={p} value={p} className="text-xs capitalize">{p === "all" ? "All Platforms" : p}</SelectItem>))}</SelectContent>
            </Select>
            <Select value={filterContentType} onValueChange={setFilterContentType}>
              <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Content Type" /></SelectTrigger>
              <SelectContent>{CONTENT_TYPE_OPTIONS.map(t => (<SelectItem key={t} value={t} className="text-xs">{t === "all" ? "All Types" : t}</SelectItem>))}</SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => { setFilterStatus("all"); setFilterPlatform("all"); setFilterContentType("all"); }}>Clear filters</Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto">{filteredPosts.length} post{filteredPosts.length !== 1 ? "s" : ""}</span>
          </div>

          {/* Calendar Content */}
          {loading ? <CalendarSkeleton /> : filteredPosts.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <div className="h-16 w-16 rounded-2xl bg-accent flex items-center justify-center mx-auto mb-4"><CalendarDays className="h-8 w-8 text-accent-foreground" /></div>
              <p className="font-medium text-foreground mb-1">{hasActiveFilters ? "No posts match filters" : "No posts this month"}</p>
              <p className="text-sm mb-4">{hasActiveFilters ? "Try adjusting your filters." : "Create your first post to get started."}</p>
              {!hasActiveFilters && <Button size="sm" onClick={() => setNewPostOpen(true)}><Plus className="h-4 w-4 mr-2" /> Create Post</Button>}
            </div>
          ) : viewMode === "monthly" ? (
            <MonthlyView currentMonth={currentMonth} posts={filteredPosts} onPostClick={handlePostClick} onPostsChange={setPosts} />
          ) : (
            <ListView posts={filteredPosts} onPostClick={handlePostClick} />
          )}
        </div>

        {selectedPost && (
          <PostInspector post={selectedPost} onClose={() => setSelectedPost(null)}
            onSaved={(updated) => { setPosts(prev => prev.map(p => p.id === updated.id ? updated : p)); setSelectedPost(updated); }}
            onDeleted={(postId) => { setPosts(prev => prev.filter(p => p.id !== postId)); setSelectedPost(null); }}
          />
        )}
      </div>

      <NewPostDialog clinicId={selectedClinicId} open={newPostOpen} onOpenChange={setNewPostOpen} onCreated={(post) => setPosts(prev => [...prev, post])} />
    </>
  );
}
