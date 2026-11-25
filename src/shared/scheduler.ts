import type { AppState, HealthReminder, NotifyEvent, QuoteItem, WorkItem } from './types'
import { createId } from './ids'
import { notifyAtFor } from './defaults'
import { addDays, addMonthsClamped, inWorkHours, isSameDay, parseHm } from './time'

const WEEKDAY = [1, 2, 3, 4, 5]

function firedToday(iso: string | undefined, now: Date): boolean {
  if (!iso) return false
  return isSameDay(new Date(iso), now)
}

function shouldFireWork(item: WorkItem, now: Date): boolean {
  if (!item.notify.enabled || item.status === 'done') return false

  if (item.notify.snoozedUntil) {
    const snoozeAt = new Date(item.notify.snoozedUntil).getTime()
    if (Number.isFinite(snoozeAt)) {
      return now.getTime() >= snoozeAt
    }
  }

  const due = new Date(item.dueAt)
  const start = notifyAtFor(item.dueAt, item.notify.advanceDays, item.notify.time)
  if (now.getTime() < start.getTime()) return false
  if (now.getTime() > due.getTime() + 12 * 3600 * 1000) return false

  const { h, m } = parseHm(item.notify.time)
  const atMinutes = h * 60 + m
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  if (item.notify.frequency === 'once') {
    if (item.notify.lastFiredAt) return false
    return isSameDay(now, start) && nowMinutes >= atMinutes
  }

  if (item.notify.frequency === 'hourly') {
    if (item.notify.lastFiredAt && now.getTime() - new Date(item.notify.lastFiredAt).getTime() < 55 * 60 * 1000) {
      return false
    }
    const end = start.getTime() > due.getTime() ? due.getTime() + 12 * 3600 * 1000 : due.getTime()
    return now >= start && now.getTime() <= end
  }

  if (item.notify.frequency === 'weekdays') {
    if (!WEEKDAY.includes(now.getDay())) return false
    if (firedToday(item.notify.lastFiredAt, now)) return false
    return nowMinutes >= atMinutes
  }

  if (firedToday(item.notify.lastFiredAt, now)) return false
  return nowMinutes >= atMinutes && now >= start
}

function shouldFireQuote(state: AppState, now: Date): QuoteItem | null {
  const s = state.quoteSettings
  if (!s.enabled) return null
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  if (s.frequency === 'interval') {
    if (!inWorkHours(now, s.windowStart, s.windowEnd)) return null
    if (s.lastPushedDate) {
      const elapsed = (now.getTime() - new Date(s.lastPushedDate).getTime()) / 60000
      if (elapsed < s.intervalMinutes) return null
    }
  } else {
    const { h, m } = parseHm(s.time)
    const atMinutes = h * 60 + m
    if (nowMinutes < atMinutes) return null
    if (s.lastPushedDate) {
      const last = new Date(s.lastPushedDate)
      if (isSameDay(last, now) && last.getHours() * 60 + last.getMinutes() >= atMinutes) return null
    }
  }
  const pool = state.quotes.filter((q) => q.enabled && s.kinds.includes(q.kind))
  if (!pool.length) return null
  const unused = pool.filter((q) => q.id !== s.lastQuoteId)
  const pick = unused[Math.floor(Math.random() * unused.length)] ?? pool[0]
  return pick
}

function healthInWindow(item: HealthReminder, now: Date, settings: AppState['settings']): boolean {
  if (!item.enabled) return false
  if (!item.workHoursOnly) return true
  return inWorkHours(now, item.workStart || settings.workStart, item.workEnd || settings.workEnd)
}

function shouldFireHealth(item: HealthReminder, now: Date, settings: AppState['settings']): boolean {
  if (!healthInWindow(item, now, settings)) return false
  if (!item.lastFiredAt) return false
  const elapsed = (now.getTime() - new Date(item.lastFiredAt).getTime()) / 60000
  return elapsed >= item.intervalMinutes
}

export interface TickResult {
  state: AppState
  events: NotifyEvent[]
}

export function tickScheduler(state: AppState, now = new Date()): TickResult {
  const at = now.toISOString()
  const events: NotifyEvent[] = []
  let mutated = false

  const workItems = state.workItems.map((item) => {
    if (!shouldFireWork(item, now)) return item
    mutated = true
    const daysLeft = Math.max(0, Math.ceil((new Date(item.dueAt).getTime() - now.getTime()) / 86400000))
    const ev: NotifyEvent = {
      id: createId('nt'),
      at,
      title: item.title,
      body: daysLeft === 0 ? '今天到期，记得处理。' : `还有 ${daysLeft} 天到期，提前提醒你一下。`,
      source: 'work',
      read: false,
      modal: true,
      workId: item.id
    }
    events.push(ev)
    return {
      ...item,
      notify: { ...item.notify, lastFiredAt: at, snoozedUntil: undefined },
      updatedAt: at
    }
  })

  let quoteSettings = state.quoteSettings
  const quote = shouldFireQuote({ ...state, workItems }, now)
  if (quote) {
    mutated = true
    const kindLabel = quote.kind === 'motivation' ? '今日一句' : quote.kind === 'riddle' ? '脑筋急转弯' : '轻松一下'
    const body = quote.answer ? `${quote.content}\n（想看答案就打开小猫工作助手）` : quote.content
    const ev: NotifyEvent = {
      id: createId('nt'),
      at,
      title: kindLabel,
      body,
      source: 'quote',
      read: false
    }
    events.push(ev)
    quoteSettings = { ...quoteSettings, lastPushedDate: at, lastQuoteId: quote.id }
  }

  const health = state.health.map((item) => {
    if (!healthInWindow(item, now, state.settings)) return item
    // 首次启用或首次启动时先记录起始基准时间，避免刚打开应用就连续弹出多条健康提醒
    if (!item.lastFiredAt) {
      mutated = true
      return { ...item, lastFiredAt: at }
    }
    if (!shouldFireHealth(item, now, state.settings)) return item
    mutated = true
    const ev: NotifyEvent = {
      id: createId('nt'),
      at,
      title: `${item.emoji} ${item.title}`,
      body: item.message,
      source: 'health',
      read: false
    }
    events.push(ev)
    return { ...item, lastFiredAt: at }
  })

  if (!events.length && !mutated) {
    return { state, events }
  }

  return {
    state: {
      ...state,
      workItems,
      quoteSettings,
      health,
      inbox: events.length ? [...events, ...state.inbox].slice(0, 80) : state.inbox
    },
    events
  }
}

export function nextWorkNotifyAt(item: WorkItem): Date | null {
  if (!item.notify.enabled || item.status === 'done') return null
  if (item.notify.snoozedUntil) {
    const snoozed = new Date(item.notify.snoozedUntil)
    if (Number.isFinite(snoozed.getTime())) return snoozed
  }
  return notifyAtFor(item.dueAt, item.notify.advanceDays, item.notify.time)
}

export function snoozeWorkItem(state: AppState, workId: string, minutes: number, now = new Date()): AppState {
  const until = new Date(now.getTime() + Math.max(1, minutes) * 60_000).toISOString()
  const at = now.toISOString()
  let found = false
  const workItems = state.workItems.map((item) => {
    if (item.id !== workId || item.status === 'done') return item
    found = true
    return {
      ...item,
      updatedAt: at,
      notify: { ...item.notify, enabled: true, snoozedUntil: until }
    }
  })
  return found ? { ...state, workItems } : state
}

export function completeWorkItem(state: AppState, workId: string, now = new Date()): AppState {
  const at = now.toISOString()
  let found = false
  const workItems = state.workItems.map((item) => {
    if (item.id !== workId || item.status === 'done') return item
    found = true
    return {
      ...item,
      status: 'done' as const,
      completedAt: at,
      updatedAt: at,
      notify: { ...item.notify, snoozedUntil: undefined }
    }
  })
  if (!found) return state
  return rolloverRepeats({ ...state, workItems }, now)
}

export function rolloverRepeats(state: AppState, now = new Date()): AppState {
  const extra: WorkItem[] = []
  const at = now.toISOString()
  const workItems = state.workItems.map((item) => {
    if (item.repeat === 'none' || item.status !== 'done' || !item.completedAt) return item
    const due = new Date(item.dueAt)
    const nextDue =
      item.repeat === 'weekly'
        ? addDays(due, 7)
        : addMonthsClamped(due, 1)
    const existsInState = state.workItems.some(
      (w) => w.title === item.title && isSameDay(new Date(w.dueAt), nextDue)
    )
    const existsInExtra = extra.some(
      (w) => w.title === item.title && isSameDay(new Date(w.dueAt), nextDue)
    )
    if (existsInState || existsInExtra) {
      return item
    }
    extra.push({
      ...item,
      id: createId('wk'),
      status: 'todo',
      completedAt: undefined,
      createdAt: at,
      updatedAt: at,
      dueAt: nextDue.toISOString(),
      notify: { ...item.notify, lastFiredAt: undefined, snoozedUntil: undefined }
    })
    return item
  })
  if (!extra.length) return state
  return { ...state, workItems: [...extra, ...workItems] }
}
