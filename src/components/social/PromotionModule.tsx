import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { extractEdgeFunctionError } from "@/lib/edge-function-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tag, Plus, Calendar, AlertTriangle, CheckCircle, Trash2, RefreshCw,
  Shield, ShieldCheck, ShieldAlert, Loader2, Lightbulb,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { logComplianceOverride } from "@/lib/compliance-override-log";

interface Promotion {
  id: string;
  clinic_id: string;
  offer_name: string;
  inclusions: string;
  exclusions: string;
  start_date: string;
  end_date: string;
  status: string;
  governing_body_confirmed: boolean | null;
  created_at: string;
}

interface Props {
  clinicId: string | undefined;
  jurisdiction?: string;
}

const PROVINCE_MAP: Record<string, string> = {
  AB: "ABVMA (Alberta Veterinary Medical Association)",
  BC: "CVBC (College of Veterinarians of British Columbia)",
  ON: "CVO (College of Veterinarians of Ontario)",
  SK: "SVMA (Saskatchewan Veterinary Medical Association)",
  MB: "MVMA (Manitoba Veterinary Medical Association)",
  QC: "OMVQ (Ordre des médecins vétérinaires du Québec)",
  NS: "NSVMA (Nova Scotia Veterinary Medical Association)",
  NB: "NBVMA (New Brunswick Veterinary Medical Association)",
  PE: "PEIVMA (PEI Veterinary Medical Association)",
  NL: "NLVMA (Newfoundland & Labrador Veterinary Medical Association)",
  NT: "AVMA (general)",
  NU: "AVMA (general)",
  YT: "AVMA (general)",
};

function detectComplianceBody(address: string): string {
  if (!address) return "General Veterinary Advertising Standards";
  const upper = address.toUpperCase();
  for (const [code, body] of Object.entries(PROVINCE_MAP)) {
    if (new RegExp(`\\b${code}\\b`).test(upper)) return body;
  }
  const nameMap: Record<string, string> = {
    ALBERTA: "AB", "BRITISH COLUMBIA": "BC", ONTARIO: "ON",
    SASKATCHEWAN: "SK", MANITOBA: "MB", QUEBEC: "QC",
    "NOVA SCOTIA": "NS", "NEW BRUNSWICK": "NB",
    "PRINCE EDWARD ISLAND": "PE", NEWFOUNDLAND: "NL",
  };
  for (const [name, code] of Object.entries(nameMap)) {
    if (upper.includes(name)) return PROVINCE_MAP[code];
  }
  return "General Veterinary Advertising Standards";
}

export default function PromotionModule({ clinicId, jurisdiction }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    offer_name: "",
    inclusions: "",
    exclusions: "",
    start_date: "",
    end_date: "",
    governing_body_confirmed: false,
  });

  const [complianceBody, setComplianceBody] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [overridden, setOverridden] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [verificationResult, setVerificationResult] = useState<{
    compliant: boolean; issues: string[]; suggestions: string[];
  } | null>(null);

  const isCVBC = jurisdiction?.toUpperCase().includes("CVBC") || jurisdiction?.toUpperCase().includes("BRITISH COLUMBIA");

  // Detect compliance body from clinic address
  useEffect(() => {
    if (!clinicId) return;
    if (jurisdiction) {
      setComplianceBody(jurisdiction);
      return;
    }
    supabase.from("clinics").select("address").eq("id", clinicId).single()
      .then(({ data }) => setComplianceBody(detectComplianceBody(data?.address || "")));
  }, [clinicId, jurisdiction]);

  // Reset verification when key fields change
  const resetVerification = () => {
    if (verified || verificationResult || overridden) {
      setVerified(false);
      setVerificationResult(null);
      setOverridden(false);
      setOverrideReason("");
    }
  };

  const { data: promotions, isLoading } = useQuery({
    queryKey: ["promotions", clinicId],
    queryFn: async () => {
      if (!clinicId) return [];
      const { data, error } = await supabase
        .from("clinic_promotions")
        .select("*")
        .eq("clinic_id", clinicId)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data || []) as Promotion[];
    },
    enabled: !!clinicId,
  });

  const handleVerify = async () => {
    if (!form.offer_name.trim()) return;
    setVerifying(true);
    setVerificationResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("verify-popup-offer", {
        body: {
          offerTitle: form.offer_name,
          offerText: form.inclusions,
          termsAndConditions: form.exclusions,
          startDate: form.start_date,
          endDate: form.end_date,
          complianceBody,
        },
      });
      if (error) throw new Error(await extractEdgeFunctionError(error, data, "Verification failed"));
      setVerificationResult(data);
      setVerified(data.compliant === true);
    } catch (err) {
      console.error("Verification error:", err);
      setVerificationResult({
        compliant: false,
        issues: [err instanceof Error ? err.message : "Verification service unavailable."],
        suggestions: [],
      });
    } finally {
      setVerifying(false);
    }
  };

  const createPromotion = useMutation({
    mutationFn: async () => {
      if (!clinicId || !user) throw new Error("Missing context");
      const { error } = await supabase.from("clinic_promotions").insert({
        clinic_id: clinicId,
        offer_name: form.offer_name,
        inclusions: form.inclusions,
        exclusions: form.exclusions,
        start_date: form.start_date,
        end_date: form.end_date,
        governing_body_confirmed: isCVBC ? form.governing_body_confirmed : verified,
        created_by: user.id,
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      if (overridden && overrideReason.trim()) {
        await logComplianceOverride({
          context: "Promotion",
          clinicId,
          offerName: form.offer_name,
          complianceBody,
          issues: verificationResult?.issues ?? [],
          overrideReason: overrideReason.trim(),
          metadata: {
            start_date: form.start_date,
            end_date: form.end_date,
            jurisdiction,
          },
        });
      }
      queryClient.invalidateQueries({ queryKey: ["promotions", clinicId] });
      toast.success("Promotion created");
      setDialogOpen(false);
      setForm({ offer_name: "", inclusions: "", exclusions: "", start_date: "", end_date: "", governing_body_confirmed: false });
      setVerified(false);
      setVerificationResult(null);
      setOverridden(false);
      setOverrideReason("");
    },
    onError: (e: Error) => toast.error("Failed", { description: e.message }),
  });

  const deletePromotion = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clinic_promotions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promotions", clinicId] });
      toast.success("Promotion removed");
    },
  });

  const canVerify = form.offer_name.trim() && form.start_date && form.end_date;
  const complianceCleared = verified || (overridden && overrideReason.trim().length >= 5);
  const isValid = form.offer_name.trim() && form.start_date && form.end_date &&
    complianceCleared && (!isCVBC || form.governing_body_confirmed);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Tag className="h-4 w-4 text-primary" />
            Active Promotions
          </CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Add Promotion</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New Promotion</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Offer Name *</Label>
                  <Input placeholder="e.g. Spring Dental Cleaning 20% Off" value={form.offer_name}
                    onChange={(e) => { setForm((p) => ({ ...p, offer_name: e.target.value })); resetVerification(); }} maxLength={200} />
                </div>
                <div className="space-y-1.5">
                  <Label>What's Included</Label>
                  <Textarea placeholder="Describe what's included in this offer..."
                    value={form.inclusions} onChange={(e) => { setForm((p) => ({ ...p, inclusions: e.target.value })); resetVerification(); }}
                    rows={3} maxLength={1000} />
                </div>
                <div className="space-y-1.5">
                  <Label>Exclusions / Fine Print</Label>
                  <Textarea placeholder="Any exclusions, limits, or conditions..."
                    value={form.exclusions} onChange={(e) => { setForm((p) => ({ ...p, exclusions: e.target.value })); resetVerification(); }}
                    rows={2} maxLength={1000} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Start Date *</Label>
                    <Input type="date" value={form.start_date}
                      onChange={(e) => { setForm((p) => ({ ...p, start_date: e.target.value })); resetVerification(); }} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>End Date *</Label>
                    <Input type="date" value={form.end_date}
                      onChange={(e) => { setForm((p) => ({ ...p, end_date: e.target.value })); resetVerification(); }} />
                  </div>
                </div>

                {complianceBody && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
                    <Shield className="h-3.5 w-3.5 shrink-0" />
                    <span>Compliance: <strong className="text-foreground">{complianceBody}</strong></span>
                  </div>
                )}

                <Button type="button" variant="outline" className="w-full" disabled={!canVerify || verifying} onClick={handleVerify}>
                  {verifying ? (
                    <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Verifying…</>
                  ) : verified ? (
                    <><ShieldCheck className="h-4 w-4 mr-1.5 text-primary" /> Verified - Re-verify</>
                  ) : (
                    <><Shield className="h-4 w-4 mr-1.5" /> Verify Promotion Compliance</>
                  )}
                </Button>

                {verificationResult && (
                  <div className={`rounded-lg border p-3 space-y-2 text-sm ${verificationResult.compliant ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"}`}>
                    <div className="flex items-center gap-2 font-medium">
                      {verificationResult.compliant ? (
                        <><ShieldCheck className="h-4 w-4 text-primary" /> Promotion is compliant</>
                      ) : (
                        <><ShieldAlert className="h-4 w-4 text-destructive" /> Compliance issues found</>
                      )}
                    </div>
                    {verificationResult.issues.length > 0 && (
                      <div className="space-y-1">
                        {verificationResult.issues.map((issue, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-xs text-destructive">
                            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                            <span>{issue}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {verificationResult.suggestions.length > 0 && (
                      <div className="space-y-1 pt-1 border-t border-border/50">
                        <p className="text-xs font-medium text-muted-foreground">Suggestions:</p>
                        {verificationResult.suggestions.map((sug, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <Lightbulb className="h-3 w-3 mt-0.5 shrink-0" />
                            <span>{sug}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {verificationResult && !verificationResult.compliant && (
                  <div className="rounded-lg border border-amber-300/40 bg-amber-50/20 p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="override-compliance"
                        checked={overridden}
                        onCheckedChange={(c) => setOverridden(c === true)}
                        className="mt-0.5"
                      />
                      <label htmlFor="override-compliance" className="text-xs cursor-pointer leading-relaxed">
                        <span className="font-medium text-amber-800">Override compliance check</span>
                        <span className="block text-muted-foreground mt-0.5">
                          I acknowledge the issues above and take full responsibility for publishing this promotion.
                        </span>
                      </label>
                    </div>
                    {overridden && (
                      <Textarea
                        placeholder="Reason for override (required, min 5 characters)..."
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        rows={2}
                        maxLength={500}
                        className="text-xs"
                      />
                    )}
                  </div>
                )}

                {isCVBC && (
                  <div className="rounded-lg border border-amber-300/40 bg-amber-50/20 p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-amber-800">CVBC Compliance Required</p>
                        <p className="text-xs text-muted-foreground">
                          Promotions under CVBC jurisdiction must comply with advertising guidelines.
                          Ensure this offer does not include testimonials, superlative claims, or outcome guarantees.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Checkbox
                        id="cvbc-confirm"
                        checked={form.governing_body_confirmed}
                        onCheckedChange={(c) => setForm((p) => ({ ...p, governing_body_confirmed: c === true }))}
                      />
                      <label htmlFor="cvbc-confirm" className="text-xs cursor-pointer">
                        I confirm this promotion complies with CVBC advertising guidelines
                      </label>
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => createPromotion.mutate()} disabled={!isValid || createPromotion.isPending} className="gap-2">
                  {createPromotion.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Loading...</div>
        ) : !promotions?.length ? (
          <div className="py-8 text-center">
            <Tag className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No active promotions</p>
            <p className="text-xs text-muted-foreground mt-1">Add promotions so Tony AI can reference them in generated posts.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {promotions.map((promo) => {
              const isExpired = new Date(promo.end_date) < new Date();
              return (
                <div key={promo.id} className={`rounded-lg border p-3 space-y-1.5 ${isExpired ? "opacity-60" : ""}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{promo.offer_name}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant={isExpired ? "destructive" : "default"} className="text-[10px]">
                        {isExpired ? "Expired" : "Active"}
                      </Badge>
                      {promo.governing_body_confirmed && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <CheckCircle className="h-3 w-3" /> Verified
                        </Badge>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => deletePromotion.mutate(promo.id)} className="h-7 w-7 p-0">
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(promo.start_date), "MMM d")} - {format(new Date(promo.end_date), "MMM d, yyyy")}
                  </div>
                  {promo.inclusions && <p className="text-xs text-foreground">{promo.inclusions}</p>}
                  {promo.exclusions && <p className="text-xs text-muted-foreground italic">Excl: {promo.exclusions}</p>}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
