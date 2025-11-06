import React from "react";
import { Skeleton } from "@/shared/components/ui/skeleton";

export function TaskBoardSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {[1, 2, 3, 4].map((column) => (
        <div key={column} className="flex-shrink-0 w-80 bg-muted/30 rounded-lg p-3">
          {/* Column Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Skeleton className="w-3 h-3 rounded" />
              <Skeleton className="w-20 h-4" />
              <Skeleton className="w-6 h-4 rounded-full" />
            </div>
            <Skeleton className="w-6 h-6 rounded" />
          </div>

          {/* Task Cards */}
          <div className="space-y-2">
            {[1, 2, 3].map((task) => (
              <div key={task} className="bg-background rounded p-3 border">
                {/* Task Type Badge */}
                <div className="flex items-center justify-between mb-2">
                  <Skeleton className="w-16 h-5 rounded" />
                  <Skeleton className="w-6 h-6 rounded" />
                </div>

                {/* Task Title */}
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-3/4 mb-2" />

                {/* Task Details */}
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="w-2 h-2 rounded-full" />
                    <Skeleton className="w-8 h-3" />
                  </div>
                  <Skeleton className="w-6 h-6 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
