import { AnimatedButton } from '@/components/ui/AnimatedButton'
import { TextScramble } from '@/components/ui/TextScramble'

const learningCards = [
  { text: 'Avoid any in TypeScript.', top: '15%', right: '5%' },
  { text: 'Remove all console.log and debugger statements.', top: '45%', right: '0%' },
  { text: 'Use loops over complex list comprehensions for clarity.', top: '75%', right: '3%' },
]

export function Learning() {
  return (
    <>
      <hr className="border-dashed border-border w-full" />
      <section className="relative w-full min-h-[600px] flex items-center overflow-hidden py-16">
        {/* Marquee Background */}
        <div className="absolute inset-0 z-0 flex flex-col gap-2 pointer-events-none overflow-hidden">
          {[...Array(8)].map((_, rowIndex) => (
            <div
              key={rowIndex}
              className="w-full overflow-hidden h-[3em] flex items-center"
              style={{
                maskImage: 'linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)'
              }}
            >
              <div
                className={`whitespace-nowrap text-greptile-green text-5xl md:text-6xl font-extrabold tracking-widest opacity-[0.07] select-none inline-block ${rowIndex % 2 === 0 ? 'animate-marquee-left' : 'animate-marquee-right'}`}
                style={{
                  animationDuration: `${380 + rowIndex * 5}s`,
                  willChange: 'transform'
                }}
              >
                {Array(20).fill('LEARNING ').join('')}
              </div>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="relative z-10 w-full section-wrapper">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
            {/* Left side - Text content */}
            <div className="max-w-xl">
              <div className="text-base uppercase tracking-widest font-light mb-3 text-greptile-green">
                <TextScramble text="[ LEARNING ]" className="font-mono" />
              </div>
              <h2 className="text-primary text-4xl md:text-5xl font-semibold mb-4">
                Introducing Learning.
              </h2>
              <p className="text-tertiary font-mono text-sm md:text-base leading-relaxed mb-6">
                Greptile learns your team's coding standards by reading every engineer's PR comments, and learns what types of comments your team finds useful by tracking 👍/👎 reactions.
              </p>
              <AnimatedButton variant="dark" href="/learning">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width={16}
                  height={16}
                  fill="currentColor"
                  viewBox="0 0 256 256"
                >
                  <path d="M248,124a56.11,56.11,0,0,0-32-50.61V72a48,48,0,0,0-88-26.49A48,48,0,0,0,40,72v1.39a56,56,0,0,0,0,101.2V176a48,48,0,0,0,88,26.49A48,48,0,0,0,216,176v-1.41A56.09,56.09,0,0,0,248,124ZM88,208a32,32,0,0,1-31.81-28.56A55.87,55.87,0,0,0,64,180h8a8,8,0,0,0,0-16H64A40,40,0,0,1,50.67,86.27,8,8,0,0,0,56,78.73V72a32,32,0,0,1,64,0v68.26A47.8,47.8,0,0,0,88,128a8,8,0,0,0,0,16,32,32,0,0,1,0,64Zm104-44h-8a8,8,0,0,0,0,16h8a55.87,55.87,0,0,0,7.81-.56A32,32,0,1,1,168,144a8,8,0,0,0,0-16,47.8,47.8,0,0,0-32,12.26V72a32,32,0,0,1,64,0v6.73a8,8,0,0,0,5.33,7.54A40,40,0,0,1,192,164Zm16-52a8,8,0,0,1-8,8h-4a36,36,0,0,1-36-36V80a8,8,0,0,1,16,0v4a20,20,0,0,0,20,20h4A8,8,0,0,1,208,112ZM60,120H56a8,8,0,0,1,0-16h4A20,20,0,0,0,80,84V80a8,8,0,0,1,16,0v4A36,36,0,0,1,60,120Z" />
                </svg>
                Learn about Learnings
              </AnimatedButton>
            </div>

            {/* Right side - Floating learning cards */}
            <div className="relative w-full lg:w-1/2 h-[400px] hidden md:block">
              {learningCards.map((card, index) => (
                <div
                  key={index}
                  className="absolute flex flex-col items-start"
                  style={{
                    top: card.top,
                    right: card.right,
                  }}
                >
                  {/* Label */}
                  <span className="font-mono text-xs bg-greptile-green/90 text-white px-2 py-1 flex items-center gap-1.5">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width={12}
                      height={12}
                      fill="currentColor"
                      viewBox="0 0 256 256"
                    >
                      <path d="M248,124a56.11,56.11,0,0,0-32-50.61V72a48,48,0,0,0-88-26.49A48,48,0,0,0,40,72v1.39a56,56,0,0,0,0,101.2V176a48,48,0,0,0,88,26.49A48,48,0,0,0,216,176v-1.41A56.09,56.09,0,0,0,248,124ZM88,208a32,32,0,0,1-31.81-28.56A55.87,55.87,0,0,0,64,180h8a8,8,0,0,0,0-16H64A40,40,0,0,1,50.67,86.27,8,8,0,0,0,56,78.73V72a32,32,0,0,1,64,0v68.26A47.8,47.8,0,0,0,88,128a8,8,0,0,0,0,16,32,32,0,0,1,0,64Zm104-44h-8a8,8,0,0,0,0,16h8a55.87,55.87,0,0,0,7.81-.56A32,32,0,1,1,168,144a8,8,0,0,0,0-16,47.8,47.8,0,0,0-32,12.26V72a32,32,0,0,1,64,0v6.73a8,8,0,0,0,5.33,7.54A40,40,0,0,1,192,164Zm16-52a8,8,0,0,1-8,8h-4a36,36,0,0,1-36-36V80a8,8,0,0,1,16,0v4a20,20,0,0,0,20,20h4A8,8,0,0,1,208,112ZM60,120H56a8,8,0,0,1,0-16h4A20,20,0,0,0,80,84V80a8,8,0,0,1,16,0v4A36,36,0,0,1,60,120Z" />
                    </svg>
                    1 NEW LEARNING
                  </span>
                  {/* Card content */}
                  <div className="px-4 py-2 bg-card-bg text-greptile-green font-mono text-sm shadow-md border border-greptile-green/20">
                    {card.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
