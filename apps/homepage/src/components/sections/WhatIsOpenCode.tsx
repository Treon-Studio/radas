import { TextScramble } from '@/components/ui/TextScramble'

export function WhatIsOpenCode() {
    const features = [
        {
            title: 'LSP enabled',
            description: 'Automatically loads the right LSPs for the LLM',
        },
        {
            title: 'Multi-session',
            description: 'Start multiple agents in parallel on the same project',
        },
        {
            title: 'Share links',
            description: 'Share a link to any session for reference or to debug',
        },
        {
            title: 'Claude Pro',
            description: 'Log in with Anthropic to use your Claude Pro or Max account',
        },
        {
            title: 'ChatGPT Plus/Pro',
            description: 'Log in with OpenAI to use your ChatGPT Plus or Pro account',
        },
        {
            title: 'Any model',
            description: '75+ LLM providers through Models.dev, including local models',
        },
        {
            title: 'Any editor',
            description: 'Available as a terminal interface, desktop app, and IDE extension',
        },
    ]

    return (
        <div className="h-full w-full" style={{ opacity: 1, transform: 'none' }}>
            <hr className="border-dashed border-border w-full" />
            <div className="relative w-full py-16 sm:py-20">
                <div className="px-4 sm:px-8">
                    {/* Section Label */}
                    <div className="text-base uppercase tracking-widest font-light mb-2 text-greptile-green">
                        <TextScramble text="[ SHIP FASTER ]" className="font-mono" />
                    </div>

                    {/* Title */}
                    <h2 className="text-primary mb-6">
                        What is OpenCode?
                    </h2>

                    {/* Description */}
                    <p className="text-tertiary text-base mb-8">
                        OpenCode is an open source agent that helps you write code in your terminal, IDE, or desktop.
                    </p>

                    {/* Features List */}
                    <div className="space-y-3 mb-10">
                        {features.map((feature, index) => (
                            <div key={index} className="flex items-start gap-3">
                                <span className="text-tertiary text-sm font-mono flex-shrink-0">[*]</span>
                                <p className="text-tertiary text-sm sm:text-base">
                                    <span className="text-primary font-semibold">{feature.title}</span>
                                    <span className="ml-2">{feature.description}</span>
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* CTA Button */}
                    <a
                        href="#docs"
                        className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 text-sm font-medium hover:bg-opacity-90 transition-all"
                    >
                        Read docs
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width={14}
                            height={14}
                            fill="currentColor"
                            viewBox="0 0 256 256"
                        >
                            <path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z" />
                        </svg>
                    </a>
                </div>
            </div>
        </div>
    )
}
