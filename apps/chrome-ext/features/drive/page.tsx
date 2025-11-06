import { HardDrive, Upload } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";

export function DrivePage() {
  return (
    <div className="h-full flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Drive & File Storage</h1>
          </div>
          <Button size="sm">
            <Upload className="h-4 w-4 mr-1" />
            Upload File
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <HardDrive size={64} className="mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Drive Module</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Secure file storage, sharing, and collaboration
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
