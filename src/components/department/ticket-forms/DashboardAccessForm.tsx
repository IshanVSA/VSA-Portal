import { useState, useEffect, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VoiceDictation } from "./VoiceDictation";

interface DashboardAccessFormProps {
  onChange: (description: string) => void;
}

const ACCESS_TYPES = ["New Access Request", "Reset Password", "Change Permissions", "Revoke Access", "Other"];

export function DashboardAccessForm({ onChange }: DashboardAccessFormProps) {
  const [accessType, setAccessType] = useState("");
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [details, setDetails] = useState("");

  useEffect(() => {
    const parts = [
      `Access Type: ${accessType || "N/A"}`,
      `User Name: ${userName || "N/A"}`,
      `User Email: ${userEmail || "N/A"}`,
      `Details: ${details || "N/A"}`,
    ];
    onChange("Dashboard Access Request:\n" + parts.join("\n"));
  }, [accessType, userName, userEmail, details, onChange]);

  const handleAutofill = useCallback((fields: Record<string, any>) => {
    if (fields.accessType) setAccessType(fields.accessType);
    if (fields.userName) setUserName(fields.userName);
    if (fields.userEmail) setUserEmail(fields.userEmail);
    if (fields.details) setDetails(fields.details);
  }, []);

  return (
    <div className="space-y-3">
      <VoiceDictation formType="Dashboard Access" onFieldsExtracted={handleAutofill} />
      <div className="space-y-1.5">
        <Label>Access Type *</Label>
        <Select value={accessType} onValueChange={setAccessType}>
          <SelectTrigger><SelectValue placeholder="Select access type" /></SelectTrigger>
          <SelectContent>
            {ACCESS_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>User Name *</Label>
        <Input placeholder="Full name of the person who needs access" value={userName} onChange={e => setUserName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>User Email *</Label>
        <Input type="email" placeholder="user@clinic.com" value={userEmail} onChange={e => setUserEmail(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Additional Details</Label>
        <Textarea placeholder="Specify which dashboards/reports they need access to..." value={details} onChange={e => setDetails(e.target.value)} rows={3} />
      </div>
    </div>
  );
}
