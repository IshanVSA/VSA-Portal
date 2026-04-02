import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ListOrdered, Sparkles, History, Map, BookOpen, CalendarCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useUserRole } from "@/hooks/useUserRole";
import { motion } from "framer-motion";
import { ClusterManager } from "./ClusterManager";
import { TopicLibrary } from "./TopicLibrary";
import { GeneratePosts } from "./GeneratePosts";
import { BatchQueue } from "./BatchQueue";
import { PostHistory } from "./PostHistory";
import { ScheduledPosts } from "./ScheduledPosts";

const adminTabs = [
  { value: "batch-queue", label: "Batch Queue", icon: ListOrdered },
  { value: "generate", label: "Generate Posts", icon: Sparkles },
  { value: "history", label: "Post History", icon: History },
  { value: "clusters", label: "Cluster Manager", icon: Map },
  { value: "topics", label: "Topic Library", icon: BookOpen },
];

const clientTabs = [
  { value: "scheduled", label: "Scheduled Posts", icon: CalendarCheck },
  { value: "history", label: "Post History", icon: History },
];

interface GBPPostsTabProps {
  clinicId: string | null;
}

function EmptyState({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Card className="border-dashed border-border/60">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-4">
            <Icon className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">{title}</h3>
          <p className="text-sm text-muted-foreground max-w-md">{description}</p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function GBPPostsTab({ clinicId }: GBPPostsTabProps) {
  const { role } = useUserRole();
  const isClient = role === "client";
  const visibleTabs = isClient ? clientTabs : adminTabs;
  const [activeTab, setActiveTab] = useState(visibleTabs[0]?.value || "batch-queue");

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start bg-muted/50 border border-border/40 h-9 p-0.5 overflow-x-auto">
          {visibleTabs.map(tab => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="gap-1.5 text-xs data-[state=active]:shadow-sm"
            >
              <tab.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Use hidden divs instead of TabsContent to preserve state across tab switches */}
        <div className="mt-4">
          <div className={activeTab === "batch-queue" ? "" : "hidden"}>
            <BatchQueue clinicId={clinicId} />
          </div>

          <div className={activeTab === "generate" ? "" : "hidden"}>
            <GeneratePosts clinicId={clinicId} />
          </div>

          <div className={activeTab === "history" ? "" : "hidden"}>
            <PostHistory clinicId={clinicId} />
          </div>

          {!isClient && (
            <div className={activeTab === "clusters" ? "" : "hidden"}>
              <ClusterManager />
            </div>
          )}

          {!isClient && (
            <div className={activeTab === "topics" ? "" : "hidden"}>
              <TopicLibrary />
            </div>
          )}
        </div>
      </Tabs>
    </div>
  );
}
