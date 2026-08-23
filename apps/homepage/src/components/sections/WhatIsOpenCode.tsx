import { TextScramble } from '@/components/ui/TextScramble'

export function WhatIsOpenCode() {
    const features = [
        {
            title: 'OpenTofu & Ansible Orchestration',
            description: 'Execute declarative infrastructure plans, applies, and Ansible playbooks with live streamed logs',
        },
        {
            title: 'BYOC Code Registry',
            description: 'Shadcn-style adoption for reusable OpenTofu modules and Ansible roles directly into your stacks',
        },
        {
            title: 'Targeted Feature Flags',
            description: 'Granular user whitelist, environment toggles, percentage rollouts, and instant emergency kill-switches',
        },
        {
            title: 'FinOps & Cloud Cost Protection',
            description: 'Real-time multi-cloud cost anomaly detection, monthly budget alerts, and speculative PR cost diffs',
        },
        {
            title: 'High-Availability Workers',
            description: 'Distributed Go worker daemon pool with heartbeat tracking, graceful draining, and round-robin fair queue scheduling',
        },
        {
            title: 'Atlantis GitOps PR Automation',
            description: 'Automated GitHub/GitLab pull request plan diff comments, pre-apply validation hooks, and multi-check merge gates',
        },
        {
            title: 'Enterprise Multi-Org & SAML SSO',
            description: 'Organization tenant boundaries, SAML 2.0 XML assertion login, audit logging, and automated compliance evidence exports',
        },
    ]

    return (
        <div className="h-full w-full" style={{ opacity: 1, transform: 'none' }}>
            <hr className="border-dashed border-border w-full" />
            <div className="relative w-full py-16 sm:py-20">
                <div className="px-4 sm:px-8">
                    {/* Section Label */}
                    <div className="text-base uppercase tracking-widest font-light mb-2 text-greptile-green">
                        <TextScramble text="[ PLATFORM OVERVIEW ]" className="font-mono" />
                    </div>

                    {/* Title */}
                    <h2 className="text-primary mb-6 text-2xl sm:text-4xl font-bold">
                        What is RADAS?
                    </h2>

                    {/* Description */}
                    <p className="text-tertiary text-base sm:text-lg mb-8 max-w-3xl">
                        RADAS is an open, self-hosted infrastructure platform that brings the developer experience of modern software delivery to cloud engineering and systems automation.
                    </p>

                    {/* Features List */}
                    <div className="space-y-3 mb-10">
                        {features.map((feature, index) => (
                            <div key={index} className="flex items-start gap-3">
                                <span className="text-tertiary text-sm font-mono flex-shrink-0">[*]</span>
                                <p className="text-tertiary text-sm sm:text-base">
                                    <span className="text-primary font-semibold">{feature.title}</span>
                                    <span className="ml-2">— {feature.description}</span>
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* CTA Button */}
                    <a
                        href="http://localhost:8080"
                        className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 text-sm font-medium hover:bg-opacity-90 transition-all font-mono"
                    >
                        Explore RADAS Console
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
