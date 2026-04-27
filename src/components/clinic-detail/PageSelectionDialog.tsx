import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface MetaPage {
  id: string;
  name: string;
  access_token: string;
  category: string;
}

interface PageSelectionDialogProps {
  open: boolean;
  pages: MetaPage[];
  clinicId: string;
  grantedScopes?: string[];
  onClose: () => void;
  onConnected: () => void;
}

export function PageSelectionDialog({ open, pages, clinicId, grantedScopes, onClose, onConnected }: PageSelectionDialogProps) {
  const [selectedPageId, setSelectedPageId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const filteredPages = pages.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleConnect = async () => {
    const page = pages.find(p => p.id === selectedPageId);
    if (!page) return;

    setSaving(true);
    const { error } = await supabase.functions.invoke("save-meta-page", {
      body: {
        clinic_id: clinicId,
        page_id: page.id,
        page_name: page.name,
        page_access_token: page.access_token,
        granted_scopes: grantedScopes || [],
      },
    });
    setSaving(false);

    if (error) {
      toast.error("Failed to save page connection: " + error.message);
      return;
    }

    toast.success(`Connected to ${page.name}`);
    onConnected();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Select a Facebook Page</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Choose which Facebook Page to connect to this clinic.
          </p>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search pages..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <RadioGroup value={selectedPageId} onValueChange={setSelectedPageId} className="space-y-2 my-4">
          {filteredPages.map((page) => (
            <label
              key={page.id}
              className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                selectedPageId === page.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <RadioGroupItem value={page.id} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground truncate">{page.name}</p>
                {page.category && (
                  <p className="text-xs text-muted-foreground">{page.category}</p>
                )}
              </div>
            </label>
          ))}
        </RadioGroup>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleConnect} disabled={!selectedPageId || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Connect Page
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
