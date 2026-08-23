import { AnimatedButton } from '@/components/ui/AnimatedButton'
import { TextScramble } from '@/components/ui/TextScramble'

const securityFeatures = [
  {
    title: 'Self-Hosted & Air-Gapped',
    description: 'Deploy inside your own isolated VPC or on-prem environment with full sovereignty over all state and execution logs.',
  },
  {
    title: 'AES-GCM & KMS Rotations',
    description: 'All sensitive tfvars, API keys, and credentials encrypted at rest with automated rotation compliance tracking.',
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
                <TextScramble text="[ SECURITY & COMPLIANCE ]" className="font-mono" />
              </div>
              <h2 className="text-primary text-2xl sm:text-4xl font-bold">Enterprise Security by Default</h2>
            </div>
            <div className="mt-4 md:mt-0 md:ml-4 flex justify-start">
              <AnimatedButton variant="dark" href="/docs">
                View security specs
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
                <h3 className="text-primary text-xl md:text-2xl font-semibold">
                  {securityFeatures[0].title}
                </h3>
                <p className="text-tertiary text-sm md:text-base">
                  {securityFeatures[0].description}
                </p>
              </div>
              <div className="p-6 flex-1 flex flex-col gap-3 justify-center">
                <h3 className="text-primary text-xl md:text-2xl font-semibold">
                  {securityFeatures[1].title}
                </h3>
                <p className="text-tertiary text-sm md:text-base">
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
                    <span className="text-xs font-mono text-tertiary uppercase tracking-wider">YOUR AIR-GAPPED VPC / CLUSTER</span>
                  </div>
                </div>

                {/* Diagram */}
                <div className="flex items-center justify-center gap-6 md:gap-10">
                  {/* PostgreSQL DB */}
                  <div className="flex flex-col items-center">
                    <div className="border border-dashed border-border p-4 md:p-6 mb-2">
                      <svg className="w-10 h-10 md:w-14 md:h-14 text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                      </svg>
                    </div>
                    <div className="border border-border px-3 py-1 flex items-center gap-1.5">
                      <span className="text-xs font-mono text-tertiary">POSTGRESQL</span>
                    </div>
                  </div>

                  {/* RADAS Engine */}
                  <div className="flex flex-col items-center">
                    <div className="border border-dashed border-border p-4 md:p-6 mb-2 bg-card-bg text-center">
                      <span className="font-mono text-lg font-bold text-primary">RADAS</span>
                      <div className="text-[10px] font-mono text-greptile-green">WORKERS & API</div>
                    </div>
                    <div className="border border-border px-3 py-1 flex items-center gap-1.5">
                      <span className="text-xs font-mono text-tertiary">RUNNER DAEMON</span>
                    </div>
                  </div>

                  {/* Cloud Targets */}
                  <div className="flex flex-col items-center">
                    <div className="border border-dashed border-border p-3 md:p-4 mb-2 space-y-2">
                      <div className="border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-mono text-orange-700">
                        AWS / GCP / AZURE
                      </div>
                      <div className="border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-mono text-blue-700">
                        OPENTOFU / TF
                      </div>
                      <div className="border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-mono text-emerald-700">
                        ANSIBLE ROLES
                      </div>
                    </div>
                    <div className="border border-border px-3 py-1 flex items-center gap-1.5">
                      <span className="text-xs font-mono text-tertiary">INFRA TARGETS</span>
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
