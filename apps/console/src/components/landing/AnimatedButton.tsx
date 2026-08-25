import React from 'react'

interface AnimatedButtonProps {
  children: React.ReactNode
  variant?: 'light' | 'dark'
  href?: string
  className?: string
  onClick?: () => void
}

export function AnimatedButton({
  children,
  variant = 'light',
  href,
  className = '',
  onClick,
}: AnimatedButtonProps) {
  const baseStyles =
    'relative inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold font-mono transition-all duration-200 cursor-pointer overflow-hidden rounded-md'

  const variantStyles =
    variant === 'dark'
      ? 'bg-[var(--color-foreground)] text-[var(--color-background)] hover:bg-[var(--color-primary)] hover:text-white border border-[var(--color-border)]'
      : 'bg-[var(--color-primary)] text-white hover:opacity-90 border border-[var(--color-primary)]'

  const content = (
    <span className="relative z-10 flex items-center gap-2">{children}</span>
  )

  if (href) {
    return (
      <a href={href} className={`${baseStyles} ${variantStyles} ${className}`}>
        {content}
      </a>
    )
  }

  return (
    <button
      onClick={onClick}
      className={`${baseStyles} ${variantStyles} ${className}`}
    >
      {content}
    </button>
  )
}
