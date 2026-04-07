import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Save, Send, Dna } from "lucide-react";
import { toast } from "sonner";
import { useBrandDNA } from "@/hooks/useBrandDNA";

const QUESTIONS = [
  {
    key: "q1_differentiator",
    title: "Real Differentiator",
    question: "What does your clinic do that no one else in your area does — or does as well? What would a loyal client say if asked why they drive past other clinics to get to yours?",
    helper: "Think about specific things: a special piece of equipment, a unique service, how you handle emergencies, your communication style, follow-up calls, etc.",
    type: "textarea" as const,
  },
  {
    key: "q2_myth",
    title: "Myth or Misconception",
    question: "What's one myth or misconception pet owners in your community believe that you wish you could correct?",
    helper: "Example: 'People think their dog's mouth is clean' or 'Cat owners think indoor cats don't need checkups.' This becomes content fuel.",
    type: "textarea" as const,
  },
  {
    key: "q3_target_client",
    title: "Target Client",
    question: "Describe your ideal client in one sentence. Who do you want MORE of walking through the door?",
    helper: "Be specific: age range, pet type, life stage, neighbourhood, attitude toward vet care.",
    type: "textarea" as const,
  },
  {
    key: "q4_founding_story",
    title: "Founding Story",
    question: "What's the founding story of the clinic? Why did you (or the owner) start it? What moment made you realize this was your calling?",
    helper: "Even a short anecdote works. Founding stories humanize the brand and create emotional anchoring in content.",
    type: "textarea" as const,
  },
  {
    key: "q5_owner_presence",
    title: "Owner Presence",
    question: "How involved should the owner/lead vet be in social media content?",
    helper: "This affects how we frame posts — whether the owner's name, face, and quotes appear in content.",
    type: "radio" as const,
    options: [
      { value: "featured", label: "Featured — Name, face, and quotes in content" },
      { value: "behind_scenes", label: "Behind the scenes — Referenced but not front-facing" },
      { value: "anonymous", label: "Anonymous — Clinic brand only, no personal branding" },
    ],
  },
  {
    key: "q6_growth_priority",
    title: "Growth Priority",
    question: "If you could grow ONE area of your practice in the next 6 months, what would it be?",
    helper: "Examples: more dental cases, more puppy wellness plans, more exotic pet clients, more surgical referrals.",
    type: "textarea" as const,
  },
  {
    key: "q7_content_exclusions",
    title: "Content Exclusions",
    question: "Is there any topic, tone, or type of content you absolutely do NOT want associated with your clinic?",
    helper: "Examples: no raw feeding content, no political references, no graphic surgery photos, no humor about euthanasia.",
    type: "textarea" as const,
  },
  {
    key: "q8_community_connections",
    title: "Community Connections",
    question: "Does your clinic partner with or support any local organizations, shelters, rescues, or community groups?",
    helper: "These partnerships can be powerful content themes and show community involvement.",
    type: "textarea" as const,
  },
  {
    key: "q9_patient_consent",
    title: "Patient Photo Consent",
    question: "Can we use real patient photos (with owner permission) in social content?",
    helper: "Real patient photos dramatically increase engagement vs. stock photos.",
    type: "radio" as const,
    options: [
      { value: "yes_always", label: "Yes — We have blanket consent from most clients" },
      { value: "conditional", label: "Conditional — Need to ask each time" },
      { value: "no", label: "No — Use stock photos or illustrations only" },
    ],
  },
  {
    key: "q10_stat_holidays",
    title: "Statutory Holidays",
    question: "How should we handle statutory holiday content (Christmas, Thanksgiving, Canada Day, etc.)?",
    helper: "Some clinics want festive content, others prefer to stay professional year-round.",
    type: "radio" as const,
    options: [
      { value: "always_post", label: "Always post holiday content" },
      { value: "confirm_annually", label: "Confirm each year which holidays to acknowledge" },
      { value: "skip", label: "Skip holiday content entirely" },
    ],
  },
];

const ADDITIONAL_FIELDS = [
  { key: "neighbourhood_character", label: "Neighbourhood Character", placeholder: "Describe the vibe of your neighbourhood (e.g., suburban family area, downtown urban, rural farming community)" },
  { key: "voice_phrases", label: "Voice Phrases / Signature Language", placeholder: "Any phrases, slogans, or words your clinic uses regularly (e.g., 'fur babies', 'pawsome care')" },
  { key: "local_trails_parks", label: "Local Trails / Parks", placeholder: "Nearby parks, trails, or outdoor spots your clients frequent" },
  { key: "cultural_communities", label: "Cultural Communities", placeholder: "Any cultural communities or demographics prominent in your area" },
  { key: "visual_style", label: "Visual Style Preference", placeholder: "Describe your preferred visual style (e.g., warm & cozy, clean & clinical, fun & colorful)" },
];

interface Props {
  clinicId: string;
  onComplete: () => void;
}

export function BrandDNAForm({ clinicId, onComplete }: Props) {
  const { dna, upsertDNA } = useBrandDNA(clinicId);
  const totalSteps = QUESTIONS.length + 1; // +1 for additional fields
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (dna?.call_notes) {
      Object.entries(dna.call_notes as Record<string, string>).forEach(([k, v]) => {
        if (typeof v === "string") initial[k] = v;
      });
    }
    return initial;
  });
  const [additional, setAdditional] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (dna?.additional_fields) {
      Object.entries(dna.additional_fields as Record<string, string>).forEach(([k, v]) => {
        if (typeof v === "string") initial[k] = v;
      });
    }
    return initial;
  });

  const progress = ((step + 1) / totalSteps) * 100;
  const isLastStep = step === totalSteps - 1;
  const isQuestionStep = step < QUESTIONS.length;

  const handleSaveDraft = async () => {
    try {
      await upsertDNA.mutateAsync({
        call_notes: answers,
        additional_fields: additional,
        status: "draft",
      });
      toast.success("Draft saved");
    } catch {
      toast.error("Failed to save draft");
    }
  };

  const handleSubmit = async () => {
    try {
      await upsertDNA.mutateAsync({
        call_notes: answers,
        additional_fields: additional,
        status: "completed",
      });
      toast.success("Brand DNA submitted successfully!");
      onComplete();
    } catch {
      toast.error("Failed to submit Brand DNA");
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 mb-4">
          <Dna className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Brand DNA Questionnaire</h1>
        <p className="text-muted-foreground mt-1 text-sm">Help us understand your clinic's unique identity to create tailored content</p>
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
          <span>Step {step + 1} of {totalSteps}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {isQuestionStep ? QUESTIONS[step].title : "Additional Details"}
          </CardTitle>
          {isQuestionStep && (
            <CardDescription className="text-sm leading-relaxed">
              {QUESTIONS[step].question}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {isQuestionStep ? (
            <>
              <p className="text-xs text-muted-foreground italic">{QUESTIONS[step].helper}</p>
              {QUESTIONS[step].type === "textarea" ? (
                <Textarea
                  value={answers[QUESTIONS[step].key] || ""}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [QUESTIONS[step].key]: e.target.value }))}
                  placeholder="Type your answer here..."
                  rows={5}
                  className="resize-none"
                />
              ) : (
                <RadioGroup
                  value={answers[QUESTIONS[step].key] || ""}
                  onValueChange={(v) => setAnswers((prev) => ({ ...prev, [QUESTIONS[step].key]: v }))}
                  className="space-y-3"
                >
                  {QUESTIONS[step].options!.map((opt) => (
                    <div key={opt.value} className="flex items-center space-x-3">
                      <RadioGroupItem value={opt.value} id={opt.value} />
                      <Label htmlFor={opt.value} className="text-sm font-normal cursor-pointer">{opt.label}</Label>
                    </div>
                  ))}
                </RadioGroup>
              )}
            </>
          ) : (
            <div className="space-y-4">
              {ADDITIONAL_FIELDS.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label className="text-sm">{field.label}</Label>
                  <Input
                    value={additional[field.key] || ""}
                    onChange={(e) => setAdditional((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between mt-6">
        <Button variant="outline" size="sm" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>

        <Button variant="ghost" size="sm" onClick={handleSaveDraft} disabled={upsertDNA.isPending}>
          <Save className="h-4 w-4 mr-1" /> Save Draft
        </Button>

        {isLastStep ? (
          <Button size="sm" onClick={handleSubmit} disabled={upsertDNA.isPending}>
            <Send className="h-4 w-4 mr-1" /> Submit
          </Button>
        ) : (
          <Button size="sm" onClick={() => setStep((s) => s + 1)}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}
