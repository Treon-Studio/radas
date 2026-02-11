import * as React from "react"

const IconContext = React.createContext<any>(null)

export const IconProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <IconContext.Provider value={{}}>
      {children}
    </IconContext.Provider>
  )
}

export const useIcon = (icon: string) => {
    return () => <span>Icon</span>
}