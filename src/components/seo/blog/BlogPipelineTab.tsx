import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BlogBacklogPanel } from "./BlogBacklogPanel";
import { BlogRunsPanel } from "./BlogRunsPanel";
import { BlogApprovedPanel } from "./BlogApprovedPanel";
import { BlogTab as BlogLegacyPublishedTab } from "./BlogTab";

export function BlogPipelineTab({ clinicId }: { clinicId: string }) {
  return (
    <Tabs defaultValue="backlog" className="w-full">
      <TabsList>
        <TabsTrigger value="backlog">Backlog</TabsTrigger>
        <TabsTrigger value="runs">Runs</TabsTrigger>
        <TabsTrigger value="approved">Approved</TabsTrigger>
        <TabsTrigger value="published">Published</TabsTrigger>
      </TabsList>
      <TabsContent value="backlog" className="mt-4"><BlogBacklogPanel clinicId={clinicId} /></TabsContent>
      <TabsContent value="runs" className="mt-4"><BlogRunsPanel clinicId={clinicId} /></TabsContent>
      <TabsContent value="approved" className="mt-4"><BlogApprovedPanel clinicId={clinicId} /></TabsContent>
      <TabsContent value="published" className="mt-4"><BlogLegacyPublishedTab clinicId={clinicId} /></TabsContent>
    </Tabs>
  );
}
