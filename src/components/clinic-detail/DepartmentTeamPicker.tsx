import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Globe, Search, Megaphone, Share2 } from "lucide-react";

export interface PickerStaff {
  user_id: string;
  full_name: string;
  team_role: string | null;
}

interface DepartmentTeamPickerProps {
  staff: PickerStaff[];
  selected: string[];
  onToggle: (userId: string) => void;
}

interface DepartmentGroup {
  key: string;
  label: string;
  icon: typeof Globe;
  roles: string[];
}

const DEPARTMENTS: DepartmentGroup[] = [
  { key: "website", label: "Website", icon: Globe, roles: ["Developer", "Maintenance"] },
  { key: "seo", label: "SEO", icon: Search, roles: ["SEO Lead"] },
  { key: "google_ads", label: "Google Ads", icon: Megaphone, roles: ["Ads Strategist", "Ads Analyst"] },
  { key: "social_media", label: "Social Media", icon: Share2, roles: ["Social & Concierge", "Meta Ads Specialist"] },
];

export function DepartmentTeamPicker({ staff, selected, onToggle }: DepartmentTeamPickerProps) {
  const knownRoles = new Set(DEPARTMENTS.flatMap((d) => d.roles));
  const unassigned = staff.filter((s) => !s.team_role || !knownRoles.has(s.team_role));

  return (
    <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
      {DEPARTMENTS.map((dept) => {
        const members = staff.filter((s) => s.team_role && dept.roles.includes(s.team_role));
        const Icon = dept.icon;
        const selectedCount = members.filter((m) => selected.includes(m.user_id)).length;
        return (
          <div key={dept.key} className="rounded-xl border border-border/60 bg-muted/20 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">{dept.label}</span>
              </div>
              <Badge variant="secondary" className="text-[10px] rounded-full">
                {selectedCount} / {members.length}
              </Badge>
            </div>
            {members.length === 0 ? (
              <p className="text-xs text-muted-foreground italic px-1 py-1">
                No staff with {dept.roles.join(" or ")} role.
              </p>
            ) : (
              <div className="space-y-0.5">
                {members.map((m) => (
                  <label
                    key={m.user_id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <Checkbox
                      checked={selected.includes(m.user_id)}
                      onCheckedChange={() => onToggle(m.user_id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{m.full_name}</p>
                      <p className="text-xs text-muted-foreground">{m.team_role}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {unassigned.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-muted-foreground">Other Staff</span>
            <Badge variant="secondary" className="text-[10px] rounded-full">
              {unassigned.filter((m) => selected.includes(m.user_id)).length} / {unassigned.length}
            </Badge>
          </div>
          <div className="space-y-0.5">
            {unassigned.map((m) => (
              <label
                key={m.user_id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
              >
                <Checkbox
                  checked={selected.includes(m.user_id)}
                  onCheckedChange={() => onToggle(m.user_id)}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{m.full_name}</p>
                  {m.team_role && <p className="text-xs text-muted-foreground">{m.team_role}</p>}
                </div>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
