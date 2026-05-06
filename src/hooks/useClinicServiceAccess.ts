import { useMemo } from "react";
import { useUserRole } from "@/hooks/useUserRole";
import type { ClinicOption } from "@/hooks/useClinicSelector";

export type ClinicServiceKey = "website" | "seo" | "google_ads" | "ai_seo" | "social_media";

const getServiceEnabled = (clinic: ClinicOption | undefined, service: ClinicServiceKey) => {
  if (!clinic) return true;

  switch (service) {
    case "website":
      return clinic.website_enabled ?? true;
    case "seo":
      return clinic.seo_enabled ?? true;
    case "google_ads":
      return clinic.google_ads_enabled ?? true;
    case "ai_seo":
      return clinic.ai_seo_enabled ?? false;
    case "social_media":
      return clinic.social_media_enabled ?? true;
    default:
      return true;
  }
};

export function useClinicServiceAccess(clinic: ClinicOption | undefined, service: ClinicServiceKey, clinicsLoading?: boolean) {
  const { role } = useUserRole();

  return useMemo(() => {
    const enabled = getServiceEnabled(clinic, service);
    const canBypass = role === "admin";
    const loading = clinicsLoading === true && !clinic;

    return {
      enabled,
      canAccess: canBypass || enabled,
      isLocked: !canBypass && !!clinic && !enabled,
      // True whenever the clinic itself has the service disabled, regardless of role.
      // Used to surface a "locked for this clinic" indicator to admins without blocking access.
      isLockedForClinic: !!clinic && !enabled,
      isAdminBypass: canBypass && !!clinic && !enabled,
      loading,
    };
  }, [clinic, role, service, clinicsLoading]);
}