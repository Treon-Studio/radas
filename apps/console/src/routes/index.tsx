import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  RiCheckLine as Check,
  RiFileCopyLine as Copy,
  RiArrowRightLine as ArrowRight,
  RiGithubFill as Github,
  RiArrowDownSLine as ChevronDown,
} from "@remixicon/react";
import { RadasLogo } from "@/components/common/RadasLogo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getToken } from "@/lib/api";
import { TextScramble } from "@/components/landing/TextScramble";
import { PxlCloudIcon, PxlCpuIcon, PxlSparklesIcon, PxlShieldIcon } from "@/components/ui/pxl-icons";

export const Route = createFileRoute("/")({ component: WebLandingPage });

const faqs = [
  {
    question: "What is RADAS?",
    answer: "RADAS is a self-hosted infrastructure orchestrator and GitOps control plane that unifies OpenTofu, Ansible, BYOC code registries, and FinOps cost protections into a single platform.",
  },
  {
    question: "Can RADAS be completely self-hosted air-gapped?",
    answer: "Yes! RADAS is designed for air-gapped deployments using PostgreSQL for persistence and local Go worker daemons. No telemetry or credentials ever leave your environment.",
  },
  {
    question: "How does the BYOC Code Registry work?",
    answer: "Similar to shadcn/ui for frontend, the RADAS BYOC registry copies reusable OpenTofu modules and Ansible roles directly into your stack repositories rather than using fragile external references.",
  },
  {
    question: "Which cloud providers are supported for FinOps cost estimations?",
    answer: "RADAS FinOps supports automated pricing calculators, anomaly forecasts, and budget spike alerts for AWS, GCP, Azure, and ByteDC infrastructure.",
  },
  {
    question: "How do Feature Flags integrate with infrastructure stacks?",
    answer: "RADAS Feature Flags provide granular user whitelisting, percentage rollouts, and instant emergency kill-switches with sub-millisecond evaluation directly in your execution pipelines.",
  },
  {
    question: "Is RADAS compatible with existing CI/CD tools?",
    answer: "Yes! RADAS provides Atlantis-style GitOps PR plan commenting, GitHub Actions / GitLab webhooks, and pre-apply validation hooks that plug into any existing CI/CD flow.",
  },
];

function FAQItem({ faq }: { faq: typeof faqs[0] }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Card className="pxl-corner-md pxl-card-shadow border border-dashed border-[#D1D1D1] bg-[#FAFAFA] p-5 mb-5 transition-all duration-300 hover:bg-white hover:border-[#107A4D]/50 group">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left flex items-center justify-between font-mono text-sm font-bold text-[#2A2A2A] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3 flex-1 pr-2">
          <span className="pxl-corner-sm bg-[#107A4D] text-white px-2 py-0.5 text-xs font-pixel-grid font-bold shrink-0 shadow-sm">
            ?
          </span>
          <span className="font-pixel-grid text-sm sm:text-base text-[#2A2A2A] group-hover:text-[#107A4D] transition-colors leading-snug">
            {faq.question}
          </span>
        </div>
        <ChevronDown
          className={`h-5 w-5 text-[#6B7280] transition-transform duration-200 shrink-0 ${
            isOpen ? "rotate-180 text-[#107A4D]" : ""
          }`}
        />
      </button>
      {isOpen && (
        <div className="pt-4 mt-3 border-t border-dashed border-[#D1D1D1] text-xs sm:text-sm text-[#6B7280] font-sans leading-relaxed">
          {faq.answer}
        </div>
      )}
    </Card>
  );
}

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

  return (
    <div className="min-h-screen bg-[#F1EFEB] text-[#2A2A2A] font-mono relative selection:bg-[#107A4D] selection:text-white flex flex-col justify-between">
      {/* Background Radial Grid Dot Pattern */}
      <div
        className="fixed inset-0 pointer-events-none opacity-30 z-0 bg-grid-pattern"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(0, 0, 0, 0.12) 1px, transparent 1px)",
          backgroundSize: "8px 8px",
        }}
      />

      {/* Full Width Layout */}
      <div className="relative z-10 w-full flex-1 flex flex-col min-h-screen justify-between bg-[#F1EFEB]">
        {/* 1. NAVBAR (Full Width with Centered Content) */}
        <nav className="w-full border-b border-[#D1D1D1] bg-[#F1EFEB]">
          <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-8 py-5">
            <div className="flex items-center gap-3">
              <div className="p-1.5 pxl-corner-sm bg-[#2A2A2A] text-white">
                <RadasLogo size={20} />
              </div>
              <span className="font-extrabold text-lg tracking-tight font-pixel-grid text-[#2A2A2A]">RADAS</span>
            </div>

            <div className="flex items-center gap-6 text-xs sm:text-sm font-mono text-[#6B7280]">
              <a href="https://github.com/raizora/radas" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-[#107A4D] transition-colors">
                <Github className="h-4 w-4" /> GitHub
              </a>
              <a href="#capabilities" className="hover:text-[#107A4D] transition-colors hidden sm:inline">Capabilities</a>
              <a href="#faq" className="hover:text-[#107A4D] transition-colors hidden sm:inline">FAQ</a>
              {isAuth ? (
                <Button
                  onClick={() => navigate({ to: "/dashboard" })}
                  className="pxl-corner-sm pxl-btn-shadow bg-[#107A4D] text-white hover:bg-[#0e6640] font-bold font-pixel-grid text-xs px-4 py-2"
                >
                  Open Console <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Link to="/login">
                  <Button className="pxl-corner-sm pxl-btn-shadow bg-[#2A2A2A] text-white hover:bg-[#1f1f1f] font-bold font-pixel-grid text-xs px-4 py-2">
                    Sign In <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </nav>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 w-full">
          {/* 2. HERO SECTION FULL WIDTH EDGE-TO-EDGE */}
          <section className="relative w-full overflow-hidden text-center">
            {/* Background Pixel Landscape Layer (Full Width Animated Video Loop) */}
            <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
              <video
                autoPlay
                loop
                muted
                playsInline
                poster="/images/hero-pixel-landscape.webp"
                className="w-full h-full object-cover object-bottom pointer-events-none"
                style={{ imageRendering: 'pixelated' }}
              >
                <source src="/videos/hero-pixel-landscape.mp4" type="video/mp4" />
              </video>
            </div>

            {/* Hero Foreground Content */}
            <div className="relative z-10 max-w-3xl mx-auto space-y-6 pt-20 sm:pt-28 pb-36 sm:pb-48 px-6 sm:px-12">
              {/* 3D Pixel Gamer Title */}
              <h1 className="text-xl sm:text-3xl lg:text-4xl font-extrabold tracking-wider uppercase leading-snug">
                <span className="pixel-gamer-title block">MODERN GITOPS</span>
                <span className="pixel-gamer-green block mt-1.5">PLATFORM</span>
              </h1>

              {/* Subtitle */}
              <p className="text-[#2A2A2A] text-base sm:text-lg max-w-xl mx-auto leading-relaxed font-sans font-semibold bg-white/75 backdrop-blur-xs py-1.5 px-4 pxl-corner-sm inline-block border border-white/80 shadow-xs">
                Unified OpenTofu &amp; Ansible infrastructure control plane.
              </p>

              {/* Minimal CTA Actions */}
              <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
                <Link to="/login">
                  <Button className="pxl-corner-md pxl-btn-shadow bg-[#107A4D] text-white hover:bg-[#0e6640] font-bold font-pixel-grid text-sm px-7 py-3">
                    Open Console <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
                <a href="https://github.com/raizora/radas" target="_blank" rel="noreferrer">
                  <Button variant="outline" className="pxl-corner-md border-[#2A2A2A] bg-white text-[#2A2A2A] hover:bg-[#EBE8E2] font-mono text-sm px-6 py-3 shadow-sm">
                    <Github className="h-4 w-4 mr-2" /> View Source
                  </Button>
                </a>
              </div>

              {/* Minimal Command Bar */}
              <div className="pt-4 max-w-xl mx-auto">
                <div className="border-2 border-[#2A2A2A] pxl-corner-sm bg-white/95 backdrop-blur-xs p-3.5 flex items-center justify-between gap-4 text-xs font-mono text-[#2A2A2A] shadow-md">
                  <div className="flex items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap">
                    <span className="text-[#107A4D] font-bold">$</span>
                    <code className="text-[#2A2A2A] truncate font-bold">go install github.com/raizora/radas/apps/cli@latest</code>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText("go install github.com/raizora/radas/apps/cli@latest");
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="pxl-corner-sm text-[#6B7280] hover:text-[#2A2A2A] p-1.5 h-auto"
                  >
                    {copied ? <Check className="h-4 w-4 text-[#107A4D]" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </section>

            {/* Dashed Separator Line */}
            <hr className="border-dashed border-[#D1D1D1] w-full" />

            {/* 3. CAPABILITIES GRID */}
            <section id="capabilities" className="relative w-full py-16 sm:py-24">
              <div className="max-w-6xl mx-auto px-6 sm:px-12">
                <div className="text-sm uppercase tracking-widest font-mono mb-2 text-[#107A4D]">
                  <TextScramble text="[ CORE CAPABILITIES ]" className="font-mono" />
                </div>
                <h2 className="text-[#2A2A2A] mb-10 text-2xl sm:text-4xl font-bold font-sans tracking-tight">
                  Everything you need for infrastructure delivery.
                </h2>

                {/* Clean 4-Card Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-10">
                  <Card className="pxl-corner-md pxl-card-shadow border border-dashed border-[#D1D1D1] bg-[#FAFAFA] p-8 sm:p-10 group cursor-pointer transition-all duration-300 hover:bg-white hover:border-[#107A4D]/50">
                    <div className="h-10 w-10 pxl-corner-sm bg-[#D8F3E5] text-[#107A4D] flex items-center justify-center mb-5 border border-[#107A4D]/30 shadow-sm transition-transform duration-300 group-hover:scale-110">
                      <PxlCloudIcon className="h-5 w-5" />
                    </div>
                    <div className="text-[#107A4D] font-mono text-xs uppercase mb-2 font-bold">[ ORCHESTRATION ]</div>
                    <h3 className="text-xl font-bold text-[#2A2A2A] mb-3 font-pixel-grid group-hover:text-[#107A4D] transition-colors">Declarative OpenTofu &amp; Ansible</h3>
                    <p className="text-sm text-[#6B7280] leading-relaxed">
                      Execute multi-cloud infrastructure plans, applies, and playbook runs with real-time streaming execution logs.
                    </p>
                  </Card>

                  <Card className="pxl-corner-md pxl-card-shadow border border-dashed border-[#D1D1D1] bg-[#FAFAFA] p-8 sm:p-10 group cursor-pointer transition-all duration-300 hover:bg-white hover:border-[#2A2A2A]/50">
                    <div className="h-10 w-10 pxl-corner-sm bg-[#E2E4E8] text-[#2A2A2A] flex items-center justify-center mb-5 border border-[#2A2A2A]/30 shadow-sm transition-transform duration-300 group-hover:scale-110">
                      <PxlCpuIcon className="h-5 w-5" />
                    </div>
                    <div className="text-[#107A4D] font-mono text-xs uppercase mb-2 font-bold">[ REUSABILITY ]</div>
                    <h3 className="text-xl font-bold text-[#2A2A2A] mb-3 font-pixel-grid group-hover:text-[#107A4D] transition-colors">BYOC Private Code Registry</h3>
                    <p className="text-sm text-[#6B7280] leading-relaxed">
                      Shadcn-style adoption for reusable OpenTofu modules and Ansible roles directly into your stacks with single-line imports.
                    </p>
                  </Card>

                  <Card className="pxl-corner-md pxl-card-shadow border border-dashed border-[#D1D1D1] bg-[#FAFAFA] p-8 sm:p-10 group cursor-pointer transition-all duration-300 hover:bg-white hover:border-[#CC9100]/50">
                    <div className="h-10 w-10 pxl-corner-sm bg-[#FFF3D6] text-[#CC9100] flex items-center justify-center mb-5 border border-[#CC9100]/30 shadow-sm transition-transform duration-300 group-hover:scale-110">
                      <PxlSparklesIcon className="h-5 w-5" />
                    </div>
                    <div className="text-[#107A4D] font-mono text-xs uppercase mb-2 font-bold">[ GOVERNANCE ]</div>
                    <h3 className="text-xl font-bold text-[#2A2A2A] mb-3 font-pixel-grid group-hover:text-[#107A4D] transition-colors">Feature Flags &amp; Multi-Org RBAC</h3>
                    <p className="text-sm text-[#6B7280] leading-relaxed">
                      Targeted user rollouts, environment toggles, percentage splits, instant kill-switches, and organization isolation bounds.
                    </p>
                  </Card>

                  <Card className="pxl-corner-md pxl-card-shadow border border-dashed border-[#D1D1D1] bg-[#FAFAFA] p-8 sm:p-10 group cursor-pointer transition-all duration-300 hover:bg-white hover:border-[#2563EB]/50">
                    <div className="h-10 w-10 pxl-corner-sm bg-[#DEE9FF] text-[#2563EB] flex items-center justify-center mb-5 border border-[#2563EB]/30 shadow-sm transition-transform duration-300 group-hover:scale-110">
                      <PxlShieldIcon className="h-5 w-5" />
                    </div>
                    <div className="text-[#107A4D] font-mono text-xs uppercase mb-2 font-bold">[ FINOPS &amp; WORKERS ]</div>
                    <h3 className="text-xl font-bold text-[#2A2A2A] mb-3 font-pixel-grid group-hover:text-[#107A4D] transition-colors">Cloud Cost Guards &amp; HA Workers</h3>
                    <p className="text-sm text-[#6B7280] leading-relaxed">
                      Prevent surprise cloud bills with speculative PR cost diffs, budget limits, and distributed Go worker daemon pools.
                    </p>
                  </Card>
                </div>
              </div>
            </section>

            {/* Dashed Separator Line */}
            <hr className="border-dashed border-[#D1D1D1] w-full" />

            {/* 4. FAQ SECTION */}
            <section id="faq" className="relative w-full py-16 sm:py-24">
              <div className="max-w-6xl mx-auto px-6 sm:px-12">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 lg:gap-16 items-start">
                  <div>
                    <div className="text-sm uppercase tracking-widest font-mono mb-2 text-[#107A4D]">
                      <TextScramble text="[ FREQUENTLY ASKED QUESTIONS ]" className="font-mono" />
                    </div>
                    <h2 className="text-[#2A2A2A] text-2xl sm:text-4xl font-bold font-sans tracking-tight leading-tight">
                      Frequently Asked Questions
                    </h2>
                    <p className="text-[#6B7280] text-xs sm:text-sm mt-3 leading-relaxed font-sans">
                      Questions regarding multi-cloud deployment, air-gapped security, feature flags, or custom OpenTofu modules.
                    </p>
                  </div>

                  <div className="lg:col-span-2">
                    {faqs.map((faq, index) => (
                      <FAQItem key={index} faq={faq} />
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </main>

          {/* Dashed Separator Line */}
          <hr className="border-dashed border-[#D1D1D1] w-full" />

          {/* 5. FOOTER (Full Width) */}
          <footer className="mt-auto w-full border-t border-[#D1D1D1] bg-[#F1EFEB]">
            <div className="max-w-7xl mx-auto px-6 sm:px-12 py-12 sm:py-16 flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-[#6B7280] font-mono">
              <div className="flex items-center gap-2">
                <span className="font-bold text-[#2A2A2A] font-pixel-grid">RADAS Platform</span>
                <span>&copy; 2026 GitOps Release.</span>
              </div>
              <div className="flex items-center gap-8">
                <a href="https://github.com/raizora/radas" target="_blank" rel="noreferrer" className="hover:text-[#2A2A2A]">GitHub</a>
                <Link to="/login" className="hover:text-[#2A2A2A] font-semibold text-[#2A2A2A] font-pixel-grid">Sign In to Console →</Link>
              </div>
            </div>
          </footer>
      </div>
    </div>
  );
}
