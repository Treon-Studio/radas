import { AnimatedButton } from '@/components/ui/AnimatedButton'
import { TextScramble } from '@/components/ui/TextScramble'

const securityFeatures = [
  {
    title: 'Self-Hosted Deployment',
    description: 'Deploy in your own air-gapped environment with complete control over your infrastructure.',
  },
  {
    title: 'SOC 2 Compliant',
    description: 'All data is encrypted at rest and in transit. We use industry-standard encryption and security practices.',
  },
]

export function Security() {
  return (
    <>
      <hr className="border-dashed border-border w-full" />
      <div>
        <section className="w-full">
          <div className="section-wrapper flex flex-col md:flex-row md:justify-between md:items-start">
            <div className="flex-1 text-left">
              <div className="text-base uppercase tracking-widest font-light mb-2 text-greptile-green">
                <TextScramble text="[ SECURITY ]" className="font-mono" />
              </div>
              <h2 className="text-primary">Security-First Design</h2>
            </div>
            <div className="mt-4 md:mt-0 md:ml-4 flex justify-start">
              <AnimatedButton variant="dark" href="/security">
                View our security policy
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width={16}
                  height={16}
                  fill="currentColor"
                  viewBox="0 0 256 256"
                >
                  <path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z" />
                </svg>
              </AnimatedButton>
            </div>
          </div>
        </section>
        <hr className="border-border w-full" />
        <div className="section-wrapper-compact">
          <div className="flex flex-col md:flex-row">
            {/* Left - Features */}
            <div className="w-full md:w-1/3 flex flex-col md:border-r border-dashed border-border">
              <div className="p-6 flex-1 flex flex-col gap-3 border-b border-dashed border-border justify-center">
                <h3 className="text-primary text-2xl md:text-3xl font-medium">
                  {securityFeatures[0].title}
                </h3>
                <p className="text-tertiary text-base md:text-lg">
                  {securityFeatures[0].description}
                </p>
              </div>
              <div className="p-6 flex-1 flex flex-col gap-3 justify-center">
                <h3 className="text-primary text-2xl md:text-3xl font-medium">
                  {securityFeatures[1].title}
                </h3>
                <p className="text-tertiary text-base md:text-lg">
                  {securityFeatures[1].description}
                </p>
              </div>
            </div>

            {/* Right - Diagram */}
            <div className="w-full md:w-2/3 flex items-center justify-center bg-card-bg/30 p-8 md:p-12">
              <div className="w-full max-w-lg">
                {/* Your Air-Gapped Environment header */}
                <div className="flex justify-center mb-8">
                  <div className="border border-dashed border-border px-4 py-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-xs font-mono text-tertiary uppercase tracking-wider">YOUR AIR-GAPPED ENVIRONMENT</span>
                  </div>
                </div>

                {/* Diagram */}
                <div className="flex items-center justify-center gap-6 md:gap-10">
                  {/* Your DB */}
                  <div className="flex flex-col items-center">
                    <div className="border border-dashed border-border p-4 md:p-6 mb-2">
                      <svg className="w-10 h-10 md:w-14 md:h-14 text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                      </svg>
                    </div>
                    <div className="border border-border px-3 py-1 flex items-center gap-1.5">
                      <svg className="w-3 h-3 text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7" />
                      </svg>
                      <span className="text-xs font-mono text-tertiary">YOUR DB</span>
                    </div>
                  </div>

                  {/* Greptile */}
                  <div className="flex flex-col items-center">
                    <div className="border border-dashed border-border p-4 md:p-6 mb-2 bg-card-bg">
                      <img src="/logo.svg" alt="Greptile" className="w-10 h-10 md:w-14 md:h-14" />
                    </div>
                  </div>

                  {/* Your LLMs */}
                  <div className="flex flex-col items-center">
                    <div className="border border-dashed border-border p-3 md:p-4 mb-2 space-y-2">
                      <div className="border border-red-200 bg-red-50 px-2 py-1 flex items-center gap-1.5 text-xs">
                        <span className="text-red-500">✳</span>
                        <span className="font-mono text-red-600">ANTHROPIC</span>
                      </div>
                      <div className="border border-blue-200 bg-blue-50 px-2 py-1 flex items-center gap-1.5 text-xs">
                        <span className="text-blue-500">◆</span>
                        <span className="font-mono text-blue-600">GEMINI</span>
                      </div>
                      <div className="border border-gray-200 bg-gray-50 px-2 py-1 flex items-center gap-1.5 text-xs">
                        <span className="text-gray-500">◎</span>
                        <span className="font-mono text-gray-600">OPENAI</span>
                      </div>
                    </div>
                    <div className="border border-border px-3 py-1 flex items-center gap-1.5">
                      <svg className="w-3 h-3 text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span className="text-xs font-mono text-tertiary">YOUR LLMS</span>
                    </div>
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
