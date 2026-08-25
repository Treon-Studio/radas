import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  RiCpuLine as Cpu,
  RiCloudLine as Cloud,
  RiSparklingLine as Zap,
  RiDownload2Line as Download,
  RiArrowRightLine as ArrowRight,
  RiShieldCheckLine as ShieldCheck,
  RiMacbookLine as Apple,
  RiWindowsLine as Windows,
  RiCommandLine as Linux,
  RiExchangeDollarLine as Dollar,
  RiPulseLine as Pulse,
  RiTerminalBoxLine as Terminal,
  RiCheckLine as Check,
  RiRocketLine as Rocket,
  RiGithubFill as Github,
} from "@remixicon/react";
import { RadasLogo } from "@/components/common/RadasLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getToken } from "@/lib/api";

export const Route = createFileRoute("/")({ component: LandingPage });

function LandingPage() {
  const navigate = useNavigate();
  const [isAuth, setIsAuth] = useState(false);
  const [activeTab, setActiveTab] = useState<"ai" | "cloud" | "desktop">("ai");

  useEffect(() => {
    setIsAuth(!!getToken());
  }, []);

  return (
    <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)] font-mono selection:bg-[var(--color-primary)] selection:text-[var(--color-primary-foreground)] flex flex-col">
      {/* Dynamic Grid Background */}
      <div className="fixed inset-0 pointer-events-none opacity-25 bg-grid-pattern z-0" />

      {/* 1. HEADER */}
      <header className="relative z-20 border-b-2 border-[var(--color-border)] bg-[var(--color-card)]/90 backdrop-blur-md px-6 py-4">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 pxl-corner-sm bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/40 text-[var(--color-primary)]">
              <RadasLogo size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-wider font-pixel-grid">RADAS</span>
                <Badge variant="success" className="pxl-corner-sm text-[10px] font-pixel-grid">ULTRA</Badge>
              </div>
              <span className="text-[10px] text-[var(--color-muted-foreground)]">Cloud &amp; AI Control Hub</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isAuth ? (
              <Button
                onClick={() => navigate({ to: "/dashboard" })}
                className="pxl-corner-sm pxl-btn-shadow bg-emerald-500 text-slate-950 hover:bg-emerald-400 font-bold font-pixel-grid"
              >
                Ke Dashboard <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="outline" className="pxl-corner-sm font-pixel-grid">
                    Masuk
                  </Button>
                </Link>
                <Link to="/login">
                  <Button className="pxl-corner-sm pxl-btn-shadow bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-bold font-pixel-grid">
                    Coba Gratis <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 2. HERO SECTION (Codédex 16-Bit Pixel Landscape) */}
      <section className="relative z-10 min-h-[580px] flex flex-col justify-between overflow-hidden border-b-2 border-[#120e00] shadow-2xl bg-[#29a9e0]">
        {/* Background Pixel Landscape Image */}
        <img
          src="/hero_pixel_landscape.png"
          alt="Pixel Art Landscape Background"
          className="absolute inset-0 w-full h-full object-cover object-bottom z-0 select-none"
        />

        {/* Floating Title & Subtitle Overlay */}
        <div className="relative z-10 pt-14 pb-4 px-6 text-center mx-auto max-w-4xl space-y-4">
          {/* Small Top Text */}
          <div className="text-xs sm:text-sm font-bold uppercase tracking-widest text-[#0c2438] font-pixel-grid drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)]">
            START YOUR
          </div>

          {/* 3D Pixel Title Text */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black uppercase tracking-wider leading-tight codedex-pixel-title py-1">
            RADAS<br />
            Cloud Adventure
          </h1>

          {/* Subtitle */}
          <p className="text-xs sm:text-sm md:text-base text-[#0d2235] font-sans font-semibold max-w-xl mx-auto drop-shadow-[0_1px_3px_rgba(255,255,255,0.95)]">
            Deploy server cepat di cloud mana pun &amp; hemat biaya AI sampai 40%. ✨
          </p>

          {/* Yellow 8-Bit CTA Button */}
          <div className="pt-2">
            <Link to="/login">
              <button className="codedex-btn-yellow text-sm sm:text-base px-8 py-3.5 rounded-none cursor-pointer inline-flex items-center gap-2">
                Get started <ArrowRight className="h-5 w-5" />
              </button>
            </Link>
          </div>
        </div>

        {/* Bottom Layer: Mascot Computer on Left + Tech Logos Right */}
        <div className="relative z-10 px-6 pb-6 mx-auto max-w-6xl w-full flex flex-col md:flex-row items-end justify-between gap-6">
          {/* Retro Computer Mascot (Bottom Left) */}
          <div className="flex items-end gap-3 group">
            <img
              src="/retro_pet.svg"
              alt="Retro Pet Mascot"
              className="w-28 sm:w-36 h-auto drop-shadow-xl transition-transform duration-300 group-hover:scale-105"
            />
          </div>

          {/* Footer Supported By Logos Row (Bottom Right) */}
          <div className="flex flex-wrap items-center justify-center md:justify-end gap-5 text-xs text-[#0e2417] font-bold font-pixel-grid bg-white/40 backdrop-blur-md px-5 py-2.5 rounded-lg border border-white/50 shadow-md">
            <span className="text-[10px] text-slate-900 uppercase tracking-widest">SUPPORTED BY</span>
            <div className="flex items-center gap-1.5 text-slate-950"><Github className="h-4 w-4" /> GitHub</div>
            <div className="flex items-center gap-1.5 text-emerald-950"><Cloud className="h-4 w-4 text-emerald-800" /> OpenTofu</div>
            <div className="flex items-center gap-1.5 text-red-950"><Cpu className="h-4 w-4 text-red-800" /> Ansible</div>
            <div className="flex items-center gap-1.5 text-amber-950">AWS</div>
            <div className="flex items-center gap-1.5 text-cyan-950">Hetzner</div>
          </div>
        </div>
      </section>

      {/* 3. INTERACTIVE FEATURE TAB SHOWCASE */}
      <section className="relative z-10 py-16 px-6 border-b-2 border-[var(--color-border)]">
        <div className="mx-auto max-w-5xl space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-xl sm:text-2xl font-black uppercase tracking-wider font-pixel-grid">Fitur Unggulan Buat Kerja Lebih Cepat</h2>
            <p className="text-xs text-[var(--color-muted-foreground)] font-sans">Dirancang khusus untuk developer, DevOps, dan AI builder modern.</p>
          </div>

          {/* Interactive Feature Tabs */}
          <div className="flex justify-center border-b-2 border-[var(--color-border)] gap-2">
            <button
              onClick={() => setActiveTab("ai")}
              className={`px-5 py-3 text-xs uppercase font-bold pxl-corner-sm transition-all flex items-center gap-2 font-pixel-grid ${
                activeTab === "ai"
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] pxl-shadow"
                  : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              }`}
            >
              <Cpu className="h-4 w-4" /> 💸 Smart AI Cost Saver
            </button>
            <button
              onClick={() => setActiveTab("cloud")}
              className={`px-5 py-3 text-xs uppercase font-bold pxl-corner-sm transition-all flex items-center gap-2 font-pixel-grid ${
                activeTab === "cloud"
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] pxl-shadow"
                  : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              }`}
            >
              <Cloud className="h-4 w-4" /> ⚡ Multi-Cloud Manager
            </button>
            <button
              onClick={() => setActiveTab("desktop")}
              className={`px-5 py-3 text-xs uppercase font-bold pxl-corner-sm transition-all flex items-center gap-2 font-pixel-grid ${
                activeTab === "desktop"
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] pxl-shadow"
                  : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              }`}
            >
              <Zap className="h-4 w-4" /> 🤖 Desktop Pet Assistant
            </button>
          </div>

          {/* Feature Tab Contents */}
          {activeTab === "ai" && (
            <Card className="pxl-corner-md pxl-card-shadow border-2 border-[var(--color-border)] bg-[var(--color-card)] p-6 space-y-4">
              <div className="flex flex-col md:flex-row gap-6 items-center">
                <div className="space-y-3 flex-1 font-sans">
                  <Badge variant="success" className="pxl-corner-sm font-mono text-[10px] font-pixel-grid">9ROUTER AI ENGINE</Badge>
                  <h3 className="text-lg font-bold uppercase text-[var(--color-primary)] font-pixel-grid">Gak Ada Lagi Tagihan AI Membengkak</h3>
                  <p className="text-xs text-[var(--color-muted-foreground)] leading-relaxed">
                    Hubungkan semua API key AI kamu di satu tempat. Engine pintar RADAS otomatis memotong token yang gak perlu pada prompt panjang, hemat biaya hingga 40%, dan otomatis pindah ke model backup kalau provider utama lagi rate-limit.
                  </p>
                  <ul className="space-y-1.5 text-xs text-[var(--color-foreground)] pt-2 font-mono">
                    <li className="flex items-center gap-2 text-emerald-400"><Check className="h-4 w-4" /> Hemat token otomatis pada log &amp; diff kode.</li>
                    <li className="flex items-center gap-2 text-emerald-400"><Check className="h-4 w-4" /> Bebas gonta-ganti OpenAI, Claude, DeepSeek, Gemini.</li>
                    <li className="flex items-center gap-2 text-emerald-400"><Check className="h-4 w-4" /> Perlindungan rate-limit 429 tanpa koneksi terputus.</li>
                  </ul>
                </div>
                <div className="w-full md:w-80 p-4 pxl-corner-sm bg-[#090d16] border border-emerald-500/40 font-mono text-xs space-y-2">
                  <div className="text-[10px] text-emerald-400 font-bold uppercase flex items-center justify-between">
                    <span>RTK Saver Live Status</span>
                    <span>● Active</span>
                  </div>
                  <div className="text-[11px] text-slate-300">Total Savings: <span className="text-emerald-400 font-bold">+64,200 Tokens</span></div>
                  <div className="text-[11px] text-slate-300">Efficiency Ratio: <span className="text-emerald-400 font-bold">34.8% Saved</span></div>
                  <div className="w-full bg-slate-800 h-2 rounded overflow-hidden">
                    <div className="bg-emerald-500 h-full w-[35%]" />
                  </div>
                </div>
              </div>
            </Card>
          )}

          {activeTab === "cloud" && (
            <Card className="pxl-corner-md pxl-card-shadow border-2 border-[var(--color-border)] bg-[var(--color-card)] p-6 space-y-4">
              <div className="flex flex-col md:flex-row gap-6 items-center">
                <div className="space-y-3 flex-1 font-sans">
                  <Badge variant="warning" className="pxl-corner-sm font-mono text-[10px] font-pixel-grid">HYBRID CLOUD ONSITE</Badge>
                  <h3 className="text-lg font-bold uppercase text-amber-400 font-pixel-grid">Deploy Server Cloud Sekali Klik</h3>
                  <p className="text-xs text-[var(--color-muted-foreground)] leading-relaxed">
                    Atur infrastruktur di AWS, GCP, Hetzner, atau ByteDC tanpa perlu pusing nulis script dari nol. Pantau statistik CPU, RAM, disk space, dan otomatisasi deployment dengan sekali klik.
                  </p>
                  <ul className="space-y-1.5 text-xs text-[var(--color-foreground)] pt-2 font-mono">
                    <li className="flex items-center gap-2 text-amber-400"><Check className="h-4 w-4" /> Monitoring kesehatan server &amp; status live.</li>
                    <li className="flex items-center gap-2 text-amber-400"><Check className="h-4 w-4" /> Otomatisasi OpenTofu &amp; Ansible playbooks.</li>
                    <li className="flex items-center gap-2 text-amber-400"><Check className="h-4 w-4" /> Manajemen inventory VPS terpadu.</li>
                  </ul>
                </div>
                <div className="w-full md:w-80 p-4 pxl-corner-sm bg-[#090d16] border border-amber-500/40 font-mono text-xs space-y-2">
                  <div className="text-[10px] text-amber-400 font-bold uppercase flex items-center justify-between font-pixel-grid">
                    <span>Cloud VPS Health</span>
                    <span>4/4 Online</span>
                  </div>
                  <div className="text-[11px] text-slate-300">AWS Singapore: <span className="text-emerald-400 font-bold">100% Healthy</span></div>
                  <div className="text-[11px] text-slate-300">Hetzner Germany: <span className="text-emerald-400 font-bold">100% Healthy</span></div>
                  <div className="text-[11px] text-slate-300">ByteDC Jakarta: <span className="text-emerald-400 font-bold">100% Healthy</span></div>
                </div>
              </div>
            </Card>
          )}

          {activeTab === "desktop" && (
            <Card className="pxl-corner-md pxl-card-shadow border-2 border-[var(--color-border)] bg-[var(--color-card)] p-6 space-y-4">
              <div className="flex flex-col md:flex-row gap-6 items-center">
                <div className="space-y-3 flex-1 font-sans">
                  <Badge variant="cyan" className="pxl-corner-sm font-mono text-[10px] font-pixel-grid">RADAS DESKTOP PET</Badge>
                  <h3 className="text-lg font-bold uppercase text-cyan-400 font-pixel-grid">Teman Setia Di Desktop Kamu</h3>
                  <p className="text-xs text-[var(--color-muted-foreground)] leading-relaxed">
                    Pet avatar pixel 8-bit imut yang melayang di desktop kamu. Memberikan balon ucapan status server real-time dan notifikasi penting, plus klik 1-kali untuk langsung membuka console.
                  </p>
                  <ul className="space-y-1.5 text-xs text-[var(--color-foreground)] pt-2 font-mono">
                    <li className="flex items-center gap-2 text-cyan-400"><Check className="h-4 w-4" /> Melayang transparan &amp; bebas digeser (drag &amp; drop).</li>
                    <li className="flex items-center gap-2 text-cyan-400"><Check className="h-4 w-4" /> Speech bubble status server real-time.</li>
                    <li className="flex items-center gap-2 text-cyan-400"><Check className="h-4 w-4" /> 1-klik untuk buka/tutup RADAS Console.</li>
                  </ul>
                </div>
                <div className="w-full md:w-80 p-4 pxl-corner-sm bg-[#090d16] border border-cyan-500/40 font-mono text-xs space-y-2 text-center">
                  <div className="p-2 border border-cyan-500/30 rounded bg-cyan-500/10 text-cyan-300 font-bold font-pixel-grid">
                    &quot;Beep boop! All 4 stacks healthy 🚀&quot;
                  </div>
                  <div className="text-[10px] text-slate-400 pt-1">macOS Apple Silicon, Intel, Linux, Windows Supported</div>
                </div>
              </div>
            </Card>
          )}
        </div>
      </section>

      {/* 4. DOWNLOAD CENTER */}
      <section id="downloads" className="relative z-10 py-16 px-6 border-b-2 border-[var(--color-border)] bg-[var(--color-card)]/40">
        <div className="mx-auto max-w-5xl space-y-8 text-center">
          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-black uppercase tracking-wider flex items-center justify-center gap-2 font-pixel-grid">
              <Download className="h-6 w-6 text-[var(--color-primary)]" />
              Unduh RADAS Desktop App
            </h2>
            <p className="text-xs text-[var(--color-muted-foreground)] font-sans">Tersedia untuk macOS (Apple Silicon M1-M4 &amp; Intel), Linux, dan Windows.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            {/* macOS */}
            <Card className="pxl-corner-md pxl-card-shadow border-2 border-[var(--color-border)]">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Apple className="h-5 w-5 text-[var(--color-foreground)]" />
                  <CardTitle className="text-base font-bold font-pixel-grid">macOS</CardTitle>
                </div>
                <CardDescription className="text-xs">Apple Silicon (M1–M4) &amp; Intel Macs</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button size="sm" variant="outline" className="w-full justify-between pxl-corner-sm text-xs font-mono">
                  <span>Apple Silicon (.dmg)</span>
                  <Download className="h-3.5 w-3.5 text-emerald-400" />
                </Button>
                <Button size="sm" variant="outline" className="w-full justify-between pxl-corner-sm text-xs font-mono">
                  <span>Intel Mac (.dmg)</span>
                  <Download className="h-3.5 w-3.5 text-emerald-400" />
                </Button>
              </CardContent>
            </Card>

            {/* Linux */}
            <Card className="pxl-corner-md pxl-card-shadow border-2 border-[var(--color-border)]">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Linux className="h-5 w-5 text-emerald-400" />
                  <CardTitle className="text-base font-bold">Linux</CardTitle>
                </div>
                <CardDescription className="text-xs">Ubuntu, Debian, Fedora, Arch</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button size="sm" variant="outline" className="w-full justify-between pxl-corner-sm text-xs font-mono">
                  <span>AppImage (.AppImage)</span>
                  <Download className="h-3.5 w-3.5 text-emerald-400" />
                </Button>
                <Button size="sm" variant="outline" className="w-full justify-between pxl-corner-sm text-xs font-mono">
                  <span>Debian (.deb)</span>
                  <Download className="h-3.5 w-3.5 text-emerald-400" />
                </Button>
              </CardContent>
            </Card>

            {/* Windows */}
            <Card className="pxl-corner-md pxl-card-shadow border-2 border-[var(--color-border)]">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Windows className="h-5 w-5 text-cyan-400" />
                  <CardTitle className="text-base font-bold">Windows</CardTitle>
                </div>
                <CardDescription className="text-xs">Windows 10 / 11 (64-bit)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button size="sm" variant="outline" className="w-full justify-between pxl-corner-sm text-xs font-mono">
                  <span>Installer (.exe)</span>
                  <Download className="h-3.5 w-3.5 text-emerald-400" />
                </Button>
                <Button size="sm" variant="outline" className="w-full justify-between pxl-corner-sm text-xs font-mono">
                  <span>Portable (.zip)</span>
                  <Download className="h-3.5 w-3.5 text-emerald-400" />
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* 5. FOOTER */}
      <footer className="relative z-10 mt-auto border-t-2 border-[var(--color-border)] bg-[var(--color-card)] px-6 py-6 text-xs text-[var(--color-muted-foreground)]">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-4 font-mono">
          <div className="flex items-center gap-2">
            <RadasLogo size={16} />
            <span>RADAS Platform &copy; 2026. Hak Cipta Dilindungi.</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Sistem Berjalan Normal
            </span>
            <Link to="/login" className="hover:text-[var(--color-foreground)]">Masuk Console</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
