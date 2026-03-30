import { useState, useEffect } from "react";
import { Link, useLocation, useSearchParams, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole, type AppRole } from "@/hooks/useUserRole";
import { usePendingCounts } from "@/hooks/usePendingCounts";
import { supabase } from "@/integrations/supabase/client";
import {
  Building2, Users, BarChart3, Settings, LogOut, Menu, X, ChevronRight,
  ShieldCheck, LayoutDashboard, UserCheck, CalendarCheck,
  Sun, Moon, PanelLeftClose, PanelLeft, Share2, Megaphone, Globe, Sparkles, Plus, FileText, SearchCode, Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import vsaLogo from "@/assets/vsa-logo.jpg";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { PageTransition } from "@/components/PageTransition";
import { NewTicketDialog } from "@/components/department/NewTicketDialog";
import { ChatAssistant } from "@/components/chat/ChatAssistant";
import { ClinicSelector } from "@/components/department/ClinicSelector";
import { useClinicSelector } from "@/hooks/useClinicSelector";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";

const departmentServices: Record<string, { label: string; services: string[] }> = {
  website: { label: "Website", services: ["Time Changes", "Pop-up Offers", "Third Party Integrations", "Payment Options", "Add/Remove Team Members", "New Forms", "Paper-to-Digital Conversion", "Price List Updates", "Tech Issues", "Others"] },
  seo: { label: "SEO", services: ["Backlinking", "Ranking Reports", "Keyword Research", "Manual Work Reports", "Search Atlas Integration", "SEO Thread Updates", "Others"] },
  google_ads: { label: "Google Ads", services: ["Dashboard Access", "Analytics Review", "Monthly Performance Report", "Call Volume Issues", "Wrong Call Tracking", "Campaign Adjustments", "Others"] },
  social_media: { label: "Social Media", services: ["Content Calendar", "Post Approval", "Analytics", "Campaign Planning", "Others"] },
};

/* Department color dots for nav */
const deptDotColors: Record<string, string> = {
  "/website": "bg-[hsl(var(--dept-website))]",
  "/seo": "bg-[hsl(var(--dept-seo))]",
  "/ai-seo": "bg-[hsl(var(--dept-ai-seo))]",
  "/google-ads": "bg-[hsl(var(--dept-ads))]",
  "/social": "bg-[hsl(var(--dept-social))]",
};

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  badge?: number;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

interface ClinicAccessState {
  website_enabled?: boolean;
  seo_enabled?: boolean;
  google_ads_enabled?: boolean;
  ai_seo_enabled?: boolean;
  social_media_enabled?: boolean;
}

const departmentPathToAccessKey: Record<string, keyof ClinicAccessState> = {
  "/website": "website_enabled",
  "/seo": "seo_enabled",
  "/ai-seo": "ai_seo_enabled",
  "/google-ads": "google_ads_enabled",
  "/social": "social_media_enabled",
};

const adminSections: NavSection[] = [
  { items: [
    { label: "Dashboard", icon: LayoutDashboard, path: "/" },
    { label: "Book a Meeting", icon: CalendarCheck, path: "/book-meeting" },
  ] },
  { title: "DEPARTMENTS", items: [
    { label: "Website", icon: Globe, path: "/website" },
    { label: "SEO", icon: SearchCode, path: "/seo" },
    { label: "AI SEO", icon: Sparkles, path: "/ai-seo" },
    { label: "Google Ads", icon: Megaphone, path: "/google-ads" },
    { label: "Social Media", icon: Share2, path: "/social" },
  ]},
  { title: "WORKSPACE", items: [
    { label: "Clinics", icon: Building2, path: "/clinics" },
    { label: "Team", icon: Users, path: "/employees" },
    { label: "Clients", icon: UserCheck, path: "/clients" },
  ]},
  { title: "ADMIN", items: [
    { label: "Reports", icon: FileText, path: "/reports" },
    { label: "Review Queue", icon: ShieldCheck, path: "/review" },
    { label: "Settings", icon: Settings, path: "/settings" },
  ]},
];

const conciergeSections: NavSection[] = [
  { items: [
    { label: "Dashboard", icon: LayoutDashboard, path: "/" },
    { label: "Book a Meeting", icon: CalendarCheck, path: "/book-meeting" },
  ] },
  { title: "DEPARTMENTS", items: [
    { label: "Website", icon: Globe, path: "/website" },
    { label: "SEO", icon: SearchCode, path: "/seo" },
    { label: "AI SEO", icon: Sparkles, path: "/ai-seo" },
    { label: "Google Ads", icon: Megaphone, path: "/google-ads" },
    { label: "Social Media", icon: Share2, path: "/social" },
  ]},
  { title: "WORKSPACE", items: [
    { label: "My Clinics", icon: Building2, path: "/clinics" },
    { label: "Reports", icon: FileText, path: "/reports" },
    { label: "Settings", icon: Settings, path: "/settings" },
  ]},
];

const pageTitles: Record<string, string> = {
  "/": "Dashboard", "/website": "Website", "/seo": "SEO", "/ai-seo": "AI SEO", "/google-ads": "Google Ads",
  "/social": "Social Media", "/review": "Admin Review", "/clinics": "Clinics",
  "/employees": "Team Members", "/clients": "Clients", "/reports": "Reports", "/settings": "Settings",
};

export function DashboardLayout({ children }: { children?: React.ReactNode }) {
  const { clinics: navClinics, selectedClinicId: navSelectedClinicId, setSelectedClinicId: navSetSelectedClinicId, loading: navClinicsLoading } = useClinicSelector();
  const { role } = useUserRole();
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "true");
  const [clientClinics, setClientClinics] = useState<{
    id: string;
    clinic_name: string;
    website_enabled: boolean;
    seo_enabled: boolean;
    google_ads_enabled: boolean;
    ai_seo_enabled: boolean;
    social_media_enabled: boolean;
  }[]>([]);
  const [clientSelectedId, setClientSelectedId] = useState<string | null>(null);
  const [clinicAccess, setClinicAccess] = useState<ClinicAccessState | null>(null);
  const [clinicAccessLoading, setClinicAccessLoading] = useState(true);
  const [profile, setProfile] = useState<{ full_name: string | null } | null>(null);
  const [userDepartments, setUserDepartments] = useState<string[] | null>(null);
  const { pendingRequests, pendingReview } = usePendingCounts();

  const [deptPickerOpen, setDeptPickerOpen] = useState(false);
  const [globalTicketOpen, setGlobalTicketOpen] = useState(false);
  const [globalTicketDept, setGlobalTicketDept] = useState("website");

  useEffect(() => {
    const handler = () => setDeptPickerOpen(true);
    window.addEventListener("open-new-ticket", handler);
    return () => window.removeEventListener("open-new-ticket", handler);
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
      .then(({ data }) => { if (data) setProfile(data); });
  }, [user]);

  // Fetch department assignments for concierge users
  useEffect(() => {
    if (!user || role !== "concierge") return;
    supabase
      .from("department_members")
      .select("department")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (data) {
          setUserDepartments(data.map(d => d.department));
        }
      });
  }, [user, role]);


  useEffect(() => {
    if (role === "client" && user) {
      supabase
        .from("clinics")
        .select("id, clinic_name, website_enabled, seo_enabled, google_ads_enabled, ai_seo_enabled, social_media_enabled")
        .eq("owner_user_id", user.id)
        .order("clinic_name")
        .then(({ data }) => {
          if (data && data.length > 0) {
            setClientClinics(data);
            const urlClinic = searchParams.get("clinic");
            const initialId = urlClinic && data.some(c => c.id === urlClinic) ? urlClinic : data[0].id;
            setClientSelectedId(initialId);
            if (!urlClinic) {
              setSearchParams(prev => { const next = new URLSearchParams(prev); next.set("clinic", initialId); return next; }, { replace: true });
            }
          }
        });
    }
  }, [role, user]);

  const clientClinic = clientClinics.find(c => c.id === clientSelectedId) || clientClinics[0] || null;

  const selectedClinicId = searchParams.get("clinic") || "";
  const activeClinicId = role === "client" ? clientSelectedId : selectedClinicId || null;

  const [clinicAccessId, setClinicAccessId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeClinicId) { setClinicAccessLoading(false); return; }
    if (activeClinicId === clinicAccessId && clinicAccess) return;

    setClinicAccessLoading(true);
    (supabase
      .from("clinics" as any)
      .select("website_enabled, seo_enabled, google_ads_enabled, ai_seo_enabled, social_media_enabled")
      .eq("id", activeClinicId)
      .maybeSingle() as any)
      .then(({ data }: { data: ClinicAccessState | null }) => {
        setClinicAccess(data);
        setClinicAccessId(activeClinicId);
        setClinicAccessLoading(false);
      });
  }, [activeClinicId]);

  useEffect(() => {
    if (!activeClinicId) return;

    const channel = supabase
      .channel(`clinic-access-${activeClinicId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "clinics",
          filter: `id=eq.${activeClinicId}`,
        },
        (payload) => {
          const next = payload.new as ClinicAccessState;
          setClinicAccess({
            website_enabled: next.website_enabled,
            seo_enabled: next.seo_enabled,
            google_ads_enabled: next.google_ads_enabled,
            ai_seo_enabled: next.ai_seo_enabled,
            social_media_enabled: next.social_media_enabled,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeClinicId]);

  const clientSections: NavSection[] = [
    { items: [
      { label: "Dashboard", icon: LayoutDashboard, path: "/" },
      { label: "Book a Meeting", icon: CalendarCheck, path: "/book-meeting" },
    ] },
    { title: "DEPARTMENTS", items: [
      { label: "Website", icon: Globe, path: "/website" },
      { label: "SEO", icon: SearchCode, path: "/seo" },
      { label: "AI SEO", icon: Sparkles, path: "/ai-seo" },
      { label: "Google Ads", icon: Megaphone, path: "/google-ads" },
      { label: "Social Media", icon: Share2, path: "/social" },
    ]},
    { title: "ACCOUNT", items: [{ label: "Settings", icon: Settings, path: "/settings" }] },
  ];

  const injectBadges = (sections: NavSection[]): NavSection[] =>
    sections.map(s => ({
      ...s,
      items: s.items.map(item => ({
        ...item,
        badge: item.path === "/social" ? pendingRequests : item.path === "/review" ? pendingReview : item.badge,
      })),
    }));

  // Map department_members enum values to sidebar paths
  const deptEnumToPath: Record<string, string[]> = {
    website: ["/website"],
    seo: ["/seo", "/ai-seo"],
    google_ads: ["/google-ads"],
    social_media: ["/social"],
  };

  const filterSectionsByDepartment = (secs: NavSection[]): NavSection[] => {
    if (role !== "concierge" || !userDepartments) return secs;
    const allowedPaths = new Set<string>();
    userDepartments.forEach(dept => {
      (deptEnumToPath[dept] || []).forEach(p => allowedPaths.add(p));
    });
    return secs.map(s => {
      if (s.title !== "DEPARTMENTS") return s;
      return { ...s, items: s.items.filter(item => allowedPaths.has(item.path)) };
    }).filter(s => s.title !== "DEPARTMENTS" || s.items.length > 0);
  };

  const baseSections = role === "admin" ? adminSections : role === "concierge" ? filterSectionsByDepartment(conciergeSections) : clientSections;
  const sections = injectBadges(baseSections);
  const currentPageTitle = pageTitles[location.pathname] || "";

  const clinicSelectorPages = ["/website", "/seo", "/ai-seo", "/google-ads", "/social", "/reports"];
  const showClinicSelector = clinicSelectorPages.some(p => location.pathname === p || location.pathname.startsWith(p + "/"));
  const selectedClinicName = role === "client"
    ? clientClinic?.clinic_name || ""
    : navClinics.find(c => c.id === navSelectedClinicId)?.clinic_name || "";
  const clinicSelectorClinics = role === "client" ? clientClinics : navClinics;
  const clinicSelectorSelectedId = role === "client" ? clientSelectedId || "" : navSelectedClinicId;

  const isDepartmentLocked = (path: string) => {
    if (role === "admin") return false;
    if (clinicAccessLoading || !clinicAccess) return false;

    const accessKey = departmentPathToAccessKey[path];
    if (!accessKey) return false;

    const enabled = clinicAccess[accessKey];
    return accessKey === "ai_seo_enabled" ? enabled === false : enabled === false;
  };

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  };

  const sidebarWidth = collapsed ? "w-[68px]" : "w-[260px]";

  return (
    <div className="flex min-h-screen bg-background">
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex flex-col transition-[width,transform] duration-300 ease-out lg:sticky lg:top-0 lg:h-screen lg:z-auto",
        "bg-[hsl(var(--sidebar-background))] text-[hsl(var(--sidebar-foreground))]",
        sidebarWidth,
        sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        {/* Logo */}
        <div className={cn("flex items-center h-16 border-b border-[hsl(var(--sidebar-border))]", collapsed ? "px-3 justify-center" : "px-5 gap-3")}>
          <div className="relative shrink-0">
            <img src={vsaLogo} alt="VSA Vet Media" className="h-9 w-9 rounded-xl object-cover ring-1 ring-white/10 shrink-0" />
            <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-[hsl(var(--sidebar-background))]" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <h1 className="font-semibold text-sm tracking-tight">
                <span className="text-[hsl(var(--sidebar-primary))]">VSA</span>{" "}
                <span className="text-[hsl(var(--sidebar-foreground))]/90">Vetmedia</span>
              </h1>
              <p className="text-[10px] text-[hsl(var(--sidebar-muted))] tracking-wide">
                {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </p>
            </div>
          )}
          <button onClick={toggleCollapse} className="hidden lg:flex p-1.5 rounded-lg hover:bg-[hsl(var(--sidebar-accent))]/50 transition-colors duration-200 shrink-0" title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <PanelLeft className="h-4 w-4 text-[hsl(var(--sidebar-muted))]" /> : <PanelLeftClose className="h-4 w-4 text-[hsl(var(--sidebar-muted))]" />}
          </button>
          <button className="lg:hidden p-1 rounded-lg hover:bg-[hsl(var(--sidebar-accent))]" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4 text-[hsl(var(--sidebar-muted))]" />
          </button>
        </div>

        {/* Navigation */}
        <nav className={cn("flex-1 py-5 space-y-6 overflow-y-auto", collapsed ? "px-2" : "px-3")}>
          {sections.map((section, si) => (
            <div key={si}>
              {section.title && !collapsed && (
                <p className="px-3 mb-2.5 text-[10px] font-semibold tracking-[0.15em] text-[hsl(var(--sidebar-muted))]/50 uppercase select-none">
                  {section.title}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = item.path === "/" ? location.pathname === "/" : location.pathname === item.path || location.pathname.startsWith(item.path + "/") || (item.path === "/social" && location.pathname === "/social");
                  const dotColor = deptDotColors[item.path];
                  const locked = isDepartmentLocked(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={activeClinicId && clinicSelectorPages.includes(item.path) ? `${item.path}?clinic=${activeClinicId}` : item.path}
                      onClick={() => setSidebarOpen(false)}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center rounded-lg font-medium transition-colors duration-200 group relative",
                        collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5 text-[13px]",
                        active
                          ? "bg-[hsl(var(--sidebar-primary))]/12 text-[hsl(var(--sidebar-primary))]"
                          : "text-[hsl(var(--sidebar-muted))] hover:text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))]/30"
                      )}
                    >
                      {/* Active indicator bar */}
                      {active && (
                        <motion.div
                          layoutId="sidebar-active"
                          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-[hsl(var(--sidebar-primary))]"
                          transition={{ type: "spring", stiffness: 500, damping: 35 }}
                        />
                      )}
                      <div className="relative shrink-0">
                        <item.icon className={cn(
                          "h-[18px] w-[18px] transition-colors duration-200",
                          active ? "text-[hsl(var(--sidebar-primary))]" : "group-hover:text-[hsl(var(--sidebar-foreground))]"
                        )} />
                        {collapsed && (
                          <span
                            className={cn(
                              "absolute -bottom-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-muted text-muted-foreground ring-2 ring-[hsl(var(--sidebar-background))] transition-none",
                              locked ? "opacity-100" : "opacity-0"
                            )}
                            aria-hidden={!locked}
                          >
                            <Lock className="h-2.5 w-2.5" />
                          </span>
                        )}
                        {collapsed && (item.badge ?? 0) > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground text-[8px] font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      {!collapsed && (
                        <>
                          {dotColor && <div className={cn("h-1.5 w-1.5 rounded-full shrink-0 transition-transform duration-200 group-hover:scale-125", dotColor)} />}
                          <span className="flex-1">{item.label}</span>
                           <div className="ml-auto flex min-w-[72px] items-center justify-end gap-2">
                             <span
                               className={cn(
                                 "inline-flex h-5 w-[62px] items-center justify-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-none",
                                 locked ? "opacity-100" : "opacity-0 pointer-events-none"
                               )}
                               aria-hidden={!locked}
                             >
                                 <Lock className="h-3 w-3 shrink-0" />
                                 Locked
                             </span>
                            {(item.badge ?? 0) > 0 && (
                              <span className="bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full h-5 min-w-[20px] px-1.5 flex items-center justify-center">
                                {item.badge}
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className={cn("py-3 border-t border-[hsl(var(--sidebar-border))]", collapsed ? "px-2" : "px-3")}>
          {!collapsed && (
            <div className="flex items-center gap-3 px-3 py-2.5 mb-2 rounded-lg bg-[hsl(var(--sidebar-accent))]/30">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[hsl(var(--sidebar-primary))]/20 to-[hsl(var(--sidebar-primary))]/5 flex items-center justify-center shrink-0 ring-1 ring-[hsl(var(--sidebar-primary))]/10">
                <span className="text-[11px] font-bold text-[hsl(var(--sidebar-primary))]">
                  {profile?.full_name?.charAt(0)?.toUpperCase() || "U"}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[hsl(var(--sidebar-foreground))] truncate">{profile?.full_name || "User"}</p>
                <p className="text-[10px] text-[hsl(var(--sidebar-muted))] truncate capitalize">{role}</p>
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "w-full text-[hsl(var(--sidebar-muted))] hover:text-destructive hover:bg-destructive/10 rounded-lg text-[13px]",
              collapsed ? "justify-center px-2" : "justify-start"
            )}
            onClick={signOut}
            title={collapsed ? "Sign Out" : undefined}
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && <span className="ml-2">Sign Out</span>}
          </Button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        {/* Top header */}
        <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-xl border-b border-border/40 px-4 lg:px-8 h-14 flex items-center gap-4" style={{ boxShadow: "var(--shadow-xs)" }}>
          <button className="lg:hidden p-1.5 rounded-lg hover:bg-muted transition-colors duration-200" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5 text-foreground" />
          </button>
          
          {currentPageTitle && (
            <div className="hidden sm:flex items-center gap-2 text-sm">
              <span className="text-muted-foreground text-xs font-medium">VSA</span>
              <ChevronRight className="h-3 w-3 text-muted-foreground/30" />
              <span className="font-semibold text-foreground text-xs">{currentPageTitle}</span>
              {showClinicSelector && selectedClinicName && (
                <>
                  <ChevronRight className="h-3 w-3 text-muted-foreground/30" />
                  <span className="text-xs font-medium text-primary truncate max-w-[200px]">{selectedClinicName}</span>
                </>
              )}
            </div>
          )}

          <div className="flex-1" />

          {showClinicSelector && (
            <ClinicSelector
              clinics={clinicSelectorClinics}
              selectedClinicId={clinicSelectorSelectedId}
              onSelect={role === "client" ? (id: string) => {
                setClientSelectedId(id);
                setSearchParams(prev => { const next = new URLSearchParams(prev); next.set("clinic", id); return next; }, { replace: true });
              } : navSetSelectedClinicId}
              loading={role === "client" ? clientClinics.length === 0 : navClinicsLoading}
            />
          )}

          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[11px] font-medium" onClick={() => setDeptPickerOpen(true)}>
            <Plus className="h-3 w-3" />
            <span className="hidden sm:inline">New Ticket</span>
          </Button>

          <button
            className="relative p-2 rounded-lg hover:bg-muted/50 transition-colors duration-200"
            onClick={() => {
              document.documentElement.classList.toggle("dark");
              localStorage.setItem("theme", document.documentElement.classList.contains("dark") ? "dark" : "light");
            }}
          >
            <Sun className="h-4 w-4 text-muted-foreground dark:hidden" />
            <Moon className="h-4 w-4 text-muted-foreground hidden dark:block" />
          </button>

          <NotificationBell />

          <div className="h-8 w-8 rounded-lg bg-primary/8 flex items-center justify-center ring-1 ring-primary/10">
            <span className="text-[11px] font-bold text-primary">
              {profile?.full_name?.charAt(0)?.toUpperCase() || "U"}
            </span>
          </div>
        </header>
        
        <div className="flex-1 p-4 lg:p-8">
          <PageTransition>
            {children || <Outlet />}
          </PageTransition>
        </div>
      </main>

      {/* Department Picker Dialog */}
      <Dialog open={deptPickerOpen} onOpenChange={setDeptPickerOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Select Department</DialogTitle>
            <DialogDescription>Choose a department for your new ticket.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 py-2">
            {Object.entries(departmentServices).map(([key, { label }]) => (
              <Button
                key={key}
                variant="outline"
                className="h-auto py-4 flex flex-col gap-1 hover:border-primary/30 hover:bg-primary/5"
                onClick={() => { setGlobalTicketDept(key); setDeptPickerOpen(false); setGlobalTicketOpen(true); }}
              >
                <span className="text-sm font-medium">{label}</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <NewTicketDialog open={globalTicketOpen} onOpenChange={setGlobalTicketOpen} department={globalTicketDept} services={departmentServices[globalTicketDept]?.services ?? []} onCreated={() => {}} />
      <ChatAssistant />
    </div>
  );
}