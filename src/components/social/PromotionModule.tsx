import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

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

  const isCVBC = jurisdiction?.toUpperCase().includes("CVBC") || jurisdiction?.toUpperCase().includes("BRITISH COLUMBIA");

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
        governing_body_confirmed: isCVBC ? form.governing_body_confirmed : null,
        created_by: user.id,
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promotions", clinicId] });
      toast.success("Promotion created");
      setDialogOpen(false);
      setForm({ offer_name: "", inclusions: "", exclusions: "", start_date: "", end_date: "", governing_body_confirmed: false });
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

  const isValid = form.offer_name.trim() && form.start_date && form.end_date &&
    (!isCVBC || form.governing_body_confirmed);

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
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Promotion</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Offer Name *</Label>
                  <Input placeholder="e.g. Spring Dental Cleaning 20% Off" value={form.offer_name}
                    onChange={(e) => setForm((p) => ({ ...p, offer_name: e.target.value }))} maxLength={200} />
                </div>
                <div className="space-y-1.5">
                  <Label>What's Included</Label>
                  <Textarea placeholder="Describe what's included in this offer..."
                    value={form.inclusions} onChange={(e) => setForm((p) => ({ ...p, inclusions: e.target.value }))}
                    rows={3} maxLength={1000} />
                </div>
                <div className="space-y-1.5">
                  <Label>Exclusions / Fine Print</Label>
                  <Textarea placeholder="Any exclusions, limits, or conditions..."
                    value={form.exclusions} onChange={(e) => setForm((p) => ({ ...p, exclusions: e.target.value }))}
                    rows={2} maxLength={1000} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Start Date *</Label>
                    <Input type="date" value={form.start_date}
                      onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>End Date *</Label>
                    <Input type="date" value={form.end_date}
                      onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))} />
                  </div>
                </div>

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
            <p className="text-xs text-muted-foreground mt-1">Add promotions so the AI can reference them in generated posts.</p>
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
                          <CheckCircle className="h-3 w-3" /> CVBC OK
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
