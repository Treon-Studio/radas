import React, { useMemo } from "react";
import type { TaskWithDetails } from "../entity";

interface TaskTimelineProps {
  tasks: TaskWithDetails[];
  onTaskClick: (task: TaskWithDetails) => void;
}

export function TaskTimeline({ tasks, onTaskClick }: TaskTimelineProps) {
  // Filter tasks that have date information
  const tasksWithDates = useMemo(() => {
    return tasks.filter(
      (task) => task.estimatedStartDate || task.estimatedEndDate || task.dueDate
    );
  }, [tasks]);

  // Calculate date range for the timeline
  const dateRange = useMemo(() => {
    if (tasksWithDates.length === 0) {
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 3, 0);
      return { start, end };
    }

    let minDate = new Date();
    let maxDate = new Date();

    tasksWithDates.forEach((task) => {
      const startDate = task.estimatedStartDate
        ? task.estimatedStartDate.toDate
          ? task.estimatedStartDate.toDate()
          : new Date(task.estimatedStartDate)
        : null;
      const endDate = task.estimatedEndDate
        ? task.estimatedEndDate.toDate
          ? task.estimatedEndDate.toDate()
          : new Date(task.estimatedEndDate)
        : task.dueDate
        ? task.dueDate.toDate
          ? task.dueDate.toDate()
          : new Date(task.dueDate)
        : null;

      if (startDate && (!minDate || startDate < minDate)) minDate = startDate;
      if (endDate && (!maxDate || endDate > maxDate)) maxDate = endDate;
    });

    // Add padding
    const start = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    const end = new Date(maxDate.getFullYear(), maxDate.getMonth() + 2, 0);

    return { start, end };
  }, [tasksWithDates]);

  // Generate months for the timeline header
  const months = useMemo(() => {
    const result: { month: string; year: number; days: number }[] = [];
    const current = new Date(dateRange.start);

    while (current <= dateRange.end) {
      const monthName = current.toLocaleDateString("en-US", { month: "short" });
      const year = current.getFullYear();
      const daysInMonth = new Date(year, current.getMonth() + 1, 0).getDate();

      result.push({ month: monthName, year, days: daysInMonth });
      current.setMonth(current.getMonth() + 1);
    }

    return result;
  }, [dateRange]);

  const totalDays = months.reduce((sum, m) => sum + m.days, 0);
  const dayWidth = 30; // pixels per day

  // Calculate task bar position and width
  const getTaskBarStyle = (task: TaskWithDetails) => {
    const startDate = task.estimatedStartDate
      ? task.estimatedStartDate.toDate
        ? task.estimatedStartDate.toDate()
        : new Date(task.estimatedStartDate)
      : null;
    const endDate = task.estimatedEndDate
      ? task.estimatedEndDate.toDate
        ? task.estimatedEndDate.toDate()
        : new Date(task.estimatedEndDate)
      : task.dueDate
      ? task.dueDate.toDate
        ? task.dueDate.toDate()
        : new Date(task.dueDate)
      : null;

    if (!startDate || !endDate) return null;

    const daysSinceStart = Math.floor(
      (startDate.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24)
    );
    const duration = Math.floor(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;

    return {
      left: `${daysSinceStart * dayWidth}px`,
      width: `${duration * dayWidth}px`,
    };
  };

  if (tasksWithDates.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-2">No tasks with dates</p>
          <p className="text-sm text-muted-foreground">
            Add estimated dates to tasks to see them in the timeline view
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Timeline Header */}
      <div className="flex-shrink-0 border-b bg-muted/30">
        <div className="flex overflow-x-auto">
          {/* Task names column header */}
          <div className="w-64 flex-shrink-0 border-r p-3 font-semibold text-sm">
            Task Name
          </div>

          {/* Timeline header */}
          <div className="flex">
            {months.map((m, idx) => (
              <div
                key={idx}
                className="border-r p-3 text-center text-sm font-semibold"
                style={{ width: `${m.days * dayWidth}px` }}
              >
                {m.month} {m.year}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Timeline Body */}
      <div className="flex-1 overflow-auto">
        <div className="flex">
          {/* Task names column */}
          <div className="w-64 flex-shrink-0 border-r">
            {tasksWithDates.map((task) => (
              <div
                key={task.id}
                className="px-3 py-2 border-b hover:bg-muted/50 cursor-pointer flex items-center gap-2 min-h-[48px]"
                onClick={() => onTaskClick(task)}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: task.status?.color || "#gray" }}
                />
                <span className="text-sm truncate">{task.title}</span>
              </div>
            ))}
          </div>

          {/* Timeline bars */}
          <div className="relative" style={{ width: `${totalDays * dayWidth}px` }}>
            {/* Grid lines for days */}
            <div className="absolute inset-0 flex">
              {Array.from({ length: totalDays }).map((_, idx) => (
                <div
                  key={idx}
                  className="border-r border-gray-100"
                  style={{ width: `${dayWidth}px` }}
                />
              ))}
            </div>

            {/* Today line */}
            {(() => {
              const today = new Date();
              const daysSinceStart = Math.floor(
                (today.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24)
              );
              if (daysSinceStart >= 0 && daysSinceStart < totalDays) {
                return (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
                    style={{ left: `${daysSinceStart * dayWidth}px` }}
                  >
                    <div className="absolute -top-2 -left-2 w-4 h-4 bg-red-500 rounded-full" />
                  </div>
                );
              }
              return null;
            })()}

            {/* Task bars */}
            {tasksWithDates.map((task, idx) => {
              const barStyle = getTaskBarStyle(task);
              if (!barStyle) return null;

              return (
                <div
                  key={task.id}
                  className="absolute h-[48px] border-b"
                  style={{ top: `${idx * 48}px` }}
                >
                  <div
                    className="mt-3 mb-3 rounded px-2 py-1 cursor-pointer hover:opacity-80 transition-opacity flex items-center"
                    style={{
                      ...barStyle,
                      backgroundColor: task.priority?.color || task.status?.color || "#3b82f6",
                    }}
                    onClick={() => onTaskClick(task)}
                  >
                    <span className="text-xs font-medium text-white truncate">
                      {task.title}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
