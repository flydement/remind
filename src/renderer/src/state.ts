import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppState, NotifyEvent, ThemeMode, WorkItem, WorkStatus } from '@shared/types'
import { EMPTY_STATE, normalizePriority, normalizeTheme, THEME_OPTIONS } from '@shared/types'
import { seedDemoWork, seedHealth, seedQuotes } from '@shared/defaults'
import { createId } from '@shared/ids'
import { addDays, isPastDue, isSameDay, nowIso, toLocalDate } from '@shared/time'
import {
  batchPostponeOverdue,
  completeWorkItem,
  isDndActive,
  recordFocusMinutes,
  rolloverRepeats,
  snoozeWorkItem,
  tickScheduler
} from '@shared/scheduler'
import { previewNotifyDate } from '@shared/parser'
import { playFocusChime, showSystemNotify, unlockNotifySound } from './notify'

export interface FlashMessage {
  id: string
  title: string
  body: string
  source?: 'work' | 'quote' | 'health' | 'info'
  actionLabel?: string
  onAction?: () => void
}

export interface FocusTimerState {
  active: boolean
  paused: boolean
  mode: 'focus' | 'break'
  totalSeconds: number
  remainingSeconds: number
  workId?: string
}

const IDLE_FOCUS: FocusTimerState = {
  active: false,
  paused: false,
  mode: 'focus',
  totalSeconds: 25 * 60,
  remainingSeconds: 25 * 60
}

const THEME_META_COLOR: Record<ThemeMode, string> = Object.fromEntries(
  THEME_OPTIONS.map((t) => [t.id, t.metaColor])
) as Record<ThemeMode, string>

function fallbackState(): AppState {
  return { ...EMPTY_STATE, quotes: seedQuotes(), health: seedHealth() }
}

function hydrate(raw: Partial<AppState> | null | undefined): AppState {
  const base = fallbackState()
  const safe = raw && typeof raw === 'object' ? raw : {}
  return {
    ...base,
    ...safe,
    workItems: Array.isArray(safe.workItems)
      ? safe.workItems.map((w) => ({
          ...w,
          tags: Array.isArray(w.tags) ? w.tags : [],
          priority: normalizePriority(w.priority),
          subtasks: Array.isArray(w.subtasks) ? w.subtasks : []
        }))
      : [],
    quotes: Array.isArray(safe.quotes) && safe.quotes.length ? safe.quotes : base.quotes,
    health: Array.isArray(safe.health) && safe.health.length ? safe.health : base.health,
    quoteSettings: { ...base.quoteSettings, ...(safe.quoteSettings ?? {}) },
    settings: { ...base.settings, ...(safe.settings ?? {}) },
    reports: Array.isArray(safe.reports) ? safe.reports : [],
    inbox: Array.isArray(safe.inbox) ? safe.inbox : [],
    focusStats: { ...base.focusStats!, ...(safe.focusStats ?? {}) }
  }
}

function mergeWorkItem(s: AppState, item: WorkItem): WorkItem[] {
  const prev = s.workItems.find((w) => w.id === item.id)
  const scheduleChanged = Boolean(
    prev &&
      (prev.dueAt !== item.dueAt ||
        prev.notify.enabled !== item.notify.enabled ||
        prev.notify.advanceDays !== item.notify.advanceDays ||
        prev.notify.time !== item.notify.time ||
        prev.notify.frequency !== item.notify.frequency)
  )
  const clean = scheduleChanged
    ? { ...item, notify: { ...item.notify, lastFiredAt: undefined, snoozedUntil: undefined } }
    : item
  const exists = s.workItems.some((w) => w.id === item.id)
  return exists ? s.workItems.map((w) => (w.id === item.id ? clean : w)) : [clean, ...s.workItems]
}

export function useAppState() {
  const [state, setState] = useState<AppState>(fallbackState)
  const [ready, setReady] = useState(false)
  const [now, setNow] = useState<Date>(() => new Date())
  const [flash, setFlash] = useState<FlashMessage | null>(null)
  const [reminderQueue, setReminderQueue] = useState<NotifyEvent[]>([])
  const [focusTimer, setFocusTimer] = useState<FocusTimerState>(IDLE_FOCUS)
  const focusTimerRef = useRef(focusTimer)
  focusTimerRef.current = focusTimer
  const focusEndAtRef = useRef<number | null>(null)
  const [notifyPerm, setNotifyPerm] = useState<NotificationPermission>(
    typeof Notification === 'undefined' ? 'denied' : Notification.permission
  )
  const stateRef = useRef(state)
  stateRef.current = state

  const theme: ThemeMode = normalizeTheme(state.settings.theme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', THEME_META_COLOR[theme])
  }, [theme])

  useEffect(() => {
    const syncNow = (): void => setNow(new Date())
    const id = window.setInterval(syncNow, 30_000)
    const onVisible = (): void => {
      if (!document.hidden) syncNow()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const pushReminders = useCallback((events: NotifyEvent[]) => {
    const modals = events.filter((e) => e.modal)
    if (!modals.length) return
    setReminderQueue((q) => {
      const next = [...q]
      for (const ev of modals) {
        if (ev.workId) {
          const idx = next.findIndex((x) => x.workId === ev.workId)
          if (idx >= 0) {
            next[idx] = ev
            continue
          }
        }
        next.push(ev)
      }
      return next
    })
  }, [])

  const dismissReminder = useCallback(() => setReminderQueue((q) => q.slice(1)), [])

  const persist = useCallback(async (next: AppState) => {
    stateRef.current = next
    setState(next)
    if (window.rian) await window.rian.setState(next)
    else localStorage.setItem('rian-state', JSON.stringify(next))
  }, [])

  const patch = useCallback(
    (fn: (s: AppState) => AppState) => {
      const next = fn(stateRef.current)
      if (next !== stateRef.current) {
        void persist(next)
      }
    },
    [persist]
  )

  const setTheme = useCallback(
    (nextTheme: ThemeMode) => {
      patch((s) => ({ ...s, settings: { ...s.settings, theme: nextTheme } }))
    },
    [patch]
  )

  const setDndMinutes = useCallback(
    (minutes: number) => {
      const dndUntil =
        minutes > 0 ? new Date(Date.now() + minutes * 60_000).toISOString() : undefined
      patch((s) => ({ ...s, settings: { ...s.settings, dndUntil } }))
      setFlash({
        id: createId('fl'),
        title: minutes > 0 ? `已开启勿扰模式（${minutes} 分钟）` : '已退出勿扰模式',
        body: minutes > 0 ? '勿扰期间将暂停自动弹窗与提示音，可随时恢复。' : '定时通知与提醒已恢复正常。',
        source: 'info'
      })
    },
    [patch]
  )

  const snoozeReminder = useCallback(
    (workId: string, minutes: number) => {
      patch((s) => snoozeWorkItem(s, workId, minutes))
      dismissReminder()
    },
    [patch, dismissReminder]
  )

  const completeReminder = useCallback(
    (workId: string) => {
      patch((s) => completeWorkItem(s, workId))
      dismissReminder()
    },
    [patch, dismissReminder]
  )

  const announce = useCallback(
    (ev: NotifyEvent, system = true) => {
      if (ev.modal) {
        pushReminders([ev])
        return
      }
      setFlash({ id: ev.id, title: ev.title, body: ev.body, source: ev.source })
      const next = { ...stateRef.current, inbox: [ev, ...stateRef.current.inbox].slice(0, 100) }
      void persist(next)
      if (system) void showSystemNotify(ev, stateRef.current.settings.sound)
    },
    [persist, pushReminders]
  )

  // Wall-clock accurate Focus / Pomodoro timer
  const startFocus = useCallback(
    (minutes?: number, workId?: string, mode: 'focus' | 'break' = 'focus') => {
      unlockNotifySound()
      const mins = Math.max(1, minutes ?? stateRef.current.settings.focusMinutesDefault ?? 25)
      const totalSeconds = mins * 60
      focusEndAtRef.current = Date.now() + totalSeconds * 1000
      setFocusTimer({
        active: true,
        paused: false,
        mode,
        totalSeconds,
        remainingSeconds: totalSeconds,
        workId
      })
      if (mode === 'focus' && workId) {
        patch((s) => ({
          ...s,
          workItems: s.workItems.map((w) =>
            w.id === workId && w.status === 'todo'
              ? { ...w, status: 'doing', updatedAt: nowIso() }
              : w
          )
        }))
      }
    },
    [patch]
  )

  const pauseResumeFocus = useCallback(() => {
    setFocusTimer((prev) => {
      if (!prev.active) return prev
      if (!prev.paused) {
        const rem = focusEndAtRef.current
          ? Math.max(1, Math.round((focusEndAtRef.current - Date.now()) / 1000))
          : prev.remainingSeconds
        focusEndAtRef.current = null
        return { ...prev, paused: true, remainingSeconds: rem }
      }
      focusEndAtRef.current = Date.now() + prev.remainingSeconds * 1000
      return { ...prev, paused: false }
    })
  }, [])

  const stopFocus = useCallback(() => {
    const cur = focusTimerRef.current
    const endAt = focusEndAtRef.current
    focusEndAtRef.current = null
    setFocusTimer(IDLE_FOCUS)

    if (!cur.active || cur.mode !== 'focus') return
    const rem = !cur.paused && endAt ? Math.max(0, Math.round((endAt - Date.now()) / 1000)) : cur.remainingSeconds
    const elapsedSec = Math.max(0, cur.totalSeconds - rem)
    const elapsedMins = Math.floor(elapsedSec / 60)
    if (elapsedMins >= 1) {
      const updated = recordFocusMinutes(stateRef.current, elapsedMins, cur.workId)
      void persist(updated)
      const workTitle = cur.workId ? stateRef.current.workItems.find((w) => w.id === cur.workId)?.title : undefined
      setFlash({
        id: createId('fl'),
        title: workTitle ? `已结束专注 · ${workTitle}` : '已结束本次专注',
        body: `已为你记录本次专注时长 ${elapsedMins} 分钟。`,
        source: 'work'
      })
    }
  }, [persist])

  useEffect(() => {
    if (!focusTimer.active || focusTimer.paused) return
    const tickFocus = (): void => {
      const endAt = focusEndAtRef.current
      if (!endAt) return
      const rem = Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
      if (rem > 0) {
        setFocusTimer((prev) => (prev.remainingSeconds === rem ? prev : { ...prev, remainingSeconds: rem }))
        return
      }
      // Completed!
      focusEndAtRef.current = null
      const mins = Math.max(1, Math.round(focusTimer.totalSeconds / 60))
      const finishedMode = focusTimer.mode
      const targetWorkId = focusTimer.workId
      const workTitle = targetWorkId
        ? stateRef.current.workItems.find((w) => w.id === targetWorkId)?.title
        : undefined
      setFocusTimer(IDLE_FOCUS)
      playFocusChime(stateRef.current.settings.sound)

      if (finishedMode === 'focus') {
        const updated = recordFocusMinutes(stateRef.current, mins, targetWorkId)
        const ev: NotifyEvent = {
          id: createId('nt'),
          at: nowIso(),
          title: workTitle ? `专注完成 · ${workTitle}` : `已完成 ${mins} 分钟专注`,
          body: '起来活动一下眼睛和肩膀，休息 5 分钟再继续吧。',
          source: 'work',
          read: false,
          workId: targetWorkId
        }
        const withInbox = { ...updated, inbox: [ev, ...updated.inbox].slice(0, 100) }
        void persist(withInbox)
        void showSystemNotify(ev, stateRef.current.settings.sound)
        setFlash({
          id: ev.id,
          title: ev.title,
          body: ev.body,
          source: 'work',
          actionLabel: '休息 5 分钟',
          onAction: () => startFocus(5, undefined, 'break')
        })
      } else {
        const ev: NotifyEvent = {
          id: createId('nt'),
          at: nowIso(),
          title: '休息结束',
          body: '状态回满，随时开启下一段专注。',
          source: 'health',
          read: false
        }
        announce(ev, true)
      }
    }
    const id = window.setInterval(tickFocus, 500)
    return () => window.clearInterval(id)
  }, [focusTimer.active, focusTimer.paused, focusTimer.totalSeconds, focusTimer.mode, focusTimer.workId, persist, announce, startFocus])

  useEffect(() => {
    if (!flash) return
    const id = window.setTimeout(() => setFlash(null), 7000)
    return () => window.clearTimeout(id)
  }, [flash])

  useEffect(() => {
    let unsub = (): void => undefined
    const boot = async (): Promise<void> => {
      if (window.rian) {
        const remote = await window.rian.getState()
        const hydrated = hydrate(remote)
        stateRef.current = hydrated
        setState(hydrated)
        setNotifyPerm('granted')
        unsub = window.rian.onEvent(({ state: next, events }) => {
          const synced = hydrate(next)
          stateRef.current = synced
          setState(synced)
          if (events[0] && !events[0].modal) {
            setFlash({ id: events[0].id, title: events[0].title, body: events[0].body, source: events[0].source })
          }
        })
      } else {
        const raw = localStorage.getItem('rian-state')
        if (raw) {
          try {
            const hydrated = hydrate(JSON.parse(raw) as AppState)
            stateRef.current = hydrated
            setState(hydrated)
          } catch {
            const fb = fallbackState()
            stateRef.current = fb
            setState(fb)
          }
        }
        if (typeof Notification !== 'undefined') setNotifyPerm(Notification.permission)
        const onStorage = (e: StorageEvent): void => {
          if (e.key !== 'rian-state' || !e.newValue) return
          try {
            const synced = hydrate(JSON.parse(e.newValue) as AppState)
            stateRef.current = synced
            setState(synced)
          } catch {
            // ignore corrupted cross-tab payload
          }
        }
        window.addEventListener('storage', onStorage)
        unsub = () => window.removeEventListener('storage', onStorage)
      }
      setReady(true)
    }
    void boot()
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!ready || window.rian) return
    const tick = (): void => {
      const current = stateRef.current
      const rolled = rolloverRepeats(current)
      const { state: next, events } = tickScheduler(rolled)
      if (!events.length && next === current) return
      void persist(next)
      if (!events.length) return
      pushReminders(events)
      for (const ev of events) {
        if (!ev.modal) void showSystemNotify(ev, next.settings.sound)
      }
      if (events[0] && !events[0].modal) {
        setFlash({ id: events[0].id, title: events[0].title, body: events[0].body, source: events[0].source })
      }
    }
    const wait = window.setTimeout(tick, 1200)
    const id = window.setInterval(tick, 20_000)
    const onVisible = (): void => {
      if (!document.hidden) tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(wait)
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ready, persist, pushReminders])

  const enableNotifications = useCallback(async (): Promise<boolean> => {
    if (window.rian) {
      setNotifyPerm('granted')
      announce({
        id: createId('nt'),
        at: nowIso(),
        title: '通知已就绪',
        body: '到点将在系统托盘弹出提醒。',
        source: 'health',
        read: false
      })
      return true
    }
    if (typeof Notification === 'undefined') return false
    const perm = await Notification.requestPermission()
    setNotifyPerm(perm)
    if (perm !== 'granted') return false
    unlockNotifySound()
    announce({
      id: createId('nt'),
      at: nowIso(),
      title: '浏览器通知已启用',
      body: '保持当前标签页开启即可在后台接收准点系统提醒。',
      source: 'health',
      read: false
    })
    return true
  }, [announce])

  const testNotify = useCallback(() => {
    unlockNotifySound()
    announce({
      id: createId('nt'),
      at: nowIso(),
      title: '小猫工作助手 · 通道正常',
      body: '系统通知与声音提醒测试通过，工作项将按设定计划准时推送。',
      source: 'health',
      read: false
    })
  }, [announce])

  const upsertWork = useCallback(
    (item: WorkItem) => {
      patch((s) => ({ ...s, workItems: mergeWorkItem(s, item) }))
    },
    [patch]
  )

  const setWorkStatus = useCallback(
    (workId: string, status: WorkStatus) => {
      if (status === 'done') {
        const target = stateRef.current.workItems.find((w) => w.id === workId)
        if (!target || target.status === 'done') return
        const prevItems = stateRef.current.workItems
        patch((s) => completeWorkItem(s, workId))
        setFlash({
          id: createId('fl'),
          title: `已完成「${target.title}」`,
          body:
            target.repeat !== 'none'
              ? '已自动排期下一周期循环事项，误点可撤销。'
              : '已归档至已完成列表，误点可随时撤销。',
          source: 'work',
          actionLabel: '撤销',
          onAction: () => {
            patch((s) => ({ ...s, workItems: prevItems }))
            setFlash(null)
          }
        })
      } else {
        patch((s) => ({
          ...s,
          workItems: s.workItems.map((item) =>
            item.id === workId
              ? { ...item, status, completedAt: undefined, updatedAt: nowIso() }
              : item
          )
        }))
      }
    },
    [patch]
  )

  const toggleWork = useCallback(
    (w: WorkItem) => {
      setWorkStatus(w.id, w.status !== 'done' ? 'done' : 'todo')
    },
    [setWorkStatus]
  )

  const togglePinWork = useCallback(
    (workId: string) => {
      patch((s) => ({
        ...s,
        workItems: s.workItems.map((w) =>
          w.id === workId ? { ...w, pinned: !w.pinned, updatedAt: nowIso() } : w
        )
      }))
    },
    [patch]
  )

  const toggleSubtask = useCallback(
    (workId: string, subtaskId: string) => {
      patch((s) => ({
        ...s,
        workItems: s.workItems.map((w) => {
          if (w.id !== workId || !w.subtasks) return w
          return {
            ...w,
            updatedAt: nowIso(),
            subtasks: w.subtasks.map((st) => (st.id === subtaskId ? { ...st, done: !st.done } : st))
          }
        })
      }))
    },
    [patch]
  )

  const addSubtask = useCallback(
    (workId: string, title: string) => {
      const clean = title.trim()
      if (!clean) return
      patch((s) => ({
        ...s,
        workItems: s.workItems.map((w) =>
          w.id === workId
            ? {
                ...w,
                updatedAt: nowIso(),
                subtasks: [...(w.subtasks ?? []), { id: createId('st'), title: clean, done: false }]
              }
            : w
        )
      }))
    },
    [patch]
  )

  const deleteWork = useCallback(
    (workId: string) => {
      const target = stateRef.current.workItems.find((x) => x.id === workId)
      if (!target) return
      const prevItems = stateRef.current.workItems
      patch((s) => ({ ...s, workItems: s.workItems.filter((x) => x.id !== workId) }))
      setFlash({
        id: createId('fl'),
        title: `已删除「${target.title}」`,
        body: '如需恢复可点击撤销。',
        source: 'info',
        actionLabel: '撤销',
        onAction: () => {
          patch((s) => ({ ...s, workItems: prevItems }))
          setFlash(null)
        }
      })
    },
    [patch]
  )

  const clearCompletedWork = useCallback(() => {
    const prevItems = stateRef.current.workItems
    const doneCount = prevItems.filter((w) => w.status === 'done').length
    if (!doneCount) return
    patch((s) => ({ ...s, workItems: s.workItems.filter((w) => w.status !== 'done') }))
    setFlash({
      id: createId('fl'),
      title: `已归档清理 ${doneCount} 项已完成事项`,
      body: '误操作可随时点击撤销恢复。',
      source: 'info',
      actionLabel: '撤销',
      onAction: () => {
        patch((s) => ({ ...s, workItems: prevItems }))
        setFlash(null)
      }
    })
  }, [patch])

  const postponeOverdue = useCallback(
    (days = 1) => {
      const prevItems = stateRef.current.workItems
      const { state: next, count } = batchPostponeOverdue(stateRef.current, days)
      if (!count) return
      void persist(next)
      setFlash({
        id: createId('fl'),
        title: `已顺延 ${count} 项逾期工作`,
        body: days === 0 ? '截止时间已统一调整至今天 18:00。' : `截止时间已统一顺延至 ${days} 天后。`,
        source: 'work',
        actionLabel: '撤销',
        onAction: () => {
          patch((s) => ({ ...s, workItems: prevItems }))
          setFlash(null)
        }
      })
    },
    [persist, patch]
  )

  const deleteReport = useCallback(
    (reportId: string) => {
      const target = stateRef.current.reports.find((r) => r.id === reportId)
      if (!target) return
      const prevReports = stateRef.current.reports
      patch((s) => ({ ...s, reports: s.reports.filter((r) => r.id !== reportId) }))
      setFlash({
        id: createId('fl'),
        title: `已移除归档「${target.title}」`,
        body: '仍可随时重新汇总该期报告，或点击撤销恢复。',
        source: 'info',
        actionLabel: '撤销',
        onAction: () => {
          patch((s) => ({ ...s, reports: prevReports }))
          setFlash(null)
        }
      })
    },
    [patch]
  )

  const loadDemoWork = useCallback(() => {
    const demo = seedDemoWork(new Date())
    patch((s) => ({ ...s, workItems: [...demo, ...s.workItems] }))
    setFlash({
      id: createId('fl'),
      title: `已导入 ${demo.length} 条体验示例`,
      body: '可直接体验子步骤勾选、看板拖拽、周月报汇总与 Excel 台账导出。',
      source: 'work'
    })
  }, [patch])

  const postponeWorkItem = useCallback(
    (workId: string, days = 1) => {
      const target = stateRef.current.workItems.find((w) => w.id === workId)
      if (!target || target.status === 'done') return
      const prevDue = target.dueAt
      const nowRef = new Date()
      const baseDay = isPastDue(target.dueAt, nowRef)
        ? new Date(nowRef.getFullYear(), nowRef.getMonth(), nowRef.getDate(), 18, 0, 0, 0)
        : new Date(target.dueAt)
      const nextDue = addDays(baseDay, Math.max(1, days)).toISOString()
      const at = nowIso()
      patch((s) => ({
        ...s,
        workItems: s.workItems.map((w) =>
          w.id === workId
            ? {
                ...w,
                dueAt: nextDue,
                updatedAt: at,
                notify: { ...w.notify, lastFiredAt: undefined, snoozedUntil: undefined }
              }
            : w
        )
      }))
      setFlash({
        id: createId('fl'),
        title: `已顺延「${target.title}」`,
        body: `新截止日期：${toLocalDate(new Date(nextDue))}。`,
        source: 'work',
        actionLabel: '撤销',
        onAction: () => {
          patch((s) => ({
            ...s,
            workItems: s.workItems.map((w) => (w.id === workId ? { ...w, dueAt: prevDue } : w))
          }))
          setFlash(null)
        }
      })
    },
    [patch]
  )

  const shuffleQuote = useCallback(() => {
    const s = stateRef.current.quoteSettings
    const pool = stateRef.current.quotes.filter((q) => q.enabled && s.kinds.includes(q.kind))
    if (!pool.length) return
    const unused = pool.filter((q) => q.id !== s.lastQuoteId)
    const pick = unused[Math.floor(Math.random() * unused.length)] ?? pool[0]
    patch((st) => ({
      ...st,
      quoteSettings: { ...st.quoteSettings, lastQuoteId: pick.id }
    }))
  }, [patch])

  const saveWork = useCallback(
    (item: WorkItem) => {
      const normalized: WorkItem = {
        ...item,
        title: item.title.trim() || '未命名工作项',
        priority: normalizePriority(item.priority),
        tags: item.tags ?? [],
        subtasks: item.subtasks ?? []
      }
      const dueHint = normalized.notify.enabled
        ? `提醒安排：${previewNotifyDate(normalized.dueAt, normalized.notify.advanceDays, normalized.notify.time, normalized.notify.frequency)}。`
        : '已关闭该事项的定时提醒。'
      const ev: NotifyEvent = {
        id: createId('nt'),
        at: nowIso(),
        title: `已保存「${normalized.title}」`,
        body: dueHint,
        source: 'work',
        read: true,
        workId: normalized.id
      }
      patch((s) => ({
        ...s,
        workItems: mergeWorkItem(s, normalized),
        inbox: [ev, ...s.inbox].slice(0, 100)
      }))
      setFlash({ id: ev.id, title: ev.title, body: ev.body, source: 'work' })
    },
    [patch]
  )

  const markInboxRead = useCallback(
    (inboxId: string) => {
      patch((s) => ({
        ...s,
        inbox: s.inbox.map((n) => (n.id === inboxId && !n.read ? { ...n, read: true } : n))
      }))
    },
    [patch]
  )

  const markAllInboxRead = useCallback(() => {
    patch((s) => ({ ...s, inbox: s.inbox.map((n) => (n.read ? n : { ...n, read: true })) }))
  }, [patch])

  const clearInbox = useCallback(() => {
    patch((s) => ({ ...s, inbox: [] }))
  }, [patch])

  const exportState = useCallback((): string => {
    return JSON.stringify(stateRef.current, null, 2)
  }, [])

  const importState = useCallback(
    async (rawJson: string): Promise<{ ok: boolean; message: string }> => {
      try {
        const parsed = JSON.parse(rawJson) as Partial<AppState>
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return { ok: false, message: '备份文件格式不正确（应为 JSON 对象）。' }
        }
        const hasKnownField =
          Array.isArray(parsed.workItems) ||
          Array.isArray(parsed.quotes) ||
          Array.isArray(parsed.health) ||
          Array.isArray(parsed.reports)
        if (!hasKnownField) {
          return { ok: false, message: '未在文件中找到有效的小猫工作助手数据。' }
        }
        const next = hydrate(parsed)
        await persist(next)
        return {
          ok: true,
          message: `已导入 ${next.workItems.length} 条工作项、${next.quotes.length} 条语录与 ${next.reports.length} 份报告。`
        }
      } catch {
        return { ok: false, message: 'JSON 解析失败，请确认文件完整未被修改。' }
      }
    },
    [persist]
  )

  const stats = useMemo(() => {
    const open = state.workItems.filter((w) => w.status !== 'done')
    const doing = open.filter((w) => w.status === 'doing')
    const dueToday = open.filter((w) => isSameDay(new Date(w.dueAt), now))
    const overdue = open.filter((w) => isPastDue(w.dueAt, now))
    const todayStr = toLocalDate(now)
    const todayFocusMinutes =
      state.focusStats?.todayDate === todayStr ? state.focusStats.todayMinutes : 0
    const unreadInbox = state.inbox.filter((n) => !n.read).length
    const dndActive = isDndActive(state.settings, now)
    return {
      open: open.length,
      doing: doing.length,
      dueToday: dueToday.length,
      overdue: overdue.length,
      done: state.workItems.filter((w) => w.status === 'done').length,
      todayFocusMinutes,
      totalFocusMinutes: state.focusStats?.totalMinutes ?? 0,
      unreadInbox,
      dndActive
    }
  }, [state.workItems, state.focusStats, state.inbox, state.settings, now])

  return {
    state,
    theme,
    setTheme,
    setDndMinutes,
    ready,
    now,
    flash,
    setFlash,
    focusTimer,
    defaultFocusMinutes: state.settings.focusMinutesDefault ?? 25,
    startFocus,
    pauseResumeFocus,
    stopFocus,
    reminder: reminderQueue[0] ?? null,
    dismissReminder,
    snoozeReminder,
    completeReminder,
    notifyPerm,
    enableNotifications,
    testNotify,
    announce,
    persist,
    patch,
    upsertWork,
    setWorkStatus,
    toggleWork,
    togglePinWork,
    toggleSubtask,
    addSubtask,
    deleteWork,
    clearCompletedWork,
    postponeOverdue,
    postponeWorkItem,
    deleteReport,
    loadDemoWork,
    shuffleQuote,
    saveWork,
    markInboxRead,
    markAllInboxRead,
    clearInbox,
    exportState,
    importState,
    stats
  }
}

export function newWorkItem(partial: Partial<WorkItem>): WorkItem {
  const t = nowIso()
  return {
    id: createId('wk'),
    title: '未命名工作项',
    notes: '',
    dueAt: t,
    createdAt: t,
    updatedAt: t,
    status: 'todo',
    priority: 'normal',
    subtasks: [],
    notify: { enabled: true, advanceDays: 0, time: '09:00', frequency: 'once' },
    repeat: 'none',
    tags: [],
    ...partial
  }
}
