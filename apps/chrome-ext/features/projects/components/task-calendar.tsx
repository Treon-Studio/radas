import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import type { TaskWithDetails } from "../entity";

interface TaskCalendarProps {
  tasks: TaskWithDetails[];
  onTaskClick: (task: TaskWithDetails) => void;
}

export function TaskCalendar({ tasks, onTaskClick }: TaskCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Get calendar grid data
  const calendarData = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay(); // 0 = Sunday

    const weeks: (number | null)[][] = [];
    let currentWeek: (number | null)[] = [];

    // Fill in empty days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      currentWeek.push(null);
    }

    // Fill in days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      currentWeek.push(day);

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    // Fill in remaining days
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      weeks.push(currentWeek);
    }

    return weeks;
  }, [year, month]);

  // Group tasks by date
  const tasksByDate = useMemo(() => {
    const grouped: Record<string, TaskWithDetails[]> = {};

    tasks.forEach((task) => {
      const dates: Date[] = [];

      // Add start date
      if (task.estimatedStartDate) {
        const date = task.estimatedStartDate.toDate
          ? task.estimatedStartDate.toDate()
          : new Date(task.estimatedStartDate);
        dates.push(date);
      }

      // Add end date / due date
      if (task.estimatedEndDate) {
        const date = task.estimatedEndDate.toDate
          ? task.estimatedEndDate.toDate()
          : new Date(task.estimatedEndDate);
        dates.push(date);
      } else if (task.dueDate) {
        const date = task.dueDate.toDate ? task.dueDate.toDate() : new Date(task.dueDate);
        dates.push(date);
      }

      // Add all dates in between for multi-day tasks
      if (dates.length === 2) {
        const start = dates[0];
        const end = dates[1];
        const current = new Date(start);

        while (current <= end) {
          if (current.getMonth() === month && current.getFullYear() === year) {
            const key = current.getDate().toString();
            if (!grouped[key]) grouped[key] = [];
            if (!grouped[key].find((t) => t.id === task.id)) {
              grouped[key].push(task);
            }
          }
          current.setDate(current.getDate() + 1);
        }
      } else if (dates.length === 1) {
        const date = dates[0];
        if (date.getMonth() === month && date.getFullYear() === year) {
          const key = date.getDate().toString();
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(task);
        }
      }
    });

    return grouped;
  }, [tasks, month, year]);

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const isToday = (day: number | null) => {
    if (!day) return false;
    const today = new Date();
    return (
      day === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear()
    );
  };

  const monthName = new Date(year, month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Calendar Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b flex items-center justify-between">
        <h2 className="text-lg font-semibold">{monthName}</h2>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={goToToday}>
            Today
          </Button>
          <Button size="sm" variant="ghost" onClick={goToPreviousMonth}>
            <ChevronLeft size={16} />
          </Button>
          <Button size="sm" variant="ghost" onClick={goToNextMonth}>
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-7 gap-2 h-full">
          {/* Week day headers */}
          {weekDays.map((day) => (
            <div
              key={day}
              className="text-center font-semibold text-sm text-muted-foreground pb-2"
            >
              {day}
            </div>
          ))}

          {/* Calendar days */}
          {calendarData.flat().map((day, idx) => {
            const dayTasks = day ? tasksByDate[day.toString()] || [] : [];
            const today = isToday(day);

            return (
              <div
                key={idx}
                className={`border rounded-lg p-2 min-h-[120px] ${
                  day ? "bg-background" : "bg-muted/30"
                } ${today ? "ring-2 ring-primary" : ""}`}
              >
                {day && (
                  <>
                    <div
                      className={`text-sm font-medium mb-2 ${
                        today ? "text-primary font-bold" : "text-foreground"
                      }`}
                    >
                      {day}
                    </div>
                    <div className="space-y-1">
                      {dayTasks.slice(0, 3).map((task) => (
                        <div
                          key={task.id}
                          className="text-xs px-1.5 py-1 rounded cursor-pointer hover:opacity-80 truncate"
                          style={{
                            backgroundColor: task.status?.color
                              ? `${task.status.color}20`
                              : "#f3f4f6",
                            color: task.status?.color || "#6b7280",
                            borderLeft: `3px solid ${task.status?.color || "#6b7280"}`,
                          }}
                          onClick={() => onTaskClick(task)}
                          title={task.title}
                        >
                          {task.title}
                        </div>
                      ))}
                      {dayTasks.length > 3 && (
                        <div className="text-xs text-muted-foreground px-1.5">
                          +{dayTasks.length - 3} more
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
