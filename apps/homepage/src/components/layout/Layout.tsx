import { Navbar } from './Navbar'
import { Footer } from './Footer'

interface LayoutProps {
  children: React.ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <Navbar />
      <div className="mx-auto w-full max-w-[1550px]">
        <main className="flex-1">
          <div className="flex w-full items-center justify-center">
            <div className="w-full min-h-screen flex flex-col">
              <div className="border-x border-border mx-4 sm:mx-12 md:mx-12 lg:mx-32 xl:mx-40">
                <main className="flex w-full flex-col">
                  {children}
                  <Footer />
                </main>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
