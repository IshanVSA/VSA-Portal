import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, FileText, BarChart3, Settings, Copy, Check, AlertTriangle, Clock, ExternalLink, Loader2, Star, ChevronDown, ChevronUp } from "lucide-react";
import { useBlogPosts, type BlogPost } from "@/hooks/useBlogPosts";
import { useUserRole } from "@/hooks/useUserRole";
import { preprocessBlogHtml, parseGenerationHeader, parseBlogFromOutput, parseSchemaBlocks, parseQAReport } from "@/lib/blog-html-preprocessor";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

// ─── Copy Button Helper ─────────────────────────────
function CopyField({ label, value, charCount }: { label: string; value: string; charCount?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 px-2 rounded bg-muted/30 text-sm">
      <div className="flex-1 min-w-0">
        <span className="font-medium text-muted-foreground text-xs">{label}</span>
        {charCount && <span className="text-[10px] text-muted-foreground ml-1">({charCount})</span>}
        <p className="truncate text-foreground">{value || "—"}</p>
      </div>
      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleCopy} disabled={!value}>
        {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

// ─── Blog Card (Publishing Panel) ────────────────────
function BlogCard({ post, blogNum, clinicId }: { post: BlogPost; blogNum: 1 | 2 | 3; clinicId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [imageFilename, setImageFilename] = useState(post[`image_filename_${blogNum}` as keyof BlogPost] as string || "");
  const [publishUrl, setPublishUrl] = useState("");
  const [marking, setMarking] = useState(false);
  const queryClient = useQueryClient();

  const topic = post[`blog_${blogNum}_topic` as keyof BlogPost] as string;
  const type = post[`blog_${blogNum}_type` as keyof BlogPost] as string;
  const status = post[`blog_${blogNum}_status` as keyof BlogPost] as string;
  const slug = post[`blog_${blogNum}_slug` as keyof BlogPost] as string;
  const url = post[`blog_${blogNum}_url` as keyof BlogPost] as string;
  const publishDate = post[`publish_date_${blogNum}` as keyof BlogPost] as string;

  if (!topic && status === "NONE") return null;

  const meta = parseBlogFromOutput(post.raw_output_text || "", blogNum);
  const schema = parseSchemaBlocks(post.raw_output_text || "", blogNum);
  const schemaWithImage = schema.replace(/\[IMAGE_FILENAME\]/g, imageFilename || "[IMAGE_FILENAME]");
  const { html, unresolvedKeywords } = preprocessBlogHtml(meta?.blogBody || "");

  const isPillar = type === "PILLAR";
  const statusColor = status === "PUBLISHED" ? "bg-green-500/10 text-green-700" : status === "READY" ? "bg-blue-500/10 text-blue-700" : "bg-amber-500/10 text-amber-700";

  const handleMarkPublished = async () => {
    if (!publishUrl) { toast.error("Enter the live blog URL first"); return; }
    setMarking(true);
    try {
      await supabase.from("blog_posts").update({
        [`blog_${blogNum}_url`]: publishUrl,
        [`blog_${blogNum}_status`]: "PUBLISHED",
        [`blog_${blogNum}_confirmed`]: true,
        [`image_filename_${blogNum}`]: imageFilename,
        marked_published_at: new Date().toISOString(),
      } as any).eq("id", post.id);
      queryClient.invalidateQueries({ queryKey: ["blog-posts", clinicId] });
      toast.success(`Blog ${blogNum} marked as published`);
    } catch { toast.error("Failed to mark as published"); }
    setMarking(false);
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="py-3 px-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground">Blog {blogNum}</span>
            {isPillar && <Badge variant="outline" className="gap-1 text-[10px]"><Star className="h-3 w-3" /> Pillar</Badge>}
            <Badge className={`text-[10px] ${statusColor}`}>{status}</Badge>
          </div>
          <div className="flex items-center gap-2">
            {publishDate && <span className="text-xs text-muted-foreground">{publishDate}</span>}
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
        <p className="text-sm font-medium mt-1">{topic || "—"}</p>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0 space-y-3">
          {meta && (
            <div className="space-y-1.5">
              <CopyField label="Post Title (H1)" value={meta.metaTitle?.replace(/\(\d+ chars?\)/g, "").trim()} />
              <CopyField label="SEO Title" value={meta.seoTitle?.replace(/\(\d+ chars?\)/g, "").trim()} charCount={`${meta.seoTitle?.length || 0} chars`} />
              <CopyField label="Meta Description" value={meta.metaDescription?.replace(/\(\d+ chars?\)/g, "").trim()} charCount={`${meta.metaDescription?.length || 0} chars`} />
              <CopyField label="Focus Keyword" value={meta.focusKeyword} />
              <CopyField label="URL Slug" value={slug || meta.urlSlug} />
              <CopyField label="Category" value={meta.category} />
              <CopyField label="Image Alt Text" value={meta.imageAltText} />
              <CopyField label="Getty Search Terms" value={meta.gettySearchTerms} />
            </div>
          )}

          {/* Blog Body HTML */}
          <div className="space-y-1">
            <Label className="text-xs">Blog Body HTML</Label>
            {unresolvedKeywords.length > 0 && (
              <div className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Unresolved keywords: {unresolvedKeywords.join(", ")}
              </div>
            )}
            <div className="relative">
              <Textarea className="text-xs font-mono h-32" value={html} readOnly />
              <Button size="sm" variant="outline" className="absolute top-1 right-1 h-6 text-[10px]" onClick={() => { navigator.clipboard.writeText(html); toast.success("HTML copied"); }}>
                <Copy className="h-3 w-3 mr-1" /> Copy HTML
              </Button>
            </div>
          </div>

          {/* Schema */}
          <div className="space-y-1">
            <Label className="text-xs">Schema (3 blocks)</Label>
            <div className="relative">
              <Textarea className="text-xs font-mono h-24" value={schemaWithImage} readOnly />
              <Button size="sm" variant="outline" className="absolute top-1 right-1 h-6 text-[10px]" onClick={() => { navigator.clipboard.writeText(schemaWithImage); toast.success("Schema copied"); }}>
                <Copy className="h-3 w-3 mr-1" /> Copy Schema
              </Button>
            </div>
          </div>

          {/* Image Filename */}
          <div className="space-y-1">
            <Label className="text-xs">Image Filename</Label>
            <Input className="h-8 text-xs" placeholder="e.g. burnaby-dental-care.jpg" value={imageFilename} onChange={(e) => setImageFilename(e.target.value)} />
          </div>

          {/* Mark Published */}
          {status !== "PUBLISHED" && (
            <div className="space-y-2 pt-2 border-t border-border/40">
              <p className="text-xs text-muted-foreground">Have you linked to this blog from a relevant service page?</p>
              <Input className="h-8 text-xs" placeholder="Enter live blog URL..." value={publishUrl} onChange={(e) => setPublishUrl(e.target.value)} />
              <Button size="sm" className="w-full h-8 text-xs" disabled={!publishUrl || !imageFilename || marking || !post.verification_complete} onClick={handleMarkPublished}>
                {marking ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Mark as Published
              </Button>
            </div>
          )}
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1">
              <ExternalLink className="h-3 w-3" /> View Live
            </a>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Client Blog View ────────────────────────────────
function ClientBlogView({ post, clinicId }: { post: BlogPost; clinicId: string }) {
  const [remarkBlog, setRemarkBlog] = useState<string>("");
  const [remarkType, setRemarkType] = useState<string>("");
  const [remarkDetail, setRemarkDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const handleApproveAll = async () => {
    await supabase.from("blog_posts").update({
      approval_type: "APPROVED_CLIENT",
      approval_timestamp: new Date().toISOString(),
    } as any).eq("id", post.id);
    queryClient.invalidateQueries({ queryKey: ["blog-posts", clinicId] });
    toast.success("All blogs approved!");
  };

  const handleSubmitRemark = async () => {
    if (!remarkBlog || !remarkType || remarkDetail.length < 20) {
      toast.error("Please complete all remark fields (minimum 20 characters)");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("adjust-blog-remark", {
        body: { blog_post_id: post.id, blog_number: parseInt(remarkBlog), remark_type: remarkType, remark_detail: remarkDetail },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["blog-posts", clinicId] });
      toast.success("Feedback submitted and content updated");
      setRemarkDetail("");
      setRemarkType("");
      setRemarkBlog("");
    } catch (err: any) {
      toast.error(err.message || "Failed to submit remark");
    }
    setSubmitting(false);
  };

  const renderClientBlog = (num: 1 | 2 | 3) => {
    const topic = post[`blog_${num}_topic` as keyof BlogPost] as string;
    const type = post[`blog_${num}_type` as keyof BlogPost] as string;
    const status = post[`blog_${num}_status` as keyof BlogPost] as string;
    const url = post[`blog_${num}_url` as keyof BlogPost] as string;
    const publishDate = post[`publish_date_${num}` as keyof BlogPost] as string;

    if (!topic && status === "NONE") return null;

    const meta = parseBlogFromOutput(post.raw_output_text || "", num);
    const { html } = preprocessBlogHtml(meta?.blogBody || "");

    return (
      <Card key={num} className="border-border/60">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {type === "PILLAR" ? (
                <Badge variant="outline" className="gap-1 text-[10px]"><Star className="h-3 w-3" /> In-Depth Guide</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">Blog Post</Badge>
              )}
            </div>
            {publishDate && <span className="text-xs text-muted-foreground">{publishDate}</span>}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: html }} />
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 mt-3">
              <ExternalLink className="h-3 w-3" /> View Live
            </a>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      {/* Status Timeline */}
      <Card className="border-border/60">
        <CardContent className="py-3">
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1"><Clock className="h-3 w-3 text-muted-foreground" /> Created {new Date(post.generation_date).toLocaleDateString()}</div>
            {post.approval_type && <Badge variant="outline" className="text-[10px]">{post.approval_type === "APPROVED_CLIENT" ? "Approved" : post.approval_type}</Badge>}
          </div>
        </CardContent>
      </Card>

      {/* Blog Content */}
      {renderClientBlog(1)}
      {renderClientBlog(2)}
      {renderClientBlog(3)}

      {/* Approve / Remark */}
      {!post.approval_type && (
        <Card className="border-border/60">
          <CardContent className="py-4 space-y-3">
            <Button className="w-full" onClick={handleApproveAll}>Approve All Blogs</Button>

            {post.remark_round < 2 && (
              <div className="space-y-2 pt-3 border-t border-border/40">
                <p className="text-xs font-medium">Leave feedback on a specific blog</p>
                <Select value={remarkBlog} onValueChange={setRemarkBlog}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select blog" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Blog 1</SelectItem>
                    <SelectItem value="2">Blog 2</SelectItem>
                    <SelectItem value="3">Blog 3</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={remarkType} onValueChange={setRemarkType}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Remark type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Remove something">Remove something</SelectItem>
                    <SelectItem value="Add something">Add something</SelectItem>
                    <SelectItem value="Change wording">Change wording</SelectItem>
                    <SelectItem value="Factual correction">Factual correction</SelectItem>
                    <SelectItem value="Topic change">Topic change</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea className="text-xs min-h-[60px]" placeholder="Describe specifically what you'd like changed (minimum 20 characters)..." value={remarkDetail} onChange={(e) => setRemarkDetail(e.target.value)} />
                <Button size="sm" variant="outline" className="w-full text-xs" onClick={handleSubmitRemark} disabled={submitting || !remarkBlog || !remarkType || remarkDetail.length < 20}>
                  {submitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Submit Feedback
                </Button>
              </div>
            )}
            {post.remark_round >= 2 && (
              <p className="text-xs text-muted-foreground text-center">Feedback rounds are complete for this month's blogs.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Prompt Manager ──────────────────────────────────
function PromptManager({ versions, isAdmin }: { versions: any[]; isAdmin: boolean }) {
  const [showUpload, setShowUpload] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newText, setNewText] = useState("");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();

  const handleUpload = async () => {
    if (!newLabel || !newText) return;
    setUploading(true);
    try {
      // Set all to not current
      for (const v of versions.filter(v => v.is_current)) {
        await supabase.from("blog_prompt_versions").update({ is_current: false }).eq("id", v.id);
      }
      await supabase.from("blog_prompt_versions").insert({
        version_label: newLabel,
        prompt_text: newText,
        is_current: true,
        change_notes: notes,
        approved_date: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["blog-prompt-versions"] });
      toast.success("New prompt version uploaded");
      setShowUpload(false);
      setNewLabel("");
      setNewText("");
      setNotes("");
    } catch { toast.error("Upload failed"); }
    setUploading(false);
  };

  return (
    <div className="space-y-3">
      {isAdmin && (
        <Button size="sm" variant="outline" onClick={() => setShowUpload(!showUpload)}>
          {showUpload ? "Cancel" : "Upload New Version"}
        </Button>
      )}
      {showUpload && (
        <Card className="border-border/60">
          <CardContent className="pt-4 space-y-2">
            <Input className="h-8 text-xs" placeholder="Version label (e.g. v1.8)" value={newLabel} onChange={e => setNewLabel(e.target.value)} />
            <Textarea className="text-xs min-h-[200px] font-mono" placeholder="Paste full system prompt..." value={newText} onChange={e => setNewText(e.target.value)} />
            <Input className="h-8 text-xs" placeholder="Change notes..." value={notes} onChange={e => setNotes(e.target.value)} />
            <Button size="sm" className="w-full" onClick={handleUpload} disabled={uploading || !newLabel || !newText}>
              {uploading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Approve & Upload
            </Button>
          </CardContent>
        </Card>
      )}
      <div className="space-y-2">
        {versions?.map(v => (
          <Card key={v.id} className="border-border/60">
            <CardContent className="py-3 flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">{v.version_label}</span>
                {v.is_current && <Badge className="ml-2 text-[10px] bg-green-500/10 text-green-700">Current</Badge>}
                <p className="text-xs text-muted-foreground">{v.change_notes || "No notes"} · {v.generation_count} generations</p>
              </div>
              {isAdmin && !v.is_current && (
                <Button size="sm" variant="ghost" className="text-xs" onClick={async () => {
                  for (const ver of versions.filter(vv => vv.is_current)) {
                    await supabase.from("blog_prompt_versions").update({ is_current: false }).eq("id", ver.id);
                  }
                  await supabase.from("blog_prompt_versions").update({ is_current: true }).eq("id", v.id);
                  queryClient.invalidateQueries({ queryKey: ["blog-prompt-versions"] });
                  toast.success(`Restored ${v.version_label}`);
                }}>Restore</Button>
              )}
            </CardContent>
          </Card>
        ))}
        {(!versions || versions.length === 0) && (
          <p className="text-sm text-muted-foreground text-center py-4">No prompt versions uploaded yet. Upload the OneURL Blog Prompt v1.7 to get started.</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Blog Tab ───────────────────────────────────
export function BlogTab({ clinicId }: { clinicId: string | undefined }) {
  const { role } = useUserRole();
  const isClient = role === "client";
  const isAdmin = role === "admin";
  const { blogPosts, latestPost, tracker, promptVersions, currentPrompt, isLoading, generate, hasActiveJob } = useBlogPosts(clinicId);
  const [subTab, setSubTab] = useState(isClient ? "my-blogs" : "overview");
  const [emergencyTopic, setEmergencyTopic] = useState("");

  if (!clinicId) {
    return <p className="text-sm text-muted-foreground text-center py-8">Select a clinic to view blog content.</p>;
  }

  const staffSubTabs = [
    { value: "overview", label: "Overview", icon: BarChart3 },
    { value: "publishing", label: "Publishing", icon: FileText },
    { value: "tracker", label: "Tracker", icon: BookOpen },
    { value: "prompts", label: "Prompts", icon: Settings },
  ];

  const clientSubTabs = [
    { value: "my-blogs", label: "My Blogs", icon: BookOpen },
    { value: "history", label: "Blog History", icon: Clock },
  ];

  const tabs = isClient ? clientSubTabs : staffSubTabs;

  return (
    <div className="space-y-4">
      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="h-8 p-0.5">
          {tabs.map(t => (
            <TabsTrigger key={t.value} value={t.value} className="text-xs gap-1 px-2.5 h-7">
              <t.icon className="h-3 w-3" />{t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ─── Staff: Overview ─── */}
        <TabsContent value="overview" className="mt-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="border-border/60">
              <CardContent className="py-3 text-center">
                <p className="text-2xl font-bold">{tracker?.month_count || 0}</p>
                <p className="text-xs text-muted-foreground">Months Active</p>
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardContent className="py-3 text-center">
                <p className="text-2xl font-bold">{blogPosts?.filter(p => p.blog_1_status === "PUBLISHED").length || 0}</p>
                <p className="text-xs text-muted-foreground">Blogs Published</p>
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardContent className="py-3 text-center">
                <p className="text-2xl font-bold">{currentPrompt?.version_label || "None"}</p>
                <p className="text-xs text-muted-foreground">Prompt Version</p>
              </CardContent>
            </Card>
          </div>

          {/* Generation */}
          <Card className="border-border/60">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Generate Blog Content</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!currentPrompt && (
                <div className="flex items-center gap-2 text-amber-600 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5" /> No blog prompt uploaded. Go to Prompts tab first.
                </div>
              )}
              {hasActiveJob && (
                <div className="flex items-center gap-2 text-blue-600 text-xs p-2 rounded bg-blue-50 dark:bg-blue-950/30">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <div>
                    <span className="font-medium">Blog generation in progress.</span>
                    {blogPosts?.find(p => p.generation_status === "retrying") && (
                      <span className="ml-1">{blogPosts.find(p => p.generation_status === "retrying")?.failure_reason || "Auto-retrying..."}</span>
                    )}
                  </div>
                </div>
              )}
              <Button size="sm" onClick={() => generate.mutate({})} disabled={generate.isPending || !currentPrompt || hasActiveJob}>
                {generate.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Generate Monthly Blogs (3 posts)
              </Button>
              {isAdmin && (
                <div className="flex gap-2 pt-2 border-t border-border/40">
                  <Input className="h-8 text-xs flex-1" placeholder="Emergency topic (Admin only)..." value={emergencyTopic} onChange={e => setEmergencyTopic(e.target.value)} />
                  <Button size="sm" variant="outline" disabled={!emergencyTopic || generate.isPending || hasActiveJob} onClick={() => generate.mutate({ emergencyTopic })}>
                    Emergency Blog
                  </Button>
                </div>
              )}
              {latestPost && (
                <div className="text-xs text-muted-foreground pt-2">
                  <span>Last generation: {new Date(latestPost.generation_date).toLocaleDateString()} · Status: </span>
                  <Badge variant="outline" className={`text-[10px] ${
                    latestPost.generation_status === "completed" ? "bg-green-500/10 text-green-700" :
                    latestPost.generation_status === "failed" ? "bg-red-500/10 text-red-700" :
                    latestPost.generation_status === "retrying" ? "bg-amber-500/10 text-amber-700" :
                    "bg-blue-500/10 text-blue-700"
                  }`}>{latestPost.generation_status}</Badge>
                  <span> · QA: {latestPost.qa_status}</span>
                  {latestPost.failure_reason && latestPost.generation_status === "failed" && (
                    <p className="text-destructive mt-1">{latestPost.failure_reason}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Staff: Publishing Panel ─── */}
        <TabsContent value="publishing" className="mt-3 space-y-3">
          {latestPost ? (
            <>
              {/* Verification Gate */}
              <Card className="border-border/60">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" /> Verification Gate
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {parseGenerationHeader(latestPost.raw_output_text || "") && (
                    <div className="text-xs space-y-1">
                      <p>Hospital: {parseGenerationHeader(latestPost.raw_output_text || "")?.hospitalName}</p>
                      <p>Type: {latestPost.hospital_type_detected}</p>
                      <p>Jurisdiction: {latestPost.jurisdiction_detected} · {latestPost.governing_body_applied}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant={latestPost.verification_complete ? "default" : "outline"} className="text-xs h-7" onClick={async () => {
                      await supabase.from("blog_posts").update({ verification_complete: true } as any).eq("id", latestPost.id);
                      toast.success("Verification confirmed");
                    }}>
                      {latestPost.verification_complete ? <Check className="h-3 w-3 mr-1" /> : null}
                      {latestPost.verification_complete ? "Verified" : "Confirm Phone, Booking URL & Hours"}
                    </Button>
                  </div>
                  {latestPost.type_mismatch_flagged && (
                    <div className="text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Hospital type mismatch detected — review before publishing
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Blog Cards */}
              <BlogCard post={latestPost} blogNum={1} clinicId={clinicId!} />
              <BlogCard post={latestPost} blogNum={2} clinicId={clinicId!} />
              <BlogCard post={latestPost} blogNum={3} clinicId={clinicId!} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No blog posts generated yet.</p>
          )}
        </TabsContent>

        {/* ─── Staff: Tracker ─── */}
        <TabsContent value="tracker" className="mt-3">
          <Card className="border-border/60">
            <CardHeader className="py-3 px-4"><CardTitle className="text-sm">Blog Tracker</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Month Count:</span> {tracker?.month_count || 0}</div>
                <div><span className="text-muted-foreground">Next Pillar:</span> Month {tracker ? (Math.ceil((tracker.month_count + 1) / 3) * 3) : 3}</div>
              </div>
              {tracker?.published_slugs && Array.isArray(tracker.published_slugs) && tracker.published_slugs.length > 0 && (
                <div className="pt-2 border-t border-border/40">
                  <p className="text-xs font-medium mb-1">Published Slugs</p>
                  <div className="space-y-1">
                    {(tracker.published_slugs as any[]).slice(-12).map((s: any, i: number) => (
                      <div key={i} className="text-xs text-muted-foreground">{typeof s === "string" ? s : s.slug} {s.month && `(${s.month})`}</div>
                    ))}
                  </div>
                </div>
              )}
              {/* Generation History */}
              <div className="pt-2 border-t border-border/40">
                <p className="text-xs font-medium mb-1">Generation History</p>
                {blogPosts?.map(p => (
                  <div key={p.id} className="flex items-center justify-between text-xs py-1">
                    <span>{new Date(p.generation_date).toLocaleDateString()} · {p.generation_type}</span>
                    <Badge variant="outline" className="text-[10px]">{p.generation_status}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Staff: Prompts ─── */}
        <TabsContent value="prompts" className="mt-3">
          <PromptManager versions={promptVersions || []} isAdmin={isAdmin} />
        </TabsContent>

        {/* ─── Client: My Blogs ─── */}
        <TabsContent value="my-blogs" className="mt-3">
          {latestPost ? (
            <ClientBlogView post={latestPost} clinicId={clinicId!} />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No blog posts available yet.</p>
          )}
        </TabsContent>

        {/* ─── Client: Blog History ─── */}
        <TabsContent value="history" className="mt-3">
          <div className="space-y-2">
            {blogPosts?.filter(p => p.blog_1_status === "PUBLISHED" || p.blog_2_status === "PUBLISHED" || p.blog_3_status === "PUBLISHED").map(p => (
              <Card key={p.id} className="border-border/60">
                <CardContent className="py-3">
                  <div className="text-sm font-medium">{new Date(p.generation_date).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</div>
                  {[1, 2, 3].map(n => {
                    const url = p[`blog_${n}_url` as keyof BlogPost] as string;
                    const topic = p[`blog_${n}_topic` as keyof BlogPost] as string;
                    const type = p[`blog_${n}_type` as keyof BlogPost] as string;
                    if (!url) return null;
                    return (
                      <div key={n} className="flex items-center justify-between text-xs py-1">
                        <div className="flex items-center gap-2">
                          {type === "PILLAR" && <Star className="h-3 w-3 text-amber-500" />}
                          <span>{topic}</span>
                        </div>
                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary flex items-center gap-1">
                          View <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))}
            {(!blogPosts || blogPosts.filter(p => p.blog_1_status === "PUBLISHED").length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-8">No published blogs yet.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
