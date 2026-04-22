import {
  Clock, Megaphone, Plug, CreditCard, UserPlus, FileText, DollarSign, AlertTriangle, Sparkles,
  Phone, PhoneOff, MoreHorizontal,
  Link2, BarChart3, Search, ClipboardList, Zap, MessageSquare,
  PawPrint, UploadCloud, Tag, Rocket,
  type LucideIcon,
} from "lucide-react";

export interface QuickAction {
  type: string;
  title: string;
  helper: string;
  icon: LucideIcon;
  color: string;
}

const COLORS = [
  "text-blue-500 bg-blue-500/10",
  "text-emerald-500 bg-emerald-500/10",
  "text-amber-500 bg-amber-500/10",
  "text-violet-500 bg-violet-500/10",
  "text-rose-500 bg-rose-500/10",
  "text-sky-500 bg-sky-500/10",
  "text-teal-500 bg-teal-500/10",
];

const WEBSITE: QuickAction[] = [
  { type: "Time Changes",            title: "Time Changes",            helper: "Update clinic hours or holiday schedule",     icon: Clock,           color: COLORS[0] },
  { type: "Pop-up Offers",           title: "Pop-up Offers",           helper: "Launch a promo banner on the website",         icon: Megaphone,       color: COLORS[1] },
  { type: "Third Party Integrations",title: "Third Party Integrations",helper: "Connect booking, chat, or analytics tools",    icon: Plug,            color: COLORS[2] },
  { type: "Payment Options",         title: "Payment Options",         helper: "Add or update payment methods displayed",      icon: CreditCard,      color: COLORS[3] },
  { type: "Add/Remove Team Members", title: "Team Members",            helper: "Update the team page with new staff",          icon: UserPlus,        color: COLORS[4] },
  { type: "New Forms",               title: "New Forms",                helper: "Add intake or contact forms",                 icon: FileText,        color: COLORS[5] },
  { type: "Price List Updates",      title: "Price List Updates",      helper: "Update service prices on the site",            icon: DollarSign,      color: COLORS[6] },
  { type: "Emergency",               title: "Emergency",                helper: "Urgent change needed on the website",         icon: AlertTriangle,   color: "text-destructive bg-destructive/10" },
  { type: "Others",                  title: "Others",                   helper: "Anything else not listed above",              icon: Sparkles,        color: COLORS[0] },
];

const GOOGLE_ADS: QuickAction[] = [
  { type: "Call Volume Issues",  title: "Call Volume Issues",  helper: "Report drops or spikes in call activity",    icon: Phone,            color: COLORS[0] },
  { type: "Wrong Call Tracking", title: "Wrong Call Tracking", helper: "Flag misattributed or missing call data",     icon: PhoneOff,         color: COLORS[4] },
  { type: "Others",              title: "Others",              helper: "Anything else not listed above",              icon: MoreHorizontal,   color: COLORS[2] },
];

const SEO: QuickAction[] = [
  { type: "Backlinking",              title: "Backlinking",              helper: "Request new backlink outreach work",          icon: Link2,           color: COLORS[0] },
  { type: "Ranking Reports",          title: "Ranking Reports",          helper: "Pull keyword position snapshots",             icon: BarChart3,       color: COLORS[1] },
  { type: "Keyword Research",         title: "Keyword Research",         helper: "Discover new keyword opportunities",          icon: Search,          color: COLORS[2] },
  { type: "Manual Work Reports",      title: "Manual Work Reports",      helper: "Get a breakdown of completed SEO tasks",      icon: ClipboardList,   color: COLORS[3] },
  { type: "Search Atlas Integration", title: "Search Atlas",             helper: "Configure Search Atlas integration",          icon: Zap,             color: COLORS[4] },
  { type: "SEO Thread Updates",       title: "SEO Thread Updates",       helper: "Get the latest update on ongoing work",       icon: MessageSquare,   color: COLORS[5] },
  { type: "Others",                   title: "Others",                   helper: "Anything else not listed above",              icon: Sparkles,        color: COLORS[6] },
];

const SOCIAL_MEDIA: QuickAction[] = [
  { type: "Content Request",   title: "Content Request",   helper: "Request a custom post or campaign",       icon: FileText,    color: COLORS[0] },
  { type: "Client Visit",      title: "Client Visit",      helper: "Share a recent visit worth featuring",    icon: PawPrint,    color: COLORS[1] },
  { type: "Bulk Uploads",      title: "Bulk Uploads",      helper: "Upload up to 20 photos or files at once", icon: UploadCloud, color: COLORS[2] },
  { type: "Special Promotion", title: "Special Promotion", helper: "Launch a time-bound offer",               icon: Tag,         color: COLORS[3] },
  { type: "Boost",             title: "Boost",             helper: "Spotlight a service that needs traction", icon: Rocket,      color: COLORS[4] },
];

const REGISTRY: Record<string, QuickAction[]> = {
  website: WEBSITE,
  google_ads: GOOGLE_ADS,
  seo: SEO,
  social_media: SOCIAL_MEDIA,
};

export function getQuickActions(department: string): QuickAction[] {
  return REGISTRY[department] || [];
}

export function getQuickActionMeta(department: string, type: string): QuickAction | undefined {
  return getQuickActions(department).find(a => a.type === type);
}

export const SOCIAL_QUICK_ACTIONS = SOCIAL_MEDIA;
