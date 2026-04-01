export type Department = "design" | "seo" | "social" | "ads" | "all";

export interface JourneyStep {
  number: number;
  name: string;
  departments: Department[];
}

export interface JourneyPhase {
  id: number;
  name: string;
  recurring?: boolean;
  steps: JourneyStep[];
}

export const DEPARTMENT_COLORS: Record<Department, { bg: string; text: string }> = {
  design: { bg: "bg-blue-500/15", text: "text-blue-600 dark:text-blue-400" },
  seo: { bg: "bg-emerald-500/15", text: "text-emerald-600 dark:text-emerald-400" },
  social: { bg: "bg-purple-500/15", text: "text-purple-600 dark:text-purple-400" },
  ads: { bg: "bg-amber-500/15", text: "text-amber-600 dark:text-amber-400" },
  all: { bg: "bg-muted", text: "text-muted-foreground" },
};

export const DEPARTMENT_LABELS: Record<Department, string> = {
  design: "Design",
  seo: "SEO",
  social: "Social",
  ads: "Ads",
  all: "All Depts",
};

export const JOURNEY_PHASES: JourneyPhase[] = [
  {
    id: 1,
    name: "Client Onboarding",
    steps: [
      { number: 1, name: "Discovery call", departments: ["all"] },
      { number: 2, name: "Client negotiations", departments: ["all"] },
      { number: 3, name: "Brand assessment form", departments: ["all"] },
    ],
  },
  {
    id: 2,
    name: "Website Build",
    steps: [
      { number: 4, name: "Designing", departments: ["design"] },
      { number: 5, name: "Development", departments: ["design"] },
      { number: 6, name: "Review", departments: ["design"] },
      { number: 7, name: "Finalizing", departments: ["design"] },
      { number: 8, name: "Content - website & services", departments: ["design", "seo"] },
    ],
  },
  {
    id: 3,
    name: "SEO Foundation",
    steps: [
      { number: 9, name: "On-page SEO", departments: ["seo"] },
      { number: 10, name: "Meta titles", departments: ["seo"] },
      { number: 11, name: "Privacy policy setup", departments: ["seo", "design"] },
    ],
  },
  {
    id: 4,
    name: "Technical Integration",
    steps: [
      { number: 12, name: "GBP linking", departments: ["seo"] },
      { number: 13, name: "Google Tag Manager", departments: ["seo", "design"] },
      { number: 14, name: "Google Analytics", departments: ["seo"] },
    ],
  },
  {
    id: 5,
    name: "Social Media Setup",
    steps: [
      { number: 15, name: "Meta access - Facebook page", departments: ["social"] },
      { number: 16, name: "Instagram login", departments: ["social"] },
      { number: 17, name: "Meta account setup", departments: ["social"] },
      { number: 18, name: "Meta Pixel code generation", departments: ["social"] },
      { number: 19, name: "Location targeting", departments: ["social", "ads"] },
    ],
  },
  {
    id: 6,
    name: "Ads Setup",
    steps: [
      { number: 20, name: "Ads group setup", departments: ["ads"] },
    ],
  },
  {
    id: 7,
    name: "Brand & Content Launch",
    steps: [
      { number: 21, name: "Brand evaluation", departments: ["design", "social"] },
      { number: 22, name: "Color scheme", departments: ["design"] },
      { number: 23, name: "Content generation", departments: ["social"] },
      { number: 24, name: "Graphics", departments: ["design"] },
      { number: 25, name: "Posting & scheduling", departments: ["social"] },
    ],
  },
  {
    id: 8,
    name: "Monthly Ongoing",
    recurring: true,
    steps: [
      { number: 26, name: "Google Ads campaign mgmt", departments: ["ads"] },
      { number: 27, name: "Compliance work", departments: ["all"] },
      { number: 28, name: "Monthly SEO posting", departments: ["seo"] },
      { number: 29, name: "GBP posting", departments: ["seo"] },
      { number: 30, name: "GBP optimization", departments: ["seo"] },
      { number: 31, name: "Backlinking", departments: ["seo"] },
    ],
  },
];

export const TOTAL_STEPS = 31;
