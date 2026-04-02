import { useState } from "react";
import { useTopicLibrary } from "@/hooks/useTopicLibrary";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, Pencil, BookOpen, Sprout, AlertTriangle, ShieldAlert, ShieldCheck } from "lucide-react";
import { TopicSetEditor } from "./TopicSetEditor";
import { MONTH_NAMES } from "@/lib/gbp/hookRotation";
import { scanTopicTitle } from "@/lib/gbp/compliance";
import type { GBPTopicSet, TopicVariant } from "@/lib/gbp/types";

export function TopicLibrary() {
  const { role } = useUserRole();
  const isAdmin = role === "admin";
  const { topics, topicsByMonth, isLoading, upsertTopic } = useTopicLibrary();
  const [expandedMonth, setExpandedMonth] = useState<number | null>(null);
  const [editingTopic, setEditingTopic] = useState<GBPTopicSet | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // Check if library needs annual review
  const lastUpdated = topics.length > 0
    ? new Date(Math.max(...topics.map(t => new Date(t.updated_at).getTime())))
    : null;
  const needsReview = lastUpdated && (Date.now() - lastUpdated.getTime()) > 11 * 30 * 24 * 60 * 60 * 1000;

  const handleSaveTopic = async (data: Partial<GBPTopicSet>) => {
    try {
      await upsertTopic.mutateAsync(data as any);
      toast.success("Topic set saved");
      setEditDialogOpen(false);
      setEditingTopic(null);
    } catch (e: any) {
      toast.error(e.message || "Failed to save topic set");
    }
  };

  const handleSeedLibrary = async () => {
    if (topics.length > 0) {
      toast.error("Library already has topics. Delete existing topics first.");
      return;
    }
    setSeeding(true);
    try {
      const defaultTopics = generateDefaultTopics();
      for (const topic of defaultTopics) {
        await upsertTopic.mutateAsync(topic as any);
      }
      toast.success("Topic library seeded with 48 topic sets!");
    } catch (e: any) {
      toast.error(e.message || "Failed to seed library");
    } finally {
      setSeeding(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-emerald-500" />
          <h2 className="text-sm font-bold text-foreground">Topic Library</h2>
          <Badge variant="secondary" className="text-xs">{topics.length}/48 topics</Badge>
        </div>
      </div>

      {/* Annual Review Banner */}
      {needsReview && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            <div>
              <p className="text-xs font-medium text-foreground">Annual topic library review recommended</p>
              <p className="text-[10px] text-muted-foreground">Last updated: {lastUpdated?.toLocaleDateString()}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Seed Button */}
      {topics.length === 0 && isAdmin && (
        <Card className="border-dashed border-emerald-500/30">
          <CardContent className="flex flex-col items-center py-10 text-center">
            <Sprout className="h-10 w-10 text-emerald-500/40 mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">Topic library is empty</p>
            <p className="text-xs text-muted-foreground mb-4 max-w-md">
              Seed the library with 48 veterinary topic sets (12 months × 4 variants) based on seasonal patterns.
            </p>
            <Button size="sm" onClick={handleSeedLibrary} disabled={seeding} className="gap-1.5">
              <Sprout className="h-3 w-3" />
              {seeding ? "Seeding..." : "Seed Topic Library"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Month Cards */}
      {Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
        const monthTopics = topicsByMonth[month] ?? [];
        const isExpanded = expandedMonth === month;

        return (
          <Collapsible key={month} open={isExpanded} onOpenChange={() => setExpandedMonth(isExpanded ? null : month)}>
            <CollapsibleTrigger asChild>
              <Card className="border-border/60 cursor-pointer hover:border-border transition-colors">
                <CardContent className="flex items-center justify-between py-2.5 px-4">
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                    <span className="text-sm font-medium">{MONTH_NAMES[month - 1]}</span>
                    {monthTopics[0]?.seasonal_theme && (
                      <Badge variant="outline" className="text-[10px]">{monthTopics[0].seasonal_theme}</Badge>
                    )}
                  </div>
                  <Badge variant={monthTopics.length === 4 ? "default" : "secondary"} className="text-[10px]">
                    {monthTopics.length}/4
                  </Badge>
                </CardContent>
              </Card>
            </CollapsibleTrigger>
            <AnimatePresence>
              {isExpanded && (
                <CollapsibleContent forceMount>
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                    <Card className="mt-1 border-border/40">
                      <CardContent className="p-0">
                        {monthTopics.length > 0 ? (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs w-16">Variant</TableHead>
                                <TableHead className="text-xs">Week 1 (What's New)</TableHead>
                                <TableHead className="text-xs">Week 2 (Products)</TableHead>
                                <TableHead className="text-xs">Week 3 (What's New)</TableHead>
                                <TableHead className="text-xs">Week 4 (What's New)</TableHead>
                                {isAdmin && <TableHead className="text-xs w-12" />}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(['A', 'B', 'C', 'D'] as TopicVariant[]).map(variant => {
                                const topic = monthTopics.find(t => t.variant === variant);
                                if (!topic) return (
                                  <TableRow key={variant}>
                                    <TableCell><Badge variant="outline" className="text-[10px] font-mono">{variant}</Badge></TableCell>
                                    <TableCell colSpan={4} className="text-xs text-muted-foreground italic">Not configured</TableCell>
                                    {isAdmin && (
                                      <TableCell>
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                                          setEditingTopic({ month, variant, week_1_topic: "", week_2_topic: "", week_3_topic: "", week_4_topic: "", seasonal_theme: monthTopics[0]?.seasonal_theme ?? "" } as any);
                                          setEditDialogOpen(true);
                                        }}>
                                          <Pencil className="h-3 w-3" />
                                        </Button>
                                      </TableCell>
                                    )}
                                  </TableRow>
                                );
                                return (
                                  <TableRow key={variant}>
                                    <TableCell><Badge variant="outline" className="text-[10px] font-mono">{variant}</Badge></TableCell>
                                    <TopicCell title={topic.week_1_topic} />
                                    <TopicCell title={topic.week_2_topic} />
                                    <TopicCell title={topic.week_3_topic} />
                                    <TopicCell title={topic.week_4_topic} />
                                    {isAdmin && (
                                      <TableCell>
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingTopic(topic); setEditDialogOpen(true); }}>
                                          <Pencil className="h-3 w-3" />
                                        </Button>
                                      </TableCell>
                                    )}
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        ) : (
                          <div className="py-6 text-center">
                            <p className="text-xs text-muted-foreground">No topics configured for {MONTH_NAMES[month - 1]}.</p>
                            {isAdmin && (
                              <Button variant="link" size="sm" className="text-xs mt-1" onClick={() => {
                                setEditingTopic({ month, variant: 'A', week_1_topic: "", week_2_topic: "", week_3_topic: "", week_4_topic: "", seasonal_theme: "" } as any);
                                setEditDialogOpen(true);
                              }}>
                                Add topics
                              </Button>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                </CollapsibleContent>
              )}
            </AnimatePresence>
          </Collapsible>
        );
      })}

      {/* Edit Dialog */}
      <TopicSetEditor
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        topic={editingTopic}
        onSave={handleSaveTopic}
        isSaving={upsertTopic.isPending}
      />
    </motion.div>
  );
}

// ─── Topic Cell with Compliance Check ────────────────────────────
function TopicCell({ title }: { title: string }) {
  const scan = scanTopicTitle(title);
  if (scan.pass) {
    return (
      <TableCell className="text-xs">
        <span className="flex items-center gap-1">
          {title}
          <ShieldCheck className="h-3 w-3 text-emerald-500 shrink-0" />
        </span>
      </TableCell>
    );
  }
  return (
    <TableCell className="text-xs">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 cursor-help">
              {title}
              <ShieldAlert className="h-3 w-3 shrink-0" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="text-xs font-medium mb-1">Compliance Issues:</p>
            <ul className="text-[10px] space-y-0.5">
              {scan.issues.map((issue, i) => (
                <li key={i}>• {issue}</li>
              ))}
            </ul>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </TableCell>
  );
}

// ─── Default Topic Seeds ─────────────────────────────────────────
function generateDefaultTopics(): Array<Partial<GBPTopicSet>> {
  const themes: Record<number, { theme: string; topics: Record<TopicVariant, [string, string, string, string]> }> = {
    1: { theme: "New Year Pet Health", topics: {
      A: ["New Year Pet Resolutions", "Dental Health Month", "Winter Pet Safety", "Weight Management"],
      B: ["Cold Weather Pet Care", "Dental Cleaning Specials", "Indoor Exercise Tips", "Nutrition Basics"],
      C: ["Pet Wellness Checkups", "Professional Dental Care", "Hypothermia Prevention", "Senior Pet Nutrition"],
      D: ["New Year Vet Visits", "Home Dental Care", "Paw Protection Winter", "Puppy/Kitten Nutrition"],
    }},
    2: { theme: "Dental Health Awareness", topics: {
      A: ["Pet Dental Disease Signs", "Heartworm Prevention", "Valentine's Day Pet Safety", "Spay/Neuter Benefits"],
      B: ["Professional Teeth Cleaning", "Parasite Prevention Start", "Chocolate Toxicity Awareness", "Responsible Pet Ownership"],
      C: ["Dental X-Rays Importance", "Flea & Tick Season Prep", "Valentine Flowers Toxicity", "Population Control Benefits"],
      D: ["Bad Breath in Pets", "Spring Parasite Prep", "Love Your Pet Health", "Surgery Recovery Tips"],
    }},
    3: { theme: "Spring Wellness", topics: {
      A: ["Spring Allergy Season", "Microchipping Benefits", "Easter Hazards for Pets", "Vaccination Updates"],
      B: ["Seasonal Skin Issues", "Lost Pet Prevention", "Holiday Food Dangers", "Core vs Non-Core Vaccines"],
      C: ["Pollen Allergies in Pets", "ID Tag Importance", "Spring Cleaning Pet Safety", "Puppy Vaccination Schedule"],
      D: ["Allergy Testing Options", "Travel Safety Prep", "Garden Plant Toxicity", "Adult Booster Shots"],
    }},
    4: { theme: "Heartworm & Parasite Season", topics: {
      A: ["Heartworm Testing", "Tick-Borne Diseases", "Arthritis in Pets", "Pet First Aid Basics"],
      B: ["Monthly Preventatives", "Lyme Disease Awareness", "Joint Supplements", "Emergency Kit for Pets"],
      C: ["Heartworm Treatment", "Tick Removal Guide", "Mobility Support", "Poison Control for Pets"],
      D: ["Year-Round Prevention", "Tick Habitat Avoidance", "Pain Management Options", "When to Seek Emergency Care"],
    }},
    5: { theme: "Senior Pet Care", topics: {
      A: ["Senior Pet Wellness Exams", "Heat Safety Prep", "Ear Infection Prevention", "Mental Stimulation"],
      B: ["Age-Related Conditions", "Dehydration Risks", "Ear Cleaning Guide", "Enrichment Toys"],
      C: ["Cognitive Health Seniors", "Summer Exercise Timing", "Chronic Ear Issues", "Training at Any Age"],
      D: ["Comfort Care for Seniors", "Water Safety for Pets", "Allergy-Related Ear Problems", "Puzzle Feeders"],
    }},
    6: { theme: "Summer Safety", topics: {
      A: ["Heatstroke Prevention", "Travel with Pets", "Firework Anxiety Prep", "Skin & Coat Health"],
      B: ["Hot Pavement Awareness", "Car Travel Safety", "Noise Phobia Management", "Grooming Essentials"],
      C: ["Pool & Water Safety", "Boarding vs Pet Sitting", "Anxiety Medication Options", "Sun Protection"],
      D: ["Cooling Strategies", "Airline Travel Tips", "Desensitization Training", "Hot Spot Prevention"],
    }},
    7: { theme: "Summer Hazards", topics: {
      A: ["BBQ & Picnic Dangers", "Foxtail Awareness", "Eye Health Checkups", "Breed-Specific Health"],
      B: ["July 4th Pet Safety", "Grass Seed Injuries", "Cherry Eye & Common Issues", "Large Breed Joint Care"],
      C: ["Summer Party Pet Safety", "Snake Bite Prevention", "Vision Changes in Seniors", "Small Breed Dental Care"],
      D: ["Outdoor Adventure Hazards", "Wildlife Encounters", "Regular Eye Exams", "Brachycephalic Care"],
    }},
    8: { theme: "Back-to-School Pet Health", topics: {
      A: ["Separation Anxiety Tips", "Routine Vet Checkup", "Urinary Health", "Kidney Health Awareness"],
      B: ["Schedule Changes Impact", "Wellness Blood Work", "Litter Box Health Signs", "Early Detection Benefits"],
      C: ["Comfort Items for Pets", "Annual Physical Exams", "UTI Prevention", "Kidney-Friendly Diets"],
      D: ["Gradual Routine Changes", "Preventive Diagnostics", "Water Intake Importance", "Blood Pressure Monitoring"],
    }},
    9: { theme: "Fall Wellness", topics: {
      A: ["Fall Allergy Flare-ups", "Pet Obesity Prevention", "Dental Health Revisit", "Digestive Health"],
      B: ["Ragweed & Mold Allergies", "Healthy Weight Programs", "Six-Month Dental Check", "Probiotics for Pets"],
      C: ["Seasonal Coat Changes", "Exercise & Diet Balance", "Dental Disease Prevention", "Food Sensitivity Signs"],
      D: ["Autumn Skin Care", "Treat Alternatives", "Professional Cleaning Benefits", "GI Issue Management"],
    }},
    10: { theme: "Halloween & Pet Safety", topics: {
      A: ["Halloween Candy Dangers", "Joint Health Awareness", "Respiratory Health", "Pet Insurance Benefits"],
      B: ["Costume Safety Tips", "Arthritis Cold Weather", "Coughing & Sneezing Causes", "Insurance vs Savings"],
      C: ["Decoration Hazards", "Glucosamine & Chondroitin", "Kennel Cough Prevention", "Coverage Comparison"],
      D: ["Trick-or-Treat Pet Safety", "Cold Weather Joint Care", "Asthma in Cats", "Claim Process Guide"],
    }},
    11: { theme: "Diabetes & Senior Care", topics: {
      A: ["Pet Diabetes Awareness", "Holiday Travel Prep", "Thyroid Health", "Gratitude for Pet Health"],
      B: ["Diabetes Symptoms", "Boarding Holiday Season", "Hyperthyroidism in Cats", "Thanksgiving Pet Safety"],
      C: ["Blood Sugar Monitoring", "Pet Sitter Checklist", "Hypothyroidism in Dogs", "Turkey & Feast Dangers"],
      D: ["Insulin Management", "Medication Travel Tips", "Thyroid Testing Schedule", "Giving Thanks for Vets"],
    }},
    12: { theme: "Holiday Safety & Year-End", topics: {
      A: ["Holiday Plant Toxicity", "Year-End Health Review", "Cold Weather Gear", "New Year Resolutions"],
      B: ["Christmas Tree Hazards", "Annual Wellness Summary", "Winter Paw Care", "Pet Goals for New Year"],
      C: ["Gift Wrapping Dangers", "Preventive Care Recap", "Antifreeze Poisoning Risk", "Health Milestone Planning"],
      D: ["Holiday Party Pet Stress", "Vaccination Status Review", "Snow & Ice Safety", "Building Health Routines"],
    }},
  };

  const result: Array<Partial<GBPTopicSet>> = [];
  for (let month = 1; month <= 12; month++) {
    const data = themes[month];
    for (const variant of ['A', 'B', 'C', 'D'] as TopicVariant[]) {
      const [w1, w2, w3, w4] = data.topics[variant];
      result.push({
        month,
        variant,
        week_1_topic: w1,
        week_2_topic: w2,
        week_3_topic: w3,
        week_4_topic: w4,
        seasonal_theme: data.theme,
      });
    }
  }
  return result;
}
