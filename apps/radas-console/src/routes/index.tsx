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
  RiGithubFill as Github,
  RiCheckLine as Check,
  RiTerminalBoxLine as Terminal,
  RiFileCopyLine as Copy,
} from "@remixicon/react";
import { RadasLogo } from "@/components/common/RadasLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getToken } from "@/lib/api";
import { TextScramble } from "@/components/landing/TextScramble";

export const Route = createFileRoute("/")({ component: WebLandingPage });

function WebLandingPage() {
  const navigate = useNavigate();
  const [isAuth, setIsAuth] = useState(false);
  const [activeTab, setActiveTab] = useState<"go" | "pnpm" | "curl" | "docker">("go");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setIsAuth(!!getToken());
  }, []);

  const installCommands = {
    go: "go install github.com/raizora/radas/apps/cli@latest",
    pnpm: "pnpm dlx @radas/cli create",
    curl: "curl -fsSL https://radas.internal/install.sh | bash",
    docker: "docker run -p 5001:5001 -p 8080:8080 radas/stack:latest",
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(installCommands[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const overviewFeatures = [
    {
      title: "OpenTofu & Ansible Orchestration",
      description: "Execute declarative infrastructure plans, applies, and Ansible playbooks with live-streamed logs.",
    },
    {
      title: "9Router AI Gateway & RTK Token Compression",
      description: "Multi-provider AI proxy with API key vault, RTK prompt token compression, and automatic model failover.",
    },
    {
      title: "Targeted Feature Flags & Rollouts",
      description: "Granular user whitelist, environment toggles, percentage rollouts, and instant emergency kill-switches.",
    },
    {
      title: "Codédex 8-Bit Desktop Pet Companion",
      description: "Floating transparent desktop mascot with real-time system status speech bubbles and 1-click console launcher.",
    },
    {
      title: "FinOps & Cloud Cost Protection",
      description: "Real-time multi-cloud cost anomaly detection, monthly budget alerts, and speculative PR cost diffs.",
    },
    {
      title: "High-Availability Distributed Workers",
      description: "Distributed Go worker daemon pool with heartbeat tracking, graceful draining, and round-robin fair queue scheduling.",
    },
    {
      title: "Enterprise Multi-Org Governance & SAML SSO",
      description: "Organization tenant boundaries, SAML 2.0 XML assertion login, audit logging, and automated compliance evidence exports.",
    },
  ];

  const faqs = [
    {
      q: "What is RADAS?",
      a: "RADAS is an enterprise hybrid cloud orchestration platform combining OpenTofu, Ansible, 9Router AI Proxy, and desktop companions in one unified workspace.",
    },
    {
      q: "How does the 9Router AI Gateway save costs?",
      a: "9Router compresses prompt tokens automatically using RTK algorithms and routes traffic across 40+ providers to eliminate downtime and reduce API bills by up to 40%.",
    },
    {
      q: "Is RADAS open-source and self-hostable?",
      a: "Yes! You can run the entire RADAS stack locally via Docker or deploy it to your own cloud infrastructure.",
    },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)] font-mono selection:bg-[var(--color-primary)] selection:text-[var(--color-primary-foreground)] flex flex-col">
      {/* Background Texture */}
      <div className="fixed inset-0 pointer-events-none opacity-20 bg-grid-pattern z-0" />

      {/* 1. NAVBAR */}
      <header className="relative z-20 border-b border-dashed border-[var(--color-border)] bg-[var(--color-card)]/90 backdrop-blur-md px-6 py-4">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 pxl-corner-sm bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/40 text-[var(--color-primary)]">
              <RadasLogo size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-wider font-pixel-grid">RADAS</span>
                <Badge variant="success" className="pxl-corner-sm text-[10px] font-pixel-grid">v4.0.0</Badge>
              </div>
              <span className="text-[10px] text-[var(--color-muted-foreground)]">Enterprise Infrastructure &amp; AI Platform</span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <a href="https://github.com/raizora/radas" target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-[var(--color-primary)]">
              <Github className="h-4 w-4" /> GitHub
            </a>
            <a href="#downloads" className="hover:text-[var(--color-primary)]">Downloads</a>
            {isAuth ? (
              <Button
                onClick={() => navigate({ to: "/dashboard" })}
                className="pxl-corner-sm pxl-btn-shadow bg-emerald-500 text-slate-950 hover:bg-emerald-400 font-bold font-pixel-grid"
              >
                Open Console <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Link to="/login">
                <Button className="pxl-corner-sm pxl-btn-shadow bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-bold font-pixel-grid">
                  Sign In <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* 2. HERO SECTION (Web Landing Page Architecture) */}
      <section className="relative z-10 py-16 px-6 sm:px-12 border-b border-dashed border-[var(--color-border)]">
        <div className="mx-auto max-w-5xl space-y-6">
          {/* Announcement Banner */}
          <div className="inline-flex flex-wrap items-center gap-2 text-xs font-mono bg-[var(--color-card)] border border-[var(--color-border)] px-3 py-1.5 pxl-corner-sm">
            <span className="bg-[var(--color-primary)] text-white px-2 py-0.5 text-[10px] font-bold font-pixel-grid">v4.0.0</span>
            <span className="text-[var(--color-muted-foreground)]">
              Phase 6 Released: Feature Flags, 9Router AI Gateway &amp; Codédex Desktop Companion.
            </span>
            <Link to="/login" className="text-[var(--color-primary)] font-bold underline hover:opacity-80">
              Open Console →
            </Link>
          </div>

          {/* Main Title */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight uppercase font-pixel-grid">
            The Enterprise Infrastructure <br />
            <span className="text-[var(--color-primary)]">&amp; AI GitOps Platform</span>
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-lg text-[var(--color-muted-foreground)] max-w-3xl leading-relaxed font-sans">
            Unified OpenTofu &amp; Ansible orchestration with 9Router AI Proxy token compression, FinOps cost guards, feature flags, and Codédex Desktop Companion.
          </p>

          {/* Command Switcher Widget */}
          <div className="bg-[var(--color-card)] border-2 border-[var(--color-border)] pxl-corner-md pxl-card-shadow overflow-hidden max-w-3xl pt-2">
            {/* Tabs */}
            <div className="flex border-b border-[var(--color-border)] bg-[var(--color-background)]">
              {(["go", "pnpm", "curl", "docker"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2.5 text-xs font-mono uppercase transition-colors ${
                    activeTab === tab
                      ? "bg-[var(--color-card)] text-[var(--color-primary)] border-b-2 border-[var(--color-primary)] font-bold"
                      : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Command Display */}
            <div className="p-4 flex items-center justify-between gap-4 font-mono text-xs sm:text-sm bg-[#090d16] text-emerald-400">
              <code className="flex-1 break-all">${installCommands[activeTab]}</code>
              <button
                onClick={handleCopy}
                className="p-2 text-slate-400 hover:text-white transition-colors"
                title="Copy command"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. PLATFORM OVERVIEW */}
      <section className="relative z-10 py-16 px-6 sm:px-12 border-b border-dashed border-[var(--color-border)] bg-[var(--color-card)]/30">
        <div className="mx-auto max-w-5xl space-y-8">
          <div>
            <div className="text-xs uppercase tracking-widest font-mono text-[var(--color-primary)] mb-1">
              <TextScramble text="[ PLATFORM OVERVIEW ]" />
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold uppercase font-pixel-grid">What is RADAS?</h2>
            <p className="text-sm sm:text-base text-[var(--color-muted-foreground)] mt-2 max-w-3xl font-sans">
              RADAS is an open, self-hosted infrastructure &amp; AI platform that brings modern software delivery experience to cloud engineering and systems automation.
            </p>
          </div>

          <div className="space-y-3 font-mono text-xs sm:text-sm">
            {overviewFeatures.map((feat, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <span className="text-[var(--color-primary)] font-bold">[*]</span>
                <p>
                  <span className="font-bold text-[var(--color-foreground)] font-pixel-grid">{feat.title}</span>
                  <span className="text-[var(--color-muted-foreground)]"> — {feat.description}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. CORE CAPABILITIES (Features Grid) */}
      <section className="relative z-10 py-16 px-6 sm:px-12 border-b border-dashed border-[var(--color-border)]">
        <div className="mx-auto max-w-6xl space-y-10">
          <div>
            <div className="text-xs uppercase tracking-widest font-mono text-[var(--color-primary)] mb-1">
              <TextScramble text="[ CORE CAPABILITIES ]" />
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold uppercase font-pixel-grid">Everything You Need for Cloud Delivery</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="pxl-corner-md pxl-card-shadow border-2 border-[var(--color-border)] bg-[var(--color-card)] p-6">
              <div className="h-10 w-10 pxl-corner-sm bg-emerald-500/15 text-emerald-400 flex items-center justify-center mb-4 border border-emerald-500/30">
                <Cpu className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold uppercase font-pixel-grid text-[var(--color-primary)]">9Router AI Gateway</h3>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-2 font-sans leading-relaxed">
                Connect 40+ AI providers with RTK token prompt compression, rate-limit 429 protection, and per-organization API key vaults.
              </p>
            </Card>

            <Card className="pxl-corner-md pxl-card-shadow border-2 border-[var(--color-border)] bg-[var(--color-card)] p-6">
              <div className="h-10 w-10 pxl-corner-sm bg-[var(--color-primary)]/15 text-[var(--color-primary)] flex items-center justify-center mb-4 border border-[var(--color-primary)]/30">
                <Cloud className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold uppercase font-pixel-grid text-[var(--color-primary)]">OpenTofu &amp; Ansible</h3>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-2 font-sans leading-relaxed">
                Orchestrate multi-cloud VPS infrastructure across AWS, GCP, Hetzner, and ByteDC with live-streamed execution logs.
              </p>
            </Card>

            <Card className="pxl-corner-md pxl-card-shadow border-2 border-[var(--color-border)] bg-[var(--color-card)] p-6">
              <div className="h-10 w-10 pxl-corner-sm bg-amber-500/15 text-amber-400 flex items-center justify-center mb-4 border border-amber-500/30">
                <Zap className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold uppercase font-pixel-grid text-amber-400">Codédex Desktop Pet</h3>
              <p className="text-xs text-[var(--color-muted-foreground)] mt-2 font-sans leading-relaxed">
                Floating transparent 8-bit desktop mascot companion with live speech bubble status updates and 1-click Console toggle.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* 5. DOWNLOAD CENTER */}
      <section id="downloads" className="relative z-10 py-16 px-6 sm:px-12 border-b border-dashed border-[var(--color-border)] bg-[var(--color-card)]/40">
        <div className="mx-auto max-w-5xl space-y-8 text-center">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-wider flex items-center justify-center gap-2 font-pixel-grid">
              <Download className="h-6 w-6 text-[var(--color-primary)]" />
              Download RADAS Desktop App
            </h2>
            <p className="text-xs text-[var(--color-muted-foreground)] font-sans mt-1">Multi-architecture installers for macOS, Linux, and Windows.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            <Card className="pxl-corner-md pxl-card-shadow border-2 border-[var(--color-border)] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Apple className="h-5 w-5 text-[var(--color-foreground)]" />
                <span className="font-bold text-sm font-pixel-grid">macOS</span>
              </div>
              <div className="space-y-2 pt-2 font-mono text-xs">
                <Button size="sm" variant="outline" className="w-full justify-between pxl-corner-sm text-xs">
                  <span>Apple Silicon (.dmg)</span>
                  <Download className="h-3.5 w-3.5 text-emerald-400" />
                </Button>
                <Button size="sm" variant="outline" className="w-full justify-between pxl-corner-sm text-xs">
                  <span>Intel Mac (.dmg)</span>
                  <Download className="h-3.5 w-3.5 text-emerald-400" />
                </Button>
              </div>
            </Card>

            <Card className="pxl-corner-md pxl-card-shadow border-2 border-[var(--color-border)] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Linux className="h-5 w-5 text-emerald-400" />
                <span className="font-bold text-sm font-pixel-grid">Linux</span>
              </div>
              <div className="space-y-2 pt-2 font-mono text-xs">
                <Button size="sm" variant="outline" className="w-full justify-between pxl-corner-sm text-xs">
                  <span>AppImage (.AppImage)</span>
                  <Download className="h-3.5 w-3.5 text-emerald-400" />
                </Button>
                <Button size="sm" variant="outline" className="w-full justify-between pxl-corner-sm text-xs">
                  <span>Debian (.deb)</span>
                  <Download className="h-3.5 w-3.5 text-emerald-400" />
                </Button>
              </div>
            </Card>

            <Card className="pxl-corner-md pxl-card-shadow border-2 border-[var(--color-border)] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Windows className="h-5 w-5 text-cyan-400" />
                <span className="font-bold text-sm font-pixel-grid">Windows</span>
              </div>
              <div className="space-y-2 pt-2 font-mono text-xs">
                <Button size="sm" variant="outline" className="w-full justify-between pxl-corner-sm text-xs">
                  <span>Installer (.exe)</span>
                  <Download className="h-3.5 w-3.5 text-emerald-400" />
                </Button>
                <Button size="sm" variant="outline" className="w-full justify-between pxl-corner-sm text-xs">
                  <span>Portable (.zip)</span>
                  <Download className="h-3.5 w-3.5 text-emerald-400" />
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* 6. FAQ SECTION */}
      <section className="relative z-10 py-16 px-6 sm:px-12 border-b border-dashed border-[var(--color-border)]">
        <div className="mx-auto max-w-4xl space-y-6">
          <h2 className="text-2xl font-black uppercase tracking-wider text-center font-pixel-grid">Frequently Asked Questions</h2>
          <div className="space-y-4 font-mono text-xs sm:text-sm">
            {faqs.map((faq, idx) => (
              <div key={idx} className="p-4 pxl-corner-sm bg-[var(--color-card)] border border-[var(--color-border)] space-y-2">
                <div className="font-bold text-[var(--color-primary)] font-pixel-grid">Q: {faq.q}</div>
                <div className="text-[var(--color-muted-foreground)] font-sans">{faq.a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. FOOTER */}
      <footer className="relative z-10 mt-auto border-t border-dashed border-[var(--color-border)] bg-[var(--color-card)] px-6 py-6 text-xs text-[var(--color-muted-foreground)]">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-4 font-mono">
          <div className="flex items-center gap-2">
            <RadasLogo size={16} />
            <span>RADAS Enterprise Platform &copy; 2026. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              All Systems Operational
            </span>
            <Link to="/login" className="hover:text-[var(--color-foreground)] font-bold">Console Login</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
