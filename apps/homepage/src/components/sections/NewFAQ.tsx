import { useState } from 'react'
import { TextScramble } from '@/components/ui/TextScramble'

const faqs = [
    {
        question: 'What is OpenCode?',
        answer: "OpenCode is an open source agent that helps you write and run code with any AI model. It's available as a terminal-based interface, desktop app, or IDE extension.",
        defaultOpen: true,
    },
    {
        question: 'How do I use OpenCode?',
        answer: 'You can install OpenCode using various package managers like curl, npm, bun, brew, or paru. Once installed, you can use it directly in your terminal or as a desktop application.',
        defaultOpen: false,
    },
    {
        question: 'Do I need extra AI subscriptions to use OpenCode?',
        answer: 'OpenCode comes with free models included, but you can also connect any model from any provider, including Claude, GPT, Gemini and more.',
        defaultOpen: false,
    },
    {
        question: 'Can I use my existing AI subscriptions with OpenCode?',
        answer: 'Yes! OpenCode allows you to connect any model from any provider. You can use your existing subscriptions with Claude, GPT, Gemini, and other AI providers.',
        defaultOpen: false,
    },
    {
        question: 'Can I only use OpenCode in the terminal?',
        answer: 'Not anymore! OpenCode is now available as an app for your desktop and web!',
        defaultOpen: true,
    },
    {
        question: 'How much does OpenCode cost?',
        answer: 'OpenCode is open source and free to use. You only pay for the AI models you choose to use.',
        defaultOpen: false,
    },
]

export function NewFAQ() {
    const [openItems, setOpenItems] = useState<number[]>(
        faqs.map((faq, index) => (faq.defaultOpen ? index : -1)).filter(i => i !== -1)
    )

    const toggleItem = (index: number) => {
        setOpenItems(prev =>
            prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
        )
    }

    return (
        <div className="h-full w-full" style={{ opacity: 1, transform: 'none' }}>
            <hr className="border-dashed border-border w-full" />
            <div className="relative w-full py-16 sm:py-20">
                <div className="px-4 sm:px-8">
                    {/* Section Label */}
                    <div className="text-base uppercase tracking-widest font-light mb-2 text-greptile-green">
                        <TextScramble text="[ FAQ ]" className="font-mono" />
                    </div>

                    {/* Title */}
                    <h2 className="text-primary mb-12">FAQ</h2>

                    {/* FAQ Items */}
                    <div className="space-y-6 max-w-3xl">
                        {faqs.map((faq, index) => (
                            <div key={index} className="border-b border-border pb-6">
                                <button
                                    onClick={() => toggleItem(index)}
                                    className="w-full flex items-start justify-between gap-4 text-left group"
                                >
                                    <div className="flex items-start gap-3 flex-1">
                                        <div className="flex-shrink-0 mt-1">
                                            {openItems.includes(index) ? (
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    width={20}
                                                    height={20}
                                                    fill="currentColor"
                                                    viewBox="0 0 256 256"
                                                    className="text-primary transition-transform"
                                                >
                                                    <path d="M224,128a8,8,0,0,1-8,8H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128Z" />
                                                </svg>
                                            ) : (
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    width={20}
                                                    height={20}
                                                    fill="currentColor"
                                                    viewBox="0 0 256 256"
                                                    className="text-tertiary group-hover:text-primary transition-colors"
                                                >
                                                    <path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z" />
                                                </svg>
                                            )}
                                        </div>
                                        <h3 className="text-base sm:text-lg font-medium text-primary group-hover:text-greptile-green transition-colors">
                                            {faq.question}
                                        </h3>
                                    </div>
                                </button>
                                {openItems.includes(index) && (
                                    <div className="mt-4 pl-8">
                                        <p className="text-tertiary text-sm sm:text-base leading-relaxed">
                                            {faq.answer}
                                            {faq.question === 'Can I only use OpenCode in the terminal?' && (
                                                <>
                                                    {' '}
                                                    <a href="#download" className="underline hover:text-primary transition-colors">
                                                        desktop
                                                    </a>
                                                    {' and '}
                                                    <a href="#download" className="underline hover:text-primary transition-colors">
                                                        web
                                                    </a>
                                                    !
                                                </>
                                            )}
                                        </p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
