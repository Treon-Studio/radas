import { Building2, Plus } from "lucide-react";
import { Button } from "@radas/ui/ui/button";
import { Card, CardContent } from "@radas/ui/ui/card";

export function CompanyInfoPage() {
  return (
    <div className="h-full flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Company Information</h1>
          </div>
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" />
            New Announcement
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <Building2 size={64} className="mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Company Information</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Company profile, departments, offices, policies, and announcements
            </p>
            <p className="text-xs text-muted-foreground">
              Coming soon...
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
