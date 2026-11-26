import test from 'node:test'
import assert from 'node:assert/strict'
import { parseWorkText } from '../src/shared/parser'
import {
  batchPostponeOverdue,
  completeWorkItem,
  recordFocusMinutes,
  rolloverRepeats,
  snoozeWorkItem,
  tickScheduler
} from '../src/shared/scheduler'
import { generateReport, upsertReport } from '../src/shared/reports'
import { buildExcelFilename, collectMonthlyExcelPlan, generateWorkExcelBytes } from '../src/shared/excel'
import { addMonthsClamped, inWorkHours, nextWorkday, relativeDaysLabel, toLocalDate } from '../src/shared/time'
import { EMPTY_STATE, normalizeTheme, THEME_OPTIONS, type AppState, type WorkItem } from '../src/shared/types'
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
    priority: 'normal',
    subtasks: [],
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

test('parser: extracts hashtags, priority, bare weekdays, and N-days-later offsets', () => {
  const now = new Date(2026, 7, 3, 10, 0, 0) // Monday 2026-08-03
  const d1 = parseWorkText('周五 15:30 架构评审 #研发 #核心 重点', now)
  assert.equal(d1.title, '架构评审')
  assert.equal(toLocalDate(new Date(d1.dueAt)), '2026-08-07')
  assert.equal(d1.notify.time, '15:30')
  assert.equal(d1.priority, 'high')
  assert.deepEqual(d1.tags, ['研发', '核心'])

  const d2 = parseWorkText('3天后 整理归档材料 一般 #行政', now)
  assert.equal(d2.title, '整理归档材料')
  assert.equal(toLocalDate(new Date(d2.dueAt)), '2026-08-06')
  assert.equal(d2.priority, 'normal')
  assert.deepEqual(d2.tags, ['行政'])

  const d3 = parseWorkText('填写工时 每个工作日重复 17:30', now)
  assert.equal(d3.title, '填写工时')
  assert.equal(d3.repeat, 'weekdays')
  assert.equal(d3.notify.time, '17:30')
})

test('parser: handles continuous Chinese sentences, deadline vs start-from dates, periods, and protects nouns', () => {
  const now = new Date(2026, 10, 25, 17, 30, 0) // 2026-11-25

  // User reported sentence (continuous without spaces + start-from today + deadline + daily morning reminder)
  const u1 = parseWorkText('任务:整理财务月报截止日期2026年12月31日从今天开始每天早上10点提醒我一次', now)
  assert.equal(u1.title, '整理财务月报')
  assert.equal(toLocalDate(new Date(u1.dueAt)), '2026-12-31')
  assert.equal(u1.notify.advanceDays, 36) // 2026-11-25 -> 2026-12-31
  assert.equal(u1.notify.time, '10:00')
  assert.equal(u1.notify.frequency, 'daily')
  assert.equal(u1.repeat, 'none')

  // Also tolerates OCR/IME stray bracket in "早」10点"
  const u1Typo = parseWorkText('任务:整理财务月报截止日期2026年12月31日从今天开始每天早」10点提醒我一次', now)
  assert.equal(u1Typo.title, '整理财务月报')
  assert.equal(toLocalDate(new Date(u1Typo.dueAt)), '2026-12-31')
  assert.equal(u1Typo.notify.advanceDays, 36)
  assert.equal(u1Typo.notify.time, '10:00')
  assert.equal(u1Typo.notify.frequency, 'daily')

  // Structured clauses with assignee, priority, weekdays window, and notes
  const u2 = parseWorkText(
    '待办：提交Q4预算表，截止至2026-12-20，自12月10日起每个工作日早上9点半通知我一次 #财务 【重点】 @李四 备注：需附明细表',
    now
  )
  assert.equal(u2.title, '提交Q4预算表')
  assert.equal(toLocalDate(new Date(u2.dueAt)), '2026-12-20')
  assert.equal(u2.notify.advanceDays, 10)
  assert.equal(u2.notify.time, '09:30')
  assert.equal(u2.notify.frequency, 'weekdays')
  assert.equal(u2.priority, 'high')
  assert.equal(u2.assignee, '李四')
  assert.deepEqual(u2.tags, ['财务'])
  assert.equal(u2.notes, '需附明细表')

  // Range syntax "从A到B" + Chinese numerals
  const u3 = parseWorkText('准备年审材料 从12月1日到12月15日 每天上午九点半提醒我', now)
  assert.equal(u3.title, '准备年审材料')
  assert.equal(toLocalDate(new Date(u3.dueAt)), '2026-12-15')
  assert.equal(u3.notify.advanceDays, 14)
  assert.equal(u3.notify.time, '09:30')
  assert.equal(u3.notify.frequency, 'daily')

  // Standalone daily routine without deadline promotes to repeat='daily'
  const u4 = parseWorkText('每天早上9点提交晨会纪要', now)
  assert.equal(u4.title, '提交晨会纪要')
  assert.equal(toLocalDate(new Date(u4.dueAt)), '2026-11-25')
  assert.equal(u4.repeat, 'daily')
  assert.equal(u4.notify.time, '09:00')

  // Protects legitimate nouns ("放假通知", "消息提醒", "三点建议", historical date in title, version dots)
  const u5 = parseWorkText('复盘11月1日线上故障 11月30日前完成', now)
  assert.equal(u5.title, '复盘11月1日线上故障')
  assert.equal(toLocalDate(new Date(u5.dueAt)), '2026-11-30')

  const u6 = parseWorkText('明天发送放假通知', now)
  assert.equal(u6.title, '发送放假通知')

  const u7 = parseWorkText('优化 v2.0 消息提醒模块 明早9点提醒', now)
  assert.equal(u7.title, '优化 v2.0 消息提醒模块')
  assert.equal(toLocalDate(new Date(u7.dueAt)), '2026-11-26')
  assert.equal(u7.notify.time, '09:00')

  const u8 = parseWorkText('整理三点建议 提前一周提醒 12月10日截止', now)
  assert.equal(u8.title, '整理三点建议')
  assert.equal(toLocalDate(new Date(u8.dueAt)), '2026-12-10')
  assert.equal(u8.notify.advanceDays, 7)

  const u9 = parseWorkText('年底前完成固定资产盘点 不提醒', now)
  assert.equal(u9.title, '完成固定资产盘点')
  assert.equal(toLocalDate(new Date(u9.dueAt)), '2026-12-31')
  assert.equal(u9.notify.enabled, false)
})

test('time: addMonthsClamped, nextWorkday, relativeDaysLabel, and cross-midnight inWorkHours', () => {
  const jan31 = new Date(2026, 0, 31, 18, 0, 0)
  assert.equal(toLocalDate(addMonthsClamped(jan31, 1)), '2026-02-28')

  const leapJan31 = new Date(2028, 0, 31, 18, 0, 0)
  assert.equal(toLocalDate(addMonthsClamped(leapJan31, 1)), '2028-02-29')

  const fri = new Date(2026, 7, 7, 18, 0, 0) // Friday
  assert.equal(toLocalDate(nextWorkday(fri)), '2026-08-10') // Monday

  const now = new Date(2026, 7, 10, 12, 0, 0)
  assert.equal(relativeDaysLabel(new Date(2026, 7, 10, 18, 0, 0).toISOString(), now).text, '今日到期')
  assert.equal(relativeDaysLabel(new Date(2026, 7, 8, 18, 0, 0).toISOString(), now).tone, 'danger')

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

test('scheduler: work reminder fires with workId, respects DND, and supports snooze and complete', () => {
  const item = makeWork()
  const t1 = new Date(2026, 7, 6, 9, 0, 0)

  // DND suppresses notifications until expired
  const dndState = makeState({
    workItems: [item],
    health: [],
    quoteSettings: { ...EMPTY_STATE.quoteSettings, enabled: false },
    settings: { ...EMPTY_STATE.settings, dndUntil: new Date(2026, 7, 6, 10, 0, 0).toISOString() }
  })
  assert.equal(tickScheduler(dndState, t1).events.length, 0)

  const base = makeState({
    workItems: [item],
    health: [],
    quoteSettings: { ...EMPTY_STATE.quoteSettings, enabled: false }
  })

  const res1 = tickScheduler(base, t1)
  assert.equal(res1.events.length, 1)
  assert.equal(res1.events[0].workId, item.id)
  assert.equal(res1.events[0].modal, true)

  const snoozed = snoozeWorkItem(res1.state, item.id, 10, t1)
  const resBefore = tickScheduler(snoozed, new Date(2026, 7, 6, 9, 5, 0))
  assert.equal(resBefore.events.length, 0)

  const resAfter = tickScheduler(snoozed, new Date(2026, 7, 6, 9, 10, 0))
  assert.equal(resAfter.events.length, 1)
  assert.equal(resAfter.events[0].workId, item.id)
  assert.equal(resAfter.state.workItems[0].notify.snoozedUntil, undefined)
})

test('scheduler: rolloverRepeats supports monthly clamping, weekdays skip, and resets subtasks', () => {
  const monthly = makeWork({
    id: 'wk_m',
    title: '月末结账',
    dueAt: new Date(2026, 0, 31, 18, 0, 0).toISOString(),
    repeat: 'monthly',
    subtasks: [{ id: 's1', title: '核对流水', done: true }]
  })
  const base = makeState({ workItems: [monthly], health: [] })

  const doneState = completeWorkItem(base, 'wk_m', new Date(2026, 0, 26, 15, 0, 0))
  assert.equal(doneState.workItems.length, 2)
  const next = doneState.workItems.find((w) => w.status === 'todo')
  assert.ok(next)
  assert.equal(toLocalDate(new Date(next.dueAt)), '2026-02-28')
  assert.equal(next.subtasks?.[0].done, false)

  const again = rolloverRepeats(doneState, new Date(2026, 0, 27, 9, 0, 0))
  assert.equal(again.workItems.length, 2)

  // Weekdays repeat on Friday rolls to Monday
  const friTask = makeWork({
    id: 'wk_fri',
    title: '日报',
    dueAt: new Date(2026, 7, 7, 18, 0, 0).toISOString(),
    repeat: 'weekdays'
  })
  const friDone = completeWorkItem(makeState({ workItems: [friTask], health: [] }), 'wk_fri', new Date(2026, 7, 7, 18, 5, 0))
  const nextMon = friDone.workItems.find((w) => w.status === 'todo')
  assert.ok(nextMon)
  assert.equal(toLocalDate(new Date(nextMon.dueAt)), '2026-08-10')
})

test('scheduler: batchPostponeOverdue and recordFocusMinutes update state accurately', () => {
  const now = new Date(2026, 7, 12, 12, 0, 0)
  const overdueItem = makeWork({
    id: 'wk_ov',
    title: '逾期方案',
    dueAt: new Date(2026, 7, 10, 18, 0, 0).toISOString()
  })
  const state = makeState({ workItems: [overdueItem], health: [] })
  const postponed = batchPostponeOverdue(state, 1, now)
  assert.equal(postponed.count, 1)
  assert.equal(toLocalDate(new Date(postponed.state.workItems[0].dueAt)), '2026-08-13')

  const focused = recordFocusMinutes(postponed.state, 25, 'wk_ov', now)
  assert.equal(focused.focusStats?.todayMinutes, 25)
  assert.equal(focused.focusStats?.totalMinutes, 25)
  assert.equal(focused.workItems[0].focusMinutes, 25)
})

test('reports: supports executive/concise/warm styles, carryover overdue items, and deduplicates upsert', () => {
  const now = new Date(2026, 7, 12, 12, 0, 0)
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
    priority: 'high',
    tags: ['交付'],
    focusMinutes: 50,
    dueAt: new Date(2026, 7, 11, 18, 0, 0).toISOString(),
    createdAt: new Date(2026, 7, 10, 9, 0, 0).toISOString(),
    completedAt: new Date(2026, 7, 11, 16, 0, 0).toISOString()
  })
  const state = makeState({ workItems: [oldOverdue, doneThisWeek], health: [] })

  const execReport = generateReport(state, 'weekly', now, 'executive')
  assert.equal(execReport.stats.done, 1)
  assert.equal(execReport.stats.overdue, 1)
  assert.equal(execReport.stats.completionRate, 50)
  assert.match(execReport.body, /上周遗留/)
  assert.match(execReport.body, /【重点】本周完成项/)
  assert.match(execReport.body, /累计专注投入 50 分钟/)

  const conciseReport = generateReport(state, 'weekly', now, 'concise')
  assert.match(conciseReport.body, /完成率 50%/)

  const s1 = upsertReport(state, 'weekly', now)
  const s2 = upsertReport(s1, 'weekly', now)
  assert.equal(s2.reports.length, 1)
})

test('excel: groups completed & planned tasks into 重点/一般 and generates valid xlsx archive', () => {
  const ref = new Date(2026, 10, 25, 12, 0, 0) // 2026-11-25
  const items: WorkItem[] = [
    makeWork({
      id: 'd_k1',
      title: '核心系统升级',
      status: 'done',
      priority: 'high',
      assignee: '张三',
      notes: '已上线',
      dueAt: new Date(2026, 10, 15, 18, 0, 0).toISOString(),
      completedAt: new Date(2026, 10, 14, 17, 0, 0).toISOString()
    }),
    makeWork({
      id: 'd_n1',
      title: '常规巡检归档',
      status: 'done',
      priority: 'normal',
      dueAt: new Date(2026, 10, 20, 18, 0, 0).toISOString(),
      completedAt: new Date(2026, 10, 20, 16, 0, 0).toISOString()
    }),
    makeWork({
      id: 'p_k1',
      title: '年度架构规划',
      status: 'todo',
      priority: 'high',
      dueAt: new Date(2026, 11, 10, 18, 0, 0).toISOString()
    }),
    makeWork({
      id: 'p_n1',
      title: '跨月跟进事项',
      status: 'doing',
      priority: 'normal',
      dueAt: new Date(2026, 10, 28, 18, 0, 0).toISOString()
    })
  ]

  const plan = collectMonthlyExcelPlan(items, {
    monthDate: ref,
    department: '研发部',
    defaultOwner: '李四',
    carryOverOpen: true
  })
  assert.equal(plan.curMonth, 11)
  assert.equal(plan.nextMonth, 12)
  assert.equal(plan.doneKey.length, 1)
  assert.equal(plan.doneNormal.length, 1)
  assert.equal(plan.planKey.length, 1)
  assert.equal(plan.planNormal.length, 1)

  const bytes = generateWorkExcelBytes(items, {
    monthDate: ref,
    department: '研发部',
    defaultOwner: '李四',
    carryOverOpen: true
  })
  assert.equal(bytes[0], 0x50) // 'P'
  assert.equal(bytes[1], 0x4b) // 'K'
  assert.ok(bytes.byteLength > 1500)

  const filename = buildExcelFilename({ monthDate: ref, department: '研发部' })
  assert.equal(filename, '研发部-2026年11月工作完成情况及12月工作计划.xlsx')
})

test('themes: exposes 7 curated themes including eyecare, minimal, cute, and cartoon with safe fallback', () => {
  const ids = THEME_OPTIONS.map((t) => t.id)
  assert.deepEqual(ids, ['slate', 'eyecare', 'minimal', 'cute', 'cartoon', 'paper', 'dark'])
  for (const id of ids) {
    assert.equal(normalizeTheme(id), id)
  }
  assert.equal(normalizeTheme('unknown'), 'slate')
  assert.equal(normalizeTheme(undefined), 'slate')
})
