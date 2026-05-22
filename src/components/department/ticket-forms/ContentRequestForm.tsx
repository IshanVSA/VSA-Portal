import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";
import { toast } from "sonner";
import { VoiceDictation } from "./VoiceDictation";

interface ContentRequestFormProps {
  onChange: (description: string) => void;
  clinicId?: string;
}

export function ContentRequestForm({ onChange, clinicId }: ContentRequestFormProps) {
  const [campaign, setCampaign] = useState("");
  const [notes, setNotes] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [caption, setCaption] = useState("");
  const [cta, setCta] = useState("");
  const [generating, setGenerating] = useState(false);
  const [hasPreview, setHasPreview] = useState(false);

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
      );
    }
    onChange(lines.join("\n"));
  }, [campaign, notes, title, description, caption, cta, hasPreview, onChange]);

  const handleGenerate = async () => {
    if (!campaign.trim()) {
      toast.error("Please enter your campaign or promotion details first.");
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-content-preview", {
        body: { clinic_id: clinicId, campaign: campaign.trim(), notes: notes.trim() },
      });
      if (error) throw error;
      const p = (data as any)?.preview;
      if (!p) throw new Error("No preview returned");
      setTitle(p.title || "");
      setDescription(p.description || "");
      setCaption(p.caption || "");
      setCta(p.cta || "");
      setHasPreview(true);
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
        This request will be created as a <strong className="text-foreground">social media post</strong> for your clinic. Just describe your promotion or campaign and our AI will draft a preview for you to review.
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

      <Button
        type="button"
        onClick={handleGenerate}
        disabled={generating || !campaign.trim()}
        className="w-full"
      >
        {generating ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating preview...</>
        ) : hasPreview ? (
          <><RefreshCw className="h-4 w-4 mr-2" /> Regenerate preview</>
        ) : (
          <><Sparkles className="h-4 w-4 mr-2" /> Generate AI preview</>
        )}
      </Button>

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
          <p className="text-xs text-muted-foreground">
            Feel free to tweak any field before submitting. This is a draft direction for our team.
          </p>
        </div>
      )}
    </div>
  );
}
