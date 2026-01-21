import { motion } from 'framer-motion'

const steps = [
  {
    number: '01',
    title: 'Connect Your Repos',
    description: 'Link your GitHub, GitLab, or Bitbucket repositories. We support private and public repos.',
    color: 'bg-greptile-green',
  },
  {
    number: '02',
    title: 'Automatic Indexing',
    description: 'Our AI analyzes your codebase, understanding file relationships, dependencies, and patterns.',
    color: 'bg-greptile-orange',
  },
  {
    number: '03',
    title: 'Query via API',
    description: 'Use our simple REST API to ask questions about your code and get intelligent, contextual answers.',
    color: 'bg-greptile-pink',
  },
  {
    number: '04',
    title: 'Build Features',
    description: 'Power code reviews, documentation, onboarding tools, and more with your codebase context.',
    color: 'bg-greptile-yellow',
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 bg-surface">
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
            Get started in minutes
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-4 text-lg text-text-muted"
          >
            Four simple steps to AI-powered code intelligence
          </motion.p>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="relative"
            >
              {/* Connector line */}
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-8 left-full w-full h-0.5 bg-border -translate-x-1/2" />
              )}

              <div className="relative bg-white rounded-2xl p-6 border border-border">
                {/* Step number */}
                <div className={`inline-flex items-center justify-center w-12 h-12 ${step.color} text-white font-bold rounded-xl mb-4`}>
                  {step.number}
                </div>

                <h3 className="text-xl font-bold text-primary mb-2">
                  {step.title}
                </h3>
                <p className="text-text-muted">
                  {step.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
