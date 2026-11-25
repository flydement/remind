import test from 'node:test'
import assert from 'node:assert/strict'
import { parseWorkText } from '../src/shared/parser'
import { completeWorkItem, rolloverRepeats, snoozeWorkItem, tickScheduler } from '../src/shared/scheduler'
import { generateReport, upsertReport } from '../src/shared/reports'
import { addMonthsClamped, inWorkHours, toLocalDate } from '../src/shared/time'
import { EMPTY_STATE, type AppState, type WorkItem } from '../src/shared/types'
import { seedHealth, seedQuotes } from '../src/shared/defaults'

function makeState(partial: Partial<AppState> = {}): AppState {
  return {
    ...EMPTY_STATE,
    quotes: seedQuotes(),
    health: seedHealth(),
    ...partial
  }
}

function makeWork(partial: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 'wk_test',
    title: '月报',
    notes: '',
    dueAt: new Date(2026, 7, 11, 18, 0, 0, 0).toISOString(),
    createdAt: new Date(2026, 7, 1, 9, 0, 0, 0).toISOString(),
    updatedAt: new Date(2026, 7, 1, 9, 0, 0, 0).toISOString(),
    status: 'todo',
    notify: {
      enabled: true,
      advanceDays: 5,
      time: '09:00',
      frequency: 'once'
    },
    repeat: 'none',
    tags: [],
    ...partial
  }
}

test('parser: parses Chinese date, advance days, and strips relative tokens from title', () => {
  const now = new Date(2026, 7, 1, 10, 0, 0) // 2026-08-01 (Saturday)
  const d1 = parseWorkText('月报 8月11号 提前5天通知', now)
  assert.equal(d1.title, '月报')
  assert.equal(toLocalDate(new Date(d1.dueAt)), '2026-08-11')
  assert.equal(d1.notify.advanceDays, 5)
  assert.equal(d1.notify.time, '09:00')

  const d2 = parseWorkText('明天交方案 下午3点15分', now)
  assert.equal(d2.title, '交方案')
  assert.equal(toLocalDate(new Date(d2.dueAt)), '2026-08-02')
  assert.equal(d2.notify.time, '15:15')

  const d3 = parseWorkText('下周三评审 14:30', now)
  assert.equal(d3.title, '评审')
  assert.equal(toLocalDate(new Date(d3.dueAt)), '2026-08-05')
  assert.equal(d3.notify.time, '14:30')

  const d4 = parseWorkText('月底对账', now)
  assert.equal(d4.title, '对账')
  assert.equal(toLocalDate(new Date(d4.dueAt)), '2026-08-31')

  const d5 = parseWorkText('提交材料 9/5 晚上8点半', now)
  assert.equal(d5.title, '提交材料')
  assert.equal(toLocalDate(new Date(d5.dueAt)), '2026-09-05')
  assert.equal(d5.notify.time, '20:30')
})

test('time: addMonthsClamped avoids month-end overflow and inWorkHours supports cross-midnight', () => {
  const jan31 = new Date(2026, 0, 31, 18, 0, 0)
  assert.equal(toLocalDate(addMonthsClamped(jan31, 1)), '2026-02-28')

  const leapJan31 = new Date(2028, 0, 31, 18, 0, 0)
  assert.equal(toLocalDate(addMonthsClamped(leapJan31, 1)), '2028-02-29')

  assert.equal(inWorkHours(new Date(2026, 7, 1, 23, 30), '22:00', '06:00'), true)
  assert.equal(inWorkHours(new Date(2026, 7, 1, 5, 30), '22:00', '06:00'), true)
  assert.equal(inWorkHours(new Date(2026, 7, 1, 12, 0), '22:00', '06:00'), false)
})

test('scheduler: health reminders do not fire storm on first tick and fire after interval', () => {
  const start = new Date(2026, 7, 3, 10, 0, 0)
  const initial = makeState({
    quoteSettings: { ...EMPTY_STATE.quoteSettings, enabled: false }
  })

  const first = tickScheduler(initial, start)
  assert.equal(first.events.length, 0)
  assert.notEqual(first.state, initial)

  const after30m = new Date(2026, 7, 3, 10, 30, 0)
  const second = tickScheduler(first.state, after30m)
  assert.equal(second.events.length, 1)
  assert.equal(second.events[0].source, 'health')
  assert.match(second.events[0].title, /看看远处/)
})

test('scheduler: work reminder fires with workId, supports snooze and complete', () => {
  const item = makeWork()
  const base = makeState({
    workItems: [item],
    health: [],
    quoteSettings: { ...EMPTY_STATE.quoteSettings, enabled: false }
  })

  // 2026-08-06 09:00 (5 days before 2026-08-11)
  const t1 = new Date(2026, 7, 6, 9, 0, 0)
  const res1 = tickScheduler(base, t1)
  assert.equal(res1.events.length, 1)
  assert.equal(res1.events[0].workId, item.id)
  assert.equal(res1.events[0].modal, true)

  // Snooze 10 minutes
  const snoozed = snoozeWorkItem(res1.state, item.id, 10, t1)
  const resBefore = tickScheduler(snoozed, new Date(2026, 7, 6, 9, 5, 0))
  assert.equal(resBefore.events.length, 0)

  const resAfter = tickScheduler(snoozed, new Date(2026, 7, 6, 9, 10, 0))
  assert.equal(resAfter.events.length, 1)
  assert.equal(resAfter.events[0].workId, item.id)
  assert.equal(resAfter.state.workItems[0].notify.snoozedUntil, undefined)
})

test('scheduler: rolloverRepeats works on early completion and clamps month-end', () => {
  const monthly = makeWork({
    id: 'wk_m',
    title: '月末结账',
    dueAt: new Date(2026, 0, 31, 18, 0, 0).toISOString(),
    repeat: 'monthly'
  })
  const base = makeState({ workItems: [monthly], health: [] })

  // Complete 5 days early (Jan 26)
  const doneState = completeWorkItem(base, 'wk_m', new Date(2026, 0, 26, 15, 0, 0))
  assert.equal(doneState.workItems.length, 2)
  const next = doneState.workItems.find((w) => w.status === 'todo')
  assert.ok(next)
  assert.equal(toLocalDate(new Date(next.dueAt)), '2026-02-28')

  // Running rolloverRepeats again must not create duplicates
  const again = rolloverRepeats(doneState, new Date(2026, 0, 27, 9, 0, 0))
  assert.equal(again.workItems.length, 2)
})

test('reports: includes carryover overdue items and deduplicates same-period upsert', () => {
  const now = new Date(2026, 7, 12, 12, 0, 0) // Wed 2026-08-12
  const oldOverdue = makeWork({
    id: 'wk_old',
    title: '上周遗留',
    dueAt: new Date(2026, 7, 5, 18, 0, 0).toISOString(),
    createdAt: new Date(2026, 7, 1, 9, 0, 0).toISOString()
  })
  const doneThisWeek = makeWork({
    id: 'wk_done',
    title: '本周完成项',
    status: 'done',
    dueAt: new Date(2026, 7, 11, 18, 0, 0).toISOString(),
    createdAt: new Date(2026, 7, 10, 9, 0, 0).toISOString(),
    completedAt: new Date(2026, 7, 11, 16, 0, 0).toISOString()
  })
  const state = makeState({ workItems: [oldOverdue, doneThisWeek], health: [] })

  const report = generateReport(state, 'weekly', now)
  assert.equal(report.stats.done, 1)
  assert.equal(report.stats.overdue, 1)
  assert.match(report.body, /上周遗留/)
  assert.match(report.body, /本周完成项/)

  const s1 = upsertReport(state, 'weekly', now)
  const s2 = upsertReport(s1, 'weekly', now)
  assert.equal(s2.reports.length, 1)
})
