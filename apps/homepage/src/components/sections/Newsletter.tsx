import { TextScramble } from '@/components/ui/TextScramble'

export function Newsletter() {
    return (
        <div className="h-full w-full" style={{ opacity: 1, transform: 'none' }}>
            <hr className="border-dashed border-border w-full" />
            <div className="relative w-full py-16 sm:py-20">
                <div className="px-4 sm:px-8">
                    {/* Section Label */}
                    <div className="text-base uppercase tracking-widest font-light mb-2 text-greptile-green">
                        <TextScramble text="[ NEWSLETTER ]" className="font-mono" />
                    </div>

                    {/* Title */}
                    <h2 className="text-primary mb-4">
                        Be the first to know when we release new products
                    </h2>

                    {/* Subtitle */}
                    <p className="text-tertiary text-base mb-8">
                        Join the waitlist for early access.
                    </p>

                    {/* Email Form */}
                    <div className="flex flex-col sm:flex-row gap-4 max-w-2xl">
                        <input
                            type="email"
                            placeholder="Email address"
                            className="flex-1 px-4 py-3 bg-surface border border-border text-primary placeholder:text-tertiary focus:outline-none focus:border-primary transition-colors"
                        />
                        <button className="px-6 py-3 bg-primary text-white font-medium hover:bg-opacity-90 transition-all whitespace-nowrap">
                            Subscribe
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
