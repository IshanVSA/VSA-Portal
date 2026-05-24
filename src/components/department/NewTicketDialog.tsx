import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Loader2, CheckCircle2, Clock } from "lucide-react";
import { FileUploader, type AttachedFile } from "./ticket-forms/FileUploader";
import { getServiceOptions, getTicketTypeLabel, normalizeTicketType } from "@/lib/ticket-display-labels";
import { getVisibleDepartmentLabels } from "@/lib/ticket-department-map";
import { TimeChangesForm } from "./ticket-forms/TimeChangesForm";
import { PopupOffersForm } from "./ticket-forms/PopupOffersForm";
import { ThirdPartyIntegrationsForm } from "./ticket-forms/ThirdPartyIntegrationsForm";
import { PaymentOptionsForm } from "./ticket-forms/PaymentOptionsForm";
import { AddRemoveTeamForm } from "./ticket-forms/AddRemoveTeamForm";
import { NewFormsForm } from "./ticket-forms/NewFormsForm";
import { PriceListForm } from "./ticket-forms/PriceListForm";
import { EmergencyForm } from "./ticket-forms/EmergencyForm";
import { DashboardAccessForm } from "./ticket-forms/DashboardAccessForm";
import { AnalyticsReviewForm } from "./ticket-forms/AnalyticsReviewForm";
import { MonthlyReportForm } from "./ticket-forms/MonthlyReportForm";
import { CallVolumeIssuesForm } from "./ticket-forms/CallVolumeIssuesForm";
import { WrongCallTrackingForm } from "./ticket-forms/WrongCallTrackingForm";
import { CampaignAdjustmentsForm } from "./ticket-forms/CampaignAdjustmentsForm";
import { ContentRequestForm, type ContentPreviewData } from "./ticket-forms/ContentRequestForm";
import { ClientVisitForm } from "./ticket-forms/ClientVisitForm";
import { SpecialPromotionForm } from "./ticket-forms/SpecialPromotionForm";
import { BoostForm } from "./ticket-forms/BoostForm";
import { BulkUploadsForm } from "./ticket-forms/BulkUploadsForm";
import { ClinicSelector } from "@/components/department/ClinicSelector";
import { VoiceDictation } from "./ticket-forms/VoiceDictation";
import type { ClinicOption } from "@/hooks/useClinicSelector";

interface NewTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  department: string;
  services: string[];
  onCreated: () => void;
  defaultType?: string;
  clinicId?: string;
}


const CUSTOM_FORM_TYPES = [
  "Time Changes", "Pop-up Offers", "Third Party Integrations", "Payment Options",
  "Add/Remove Team Members", "New Forms", "Price List Updates", "Emergency",
  "Dashboard Access", "Analytics Review", "Monthly Performance Report",
  "Call Volume Issues", "Wrong Call Tracking", "Campaign Adjustments",
  "Content Request", "Client Visit", "Bulk Uploads", "Special Promotion", "Boost",
];

const AUTO_TITLES: Record<string, string> = {
  "Time Changes": "Time Changes Request",
  "Pop-up Offers": "Pop-up Offer Request",
  "Third Party Integrations": "Third Party Integration Request",
  "Payment Options": "Payment Options Request",
  "Add/Remove Team Members": "Team Member Update Request",
  "New Forms": "New Form Request",
  "Price List Updates": "Price List Update Request",
  "Emergency": "Emergency - Website Issue",
  "Dashboard Access": "Dashboard Access Request",
  "Analytics Review": "Analytics Review Request",
  "Monthly Performance Report": "Monthly Performance Report Request",
  "Call Volume Issues": "Call Volume Issue Report",
  "Wrong Call Tracking": "Wrong Call Tracking Report",
  "Campaign Adjustments": "Campaign Adjustment Request",
  "Content Request": "Content Request",
  "Client Visit": "Client Visit",
  "Bulk Uploads": "Bulk Uploads",
  "Special Promotion": "Special Promotion Request",
  "Boost": "Boost Request",
};

export function NewTicketDialog({ open, onOpenChange, department, services, onCreated, defaultType = "", clinicId }: NewTicketDialogProps) {
  const { user } = useAuth();
  const needsClinicSelection = !clinicId;
  const [clinics, setClinics] = useState<ClinicOption[]>([]);
  const [clinicsLoading, setClinicsLoading] = useState(false);
  const [selectedClinicId, setSelectedClinicId] = useState<string>("");
  const effectiveClinicId = clinicId || selectedClinicId;
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [title, setTitle] = useState("");
  const [ticketType, setTicketType] = useState(defaultType);
  const [priority, setPriority] = useState<"regular" | "urgent" | "emergency">("regular");
  const [customDescription, setCustomDescription] = useState("");
  const [genericDescription, setGenericDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [popupConsented, setPopupConsented] = useState(false);
  const [promoteSocial, setPromoteSocial] = useState(false);
  const [contentPreview, setContentPreview] = useState<ContentPreviewData | null>(null);

  const serviceOptions = getServiceOptions(services);

  const isCustomForm = CUSTOM_FORM_TYPES.includes(ticketType);
  const isAddTeamMember = ticketType === "Add/Remove Team Members" && customDescription.includes("Action: Add");
  const isPopupOffer = ticketType === "Pop-up Offers";

  useEffect(() => {
    if (open && defaultType) {
      const normalizedType = normalizeTicketType(defaultType);
      setTicketType(normalizedType);
      if (AUTO_TITLES[normalizedType]) {
        setTitle(AUTO_TITLES[normalizedType]);
      }
    }
  }, [open, defaultType]);

  useEffect(() => {
    if (!open || !needsClinicSelection || clinics.length > 0 || clinicsLoading) return;
    let cancelled = false;
    setClinicsLoading(true);
    (async () => {
      const { data, error } = await (supabase
        .from("clinics" as any)
        .select("id, clinic_name, website_enabled, seo_enabled, google_ads_enabled, ai_seo_enabled, social_media_enabled") as any)
        .eq("status", "active")
        .order("clinic_name");
      if (cancelled) return;
      if (!error && data) setClinics(data as ClinicOption[]);
      setClinicsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, needsClinicSelection]);

  // Load enabled services for the effective clinic so we can filter the
  // "Forwarded to" list and not show locked departments.
  const [clinicServices, setClinicServices] = useState<Record<string, boolean> | null>(null);
  useEffect(() => {
    if (!open || !effectiveClinicId) { setClinicServices(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await (supabase
        .from("clinics" as any)
        .select("website_enabled, seo_enabled, google_ads_enabled, ai_seo_enabled, social_media_enabled") as any)
        .eq("id", effectiveClinicId)
        .maybeSingle();
      if (cancelled || !data) return;
      setClinicServices({
        Website: (data as any).website_enabled ?? true,
        SEO: (data as any).seo_enabled ?? true,
        "Google Ads": (data as any).google_ads_enabled ?? true,
        "Social Media": (data as any).social_media_enabled ?? true,
      });
    })();
    return () => { cancelled = true; };
  }, [open, effectiveClinicId]);

  useEffect(() => {
    if (AUTO_TITLES[ticketType] && (!title || Object.values(AUTO_TITLES).includes(title))) {
      setTitle(AUTO_TITLES[ticketType]);
    }
    if (ticketType === "Emergency") {
      setPriority("emergency");
    }
  }, [ticketType]);

  const reset = () => {
    setTitle("");
    setTicketType("");
    setPriority("regular");
    setCustomDescription("");
    setGenericDescription("");
    setNotes("");
    setFiles([]);
    setPopupConsented(false);
    setPromoteSocial(false);
    setContentPreview(null);
    setSubmitted(false);
    setSelectedClinicId("");
  };

  const handleCustomFormChange = useCallback((desc: string) => {
    setCustomDescription(desc);
  }, []);

  const [teamFormValid, setTeamFormValid] = useState(false);


  const uploadFiles = async (ticketId: string): Promise<string[]> => {
    const paths: string[] = [];
    for (const { file } of files) {
      // Preserve the (already member-prefixed) filename so admins can identify
      // which photo belongs to which team member at a glance. Sanitize for storage.
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
      const ext = safeName.includes(".") ? safeName.split(".").pop() : "bin";
      const base = safeName.replace(/\.[^.]+$/, "") || "file";
      const path = `tickets/${ticketId}/${base}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const { error } = await supabase.storage.from("department-files").upload(path, file);
      if (error) {
        console.error("Upload error:", error);
        continue;
      }
      paths.push(path);
    }
    return paths;
  };

  const handleSubmit = async () => {
    if (needsClinicSelection && !selectedClinicId) {
      toast.error("Please select a clinic for this ticket");
      return;
    }
    if (ticketType === "Add/Remove Team Members" && !teamFormValid) {
      toast.error("Please fix the highlighted member fields before submitting");
      return;
    }
    if (!isCustomForm && (!title.trim() || !ticketType)) {
      toast.error("Title and Type are required");
      return;
    }
    if (isCustomForm && !ticketType) {
      toast.error("Type is required");
      return;
    }
    if (ticketType === "Time Changes" && !customDescription.includes("Start Date:") || (ticketType === "Time Changes" && customDescription.includes("(not set)"))) {
      toast.error("Start date is required for Time Changes");
      return;
    }
    if (ticketType === "Pop-up Offers" && !popupConsented) {
      toast.error("Please verify the offer and provide consent before submitting");
      return;
    }
    if (ticketType === "Price List Updates" && !customDescription.includes("Description of Changes: ") || (ticketType === "Price List Updates" && customDescription.includes("Description of Changes: N/A") && customDescription.includes("Terms & Conditions: N/A"))) {
      toast.error("Please fill in at least one field (Description or Terms & Conditions)");
      return;
    }
    if (ticketType === "Emergency" && (customDescription.includes("Issue Type: N/A") || customDescription.includes("Description: N/A"))) {
      toast.error("Issue type and description are required for emergency tickets");
      return;
    }
    if (ticketType === "Content Request" && !contentPreview) {
      toast.error("Please generate the AI preview before creating the ticket");
      return;
    }
    if (!user) return;

    let finalDescription = isCustomForm ? customDescription : (genericDescription.trim() || null);
    const socialEnabled = clinicServices?.["Social Media"] !== false;
    if ((ticketType === "Add/Remove Team Members" || ticketType === "Pop-up Offers") && promoteSocial && socialEnabled && finalDescription) {
      finalDescription = `${finalDescription}\nPromote on Social Media: Yes`;
    }
    // Merge additional notes into the description so they're always visible on the ticket
    const trimmedNotes = notes.trim();
    if (trimmedNotes) {
      finalDescription = finalDescription
        ? `${finalDescription}\n\nAdditional Notes:\n${trimmedNotes}`
        : `Additional Notes:\n${trimmedNotes}`;
    }

    setLoading(true);

    const { data: ticket, error } = await supabase.from("department_tickets" as any).insert({
      title: title.trim(),
      department,
      ticket_type: ticketType,
      priority,
      // Emergency-priority tickets land directly in the Emergency category
      status: priority === "emergency" ? "emergency" : "open",
      description: finalDescription,
      notes: notes.trim() || null,
      created_by: user.id,
      ...(effectiveClinicId ? { clinic_id: effectiveClinicId } : {}),
      ...(ticketType === "Content Request" && contentPreview
        ? { content_preview: contentPreview, content_approval_status: "pending" }
        : {}),
    } as any).select("id").single();

    if (error || !ticket) {
      toast.error("Failed to create ticket");
      console.error(error);
      setLoading(false);
      return;
    }

    if (files.length > 0) {
      setUploading(true);
      const paths = await uploadFiles((ticket as any).id);
      if (paths.length > 0) {
        await supabase.from("department_tickets" as any)
          .update({ attachments: paths } as any)
          .eq("id", (ticket as any).id);
      }
      setUploading(false);
    }

    // Fire-and-forget email notification to matching team members for this clinic+department
    supabase.functions.invoke("notify-ticket-created", {
      body: { ticketId: (ticket as any).id },
    }).catch((e) => console.warn("notify-ticket-created failed", e));

    setLoading(false);
    setSubmitted(true);
    onCreated();
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };


  const renderCustomForm = () => {
    switch (ticketType) {
      case "Time Changes":
        return <TimeChangesForm onChange={handleCustomFormChange} />;
      case "Pop-up Offers":
        return <PopupOffersForm onChange={handleCustomFormChange} onConsentChange={setPopupConsented} clinicId={clinicId} />;
      case "Third Party Integrations":
        return <ThirdPartyIntegrationsForm onChange={handleCustomFormChange} />;
      case "Payment Options":
        return <PaymentOptionsForm onChange={handleCustomFormChange} />;
      case "Add/Remove Team Members":
        return <AddRemoveTeamForm onChange={handleCustomFormChange} onValidityChange={setTeamFormValid} onFilesChange={setFiles} />;
      case "New Forms":
        return <NewFormsForm onChange={handleCustomFormChange} files={files} onFilesChange={setFiles} />;
      case "Price List Updates":
        return <PriceListForm onChange={handleCustomFormChange} />;
      case "Emergency":
        return <EmergencyForm onChange={handleCustomFormChange} />;
      case "Dashboard Access":
        return <DashboardAccessForm onChange={handleCustomFormChange} />;
      case "Analytics Review":
        return <AnalyticsReviewForm onChange={handleCustomFormChange} />;
      case "Monthly Performance Report":
        return <MonthlyReportForm onChange={handleCustomFormChange} />;
      case "Call Volume Issues":
        return <CallVolumeIssuesForm onChange={handleCustomFormChange} />;
      case "Wrong Call Tracking":
        return <WrongCallTrackingForm onChange={handleCustomFormChange} />;
      case "Campaign Adjustments":
        return <CampaignAdjustmentsForm onChange={handleCustomFormChange} />;
      case "Content Request":
        return <ContentRequestForm onChange={handleCustomFormChange} clinicId={effectiveClinicId} onPreviewChange={setContentPreview} />;
      case "Client Visit":
        return <ClientVisitForm onChange={handleCustomFormChange} />;
      case "Special Promotion":
        return <SpecialPromotionForm onChange={handleCustomFormChange} />;
      case "Boost":
        return <BoostForm onChange={handleCustomFormChange} />;
      case "Bulk Uploads":
        return <BulkUploadsForm onChange={handleCustomFormChange} files={files} onFilesChange={setFiles} />;
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) handleClose(); else onOpenChange(val); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {submitted ? (
          <>
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
              <div className="rounded-full bg-primary/10 p-4">
                <CheckCircle2 className="h-10 w-10 text-primary" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-foreground">Ticket Submitted Successfully</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Your request has been received and assigned to our team.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                <Clock className="h-4 w-4 shrink-0" />
                <span>Expected turnaround: <strong className="text-foreground">{ticketType === "Emergency" ? "Within 24 hours" : "24–48 business hours"}</strong> (Mon–Fri)</span>
              </div>
              {(() => {
                const depts = getVisibleDepartmentLabels(ticketType);
                // For Add/Remove Team Members (add action) or Pop-up Offers with social promotion, add Social Media
                let finalDepts = (isAddTeamMember || isPopupOffer) && promoteSocial
                  ? [...depts, "Social Media"]
                  : depts;
                // Filter out departments that are locked for this clinic so the
                // confirmation never advertises a forward to a disabled service.
                if (clinicServices) {
                  finalDepts = finalDepts.filter(d => clinicServices[d] !== false);
                }
                return finalDepts.length > 0 ? (
                  <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground w-full">
                    <p className="mb-1.5 font-medium text-foreground text-xs uppercase tracking-wide">Forwarded to</p>
                    <div className="flex flex-wrap gap-1.5">
                      {finalDepts.map(d => (
                        <span key={d} className="inline-flex items-center rounded-xl bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}
            </div>
            <DialogFooter>
              <Button onClick={handleClose} className="w-full">Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>New Ticket - {ticketType ? getTicketTypeLabel(ticketType) : "Select Type"}</DialogTitle>
              <DialogDescription>Create a new support ticket for this department.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {!isCustomForm && (
                <VoiceDictation
                  formType="Generic"
                  onFieldsExtracted={(fields) => {
                    if (fields.title) setTitle(fields.title);
                    if (fields.description) setGenericDescription(fields.description);
                    if (fields.notes) setNotes(fields.notes);
                  }}
                />
              )}
              {needsClinicSelection && (
                <div className="space-y-1.5">
                  <Label>Clinic *</Label>
                  <ClinicSelector
                    clinics={clinics}
                    selectedClinicId={selectedClinicId}
                    onSelect={setSelectedClinicId}
                    loading={clinicsLoading}
                  />
                  <p className="text-xs text-muted-foreground">Select which clinic this ticket is for.</p>
                </div>
              )}
              {!isCustomForm && (
                <div className="space-y-1.5">
                  <Label htmlFor="ticket-title">Title *</Label>
                  <Input id="ticket-title" placeholder="Brief summary of the issue" value={title} onChange={e => setTitle(e.target.value)} />
                </div>
              )}

              {!isCustomForm && (
                <div className="space-y-1.5">
                  <Label>Type *</Label>
                  <Select value={ticketType} onValueChange={setTicketType}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {serviceOptions.map((service) => (
                        <SelectItem key={service.value} value={service.value}>{service.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {isCustomForm ? (
                renderCustomForm()
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="ticket-desc">Description</Label>
                  <Textarea id="ticket-desc" placeholder="Describe the issue in detail..." value={genericDescription} onChange={e => setGenericDescription(e.target.value)} rows={3} />
                </div>
              )}

              {ticketType !== "Pop-up Offers" && !["Content Request","Client Visit","Special Promotion","Boost","Bulk Uploads","Add/Remove Team Members"].includes(ticketType) && (
                <div className="space-y-1.5">
                  <Label htmlFor="ticket-notes">Notes</Label>
                  <Textarea id="ticket-notes" placeholder="Additional notes..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
                </div>
              )}

              {ticketType !== "Time Changes" && ticketType !== "Pop-up Offers" && ticketType !== "New Forms" && ticketType !== "Bulk Uploads" && ticketType !== "Add/Remove Team Members" && (
                <FileUploader files={files} onFilesChange={setFiles} label={ticketType === "Price List Updates" ? "Upload your price list doc" : "Attachments"} />
              )}

              {(isAddTeamMember || isPopupOffer) && clinicServices?.["Social Media"] !== false && (
                <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 p-3">
                  <Checkbox
                    id="promote-social"
                    checked={promoteSocial}
                    onCheckedChange={(checked) => setPromoteSocial(checked === true)}
                  />
                  <Label htmlFor="promote-social" className="cursor-pointer text-sm font-normal">
                    {ticketType === "Pop-up Offers" ? "Promote this offer on social media" : "Promote new team member on social media"}
                  </Label>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              {!(ticketType === "Content Request" && !contentPreview) && (
                <Button onClick={handleSubmit} disabled={loading || uploading || (ticketType === "Pop-up Offers" && !popupConsented) || (ticketType === "Add/Remove Team Members" && !teamFormValid)}>
                  {uploading ? (
                    <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Uploading…</>
                  ) : loading ? "Creating…" : "Create Ticket"}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
