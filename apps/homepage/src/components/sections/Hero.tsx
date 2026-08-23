import { useState } from 'react'

export function Hero() {
  const [activeTab, setActiveTab] = useState('go')

  const installCommands = {
    go: 'go install github.com/raizora/radas/apps/cli@latest',
    pnpm: 'pnpm dlx @radas/cli create',
    curl: 'curl -fsSL https://radas.internal/install.sh | bash',
    docker: 'docker run -p 5001:5001 -p 8080:8080 radas/stack:latest',
  }

  return (
    <div className="h-full w-full" style={{ opacity: 1, transform: 'none' }}>
      <hr className="border-dashed border-border w-full" />
      <div className="relative w-full pt-12 sm:pt-16 pb-16">
        {/* Announcement Banner */}
        <div className="mb-12 sm:mb-16 flex items-center gap-2 text-sm px-4 sm:px-8">
          <span className="bg-primary text-white px-2 py-0.5 text-xs font-semibold font-mono">
            v3.2.0
          </span>
          <p className="text-primary font-mono text-xs sm:text-sm">
            Phase 6 complete: Feature Flags, BYOC Code Registry & Multi-Org Governance.{' '}
            <a
              href="http://localhost:8080"
              className="underline hover:text-greptile-green transition-colors"
            >
              Open Console →
            </a>
          </p>
        </div>

        {/* Main Content */}
        <div className="px-4 sm:px-8">
          {/* Title */}
          <h1 className="text-primary mb-6 text-3xl sm:text-5xl font-bold tracking-tight">
            The Enterprise Infrastructure & GitOps Platform
          </h1>

          {/* Subtitle */}
          <p className="text-tertiary text-base sm:text-lg mb-12 max-w-3xl">
            Unified OpenTofu & Ansible orchestration with private Bring-Your-Own-Code registries,
            real-time FinOps cost guards, feature flags, and distributed high-availability workers.
          </p>

          {/* Installation Section */}
          <div className="bg-surface border border-border rounded-lg overflow-hidden w-full">
            {/* Tabs */}
            <div className="flex border-b border-border">
              {Object.keys(installCommands).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-6 py-3 text-sm font-mono transition-colors ${activeTab === tab
                    ? 'bg-white text-primary border-b-2 border-primary font-semibold'
                    : 'text-tertiary hover:text-primary hover:bg-surface-dark'
                    }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Command */}
            <div className="p-6 bg-white">
              <div className="flex items-center justify-between gap-4">
                <code className="font-mono text-sm text-primary flex-1">
                  {installCommands[activeTab as keyof typeof installCommands]}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      installCommands[activeTab as keyof typeof installCommands]
                    )
                  }}
                  className="text-tertiary hover:text-primary transition-colors p-1"
                  aria-label="Copy to clipboard"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width={18}
                    height={18}
                    fill="currentColor"
                    viewBox="0 0 256 256"
                  >
                    <path d="M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
