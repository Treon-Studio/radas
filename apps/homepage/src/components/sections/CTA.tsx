import { AnimatedButton } from '@/components/ui/AnimatedButton'
import { TextScramble } from '@/components/ui/TextScramble'

export function CTA() {
  return (
    <>
      <hr className="border-dashed border-border w-full" />
      <div className="section-wrapper py-12 lg:py-20">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="text-base uppercase tracking-widest font-light mb-2 text-greptile-green">
            <TextScramble text="[ NEED CONVINCING? ]" className="font-mono" />
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-primary mb-4">
            Tell your CTO about Greptile
          </h2>
          <p className="text-secondary font-mono">
            Need to convince your company to get Greptile? We can help.
          </p>
        </div>

        {/* Two column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
          {/* Left - Form */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-primary mb-2 uppercase tracking-wider">
                TO:
              </label>
              <input
                type="email"
                defaultValue="ctio@acme.ai"
                className="w-full px-4 py-3 bg-white border border-border focus:outline-none focus:ring-2 focus:ring-greptile-green/50 focus:border-greptile-green transition-colors font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-primary mb-2 uppercase tracking-wider">
                YOUR BOSS'S NAME:
              </label>
              <input
                type="text"
                defaultValue="Calvin Tio"
                className="w-full px-4 py-3 bg-white border border-border focus:outline-none focus:ring-2 focus:ring-greptile-green/50 focus:border-greptile-green transition-colors font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-primary mb-2 uppercase tracking-wider">
                YOUR NAME:
              </label>
              <input
                type="text"
                defaultValue="Enja Niya"
                className="w-full px-4 py-3 bg-white border border-border focus:outline-none focus:ring-2 focus:ring-greptile-green/50 focus:border-greptile-green transition-colors font-mono text-sm"
              />
            </div>

            <button className="w-full bg-greptile-dark-green text-white py-3 px-6 font-mono text-sm flex items-center justify-center gap-2 hover:bg-greptile-dark-green/90 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} fill="currentColor" viewBox="0 0 256 256">
                <path d="M224,48H32a8,8,0,0,0-8,8V192a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A8,8,0,0,0,224,48ZM203.43,64,128,133.15,52.57,64ZM216,192H40V74.19l82.59,75.71a8,8,0,0,0,10.82,0L216,74.19V192Z" />
              </svg>
              Send Email
            </button>

            <div className="text-center py-2">
              <span className="text-secondary font-mono text-sm underline">OR</span>
            </div>

            <AnimatedButton variant="primary" href="https://app.greptile.com/signup" className="w-full justify-center">
              Try For Free
              <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} fill="currentColor" viewBox="0 0 256 256">
                <path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z" />
              </svg>
            </AnimatedButton>

            <p className="text-center text-tertiary font-mono text-sm">
              14 days free • No credit card required
            </p>
          </div>

          {/* Right - Envelope illustration */}
          <div className="hidden lg:flex items-center justify-center">
            <div className="relative w-full max-w-md">
              {/* Envelope */}
              <div className="relative">
                {/* Letter */}
                <div className="bg-white rounded-t-lg shadow-lg p-6 pb-16 relative z-10 border border-gray-200">
                  {/* Logo */}
                  <div className="flex items-center gap-2 mb-4">
                    <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M16 2L4 8V24L16 30L28 24V8L16 2Z" fill="#107A4D"/>
                      <path d="M16 2L4 8L16 14L28 8L16 2Z" fill="#14A05D"/>
                      <path d="M16 14V30L28 24V8L16 14Z" fill="#0D5C3A"/>
                    </svg>
                  </div>

                  {/* Image placeholder */}
                  <div className="w-full h-32 bg-gray-800 rounded mb-4 overflow-hidden">
                    <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width={48} height={48} fill="currentColor" viewBox="0 0 256 256" className="text-gray-600">
                        <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216ZM164,80a12,12,0,1,1-12-12A12,12,0,0,1,164,80Zm-64,0A12,12,0,1,1,88,68,12,12,0,0,1,100,80Zm84,52a56,56,0,0,1-112,0,8,8,0,0,1,16,0,40,40,0,0,0,80,0,8,8,0,0,1,16,0Z" />
                      </svg>
                    </div>
                  </div>

                  {/* Letter content */}
                  <div className="space-y-2 text-xs font-mono text-gray-600">
                    <p className="font-semibold">DEAR [BOSS],</p>
                    <p>[YOUR NAME] KNOWS YOU'VE BEEN WANTING TO SHIP CODE FASTER. GREPTILE CAN HELP WITH THAT. IT HELPS YOU MERGE PR REQUESTS FASTER, SO YOU CAN SPEND MORE TIME DOING OTHER THINGS.</p>
                    <p>~5K TEAMS ALREADY USE GREPTILE, SO YOU KNOW YOU'LL BE IN...WE MEAN HANDS.</p>
                  </div>

                  {/* QR Code placeholder */}
                  <div className="absolute top-6 right-6 w-12 h-12 bg-gray-100 border border-gray-200 rounded flex items-center justify-center">
                    <div className="grid grid-cols-4 gap-0.5">
                      {Array.from({ length: 16 }).map((_, i) => (
                        <div key={i} className={`w-2 h-2 ${Math.random() > 0.5 ? 'bg-gray-800' : 'bg-white'}`} />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Envelope flap */}
                <div className="absolute -bottom-4 left-0 right-0 h-24 z-0">
                  <svg viewBox="0 0 400 100" className="w-full h-full" preserveAspectRatio="none">
                    <path d="M0,0 L200,80 L400,0 L400,100 L0,100 Z" fill="#e5e5e5" />
                    <path d="M0,0 L200,80 L400,0" fill="none" stroke="#d4d4d4" strokeWidth="1" />
                  </svg>
                </div>

                {/* Envelope back */}
                <div className="absolute -bottom-8 left-4 right-4 h-32 bg-gray-200 rounded-b-lg -z-10" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
