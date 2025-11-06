import { useState } from "react";
import { Video, Calendar, Clock, MapPin, MoreVertical } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { useInterviews, useInterviewMutations } from "../hooks";
import type { Interview } from "../entity";
import { toast } from "sonner";
import { format } from "date-fns";

export function InterviewsSection() {
  const { interviews, loading } = useInterviews();
  const interviewMutations = useInterviewMutations();

  const handleDelete = async (interviewId: string) => {
    if (confirm("Are you sure you want to delete this interview?")) {
      const result = await interviewMutations.remove(interviewId);
      if (result.success) {
        toast.success("Interview deleted");
      } else {
        toast.error("Failed to delete interview");
      }
    }
  };

  const handleUpdateStatus = async (interviewId: string, status: string) => {
    const result = await interviewMutations.update(interviewId, { status: status as any });
    if (result.success) {
      toast.success("Status updated");
    } else {
      toast.error("Failed to update status");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "scheduled":
        return "bg-blue-500";
      case "completed":
        return "bg-green-500";
      case "cancelled":
        return "bg-red-500";
      case "rescheduled":
        return "bg-yellow-500";
      default:
        return "bg-gray-500";
    }
  };

  const getTypeLabel = (type: string) => {
    return type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-muted-foreground">Loading interviews...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b">
        <div>
          <h2 className="text-lg font-semibold">Interviews</h2>
          <p className="text-sm text-muted-foreground">
            {interviews.length} interview{interviews.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {interviews.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Video size={48} className="mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No interviews scheduled</h3>
              <p className="text-sm text-muted-foreground">
                Schedule interviews with shortlisted candidates
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {interviews.map((interview) => (
              <Card key={interview.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <CardTitle className="text-base">{interview.title}</CardTitle>
                        <Badge className={getStatusColor(interview.status)}>
                          {getTypeLabel(interview.status)}
                        </Badge>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {getTypeLabel(interview.type)}
                      </Badge>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleUpdateStatus(interview.id, "completed")}>
                          Mark Complete
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleUpdateStatus(interview.id, "cancelled")}>
                          Cancel
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(interview.id)}
                          className="text-destructive"
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid gap-2 text-xs text-muted-foreground mb-3">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(interview.scheduledAt.toDate(), "MMM d, yyyy 'at' h:mm a")}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {interview.duration} minutes
                    </span>
                    {interview.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {interview.location}
                      </span>
                    )}
                    {interview.meetingLink && (
                      <a
                        href={interview.meetingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline flex items-center gap-1"
                      >
                        <Video className="h-3 w-3" />
                        Join Meeting
                      </a>
                    )}
                  </div>
                  {interview.feedback && (
                    <p className="text-xs text-muted-foreground line-clamp-2 border-t pt-2">
                      <strong>Feedback:</strong> {interview.feedback}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
