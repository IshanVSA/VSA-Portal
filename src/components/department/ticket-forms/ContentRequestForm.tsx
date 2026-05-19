import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VoiceDictation } from "./VoiceDictation";

interface ContentRequestFormProps {
  onChange: (description: string) => void;
}

type CategoryKey =
  | "business_cards"
  | "google_review_stand"
  | "posters"
  | "brochures"
  | "flyers"
  | "social_post"
  | "other";

const CATEGORIES: {
  value: CategoryKey;
  label: string;
  defaultTitle: string;
  defaultDescription: string;
  defaultNotes: string;
}[] = [
  {
    value: "business_cards",
    label: "Business Cards",
    defaultTitle: "Business Cards Request",
    defaultDescription:
      "Please design business cards for our clinic.\n• Quantity needed:\n• Staff names & roles to include:\n• Phone / email / website / address:\n• Single-sided or double-sided:",
    defaultNotes: "Preferred colors, finish (matte/gloss), or design references:",
  },
  {
    value: "google_review_stand",
    label: "Google Review Stand",
    defaultTitle: "Google Review Stand Request",
    defaultDescription:
      "Please design a Google review stand/card for our front desk.\n• Quantity needed:\n• Google review link / QR destination:\n• Clinic name & tagline to feature:",
    defaultNotes: "Stand type (acrylic, table-top card, etc.) and any design preferences:",
  },
  {
    value: "posters",
    label: "Posters",
    defaultTitle: "Poster Design Request",
    defaultDescription:
      "Please design a poster for our clinic.\n• Topic / message:\n• Size (A4, A3, etc.):\n• Quantity needed:\n• Where will it be displayed:",
    defaultNotes: "Design references, brand colors, or must-include elements:",
  },
  {
    value: "brochures",
    label: "Brochures",
    defaultTitle: "Brochure Design Request",
    defaultDescription:
      "Please design a brochure for our clinic.\n• Purpose / topic:\n• Fold type (bi-fold, tri-fold):\n• Sections / content to include:\n• Quantity needed:",
    defaultNotes: "Tone, design references, or must-include elements:",
  },
  {
    value: "flyers",
    label: "Flyers / Handouts",
    defaultTitle: "Flyer Design Request",
    defaultDescription:
      "Please design a flyer for our clinic.\n• Purpose / offer / topic:\n• Size:\n• Quantity needed:\n• Distribution plan:",
    defaultNotes: "Brand colors, references, or must-include elements:",
  },
  {
    value: "social_post",
    label: "Social Media Post",
    defaultTitle: "Social Media Post Request",
    defaultDescription:
      "Please create a social media post.\n• Topic / message:\n• Platform(s) (Instagram, Facebook, etc.):\n• Preferred publish date:\n• Call to action:",
    defaultNotes: "Tone, references, or links:",
  },
  {
    value: "other",
    label: "Other",
    defaultTitle: "Content Request",
    defaultDescription: "",
    defaultNotes: "",
  },
];

export function ContentRequestForm({ onChange }: ContentRequestFormProps) {
  const [category, setCategory] = useState<CategoryKey | "">("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const categoryLabel =
      CATEGORIES.find(c => c.value === category)?.label || "N/A";
    const parts = [
      `Category: ${categoryLabel}`,
      `Title: ${title || "N/A"}`,
      `Description: ${description || "N/A"}`,
      `Additional Notes: ${notes || "N/A"}`,
    ];
    onChange("Content Request:\n" + parts.join("\n"));
  }, [category, title, description, notes, onChange]);

  const handleCategoryChange = (value: string) => {
    const cat = CATEGORIES.find(c => c.value === value);
    if (!cat) return;
    setCategory(cat.value);
    // Prefill the editable fields with category defaults
    setTitle(cat.defaultTitle);
    setDescription(cat.defaultDescription);
    setNotes(cat.defaultNotes);
  };

  return (
    <div className="space-y-3">
      <VoiceDictation
        formType="Content Request"
        onFieldsExtracted={(f) => {
          if (f.category && CATEGORIES.some(c => c.value === f.category)) handleCategoryChange(f.category);
          if (f.title) setTitle(f.title);
          if (f.description) setDescription(f.description);
          if (f.notes) setNotes(f.notes);
        }}
      />
      <div className="space-y-1.5">
        <Label>Category *</Label>
        <Select value={category} onValueChange={handleCategoryChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select what you need" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(c => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Pick a category to prefill the form. You can edit any field afterwards.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Title *</Label>
        <Input
          placeholder="e.g. Spring vaccine awareness post"
          value={title}
          onChange={e => setTitle(e.target.value)}
         
        />
      </div>
      <div className="space-y-1.5">
        <Label>Description *</Label>
        <Textarea
          placeholder="What should this content cover?"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={6}
         
        />
      </div>
      <div className="space-y-1.5">
        <Label>Additional Notes</Label>
        <Textarea
          placeholder="Tone, references, links, anything else..."
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
         
        />
      </div>
    </div>
  );
}
