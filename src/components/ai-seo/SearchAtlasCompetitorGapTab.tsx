import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Info, Search } from "lucide-react";
import {
  useSearchAtlasMcpByName,
  unwrapSearchAtlasPayload,
  isSearchAtlasSoftError,
  type SearchAtlasClinicConfig,
} from "@/hooks/useSearchAtlas";
import { SearchAtlasEmptyState } from "./SearchAtlasEmptyState";
import { OpenInSearchAtlas } from "./OpenInSearchAtlas";

interface Props { config: SearchAtlasClinicConfig; clinicId?: string }

function num(v: unknown, d = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
}

export function SearchAtlasCompetitorGapTab({ config, clinicId }: Props) {
  const domain = config.search_atlas_domain ?? undefined;
  const [competitor, setCompetitor] = useState("");
  const [runToken, setRunToken] = useState(0);

  const gapQ = useSearchAtlasMcpByName<any>(
    ["se_keyword_gap", domain ?? "", competitor, runToken],
    "se_get_keyword_gap_results",
    { target: domain, domain, competitor },
    !!domain && !!competitor && runToken > 0,
  );

  const results = !isSearchAtlasSoftError(gapQ.data) ? (unwrapSearchAtlasPayload<any>(gapQ.data) ?? {}) : {};
  const rows: any[] = useMemo(() => {
    const raw = results?.results ?? results?.keywords ?? results?.rows ?? [];
    return Array.isArray(raw) ? raw : [];
  }, [results]);

  if (!domain) return <SearchAtlasEmptyState clinicId={clinicId} message="Add a domain to run competitor gap analyses." />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Site Explorer</span>
          <span className="opacity-50">/</span>
          <span className="text-foreground">{domain}</span>
          <span className="opacity-50">/</span>
          <span>Competitor Gap</span>
        </div>
        <OpenInSearchAtlas section="site-explorer" domain={domain} label="Open Site Explorer" />
      </div>

      <Card className="border-border/60 bg-card p-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          Enter a competitor's domain to see keywords they rank for that <span className="text-foreground font-medium">{domain}</span> doesn't.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="competitor.com"
            value={competitor}
            onChange={(e) => setCompetitor(e.target.value.trim())}
            className="max-w-xs"
          />
          <Button
            onClick={() => setRunToken((t) => t + 1)}
            disabled={!competitor || gapQ.isFetching}
            size="sm"
          >
            <Search className="h-3.5 w-3.5 mr-1.5" />
            {gapQ.isFetching ? "Analyzing…" : "Run gap analysis"}
          </Button>
        </div>
      </Card>

      {runToken === 0 ? (
        <Card className="border-border/60 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          Enter a competitor domain above and run an analysis to see gap results.
        </Card>
      ) : gapQ.isFetching ? (
        <Skeleton className="h-96" />
      ) : isSearchAtlasSoftError(gapQ.data) ? (
        <Card className="border-border/60 bg-muted/20 p-4 flex items-start gap-3">
          <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground">
            Search Atlas returned no gap data for this pairing. Try a different competitor, or open Site Explorer for the full comparison.
          </p>
        </Card>
      ) : (
        <Card className="border-border/60">
          <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
            <h3 className="text-sm font-bold">Keyword gap vs {competitor}</h3>
            <span className="text-[11px] text-muted-foreground">{rows.length.toLocaleString()} keywords</span>
          </div>
          {rows.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">No overlapping keywords found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Keyword</TableHead>
                  <TableHead className="text-right w-24">Volume</TableHead>
                  <TableHead className="text-right w-24">You</TableHead>
                  <TableHead className="text-right w-24">Them</TableHead>
                  <TableHead className="text-right w-20">Diff</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 200).map((r, i) => {
                  const you = num(r.position ?? r.target_position ?? r.your_position, 0);
                  const them = num(r.competitor_position ?? r.other_position, 0);
                  const diff = you && them ? them - you : them ? -them : 0;
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.keyword ?? r.query ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{num(r.volume ?? r.search_volume).toLocaleString() || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{you || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{them || "—"}</TableCell>
                      <TableCell className={`text-right tabular-nums ${diff > 0 ? "text-emerald-500" : diff < 0 ? "text-rose-500" : ""}`}>
                        {diff ? (diff > 0 ? `+${diff}` : diff) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}
