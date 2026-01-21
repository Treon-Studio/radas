import { AnimatedButton } from '@/components/ui/AnimatedButton'
import { TextScramble } from '@/components/ui/TextScramble'

export function Results() {
  return (
    <>
      <hr className="border-dashed border-border w-full" />
      <div className="section-wrapper">
        {/* Section header */}
        <div className="space-y-6">
          <section className="w-full">
            <div className="text-center">
              <div className="text-base uppercase tracking-widest font-light mb-2 text-greptile-green">
                <TextScramble text="[ DATA-DRIVEN RESULTS ]" className="font-mono" />
              </div>
              <h2 className="text-primary">
                Merge PRs faster with Greptile.
              </h2>
            </div>
          </section>
          <div className="text-center">
            <AnimatedButton variant="dark" href="/performance">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width={16}
                height={16}
                fill="currentColor"
                viewBox="0 0 256 256"
              >
                <path d="M232,208a8,8,0,0,1-8,8H32a8,8,0,0,1-8-8V48a8,8,0,0,1,16,0V156.69l50.34-50.35a8,8,0,0,1,11.32,0L128,132.69,180.69,80H160a8,8,0,0,1,0-16h40a8,8,0,0,1,8,8v40a8,8,0,0,1-16,0V91.31l-58.34,58.35a8,8,0,0,1-11.32,0L96,123.31,40,179.31V200H224A8,8,0,0,1,232,208Z" />
              </svg>
              View performance data
            </AnimatedButton>
          </div>
        </div>
      </div>

      {/* Stats with dashed borders */}
      <div className="w-full">
        <div className="relative border-t border-b border-dashed border-border px-4 md:px-8 py-8">
          <div className="relative">
            {/* Extended dashed borders */}
            <div className="hidden md:block absolute top-0 -left-8 -right-8 border-t border-dashed border-border" />
            <div className="hidden md:block absolute bottom-0 -left-8 -right-8 border-b border-dashed border-border" />
            <div className="hidden md:block absolute left-0 -top-8 -bottom-8 border-l border-dashed border-border" />
            <div className="hidden md:block absolute right-0 -top-8 -bottom-8 border-r border-dashed border-border" />

            {/* Vertical center divider */}
            <div className="hidden md:block absolute left-1/2 -top-8 -bottom-8 w-8 -translate-x-1/2 pointer-events-none z-10">
              <div className="absolute left-0 top-0 bottom-0 border-l border-dashed border-border" />
              <div className="absolute right-0 top-0 bottom-0 border-l border-dashed border-border" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
              {/* Left side - Bar chart comparison */}
              <div className="pr-0 md:pr-4">
                <div className="relative py-4">
                  <div className="mb-8 sm:mb-4">
                    <div className="w-full py-2 bg-greptile-green/10 rounded-lg">
                      <div className="flex items-center justify-center gap-2 text-sm font-mono font-medium text-primary">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width={16}
                          height={16}
                          fill="currentColor"
                          viewBox="0 0 256 256"
                        >
                          <path d="M208,112a32.05,32.05,0,0,0-30.69,23l-42.21-6a8,8,0,0,1-4.95-2.71L94.43,84.55A32,32,0,1,0,72,87v82a32,32,0,1,0,16,0V101.63l30,35a24,24,0,0,0,14.83,8.14l44,6.28A32,32,0,1,0,208,112ZM64,56A16,16,0,1,1,80,72,16,16,0,0,1,64,56ZM96,200a16,16,0,1,1-16-16A16,16,0,0,1,96,200Zm112-40a16,16,0,1,1,16-16A16,16,0,0,1,208,160Z" />
                        </svg>
                        Median Time to Merge Comparison
                      </div>
                    </div>
                  </div>

                  <div className="h-80 sm:h-96 relative">
                    <div className="absolute inset-0" style={{ padding: '20px 20px 40px 50px' }}>
                      <div
                        className="hidden sm:block absolute text-secondary font-mono text-xs"
                        style={{
                          left: '-15px',
                          top: '50%',
                          transform: 'translateY(-50%) rotate(-90deg)',
                          transformOrigin: 'center'
                        }}
                      >
                        Hours to Merge
                      </div>
                      <div className="h-full w-full relative">
                        <div className="h-full relative border-l border-b border-border">
                          <div className="absolute bottom-0 left-0 right-0 flex items-end justify-center h-full gap-6 sm:gap-12 px-4 sm:px-8">
                            {/* Without Greptile */}
                            <div className="flex flex-col items-center justify-end max-w-[80px] sm:max-w-[120px]">
                              <span className="text-[10px] sm:text-xs mb-1 text-center text-secondary font-mono">
                                Without<br />Greptile
                              </span>
                              <span className="text-lg sm:text-2xl font-bold mb-2 sm:mb-3 text-gray-500">
                                20 hrs
                              </span>
                              <div className="flex flex-col items-center">
                                <div
                                  className="w-14 sm:w-20 rounded-t-md transition-all duration-700 ease-out origin-bottom relative flex items-center justify-center border-l border-r border-t border-dashed border-gray-400 bg-gray-400/15"
                                  style={{ height: 140 }}
                                />
                              </div>
                            </div>

                            {/* With Greptile */}
                            <div className="flex flex-col items-center justify-end max-w-[80px] sm:max-w-[120px] relative">
                              <div className="mb-2 animate-bounce" style={{ animationDuration: '2s' }}>
                                <img
                                  alt="Greptile"
                                  loading="lazy"
                                  width={40}
                                  height={40}
                                  className="opacity-100"
                                  src="/logo-only.svg"
                                />
                              </div>
                              <span className="text-[10px] sm:text-xs mb-1 text-center font-mono text-greptile-green">
                                With<br />Greptile
                              </span>
                              <span className="text-lg sm:text-2xl font-bold mb-2 sm:mb-3 text-greptile-green">
                                1.8 hrs
                              </span>
                              <div className="flex flex-col items-center relative">
                                <div
                                  className="w-14 sm:w-20 rounded-t-md transition-all duration-700 ease-out origin-bottom relative border-l border-r border-t border-dashed border-greptile-green bg-greptile-green/15"
                                  style={{ height: '12.6px' }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right side - Line chart */}
              <div className="pl-0 md:pl-4">
                <div className="relative py-4">
                  <div className="mb-4">
                    <div className="w-full py-2 bg-greptile-green/10 rounded-lg">
                      <div className="flex items-center justify-center gap-2 text-sm font-mono font-medium text-primary">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width={16}
                          height={16}
                          fill="currentColor"
                          viewBox="0 0 256 256"
                        >
                          <path d="M244.8,150.4a8,8,0,0,1-11.2-1.6A51.6,51.6,0,0,0,192,128a8,8,0,0,1-7.37-4.89,8,8,0,0,1,0-6.22A8,8,0,0,1,192,112a24,24,0,1,0-23.24-30,8,8,0,1,1-15.5-4A40,40,0,1,1,219,117.51a67.94,67.94,0,0,1,27.43,21.68A8,8,0,0,1,244.8,150.4ZM190.92,212a8,8,0,1,1-13.84,8,57,57,0,0,0-98.16,0,8,8,0,1,1-13.84-8,72.06,72.06,0,0,1,33.74-29.92,48,48,0,1,1,58.36,0A72.06,72.06,0,0,1,190.92,212ZM128,176a32,32,0,1,0-32-32A32,32,0,0,0,128,176ZM72,120a8,8,0,0,0-8-8A24,24,0,1,1,87.24,82a8,8,0,1,0,15.5-4A40,40,0,1,0,37,117.51,67.94,67.94,0,0,0,9.6,139.19a8,8,0,1,0,12.8,9.61A51.6,51.6,0,0,1,64,128,8,8,0,0,0,72,120Z" />
                        </svg>
                        Team Size vs Merge Time
                      </div>
                    </div>
                  </div>

                  <div className="h-80 sm:h-96 relative">
                    {/* Legend - Without Greptile */}
                    <div
                      className="absolute transition-all duration-500 opacity-70"
                      style={{ top: '25%', right: '10%' }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-secondary text-sm font-mono font-medium">
                          Without Greptile
                        </span>
                        <svg width={40} height={20} className="text-secondary">
                          <path
                            d="M0,10 L30,10"
                            stroke="currentColor"
                            strokeWidth={1}
                            strokeDasharray="2,2"
                          />
                          <circle cx={35} cy={10} r={3} fill="currentColor" />
                        </svg>
                      </div>
                    </div>

                    {/* Legend - With Greptile */}
                    <div
                      className="absolute animate-fadeIn"
                      style={{ bottom: '25%', right: '10%' }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-greptile-green text-sm font-mono font-medium">
                          With Greptile
                        </span>
                        <svg width={40} height={20} className="text-greptile-green">
                          <path
                            d="M0,10 L30,10"
                            stroke="currentColor"
                            strokeWidth={1}
                            strokeDasharray="2,2"
                          />
                          <circle cx={35} cy={10} r={3} fill="currentColor" />
                        </svg>
                      </div>
                    </div>

                    {/* Simple SVG chart visualization */}
                    <svg className="w-full h-full" viewBox="0 0 400 320">
                      {/* Grid lines */}
                      <line x1="50" y1="270" x2="380" y2="270" stroke="#E5E5E5" strokeWidth="1" />
                      <line x1="50" y1="30" x2="50" y2="270" stroke="#E5E5E5" strokeWidth="1" />

                      {/* Y-axis labels */}
                      <text x="40" y="35" fontSize="10" fill="#6B7280" fontFamily="monospace" textAnchor="end">45</text>
                      <text x="40" y="62" fontSize="10" fill="#6B7280" fontFamily="monospace" textAnchor="end">40</text>
                      <text x="40" y="89" fontSize="10" fill="#6B7280" fontFamily="monospace" textAnchor="end">35</text>
                      <text x="40" y="116" fontSize="10" fill="#6B7280" fontFamily="monospace" textAnchor="end">30</text>
                      <text x="40" y="143" fontSize="10" fill="#6B7280" fontFamily="monospace" textAnchor="end">25</text>
                      <text x="40" y="170" fontSize="10" fill="#6B7280" fontFamily="monospace" textAnchor="end">20</text>
                      <text x="40" y="197" fontSize="10" fill="#6B7280" fontFamily="monospace" textAnchor="end">15</text>
                      <text x="40" y="224" fontSize="10" fill="#6B7280" fontFamily="monospace" textAnchor="end">10</text>
                      <text x="40" y="251" fontSize="10" fill="#6B7280" fontFamily="monospace" textAnchor="end">5</text>
                      <text x="40" y="275" fontSize="10" fill="#6B7280" fontFamily="monospace" textAnchor="end">0</text>

                      {/* Y-axis label */}
                      <text
                        x="15"
                        y="150"
                        fontSize="10"
                        fill="#6B7280"
                        fontFamily="monospace"
                        textAnchor="middle"
                        transform="rotate(-90, 15, 150)"
                      >
                        Hours to Merge
                      </text>

                      {/* X-axis labels */}
                      <text x="75" y="290" fontSize="10" fill="#6B7280" fontFamily="monospace" textAnchor="middle">1</text>
                      <text x="130" y="290" fontSize="10" fill="#6B7280" fontFamily="monospace" textAnchor="middle">2-3</text>
                      <text x="185" y="290" fontSize="10" fill="#6B7280" fontFamily="monospace" textAnchor="middle">4-10</text>
                      <text x="240" y="290" fontSize="10" fill="#6B7280" fontFamily="monospace" textAnchor="middle">11-25</text>
                      <text x="300" y="290" fontSize="10" fill="#6B7280" fontFamily="monospace" textAnchor="middle">26-50</text>
                      <text x="360" y="290" fontSize="10" fill="#6B7280" fontFamily="monospace" textAnchor="middle">50+</text>

                      {/* X-axis label */}
                      <text x="215" y="310" fontSize="10" fill="#6B7280" fontFamily="monospace" textAnchor="middle">Team Size</text>

                      {/* Without Greptile line (gray, higher values) */}
                      <path
                        d="M75,197 L130,197 L185,170 L240,116 L300,62 L360,35"
                        fill="none"
                        stroke="#9CA3AF"
                        strokeWidth="2"
                      />
                      <circle cx="75" cy="197" r="4" fill="white" stroke="#9CA3AF" strokeWidth="2" />
                      <circle cx="130" cy="197" r="4" fill="white" stroke="#9CA3AF" strokeWidth="2" />
                      <circle cx="185" cy="170" r="4" fill="white" stroke="#9CA3AF" strokeWidth="2" />
                      <circle cx="240" cy="116" r="4" fill="white" stroke="#9CA3AF" strokeWidth="2" />
                      <circle cx="300" cy="62" r="4" fill="white" stroke="#9CA3AF" strokeWidth="2" />
                      <circle cx="360" cy="35" r="4" fill="white" stroke="#9CA3AF" strokeWidth="2" />

                      {/* With Greptile line (green, lower values) */}
                      <path
                        d="M75,265 L130,262 L185,259 L240,251 L300,232 L360,210"
                        fill="none"
                        stroke="#107A4D"
                        strokeWidth="2"
                      />
                      <circle cx="75" cy="265" r="4" fill="white" stroke="#107A4D" strokeWidth="2" />
                      <circle cx="130" cy="262" r="4" fill="white" stroke="#107A4D" strokeWidth="2" />
                      <circle cx="185" cy="259" r="4" fill="white" stroke="#107A4D" strokeWidth="2" />
                      <circle cx="240" cy="251" r="4" fill="white" stroke="#107A4D" strokeWidth="2" />
                      <circle cx="300" cy="232" r="4" fill="white" stroke="#107A4D" strokeWidth="2" />
                      <circle cx="360" cy="210" r="4" fill="white" stroke="#107A4D" strokeWidth="2" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
