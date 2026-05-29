import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

export function SearchAtlasEmptyState({ clinicId, message }: { clinicId?: string; message?: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-12 w-12 rounded-2xl bg-[hsl(var(--dept-ai-seo))]/10 flex items-center justify-center mb-3">
          <Sparkles className="h-6 w-6 text-[hsl(var(--dept-ai-seo))]" />
        </div>
        <h3 className="text-base font-bold text-foreground mb-1">Search Atlas not connected</h3>
        <p className="text-xs text-muted-foreground max-w-md">
          {message ?? "Connect this clinic to a Search Atlas project to pull live SEO data."}
        </p>
        {clinicId && (
          <Link
            to={`/clinics/${clinicId}`}
            className="mt-4 text-xs font-medium text-primary hover:underline"
          >
            Open Clinic Setup →
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
