import React, { useState, useEffect } from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Loader2, CheckCircle2, XCircle, Database } from "lucide-react";
import { setupFirebase, isFirebaseSetup } from "../scripts/setup-firebase";
import { toast } from "sonner";

export function SetupPage() {
  const [loading, setLoading] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [isSetup, setIsSetup] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminDisplayName, setAdminDisplayName] = useState("");
  const [setupComplete, setSetupComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkSetupStatus();
  }, []);

  const checkSetupStatus = async () => {
    try {
      const setupStatus = await isFirebaseSetup();
      setIsSetup(setupStatus);
    } catch (err) {
      console.error("Error checking setup status:", err);
    } finally {
      setCheckingSetup(false);
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await setupFirebase({
        adminEmail: adminEmail.trim(),
        adminPassword: adminPassword.trim(),
        adminDisplayName: adminDisplayName.trim(),
      });

      if (result.success) {
        setSetupComplete(true);
        toast.success("Firebase setup completed successfully!");

        // Auto reload after 3 seconds
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      } else {
        setError(result.error?.message || "Setup failed");
        toast.error("Setup failed");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred during setup");
      toast.error("Setup failed");
    } finally {
      setLoading(false);
    }
  };

  if (checkingSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground">Checking setup status...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle>Setup Complete</CardTitle>
            <CardDescription>
              Firebase is already configured and ready to use
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => window.location.reload()} className="w-full">
              Continue to App
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (setupComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle>Setup Successful!</CardTitle>
            <CardDescription>
              Firebase has been initialized with default data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertDescription>
                <div className="space-y-2 text-sm">
                  <p className="font-semibold">Setup completed:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>41 default permissions created</li>
                    <li>3 system roles created (Admin, Member, Viewer)</li>
                    <li>Admin user created</li>
                  </ul>
                </div>
              </AlertDescription>
            </Alert>

            <div className="p-4 bg-muted rounded-lg space-y-1 text-sm">
              <p className="font-semibold">Admin Credentials:</p>
              <p className="text-muted-foreground">Email: {adminEmail}</p>
              <p className="text-muted-foreground">You can now login with these credentials</p>
            </div>

            <p className="text-xs text-center text-muted-foreground">
              Redirecting to app in 3 seconds...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Database className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Firebase Setup</CardTitle>
          <CardDescription>
            Initialize Firebase collections and create your admin account
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSetup} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Alert>
              <AlertDescription className="text-xs">
                This will create:
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Default permissions (41 items)</li>
                  <li>System roles (Admin, Member, Viewer)</li>
                  <li>Your admin user account</li>
                </ul>
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="adminEmail">
                Admin Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="adminEmail"
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@example.com"
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="adminPassword">
                Admin Password <span className="text-destructive">*</span>
              </Label>
              <Input
                id="adminPassword"
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">Minimum 6 characters</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="adminDisplayName">
                Admin Display Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="adminDisplayName"
                type="text"
                value={adminDisplayName}
                onChange={(e) => setAdminDisplayName(e.target.value)}
                placeholder="Admin User"
                required
                disabled={loading}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Setting up Firebase...
                </>
              ) : (
                "Initialize Firebase"
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              This process may take a few seconds
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
