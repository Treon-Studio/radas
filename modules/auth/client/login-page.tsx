import React, { useState } from "react";
import { Button } from "@radas/ui/ui/button";
import { Input } from "@radas/ui/ui/input";
import { Label } from "@radas/ui/ui/label";
import { useAuth } from "@radas/config/contexts/auth-context";
import LogoSvg from "@/shared/assets/logo.svg";

export function LoginPage() {
  const { login, signup, loginWithGoogle, loginWithGoogleChromeIdentity, loading } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const result = isSignUp
        ? await signup(email, password, displayName)
        : await login(email, password);

      if (!result.success) {
        setError(getErrorMessage(result.error));
      }
    } catch (err: any) {
      setError(getErrorMessage(err));
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    try {
      // Try Chrome Identity API first (recommended for Chrome extensions)
      const result = await loginWithGoogleChromeIdentity();

      if (!result.success) {
        // Fallback to popup method if Chrome Identity fails
        const popupResult = await loginWithGoogle();
        if (!popupResult.success) {
          setError(getErrorMessage(popupResult.error));
        }
      }
    } catch (err: any) {
      setError(getErrorMessage(err));
    }
  };

  const getErrorMessage = (error: any): string => {
    const errorCode = error?.code || "";
    const errorMessages: { [key: string]: string } = {
      "auth/invalid-email": "Email tidak valid",
      "auth/user-disabled": "Akun telah dinonaktifkan",
      "auth/user-not-found": "Pengguna tidak ditemukan",
      "auth/wrong-password": "Password salah",
      "auth/email-already-in-use": "Email sudah digunakan",
      "auth/weak-password": "Password terlalu lemah (minimal 6 karakter)",
      "auth/network-request-failed": "Gagal terhubung ke jaringan",
      "auth/too-many-requests": "Terlalu banyak percobaan, coba lagi nanti",
      "auth/popup-closed-by-user": "Popup ditutup sebelum selesai",
      "auth/cancelled-popup-request": "Permintaan popup dibatalkan",
    };

    return errorMessages[errorCode] || error?.message || "Terjadi kesalahan";
  };

  return (
    <div className="w-full min-h-[500px] flex items-center justify-center bg-gradient-to-br from-primary/5 to-secondary/5 p-6">
      <div className="w-full max-w-md space-y-6 bg-card rounded-lg shadow-lg p-8">
        {/* Logo */}
        <div className="flex flex-col items-center space-y-2">
          <img src={LogoSvg} alt="Radas Logo" className="h-12 w-auto" />
          <h1 className="text-2xl font-bold text-primary">Selamat Datang</h1>
          <p className="text-sm text-muted-foreground">
            {isSignUp ? "Buat akun baru" : "Masuk ke akun Anda"}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Email/Password Form */}
        <form onSubmit={handleEmailAuth} className="space-y-4">
          {isSignUp && (
            <div className="space-y-2">
              <Label htmlFor="displayName">Nama</Label>
              <Input
                id="displayName"
                type="text"
                placeholder="Nama lengkap"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required={isSignUp}
                disabled={loading}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="nama@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              minLength={6}
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={loading}
          >
            {loading ? "Memproses..." : isSignUp ? "Daftar" : "Masuk"}
          </Button>
        </form>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">Atau</span>
          </div>
        </div>

        {/* Google Sign In */}
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleGoogleSignIn}
          disabled={loading}
        >
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Masuk dengan Google
        </Button>

        {/* Toggle Sign Up/Sign In */}
        <div className="text-center text-sm">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError("");
            }}
            className="text-primary hover:underline"
            disabled={loading}
          >
            {isSignUp ? "Sudah punya akun? Masuk" : "Belum punya akun? Daftar"}
          </button>
        </div>
      </div>
    </div>
  );
}
