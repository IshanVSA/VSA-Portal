import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, RefreshCw, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";
import { toast } from "sonner";
import { VoiceDictation } from "./VoiceDictation";

export interface ContentPreviewData {
  title: string;
  description: string;
  caption: string;
  cta: string;
  hashtags?: string;
  visual_direction?: string;
  concierge_brief?: string;
}

interface ContentRequestFormProps {
  onChange: (description: string) => void;
  clinicId?: string;
  onPreviewChange?: (preview: ContentPreviewData | null) => void;
}

export function ContentRequestForm({ onChange, clinicId, onPreviewChange }: ContentRequestFormProps) {
  const [campaign, setCampaign] = useState("");
  const [notes, setNotes] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [caption, setCaption] = useState("");
  const [cta, setCta] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [visualDirection, setVisualDirection] = useState("");
  const [conciergeBrief, setConciergeBrief] = useState("");
  const [generating, setGenerating] = useState(false);
  const [hasPreview, setHasPreview] = useState(false);
  const [showRegen, setShowRegen] = useState(false);
  const [changeNotes, setChangeNotes] = useState("");

  useEffect(() => {
    const lines = [
      "Content Request (Social Media):",
      `Campaign: ${campaign || "N/A"}`,
      `Notes: ${notes || "N/A"}`,
    ];
    if (hasPreview) {
      lines.push(
        "",
        "--- AI Preview ---",
        `Title: ${title}`,
        `Description: ${description}`,
        `Caption: ${caption}`,
        `CTA: ${cta}`,
        `Hashtags: ${hashtags}`,
        "",
        "--- Visual Direction ---",
        visualDirection,
        "",
        "--- Concierge Production Brief ---",
        conciergeBrief,
      );
    }
    onChange(lines.join("\n"));
  }, [campaign, notes, title, description, caption, cta, hashtags, visualDirection, conciergeBrief, hasPreview, onChange]);

  useEffect(() => {
    if (hasPreview) {
      onPreviewChange?.({ title, description, caption, cta, hashtags, visual_direction: visualDirection, concierge_brief: conciergeBrief });
    } else {
      onPreviewChange?.(null);
    }
  }, [hasPreview, title, description, caption, cta, hashtags, visualDirection, conciergeBrief, onPreviewChange]);

  const runGenerate = async (withChangeNotes?: string) => {
    if (!campaign.trim()) {
      toast.error("Please enter your campaign or promotion details first.");
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-content-preview", {
        body: {
          clinic_id: clinicId,
          campaign: campaign.trim(),
          notes: notes.trim(),
          change_notes: withChangeNotes?.trim() || undefined,
          previous: hasPreview && withChangeNotes ? { title, description, caption, cta, hashtags, visual_direction: visualDirection, concierge_brief: conciergeBrief } : undefined,
        },
      });
      if (error) throw error;
      const p = (data as any)?.preview;
      if (!p) throw new Error("No preview returned");
      setTitle(p.title || "");
      setDescription(p.description || "");
      setCaption(p.caption || "");
      setCta(p.cta || "");
      setHashtags(p.hashtags || "");
      setVisualDirection(p.visual_direction || "");
      setConciergeBrief(p.concierge_brief || "");
      setHasPreview(true);
      if (withChangeNotes) {
        setShowRegen(false);
        setChangeNotes("");
      }
    } catch (err) {
      const msg = await extractEdgeFunctionError(err, "Failed to generate preview");
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
        This request will be created as a <strong className="text-foreground">social media post</strong> for your clinic. Generate an AI preview first, tweak it if you want, then create the ticket. After the team uploads the finished graphic you'll be asked to approve it.
      </div>

      <VoiceDictation
        formType="Content Request"
        onFieldsExtracted={(f) => {
          if (typeof f.campaign === "string") setCampaign(f.campaign);
          else if (typeof f.description === "string") setCampaign(f.description);
          if (typeof f.notes === "string") setNotes(f.notes);
        }}
      />

      <div className="space-y-1.5">
        <Label>Campaign / Promotion details *</Label>
        <Textarea
          placeholder="e.g. Free exam with any vaccination appointment this month"
          value={campaign}
          onChange={(e) => setCampaign(e.target.value)}
          rows={4}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Additional notes</Label>
        <Textarea
          placeholder="Dates, audience, tone, links, anything else worth knowing..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>

      {!hasPreview && (
        <div className="space-y-2">
          <Button
            type="button"
            onClick={() => runGenerate()}
            disabled={generating || !campaign.trim()}
            className="w-full"
          >
            {generating ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating preview...</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" /> Generate AI preview</>
            )}
          </Button>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            <span>or</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Skip the AI preview and submit your request as-is. The concierge team will build it from your notes.
          </p>
        </div>
      )}

      {hasPreview && (
        <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-primary">
            AI-generated preview
          </div>
          <div className="space-y-1.5">
            <Label>Post Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Post Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label>Suggested Caption / Script</Label>
            <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={5} />
          </div>
          <div className="space-y-1.5">
            <Label>CTA</Label>
            <Input value={cta} onChange={(e) => setCta(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Hashtags</Label>
            <Textarea value={hashtags} onChange={(e) => setHashtags(e.target.value)} rows={2} placeholder="#VetCare #PetHealth ..." />
          </div>
          <div className="space-y-1.5">
            <Label>Visual direction</Label>
            <Textarea value={visualDirection} onChange={(e) => setVisualDirection(e.target.value)} rows={4} placeholder="Subject, mood, palette, composition, on-image text..." />
          </div>
          <div className="space-y-1.5">
            <Label>Concierge production brief</Label>
            <Textarea
              value={conciergeBrief}
              onChange={(e) => setConciergeBrief(e.target.value)}
              rows={10}
              placeholder="Step-by-step checklist for the designer / concierge team."
              className="font-mono text-xs leading-relaxed"
            />
            <p className="text-[11px] text-muted-foreground">
              Step-by-step guide the internal team will use to build this post (objective, audience, platforms, format, visuals, compliance, posting time).
            </p>
          </div>

          {!showRegen ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowRegen(true)}
              className="w-full"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-2" /> Regenerate with changes
            </Button>
          ) : (
            <div className="space-y-2 rounded-lg border border-border/60 bg-background/50 p-3">
              <Label className="text-xs">What would you like to change?</Label>
              <Textarea
                value={changeNotes}
                onChange={(e) => setChangeNotes(e.target.value)}
                placeholder="e.g. make the tone more playful, mention 20% off, shorter caption"
                rows={3}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => runGenerate(changeNotes)}
                  disabled={generating || !changeNotes.trim()}
                  className="flex-1"
                >
                  {generating ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> Regenerating…</>
                  ) : (
                    <><Wand2 className="h-3.5 w-3.5 mr-2" /> Regenerate</>
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => { setShowRegen(false); setChangeNotes(""); }}
                  disabled={generating}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Tweak any field directly, or describe the changes and regenerate. When you're happy, click <strong className="text-foreground">Create Ticket</strong>.
          </p>
        </div>
      )}
    </div>
  );
}
