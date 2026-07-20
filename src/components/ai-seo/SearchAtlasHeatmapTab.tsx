import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MapPin, ChevronDown, Lightbulb, Search, Download, MoreVertical, X } from "lucide-react";
import { useSearchAtlasMcp, unwrapSearchAtlasPayload, isSearchAtlasSoftError, type SearchAtlasClinicConfig } from "@/hooks/useSearchAtlas";
import { SearchAtlasEmptyState } from "./SearchAtlasEmptyState";
import { OpenInSearchAtlas } from "./OpenInSearchAtlas";
import { supabase } from "@/integrations/supabase/client";

interface Props { config: SearchAtlasClinicConfig; clinicId?: string }

interface HeatmapRow {
  business: string;
  address: string;
  keyword: string;
  avg_score: number;
  last_scan: string;
  settings: string;
}

function scorePillColor(score: number) {
  if (score <= 5) return { bg: "hsl(142 70% 45% / 0.15)", text: "hsl(142 70% 45%)", dot: "hsl(142 70% 45%)" };
  if (score <= 10) return { bg: "hsl(45 95% 55% / 0.15)", text: "hsl(45 95% 50%)", dot: "hsl(45 95% 55%)" };
  return { bg: "hsl(0 75% 55% / 0.15)", text: "hsl(0 75% 55%)", dot: "hsl(0 75% 55%)" };
}

export function SearchAtlasHeatmapTab({ config, clinicId }: Props) {
  const rtId = config.search_atlas_rank_tracker_id;
  const [clinic, setClinic] = useState<{ clinic_name: string; address: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    if (!clinicId) { setLoading(false); return; }
    (async () => {
      const { data } = await (supabase.from("clinics" as any).select("clinic_name, address").eq("id", clinicId).maybeSingle() as any);
      setClinic(data as any);
      setLoading(false);
    })();
  }, [clinicId]);

  // Fetch grids (heatmaps) for this project
  const gridsQ = useSearchAtlasMcp<any>(["grids", rtId ?? ""], "data", "list_grids", { project_id: rtId }, !!rtId);

  if (!rtId) {
    return <SearchAtlasEmptyState clinicId={clinicId} message="Add a Rank Tracker project ID to view the local heatmap." />;
  }

  const gridsPayload: any = !isSearchAtlasSoftError(gridsQ.data) ? (unwrapSearchAtlasPayload<any>(gridsQ.data) ?? {}) : {};
  const gridList: any[] = Array.isArray(gridsPayload?.results) ? gridsPayload.results
    : Array.isArray(gridsPayload?.grids) ? gridsPayload.grids
    : Array.isArray(gridsPayload?.data) ? gridsPayload.data
    : Array.isArray(gridsPayload) ? gridsPayload : [];

  const rows: HeatmapRow[] = gridList.map((g: any) => ({
    business: g.business_name ?? g.business ?? clinic?.clinic_name ?? "—",
    address: g.address ?? clinic?.address ?? "",
    keyword: g.keyword ?? g.query ?? "—",
    avg_score: Number(g.avg_score ?? g.average_score ?? g.score ?? 0),
    last_scan: g.last_scan ?? g.updated_at ?? g.created_at ?? "—",
    settings: g.settings ?? (`${g.grid_size ?? ""} ${g.radius ?? ""}`.trim() || "—"),
  }));

  const address = clinic?.address ?? "";
  const mapSrc = address
    ? `https://maps.google.com/maps?q=${encodeURIComponent(address)}&t=&z=13&ie=UTF8&iwloc=&output=embed`
    : `https://maps.google.com/maps?q=Canada&t=&z=4&ie=UTF8&iwloc=&output=embed`;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Local SEO Heatmap</h2>
        <p className="text-xs text-muted-foreground mt-1 max-w-md">
          Research reveals that appearing in Google Maps is the #1 best return on your SEO investment.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4">
        {/* Left controls */}
        <div className="space-y-3">
          {/* Business pill */}
          <Card className="border-border/60 p-3">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-full bg-[hsl(195_80%_55%)]/15 flex items-center justify-center shrink-0">
                <MapPin className="h-4 w-4 text-[hsl(195_80%_55%)]" />
              </div>
              <div className="flex-1 min-w-0">
                {loading ? <Skeleton className="h-4 w-32 mb-1" /> : (
                  <p className="text-sm font-semibold truncate">{clinic?.clinic_name ?? "—"}</p>
                )}
                {loading ? <Skeleton className="h-3 w-48" /> : (
                  <p className="text-xs text-muted-foreground truncate">{clinic?.address ?? "No address on file"}</p>
                )}
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            </div>
          </Card>

          {/* Keyword input */}
          <div className="relative">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Enter a keyword(s)"
              className="w-full h-10 pl-3 pr-32 text-sm rounded-md border border-border bg-background placeholder:text-muted-foreground/60"
            />
            <Button size="sm" variant="outline" className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 text-xs gap-1.5">
              <Lightbulb className="h-3 w-3" /> Smart Suggest
            </Button>
          </div>

          {/* Filter selectors */}
          <div className="grid grid-cols-2 gap-2">
            <PickerButton label="Circle" />
            <PickerButton label="3 layers (39 quota)" />
            <PickerButton label="Drive Time 15 minutes" />
            <PickerButton label="Refresh Monthly" />
            <PickerButton label="9 AM" />
          </div>

          <p className="text-xs text-muted-foreground">
            Projected next month consumption: <span className="font-semibold text-foreground">39 Quota Points</span>
          </p>

          <Button disabled className="w-full h-10 text-sm gap-2 bg-muted/40 text-muted-foreground hover:bg-muted/40">
            <Search className="h-4 w-4" /> Run Local Scan
          </Button>
        </div>

        {/* Map */}
        <Card className="border-border/60 overflow-hidden h-[500px] relative">
          <iframe
            title="Local SEO Heatmap"
            src={mapSrc}
            className="w-full h-full border-0"
            loading="lazy"
          />
          <div className="absolute top-3 right-3 bg-background/95 backdrop-blur-md border border-border/60 rounded-md px-3 py-2 text-xs shadow-md max-w-[200px]">
            Move the pin to set the exact location.
          </div>
        </Card>
      </div>

      {/* Results table */}
      <Card className="border-border/60">
        <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 h-7 px-2.5 text-xs rounded-md bg-[hsl(265_90%_65%)]/15 text-[hsl(265_90%_65%)]">
              Business: 1 selected <X className="h-3 w-3 cursor-pointer" />
            </span>
            <PickerButton label="Keyword" small />
            <PickerButton label="Avg score" small />
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"><Download className="h-3 w-3" /> Export</Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-8"><input type="checkbox" /></TableHead>
              <TableHead>BUSINESS</TableHead>
              <TableHead>KEYWORD</TableHead>
              <TableHead className="w-24">AVG.SCORE</TableHead>
              <TableHead>LAST SCAN / SETTINGS</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-12 text-sm">
                  No heatmap scans yet. Run a local scan in Search Atlas to populate.
                </TableCell>
              </TableRow>
            ) : rows.map((r, i) => {
              const c = scorePillColor(r.avg_score);
              return (
                <TableRow key={i}>
                  <TableCell><input type="checkbox" /></TableCell>
                  <TableCell>
                    <p className="font-medium text-sm text-[hsl(195_80%_55%)] hover:underline cursor-pointer">{r.business}</p>
                    <p className="text-xs text-muted-foreground">{r.address}</p>
                  </TableCell>
                  <TableCell className="text-sm">{r.keyword}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold tabular-nums" style={{ background: c.bg, color: c.text }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.dot }} />
                      {r.avg_score.toFixed(1)}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.last_scan}<br /><span className="text-[10px]">{r.settings}</span></TableCell>
                  <TableCell><MoreVertical className="h-4 w-4 text-muted-foreground cursor-pointer" /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function PickerButton({ label, small }: { label: string; small?: boolean }) {
  return (
    <button className={`${small ? "h-7 text-xs" : "h-9 text-xs"} w-full px-3 rounded-md border border-border bg-background hover:bg-muted/40 inline-flex items-center justify-between gap-2 text-foreground`}>
      <span className="truncate">{label}</span>
      <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
    </button>
  );
}
