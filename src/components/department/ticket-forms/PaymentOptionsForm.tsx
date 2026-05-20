import { useState, useEffect, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { VoiceDictation } from "./VoiceDictation";

interface PaymentOptionsFormProps {
  onChange: (description: string) => void;
}

const REQUEST_TYPES = [
  "Add New Payment Method",
  "Remove Payment Method",
  "Update Existing Payment Setup",
  "Payment Page / Portal Setup",
  "Invoicing Integration",
  "Other",
];

const PAYMENT_METHODS = [
  { id: "credit_card", label: "Credit / Debit Card" },
  { id: "e_transfer", label: "E-Transfer / Interac" },
  { id: "apple_pay", label: "Apple Pay" },
  { id: "google_pay", label: "Google Pay" },
  { id: "paypal", label: "PayPal" },
  { id: "financing", label: "Financing / Payment Plans" },
  { id: "other", label: "Other" },
];

export function PaymentOptionsForm({ onChange }: PaymentOptionsFormProps) {
  const [requestType, setRequestType] = useState("");
  const [selectedMethods, setSelectedMethods] = useState<string[]>([]);
  const [providerName, setProviderName] = useState("");
  const [pageLocation, setPageLocation] = useState("");
  const [details, setDetails] = useState("");

  const toggleMethod = (id: string) => {
    setSelectedMethods(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  useEffect(() => {
    const methodLabels = selectedMethods
      .map(id => PAYMENT_METHODS.find(m => m.id === id)?.label || id)
      .join(", ");

    const parts = [
      `Request Type: ${requestType || "N/A"}`,
      `Payment Methods: ${methodLabels || "N/A"}`,
      `Payment Provider: ${providerName || "N/A"}`,
      `Page / Location: ${pageLocation || "N/A"}`,
      `Additional Details: ${details || "N/A"}`,
    ];
    onChange("Payment Options Request:\n" + parts.join("\n"));
  }, [requestType, selectedMethods, providerName, pageLocation, details, onChange]);

  const handleAutofill = useCallback((fields: Record<string, any>) => {
    if (fields.requestType && REQUEST_TYPES.includes(fields.requestType)) setRequestType(fields.requestType);
    if (fields.paymentMethods && Array.isArray(fields.paymentMethods)) {
      const validIds = PAYMENT_METHODS.map(m => m.id);
      setSelectedMethods(fields.paymentMethods.filter((id: string) => validIds.includes(id)));
    }
    if (fields.providerName) setProviderName(fields.providerName);
    if (fields.pageLocation) setPageLocation(fields.pageLocation);
    if (fields.details) setDetails(fields.details);
  }, []);

  return (
    <div className="space-y-3">
      <VoiceDictation formType="Payment Options" onFieldsExtracted={handleAutofill} />

      <div className="space-y-1.5">
        <Label>Request Type *</Label>
        <Select value={requestType} onValueChange={setRequestType}>
          <SelectTrigger><SelectValue placeholder="What do you need?" /></SelectTrigger>
          <SelectContent>
            {REQUEST_TYPES.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Payment Methods *</Label>
        <div className="grid grid-cols-2 gap-2 pt-1">
          {PAYMENT_METHODS.map(method => (
            <label
              key={method.id}
              className="flex items-center gap-2 text-sm cursor-pointer rounded-xl border border-border/50 px-3 py-2 hover:bg-muted/30 transition-colors has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5"
            >
              <Checkbox
                checked={selectedMethods.includes(method.id)}
                onCheckedChange={() => toggleMethod(method.id)}
              />
              {method.label}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Payment Provider / Processor</Label>
        <Input
          placeholder="e.g. Stripe, Square, Moneris, Global Payments..."
          value={providerName}
          onChange={e => setProviderName(e.target.value)}
         
        />
      </div>

      <div className="space-y-1.5">
        <Label>Where Should It Appear?</Label>
        <Input
          placeholder="e.g. Homepage, Contact page, dedicated payment page..."
          value={pageLocation}
          onChange={e => setPageLocation(e.target.value)}
         
        />
      </div>

      <div className="space-y-1.5">
        <Label>Additional Details</Label>
        <Textarea
          placeholder="Any specific instructions, merchant IDs, or setup requirements..."
          value={details}
          onChange={e => setDetails(e.target.value)}
          rows={3}
         
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Upload any provider documentation or credentials in the attachments section below.
      </p>
    </div>
  );
}
