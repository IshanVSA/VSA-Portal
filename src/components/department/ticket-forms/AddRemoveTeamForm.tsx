import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Trash2, Users, AlertCircle, Upload, X, ImageIcon } from "lucide-react";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { VoiceDictation } from "./VoiceDictation";
import type { AttachedFile } from "./FileUploader";

interface AddRemoveTeamFormProps {
  onChange: (description: string) => void;
  onValidityChange?: (valid: boolean) => void;
  onFilesChange?: (files: AttachedFile[]) => void;
}

interface TeamMemberEntry {
  id: string;
  action: "add" | "remove";
  name: string;
  role: string;
  bio: string;
  photo: AttachedFile | null;
}

const memberSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be less than 100 characters"),
  role: z
    .string()
    .trim()
    .min(2, "Role/Title is required")
    .max(80, "Role/Title must be less than 80 characters")
    .regex(
      /^[A-Za-z][A-Za-z0-9 .,&/'\-]*$/,
      "Role can only contain letters, numbers, spaces, and . , & / ' -"
    ),
});

function newEntry(action: "add" | "remove" = "add"): TeamMemberEntry {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    action,
    name: "",
    role: "",
    bio: "",
    photo: null,
  };
}

function slugifyName(name: string, fallbackIndex: number) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || `member-${fallbackIndex + 1}`;
}

/**
 * Wraps a File so the storage filename clearly identifies its team member.
 * Uses `<slug>__<original>` so admins reading attachments instantly see who's who.
 */
function renameForMember(file: File, memberName: string, index: number): File {
  const slug = slugifyName(memberName, index);
  const ext = file.name.includes(".") ? `.${file.name.split(".").pop()}` : "";
  const base = file.name.replace(/\.[^.]+$/, "") || "photo";
  const newName = `${slug}__${base}${ext.replace(`.${ext.replace(".", "")}`, ext)}`;
  // Ensure single extension; simpler: `${slug}__${file.name}`
  return new File([file], `${slug}__${file.name}`, { type: file.type });
}

export function AddRemoveTeamForm({ onChange, onValidityChange, onFilesChange }: AddRemoveTeamFormProps) {
  const [members, setMembers] = useState<TeamMemberEntry[]>([newEntry("add")]);
  const [touched, setTouched] = useState<Record<string, { name?: boolean; role?: boolean }>>({});
  const photoInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Per-row errors
  const errors = useMemo(() => {
    const map: Record<string, { name?: string; role?: string }> = {};
    for (const m of members) {
      const result = memberSchema.safeParse({ name: m.name, role: m.role });
      if (!result.success) {
        const flat = result.error.flatten().fieldErrors;
        map[m.id] = {
          name: flat.name?.[0],
          role: flat.role?.[0],
        };
      } else {
        map[m.id] = {};
      }
    }
    return map;
  }, [members]);

  const isFormValid = useMemo(
    () => members.every((m) => !errors[m.id]?.name && !errors[m.id]?.role),
    [members, errors]
  );

  useEffect(() => {
    onValidityChange?.(isFormValid);
  }, [isFormValid, onValidityChange]);

  // Build description
  useEffect(() => {
    const lines: string[] = ["Team Member Update:"];
    const first = members[0];
    if (first) {
      lines.push(`Action: ${first.action === "add" ? "Add" : "Remove"} Team Member`);
      lines.push(`Name: ${first.name || "N/A"}`);
      lines.push(`Role/Title: ${first.role || "N/A"}`);
      if (first.bio.trim()) {
        lines.push(`Bio: ${first.bio.trim()}`);
      }
      if (first.action === "add") {
        lines.push(`Photo: ${first.photo ? `${slugifyName(first.name, 0)}__${first.photo.file.name}` : "Not provided"}`);
      }
    }

    if (members.length > 1) {
      lines.push("");
      lines.push(`Total Members in this ticket: ${members.length}`);
      members.forEach((m, idx) => {
        lines.push("");
        lines.push(`#${idx + 1} — ${m.action === "add" ? "Add" : "Remove"}`);
        lines.push(`  Name: ${m.name || "N/A"}`);
        lines.push(`  Role/Title: ${m.role || "N/A"}`);
        if (m.bio.trim()) {
          lines.push(`  Bio: ${m.bio.trim()}`);
        }
        if (m.action === "add") {
          lines.push(`  Photo: ${m.photo ? `${slugifyName(m.name, idx)}__${m.photo.file.name}` : "Not provided"}`);
        }
      });
    }

    onChange(lines.join("\n"));
  }, [members, onChange]);

  // Emit files (renamed with member slug) to parent
  useEffect(() => {
    if (!onFilesChange) return;
    const emitted: AttachedFile[] = members
      .map((m, idx) => {
        if (m.action !== "add" || !m.photo) return null;
        const renamed = renameForMember(m.photo.file, m.name || `member-${idx + 1}`, idx);
        return { file: renamed, preview: m.photo.preview };
      })
      .filter((x): x is AttachedFile => x !== null);
    onFilesChange(emitted);
  }, [members, onFilesChange]);

  const updateMember = (id: string, patch: Partial<TeamMemberEntry>) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const markTouched = (id: string, field: "name" | "role") => {
    setTouched((prev) => ({ ...prev, [id]: { ...prev[id], [field]: true } }));
  };

  const addMember = () => setMembers((prev) => [...prev, newEntry("add")]);

  const removeMember = (id: string) => {
    setMembers((prev) => {
      const target = prev.find((m) => m.id === id);
      if (target?.photo?.preview) URL.revokeObjectURL(target.photo.preview);
      return prev.length === 1 ? prev : prev.filter((m) => m.id !== id);
    });
    setTouched((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handlePhotoSelect = (memberId: string, file: File | null) => {
    setMembers((prev) =>
      prev.map((m) => {
        if (m.id !== memberId) return m;
        if (m.photo?.preview) URL.revokeObjectURL(m.photo.preview);
        if (!file) return { ...m, photo: null };
        return {
          ...m,
          photo: {
            file,
            preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
          },
        };
      })
    );
  };

  const handleAutofill = useCallback((fields: Record<string, any>) => {
    setMembers((prev) => {
      const next = [...prev];
      const target = next[0] ?? newEntry();
      if (fields.action === "add" || fields.action === "remove") target.action = fields.action;
      if (fields.memberName) target.name = fields.memberName;
      if (fields.memberRole) target.role = fields.memberRole;
      next[0] = target;
      return next;
    });
  }, []);

  return (
    <div className="space-y-4">
      <VoiceDictation formType="Add/Remove Team" onFieldsExtracted={handleAutofill} />

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        Add multiple members in one ticket — each member has their own photo slot.
      </div>

      <div className="space-y-3">
        {members.map((m, idx) => {
          const rowErr = errors[m.id] || {};
          const rowTouched = touched[m.id] || {};
          const showNameErr = rowTouched.name && rowErr.name;
          const showRoleErr = rowTouched.role && rowErr.role;
          const isAdd = m.action === "add";
          const missingPhoto = isAdd && !m.photo;
          return (
            <div
              key={m.id}
              className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">
                  Member #{idx + 1}
                </span>
                {members.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-destructive hover:text-destructive"
                    onClick={() => removeMember(m.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Remove
                  </Button>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Action *</Label>
                <RadioGroup
                  value={m.action}
                  onValueChange={(v) => updateMember(m.id, { action: v as "add" | "remove" })}
                  className="flex items-center gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="add" id={`action-add-${m.id}`} />
                    <Label htmlFor={`action-add-${m.id}`} className="font-normal cursor-pointer">Add</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="remove" id={`action-remove-${m.id}`} />
                    <Label htmlFor={`action-remove-${m.id}`} className="font-normal cursor-pointer">Remove</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-1.5">
                <Label>Member Name *</Label>
                <Input
                  placeholder="Full name"
                  value={m.name}
                  onChange={(e) => updateMember(m.id, { name: e.target.value })}
                  onBlur={() => markTouched(m.id, "name")}
                  maxLength={100}
                  aria-invalid={!!showNameErr}
                  className={cn(showNameErr && "border-destructive focus-visible:ring-destructive")}
                />
                {showNameErr && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {rowErr.name}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Role / Title *</Label>
                <Input
                  placeholder="e.g. Veterinarian, Technician"
                  value={m.role}
                  onChange={(e) => updateMember(m.id, { role: e.target.value })}
                  onBlur={() => markTouched(m.id, "role")}
                  maxLength={80}
                  aria-invalid={!!showRoleErr}
                  className={cn(showRoleErr && "border-destructive focus-visible:ring-destructive")}
                />
                {showRoleErr && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {rowErr.role}
                  </p>
                )}
              </div>
              {isAdd && (
                <div className="space-y-1.5">
                  <Label>Bio</Label>
                  <Textarea
                    placeholder="Short bio for this team member..."
                    value={m.bio}
                    onChange={(e) => updateMember(m.id, { bio: e.target.value })}
                    rows={3}
                    maxLength={1000}
                  />
                </div>
              )}

              {isAdd && (
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5" />
                    Photo for {m.name || `member #${idx + 1}`}
                  </Label>
                  <input
                    ref={(el) => { photoInputRefs.current[m.id] = el; }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      handlePhotoSelect(m.id, file);
                      e.target.value = "";
                    }}
                  />
                  {m.photo ? (
                    <div className="flex items-center gap-2 p-2 rounded-md border border-border/60 bg-background/40">
                      {m.photo.preview ? (
                        <img src={m.photo.preview} alt="" className="h-10 w-10 rounded object-cover shrink-0" />
                      ) : (
                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate text-foreground">{m.photo.file.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          Will upload as <span className="font-mono">{slugifyName(m.name, idx)}__{m.photo.file.name}</span>
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handlePhotoSelect(m.id, null)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => photoInputRefs.current[m.id]?.click()}
                      className={cn(
                        "w-full flex items-center justify-center gap-2 rounded-md border-2 border-dashed py-3 text-xs transition-colors",
                        missingPhoto
                          ? "border-amber-500/40 text-amber-500 hover:bg-amber-500/5"
                          : "border-border text-muted-foreground hover:border-primary/50 hover:bg-muted/30"
                      )}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Upload photo
                    </button>
                  )}
                  {missingPhoto && (
                    <p className="text-[11px] text-amber-500/90 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      No photo yet — the team can still proceed but a photo is recommended.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addMember}
        className="w-full"
      >
        <Plus className="h-3.5 w-3.5 mr-1" />
        Add another member
      </Button>
    </div>
  );
}
