import { AnimatedButton } from '@/components/ui/AnimatedButton'
import { TextScramble } from '@/components/ui/TextScramble'
import { useState, useEffect } from 'react'

const features = [
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} fill="currentColor" viewBox="0 0 256 256">
        <path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Zm-32-80a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,136Zm0,32a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,168Z" />
      </svg>
    ),
    title: 'Write a rule or point to markdown file',
    description: "Write a rule in English or point Greptile to a markdown file with your team's best practices.",
    color: 'orange',
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} fill="currentColor" viewBox="0 0 256 256">
        <path d="M221.87,83.16A104.1,104.1,0,1,1,195.67,49l22.67-22.68a8,8,0,0,1,11.32,11.32l-96,96a8,8,0,0,1-11.32-11.32l27.72-27.72a40,40,0,1,0,17.87,31.09,8,8,0,1,1,16-.9,56,56,0,1,1-22.38-41.65L184.3,60.39a87.88,87.88,0,1,0,23.13,29.67,8,8,0,0,1,14.44-6.9Z" />
      </svg>
    ),
    title: 'Scope where the rule should apply',
    description: 'Apply rules and context to specific repositories, file paths, or code patterns.',
    color: 'yellow',
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} fill="currentColor" viewBox="0 0 256 256">
        <path d="M232,208a8,8,0,0,1-8,8H32a8,8,0,0,1-8-8V48a8,8,0,0,1,16,0v94.37L90.73,98a8,8,0,0,1,10.07-.38l58.81,44.11L218.73,90a8,8,0,1,1,10.54,12l-64,56a8,8,0,0,1-10.07.38L96.39,114.29,40,163.63V200H224A8,8,0,0,1,232,208Z" />
      </svg>
    ),
    title: 'Track rule effectiveness and usage overtime',
    description: 'Analyze whether rules are being used by Greptile and actioned by the team.',
    color: 'green',
  },
]

export function CustomRules() {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)

  useEffect(() => {
    if (isPaused) return

    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % features.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [isPaused])

  const handleItemClick = (index: number) => {
    setActiveIndex(index)
    setIsPaused(true)
  }

  return (
    <>
      <hr className="border-border w-full" />
      <div className="hidden lg:block">
        <div className="section-wrapper">
          <section className="w-full relative py-20">
            <div className="w-full h-full flex items-center">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center w-full">
                {/* Left side - Content */}
                <div className="space-y-6">
                  <section className="w-full">
                    <div className="">
                      <div className="text-left">
                        <div className="text-base uppercase tracking-widest font-light mb-2 text-greptile-green">
                          <TextScramble text="[ CUSTOM CONTEXT ]" className="font-mono" />
                        </div>
                        <h2 className="text-primary text-4xl md:text-5xl font-bold">
                          Your house, your rules.
                        </h2>
                        <p className="text-tertiary font-mono mt-2">
                          Greptile is better when personalized to your team.
                        </p>
                      </div>
                    </div>
                  </section>

                  {/* Feature items */}
                  <div className="space-y-0 transition-all duration-700">
                    {features.map((feature, index) => {
                      const isActive = index === activeIndex
                      const colorClasses = {
                        orange: isActive ? 'bg-greptile-orange/20 text-greptile-orange' : 'bg-gray-200/20 text-gray-400',
                        yellow: isActive ? 'bg-greptile-yellow/20 text-greptile-yellow' : 'bg-gray-200/20 text-gray-400',
                        green: isActive ? 'bg-greptile-green/20 text-greptile-green' : 'bg-gray-200/20 text-gray-400',
                      }
                      const iconClasses = {
                        orange: isActive ? 'text-greptile-orange' : 'text-gray-400',
                        yellow: isActive ? 'text-greptile-yellow' : 'text-gray-400',
                        green: isActive ? 'text-greptile-green' : 'text-gray-400',
                      }
                      return (
                        <div key={index}>
                          {index > 0 && <div className="border-t border-dashed border-gray-300/50" />}
                          <div
                            className={`group py-6 transition-all duration-500 cursor-pointer ${isActive ? 'opacity-100' : 'opacity-30'}`}
                            onClick={() => handleItemClick(index)}
                          >
                            <div className="flex items-start gap-4">
                              <div className={`w-10 h-10 flex items-center justify-center flex-shrink-0 transition-all duration-500 ${colorClasses[feature.color as keyof typeof colorClasses]}`}>
                                <span className={`transition-colors duration-500 ${iconClasses[feature.color as keyof typeof iconClasses]}`}>
                                  {feature.icon}
                                </span>
                              </div>
                              <div className="flex-1">
                                <h5 className={`text-2xl font-semibold mb-2 transition-colors duration-500 ${isActive ? 'text-[rgb(74,74,74)]' : 'text-gray-400'}`}>
                                  {feature.title}
                                </h5>
                                <p className={`font-mono text-base transition-colors duration-500 ${isActive ? 'text-tertiary' : 'text-gray-400'}`}>
                                  {feature.description}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Button */}
                  <div className="pt-4">
                    <AnimatedButton variant="dark" href="/custom-context">
                      Explore Custom Context
                      <svg xmlns="http://www.w3.org/2000/svg" width={20} height={20} fill="currentColor" viewBox="0 0 256 256">
                        <path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z" />
                      </svg>
                    </AnimatedButton>
                  </div>
                </div>

                {/* Right side - UI Mockup */}
                <div className="w-full relative">
                  <div
                    className="relative p-6 min-h-[500px]"
                    style={{
                      backgroundImage: 'linear-gradient(rgba(16, 122, 77, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(16, 122, 77, 0.1) 1px, transparent 1px)',
                      backgroundSize: '30px 30px',
                      backgroundColor: 'rgba(219, 39, 119, 0.03)'
                    }}
                  >
                    {/* Add Custom Context Card */}
                    <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-5 max-w-md ml-auto mt-8">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-gray-900">Add Custom Context</h4>
                        <button className="text-gray-400 hover:text-gray-600">
                          <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} fill="currentColor" viewBox="0 0 256 256">
                            <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
                          </svg>
                        </button>
                      </div>
                      <p className="text-sm text-gray-500 mb-4">
                        Define custom rules, files, or other context for Greptile to apply.
                      </p>

                      {/* Context Type */}
                      <div className="mb-4">
                        <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block font-medium">Context Type</label>
                        <div className="border border-gray-300 rounded-md">
                          {/* Dropdown header */}
                          <div className="px-3 py-2 flex items-center justify-between border-b border-gray-200 bg-gray-50">
                            <div className="flex items-center gap-2">
                              <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} fill="currentColor" viewBox="0 0 256 256" className="text-gray-600">
                                <path d="M200,24H72A16,16,0,0,0,56,40V64H40A16,16,0,0,0,24,80V200a32,32,0,0,0,32,32H192a32,32,0,0,0,32-32V40A16,16,0,0,0,200,24ZM72,40H200V176H72ZM208,200a16,16,0,0,1-16,16H67.31A31.82,31.82,0,0,0,72,200V192H208Z" />
                              </svg>
                              <span className="text-sm text-gray-700">Rule</span>
                            </div>
                            <svg xmlns="http://www.w3.org/2000/svg" width={12} height={12} fill="currentColor" viewBox="0 0 256 256" className="text-gray-400">
                              <path d="M181.66,170.34a8,8,0,0,1,0,11.32l-48,48a8,8,0,0,1-11.32,0l-48-48a8,8,0,0,1,11.32-11.32L128,212.69l42.34-42.35A8,8,0,0,1,181.66,170.34Zm-96-84.68L128,43.31l42.34,42.35a8,8,0,0,0,11.32-11.32l-48-48a8,8,0,0,0-11.32,0l-48,48A8,8,0,0,0,85.66,85.66Z" />
                            </svg>
                          </div>
                          {/* Options */}
                          <div className="divide-y divide-gray-100">
                            <div className="px-3 py-2.5 flex items-start gap-2 bg-gray-50">
                              <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} fill="currentColor" viewBox="0 0 256 256" className="text-gray-600 mt-0.5">
                                <path d="M200,24H72A16,16,0,0,0,56,40V64H40A16,16,0,0,0,24,80V200a32,32,0,0,0,32,32H192a32,32,0,0,0,32-32V40A16,16,0,0,0,200,24ZM72,40H200V176H72ZM208,200a16,16,0,0,1-16,16H67.31A31.82,31.82,0,0,0,72,200V192H208Z" />
                              </svg>
                              <div className="flex-1">
                                <span className="text-sm font-medium text-gray-700">Rule</span>
                                <p className="text-xs text-gray-500">Enforce custom rules across your entire codebase or specific sections.</p>
                              </div>
                              <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} fill="currentColor" viewBox="0 0 256 256" className="text-greptile-green">
                                <path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z" />
                              </svg>
                            </div>
                            <div className="px-3 py-2.5 flex items-start gap-2 hover:bg-gray-50 cursor-pointer">
                              <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} fill="currentColor" viewBox="0 0 256 256" className="text-gray-600 mt-0.5">
                                <path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Z" />
                              </svg>
                              <div className="flex-1">
                                <span className="text-sm font-medium text-gray-700">File</span>
                                <p className="text-xs text-gray-500">Link your style guides, Claude files, MD files, and cursor rules.</p>
                              </div>
                            </div>
                            <div className="px-3 py-2.5 flex items-start gap-2 hover:bg-gray-50 cursor-pointer">
                              <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} fill="currentColor" viewBox="0 0 256 256" className="text-gray-600 mt-0.5">
                                <path d="M140,128a12,12,0,1,1-12-12A12,12,0,0,1,140,128ZM84,116a12,12,0,1,0,12,12A12,12,0,0,0,84,116Zm88,0a12,12,0,1,0,12,12A12,12,0,0,0,172,116Z" />
                              </svg>
                              <div className="flex-1">
                                <span className="text-sm font-medium text-gray-700">Other</span>
                                <p className="text-xs text-gray-500">Tell us about your stack, team, or future plans.</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Repository and File Pattern */}
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div>
                          <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block font-medium">Repository</label>
                          <div className="relative">
                            <select className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-white appearance-none pr-8">
                              <option>all</option>
                            </select>
                            <svg xmlns="http://www.w3.org/2000/svg" width={12} height={12} fill="currentColor" viewBox="0 0 256 256" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                              <path d="M181.66,170.34a8,8,0,0,1,0,11.32l-48,48a8,8,0,0,1-11.32,0l-48-48a8,8,0,0,1,11.32-11.32L128,212.69l42.34-42.35A8,8,0,0,1,181.66,170.34Zm-96-84.68L128,43.31l42.34,42.35a8,8,0,0,0,11.32-11.32l-48-48a8,8,0,0,0-11.32,0l-48,48A8,8,0,0,0,85.66,85.66Z" />
                            </svg>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block font-medium">File Pattern</label>
                          <input
                            type="text"
                            defaultValue="all"
                            placeholder="e.g. src/**/*.tsx"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-white"
                            readOnly
                          />
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex justify-end gap-2 pt-2">
                        <button className="px-4 py-2 text-sm text-red-500 border border-red-200 rounded-md hover:bg-red-50 font-medium">
                          DELETE
                        </button>
                        <button className="px-4 py-2 text-sm bg-greptile-green text-white rounded-md flex items-center gap-2 font-medium">
                          <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} fill="currentColor" viewBox="0 0 256 256">
                            <path d="M219.31,72,182.93,35.57a16,16,0,0,0-22.63,0L36.69,159.17a16,16,0,0,0-4.69,11.32V216a16,16,0,0,0,16,16H93.51a16,16,0,0,0,11.32-4.69L228.43,103.63A16,16,0,0,0,228.43,81Zm-17,17L184,107.31,148.69,72,167,53.66,202.34,89ZM48,208V179.31L156.69,70.63,186.34,100.29,77.66,209H48Z" />
                          </svg>
                          SAVE
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Mobile version */}
      <div className="block lg:hidden">
        <div className="section-wrapper">
          <div className="space-y-12 py-12">
            <section className="w-full">
              <div className="">
                <div className="text-center">
                  <div className="text-base uppercase tracking-widest font-light mb-2 text-greptile-green">
                    <TextScramble text="[ CUSTOM CONTEXT ]" className="font-mono" />
                  </div>
                  <h2 className="text-primary text-4xl md:text-5xl font-bold">
                    Your house, your rules.
                  </h2>
                  <p className="text-tertiary font-mono mt-2">
                    Greptile is better when personalized to your team.
                  </p>
                </div>
              </div>
            </section>

            {/* Feature items for mobile */}
            <div className="space-y-6">
              {features.map((feature, index) => (
                <div key={index} className="flex items-start gap-4">
                  <div className={`w-10 h-10 flex items-center justify-center flex-shrink-0 ${
                    feature.color === 'orange' ? 'bg-greptile-orange/20 text-greptile-orange' :
                    feature.color === 'yellow' ? 'bg-greptile-yellow/20 text-greptile-yellow' :
                    'bg-greptile-green/20 text-greptile-green'
                  }`}>
                    {feature.icon}
                  </div>
                  <div className="flex-1">
                    <h5 className="mb-2 text-[rgb(74,74,74)]">{feature.title}</h5>
                    <p className="font-mono text-sm text-tertiary">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-center">
              <AnimatedButton variant="dark" href="/custom-context">
                Explore Custom Context
                <svg xmlns="http://www.w3.org/2000/svg" width={20} height={20} fill="currentColor" viewBox="0 0 256 256">
                  <path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z" />
                </svg>
              </AnimatedButton>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
