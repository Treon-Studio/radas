import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const geistSans = Geist({
   variable: '--font-geist-sans',
   subsets: ['latin'],
});

const geistMono = Geist_Mono({
   variable: '--font-geist-mono',
   subsets: ['latin'],
});

const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Meja by TreonStudio';
const appDescription = process.env.NEXT_PUBLIC_APP_DESCRIPTION || 'Project management interface inspired by Linear. Built with Next.js and shadcn/ui, this application allows tracking of issues, projects and teams with a modern, responsive UI.';
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://circle.lndev.me';
const twitterHandle = process.env.NEXT_PUBLIC_TWITTER_HANDLE || '@TreonStudio';

export const metadata: Metadata = {
   title: {
      template: `%s | ${appName}`,
      default: appName,
   },
   description: appDescription,
   openGraph: {
      type: 'website',
      locale: 'en_US',
      url: siteUrl,
      siteName: appName,
      images: [
         {
            url: `${siteUrl}/banner.png`,
            width: 2560,
            height: 1440,
            alt: appName,
         },
      ],
   },
   twitter: {
      card: 'summary_large_image',
      site: twitterHandle,
      creator: twitterHandle,
      images: [
         {
            url: `${siteUrl}/banner.png`,
            width: 2560,
            height: 1440,
            alt: appName,
         },
      ],
   },
   authors: [{ name: 'TreonStudio', url: 'https://treonstudio.com/' }],
   keywords: ['ui', 'project management', 'components', 'template', 'meja', 'treonstudio'],
};

import { ThemeProvider } from '@/components/layout/theme-provider';

export default function RootLayout({
   children,
}: Readonly<{
   children: React.ReactNode;
}>) {
   return (
      <html lang="en" suppressHydrationWarning>
         <head>
            <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
         </head>
         <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background`}>
            <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
               {children}
               <Toaster />
            </ThemeProvider>
         </body>
      </html>
   );
}
