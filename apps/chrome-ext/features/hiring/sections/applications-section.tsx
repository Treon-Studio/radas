import { useState } from "react";
import { Users, Mail, Phone, Calendar, MoreVertical, Star } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { useJobApplications, useJobApplicationMutations } from "../hooks";
import type { JobApplication } from "../entity";
import { toast } from "sonner";
import { format } from "date-fns";

export function ApplicationsSection() {
  const { applications, loading } = useJobApplications();
  const applicationMutations = useJobApplicationMutations();

  const handleDelete = async (applicationId: string) => {
    if (confirm("Are you sure you want to delete this application?")) {
      const result = await applicationMutations.remove(applicationId);
      if (result.success) {
        toast.success("Application deleted");
      } else {
        toast.error("Failed to delete application");
      }
    }
  };

  const handleUpdateStatus = async (applicationId: string, status: string) => {
    const result = await applicationMutations.update(applicationId, { status: status as any });
    if (result.success) {
      toast.success("Status updated");
    } else {
      toast.error("Failed to update status");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "new":
        return "bg-blue-500";
      case "reviewing":
        return "bg-yellow-500";
      case "shortlisted":
        return "bg-green-500";
      case "rejected":
        return "bg-red-500";
      case "hired":
        return "bg-purple-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStageLabel = (stage: string) => {
    return stage.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-muted-foreground">Loading applications...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b">
        <div>
          <h2 className="text-lg font-semibold">Applications</h2>
          <p className="text-sm text-muted-foreground">
            {applications.length} application{applications.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {applications.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Users size={48} className="mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No applications yet</h3>
              <p className="text-sm text-muted-foreground">
                Applications will appear here when candidates apply
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {applications.map((application) => (
              <Card key={application.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <CardTitle className="text-base">{application.candidateName}</CardTitle>
                        <Badge className={getStatusColor(application.status)}>
                          {getStageLabel(application.status)}
                        </Badge>
                      </div>
                      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {application.candidateEmail}
                        </span>
                        {application.candidatePhone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {application.candidatePhone}
                          </span>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleUpdateStatus(application.id, "shortlisted")}>
                          Shortlist
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleUpdateStatus(application.id, "rejected")}>
                          Reject
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(application.id)}
                          className="text-destructive"
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{getStageLabel(application.stage)}</Badge>
                      {application.rating && (
                        <span className="flex items-center gap-1">
                          <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                          {application.rating}/5
                        </span>
                      )}
                    </div>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(application.appliedAt.toDate(), "MMM d, yyyy")}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
