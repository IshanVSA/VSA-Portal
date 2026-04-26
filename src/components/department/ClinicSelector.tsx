import { useState } from "react";
import { Building2, ChevronsUpDown, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ClinicOption } from "@/hooks/useClinicSelector";

interface ClinicSelectorProps {
  clinics: ClinicOption[];
  selectedClinicId: string;
  onSelect: (id: string) => void;
  loading?: boolean;
}

export function ClinicSelector({ clinics, selectedClinicId, onSelect, loading }: ClinicSelectorProps) {
  const [open, setOpen] = useState(false);

  if (loading) {
    return <div className="h-9 w-64 bg-muted/50 rounded-lg animate-pulse" />;
  }

  if (clinics.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Building2 className="h-4 w-4" />
        No clinics available
      </div>
    );
  }

  const selectedName = clinics.find(c => c.id === selectedClinicId)?.clinic_name;

  return (
    <div className="flex items-center gap-2 min-w-0 w-full sm:w-auto">
      <Building2 className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block" />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full sm:w-[240px] lg:w-[280px] h-9 justify-between text-sm font-normal min-w-0"
          >
            <span className="truncate">{selectedName || "Select a clinic"}</span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] sm:w-[280px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search clinics..." />
            <CommandList>
              <CommandEmpty>No clinic found.</CommandEmpty>
              <CommandGroup>
                {clinics.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={c.clinic_name}
                    onSelect={() => {
                      onSelect(c.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-3.5 w-3.5", selectedClinicId === c.id ? "opacity-100" : "opacity-0")} />
                    {c.clinic_name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
