import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RefreshCw, Save, Eye, Code } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  filePath: string;
  onClose: () => void;
}

export default function HtmlEditorDialog({ filePath, onClose }: Props) {
  const [htmlContent, setHtmlContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"visual" | "code">("visual");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const fetchHtml = async () => {
      try {
        const { data } = supabase.storage.from("department-files").getPublicUrl(filePath);
        const res = await fetch(data.publicUrl);
        if (!res.ok) throw new Error("Failed to fetch");
        setHtmlContent(await res.text());
      } catch (err) {
        console.error("Failed to load HTML:", err);
        toast.error("Failed to load content for editing");
      } finally {
        setLoading(false);
      }
    };
    fetchHtml();
  }, [filePath]);

  // Sync iframe content back to state when switching away from visual mode
  const syncFromIframe = useCallback(() => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc) {
        setHtmlContent("<!DOCTYPE html>" + doc.documentElement.outerHTML);
      }
    } catch {
      // cross-origin safety
    }
  }, []);

  const handleTabSwitch = (tab: "visual" | "code") => {
    if (activeTab === "visual" && tab === "code") {
      syncFromIframe();
    }
    setActiveTab(tab);
  };

  // Inject contentEditable into the iframe body when it loads
  const handleIframeLoad = () => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc?.body) {
        doc.body.contentEditable = "true";
        doc.body.style.outline = "none";
        doc.body.style.cursor = "text";
        // Add a subtle editing indicator border
        doc.body.style.minHeight = "100%";
      }
    } catch {
      // cross-origin safety
    }
  };

  const handleSave = async () => {
    // Sync latest from iframe if in visual mode
    if (activeTab === "visual") {
      syncFromIframe();
      // Small delay to let state update
      await new Promise(r => setTimeout(r, 50));
    }

    setSaving(true);
    try {
      // Get the latest content
      let contentToSave = htmlContent;
      if (activeTab === "visual") {
        try {
          const doc = iframeRef.current?.contentDocument;
          if (doc) {
            contentToSave = "<!DOCTYPE html>" + doc.documentElement.outerHTML;
          }
        } catch { /* ignore */ }
      }

      const blob = new Blob([contentToSave], { type: "text/html" });
      const { error } = await supabase.storage
        .from("department-files")
        .upload(filePath, blob, { upsert: true });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["sm2-generations"] });
      toast.success("Content saved successfully");
      onClose();
    } catch (err: any) {
      console.error("Failed to save:", err);
      toast.error("Failed to save: " + (err.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle>Edit Content</DialogTitle>
            <div className="flex gap-1 border rounded-lg p-0.5">
              <Button
                variant={activeTab === "visual" ? "default" : "ghost"}
                size="sm"
                onClick={() => handleTabSwitch("visual")}
                className="gap-1.5 h-7 text-xs"
              >
                <Eye className="h-3.5 w-3.5" /> Visual
              </Button>
              <Button
                variant={activeTab === "code" ? "default" : "ghost"}
                size="sm"
                onClick={() => handleTabSwitch("code")}
                className="gap-1.5 h-7 text-xs"
              >
                <Code className="h-3.5 w-3.5" /> Code
              </Button>
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center flex-1">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 min-h-0">
            {activeTab === "visual" ? (
              <iframe
                ref={iframeRef}
                srcDoc={htmlContent}
                className="w-full h-full rounded-lg border bg-white"
                sandbox="allow-same-origin allow-scripts"
                title="Visual Editor"
                onLoad={handleIframeLoad}
              />
            ) : (
              <Textarea
                value={htmlContent}
                onChange={(e) => setHtmlContent(e.target.value)}
                className="w-full h-full font-mono text-xs resize-none"
                style={{ minHeight: "100%", height: "100%" }}
              />
            )}
          </div>
        )}

        <DialogFooter className="flex-shrink-0">
          <p className="text-xs text-muted-foreground mr-auto">
            {activeTab === "visual" ? "Click on any text to edit it directly" : "Edit raw HTML code"}
          </p>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || loading} className="gap-2">
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
