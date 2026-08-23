import { TextScramble } from '@/components/ui/TextScramble'

export function Privacy() {
    return (
        <div className="h-full w-full" style={{ opacity: 1, transform: 'none' }}>
            <hr className="border-dashed border-border w-full" />
            <div className="relative w-full py-16 sm:py-20">
                <div className="px-4 sm:px-8">
                    {/* Section Label */}
                    <div className="text-base uppercase tracking-widest font-light mb-2 text-greptile-green">
                        <TextScramble text="[ PRIVACY ]" className="font-mono" />
                    </div>

                    {/* Title */}
                    <h2 className="text-primary mb-8">
                        Built for privacy first
                    </h2>

                    {/* Content */}
                    <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 mt-1">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width={20}
                                height={20}
                                fill="currentColor"
                                viewBox="0 0 256 256"
                                className="text-tertiary"
                            >
                                <path d="M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z" />
                            </svg>
                        </div>
                        <p className="text-tertiary text-base sm:text-lg">
                            RADAS is 100% self-hosted and never exfiltrates state, tokens, credentials, or infrastructure definitions to external cloud vendors.{' '}
                            <a
                                href="/docs"
                                className="underline hover:text-primary transition-colors font-mono"
                            >
                                Read documentation
                            </a>
                            .
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
