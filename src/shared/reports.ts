import type { AppState, ReportKind, ReportRecord, ReportStyle, WorkItem } from './types'
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

export function periodOf(kind: ReportKind, around: Date): { start: Date; end: Date } {
  if (kind === 'weekly') return { start: startOfWeek(around), end: endOfWeek(around) }
  return { start: startOfMonth(around), end: endOfMonth(around) }
}

function rateLine(done: number, total: number, style: ReportStyle): string {
  if (total === 0) {
    return style === 'warm'
      ? '这段时间还没有工作项入账，像一张干净的书桌。'
      : '本期暂无录入事项。'
  }
  const r = done / total
  if (style === 'executive') {
    if (r >= 0.8) return '整体交付节奏稳健，核心任务按计划推进。'
    if (r >= 0.5) return '已完成过半事项，剩余任务正按优先级有序跟进。'
    if (done === 0) return '任务处于启动与推进阶段，需重点关注关键节点。'
    return '部分任务存在积压，已梳理优先级集中推进。'
  }
  if (r >= 0.8) return '完成度很高，节奏稳，适合把经验沉淀进下一阶段。'
  if (r >= 0.5) return '完成过半。剩下的事项可以按截止日再排一次优先级。'
  if (done === 0) return '事项还在路上。不必焦虑，先挑一件最小的做完。'
  return '有推进，也有积压。建议把逾期项单独拎出来处理。'
}

function formatWorkRow(w: WorkItem, includeStatus = false): string {
  const tags = w.tags.length ? ` [${w.tags.map((t) => `#${t}`).join(' ')}]` : ''
  const prio = w.priority === 'high' ? '【高优】' : ''
  const sub = w.subtasks?.length
    ? `（子进度 ${w.subtasks.filter((s) => s.done).length}/${w.subtasks.length}）`
    : ''
  const focus = w.focusMinutes ? ` · 专注 ${w.focusMinutes} 分钟` : ''
  const statusTag = includeStatus && w.status === 'doing' ? ' [进行中]' : ''
  return `- ${prio}${w.title}${tags}${statusTag}${sub}（截止 ${formatDateCn(w.dueAt)}${focus}）`
}

export function generateReport(
  state: AppState,
  kind: ReportKind,
  around = new Date(),
  style: ReportStyle = 'executive'
): ReportRecord {
  const { start, end } = periodOf(kind, around)
  const items = state.workItems
  const created = items.filter((w) => inRange(w.createdAt, start, end))
  const done = items.filter((w) => w.status === 'done' && w.completedAt && inRange(w.completedAt, start, end))
  const pending = items.filter((w) => w.status !== 'done' && inRange(w.dueAt, start, end))
  const doing = items.filter((w) => w.status === 'doing')
  const overdue = items.filter((w) => {
    if (w.status === 'done') return false
    const due = new Date(w.dueAt)
    return due.getTime() < around.getTime() && due.getTime() <= end.getTime()
  })
  const stillOpen = items.filter((w) => w.status !== 'done')

  const denominator = done.length + pending.length + overdue.filter((o) => !pending.some((p) => p.id === o.id)).length
  const completionRate = denominator > 0 ? Math.round((done.length / denominator) * 100) : 0
  const periodFocusMinutes = [...done, ...stillOpen].reduce((acc, w) => acc + (w.focusMinutes ?? 0), 0)

  const title =
    kind === 'weekly'
      ? `${start.getMonth() + 1}月${start.getDate()}日 – ${end.getMonth() + 1}月${end.getDate()}日 周报`
      : `${start.getFullYear()}年${start.getMonth() + 1}月月报`

  const list = (arr: WorkItem[], empty: string, includeStatus = false): string => {
    if (!arr.length) return empty
    return [...arr]
      .sort((a, b) => {
        const pa = a.priority === 'high' ? 0 : a.priority === 'low' ? 2 : 1
        const pb = b.priority === 'high' ? 0 : b.priority === 'low' ? 2 : 1
        if (pa !== pb) return pa - pb
        return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
      })
      .map((w) => formatWorkRow(w, includeStatus))
      .join('\n')
  }

  const openList = pending.length
    ? pending
    : stillOpen.filter((w) => inRange(w.dueAt, start, end) || new Date(w.dueAt) > end)

  let body: string

  if (style === 'concise') {
    body = [
      `# ${kind === 'weekly' ? '工作周报' : '工作月报'}（${toLocalDate(start)} ~ ${toLocalDate(end)}）`,
      `概览：完成 ${done.length} 项 | 进行中 ${doing.length} 项 | 待办 ${pending.length} 项 | 逾期 ${overdue.length} 项（完成率 ${completionRate}%）`,
      '',
      '【已完成】',
      list(done, '- 暂无已完成项'),
      '',
      '【进行中 / 待办】',
      list(openList, '- 暂无待办项', true),
      ...(overdue.length ? ['', '【逾期跟进】', list(overdue, '- 无')] : [])
    ].join('\n')
  } else if (style === 'warm') {
    const quote = state.quotes.find((q) => q.id === state.quoteSettings.lastQuoteId)
    const healthHits = state.inbox.filter((n) => n.source === 'health' && inRange(n.at, start, end)).length
    body = [
      kind === 'weekly' ? '本周工作回顾' : '本月工作回顾',
      `${toLocalDate(start)} 至 ${toLocalDate(end)}`,
      '',
      `新建 ${created.length} 项 · 完成 ${done.length} 项 · 期内待办 ${pending.length} 项 · 逾期 ${overdue.length} 项`,
      rateLine(done.length, denominator || created.length, 'warm'),
      '',
      '已完成',
      list(done, '- 本期还没有勾掉的事项。'),
      '',
      '进行中 / 待办',
      list(openList, '- 本期待办是空的，清爽。', true),
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
  } else {
    // executive (default): 严谨汇报风格
    body = [
      `${kind === 'weekly' ? '本周工作汇报' : '本月工作汇报'}`,
      `统计周期：${toLocalDate(start)} 至 ${toLocalDate(end)}`,
      '',
      `一、核心指标概览`,
      `- 事项统计：新建 ${created.length} 项 · 已完成 ${done.length} 项 · 进行中 ${doing.length} 项 · 待办 ${pending.length} 项 · 逾期 ${overdue.length} 项`,
      `- 交付进度：阶段完成率 ${completionRate}%${periodFocusMinutes > 0 ? ` · 累计专注投入 ${periodFocusMinutes} 分钟` : ''}`,
      `- 进度评估：${rateLine(done.length, denominator || created.length, 'executive')}`,
      '',
      '二、重点完成事项',
      list(done, '- 本周期暂无已归档完成事项。'),
      '',
      '三、推进中与近期计划',
      list(openList, '- 当前无积压待办事项。', true),
      '',
      '四、风险与逾期跟进',
      list(overdue, '- 无逾期事项，各项节点正常受控。'),
      '',
      '五、下一阶段重点安排',
      overdue.length
        ? `- 优先闭环逾期事项「${overdue[0].title}」，消除进度滞后风险。`
        : `- 重点推进「${(doing[0] ?? stillOpen[0] ?? created[0])?.title ?? '下一周期核心目标'}」，按计划节点完成交付。`
    ].join('\n')
  }

  return {
    id: createId('rp'),
    kind,
    style,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    generatedAt: nowIso(),
    title,
    body,
    stats: {
      created: created.length,
      done: done.length,
      doing: doing.length,
      pending: pending.length,
      overdue: overdue.length,
      focusMinutes: periodFocusMinutes,
      completionRate
    }
  }
}

export function upsertReport(
  state: AppState,
  kind: ReportKind,
  around = new Date(),
  style: ReportStyle = 'executive'
): AppState {
  const next = generateReport(state, kind, around, style)
  const { start, end } = periodOf(kind, around)
  const rest = state.reports.filter(
    (r) =>
      !(
        r.kind === kind &&
        new Date(r.periodStart).getTime() === start.getTime() &&
        new Date(r.periodEnd).getTime() === end.getTime()
      )
  )
  return { ...state, reports: [next, ...rest].slice(0, 36) }
}
