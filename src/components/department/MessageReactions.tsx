import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SmilePlus } from "lucide-react";
import { cn } from "@/lib/utils";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥", "👏", "🎉", "😢", "🤔"];

interface Reactions {
  [emoji: string]: string[]; // emoji -> array of user_ids
}

interface MessageReactionsProps {
  reactions: Reactions;
  currentUserId: string;
  onToggleReaction: (emoji: string) => void;
  isOwn: boolean;
}

export function MessageReactions({ reactions, currentUserId, onToggleReaction, isOwn }: MessageReactionsProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const activeReactions = Object.entries(reactions).filter(([, users]) => users.length > 0);

  return (
    <div className={cn("flex items-center gap-1 flex-wrap mt-0.5", isOwn ? "justify-end" : "justify-start")}>
      {activeReactions.map(([emoji, users]) => {
        const hasReacted = users.includes(currentUserId);
        return (
          <button
            key={emoji}
            onClick={() => onToggleReaction(emoji)}
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs transition-colors border",
              hasReacted
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-muted/50 border-border/50 text-muted-foreground hover:bg-muted"
            )}
          >
            <span className="text-sm">{emoji}</span>
            <span className="text-[10px] font-medium">{users.length}</span>
          </button>
        );
      })}

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <button className="h-5 w-5 flex items-center justify-center rounded-full hover:bg-muted transition-colors opacity-0 group-hover/msg:opacity-100">
            <SmilePlus className="h-3 w-3 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align={isOwn ? "end" : "start"} className="w-auto p-1.5">
          <div className="flex gap-0.5">
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted transition-colors text-base"
                onClick={() => {
                  onToggleReaction(emoji);
                  setPickerOpen(false);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
