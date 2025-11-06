import React, { useState } from "react";
import { UserPlus, X, Search } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/components/ui/popover";
import { Input } from "@/shared/components/ui/input";
import { UserAvatar } from "@/shared/components/user-avatar";
import { useAuth } from "@/shared/contexts/auth-context";
import { cn } from "@/shared/lib/utils";

interface User {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
}

interface AssigneeSelectorProps {
  assigneeId?: string;
  onAssigneeChange: (userId: string | undefined) => void;
  size?: "xs" | "sm" | "md" | "lg";
  variant?: "button" | "avatar";
  className?: string;
}

// Mock users - In production, this should come from Firestore users collection
// or Firebase Auth project users
const getMockUsers = (currentUser: User | null): User[] => {
  const users: User[] = [];

  if (currentUser) {
    users.push(currentUser);
  }

  // Add some mock users for demo
  // In production, fetch from Firestore collection: users
  return users;
};

export function AssigneeSelector({
  assigneeId,
  onAssigneeChange,
  size = "sm",
  variant = "avatar",
  className,
}: AssigneeSelectorProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Get all users (in production, this should be from Firestore)
  const allUsers = getMockUsers(user);

  // Find assigned user
  const assignedUser = allUsers.find((u) => u.uid === assigneeId);

  // Filter users by search query
  const filteredUsers = allUsers.filter((u) => {
    const query = searchQuery.toLowerCase();
    return (
      (u.displayName?.toLowerCase().includes(query) || false) ||
      u.email.toLowerCase().includes(query)
    );
  });

  const handleSelect = (userId: string | undefined) => {
    onAssigneeChange(userId);
    setOpen(false);
    setSearchQuery("");
  };

  if (variant === "avatar") {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "relative rounded-full hover:ring-2 hover:ring-primary/20 transition-all",
              className
            )}
            title={assignedUser ? (assignedUser.displayName || assignedUser.email) : "Assign to someone"}
          >
            {assignedUser ? (
              <UserAvatar
                name={assignedUser.displayName}
                email={assignedUser.email}
                photoUrl={assignedUser.photoURL}
                size={size}
              />
            ) : (
              <div
                className={cn(
                  "rounded-full border-2 border-dashed border-muted-foreground/40 flex items-center justify-center bg-muted/30 hover:bg-muted/50 transition-colors",
                  size === "xs" && "w-5 h-5",
                  size === "sm" && "w-6 h-6",
                  size === "md" && "w-8 h-8",
                  size === "lg" && "w-10 h-10"
                )}
              >
                <UserPlus
                  className={cn(
                    "text-muted-foreground",
                    size === "xs" && "w-3 h-3",
                    size === "sm" && "w-3.5 h-3.5",
                    size === "md" && "w-4 h-4",
                    size === "lg" && "w-5 h-5"
                  )}
                />
              </div>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search people..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {/* Unassign option */}
            {assigneeId && (
              <button
                onClick={() => handleSelect(undefined)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted transition-colors text-left border-b"
              >
                <div className="w-6 h-6 rounded-full border-2 border-dashed border-muted-foreground/40 flex items-center justify-center">
                  <X className="w-3 h-3 text-muted-foreground" />
                </div>
                <span className="text-sm text-muted-foreground">Unassigned</span>
              </button>
            )}

            {/* User list */}
            {filteredUsers.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No users found
              </div>
            ) : (
              filteredUsers.map((u) => (
                <button
                  key={u.uid}
                  onClick={() => handleSelect(u.uid)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 hover:bg-muted transition-colors text-left",
                    u.uid === assigneeId && "bg-muted"
                  )}
                >
                  <UserAvatar
                    name={u.displayName}
                    email={u.email}
                    photoUrl={u.photoURL}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {u.displayName || u.email}
                      {u.uid === user?.uid && (
                        <span className="ml-1 text-xs text-muted-foreground">(You)</span>
                      )}
                    </div>
                    {u.displayName && (
                      <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  // Button variant
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          {assignedUser ? (
            <>
              <UserAvatar
                name={assignedUser.displayName}
                email={assignedUser.email}
                photoUrl={assignedUser.photoURL}
                size="xs"
              />
              <span className="ml-2">{assignedUser.displayName || assignedUser.email}</span>
            </>
          ) : (
            <>
              <UserPlus className="w-4 h-4" />
              <span className="ml-2">Assign</span>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search people..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>

        <div className="max-h-64 overflow-y-auto">
          {assigneeId && (
            <button
              onClick={() => handleSelect(undefined)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted transition-colors text-left border-b"
            >
              <X className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Unassigned</span>
            </button>
          )}

          {filteredUsers.map((u) => (
            <button
              key={u.uid}
              onClick={() => handleSelect(u.uid)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 hover:bg-muted transition-colors text-left",
                u.uid === assigneeId && "bg-muted"
              )}
            >
              <UserAvatar
                name={u.displayName}
                email={u.email}
                photoUrl={u.photoURL}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {u.displayName || u.email}
                  {u.uid === user?.uid && (
                    <span className="ml-1 text-xs text-muted-foreground">(You)</span>
                  )}
                </div>
                {u.displayName && (
                  <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
