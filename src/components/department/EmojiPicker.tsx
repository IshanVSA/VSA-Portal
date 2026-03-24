import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Smile } from "lucide-react";

const EMOJI_CATEGORIES = [
  {
    label: "Smileys",
    emojis: ["😀", "😂", "🥹", "😍", "🤩", "😎", "🤔", "😅", "😢", "😡", "🥳", "😱", "🤯", "🫡", "🙄", "😴"],
  },
  {
    label: "Gestures",
    emojis: ["👍", "👎", "👏", "🙌", "🤝", "✌️", "🤞", "💪", "🫶", "👋", "✋", "🤙"],
  },
  {
    label: "Hearts",
    emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💔", "❤️‍🔥", "💯"],
  },
  {
    label: "Objects",
    emojis: ["🔥", "⭐", "✨", "🎉", "🎯", "💡", "📌", "🚀", "⚡", "🏆", "📎", "🗂️"],
  },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  trigger?: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}

export function EmojiPicker({ onSelect, trigger, side = "top", align = "start" }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger || (
          <Button type="button" variant="ghost" size="sm" className="h-9 w-9 p-0 shrink-0">
            <Smile className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent side={side} align={align} className="w-[280px] p-2">
        <div className="space-y-2">
          {EMOJI_CATEGORIES.map((cat) => (
            <div key={cat.label}>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1 mb-1">
                {cat.label}
              </p>
              <div className="flex flex-wrap gap-0.5">
                {cat.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="h-8 w-8 flex items-center justify-center rounded hover:bg-muted transition-colors text-lg"
                    onClick={() => {
                      onSelect(emoji);
                      setOpen(false);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
