import { Layout } from '@/components/layout/Layout'
import { Hero } from '@/components/sections/Hero'
import { VideoPreview } from '@/components/sections/VideoPreview'
import { WhatIsOpenCode } from '@/components/sections/WhatIsOpenCode'
import { Features } from '@/components/sections/Features'
import { AnimatedGrid } from '@/components/sections/AnimatedGrid'
import { Security } from '@/components/sections/Security'
import { Privacy } from '@/components/sections/Privacy'
import { FAQ } from '@/components/sections/FAQ'
import { Newsletter } from '@/components/sections/Newsletter'

function App() {
  return (
    <Layout>
      <Hero />
      <VideoPreview />
      <WhatIsOpenCode />
      <Features />
      <AnimatedGrid />
      <Security />
      <Privacy />
      <FAQ />
      <Newsletter />
    </Layout>
  )
}

export default App
