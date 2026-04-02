import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Sparkles, Save, CheckCircle2, RefreshCw, FileText, MapPin, Phone, ExternalLink } from "lucide-react";
import { useClinicGBPConfigs } from "@/hooks/useGeoClusters";
import { useTopicLibrary } from "@/hooks/useTopicLibrary";
import { useGBPPosts } from "@/hooks/useGBPPosts";
import { useUserRole } from "@/hooks/useUserRole";
import { runComplianceScan } from "@/lib/gbp/compliance";
import { getHookStyleForPosition } from "@/lib/gbp/hookRotation";
import { MONTH_NAMES } from "@/lib/gbp/hookRotation";
import { ComplianceScanDisplay } from "./ComplianceScanDisplay";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { GeneratedPost, ComplianceScan, TopicVariant, HospitalType, Jurisdiction } from "@/lib/gbp/types";

interface GeneratePostsProps {
  clinicId?: string | null;
}

export function GeneratePosts({ clinicId: navClinicId }: GeneratePostsProps) {
  const queryClient = useQueryClient();
  const { configs, isLoading: configsLoading } = useClinicGBPConfigs();
  const { topicsByMonth } = useTopicLibrary();
  const { role } = useUserRole();

  // Use navbar clinic if provided, otherwise fall back to internal state
  const [internalClinicId, setInternalClinicId] = useState<string | null>(null);
  const selectedClinicId = navClinicId || internalClinicId;
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [generatedPosts, setGeneratedPosts] = useState<GeneratedPost[]>([]);
  const [complianceScan, setComplianceScan] = useState<ComplianceScan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [regenerateMode, setRegenerateMode] = useState(false);

  const { savePosts } = useGBPPosts(selectedClinicId);

  // Fetch approved posts for this clinic/month/year
  const { data: approvedPosts, isLoading: approvedLoading } = useQuery({
    queryKey: ['gbp-approved-posts', selectedClinicId, selectedMonth, selectedYear],
    queryFn: async () => {
      if (!selectedClinicId) return [];
      const { data, error } = await supabase
        .from("gbp_post_history")
        .select("*")
        .eq("clinic_id", selectedClinicId)
        .eq("month", selectedMonth)
        .eq("year", selectedYear)
        .eq("status", "approved")
        .order("week_number");
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedClinicId,
  });

  const hasApprovedPosts = (approvedPosts?.length ?? 0) > 0 && !regenerateMode;

  // Reset regenerate mode when clinic/month/year changes
  useEffect(() => {
    setRegenerateMode(false);
    setGeneratedPosts([]);
    setComplianceScan(null);
  }, [selectedClinicId, selectedMonth, selectedYear]);
  const selectedConfig = useMemo(() => configs.find(c => c.clinic_id === selectedClinicId), [configs, selectedClinicId]);

  // Get clinic name
  const [clinicNames, setClinicNames] = useState<Record<string, string>>({});
  useMemo(() => {
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

  const topics = useMemo(() => {
    if (!selectedConfig) return null;
    const variant = selectedConfig.topic_variant_current || 'A';
    const monthTopics = topicsByMonth[selectedMonth];
    return monthTopics?.find(t => t.variant === variant) || null;
  }, [selectedConfig, topicsByMonth, selectedMonth]);

  const hookStyle = useMemo(() => {
    if (!selectedConfig?.cluster_position) return 'STAT';
    return getHookStyleForPosition(selectedMonth, selectedConfig.cluster_position as TopicVariant);
  }, [selectedConfig, selectedMonth]);

  const handleGenerate = async () => {
    if (!selectedConfig || !topics) {
      toast.error("Please select a clinic with GBP config and ensure topics exist for this month");
      return;
    }

    setIsGenerating(true);
    setGeneratedPosts([]);
    setComplianceScan(null);

    try {
      const clinicName = clinicNames[selectedConfig.clinic_id] || "Clinic";
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      const { data, error } = await supabase.functions.invoke("generate-gbp-posts", {
        body: {
          clinic_id: selectedConfig.clinic_id,
          clinic_name: clinicName,
          month: selectedMonth,
          year: selectedYear,
          hospital_type: selectedConfig.hospital_type || 1,
          topic_variant: selectedConfig.topic_variant_current || 'A',
          hook_style: hookStyle,
          local_landmarks: selectedConfig.local_landmarks || [],
          neighbourhood: selectedConfig.neighbourhood || '',
          phone_number: selectedConfig.phone_number || '',
          website_url: selectedConfig.website_url || '',
          top_services: selectedConfig.top_services || [],
          jurisdiction: selectedConfig.jurisdiction || 'CA-OTHER',
          topics: {
            week_1: topics.week_1_topic,
            week_2: topics.week_2_topic,
            week_3: topics.week_3_topic,
            week_4: topics.week_4_topic,
          },
          recent_content_context: { last_month_gbp: [], recent_blogs: [], recent_p2_pages: [] },
        },
      });
      clearTimeout(timeoutId);

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const posts = data.posts as GeneratedPost[];
      setGeneratedPosts(posts);

      // Run client-side compliance scan
      const scan = runComplianceScan(
        posts,
        clinicName,
        `${selectedMonth}/${selectedYear}`,
        (selectedConfig.hospital_type || 1) as HospitalType,
        (selectedConfig.jurisdiction || 'CA-OTHER') as Jurisdiction,
        selectedConfig.neighbourhood || '',
        selectedConfig.phone_number || ''
      );
      setComplianceScan(scan);
      toast.success(`Generated ${posts.length} posts`);
    } catch (err: any) {
      toast.error(err.message || "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFixIssues = async (issues: string[]) => {
    if (!selectedConfig || generatedPosts.length === 0) return;

    setIsFixing(true);
    try {
      const clinicName = clinicNames[selectedConfig.clinic_id] || "Clinic";
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      const { data, error } = await supabase.functions.invoke("generate-gbp-posts", {
        body: {
          clinic_id: selectedConfig.clinic_id,
          clinic_name: clinicName,
          month: selectedMonth,
          year: selectedYear,
          hospital_type: selectedConfig.hospital_type || 1,
          topic_variant: selectedConfig.topic_variant_current || 'A',
          hook_style: hookStyle,
          local_landmarks: selectedConfig.local_landmarks || [],
          neighbourhood: selectedConfig.neighbourhood || '',
          phone_number: selectedConfig.phone_number || '',
          website_url: selectedConfig.website_url || '',
          top_services: selectedConfig.top_services || [],
          jurisdiction: selectedConfig.jurisdiction || 'CA-OTHER',
          topics: null,
          fix_mode: true,
          existing_posts: generatedPosts,
          issues_to_fix: issues,
        },
      });
      clearTimeout(timeoutId);

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const posts = data.posts as GeneratedPost[];
      setGeneratedPosts(posts);

      // Re-run compliance scan on fixed posts
      const scan = runComplianceScan(
        posts,
        clinicName,
        `${selectedMonth}/${selectedYear}`,
        (selectedConfig.hospital_type || 1) as HospitalType,
        (selectedConfig.jurisdiction || 'CA-OTHER') as Jurisdiction,
        selectedConfig.neighbourhood || '',
        selectedConfig.phone_number || ''
      );
      setComplianceScan(scan);

      if (scan.overall === 'PASS') {
        toast.success("All compliance issues fixed!");
      } else {
        toast.warning(`${scan.issues_count} issue${scan.issues_count !== 1 ? 's' : ''} remaining after fix`);
      }
    } catch (err: any) {
      toast.error(err.message || "Fix failed");
    } finally {
      setIsFixing(false);
    }
  };

  const handleSave = async () => {
    if (!selectedConfig || generatedPosts.length === 0 || !complianceScan) return;
    setIsSaving(true);
    try {
      await savePosts.mutateAsync({
        generatedPosts,
        clinicId: selectedConfig.clinic_id,
        month: selectedMonth,
        year: selectedYear,
        topicVariant: selectedConfig.topic_variant_current || 'A',
        complianceScan,
      });
      toast.success("Posts saved to history");
    } catch (err) {
      // handled by mutation
    } finally {
      setIsSaving(false);
    }
  };

  const handleApproveAll = async () => {
    if (!selectedConfig || generatedPosts.length === 0 || !complianceScan) return;
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // If regenerating, delete old approved posts for this month first
      if (regenerateMode) {
        const { error: delError } = await supabase
          .from("gbp_post_history")
          .delete()
          .eq("clinic_id", selectedConfig.clinic_id)
          .eq("month", selectedMonth)
          .eq("year", selectedYear)
          .eq("status", "approved");
        if (delError) throw delError;
      }

      const rows = generatedPosts.map(p => ({
        clinic_id: selectedConfig.clinic_id,
        month: selectedMonth,
        year: selectedYear,
        week_number: p.week_number,
        post_type: p.post_type,
        topic: p.topic,
        hook_style: p.hook_style,
        primary_keyword: p.primary_keyword,
        secondary_keywords: p.secondary_keywords,
        post_content: p.post_content,
        cta_text: p.cta_text,
        cta_url: p.cta_url,
        word_count: p.word_count,
        topic_variant: selectedConfig.topic_variant_current || 'A',
        local_landmark_used: p.local_landmark_used,
        status: "approved",
        compliance_scan: complianceScan as any,
        approved_by: user?.id,
      }));
      const { error } = await supabase.from("gbp_post_history").insert(rows as any);
      if (error) throw error;
      toast.success(regenerateMode ? "Posts regenerated and approved" : "All posts approved and saved");
      setGeneratedPosts([]);
      setComplianceScan(null);
      setRegenerateMode(false);
      queryClient.invalidateQueries({ queryKey: ['gbp-approved-posts', selectedClinicId, selectedMonth, selectedYear] });
    } catch (err: any) {
      toast.error(err.message || "Failed to approve");
    } finally {
      setIsSaving(false);
    }
  };

  if (configsLoading) {
    return <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card className="border-border/50">
        <CardContent className="pt-4 pb-4 px-4">
          <div className="flex flex-wrap items-end gap-3">
            {!navClinicId && (
            <div className="space-y-1 flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-muted-foreground">Clinic</label>
              <Select value={selectedClinicId || ""} onValueChange={setInternalClinicId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select clinic..." />
                </SelectTrigger>
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
              <label className="text-xs font-medium text-muted-foreground">Month</label>
              <Select value={String(selectedMonth)} onValueChange={v => setSelectedMonth(Number(v))}>
                <SelectTrigger className="h-9 w-[130px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)} className="text-xs">{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Year</label>
              <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
                <SelectTrigger className="h-9 w-[90px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2025, 2026, 2027].map(y => (
                    <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {hasApprovedPosts ? (
              <div className="flex items-center gap-2">
                <Badge className="bg-green-600/20 text-green-400 border-green-500/30 text-[11px] h-9 px-3 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Approved for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
                </Badge>
                {role === 'admin' && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="gap-1.5 text-amber-500 hover:text-amber-400">
                        <RefreshCw className="h-3.5 w-3.5" />
                        Regenerate
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Regenerate approved posts?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will allow you to generate new posts for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}. 
                          The currently approved {approvedPosts?.length} post{(approvedPosts?.length ?? 0) !== 1 ? 's' : ''} will be replaced when you approve the new set.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => setRegenerateMode(true)} className="bg-amber-600 hover:bg-amber-700">
                          Regenerate
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button onClick={handleGenerate} disabled={!selectedClinicId || !topics || isGenerating} size="sm" className="gap-1.5">
                  {isGenerating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {isGenerating ? "Generating..." : regenerateMode ? "Regenerate 4 Posts" : "Generate 4 Posts"}
                </Button>
                {regenerateMode && (
                  <Button onClick={() => { setRegenerateMode(false); setGeneratedPosts([]); setComplianceScan(null); }} variant="ghost" size="sm" className="text-muted-foreground">
                    Cancel
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Config Summary */}
      {selectedConfig && (
        <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-border/40 bg-muted/30">
            <CardContent className="py-3 px-4">
              <div className="flex flex-wrap gap-3 text-xs">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <MapPin className="h-3 w-3" /> {selectedConfig.neighbourhood || 'No neighbourhood'}
                </div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Phone className="h-3 w-3" /> {selectedConfig.phone_number || 'No phone'}
                </div>
                <Badge variant="outline" className="text-[10px]">Type {selectedConfig.hospital_type || '?'}</Badge>
                <Badge variant="outline" className="text-[10px]">Variant {selectedConfig.topic_variant_current || '?'}</Badge>
                <Badge variant="outline" className="text-[10px]">Hook: {hookStyle}</Badge>
                {selectedConfig.jurisdiction && <Badge variant="outline" className="text-[10px]">{selectedConfig.jurisdiction}</Badge>}
              </div>
              {topics && (
                <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                  {['week_1_topic', 'week_2_topic', 'week_3_topic', 'week_4_topic'].map((key, i) => (
                    <div key={key} className="text-[11px] bg-background/60 rounded px-2 py-1.5 border border-border/30">
                      <span className="font-medium text-muted-foreground">W{i+1}:</span>{' '}
                      {(topics as any)[key]}
                    </div>
                  ))}
                </div>
              )}
              {!topics && <p className="text-[11px] text-amber-500 mt-2">⚠ No topics found for {MONTH_NAMES[selectedMonth - 1]} variant {selectedConfig.topic_variant_current || 'A'}. Seed the Topic Library first.</p>}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Approved Posts for this month */}
      {hasApprovedPosts && !isGenerating && generatedPosts.length === 0 && (
        <>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-sm font-medium text-foreground">Approved Posts — {MONTH_NAMES[selectedMonth - 1]} {selectedYear}</span>
            <Badge variant="secondary" className="text-[10px]">{approvedPosts!.length} posts</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {approvedPosts!.map((post, idx) => (
              <motion.div key={post.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
                <Card className="border-green-500/30 h-full">
                  <CardHeader className="pb-2 pt-3 px-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-green-500" />
                        Week {post.week_number} — {post.topic}
                      </CardTitle>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px]">{post.post_type.replace('_', ' ')}</Badge>
                        <Badge className="bg-green-600/20 text-green-400 border-green-500/30 text-[10px]">Approved</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-3">
                    <p className="text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap">{post.post_content}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {post.hook_style && <Badge variant="secondary" className="text-[10px]">{post.hook_style}</Badge>}
                      <Badge variant="outline" className="text-[10px]">{post.primary_keyword}</Badge>
                      {post.secondary_keywords?.map((k: string, ki: number) => (
                        <Badge key={ki} variant="outline" className="text-[10px] opacity-70">{k}</Badge>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/30">
                      <span>{post.word_count}w</span>
                      {post.local_landmark_used && post.local_landmark_used !== 'none' && (
                        <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{post.local_landmark_used}</span>
                      )}
                      {post.cta_url && (
                        <a href={post.cta_url} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 hover:text-primary transition-colors">
                          <ExternalLink className="h-2.5 w-2.5" />{post.cta_text}
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </>
      )}

      {isGenerating && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1,2,3,4].map(i => (
            <Card key={i} className="border-border/40">
              <CardContent className="py-4 px-4 space-y-3">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Generated Posts */}
      {generatedPosts.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {generatedPosts.map((post, idx) => (
              <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}>
                <Card className="border-border/50 h-full">
                  <CardHeader className="pb-2 pt-3 px-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-primary" />
                        Week {post.week_number} — {post.topic}
                      </CardTitle>
                      <Badge variant="outline" className="text-[10px]">{post.post_type.replace('_', ' ')}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-3">
                    <p className="text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap">{post.post_content}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="secondary" className="text-[10px]">{post.hook_style}</Badge>
                      <Badge variant="outline" className="text-[10px]">{post.primary_keyword}</Badge>
                      {post.secondary_keywords?.map((k, ki) => (
                        <Badge key={ki} variant="outline" className="text-[10px] opacity-70">{k}</Badge>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/30">
                      <span>{post.word_count}w</span>
                      {post.local_landmark_used && post.local_landmark_used !== 'none' && (
                        <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{post.local_landmark_used}</span>
                      )}
                      {post.cta_url && (
                        <a href={post.cta_url} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 hover:text-primary transition-colors">
                          <ExternalLink className="h-2.5 w-2.5" />{post.cta_text}
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Compliance Scan */}
          {complianceScan && <ComplianceScanDisplay scan={complianceScan} onFixIssues={handleFixIssues} isFixing={isFixing} />}

          {/* Bulk Actions */}
          {role === 'admin' && (
            <div className="flex items-center gap-2 pt-2">
              <Button onClick={handleSave} disabled={isSaving} variant="outline" size="sm" className="gap-1.5">
                <Save className="h-3.5 w-3.5" />
                Save as Draft
              </Button>
              <Button onClick={handleApproveAll} disabled={isSaving} size="sm" className="gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Approve All
              </Button>
              <Button onClick={handleGenerate} disabled={isGenerating} variant="ghost" size="sm" className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerate
              </Button>
            </div>
          )}
          {role === 'concierge' && (
            <div className="flex items-center gap-2 pt-2">
              <Button onClick={handleSave} disabled={isSaving} variant="outline" size="sm" className="gap-1.5">
                <Save className="h-3.5 w-3.5" />
                Save as Draft
              </Button>
              <Button onClick={handleGenerate} disabled={isGenerating} variant="ghost" size="sm" className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerate
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
