import { useUserRole } from "@/hooks/useUserRole";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import ConciergeDashboard from "@/components/dashboard/ConciergeDashboard";
import ClientDashboard from "@/components/dashboard/ClientDashboard";

export default function Dashboard() {
  const { role } = useUserRole();

  return (
    <>
      {role === "admin" && <AdminDashboard />}
      {role === "concierge" && <ConciergeDashboard />}
      {role === "client" && <ClientDashboard />}
      {!role && (
        <div className="text-center py-20">
          <p className="text-muted-foreground">Loading your dashboard...</p>
        </div>
      )}
    </>
  );
}
