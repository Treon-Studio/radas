import { useState } from "react";
import { Search, Settings, ChevronRight, Plus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@radas/ui/ui/avatar";
import { Card, CardContent } from "@radas/ui/ui/card";
import { Button } from "@radas/ui/ui/button";
import { Input } from "@radas/ui/ui/input";
import { Badge } from "@radas/ui/ui/badge";
import { useCurrentUser } from "@radas/module-users/hooks";
import { useAuth } from "@radas/config/contexts/auth-context";
import { useUserProjects } from "@radas/module-projects/hooks";

interface HomePageProps {
  onNavigate?: (tab: string) => void;
}

export function HomePage({ onNavigate }: HomePageProps) {
  const { user } = useAuth();
  const { currentUser, loading } = useCurrentUser();
  const { projects } = useUserProjects();
  const [searchQuery, setSearchQuery] = useState("");

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const initials = currentUser?.displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";

  // Favorites apps/features
  const favorites = [
    { id: "projects", name: "Projects", icon: "📁", color: "bg-orange-500", tab: "projects" },
    { id: "hiring", name: "Hiring", icon: "💼", color: "bg-blue-500", tab: "hiring" },
    { id: "attendance", name: "Attendance", icon: "⏰", color: "bg-purple-500", tab: "attendance" },
    { id: "wiki", name: "Wiki", icon: "📚", color: "bg-green-500", tab: "wiki" },
    { id: "drive", name: "Drive", icon: "💾", color: "bg-indigo-500", tab: "drive" },
    { id: "okr", name: "OKR", icon: "🎯", color: "bg-red-500", tab: "okr" },
    { id: "company", name: "Company", icon: "🏢", color: "bg-cyan-500", tab: "company-info" },
  ];

  const handleFavoriteClick = (favoriteId: string) => {
    const favorite = favorites.find(f => f.id === favoriteId);
    if (favorite?.tab) {
      onNavigate?.(favorite.tab);
    }
  };

  // Mock moments/activity
  const moments = [
    {
      id: 1,
      user: "Michael",
      action: "Happy 10th anniversary! Looking forward to many more years together",
      avatar: "",
    },
  ];

  return (
    <div className="h-full flex flex-col overflow-y-auto bg-gradient-to-b from-background to-muted/20">
      {/* Header */}
      <div className="p-4 bg-background border-b sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border-2 border-primary">
              <AvatarImage src={currentUser?.photoURL} alt={currentUser?.displayName} />
              <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-sm font-semibold">{currentUser?.displayName || "User"}</h2>
              <p className="text-xs text-muted-foreground">
                {currentUser?.email || "user@example.com"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost" className="h-8 w-8">
              <Search className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects, tasks, documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      <div className="flex-1 p-4 space-y-4">
        {/* Company Bulletin */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Company Bulletin</h3>
          </div>
          <Card className="overflow-hidden border-2">
            <div className="relative h-32 bg-gradient-to-br from-blue-400 via-purple-400 to-pink-400 flex items-center justify-center">
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjEiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-30" />
              <div className="relative text-white text-center p-4">
                <h4 className="text-lg font-bold mb-1">Love work again.</h4>
                <p className="text-sm opacity-90">Stay organized and productive</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Favorites */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Favorites</h3>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
              <Plus className="h-3 w-3" />
              Add
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {favorites.map((app) => (
              <button
                key={app.id}
                onClick={() => handleFavoriteClick(app.id)}
                className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-muted/50 transition-colors"
              >
                <div
                  className={`w-12 h-12 rounded-xl ${app.color} flex items-center justify-center text-2xl shadow-md`}
                >
                  {app.icon}
                </div>
                <span className="text-xs font-medium text-center">{app.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Moments */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Moments</h3>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            {moments.map((moment) => (
              <Card key={moment.id}>
                <CardContent className="p-3">
                  <div className="flex gap-3">
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarImage src={moment.avatar} />
                      <AvatarFallback className="text-xs">
                        {moment.user[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium mb-1">{moment.user}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {moment.action}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => onNavigate?.("projects")}
          >
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground mb-1">Active Projects</p>
              <p className="text-2xl font-bold">{projects.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground mb-1">Tasks Due</p>
              <p className="text-2xl font-bold">0</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
