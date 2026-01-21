import { useState } from 'react'

export function Hero() {
  const [activeTab, setActiveTab] = useState('curl')

  const installCommands = {
    curl: 'curl -fsSL https://opencode.ai/install | bash',
    npm: 'npm install -g opencode',
    bun: 'bun install -g opencode',
    brew: 'brew install opencode',
    paru: 'paru -S opencode',
  }

  return (
    <div className="h-full w-full" style={{ opacity: 1, transform: 'none' }}>
      <hr className="border-dashed border-border w-full" />
      <div className="relative w-full pt-12 sm:pt-16 pb-16">
        {/* Announcement Banner */}
        <div className="mb-12 sm:mb-16 flex items-center gap-2 text-sm px-4 sm:px-8">
          <span className="bg-primary text-white px-2 py-0.5 text-xs font-semibold">
            New
          </span>
          <p className="text-primary font-mono text-xs sm:text-sm">
            Desktop app available in beta on macOS, Windows, and Linux.{' '}
            <a
              href="#download"
              className="underline hover:text-greptile-green transition-colors"
            >
              Download now
            </a>
          </p>
        </div>

        {/* Main Content */}
        <div className="px-4 sm:px-8">
          {/* Title */}
          <h1 className="text-primary mb-6">
            The open source AI coding agent
          </h1>

          {/* Subtitle */}
          <p className="text-tertiary text-base sm:text-lg mb-12">
            Free models included or connect any model from any provider,
            including Claude, GPT, Gemini and more.
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
                    ? 'bg-white text-primary border-b-2 border-primary'
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
                  className="text-tertiary hover:text-primary transition-colors"
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
