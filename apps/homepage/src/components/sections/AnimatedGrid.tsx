import { useEffect, useState, useRef } from 'react'

const CELL_SIZE = 20
const ROWS = 7

const colors = [
  'bg-greptile-green opacity-40',
  'bg-greptile-yellow opacity-40',
  'bg-greptile-yellow opacity-50',
  'bg-greptile-orange opacity-40',
  'bg-greptile-orange opacity-50',
  'bg-greptile-pink opacity-40',
  'bg-greptile-pink opacity-50',
]

export function AnimatedGrid() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(80)
  const [coloredCells, setColoredCells] = useState<Map<number, string>>(new Map())

  useEffect(() => {
    const updateCols = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth
        const newCols = Math.ceil(width / CELL_SIZE)
        setCols(newCols)
      }
    }

    updateCols()
    window.addEventListener('resize', updateCols)
    return () => window.removeEventListener('resize', updateCols)
  }, [])

  useEffect(() => {
    const initial = new Map<number, string>()
    for (let i = 0; i < 12; i++) {
      const index = Math.floor(Math.random() * cols * ROWS)
      initial.set(index, colors[Math.floor(Math.random() * colors.length)])
    }
    setColoredCells(initial)

    const interval = setInterval(() => {
      setColoredCells(prev => {
        const next = new Map(prev)

        const keys = Array.from(next.keys())
        if (keys.length > 0 && Math.random() > 0.3) {
          const removeIndex = keys[Math.floor(Math.random() * keys.length)]
          next.delete(removeIndex)
        }

        if (next.size < 15 && Math.random() > 0.2) {
          const newIndex = Math.floor(Math.random() * cols * ROWS)
          if (!next.has(newIndex)) {
            next.set(newIndex, colors[Math.floor(Math.random() * colors.length)])
          }
        }

        return next
      })
    }, 400)

    return () => clearInterval(interval)
  }, [cols])

  return (
    <div ref={containerRef} className="w-full overflow-hidden">
      <div
        className="relative w-full"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, ${CELL_SIZE}px)`,
          gridTemplateRows: `repeat(${ROWS}, ${CELL_SIZE}px)`,
          gap: 0,
        }}
      >
        {Array.from({ length: cols * ROWS }, (_, i) => {
          const colorClass = coloredCells.get(i)
          return (
            <div
              key={i}
              className={`border-[0.5px] border-border/40 transition-all duration-500 ${colorClass || ''}`}
              style={{ width: CELL_SIZE, height: CELL_SIZE }}
            />
          )
        })}
      </div>
    </div>
  )
}
