import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { History, Search, Download, Eye, LayoutGrid, LayoutList, FileText, MapPin } from "lucide-react";
import { useGBPPosts } from "@/hooks/useGBPPosts";
import { useClinicGBPConfigs } from "@/hooks/useGeoClusters";
import { MONTH_NAMES } from "@/lib/gbp/hookRotation";
import { ComplianceScanDisplay } from "./ComplianceScanDisplay";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import type { GBPPostHistory, ComplianceScan } from "@/lib/gbp/types";

const statusBadgeColors: Record<string, string> = {
  generated: "bg-muted text-muted-foreground",
  reviewed: "bg-blue-500/10 text-blue-600",
  approved: "bg-emerald-500/10 text-emerald-600",
  published: "bg-primary/10 text-primary",
  rejected: "bg-destructive/10 text-destructive",
};

interface PostHistoryProps {
  clinicId?: string | null;
}

export function PostHistory({ clinicId: navClinicId }: PostHistoryProps) {
  const { configs } = useClinicGBPConfigs();
  const [internalClinicId, setInternalClinicId] = useState<string | null>(null);
  const selectedClinicId = navClinicId || internalClinicId;
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"table" | "card">("table");
  const [selectedPost, setSelectedPost] = useState<GBPPostHistory | null>(null);
  const [clinicNames, setClinicNames] = useState<Record<string, string>>({});

  const { posts, isLoading } = useGBPPosts(selectedClinicId || configs[0]?.clinic_id || null);

  useEffect(() => {
    if (configs.length > 0) {
      const ids = configs.map(c => c.clinic_id);
      supabase.from("clinics").select("id, clinic_name").in("id", ids).then(({ data }) => {
        if (data) {
          const map: Record<string, string> = {};
          data.forEach(c => { map[c.id] = c.clinic_name; });
          setClinicNames(map);
        }
      });
    }
  }, [configs]);

  const filteredPosts = useMemo(() => {
    return posts.filter(p => {
      const validStatuses = statusFilter === "all" ? ["approved", "rejected", "generated"] : [statusFilter];
      if (!validStatuses.includes(p.status)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return p.topic.toLowerCase().includes(q) ||
          p.post_content.toLowerCase().includes(q) ||
          p.primary_keyword.toLowerCase().includes(q);
      }
      return true;
    });
  }, [posts, statusFilter, searchQuery]);

  const handleExportCSV = () => {
    if (filteredPosts.length === 0) return;
    const headers = ["Month", "Year", "Week", "Topic", "Hook Style", "Primary Keyword", "Word Count", "Status", "Content"];
    const rows = filteredPosts.map(p => [
      MONTH_NAMES[p.month - 1], p.year, p.week_number, p.topic, p.hook_style || "",
      p.primary_keyword, p.word_count || "", p.status, `"${p.post_content.replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gbp-posts-history.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="border-border/50">
        <CardContent className="pt-4 pb-4 px-4">
          <div className="flex flex-wrap items-end gap-3">
            {!navClinicId && (
            <div className="space-y-1 flex-1 min-w-[180px]">
              <label className="text-xs font-medium text-muted-foreground">Clinic</label>
              <Select value={selectedClinicId || ""} onValueChange={v => setInternalClinicId(v || null)}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="All clinics" /></SelectTrigger>
                <SelectContent>
                  {configs.map(c => (
                    <SelectItem key={c.clinic_id} value={c.clinic_id} className="text-xs">
                      {clinicNames[c.clinic_id] || c.clinic_id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            )}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All</SelectItem>
                  <SelectItem value="approved" className="text-xs">Approved</SelectItem>
                  <SelectItem value="rejected" className="text-xs">Rejected</SelectItem>
                  <SelectItem value="generated" className="text-xs">Drafts</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex-1 min-w-[150px]">
              <label className="text-xs font-medium text-muted-foreground">Search</label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search topic, keyword..."
                  className="h-9 pl-7 text-xs"
                />
              </div>
            </div>
            <div className="flex gap-1">
              <Button variant={viewMode === "table" ? "secondary" : "ghost"} size="sm" className="h-9 w-9 p-0" onClick={() => setViewMode("table")}>
                <LayoutList className="h-3.5 w-3.5" />
              </Button>
              <Button variant={viewMode === "card" ? "secondary" : "ghost"} size="sm" className="h-9 w-9 p-0" onClick={() => setViewMode("card")}>
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" className="h-9 gap-1 text-xs" onClick={handleExportCSV} disabled={filteredPosts.length === 0}>
                <Download className="h-3.5 w-3.5" /> CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Empty */}
      {filteredPosts.length === 0 && (
        <Card className="border-dashed border-border/60">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-4">
              <History className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold mb-1">No Posts Found</h3>
            <p className="text-sm text-muted-foreground">
              {posts.length === 0 ? "No GBP posts generated yet." : "No posts match your filters."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Table View */}
      {filteredPosts.length > 0 && viewMode === "table" && (
        <Card className="border-border/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Period</TableHead>
                <TableHead className="text-xs">Week</TableHead>
                <TableHead className="text-xs">Topic</TableHead>
                <TableHead className="text-xs">Hook</TableHead>
                <TableHead className="text-xs">Keyword</TableHead>
                <TableHead className="text-xs">Words</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPosts.map(post => (
                <TableRow key={post.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setSelectedPost(post)}>
                  <TableCell className="text-xs">{MONTH_NAMES[post.month - 1]} {post.year}</TableCell>
                  <TableCell className="text-xs">W{post.week_number}</TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">{post.topic}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{post.hook_style}</Badge></TableCell>
                  <TableCell className="text-xs">{post.primary_keyword}</TableCell>
                  <TableCell className="text-xs">{post.word_count}</TableCell>
                  <TableCell><Badge variant="outline" className={`text-[10px] ${statusBadgeColors[post.status]}`}>{post.status}</Badge></TableCell>
                  <TableCell><Eye className="h-3.5 w-3.5 text-muted-foreground" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Card View */}
      {filteredPosts.length > 0 && viewMode === "card" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredPosts.map((post, idx) => (
            <motion.div key={post.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}>
              <Card className="border-border/50 cursor-pointer hover:border-primary/30 transition-colors" onClick={() => setSelectedPost(post)}>
                <CardContent className="py-3 px-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold flex items-center gap-1"><FileText className="h-3 w-3 text-primary" />W{post.week_number} — {post.topic}</span>
                    <Badge variant="outline" className={`text-[10px] ${statusBadgeColors[post.status]}`}>{post.status}</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-3">{post.post_content}</p>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary" className="text-[10px]">{post.hook_style}</Badge>
                    <Badge variant="outline" className="text-[10px]">{post.primary_keyword}</Badge>
                    <span className="text-[10px] text-muted-foreground ml-auto">{post.word_count}w • {MONTH_NAMES[post.month - 1]} {post.year}</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={!!selectedPost} onOpenChange={() => setSelectedPost(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedPost && (
            <>
              <DialogHeader>
                <DialogTitle className="text-sm">
                  Week {selectedPost.week_number} — {selectedPost.topic}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className={`text-[10px] ${statusBadgeColors[selectedPost.status]}`}>{selectedPost.status}</Badge>
                  <Badge variant="secondary" className="text-[10px]">{selectedPost.hook_style}</Badge>
                  <Badge variant="outline" className="text-[10px]">{selectedPost.post_type?.replace("_", " ")}</Badge>
                  <Badge variant="outline" className="text-[10px]">Variant {selectedPost.topic_variant}</Badge>
                  <Badge variant="outline" className="text-[10px]">{selectedPost.word_count}w</Badge>
                </div>
                <div className="bg-muted/30 rounded-md p-3 border border-border/30">
                  <p className="text-xs leading-relaxed whitespace-pre-wrap">{selectedPost.post_content}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="font-medium text-muted-foreground">Primary Keyword:</span>
                    <p>{selectedPost.primary_keyword}</p>
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground">Secondary Keywords:</span>
                    <p>{selectedPost.secondary_keywords?.join(", ") || "—"}</p>
                  </div>
                  {selectedPost.local_landmark_used && (
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      <span>{selectedPost.local_landmark_used}</span>
                    </div>
                  )}
                  {selectedPost.cta_text && (
                    <div>
                      <span className="font-medium text-muted-foreground">CTA:</span>
                      <p>{selectedPost.cta_text} → {selectedPost.cta_url}</p>
                    </div>
                  )}
                </div>
                {selectedPost.compliance_scan && (
                  <ComplianceScanDisplay scan={selectedPost.compliance_scan as unknown as import("@/lib/gbp/types").ComplianceScan} />
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
