import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  RiCheckLine as Check,
  RiFileCopyLine as Copy,
  RiArrowRightLine as ArrowRight,
  RiGithubFill as Github,
} from "@remixicon/react";
import { RadasLogo } from "@/components/common/RadasLogo";
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
      description: "Execute declarative infrastructure plans, applies, and Ansible playbooks with live streamed logs",
    },
    {
      title: "BYOC Code Registry",
      description: "Shadcn-style adoption for reusable OpenTofu modules and Ansible roles directly into your stacks",
    },
    {
      title: "Targeted Feature Flags",
      description: "Granular user whitelist, environment toggles, percentage rollouts, and instant emergency kill-switches",
    },
    {
      title: "FinOps & Cloud Cost Protection",
      description: "Real-time multi-cloud cost anomaly detection, monthly budget alerts, and speculative PR cost diffs",
    },
    {
      title: "High-Availability Workers",
      description: "Distributed Go worker daemon pool with heartbeat tracking, graceful draining, and round-robin fair queue scheduling",
    },
    {
      title: "Atlantis GitOps PR Automation",
      description: "Automated GitHub/GitLab pull request plan diff comments, pre-apply validation hooks, and multi-check merge gates",
    },
    {
      title: "Enterprise Multi-Org & SAML SSO",
      description: "Organization tenant boundaries, SAML 2.0 XML assertion login, audit logging, and automated compliance evidence exports",
    },
  ];

  return (
    <div className="min-h-screen bg-[#F1EFEB] text-[#2A2A2A] font-mono relative selection:bg-[#107A4D] selection:text-white">
      {/* Background Radial Grid Dot Pattern */}
      <div
        className="fixed inset-0 pointer-events-none opacity-30 z-0"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(0, 0, 0, 0.12) 1px, transparent 1px)",
          backgroundSize: "8px 8px",
        }}
      />

      {/* Main Outer Container with Outer Bounds */}
      <div className="relative z-10 mx-auto w-full max-w-[1550px]">
        {/* Main Frame with Side Borders border-x border-[#D1D1D1] */}
        <div className="border-x border-[#D1D1D1] mx-4 sm:mx-12 md:mx-12 lg:mx-32 xl:mx-40 min-h-screen flex flex-col bg-[#F1EFEB]">
          
          {/* 1. NAVBAR */}
          <nav className="flex items-center justify-between px-4 sm:px-8 py-5 border-b border-[#D1D1D1] bg-[#F1EFEB]">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-[#2A2A2A] text-white rounded">
                <RadasLogo size={20} />
              </div>
              <span className="font-bold text-lg tracking-tight font-mono text-[#2A2A2A]">RADAS</span>
            </div>

            <div className="flex items-center gap-6 text-xs sm:text-sm font-mono text-[#6B7280]">
              <a href="https://github.com/raizora/radas" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-[#107A4D] transition-colors">
                <Github className="h-4 w-4" /> GitHub
              </a>
              <a href="#overview" className="hover:text-[#107A4D] transition-colors hidden sm:inline">Overview</a>
              <a href="#features" className="hover:text-[#107A4D] transition-colors hidden sm:inline">Capabilities</a>
              {isAuth ? (
                <button
                  onClick={() => navigate({ to: "/dashboard" })}
                  className="bg-[#107A4D] text-white px-4 py-2 text-xs font-semibold hover:bg-opacity-90 transition-all font-mono rounded"
                >
                  Open Console →
                </button>
              ) : (
                <Link
                  to="/login"
                  className="bg-[#2A2A2A] text-white px-4 py-2 text-xs font-semibold hover:bg-opacity-90 transition-all font-mono rounded"
                >
                  Sign In →
                </Link>
              )}
            </div>
          </nav>

          {/* 2. HERO SECTION */}
          <section className="relative w-full pt-12 sm:pt-16 pb-16">
            {/* Announcement Banner */}
            <div className="mb-10 sm:mb-14 flex items-center gap-2 text-sm px-4 sm:px-8">
              <span className="bg-[#2A2A2A] text-white px-2 py-0.5 text-xs font-semibold font-mono">
                v3.2.0
              </span>
              <p className="text-[#2A2A2A] font-mono text-xs sm:text-sm">
                Phase 6 complete: Feature Flags, BYOC Code Registry &amp; Multi-Org Governance.{" "}
                <Link to="/login" className="underline hover:text-[#107A4D] transition-colors">
                  Open Console →
                </Link>
              </p>
            </div>

            {/* Main Hero Content */}
            <div className="px-4 sm:px-8">
              {/* Title */}
              <h1 className="text-[#2A2A2A] mb-6 text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-none">
                The Enterprise Infrastructure &amp; GitOps Platform
              </h1>

              {/* Subtitle */}
              <p className="text-[#6B7280] text-base sm:text-lg mb-12 max-w-3xl leading-relaxed">
                Unified OpenTofu &amp; Ansible orchestration with private Bring-Your-Own-Code registries, real-time FinOps cost guards, feature flags, and distributed high-availability workers.
              </p>

              {/* Installation Command Switcher Box */}
              <div className="bg-[#FAFAFA] border border-[#D1D1D1] rounded-lg overflow-hidden w-full max-w-4xl shadow-sm">
                {/* Tabs */}
                <div className="flex border-b border-[#D1D1D1] bg-[#F5F5F5]">
                  {(["go", "pnpm", "curl", "docker"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-6 py-3 text-xs sm:text-sm font-mono uppercase transition-colors ${
                        activeTab === tab
                          ? "bg-white text-[#2A2A2A] border-b-2 border-[#2A2A2A] font-semibold"
                          : "text-[#6B7280] hover:text-[#2A2A2A] hover:bg-[#EBE8E2]"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {/* Command Line */}
                <div className="p-6 bg-white flex items-center justify-between gap-4 font-mono text-xs sm:text-sm text-[#2A2A2A]">
                  <code className="flex-1 break-all">${installCommands[activeTab]}</code>
                  <button
                    onClick={handleCopy}
                    className="text-[#6B7280] hover:text-[#2A2A2A] transition-colors p-1"
                    aria-label="Copy to clipboard"
                  >
                    {copied ? <Check className="h-4 w-4 text-[#107A4D]" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Dashed Separator Line */}
          <hr className="border-dashed border-[#D1D1D1] w-full" />

          {/* 3. PLATFORM OVERVIEW SECTION */}
          <section id="overview" className="relative w-full py-16 sm:py-20">
            <div className="px-4 sm:px-8">
              {/* Section Label */}
              <div className="text-sm uppercase tracking-widest font-mono mb-2 text-[#107A4D]">
                <TextScramble text="[ PLATFORM OVERVIEW ]" className="font-mono" />
              </div>

              {/* Title */}
              <h2 className="text-[#2A2A2A] mb-6 text-2xl sm:text-4xl font-bold">
                What is RADAS?
              </h2>

              {/* Description */}
              <p className="text-[#6B7280] text-base sm:text-lg mb-8 max-w-3xl leading-relaxed">
                RADAS is an open, self-hosted infrastructure platform that brings the developer experience of modern software delivery to cloud engineering and systems automation.
              </p>

              {/* Features List */}
              <div className="space-y-4 mb-10">
                {overviewFeatures.map((feature, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <span className="text-[#6B7280] text-sm font-mono flex-shrink-0">[*]</span>
                    <p className="text-[#6B7280] text-sm sm:text-base leading-relaxed">
                      <span className="text-[#2A2A2A] font-semibold">{feature.title}</span>
                      <span className="ml-2">— {feature.description}</span>
                    </p>
                  </div>
                ))}
              </div>

              {/* CTA Button */}
              <Link
                to="/login"
                className="inline-flex items-center gap-2 bg-[#2A2A2A] text-white px-5 py-2.5 text-sm font-medium hover:bg-opacity-90 transition-all font-mono rounded"
              >
                Explore RADAS Console <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>

          {/* Dashed Separator Line */}
          <hr className="border-dashed border-[#D1D1D1] w-full" />

          {/* 4. CORE CAPABILITIES SECTION */}
          <section id="features" className="relative w-full py-16 sm:py-20">
            <div className="px-4 sm:px-8">
              <div className="text-sm uppercase tracking-widest font-mono mb-2 text-[#107A4D]">
                <TextScramble text="[ CORE CAPABILITIES ]" className="font-mono" />
              </div>
              <h2 className="text-[#2A2A2A] mb-4 text-2xl sm:text-4xl font-bold">
                Everything you need for infrastructure delivery.
              </h2>
              <p className="text-[#6B7280] text-base mb-10 max-w-3xl">
                RADAS provides unified orchestration, governance, cost control, and code reusability.
              </p>

              {/* Grid with Dashed Border Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="border border-dashed border-[#D1D1D1] p-6 bg-[#FAFAFA] rounded-lg">
                  <div className="text-[#107A4D] font-mono text-xs uppercase mb-2">[ ORCHESTRATION ]</div>
                  <h3 className="text-lg font-bold text-[#2A2A2A] mb-2">Declarative OpenTofu &amp; Ansible</h3>
                  <p className="text-sm text-[#6B7280] leading-relaxed">
                    Execute complex multi-cloud deployments with real-time log streaming, state management, and failover protection.
                  </p>
                </div>

                <div className="border border-dashed border-[#D1D1D1] p-6 bg-[#FAFAFA] rounded-lg">
                  <div className="text-[#107A4D] font-mono text-xs uppercase mb-2">[ REUSABILITY ]</div>
                  <h3 className="text-lg font-bold text-[#2A2A2A] mb-2">BYOC Private Code Registry</h3>
                  <p className="text-sm text-[#6B7280] leading-relaxed">
                    Instantly import and adopt verified OpenTofu modules and Ansible roles directly into your stacks with single-line imports.
                  </p>
                </div>

                <div className="border border-dashed border-[#D1D1D1] p-6 bg-[#FAFAFA] rounded-lg">
                  <div className="text-[#107A4D] font-mono text-xs uppercase mb-2">[ GOVERNANCE ]</div>
                  <h3 className="text-lg font-bold text-[#2A2A2A] mb-2">Feature Flags &amp; Multi-Org RBAC</h3>
                  <p className="text-sm text-[#6B7280] leading-relaxed">
                    Targeted user rollouts, environment toggles, percentage splits, SAML SSO, and organization isolation bounds.
                  </p>
                </div>

                <div className="border border-dashed border-[#D1D1D1] p-6 bg-[#FAFAFA] rounded-lg">
                  <div className="text-[#107A4D] font-mono text-xs uppercase mb-2">[ FINOPS ]</div>
                  <h3 className="text-lg font-bold text-[#2A2A2A] mb-2">Cloud Cost Guards &amp; Anomaly Detection</h3>
                  <p className="text-sm text-[#6B7280] leading-relaxed">
                    Prevent surprise cloud bills with speculative PR cost diffs, budget limits, and token compression proxy support.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Dashed Separator Line */}
          <hr className="border-dashed border-[#D1D1D1] w-full" />

          {/* 5. FOOTER */}
          <footer className="mt-auto px-4 sm:px-8 py-8 border-t border-[#D1D1D1] bg-[#F1EFEB] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#6B7280] font-mono">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#2A2A2A]">RADAS Platform</span>
              <span>&copy; 2026 Enterprise Release.</span>
            </div>
            <div className="flex items-center gap-6">
              <a href="https://github.com/raizora/radas" target="_blank" rel="noreferrer" className="hover:text-[#2A2A2A]">GitHub</a>
              <Link to="/login" className="hover:text-[#2A2A2A] font-semibold text-[#2A2A2A]">Sign In to Console →</Link>
            </div>
          </footer>

        </div>
      </div>
    </div>
  );
}
