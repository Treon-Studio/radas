import { ReactNode } from 'react'

interface AnimatedButtonProps {
  children: ReactNode
  variant?: 'primary' | 'dark'
  className?: string
  href?: string
  onClick?: () => void
}

export function AnimatedButton({
  children,
  variant = 'primary',
  className = '',
  href,
  onClick
}: AnimatedButtonProps) {
  const bgColor = variant === 'primary' ? 'bg-greptile-green' : 'bg-greptile-dark-green'

  // Generate horizontal lines (8 lines at top: 8, 16, 24, 32, 40, 48, 56, 64)
  const horizontalLines = Array.from({ length: 8 }, (_, i) => ({
    top: (i + 1) * 8,
    delay: (i + 1) * 30
  }))

  // Generate vertical lines (many lines at left: 8, 16, 24, ... up to ~80 to cover button width)
  const verticalLines = Array.from({ length: 80 }, (_, i) => ({
    left: (i + 1) * 8,
    delay: 220 + i * 20
  }))

  const buttonContent = (
    <button
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-mono font-normal tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:flex-shrink-0 box-border ${bgColor} text-white shadow-sm h-9 px-4 py-2 relative overflow-hidden group ${className}`}
    >
      {/* Animated grid lines overlay */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Horizontal lines */}
        {horizontalLines.map((line, index) => (
          <div
            key={`h-${index}`}
            className="absolute left-0 h-[1px] w-0 bg-white/15 group-hover:w-full transition-all duration-500 ease-out"
            style={{ top: line.top, transitionDelay: `${line.delay}ms` }}
          />
        ))}
        {/* Vertical lines */}
        {verticalLines.map((line, index) => (
          <div
            key={`v-${index}`}
            className="absolute top-0 w-[1px] h-0 bg-white/15 group-hover:h-full transition-all duration-500 ease-out"
            style={{ left: line.left, transitionDelay: `${line.delay}ms` }}
          />
        ))}
      </div>
      <span className="relative z-10 inline-flex items-center gap-2 whitespace-nowrap">
        {children}
      </span>
    </button>
  )

  if (href) {
    return (
      <a href={href} className="w-full">
        {buttonContent}
      </a>
    )
  }

  return buttonContent
}
