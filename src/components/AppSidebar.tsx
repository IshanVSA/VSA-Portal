import {
  LayoutDashboard, Building2, CalendarDays, Sparkles, BarChart3,
  ClipboardList, Users, UserCheck, ShieldCheck, Settings, LogOut, FileCheck, CalendarCheck, Milestone,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useUserRole, type AppRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

interface NavItem {
  title: string;
  url: string;
  icon: React.ElementType;
  roles: AppRole[];
}

const navItems: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, roles: ["admin", "concierge", "client"] },
  { title: "Book a Meeting", url: "/book-meeting", icon: CalendarCheck, roles: ["admin", "concierge", "client"] },
  { title: "Clinics", url: "/clinics", icon: Building2, roles: ["admin"] },
  { title: "Client Journey", url: "/client-journey", icon: Milestone, roles: ["admin", "concierge", "client"] },
  { title: "Content", url: "/content", icon: CalendarDays, roles: ["admin", "concierge"] },
  
  { title: "Content Requests", url: "/content-requests", icon: FileCheck, roles: ["admin", "concierge", "client"] },
  { title: "Analytics", url: "/analytics", icon: BarChart3, roles: ["admin", "concierge", "client"] },
  { title: "Intake Forms", url: "/intake-forms", icon: ClipboardList, roles: ["admin", "concierge", "client"] },
  { title: "Employees", url: "/employees", icon: Users, roles: ["admin"] },
  { title: "Clients", url: "/clients", icon: UserCheck, roles: ["admin"] },
  
  { title: "Settings", url: "/settings", icon: Settings, roles: ["admin", "concierge", "client"] },
];

export function AppSidebar() {
  const { role } = useUserRole();
  const { signOut } = useAuth();
  const filtered = navItems.filter((item) => role && item.roles.includes(role));

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/70 text-xs uppercase tracking-wider">
            VSA Vet Media
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filtered.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <Button variant="ghost" className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground" onClick={signOut}>
          <LogOut className="mr-2 h-4 w-4" /> Sign Out
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
