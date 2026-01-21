import { useState, useRef } from 'react'

interface TextScrambleProps {
  text: string
  className?: string
}

export function TextScramble({ text, className = '' }: TextScrambleProps) {
  const [displayText, setDisplayText] = useState(text)
  const isAnimating = useRef(false)

  const chars = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

  const scramble = () => {
    if (isAnimating.current) return
    isAnimating.current = true

    let iteration = 0
    const maxIterations = text.length * 3

    const interval = setInterval(() => {
      setDisplayText(
        text
          .split('')
          .map((char, index) => {
            if (char === ' ' || char === '[' || char === ']') {
              return char
            }

            const revealPoint = Math.floor(iteration / 3)
            if (index < revealPoint) {
              return text[index]
            }

            return chars[Math.floor(Math.random() * chars.length)]
          })
          .join('')
      )

      iteration++

      if (iteration >= maxIterations) {
        clearInterval(interval)
        setDisplayText(text)
        isAnimating.current = false
      }
    }, 30)
  }

  return (
    <span
      className={`cursor-pointer ${className}`}
      onMouseEnter={scramble}
    >
      {displayText}
    </span>
  )
}
