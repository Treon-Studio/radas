export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="w-full">
      {/* Top Row - Navigation Links */}
      <div className="w-full">
        <div className="grid grid-cols-2 md:grid-cols-4 border-t border-border">
          <a
            href="https://github.com/raizora/radas"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-6 text-center border-b border-r border-border text-tertiary hover:text-primary hover:bg-surface/50 transition-all font-mono text-sm"
          >
            GitHub
          </a>
          <a
            href="http://localhost:8080"
            className="px-6 py-6 text-center border-b md:border-r border-border text-tertiary hover:text-primary hover:bg-surface/50 transition-all font-mono text-sm"
          >
            Console
          </a>
          <a
            href="/docs"
            className="px-6 py-6 text-center border-b border-r border-border text-tertiary hover:text-primary hover:bg-surface/50 transition-all font-mono text-sm"
          >
            Docs
          </a>
          <a
            href="/changelog"
            className="px-6 py-6 text-center border-b border-border text-tertiary hover:text-primary hover:bg-surface/50 transition-all font-mono text-sm md:col-span-1 col-span-2"
          >
            Changelog
          </a>
        </div>
      </div>

      {/* Bottom Row - Copyright & Legal */}
      <div className="w-full bg-background">
        <div className="px-6 py-8">
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-tertiary font-mono">
            <a href="/" className="hover:text-primary transition-colors">
              ©{currentYear} treonstudio · RADAS
            </a>
            <a href="/privacy" className="hover:text-primary transition-colors">
              Privacy
            </a>
            <a href="/terms" className="hover:text-primary transition-colors">
              Terms
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
