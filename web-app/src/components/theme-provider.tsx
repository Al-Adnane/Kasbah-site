'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'

export function ThemeProvider({
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  attribute?: string
  defaultTheme?: string
  enableSystem?: boolean
  disableTransitionOnChange?: boolean
}) {
  const { setTheme, theme, systemTheme } = useTheme()

  React.useEffect(() => {
    if (props.defaultTheme === 'system' && props.enableSystem) {
      setTheme(systemTheme || 'light')
    }
  }, [systemTheme, setTheme, props.defaultTheme, props.enableSystem])

  return <div {...props}>{children}</div>
}
