import { useState } from "react";
import { Briefcase, Users, Video } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@radas/ui/ui/tabs";
import { PositionsSection } from "./sections/positions-section";
import { ApplicationsSection } from "./sections/applications-section";
import { InterviewsSection } from "./sections/interviews-section";

type HiringTab = "positions" | "applications" | "interviews";

export function HiringPage() {
  const [activeTab, setActiveTab] = useState<HiringTab>("positions");

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b bg-background">
        <div className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Hiring & Recruitment</h1>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as HiringTab)} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="w-full rounded-none border-b h-auto p-1">
          <TabsTrigger value="positions" className="flex-1 flex items-center gap-1.5">
            <Briefcase className="h-4 w-4" />
            Positions
          </TabsTrigger>
          <TabsTrigger value="applications" className="flex-1 flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            Applications
          </TabsTrigger>
          <TabsTrigger value="interviews" className="flex-1 flex items-center gap-1.5">
            <Video className="h-4 w-4" />
            Interviews
          </TabsTrigger>
        </TabsList>

        <TabsContent value="positions" className="flex-1 m-0 overflow-hidden">
          <PositionsSection />
        </TabsContent>

        <TabsContent value="applications" className="flex-1 m-0 overflow-hidden">
          <ApplicationsSection />
        </TabsContent>

        <TabsContent value="interviews" className="flex-1 m-0 overflow-hidden">
          <InterviewsSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
