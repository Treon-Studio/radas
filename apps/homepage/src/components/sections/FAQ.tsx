import { useState } from 'react'
import { AnimatedButton } from '@/components/ui/AnimatedButton'
import { TextScramble } from '@/components/ui/TextScramble'

const faqs = [
  {
    question: 'How does Greptile pricing work?',
    answer: 'Code reviews are $30 per developer per month. Chat is a fixed monthly subscription. API pricing is per request. See our pricing page for more details.',
  },
  {
    question: 'Can Greptile be self-hosted?',
    answer: 'Yes! We offer a self-hosted deployment option for teams that need to keep their code on their own infrastructure. Deploy on AWS, GCP, or Azure.',
  },
  {
    question: 'Are there free trials or discounts available for Greptile?',
    answer: 'Yes, we offer a 14-day free trial with full access to all features. No credit card required to start. We also offer discounts for startups and open source projects.',
  },
  {
    question: 'What programming languages does Greptile support?',
    answer: 'We support 30+ languages including Python, JavaScript, TypeScript, Go, Elixir, Java, C, C++, C#, Swift, PHP, Rust, Ruby, Kotlin, and more.',
  },
  {
    question: 'Is Greptile compatible with GitLab?',
    answer: 'Yes! Greptile works with GitHub, GitLab, and Bitbucket. We support both cloud-hosted and self-hosted versions of these platforms.',
  },
  {
    question: "Can I use Greptile's API for my own product?",
    answer: 'Yes, our API is available for building custom integrations. You can query your codebase programmatically and integrate with your existing tools and workflows.',
  },
  {
    question: 'What is AI code review?',
    answer: 'AI code review uses machine learning to automatically analyze pull requests. Unlike traditional linters, AI code review understands the context of your entire codebase to provide more relevant and accurate feedback.',
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
