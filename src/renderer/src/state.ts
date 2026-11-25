import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppState, NotifyEvent, WorkItem } from '@shared/types'
import { EMPTY_STATE } from '@shared/types'
import { seedHealth, seedQuotes } from '@shared/defaults'
import { createId } from '@shared/ids'
import { isPastDue, isSameDay, nowIso } from '@shared/time'
import { completeWorkItem, rolloverRepeats, snoozeWorkItem, tickScheduler } from '@shared/scheduler'
import { previewNotifyDate } from '@shared/parser'
import { showSystemNotify, unlockNotifySound } from './notify'

function fallbackState(): AppState {
  return { ...EMPTY_STATE, quotes: seedQuotes(), health: seedHealth() }
}

function hydrate(raw: Partial<AppState> | null | undefined): AppState {
  const base = fallbackState()
  const safe = raw && typeof raw === 'object' ? raw : {}
  return {
    ...base,
    ...safe,
    workItems: Array.isArray(safe.workItems) ? safe.workItems : [],
    quotes: Array.isArray(safe.quotes) && safe.quotes.length ? safe.quotes : base.quotes,
    health: Array.isArray(safe.health) && safe.health.length ? safe.health : base.health,
    quoteSettings: { ...base.quoteSettings, ...(safe.quoteSettings ?? {}) },
    settings: { ...base.settings, ...(safe.settings ?? {}) },
    reports: Array.isArray(safe.reports) ? safe.reports : [],
    inbox: Array.isArray(safe.inbox) ? safe.inbox : []
  }
}

function mergeWorkItem(s: AppState, item: WorkItem): WorkItem[] {
  const prev = s.workItems.find((w) => w.id === item.id)
  const scheduleChanged = Boolean(
    prev && (
      prev.dueAt !== item.dueAt ||
      prev.notify.enabled !== item.notify.enabled ||
      prev.notify.advanceDays !== item.notify.advanceDays ||
      prev.notify.time !== item.notify.time ||
      prev.notify.frequency !== item.notify.frequency
    )
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
  const [flash, setFlash] = useState<NotifyEvent | null>(null)
  const [reminderQueue, setReminderQueue] = useState<NotifyEvent[]>([])
  const [notifyPerm, setNotifyPerm] = useState<NotificationPermission>(
    typeof Notification === 'undefined' ? 'denied' : Notification.permission
  )
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    const syncNow = (): void => setNow(new Date())
    const id = window.setInterval(syncNow, 60_000)
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

  const announce = useCallback((ev: NotifyEvent, system = true) => {
    if (ev.modal) {
      pushReminders([ev])
      return
    }
    setFlash(ev)
    const next = { ...stateRef.current, inbox: [ev, ...stateRef.current.inbox].slice(0, 80) }
    void persist(next)
    if (system) void showSystemNotify(ev)
  }, [persist, pushReminders])

  useEffect(() => {
    if (!flash) return
    const id = window.setTimeout(() => setFlash(null), 8000)
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
          if (events[0] && !events[0].modal) setFlash(events[0])
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
        if (!ev.modal) void showSystemNotify(ev)
      }
      if (events[0] && !events[0].modal) setFlash(events[0])
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
        title: '通知已打开',
        body: '到点会在系统托盘弹出提醒。这是一条测试。',
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
      title: '通知已打开',
      body: '切到别的标签页也会弹出系统通知。请不要关掉小猫工作助手这个标签，关掉后浏览器会停止计时。',
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
      title: '小猫工作助手 · 测试提醒',
      body: '如果你看到这条，说明通知通道是通的。工作项会在提醒日当天弹出。',
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

  const toggleWork = useCallback(
    (w: WorkItem) => {
      if (w.status !== 'done') {
        patch((s) => completeWorkItem(s, w.id))
      } else {
        patch((s) => ({
          ...s,
          workItems: s.workItems.map((item) =>
            item.id === w.id
              ? { ...item, status: 'todo', completedAt: undefined, updatedAt: nowIso() }
              : item
          )
        }))
      }
    },
    [patch]
  )

  const deleteWork = useCallback(
    (workId: string) => {
      patch((s) => ({ ...s, workItems: s.workItems.filter((x) => x.id !== workId) }))
    },
    [patch]
  )

  const saveWork = useCallback(
    (item: WorkItem) => {
      const normalized: WorkItem = {
        ...item,
        title: item.title.trim() || '未命名工作项'
      }
      const dueHint = normalized.notify.enabled
        ? `系统通知会在 ${previewNotifyDate(normalized.dueAt, normalized.notify.advanceDays, normalized.notify.time)} 弹出，不是保存当下。`
        : '这件工作项没有打开提醒。'
      const ev: NotifyEvent = {
        id: createId('nt'),
        at: nowIso(),
        title: `已记下「${normalized.title}」`,
        body: dueHint,
        source: 'work',
        read: false
      }
      patch((s) => ({
        ...s,
        workItems: mergeWorkItem(s, normalized),
        inbox: [ev, ...s.inbox].slice(0, 80)
      }))
      setFlash(ev)
      void showSystemNotify(ev)
    },
    [patch]
  )

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
    const dueToday = open.filter((w) => isSameDay(new Date(w.dueAt), now))
    const overdue = open.filter((w) => isPastDue(w.dueAt, now))
    return {
      open: open.length,
      dueToday: dueToday.length,
      overdue: overdue.length,
      done: state.workItems.filter((w) => w.status === 'done').length
    }
  }, [state.workItems, now])

  return {
    state,
    ready,
    now,
    flash,
    setFlash,
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
    toggleWork,
    deleteWork,
    saveWork,
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
    notify: { enabled: true, advanceDays: 0, time: '09:00', frequency: 'once' },
    repeat: 'none',
    tags: [],
    ...partial
  }
}
