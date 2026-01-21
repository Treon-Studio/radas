const customerLogos = [
  { name: 'Brex', width: 70, height: 24, src: '/logos/brex.webp' },
  { name: 'Substack', width: 100, height: 24, src: '/logos/substack.webp' },
  { name: 'Scale AI', width: 60, height: 24, src: '/logos/scale.png' },
  { name: 'Klaviyo', width: 100, height: 24, src: '/logos/klaviyo.png' },
  { name: 'PostHog', width: 100, height: 24, src: '/logos/posthog.webp' },
  { name: 'Mintlify', width: 100, height: 24, src: '/logos/mintlify.webp' },
  { name: 'Browserbase', width: 125, height: 24, src: '/logos/browserbase.webp' },
  { name: 'Bilt', width: 100, height: 24, src: '/logos/bilt.webp' },
  { name: 'Crossmint', width: 100, height: 24, src: '/logos/crossmint.png' },
  { name: 'Pylon AI', width: 130, height: 24, src: '/logos/pylon.png' },
]

export function Customers() {
  return (
    <>
      <hr className="border-dashed border-border w-full" />
      <div className="section-wrapper-compact">
        {/* Banner */}
        <div className="flex items-center justify-between border-secondary">
          <div className="flex-1 flex flex-col sm:flex-row items-center justify-center py-2">
            <p className="text-label font-mono text-center text-primary">
              <span className="hidden sm:inline">
                1000+ SOFTWARE TEAMS USE GREPTILE TO SHIP FASTER.
              </span>
              <span className="sm:hidden">1000+ TEAMS USE GREPTILE</span>
            </p>
            <a
              className="text-label font-mono text-greptile-green flex items-center gap-1 no-underline hover:underline sm:ml-2"
              href="/customers"
            >
              SEE WHY TEAMS
              <img
                alt="heart"
                loading="lazy"
                width={14}
                height={14}
                className="animate-pulse"
                src="/heart.svg"
              />
              GREPTILE
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width={12}
                height={12}
                fill="currentColor"
                viewBox="0 0 256 256"
              >
                <path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z" />
              </svg>
            </a>
          </div>
        </div>

        {/* Logo Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-0">
          {customerLogos.map((customer) => (
            <div
              key={customer.name}
              className="flex h-12 items-center justify-center border-t-[0.5px] border-l-[0.5px] border-r-[0.5px] border-border py-1 group cursor-default"
            >
              <img
                alt={`${customer.name} logo`}
                loading="lazy"
                width={customer.width}
                height={customer.height}
                className="object-contain grayscale brightness-75 hover:grayscale-0 transition-all duration-300"
                style={{
                  maxWidth: customer.width,
                  maxHeight: customer.height,
                  width: 'auto',
                  height: 'auto'
                }}
                src={customer.src}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
