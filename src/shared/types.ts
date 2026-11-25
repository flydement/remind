export type WorkStatus = 'todo' | 'doing' | 'done'
export type NotifyFrequency = 'once' | 'daily' | 'hourly' | 'weekdays'
export type RepeatRule = 'none' | 'weekly' | 'monthly'
export type QuoteKind = 'motivation' | 'riddle' | 'joke'
export type ReportKind = 'weekly' | 'monthly'
export type PageId = 'today' | 'work' | 'reports' | 'quotes' | 'health' | 'settings'

export interface WorkNotify {
  enabled: boolean
  advanceDays: number
  time: string
  frequency: NotifyFrequency
  lastFiredAt?: string
  snoozedUntil?: string
}

export interface WorkItem {
  id: string
  title: string
  notes: string
  dueAt: string
  createdAt: string
  updatedAt: string
  completedAt?: string
  status: WorkStatus
  notify: WorkNotify
  repeat: RepeatRule
  sourceText?: string
  tags: string[]
}

export interface QuoteItem {
  id: string
  kind: QuoteKind
  content: string
  answer?: string
  enabled: boolean
}

export type QuoteFrequency = 'once' | 'interval'

export interface QuoteSettings {
  enabled: boolean
  frequency: QuoteFrequency
  time: string
  intervalMinutes: number
  windowStart: string
  windowEnd: string
  kinds: QuoteKind[]
  lastPushedDate?: string
  lastQuoteId?: string
}

export interface HealthReminder {
  id: string
  title: string
  message: string
  emoji: string
  enabled: boolean
  intervalMinutes: number
  workHoursOnly: boolean
  workStart: string
  workEnd: string
  lastFiredAt?: string
}

export interface AppSettings {
  startWithSystem: boolean
  sound: boolean
  workStart: string
  workEnd: string
}

export interface ReportRecord {
  id: string
  kind: ReportKind
  periodStart: string
  periodEnd: string
  generatedAt: string
  title: string
  body: string
  stats: {
    created: number
    done: number
    pending: number
    overdue: number
  }
}

export interface NotifyEvent {
  id: string
  at: string
  title: string
  body: string
  source: 'work' | 'quote' | 'health'
  read: boolean
  modal?: boolean
  workId?: string
}

export interface RianApi {
  getState: () => Promise<AppState>
  setState: (state: AppState) => Promise<AppState>
  notify: (event: NotifyEvent) => Promise<boolean>
  onEvent: (cb: (payload: { state: AppState; events: NotifyEvent[] }) => void) => () => void
  onReminder: (cb: (event: NotifyEvent) => void) => () => void
  dismissReminder: () => void
  snoozeReminder: (workId: string, minutes: number) => void
  completeReminder: (workId: string) => void
}

export interface AppState {
  workItems: WorkItem[]
  quotes: QuoteItem[]
  quoteSettings: QuoteSettings
  health: HealthReminder[]
  settings: AppSettings
  reports: ReportRecord[]
  inbox: NotifyEvent[]
}

export interface ParsedWorkDraft {
  title: string
  dueAt: string
  notify: WorkNotify
  repeat: RepeatRule
  notes: string
  sourceText: string
  confidence: number
  hints: string[]
}

export const EMPTY_STATE: AppState = {
  workItems: [],
  quotes: [],
  quoteSettings: {
    enabled: true,
    frequency: 'once',
    time: '09:30',
    intervalMinutes: 60,
    windowStart: '08:00',
    windowEnd: '21:00',
    kinds: ['motivation', 'riddle', 'joke']
  },
  health: [],
  settings: {
    startWithSystem: false,
    sound: true,
    workStart: '09:00',
    workEnd: '18:30'
  },
  reports: [],
  inbox: []
}
