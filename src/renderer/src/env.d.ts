/// <reference types="vite/client" />
import type { RianApi } from '@shared/types'

declare global {
  interface Window {
    rian?: RianApi
  }
}

export {}
