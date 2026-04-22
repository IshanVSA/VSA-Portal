import { useUserRole } from "@/hooks/useUserRole";
import { AdminSocialOverview } from "./overview/AdminSocialOverview";
import { ConciergeSocialOverview } from "./overview/ConciergeSocialOverview";
import { ClientSocialOverview } from "./overview/ClientSocialOverview";

export function SocialOverview({ clinicId }: { clinicId?: string }) {
  const { role, isLoading } = useUserRole();

  if (isLoading || !role) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-muted/50 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-64 bg-muted/50 rounded-xl animate-pulse" />
          <div className="h-64 bg-muted/50 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (role === "admin") return <AdminSocialOverview clinicId={clinicId} />;
  if (role === "concierge") return <ConciergeSocialOverview clinicId={clinicId} />;
  return <ClientSocialOverview clinicId={clinicId} />;
}
