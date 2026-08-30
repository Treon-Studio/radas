import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
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
import { isDesktopApp } from "@/lib/desktopBridge";
import { bindMascotSpeech } from "@/lib/interactiveFavicon";
import { TextScramble } from "@/components/landing/TextScramble";
import { PxlCloudIcon, PxlCpuIcon, PxlSparklesIcon, PxlShieldIcon } from "@/components/ui/pxl-icons";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (isDesktopApp()) {
    }
  },
  component: WebLandingPage,
});

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
    <Card
      {...bindMascotSpeech(`FAQ: "${faq.question.slice(0, 35)}..."`)}
      className="pxl-corner-md pxl-card-shadow border border-dashed border-[#D1D1D1] bg-[#FAFAFA] p-5 mb-5 transition-all duration-300 hover:bg-white hover:border-[#107A4D]/50 group"
    >
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
          className={`h-5 w-5 text-[#6B7280] transition-transform duration-200 shrink-0 ${isOpen ? "rotate-180 text-[#107A4D]" : ""
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
  const [skyTab, setSkyTab] = useState(0);
  const [cardPill, setCardPill] = useState(2);

  useEffect(() => {
    if (isDesktopApp()) {
      const token = getToken();
      navigate({ to: token ? "/dashboard" : "/login", replace: true });
    }
    setIsAuth(!!getToken());
  }, [navigate]);

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
        {/* MAIN CONTENT AREA */}
        <main className="flex-1 w-full">
          {/* 2. HERO SECTION FULL WIDTH EDGE-TO-EDGE */}
          <section className="relative w-full overflow-hidden text-center h-[100vh]">
            {/* Background Pixel Landscape Layer (Full Width Animated Video Loop) */}
            <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
              <video
                autoPlay
                loop
                muted
                playsInline
                poster="/images/hero-pixel-landscape.webp"
                className="w-full h-full object-cover object-bottom pointer-events-none"
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
                  <Button
                    {...bindMascotSpeech("Let's launch into your cloud workspace! 🚀")}
                    className="pxl-corner-md pxl-btn-shadow bg-[#107A4D] text-white hover:bg-[#0e6640] font-bold font-pixel-grid text-sm px-7 py-3"
                  >
                    Open Console <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
                <a href="https://github.com/raizora/radas" target="_blank" rel="noreferrer">
                  <Button
                    {...bindMascotSpeech("Explore our open-source codebase on GitHub! 💻")}
                    variant="outline"
                    className="pxl-corner-md border-[#2A2A2A] bg-white text-[#2A2A2A] hover:bg-[#EBE8E2] font-mono text-sm px-6 py-3 shadow-sm"
                  >
                    <Github className="h-4 w-4 mr-2" /> View Source
                  </Button>
                </a>
              </div>
            </div>

            {/* Bottom Pixelated Foliage & Grass Fringe Transition */}
            <div
              className="absolute bottom-[-80px] left-0 right-0 w-full pointer-events-none z-20 overflow-hidden leading-none select-none"
              style={{
                WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.6) 20%, black 40%, black 100%)',
                maskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.6) 20%, black 40%, black 100%)',
              }}
            >
              <img
                src="/images/hero-pixel-bottom-fringe.webp"
                alt=""
                className="w-full h-24 sm:h-32 md:h-44 object-cover object-bottom pointer-events-none"
              />
            </div>
          </section>

          {/* 3. SHOWCASE SECTIONS (BORDERLESS FLOATING ISLAND PIXEL SHOWCASE) */}
          <section id="capabilities" className="relative w-full bg-[#F1EFEB] py-16 sm:py-28 text-[#2A2A2A] overflow-hidden">
            <div className="max-w-7xl mx-auto px-6 sm:px-12 space-y-24 sm:space-y-36">
              {/* SHOWCASE 1: Level up your GitOps (Craft Image Left, Text Right) */}
              <div
                {...bindMascotSpeech("Declarative OpenTofu & Ansible GitOps! ⚡")}
                className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center cursor-pointer"
              >
                {/* Left: Borderless Transparent Pixel Art Illustration */}
                <div className="lg:col-span-7 flex justify-center">
                  <div className="relative max-w-lg w-full transition-transform duration-300 hover:scale-105">
                    <img
                      src="/images/feature-island-gitops.webp"
                      alt="GitOps Developer & Blue Robot Floating Island"
                      className="w-full h-auto object-contain pointer-events-none drop-shadow-md"
                      style={{ imageRendering: "pixelated" }}
                    />
                  </div>
                </div>

                {/* Right: Copy & Title */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="text-xs uppercase tracking-widest font-mono text-[#107A4D] font-bold">
                    <TextScramble text="[ GITOPS ORCHESTRATION ]" className="font-mono" />
                  </div>
                  <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold font-pixel-grid uppercase tracking-wide leading-tight text-[#2A2A2A]">
                    Level up your GitOps
                  </h2>
                  <p className="text-[#6B7280] text-sm sm:text-base leading-relaxed font-sans">
                    Declarative OpenTofu plans and Ansible playbooks unified under a single control plane. Gain real-time streaming execution logs, automated Atlantis-style PR plan comments, and zero-telemetry air-gapped security.
                  </p>
                </div>
              </div>

              {/* SHOWCASE 2: Adopt Reusable Modules (Text Left, Craft Image Right) */}
              <div
                {...bindMascotSpeech("Copy & paste reusable cloud infra modules! 📦")}
                className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center cursor-pointer"
              >
                {/* Left: Copy & Title */}
                <div className="lg:col-span-5 space-y-4 order-2 lg:order-1">
                  <div className="text-xs uppercase tracking-widest font-mono text-[#CC9100] font-bold">
                    <TextScramble text="[ BYOC PRIVATE REGISTRY ]" className="font-mono" />
                  </div>
                  <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold font-pixel-grid uppercase tracking-wide leading-tight text-[#2A2A2A]">
                    Adopt reusable infra modules
                  </h2>
                  <p className="text-[#6B7280] text-sm sm:text-base leading-relaxed font-sans">
                    Shadcn-style adoption that copies reusable OpenTofu modules and Ansible roles directly into your stack repositories. Full code ownership, zero lock-in, and single-command registry syncing.
                  </p>
                </div>

                {/* Right: Borderless Transparent Pixel Art Illustration */}
                <div className="lg:col-span-7 flex justify-center order-1 lg:order-2">
                  <div className="relative max-w-lg w-full transition-transform duration-300 hover:scale-105">
                    <img
                      src="/images/feature-island-byoc.webp"
                      alt="BYOC Modular Code Registry Floating Island"
                      className="w-full h-auto object-contain pointer-events-none drop-shadow-md"
                      style={{ imageRendering: "pixelated" }}
                    />
                  </div>
                </div>
              </div>

              {/* SHOWCASE 3: FinOps Guardrails & Mission Control (Craft Image Left, Text Right) */}
              <div
                {...bindMascotSpeech("Real-time cloud pricing & budget anomaly alerts! 💰")}
                className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center cursor-pointer"
              >
                {/* Left: Borderless Transparent Pixel Art Illustration */}
                <div className="lg:col-span-7 flex justify-center">
                  <div className="relative max-w-lg w-full transition-transform duration-300 hover:scale-105">
                    <img
                      src="/images/feature-island-finops.webp"
                      alt="FinOps Cloud Cost Monitoring Floating Island"
                      className="w-full h-auto object-contain pointer-events-none drop-shadow-md"
                      style={{ imageRendering: "pixelated" }}
                    />
                  </div>
                </div>

                {/* Right: Copy & Title */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="text-xs uppercase tracking-widest font-mono text-[#2563EB] font-bold">
                    <TextScramble text="[ COST GUARDS & RBAC ]" className="font-mono" />
                  </div>
                  <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold font-pixel-grid uppercase tracking-wide leading-tight text-[#2A2A2A]">
                    Build with cost guardrails
                  </h2>
                  <p className="text-[#6B7280] text-sm sm:text-base leading-relaxed font-sans">
                    Prevent surprise cloud bills before merging with speculative PR cost diffs, budget limits, emergency kill-switches, and granular organization isolation bounds across multi-cloud deployments.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 3.5. SKY SYSTEMS & WORKFLOW SECTION */}
          <section className="relative w-full overflow-hidden bg-[#F1EFEB] py-20 sm:py-28 text-white select-none">
            {/* Background Gemini Unified Pixel Art Backdrop (Contains Native Top & Bottom Dithers) */}
            <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
              <img
                src="/images/section-sky-trees-backdrop.webp"
                alt=""
                className="w-full h-full object-cover object-center pointer-events-none"
                style={{ imageRendering: "pixelated" }}
              />
            </div>

            {/* Central Content Container */}
            <div className="relative z-10 max-w-5xl mx-auto px-6 sm:px-12 text-center">
              {/* Header Title */}
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight leading-tight text-white mb-4">
                All the tools and systems<br />your company needs
              </h2>

              {/* Subtitle */}
              <p className="text-blue-100/90 text-sm sm:text-base max-w-xl mx-auto font-sans leading-relaxed mb-10">
                Give agents the context, tools, and approvals they need to keep company work moving.
              </p>

              {/* 3 Interactive Pillar Tabs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto mb-12 text-left">
                {/* Tab 1 */}
                <button
                  onClick={() => setSkyTab(0)}
                  className={`p-4 rounded-xl transition-all cursor-pointer text-left border ${
                    skyTab === 0
                      ? "bg-white/20 border-white/40 shadow-lg text-white font-semibold backdrop-blur-sm"
                      : "bg-white/5 border-white/15 text-blue-100/80 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <p className="text-xs sm:text-sm leading-snug">
                    You stay in control, nothing ships without your approval
                  </p>
                </button>

                {/* Tab 2 */}
                <button
                  onClick={() => setSkyTab(1)}
                  className={`p-4 rounded-xl transition-all cursor-pointer text-left border ${
                    skyTab === 1
                      ? "bg-white/20 border-white/40 shadow-lg text-white font-semibold backdrop-blur-sm"
                      : "bg-white/5 border-white/15 text-blue-100/80 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <p className="text-xs sm:text-sm leading-snug">
                    Run multiple tasks in the background at the same time.
                  </p>
                </button>

                {/* Tab 3 */}
                <button
                  onClick={() => setSkyTab(2)}
                  className={`p-4 rounded-xl transition-all cursor-pointer text-left border ${
                    skyTab === 2
                      ? "bg-white/20 border-white/40 shadow-lg text-white font-semibold backdrop-blur-sm"
                      : "bg-white/5 border-white/15 text-blue-100/80 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <p className="text-xs sm:text-sm leading-snug">
                    Customize agents with apps, skills, and schedules
                  </p>
                </button>
              </div>

              {/* Floating UI Card Mockup */}
              <div className="max-w-3xl mx-auto bg-[#F0F5F8] p-4 sm:p-6 rounded-3xl shadow-2xl border-4 border-white/30 text-[#2A2A2A] text-left">
                {/* Pill Nav Tabs inside Mockup */}
                <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-4 border-b border-[#E2E8F0]">
                  {[
                    "Enrich contacts",
                    "Research contacts",
                    "Send Outreach Emails",
                    "Campaigns",
                  ].map((label, idx) => (
                    <button
                      key={label}
                      onClick={() => setCardPill(idx)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                        cardPill === idx
                          ? "bg-white shadow-xs text-[#2A2A2A]"
                          : "text-[#64748B] hover:text-[#2A2A2A]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Inner Preview Content Panel */}
                <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-[#E2E8F0] space-y-4">
                  <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-3">
                    <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-[#1E293B]">
                      <span className="p-1 rounded bg-[#FEE2E2] text-[#DC2626]">✉</span> Email Preview
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
                      <span className="cursor-pointer hover:text-[#475569]">&lsaquo;</span>
                      <span className="cursor-pointer hover:text-[#475569]">&rsaquo;</span>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex items-center gap-4 py-1 border-b border-[#F8FAFC]">
                      <span className="text-[#94A3B8] w-12 shrink-0">To</span>
                      <span className="font-semibold text-[#1E293B]">Sarah Chen</span>
                      <span className="text-[#64748B]">sarah@acme.com</span>
                    </div>
                    <div className="flex items-center gap-4 py-1 border-b border-[#F8FAFC]">
                      <span className="text-[#94A3B8] w-12 shrink-0">From</span>
                      <span className="font-semibold text-[#1E293B]">Tanner Holloway</span>
                      <span className="text-[#64748B]">tanner.holloway@ridgepoint.io</span>
                    </div>
                    <div className="flex items-center gap-4 py-1">
                      <span className="text-[#94A3B8] w-12 shrink-0">Subject</span>
                      <span className="font-semibold text-[#1E293B]">Thought you could use SignalLayer for Acme</span>
                    </div>
                  </div>

                  <div className="pt-2 text-xs sm:text-sm text-[#475569] leading-relaxed font-sans border-t border-[#F1F5F9] space-y-2">
                    <p>Hey Sarah,</p>
                    <p>
                      I've been following how quickly your team at Acme has been shipping, going from a single product to a full suite in under a year is seriously impressive.
                    </p>
                    <p>
                      At Ridgepoint, we're building SignalLayer, a platform that helps teams unify and act on real-time customer and product data across their stack. Instead of jumping between tools, SignalLayer surfaces actionable insights right into your workflow.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

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

        {/* 5. FOOTER (Minimal Pixel Meadow Grass Footer) */}
        <footer className="relative mt-auto w-full overflow-hidden select-none">
          {/* Background Pixel Grass Texture */}
          <div className="absolute inset-0 z-0 pointer-events-none">
            <img
              src="/images/footer-pixel-grass.webp"
              alt=""
              className="w-full h-full object-cover object-top pointer-events-none"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>

          {/* Minimalist Centered Footer Content */}
          <div className="relative z-10 max-w-4xl mx-auto px-4 pt-16 sm:pt-20 pb-8 sm:pb-10 flex items-center justify-center text-center">
            <p className="text-xs sm:text-sm text-[#2E6B27] font-mono flex items-center justify-center gap-1.5 font-medium tracking-tight">
              Made with
              <svg className="w-3.5 h-3.5 inline-block text-[#2E6B27] shrink-0" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 2h2v2H4V2zm6 0h2v2h-2V2zM2 4h2v2H2V4zm6 2h2V4H8v2zm6-2h2v2h-2V4zM0 6h2v4H0V6zm14 0h2v4h-2V6zM2 10h2v2H2v-2zm12 0h-2v2h2v-2zm-4 2h2v2h-2v-2zM4 12h2v2H4v-2zm2 2h4v2H6v-2z" />
              </svg>
              by <span className="hover:text-[#1A4515] transition-colors">Treon Studio</span>
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
