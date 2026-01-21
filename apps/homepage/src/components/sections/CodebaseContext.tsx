import { AnimatedButton } from '@/components/ui/AnimatedButton'
import { useEffect, useState } from 'react'

const labels = [
  { text: 'postgresql', color: '#B45309' },
  { text: 'auth_request_headers()', color: '#DC2626' },
  { text: 'remote_api_call()', color: '#DC2626' },
  { text: 'redis_cache', color: '#B45309' },
  { text: 'user_session()', color: '#DC2626' },
  { text: 'api_gateway', color: '#B45309' },
  { text: 'validate_token()', color: '#DC2626' },
  { text: 'mongodb', color: '#B45309' },
  { text: 'send_email()', color: '#DC2626' },
  { text: 'aws_lambda', color: '#B45309' },
]

// Generate random nodes for neural network effect
const generateNodes = () => {
  const nodes: Array<{ x: number; y: number; r: number; color: string; delay: number }> = []
  const colors = ['#DC2626', '#B45309', '#DB2777']

  for (let i = 0; i < 80; i++) {
    const angle = Math.random() * Math.PI * 2
    const distance = 50 + Math.random() * 180
    nodes.push({
      x: 250 + Math.cos(angle) * distance,
      y: 250 + Math.sin(angle) * distance,
      r: 3 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 3
    })
  }
  return nodes
}

// Generate edges connecting nearby nodes
const generateEdges = (nodes: Array<{ x: number; y: number }>) => {
  const edges: Array<{ x1: number; y1: number; x2: number; y2: number }> = []

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dist = Math.sqrt(
        Math.pow(nodes[i].x - nodes[j].x, 2) +
        Math.pow(nodes[i].y - nodes[j].y, 2)
      )
      if (dist < 80 && Math.random() > 0.5) {
        edges.push({
          x1: nodes[i].x,
          y1: nodes[i].y,
          x2: nodes[j].x,
          y2: nodes[j].y
        })
      }
    }
  }
  return edges
}

const staticNodes = generateNodes()
const staticEdges = generateEdges(staticNodes)

export function CodebaseContext() {
  const [visibleLabels, setVisibleLabels] = useState<Array<{ text: string; color: string; x: number; y: number; opacity: number }>>([])

  useEffect(() => {
    const interval = setInterval(() => {
      setVisibleLabels(prev => {
        // Remove labels with opacity <= 0
        const filtered = prev
          .map(l => ({ ...l, opacity: l.opacity - 0.1 }))
          .filter(l => l.opacity > 0)

        // Add new label randomly
        if (Math.random() > 0.3 && filtered.length < 4) {
          const randomLabel = labels[Math.floor(Math.random() * labels.length)]
          const angle = Math.random() * Math.PI * 2
          const distance = 80 + Math.random() * 120
          filtered.push({
            ...randomLabel,
            x: 250 + Math.cos(angle) * distance,
            y: 250 + Math.sin(angle) * distance,
            opacity: 1
          })
        }

        return filtered
      })
    }, 500)

    return () => clearInterval(interval)
  }, [])

  return (
    <>
      <hr className="border-dashed border-border w-full" />
      <div className="overflow-hidden relative bg-greptile-green/20">
        <div className="absolute inset-0 bg-grid-pattern" />
        <div className="section-wrapper relative">
          <div className="mx-auto grid max-w-2xl grid-cols-1 gap-x-8 gap-y-8 sm:gap-y-12 lg:mx-0 lg:max-w-none lg:grid-cols-2 h-full min-h-[400px]">
            {/* Left - Text content */}
            <div className="flex flex-col justify-center h-full space-y-4">
              <section className="w-full">
                <div className="lg:max-w-lg">
                  <div className="text-left">
                    <div className="text-base uppercase tracking-widest font-light mb-2 text-greptile-green">
                      <span className="font-mono">[ 30+ languages supported ]</span>
                    </div>
                    <h2 className="text-primary">
                      Full Codebase Context
                    </h2>
                    <p className="text-tertiary font-mono mt-2">
                      Greptile generates a detailed graph of your codebase and understands how everything fits together. Better understanding of your codebase = more bugs caught.
                    </p>
                  </div>
                </div>
              </section>
              <div>
                <AnimatedButton variant="primary" href="/code-context">
                  <span className="font-mono">&lt;/&gt;</span>
                  Learn more
                </AnimatedButton>
              </div>
            </div>

            {/* Right - Neural Network Graph visualization */}
            <div className="flex items-center justify-center relative min-h-[400px] lg:min-h-[500px]">
              <svg
                viewBox="0 0 500 500"
                className="w-full h-full max-w-[500px]"
                style={{ overflow: 'visible' }}
              >
                <defs>
                  <filter id="glow">
                    <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                    <feMerge>
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </defs>

                <style>
                  {`
                    @keyframes nodeFloat {
                      0%, 100% {
                        transform: translate(0, 0);
                      }
                      25% {
                        transform: translate(2px, -3px);
                      }
                      50% {
                        transform: translate(-1px, 2px);
                      }
                      75% {
                        transform: translate(-2px, -1px);
                      }
                    }
                    @keyframes nodePulse {
                      0%, 100% {
                        opacity: 0.8;
                        transform: scale(1);
                      }
                      50% {
                        opacity: 1;
                        transform: scale(1.1);
                      }
                    }
                    @keyframes edgeFlow {
                      0% {
                        stroke-dashoffset: 20;
                        opacity: 0.2;
                      }
                      50% {
                        opacity: 0.5;
                      }
                      100% {
                        stroke-dashoffset: 0;
                        opacity: 0.2;
                      }
                    }
                    .network-node {
                      animation: nodePulse 2s ease-in-out infinite, nodeFloat 4s ease-in-out infinite;
                    }
                    .network-edge {
                      stroke-dasharray: 5, 5;
                      animation: edgeFlow 3s linear infinite;
                    }
                  `}
                </style>

                {/* Edges */}
                <g>
                  {staticEdges.map((edge, i) => (
                    <line
                      key={i}
                      x1={edge.x1}
                      y1={edge.y1}
                      x2={edge.x2}
                      y2={edge.y2}
                      stroke="#6B7280"
                      strokeWidth="0.5"
                      className="network-edge"
                      style={{ animationDelay: `${i * 0.05}s` }}
                    />
                  ))}
                </g>

                {/* Nodes */}
                <g filter="url(#glow)">
                  {staticNodes.map((node, i) => (
                    <circle
                      key={i}
                      cx={node.x}
                      cy={node.y}
                      r={node.r}
                      fill={node.color}
                      className="network-node"
                      style={{
                        animationDelay: `${node.delay}s`,
                        transformOrigin: `${node.x}px ${node.y}px`
                      }}
                    />
                  ))}
                </g>

                {/* Animated Labels */}
                <g fontFamily="monospace" fontSize="9">
                  {visibleLabels.map((label, i) => (
                    <g
                      key={i}
                      style={{
                        opacity: label.opacity,
                        transition: 'opacity 0.3s ease-out'
                      }}
                    >
                      <rect
                        x={label.x - (label.text.length * 3)}
                        y={label.y - 8}
                        width={label.text.length * 6 + 6}
                        height="16"
                        fill={label.color}
                        style={{ boxShadow: `0 0 8px ${label.color}40` }}
                      />
                      <text
                        x={label.x + 3}
                        y={label.y + 4}
                        fill="white"
                        textAnchor="middle"
                      >
                        {label.text}
                      </text>
                    </g>
                  ))}
                </g>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
