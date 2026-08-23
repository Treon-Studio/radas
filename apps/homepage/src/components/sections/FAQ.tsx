import { useState } from 'react'
import { AnimatedButton } from '@/components/ui/AnimatedButton'
import { TextScramble } from '@/components/ui/TextScramble'

const faqs = [
  {
    question: 'What is RADAS?',
    answer: 'RADAS is a self-hosted enterprise infrastructure orchestrator and GitOps control plane that unifies OpenTofu, Ansible, BYOC code registries, and FinOps cost protections into a single platform.',
  },
  {
    title: 'Can RADAS be completely self-hosted air-gapped?',
    question: 'Can RADAS be completely self-hosted air-gapped?',
    answer: 'Yes! RADAS is designed for air-gapped deployments using PostgreSQL for persistence and local Go worker daemons. No telemetry or credentials ever leave your environment.',
  },
  {
    question: 'How does the BYOC Code Registry work?',
    answer: 'Similar to shadcn/ui for frontend, the RADAS BYOC registry copies reusable OpenTofu modules and Ansible roles directly into your stack repositories rather than using fragile external references.',
  },
  {
    question: 'Which cloud providers are supported for FinOps cost estimations?',
    answer: 'RADAS FinOps supports automated pricing calculators, anomaly forecasts, and budget spike alerts for AWS, GCP, Azure, and ByteDC infrastructure.',
  },
  {
    question: 'How do Feature Flags integrate with infrastructure stacks?',
    answer: 'RADAS Feature Flags provide granular user whitelisting, percentage rollouts, and instant emergency kill-switches with sub-millisecond evaluation directly in your execution pipelines.',
  },
  {
    question: 'Is RADAS compatible with existing CI/CD tools?',
    answer: 'Yes! RADAS provides Atlantis-style GitOps PR plan commenting, GitHub Actions / GitLab webhooks, and pre-apply validation hooks that plug into any existing CI/CD flow.',
  },
]

function FAQItem({ faq }: { faq: typeof faqs[0] }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div>
      <h3 className="m-0">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full py-4 text-left flex items-center justify-between hover:text-primary transition-colors group"
        >
          <span className="text-sm md:text-base lg:text-base font-mono text-primary block text-left tracking-normal">
            {faq.question}
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={16}
            height={16}
            fill="currentColor"
            viewBox="0 0 256 256"
            className={`text-secondary transition-transform duration-200 flex-shrink-0 ml-4 ${isOpen ? 'rotate-180' : ''}`}
          >
            <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z" />
          </svg>
        </button>
      </h3>
      <div className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="pb-4">
            <p className="text-secondary">
              {faq.answer}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export function FAQ() {
  return (
    <>
      <hr className="border-border w-full" />
      <section className="w-full py-12 lg:py-20">
        <div className="section-wrapper">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
            {/* Left side - Header */}
            <div>
              <section className="w-full">
                <div className="">
                  <div className="text-left">
                    <div className="text-base uppercase tracking-widest font-light mb-2 text-greptile-green">
                      <TextScramble text="[ FAQ ]" className="font-mono" />
                    </div>
                    <h2 className="text-primary text-4xl md:text-5xl font-bold">
                      Frequently Asked Questions
                    </h2>
                    <div className="mt-4">
                      <div className="flex flex-col items-start gap-4">
                        <p className="text-secondary font-mono">
                          Your question not answered here?
                        </p>
                        <AnimatedButton variant="primary" href="/contact">
                          <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} fill="currentColor" viewBox="0 0 256 256">
                            <path d="M128,24A104,104,0,0,0,36.18,176.88L24.83,210.93a16,16,0,0,0,20.24,20.24l34.05-11.35A104,104,0,1,0,128,24Zm0,192a87.87,87.87,0,0,1-44.06-11.81,8,8,0,0,0-6.54-.67L40,216,52.47,178.6a8,8,0,0,0-.66-6.54A88,88,0,1,1,128,216Z" />
                          </svg>
                          Contact Us
                        </AnimatedButton>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* Right side - FAQ List */}
            <div className="">
              {faqs.map((faq, index) => (
                <FAQItem key={index} faq={faq} />
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
