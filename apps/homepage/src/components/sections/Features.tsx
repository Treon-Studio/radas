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
                <TextScramble text="[ SHIP FASTER ]" className="font-mono" />
              </div>
              <h2 className="text-primary">
                Your second pair of eyes.
              </h2>
              <p className="text-tertiary font-mono mt-2">
                Greptile automatically reviews PRs in GitHub and GitLab with full context of your codebase.
              </p>
            </div>
            <div className="mt-4 md:mt-0 md:ml-4 flex justify-start">
              <AnimatedButton variant="dark">
                See Greptile in action
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

                {/* In-line Comments Card */}
                <div className="relative">
                  <div className="p-4 md:pr-4 md:pb-4 md:pl-0 md:pt-0">
                    <div className="group p-8 flex flex-col relative aspect-square bg-card-bg/50">
                      <a
                        className="flex items-center justify-center transition-all text-white bg-greptile-green hover:bg-greptile-green/90 w-8 h-8 text-base absolute top-2 right-2"
                        aria-label="Learn more about Get context-aware comments on your PRs"
                        href="https://www.greptile.com/docs/code-review-bot/key-features"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width={16}
                          height={16}
                          fill="currentColor"
                          viewBox="0 0 256 256"
                          className="rotate-45 transition-transform duration-300 group-hover:rotate-0"
                        >
                          <path d="M200,64V168a8,8,0,0,1-16,0V83.31L69.66,197.66a8,8,0,0,1-11.32-11.32L172.69,72H88a8,8,0,0,1,0-16H192A8,8,0,0,1,200,64Z" />
                        </svg>
                      </a>
                      <div>
                        <p className="text-xs uppercase tracking-widest font-mono text-greptile-green mb-2">
                          [IN-LINE COMMENTS]
                        </p>
                        <h3 className="text-primary text-xl md:text-2xl font-semibold">
                          Get context-aware comments on your PRs
                        </h3>
                        <p className="text-tertiary text-sm mt-2">
                          In-line comments to identify bugs, antipatterns, security issues, and more.
                        </p>
                      </div>
                      <div className="w-full flex-1 flex items-end justify-center relative min-h-0">
                        <img
                          src="/features/inline-comments.svg"
                          alt="In-line comments"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Custom Context Card */}
                <div className="relative">
                  <div className="hidden md:block absolute left-0 right-0 top-0 border-t border-dashed border-border" />
                  <div className="hidden md:block absolute left-0 right-0 bottom-0 border-t border-dashed border-border" />
                  <div className="p-4 md:pl-4 md:pb-4 md:pr-0 md:pt-0">
                    <div className="group p-8 flex flex-col relative aspect-square bg-card-bg/50">
                      <a
                        className="flex items-center justify-center transition-all text-white bg-greptile-orange hover:bg-greptile-orange/90 w-8 h-8 text-base absolute top-2 right-2"
                        aria-label="Learn more about Custom rules"
                        href="https://www.greptile.com/docs/code-review-bot/custom-context"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width={16}
                          height={16}
                          fill="currentColor"
                          viewBox="0 0 256 256"
                          className="rotate-45 transition-transform duration-300 group-hover:rotate-0"
                        >
                          <path d="M200,64V168a8,8,0,0,1-16,0V83.31L69.66,197.66a8,8,0,0,1-11.32-11.32L172.69,72H88a8,8,0,0,1,0-16H192A8,8,0,0,1,200,64Z" />
                        </svg>
                      </a>
                      <div>
                        <p className="text-xs uppercase tracking-widest font-mono text-greptile-orange mb-2">
                          [CUSTOM CONTEXT]
                        </p>
                        <h3 className="text-primary text-xl md:text-2xl font-semibold">
                          Describe your coding standards in English
                        </h3>
                        <p className="text-tertiary text-sm mt-2">
                          Write rules in plain English or point to markdown files. No complex configuration needed.
                        </p>
                      </div>
                      <div className="w-full flex-1 flex items-end justify-center relative min-h-0">
                        <img
                          src="/features/custom-context.svg"
                          alt="Custom context"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* PR Summaries Card */}
                <div className="relative">
                  <div className="hidden md:block absolute left-0 right-0 top-0 border-t border-dashed border-border" />
                  <div className="hidden md:block absolute left-0 right-0 bottom-0 border-t border-dashed border-border" />
                  <div className="p-4 md:pr-4 md:pt-4 md:pl-0 md:pb-0">
                    <div className="group p-8 flex flex-col relative aspect-square bg-card-bg/50">
                      <a
                        className="flex items-center justify-center transition-all text-white bg-greptile-pink hover:bg-greptile-pink/90 w-8 h-8 text-base absolute top-2 right-2"
                        aria-label="Learn more about PR summaries"
                        href="https://www.greptile.com/docs/code-review-bot/pr-summaries"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width={16}
                          height={16}
                          fill="currentColor"
                          viewBox="0 0 256 256"
                          className="rotate-45 transition-transform duration-300 group-hover:rotate-0"
                        >
                          <path d="M200,64V168a8,8,0,0,1-16,0V83.31L69.66,197.66a8,8,0,0,1-11.32-11.32L172.69,72H88a8,8,0,0,1,0-16H192A8,8,0,0,1,200,64Z" />
                        </svg>
                      </a>
                      <div>
                        <p className="text-xs uppercase tracking-widest font-mono text-greptile-pink mb-2">
                          [PR SUMMARIES]
                        </p>
                        <h3 className="text-primary text-xl md:text-2xl font-semibold">
                          Mermaid diagrams, file-by-file breakdowns
                        </h3>
                        <p className="text-tertiary text-sm mt-2">
                          Automatically generate visual diagrams and comprehensive summaries for every pull request.
                        </p>
                      </div>
                      <div className="w-full flex-1 flex items-end justify-center relative min-h-0">
                        <img
                          src="/features/pr-summaries.svg"
                          alt="PR summaries"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Learning Card */}
                <div className="relative">
                  <div className="hidden md:block absolute left-0 right-0 top-0 border-t border-dashed border-border" />
                  <div className="hidden md:block absolute left-0 right-0 bottom-0 border-t border-dashed border-border" />
                  <div className="p-4 md:pl-4 md:pt-4 md:pr-0 md:pb-0">
                    <div className="group p-8 flex flex-col relative aspect-square bg-card-bg/50">
                      <a
                        className="flex items-center justify-center transition-all text-white bg-greptile-yellow hover:bg-greptile-yellow/90 w-8 h-8 text-base absolute top-2 right-2"
                        aria-label="Learn more about Learning"
                        href="https://www.greptile.com/docs/code-review-bot/learning"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width={16}
                          height={16}
                          fill="currentColor"
                          viewBox="0 0 256 256"
                          className="rotate-45 transition-transform duration-300 group-hover:rotate-0"
                        >
                          <path d="M200,64V168a8,8,0,0,1-16,0V83.31L69.66,197.66a8,8,0,0,1-11.32-11.32L172.69,72H88a8,8,0,0,1,0-16H192A8,8,0,0,1,200,64Z" />
                        </svg>
                      </a>
                      <div>
                        <p className="text-xs uppercase tracking-widest font-mono text-greptile-yellow mb-2">
                          [LEARNING]
                        </p>
                        <h3 className="text-primary text-xl md:text-2xl font-semibold">
                          Infers your team's coding standards
                        </h3>
                        <p className="text-tertiary text-sm mt-2">
                          Learns from your PR comments and reactions. The more you use it, the better it understands.
                        </p>
                      </div>
                      <div className="w-full flex-1 flex items-end justify-center relative min-h-0">
                        <img
                          src="/features/learning.svg"
                          alt="Learning"
                          className="w-full h-full object-contain"
                        />
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
            {/* In-line Comments Card */}
            <div className="group p-8 flex flex-col relative aspect-square bg-card-bg/50 w-full">
              <a
                className="flex items-center justify-center transition-all text-white bg-greptile-green hover:bg-greptile-green/90 w-8 h-8 text-base absolute top-2 right-2"
                aria-label="Learn more about Get context-aware comments on your PRs"
                href="/features/code-context"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width={16}
                  height={16}
                  fill="currentColor"
                  viewBox="0 0 256 256"
                  className="rotate-45 transition-transform duration-300 group-hover:rotate-0"
                >
                  <path d="M200,64V168a8,8,0,0,1-16,0V83.31L69.66,197.66a8,8,0,0,1-11.32-11.32L172.69,72H88a8,8,0,0,1,0-16H192A8,8,0,0,1,200,64Z" />
                </svg>
              </a>
              <div>
                <p className="text-xs uppercase tracking-widest font-mono text-greptile-green mb-2">
                  [IN-LINE COMMENTS]
                </p>
                <h3 className="text-primary text-xl md:text-2xl font-semibold">
                  Get context-aware comments on your PRs
                </h3>
                <p className="text-tertiary text-sm mt-2">
                  In-line comments to identify bugs, antipatterns, security issues, and more.
                </p>
              </div>
            </div>

            {/* Custom Rules Card */}
            <div className="group p-8 flex flex-col relative aspect-square bg-card-bg/50 w-full">
              <a
                className="flex items-center justify-center transition-all text-white bg-greptile-orange hover:bg-greptile-orange/90 w-8 h-8 text-base absolute top-2 right-2"
                aria-label="Learn more about Custom rules"
                href="/features/custom-rules"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width={16}
                  height={16}
                  fill="currentColor"
                  viewBox="0 0 256 256"
                  className="rotate-45 transition-transform duration-300 group-hover:rotate-0"
                >
                  <path d="M200,64V168a8,8,0,0,1-16,0V83.31L69.66,197.66a8,8,0,0,1-11.32-11.32L172.69,72H88a8,8,0,0,1,0-16H192A8,8,0,0,1,200,64Z" />
                </svg>
              </a>
              <div>
                <p className="text-xs uppercase tracking-widest font-mono text-greptile-orange mb-2">
                  [CUSTOM CONTEXT]
                </p>
                <h3 className="text-primary text-xl md:text-2xl font-semibold">
                  Describe your coding standards in English
                </h3>
                <p className="text-tertiary text-sm mt-2">
                  Write rules in plain English or point to markdown files. No complex configuration needed.
                </p>
              </div>
            </div>

            {/* PR Summaries Card */}
            <div className="group p-8 flex flex-col relative aspect-square bg-card-bg/50 w-full">
              <a
                className="flex items-center justify-center transition-all text-white bg-greptile-pink hover:bg-greptile-pink/90 w-8 h-8 text-base absolute top-2 right-2"
                aria-label="Learn more about PR summaries"
                href="/features/pr-summaries"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width={16}
                  height={16}
                  fill="currentColor"
                  viewBox="0 0 256 256"
                  className="rotate-45 transition-transform duration-300 group-hover:rotate-0"
                >
                  <path d="M200,64V168a8,8,0,0,1-16,0V83.31L69.66,197.66a8,8,0,0,1-11.32-11.32L172.69,72H88a8,8,0,0,1,0-16H192A8,8,0,0,1,200,64Z" />
                </svg>
              </a>
              <div>
                <p className="text-xs uppercase tracking-widest font-mono text-greptile-pink mb-2">
                  [PR SUMMARIES]
                </p>
                <h3 className="text-primary text-xl md:text-2xl font-semibold">
                  Mermaid diagrams, file-by-file breakdowns
                </h3>
                <p className="text-tertiary text-sm mt-2">
                  Automatically generate visual diagrams and comprehensive summaries for every pull request.
                </p>
              </div>
            </div>

            {/* Learning Card */}
            <div className="group p-8 flex flex-col relative aspect-square bg-card-bg/50 w-full">
              <a
                className="flex items-center justify-center transition-all text-white bg-greptile-yellow hover:bg-greptile-yellow/90 w-8 h-8 text-base absolute top-2 right-2"
                aria-label="Learn more about Learning"
                href="/features/learning"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width={16}
                  height={16}
                  fill="currentColor"
                  viewBox="0 0 256 256"
                  className="rotate-45 transition-transform duration-300 group-hover:rotate-0"
                >
                  <path d="M200,64V168a8,8,0,0,1-16,0V83.31L69.66,197.66a8,8,0,0,1-11.32-11.32L172.69,72H88a8,8,0,0,1,0-16H192A8,8,0,0,1,200,64Z" />
                </svg>
              </a>
              <div>
                <p className="text-xs uppercase tracking-widest font-mono text-greptile-yellow mb-2">
                  [LEARNING]
                </p>
                <h3 className="text-primary text-xl md:text-2xl font-semibold">
                  Infers your team's coding standards
                </h3>
                <p className="text-tertiary text-sm mt-2">
                  Learns from your PR comments and reactions. The more you use it, the better it understands.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
