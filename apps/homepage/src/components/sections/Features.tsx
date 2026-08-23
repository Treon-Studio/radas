import { AnimatedButton } from '@/components/ui/AnimatedButton'
import { TextScramble } from '@/components/ui/TextScramble'

export function Features() {
  return (
    <>
      <hr className="border-dashed border-border w-full" />
      <div className="section-wrapper-compact">
        <section className="w-full">
          <div className="section-wrapper flex flex-col md:flex-row md:justify-between md:items-start">
            <div className="flex-1 text-left">
              <div className="text-base uppercase tracking-widest font-light mb-2 text-greptile-green">
                <TextScramble text="[ CORE CAPABILITIES ]" className="font-mono" />
              </div>
              <h2 className="text-primary text-2xl sm:text-4xl font-bold">
                Everything you need for infrastructure delivery.
              </h2>
              <p className="text-tertiary font-mono mt-2 text-sm sm:text-base">
                RADAS provides unified orchestration, governance, cost control, and code reusability.
              </p>
            </div>
            <div className="mt-4 md:mt-0 md:ml-4 flex justify-start">
              <AnimatedButton variant="dark" href="http://localhost:8080">
                Launch RADAS Console
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

        {/* Feature Cards Grid with Dashed Borders */}
        <section className="hidden md:block w-full">
          <div className="relative py-8">
            {/* Top and bottom full-width dashed borders */}
            <div className="absolute top-0 left-0 right-0 border-t border-dashed border-border" />
            <div className="absolute bottom-0 left-0 right-0 border-b border-dashed border-border" />

            <div className="relative px-4 md:px-8">
              {/* Extended dashed borders */}
              <div className="hidden md:block absolute top-0 left-0 right-0 border-t border-dashed border-border" />
              <div className="hidden md:block absolute bottom-0 left-0 right-0 border-b border-dashed border-border" />
              <div className="hidden md:block absolute left-0 top-0 bottom-0 border-l border-dashed border-border" />
              <div className="hidden md:block absolute right-0 top-0 bottom-0 border-r border-dashed border-border" />

              <div className="relative grid gap-0 grid-cols-1 md:grid-cols-2 lg:grid-cols-2">
                {/* Vertical center divider */}
                <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-8 -translate-x-1/2 pointer-events-none z-10">
                  <div className="absolute left-0 top-0 bottom-0 border-l border-dashed border-border" />
                  <div className="absolute right-0 top-0 bottom-0 border-l border-dashed border-border" />
                </div>

                {/* Horizontal center divider */}
                <div className="hidden md:block absolute left-0 right-0 top-1/2 h-8 -translate-y-1/2 pointer-events-none z-10">
                  <div className="absolute left-0 right-0 top-0 border-t border-dashed border-border" />
                  <div className="absolute left-0 right-0 bottom-0 border-t border-dashed border-border" />
                </div>

                {/* GitOps PR Plans Card */}
                <div className="relative">
                  <div className="p-4 md:pr-4 md:pb-4 md:pl-0 md:pt-0">
                    <div className="group p-8 flex flex-col justify-between relative aspect-square bg-card-bg/50">
                      <div>
                        <p className="text-xs uppercase tracking-widest font-mono text-greptile-green mb-2">
                          [GITOPS & PR PLANS]
                        </p>
                        <h3 className="text-primary text-xl md:text-2xl font-semibold">
                          Atlantis-Style PR Plan Comments & Pre-apply Gates
                        </h3>
                        <p className="text-tertiary text-sm mt-3 leading-relaxed">
                          Automated speculative plan diffs rendered directly onto GitHub & GitLab pull requests with multi-check merge gates and branch policy enforcement.
                        </p>
                      </div>
                      <div className="border border-border p-4 font-mono text-xs text-secondary bg-surface">
                        <code>$ radas plan --stack=prod-vpc</code>
                        <div className="text-greptile-green mt-1">✔ Plan: 3 to add, 1 to change, 0 to destroy.</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* BYOC Registry Card */}
                <div className="relative">
                  <div className="hidden md:block absolute left-0 right-0 top-0 border-t border-dashed border-border" />
                  <div className="hidden md:block absolute left-0 right-0 bottom-0 border-t border-dashed border-border" />
                  <div className="p-4 md:pl-4 md:pb-4 md:pr-0 md:pt-0">
                    <div className="group p-8 flex flex-col justify-between relative aspect-square bg-card-bg/50">
                      <div>
                        <p className="text-xs uppercase tracking-widest font-mono text-greptile-orange mb-2">
                          [BYOC CODE REGISTRY]
                        </p>
                        <h3 className="text-primary text-xl md:text-2xl font-semibold">
                          Shadcn-Style Flat Module Adoption
                        </h3>
                        <p className="text-tertiary text-sm mt-3 leading-relaxed">
                          Adopt reusable OpenTofu blocks and Ansible roles directly into your repositories. Full code ownership with version pinning and zero external lock-in.
                        </p>
                      </div>
                      <div className="border border-border p-4 font-mono text-xs text-secondary bg-surface">
                        <code>$ radas registry install tofu-block/vpc-ha</code>
                        <div className="text-greptile-orange mt-1">✔ Installed to modules/tofu-block-vpc-ha/</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* FinOps Cost Guard Card */}
                <div className="relative">
                  <div className="hidden md:block absolute left-0 right-0 top-0 border-t border-dashed border-border" />
                  <div className="hidden md:block absolute left-0 right-0 bottom-0 border-t border-dashed border-border" />
                  <div className="p-4 md:pr-4 md:pt-4 md:pl-0 md:pb-0">
                    <div className="group p-8 flex flex-col justify-between relative aspect-square bg-card-bg/50">
                      <div>
                        <p className="text-xs uppercase tracking-widest font-mono text-greptile-pink mb-2">
                          [FINOPS GUARD]
                        </p>
                        <h3 className="text-primary text-xl md:text-2xl font-semibold">
                          Real-Time Multi-Cloud Cost Anomaly Alerts
                        </h3>
                        <p className="text-tertiary text-sm mt-3 leading-relaxed">
                          Prevent accidental bill spikes with pre-apply CSP pricing estimators (AWS, GCP, Azure, ByteDC), monthly budget thresholds, and cost trend overlays.
                        </p>
                      </div>
                      <div className="border border-border p-4 font-mono text-xs text-secondary bg-surface">
                        <div className="text-primary font-semibold">Estimated Delta: +$42.50/mo</div>
                        <div className="text-secondary mt-1">Budget status: Within 80% monthly cap</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Feature Flags Card */}
                <div className="relative">
                  <div className="hidden md:block absolute left-0 right-0 top-0 border-t border-dashed border-border" />
                  <div className="hidden md:block absolute left-0 right-0 bottom-0 border-t border-dashed border-border" />
                  <div className="p-4 md:pl-4 md:pt-4 md:pr-0 md:pb-0">
                    <div className="group p-8 flex flex-col justify-between relative aspect-square bg-card-bg/50">
                      <div>
                        <p className="text-xs uppercase tracking-widest font-mono text-greptile-yellow mb-2">
                          [FEATURE FLAGS]
                        </p>
                        <h3 className="text-primary text-xl md:text-2xl font-semibold">
                          Targeted Rollouts & Instant Kill-Switches
                        </h3>
                        <p className="text-tertiary text-sm mt-3 leading-relaxed">
                          Release features gradually with user whitelisting, percentage rollouts, and sub-millisecond evaluation with automated emergency rollback queues.
                        </p>
                      </div>
                      <div className="border border-border p-4 font-mono text-xs text-secondary bg-surface">
                        <div className="flex justify-between items-center">
                          <span>flag: rollout-k8s-v2</span>
                          <span className="text-greptile-green">ACTIVE (25%)</span>
                        </div>
                        <div className="text-secondary mt-1 text-[11px]">Kill switch ready · Sub-ms latency</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Mobile Feature Cards */}
        <section className="md:hidden w-full mt-8">
          <div className="grid gap-4 place-items-center grid-cols-1">
            <div className="group p-6 flex flex-col relative bg-card-bg/50 w-full border border-border">
              <p className="text-xs uppercase tracking-widest font-mono text-greptile-green mb-2">
                [GITOPS & PR PLANS]
              </p>
              <h3 className="text-primary text-lg font-semibold">
                Atlantis-Style PR Plan Comments & Pre-apply Gates
              </h3>
              <p className="text-tertiary text-sm mt-2">
                Automated speculative plan diffs rendered directly onto GitHub & GitLab pull requests.
              </p>
            </div>

            <div className="group p-6 flex flex-col relative bg-card-bg/50 w-full border border-border">
              <p className="text-xs uppercase tracking-widest font-mono text-greptile-orange mb-2">
                [BYOC CODE REGISTRY]
              </p>
              <h3 className="text-primary text-lg font-semibold">
                Shadcn-Style Flat Module Adoption
              </h3>
              <p className="text-tertiary text-sm mt-2">
                Adopt reusable OpenTofu blocks and Ansible roles directly into your repositories.
              </p>
            </div>

            <div className="group p-6 flex flex-col relative bg-card-bg/50 w-full border border-border">
              <p className="text-xs uppercase tracking-widest font-mono text-greptile-pink mb-2">
                [FINOPS GUARD]
              </p>
              <h3 className="text-primary text-lg font-semibold">
                Real-Time Multi-Cloud Cost Anomaly Alerts
              </h3>
              <p className="text-tertiary text-sm mt-2">
                Prevent bill spikes with CSP pricing estimators for AWS, GCP, Azure, and ByteDC.
              </p>
            </div>

            <div className="group p-6 flex flex-col relative bg-card-bg/50 w-full border border-border">
              <p className="text-xs uppercase tracking-widest font-mono text-greptile-yellow mb-2">
                [FEATURE FLAGS]
              </p>
              <h3 className="text-primary text-lg font-semibold">
                Targeted Rollouts & Instant Kill-Switches
              </h3>
              <p className="text-tertiary text-sm mt-2">
                Gradual percentage rollouts with emergency circuit breakers and sub-ms evaluation.
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
