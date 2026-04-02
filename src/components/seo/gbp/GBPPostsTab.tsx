import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ListOrdered, Sparkles, History, Map, BookOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useUserRole } from "@/hooks/useUserRole";
import { motion } from "framer-motion";
import { ClusterManager } from "./ClusterManager";
import { TopicLibrary } from "./TopicLibrary";
import { GeneratePosts } from "./GeneratePosts";

const subTabs = [
  { value: "batch-queue", label: "Batch Queue", icon: ListOrdered },
  { value: "generate", label: "Generate Posts", icon: Sparkles },
  { value: "history", label: "Post History", icon: History },
  { value: "clusters", label: "Cluster Manager", icon: Map },
  { value: "topics", label: "Topic Library", icon: BookOpen },
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
  const [activeTab, setActiveTab] = useState("batch-queue");
  const { role } = useUserRole();
  const isClient = role === "client";

  const visibleTabs = isClient
    ? subTabs.filter(t => ["batch-queue", "history"].includes(t.value))
    : subTabs;

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

        <TabsContent value="batch-queue" className="mt-4">
          <EmptyState
            icon={ListOrdered}
            title="Batch Queue"
            description="Generate the monthly queue to get started. The batch queue manages the GBP generation cycle for all clinics."
          />
        </TabsContent>

        <TabsContent value="generate" className="mt-4">
          <GeneratePosts />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <EmptyState
            icon={History}
            title="Post History"
            description="No GBP posts generated yet. Once posts are created, they'll appear here with full search and filtering."
          />
        </TabsContent>

        {!isClient && (
          <TabsContent value="clusters" className="mt-4">
            <ClusterManager />
          </TabsContent>
        )}

        {!isClient && (
          <TabsContent value="topics" className="mt-4">
            <TopicLibrary />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
