import { motion } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

const plans = [
  {
    name: 'Starter',
    description: 'Perfect for small teams getting started',
    price: '$0',
    period: '/month',
    features: [
      'Up to 3 repositories',
      '1,000 queries/month',
      'Community support',
      'Basic analytics',
    ],
    cta: 'Start for Free',
    popular: false,
  },
  {
    name: 'Pro',
    description: 'For growing teams that need more power',
    price: '$49',
    period: '/month',
    features: [
      'Up to 20 repositories',
      '10,000 queries/month',
      'Priority support',
      'Advanced analytics',
      'Team management',
      'Webhooks & integrations',
    ],
    cta: 'Start Free Trial',
    popular: true,
  },
  {
    name: 'Enterprise',
    description: 'For organizations with advanced needs',
    price: 'Custom',
    period: '',
    features: [
      'Unlimited repositories',
      'Unlimited queries',
      'Dedicated support',
      'Custom integrations',
      'Self-hosted option',
      'SSO/SAML',
      'SLA guarantee',
    ],
    cta: 'Contact Sales',
    popular: false,
  },
]

export function Pricing() {
  return (
    <section id="pricing" className="py-24 bg-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl sm:text-4xl font-bold text-primary"
          >
            Simple, transparent pricing
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-4 text-lg text-text-muted"
          >
            Start free and scale as you grow
          </motion.p>
        </div>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={cn(
                'relative bg-white rounded-2xl border p-8',
                plan.popular ? 'border-greptile-green shadow-xl scale-105' : 'border-border'
              )}
            >
              {/* Popular badge */}
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-greptile-green text-white text-sm font-semibold px-4 py-1 rounded-full">
                  Most Popular
                </div>
              )}

              {/* Plan details */}
              <div className="text-center mb-8">
                <h3 className="text-xl font-bold text-primary">{plan.name}</h3>
                <p className="text-text-muted text-sm mt-2">{plan.description}</p>
                <div className="mt-6">
                  <span className="text-4xl font-bold text-primary">{plan.price}</span>
                  <span className="text-text-muted">{plan.period}</span>
                </div>
              </div>

              {/* Features */}
              <ul className="space-y-4 mb-8">
                {plan.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-center gap-3">
                    <svg
                      className="w-5 h-5 text-greptile-green flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="text-text-muted">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Button
                variant={plan.popular ? 'primary' : 'outline'}
                className="w-full"
              >
                {plan.cta}
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
