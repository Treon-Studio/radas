import React, { useState, useEffect } from "react";
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/shared/lib/react-query';
import { SettingsProvider } from '@/shared/contexts/settings-context';
import { AuthProvider, useAuth } from '@/shared/contexts/auth-context';
import { TimerProvider } from '@/features/projects/contexts/timer-context';
import '@/shared/utils/dev-tools'; // Load dev tools in development
import { HomePage } from "@/features/home";
import { LinksPage } from "@/features/links/page";
import { LoginPage } from "@/features/auth/login-page";
import { ProjectsPage } from "@/features/projects/page";
import { HiringPage } from "@/features/hiring/page";
import { AttendancePage } from "@/features/attendance/page";
import { WikiPage } from "@/features/wiki/page";
import { DrivePage } from "@/features/drive/page";
import { OKRPage } from "@/features/okr/page";
import { CompanyInfoPage } from "@/features/company-info/page";
import { GlobalTimerHeader } from "@/features/projects/components/global-timer-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Home, MessageSquare, Settings, User } from "lucide-react";
import { useCurrentUser } from "@/features/users/hooks";
import { UsersSection } from "@/features/users/sections/users-section";
import { RolesSection } from "@/features/users/sections/roles-section";
import { SetupPage } from "@/features/users/pages/setup-page";
import { isFirebaseSetup } from "@/features/users/scripts/setup-firebase";
import { WorkspaceSection } from "@/features/workspaces/sections/workspace-section";
import { ProfileSection } from "@/features/profile";
import { Tabs as WorkspaceTabs, TabsContent as WorkspaceTabsContent, TabsList as WorkspaceTabsList, TabsTrigger as WorkspaceTabsTrigger } from "@/shared/components/ui/tabs";

function AppContent() {
  const { user, loading } = useAuth();
  const { currentUser, loading: currentUserLoading } = useCurrentUser();
  const [activeTab, setActiveTab] = useState(() => {
    // Load last active tab from localStorage
    const saved = localStorage.getItem("lastActiveTab");
    return saved || "home";
  });
  const [hideBottomNav, setHideBottomNav] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState("workspaces");
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  // Check if user is admin
  const isAdmin = currentUser?.role?.name === "Admin";

  // Check if Firebase needs setup (only if user is not logged in)
  useEffect(() => {
    const checkSetup = async () => {
      // If user is already logged in, setup must be complete
      if (user) {
        setNeedsSetup(false);
        return;
      }

      // Check configs collection for setup status
      const setupCompleted = await isFirebaseSetup();
      setNeedsSetup(!setupCompleted);
    };
    checkSetup();
  }, [user]);

  // Save active tab to localStorage whenever it changes
  React.useEffect(() => {
    localStorage.setItem("lastActiveTab", activeTab);
  }, [activeTab]);

  if (loading) {
    return (
      <div className="w-[400px] h-[600px] bg-white shadow-md flex flex-col overflow-hidden p-4 space-y-4">
        {/* Header Skeleton */}
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>

        {/* Content Skeleton */}
        <div className="flex-1 space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>

        {/* Bottom Navigation Skeleton */}
        <div className="flex gap-2">
          <Skeleton className="h-16 flex-1" />
          <Skeleton className="h-16 flex-1" />
          <Skeleton className="h-16 flex-1" />
        </div>
      </div>
    );
  }

  // Show setup page if Firebase needs initialization
  if (needsSetup === true) {
    return (
      <div className="w-[400px] h-[600px] bg-white shadow-md overflow-hidden">
        <SetupPage />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="w-[400px] bg-white shadow-md overflow-hidden">
        <LoginPage />
      </div>
    );
  }

  return (
    <TimerProvider>
      <div className="w-[400px] h-[600px] bg-white shadow-md flex flex-col overflow-hidden">
        <GlobalTimerHeader />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsContent value="home" className="flex-1 m-0 overflow-hidden">
            <HomePage onNavigate={setActiveTab} />
          </TabsContent>

          <TabsContent value="projects" className="flex-1 m-0 overflow-hidden">
            <ProjectsPage />
          </TabsContent>

          <TabsContent value="hiring" className="flex-1 m-0 overflow-hidden">
            <HiringPage />
          </TabsContent>

          <TabsContent value="attendance" className="flex-1 m-0 overflow-hidden">
            <AttendancePage />
          </TabsContent>

          <TabsContent value="wiki" className="flex-1 m-0 overflow-hidden">
            <WikiPage />
          </TabsContent>

          <TabsContent value="drive" className="flex-1 m-0 overflow-hidden">
            <DrivePage />
          </TabsContent>

          <TabsContent value="okr" className="flex-1 m-0 overflow-hidden">
            <OKRPage />
          </TabsContent>

          <TabsContent value="company-info" className="flex-1 m-0 overflow-hidden">
            <CompanyInfoPage />
          </TabsContent>

          <TabsContent value="notifications" className="flex-1 m-0 overflow-hidden">
            <div className="h-full flex items-center justify-center p-8">
              <div className="text-center">
                <MessageSquare size={48} className="mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">Messages</h3>
                <p className="text-sm text-muted-foreground">Coming soon</p>
              </div>
            </div>
          </TabsContent>

          {isAdmin && (
            <TabsContent value="workspace" className="flex-1 m-0 overflow-hidden">
              <WorkspaceTabs value={workspaceTab} onValueChange={setWorkspaceTab} className="flex-1 flex flex-col h-full overflow-hidden">
                <WorkspaceTabsList className="w-full rounded-none border-b">
                  <WorkspaceTabsTrigger value="workspaces" className="flex-1">Workspaces</WorkspaceTabsTrigger>
                  <WorkspaceTabsTrigger value="users" className="flex-1">Users</WorkspaceTabsTrigger>
                  <WorkspaceTabsTrigger value="roles" className="flex-1">Roles</WorkspaceTabsTrigger>
                </WorkspaceTabsList>

                <WorkspaceTabsContent value="workspaces" className="flex-1 m-0 overflow-hidden">
                  <WorkspaceSection />
                </WorkspaceTabsContent>

                <WorkspaceTabsContent value="users" className="flex-1 m-0 overflow-hidden">
                  <UsersSection />
                </WorkspaceTabsContent>

                <WorkspaceTabsContent value="roles" className="flex-1 m-0 overflow-hidden">
                  <RolesSection />
                </WorkspaceTabsContent>
              </WorkspaceTabs>
            </TabsContent>
          )}

          <TabsContent value="profile" className="flex-1 m-0 overflow-hidden">
            <ProfileSection />
          </TabsContent>

          {!hideBottomNav && (
            <TabsList className="w-full rounded-none border-t h-auto p-1">
              <TabsTrigger value="home" className="flex-1 flex-col gap-1 h-auto py-2 data-[state=active]:text-primary">
                <Home size={18} />
                <span className="text-[10px]">Home</span>
              </TabsTrigger>
              <TabsTrigger value="notifications" className="flex-1 flex-col gap-1 h-auto py-2 data-[state=active]:text-primary">
                <MessageSquare size={18} />
                <span className="text-[10px]">Message</span>
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger value="workspace" className="flex-1 flex-col gap-1 h-auto py-2 data-[state=active]:text-primary">
                  <Settings size={18} />
                  <span className="text-[10px]">Workspace</span>
                </TabsTrigger>
              )}
              <TabsTrigger value="profile" className="flex-1 flex-col gap-1 h-auto py-2 data-[state=active]:text-primary">
                <User size={18} />
                <span className="text-[10px]">Profile</span>
              </TabsTrigger>
            </TabsList>
          )}
        </Tabs>
      </div>
    </TimerProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <QueryClientProvider client={queryClient}>
          <AppContent />
        </QueryClientProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}

export default App;
