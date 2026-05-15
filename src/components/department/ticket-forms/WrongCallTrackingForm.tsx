import { useState, useEffect, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VoiceDictation } from "./VoiceDictation";

interface WrongCallTrackingFormProps {
  onChange: (description: string) => void;
}

const WRONG_CALL_REASONS = [
  "Service We Don't Provide",
  "Meant for Another Hospital/Clinic",
  "Wrong Number / Misdial",
  "Spam / Robocall",
  "Irrelevant Sales Call",
  "Other",
];

export function WrongCallTrackingForm({ onChange }: WrongCallTrackingFormProps) {
  const [reason, setReason] = useState("");
  const [callerNumber, setCallerNumber] = useState("");
  const [receivingNumber, setReceivingNumber] = useState("");
  const [callerSaid, setCallerSaid] = useState("");
  const [serviceRequested, setServiceRequested] = useState("");
  const [intendedBusiness, setIntendedBusiness] = useState("");
  const [callDate, setCallDate] = useState("");
  const [frequency, setFrequency] = useState("");

  useEffect(() => {
    const parts = [
      `Reason for Wrong Call: ${reason || "N/A"}`,
      `Caller Phone Number: ${callerNumber || "N/A"}`,
      `Number They Called (Our Tracking #): ${receivingNumber || "N/A"}`,
      `What Caller Said/Asked For: ${callerSaid || "N/A"}`,
      `Service/Product Requested: ${serviceRequested || "N/A"}`,
      `Intended Business/Hospital: ${intendedBusiness || "N/A"}`,
      `Date/Time of Call: ${callDate || "N/A"}`,
      `How Often Does This Happen: ${frequency || "N/A"}`,
    ];
    onChange("Wrong Call Tracking Report:\n" + parts.join("\n"));
  }, [reason, callerNumber, receivingNumber, callerSaid, serviceRequested, intendedBusiness, callDate, frequency, onChange]);

  const handleAutofill = useCallback((fields: Record<string, any>) => {
    if (fields.reason) setReason(fields.reason);
    if (fields.callerNumber) setCallerNumber(fields.callerNumber);
    if (fields.receivingNumber) setReceivingNumber(fields.receivingNumber);
    if (fields.callerSaid) setCallerSaid(fields.callerSaid);
    if (fields.serviceRequested) setServiceRequested(fields.serviceRequested);
    if (fields.intendedBusiness) setIntendedBusiness(fields.intendedBusiness);
    if (fields.callDate) setCallDate(fields.callDate);
    if (fields.frequency) setFrequency(fields.frequency);
  }, []);

  return (
    <div className="space-y-3">
      <VoiceDictation formType="Wrong Call Tracking" onFieldsExtracted={handleAutofill} />

      <div className="space-y-1.5">
        <Label>Why Was This a Wrong Call? *</Label>
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
          <SelectContent>
            {WRONG_CALL_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Caller's Phone Number</Label>
          <Input placeholder="e.g. (555) 123-4567" value={callerNumber} onChange={e => setCallerNumber(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Our Tracking Number They Called</Label>
          <Input placeholder="e.g. (555) 987-6543" value={receivingNumber} onChange={e => setReceivingNumber(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>What Did the Caller Say / Ask For? *</Label>
        <Textarea placeholder="e.g. They asked about grooming services, wanted to book a dental cleaning at XYZ Animal Hospital..." value={callerSaid} onChange={e => setCallerSaid(e.target.value)} rows={3} />
      </div>

      {(reason === "Service We Don't Provide") && (
        <div className="space-y-1.5">
          <Label>What Service Were They Looking For?</Label>
          <Input placeholder="e.g. Exotic pet care, grooming, boarding..." value={serviceRequested} onChange={e => setServiceRequested(e.target.value)} />
        </div>
      )}

      {(reason === "Meant for Another Hospital/Clinic") && (
        <div className="space-y-1.5">
          <Label>Which Business Were They Trying to Reach?</Label>
          <Input placeholder="e.g. ABC Animal Hospital, Downtown Vet Clinic..." value={intendedBusiness} onChange={e => setIntendedBusiness(e.target.value)} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Date / Time of Call</Label>
          <Input type="datetime-local" value={callDate} onChange={e => setCallDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>How Often Does This Happen?</Label>
          <Select value={frequency} onValueChange={setFrequency}>
            <SelectTrigger><SelectValue placeholder="Select frequency" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="First time">First time</SelectItem>
              <SelectItem value="Occasionally">Occasionally</SelectItem>
              <SelectItem value="Frequently (weekly)">Frequently (weekly)</SelectItem>
              <SelectItem value="Very often (daily)">Very often (daily)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        This helps our team investigate whether a Google Ads campaign is driving incorrect calls and adjust targeting accordingly.
      </p>
    </div>
  );
}
