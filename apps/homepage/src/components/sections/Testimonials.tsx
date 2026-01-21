import { TextScramble } from '@/components/ui/TextScramble'

const testimonials = [
  {
    quote: "We've tried more code review tools than I can count. Greptile outperforms them all by a mile. Honestly the only AI reviewer that doesn't annoy the shit out of me.",
    author: 'James',
    role: 'CTO',
    company: 'Brex',
  },
  {
    quote: "We've been impressed by Greptile's code review quality. It's tightened our feedback loops, improved consistency, and freed up engineers to focus on higher-level design and architecture.",
    author: 'Mark',
    role: 'Eng. Manager',
    company: 'WorkOS',
  },
  {
    quote: "Greptile has been a game-changer for our code review process. It catches issues we would have missed and provides valuable context.",
    author: 'Sarah',
    role: 'VP Engineering',
    company: 'Substack',
  },
  {
    quote: "The custom rules feature is a game changer. We've encoded our entire style guide.",
    author: 'Emily',
    role: 'Engineering Lead',
    company: 'Klaviyo',
  },
  {
    quote: "Onboarding new engineers is so much faster now. They can ask questions about the codebase directly.",
    author: 'David',
    role: 'CTO',
    company: 'PostHog',
  },
  {
    quote: "The learning feature is brilliant. It's like having a senior engineer who never forgets.",
    author: 'Lisa',
    role: 'Principal Engineer',
    company: 'Mintlify',
  },
]

export function Testimonials() {
  return (
    <>
      <hr className="border-dashed border-border w-full" />
      <section className="section-wrapper relative overflow-hidden py-8 md:py-12">
        {/* Floating circles background */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute border-2 border-gray-300 rounded-full opacity-30 animate-float-slow"
            style={{ top: '-5rem', left: '-5rem', width: 600, height: 600 }}
          />
          <div
            className="absolute border-2 border-gray-300 rounded-full opacity-30 animate-float-slower"
            style={{ bottom: '-10rem', right: '-10rem', width: 800, height: 800 }}
          />
          <div
            className="absolute border-2 border-gray-300 rounded-full opacity-30 animate-float-medium"
            style={{ top: '50%', right: '-5rem', width: 400, height: 400 }}
          />
        </div>

        {/* Section header */}
        <section className="w-full relative z-10 mb-8">
          <div className="text-center">
            <div className="text-base uppercase tracking-widest font-light mb-2 text-greptile-green">
              <TextScramble text="[ TESTIMONIALS ]" className="font-mono" />
            </div>
            <h2 className="text-primary text-2xl md:text-3xl lg:text-4xl font-bold">
              From Developers That Use Greptile
            </h2>
            <p className="text-tertiary font-mono mt-2 text-sm md:text-base">
              See what developers are saying about their experience with Greptile
            </p>
          </div>
        </section>

        {/* Testimonials grid */}
        <div className="grid gap-4 place-items-center grid-cols-1 md:grid-cols-2 lg:grid-cols-3 relative z-10">
          {testimonials.map((testimonial, index) => (
            <figure
              key={index}
              className="relative flex h-full w-full flex-col justify-between rounded-none border border-border p-2 sm:p-3 text-sm/6 bg-card-bg/80"
            >
              {/* Corner decorations */}
              <div className="absolute top-0 left-0 w-2 h-2 bg-border" />
              <div className="absolute top-0 right-0 w-2 h-2 bg-border" />
              <div className="absolute bottom-0 left-0 w-2 h-2 bg-border" />
              <div className="absolute bottom-0 right-0 w-2 h-2 bg-border" />

              <p className="text-primary text-left">
                "{testimonial.quote}"
              </p>

              <div>
                <div className="my-2 h-[1px] w-full bg-border" />
                <figcaption className="flex items-center justify-between">
                  <div className="flex items-center gap-x-3">
                    <div className="size-8 sm:size-10 rounded-full bg-greptile-green flex items-center justify-center text-white font-bold">
                      {testimonial.author[0]}
                    </div>
                    <div className="text-left">
                      <div className="text-label font-medium text-primary">
                        {testimonial.author}
                      </div>
                      <div className="text-caption text-tertiary">
                        {testimonial.role} • {testimonial.company}
                      </div>
                    </div>
                  </div>
                </figcaption>
              </div>
            </figure>
          ))}
        </div>
      </section>
    </>
  )
}
