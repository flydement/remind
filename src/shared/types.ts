export type WorkStatus = 'todo' | 'doing' | 'done'
export type WorkPriority = 'normal' | 'high'
export type NotifyFrequency = 'once' | 'daily' | 'hourly' | 'weekdays'

export function normalizePriority(raw: unknown): WorkPriority {
  return raw === 'high' ? 'high' : 'normal'
}
export type RepeatRule = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly'
export type QuoteKind = 'motivation' | 'riddle' | 'joke'
export type ReportKind = 'weekly' | 'monthly'
export type ReportStyle = 'executive' | 'concise' | 'warm'
export type ThemeMode = 'slate' | 'eyecare' | 'minimal' | 'cute' | 'pinkcat' | 'cartoon' | 'paper' | 'dark'
export type PageId = 'today' | 'work' | 'reports' | 'quotes' | 'health' | 'settings'

export interface ThemeOption {
  id: ThemeMode
  name: string
  badge: string
  desc: string
  hint: string
  colors: [string, string, string]
  windowBg: string
  metaColor: string
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'slate',
    name: '严谨商务',
    badge: '默认',
    desc: '冷灰蓝高对比度界面，层级清晰、利落专业',
    hint: '结构清晰',
    colors: ['#f4f6f9', '#0f172a', '#2563eb'],
    windowBg: '#F4F6F9',
    metaColor: '#0f172a'
  },
  {
    id: 'eyecare',
    name: '青竹护眼',
    badge: '护眼',
    desc: '低蓝光柔和豆沙绿底与暖玉卡片，久看不累眼',
    hint: '柔和豆沙绿',
    colors: ['#e3eee4', '#f2f7f1', '#2d7a53'],
    windowBg: '#E3EEE4',
    metaColor: '#2d7a53'
  },
  {
    id: 'minimal',
    name: '极简冷淡',
    badge: '冷淡',
    desc: '低饱和矿物雾灰与利落几何线条，克制纯粹零干扰',
    hint: '北欧性冷淡风',
    colors: ['#f2f3f5', '#ffffff', '#2f3744'],
    windowBg: '#F2F3F5',
    metaColor: '#2f3744'
  },
  {
    id: 'cute',
    name: '樱花奶芙',
    badge: '可爱',
    desc: '粉嫩草莓奶芙配色与圆润胶囊按钮，软萌治愈系',
    hint: '甜心软萌风',
    colors: ['#fff5f8', '#ffe0ec', '#e85d88'],
    windowBg: '#FFF5F8',
    metaColor: '#e85d88'
  },
  {
    id: 'pinkcat',
    name: '粉萌喵喵',
    badge: '萌猫',
    desc: '草莓奶昔粉配专属卡通猫插画、猫爪暗纹与趴边陪伴小猫',
    hint: '粉色卡通猫',
    colors: ['#fff0f6', '#ffd2e6', '#f04e88'],
    windowBg: '#FFF0F6',
    metaColor: '#f04e88'
  },
  {
    id: 'cartoon',
    name: '元气波普',
    badge: '卡通',
    desc: '暖奶油画布配手绘描边与立体硬阴影，活泼插画感',
    hint: '卡通手账风',
    colors: ['#fffbeb', '#fde68a', '#f97316'],
    windowBg: '#FFFBEB',
    metaColor: '#f97316'
  },
  {
    id: 'paper',
    name: '温润纸感',
    badge: '阅读',
    desc: '柔和暖米色调与衬线标题，适合沉浸阅读与周月报复盘',
    hint: '暖米纸张感',
    colors: ['#f6f0e6', '#28221a', '#c85d3f'],
    windowBg: '#F6F0E6',
    metaColor: '#28221a'
  },
  {
    id: 'dark',
    name: '深色专注',
    badge: '暗色',
    desc: '低眩光深海夜色界面，适合夜间办公与番茄专注',
    hint: '暗色低眩光',
    colors: ['#0b1120', '#131c2e', '#3b82f6'],
    windowBg: '#0B1120',
    metaColor: '#0b1120'
  }
]

export function normalizeTheme(raw: unknown): ThemeMode {
  return THEME_OPTIONS.some((t) => t.id === raw) ? (raw as ThemeMode) : 'slate'
}

export interface SubtaskItem {
  id: string
  title: string
  done: boolean
}

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
  priority?: WorkPriority
  assignee?: string
  subtasks?: SubtaskItem[]
  focusMinutes?: number
  pinned?: boolean
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
  catalogVersion?: number
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
  theme?: ThemeMode
  dndUntil?: string
  focusMinutesDefault?: number
  department?: string
  owner?: string
  healthCatalogVersion?: number
}

export interface FocusStats {
  totalMinutes: number
  sessions: number
  todayDate?: string
  todayMinutes: number
}

export interface ReportRecord {
  id: string
  kind: ReportKind
  style?: ReportStyle
  periodStart: string
  periodEnd: string
  generatedAt: string
  title: string
  body: string
  stats: {
    created: number
    done: number
    doing?: number
    pending: number
    overdue: number
    focusMinutes?: number
    completionRate?: number
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
  focusStats?: FocusStats
}

export interface ParsedWorkDraft {
  title: string
  dueAt: string
  priority: WorkPriority
  assignee?: string
  tags: string[]
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
    workEnd: '18:30',
    theme: 'slate',
    focusMinutesDefault: 25
  },
  reports: [],
  inbox: [],
  focusStats: {
    totalMinutes: 0,
    sessions: 0,
    todayMinutes: 0
  }
}
