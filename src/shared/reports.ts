import type { AppState, ReportKind, ReportRecord, WorkItem } from './types'
import { createId } from './ids'
import {
  endOfMonth,
  endOfWeek,
  formatDateCn,
  nowIso,
  startOfMonth,
  startOfWeek,
  toLocalDate
} from './time'

function inRange(iso: string, start: Date, end: Date): boolean {
  const t = new Date(iso).getTime()
  return t >= start.getTime() && t <= end.getTime()
}

function periodOf(kind: ReportKind, around: Date): { start: Date; end: Date } {
  if (kind === 'weekly') return { start: startOfWeek(around), end: endOfWeek(around) }
  return { start: startOfMonth(around), end: endOfMonth(around) }
}

function rateLine(done: number, total: number): string {
  if (total === 0) return '这段时间还没有工作项入账，像一张干净的书桌。'
  const r = done / total
  if (r >= 0.8) return '完成度很高，节奏稳，适合把经验沉淀进下一阶段。'
  if (r >= 0.5) return '完成过半。剩下的事项可以按截止日再排一次优先级。'
  if (done === 0) return '事项还在路上。不必焦虑，先挑一件最小的做完。'
  return '有推进，也有积压。建议把逾期项单独拎出来处理。'
}

export function generateReport(state: AppState, kind: ReportKind, around = new Date()): ReportRecord {
  const { start, end } = periodOf(kind, around)
  const items = state.workItems
  const created = items.filter((w) => inRange(w.createdAt, start, end))
  const done = items.filter((w) => w.status === 'done' && w.completedAt && inRange(w.completedAt, start, end))
  const pending = items.filter((w) => w.status !== 'done' && inRange(w.dueAt, start, end))
  const overdue = items.filter((w) => {
    if (w.status === 'done') return false
    const due = new Date(w.dueAt)
    return due.getTime() < around.getTime() && due.getTime() <= end.getTime()
  })
  const stillOpen = items.filter((w) => w.status !== 'done')

  const title = kind === 'weekly'
    ? `${start.getMonth() + 1}月${start.getDate()}日 – ${end.getMonth() + 1}月${end.getDate()}日 周报`
    : `${start.getFullYear()}年${start.getMonth() + 1}月月报`

  const list = (arr: WorkItem[], empty: string): string => {
    if (!arr.length) return empty
    return [...arr]
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
      .map((w) => `- ${w.title}（截止 ${formatDateCn(w.dueAt)}）`)
      .join('\n')
  }

  const quote = state.quotes.find((q) => q.id === state.quoteSettings.lastQuoteId)
  const healthHits = state.inbox.filter(
    (n) => n.source === 'health' && inRange(n.at, start, end)
  ).length

  const body = [
    kind === 'weekly' ? '本周工作回顾' : '本月工作回顾',
    `${toLocalDate(start)} 至 ${toLocalDate(end)}`,
    '',
    `新建 ${created.length} 项 · 完成 ${done.length} 项 · 期内待办 ${pending.length} 项 · 逾期 ${overdue.length} 项`,
    rateLine(done.length, created.length || pending.length + done.length),
    '',
    '已完成',
    list(done, '- 本期还没有勾掉的事项。'),
    '',
    '进行中 / 待办',
    list(pending.length ? pending : stillOpen.filter((w) => inRange(w.dueAt, start, end) || new Date(w.dueAt) > end), '- 本期待办是空的，清爽。'),
    '',
    '逾期需关注',
    list(overdue, '- 没有逾期，很好。'),
    '',
    '工作节奏',
    healthHits > 0
      ? `- 健康提醒推送了 ${healthHits} 次。记得真的站起来，而不是点掉通知。`
      : '- 健康提醒较少被触发，可以到「健康提醒」里把间隔调得更贴近你的工位节奏。',
    quote ? `- 最近一条语言库：${quote.content}` : '- 语言库还没开始每日推送，可以在「语言库」打开每天一条。',
    '',
    '下一阶段建议',
    overdue.length
      ? `- 先处理 ${overdue[0].title}，再安排新事项。`
      : `- 从「${(stillOpen[0] ?? created[0])?.title ?? '下一件小事'}」开始，比重新规划清单更有效。`
  ].join('\n')

  return {
    id: createId('rp'),
    kind,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    generatedAt: nowIso(),
    title,
    body,
    stats: {
      created: created.length,
      done: done.length,
      pending: pending.length,
      overdue: overdue.length
    }
  }
}

export function upsertReport(state: AppState, kind: ReportKind, around = new Date()): AppState {
  const next = generateReport(state, kind, around)
  const { start, end } = periodOf(kind, around)
  const rest = state.reports.filter(
    (r) =>
      !(
        r.kind === kind &&
        new Date(r.periodStart).getTime() === start.getTime() &&
        new Date(r.periodEnd).getTime() === end.getTime()
      )
  )
  return { ...state, reports: [next, ...rest].slice(0, 24) }
}
