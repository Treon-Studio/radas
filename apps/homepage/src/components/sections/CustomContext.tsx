import { AnimatedButton } from '@/components/ui/AnimatedButton'
import { TextScramble } from '@/components/ui/TextScramble'

export function CustomContext() {
  return (
    <>
      <hr className="border-dashed border-border w-full" />
      <div className="section-wrapper">
        <section className="w-full">
          <div className="flex flex-col md:flex-row md:justify-between md:items-start">
            <div className="flex-1 text-left">
              <div className="text-base uppercase tracking-widest font-light mb-2 text-greptile-green">
                <TextScramble text="[ CODEBASE CONTEXT ]" className="font-mono" />
              </div>
              <h2 className="text-primary">
                Reviews with full code context
              </h2>
              <p className="text-tertiary font-mono mt-2">
                Unlike other code review tools, Greptile reasons over your entire codebase to identify issues unique to your codebase.
              </p>
            </div>
            <div className="mt-4 md:mt-0 md:ml-4 flex justify-start">
              <AnimatedButton variant="dark">
                Learn more
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

        {/* Code Context Demo */}
        <div className="mt-8 w-full">
          <div className="relative rounded-lg bg-card-bg/50 p-6 border border-border">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-greptile-green/20 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width={20} height={20} fill="currentColor" viewBox="0 0 256 256" className="text-greptile-green">
                  <path d="M232,64a32,32,0,1,0-40,31v17a8,8,0,0,1-8,8H96a23.84,23.84,0,0,0-8,1.38V95a32,32,0,1,0-16,0v66a32,32,0,1,0,16,0V144a8,8,0,0,1,8-8h88a24,24,0,0,0,24-24V95A32.06,32.06,0,0,0,232,64ZM64,64A16,16,0,1,1,80,80,16,16,0,0,1,64,64ZM96,192a16,16,0,1,1-16-16A16,16,0,0,1,96,192ZM200,80a16,16,0,1,1,16-16A16,16,0,0,1,200,80Z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-mono text-greptile-green">greptile[bot]</span>
                  <span className="text-xs text-tertiary">commented just now</span>
                </div>
                <div className="bg-white/5 rounded p-4 border-l-4 border-greptile-green">
                  <p className="text-sm text-primary font-mono">
                    This function is missing error handling. Based on how <code className="bg-greptile-green/10 px-1 rounded">handleUserAuth</code> is used in <code className="bg-greptile-green/10 px-1 rounded">src/auth/middleware.ts</code>, you should wrap this in a try-catch and return the appropriate HTTP status codes.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
