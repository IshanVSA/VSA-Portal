import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Props {
  currentVersion: string;
}

export function StaffAcknowledgmentModal({ currentVersion }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  const handleAcknowledge = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("terms_acceptance_log").insert({
        user_id: user.id,
        terms_version: currentVersion,
        acceptance_type: "staff",
        user_agent: navigator.userAgent,
        casl_consent_given: false,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["terms-acceptance"] });
    } catch (e: any) {
      toast.error("Failed to log acknowledgment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80">
      <div className="bg-background border rounded-lg shadow-lg max-w-lg w-full mx-4 p-8 space-y-6">
        <div className="space-y-2 text-center">
          <h2 className="text-xl font-semibold">Platform Access Acknowledgment</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You are accessing this platform as an authorized user under a managed account. Your use of this platform is governed by the{" "}
            <a href="/terms-of-service" target="_blank" className="text-primary underline">Terms of Use</a>{" "}
            and{" "}
            <a href="/privacy-policy" target="_blank" className="text-primary underline">Privacy Policy</a>{" "}
            accepted by your account administrator.
          </p>
        </div>
        <Button
          onClick={handleAcknowledge}
          disabled={submitting}
          className="w-full"
        >
          {submitting ? "Processing..." : "Acknowledge and Continue"}
        </Button>
      </div>
    </div>
  );
}
