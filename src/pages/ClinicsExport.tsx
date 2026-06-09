import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";

interface ClinicRow {
  clinic_name: string;
  owner_name: string;
  owner_email: string;
}

export default function ClinicsExport() {
  const { role } = useUserRole();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ClinicRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (role !== "admin") {
      navigate("/dashboard");
      return;
    }

    const fetch = async () => {
      const { data: clinics, error: cErr } = await supabase
        .from("clinics")
        .select("clinic_name, owner_user_id")
        .order("clinic_name");
      if (cErr || !clinics) {
        setLoading(false);
        return;
      }

      const ownerIds = [...new Set(clinics.map((c: any) => c.owner_user_id).filter(Boolean))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ownerIds);

      const pmap = new Map((profiles || []).map((p: any) => [p.id, p]));
      const out = clinics.map((c: any) => {
        const p = pmap.get(c.owner_user_id);
        return {
          clinic_name: c.clinic_name || "",
          owner_name: p?.full_name || "",
          owner_email: p?.email || "",
        };
      });
      setRows(out);
      setLoading(false);
    };
    fetch();
  }, [role, navigate]);

  const csv = rows.map((r) => `"${r.clinic_name.replace(/"/g, '""')}","${r.owner_name.replace(/"/g, '""')}","${r.owner_email.replace(/"/g, '""')}"`).join("\n");
  const header = "Clinic Name,Owner Name,Owner Email";
  const fullCsv = `${header}\n${csv}`;

  const copy = () => {
    navigator.clipboard.writeText(fullCsv).then(() => toast.success("Copied to clipboard!"));
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Clinics Export</h1>
        <Button size="sm" onClick={copy} disabled={loading || rows.length === 0}>
          <Copy className="h-4 w-4 mr-1.5" />
          Copy CSV
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Copy the table below and paste directly into Google Sheets. Or click "Copy CSV" to copy the full sheet.
      </p>
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Clinic Name</th>
                <th className="px-3 py-2 text-left font-medium">Owner Name</th>
                <th className="px-3 py-2 text-left font-medium">Owner Email</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2">{r.clinic_name}</td>
                  <td className="px-3 py-2">{r.owner_name}</td>
                  <td className="px-3 py-2">{r.owner_email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
