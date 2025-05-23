import { utils } from "@/app/source"
import type { DocsLayoutProps } from "fumadocs-ui/layouts/docs"
import type { HomeLayoutProps } from "fumadocs-ui/layouts/home"

import Logo from "@/components/Logo"
import Discord from "@/components/logos/discord"
import radas from "@/components/logos/radas-wordmark"

// shared configuration
export const baseOptions: HomeLayoutProps = {
  nav: {
    title: <Logo />,
    transparentMode: "top"
  },
  githubUrl: "https://github.com/radasapp/radas",
  links: [
    {
      icon: <Discord />,
      text: "Discord",
      url: "https://discord.com/invite/MmFkmaJ42D"
    },
    {
      icon: <radas />,
      text: "radas Cloud",
      url: "https://app.radas.com/"
    }
  ]
}

// docs layout configuration
export const docsOptions: DocsLayoutProps = {
  ...baseOptions,
  sidebar: {
    defaultOpenLevel: 0
  },
  tree: utils.pageTree
}
