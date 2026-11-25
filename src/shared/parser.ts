import type { NotifyFrequency, ParsedWorkDraft, RepeatRule, WorkNotify, WorkPriority } from './types'
import { addDays, atLocal, pad2, startOfWeek, toLocalDate } from './time'

const WEEKDAY_MAP: Record<string, number> = {
  日: 0,
  天: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6
}

function strip(text: string, re: RegExp): string {
  return text.replace(re, ' ')
}

function nextWeekday(from: Date, weekday: number): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const delta = (weekday - d.getDay() + 7) % 7
  d.setDate(d.getDate() + (delta === 0 ? 7 : delta))
  return d
}

function thisOrNextWeekDay(from: Date, weekday: number, nextWeekOnly: boolean): Date {
  const monday = startOfWeek(from)
  const offset = weekday === 0 ? 6 : weekday - 1
  if (nextWeekOnly) {
    return addDays(monday, 7 + offset)
  }
  const candidate = addDays(monday, offset)
  const todayStart = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  return candidate.getTime() < todayStart.getTime() ? addDays(candidate, 7) : candidate
}

function clampedDate(year: number, monthIndex: number, day: number): Date {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  return new Date(year, monthIndex, Math.min(Math.max(1, day), lastDay))
}

function applyPeriod(hour: number, period?: string): number {
  let h = hour
  if (period === '下午' || period === '晚上') {
    if (h < 12) h += 12
  } else if (period === '中午') {
    if (h < 11) h += 12
  } else if (period === '上午' && h === 12) {
    h = 0
  }
  return Math.min(23, Math.max(0, h))
}

function parseTime(raw: string): { time: string; used: boolean } {
  const colon = raw.match(/(上午|中午|下午|晚上)?\s*(\d{1,2})\s*[:：]\s*(\d{2})/)
  if (colon) {
    const h = applyPeriod(Number(colon[2]), colon[1])
    const m = Math.min(59, Number(colon[3]))
    return { time: `${pad2(h)}:${pad2(m)}`, used: true }
  }
  const point = raw.match(/(上午|中午|下午|晚上)?\s*(\d{1,2})\s*点(?:\s*(\d{1,2})\s*分?|(半))?/)
  if (point) {
    const h = applyPeriod(Number(point[2]), point[1])
    const m = point[4] ? 30 : point[3] ? Math.min(59, Number(point[3])) : 0
    return { time: `${pad2(h)}:${pad2(m)}`, used: true }
  }
  return { time: '09:00', used: false }
}

function parseFrequency(raw: string): { frequency: NotifyFrequency; used: boolean } {
  if (/每小时/.test(raw)) return { frequency: 'hourly', used: true }
  if (/(?:每个?工作日|工作日)(?!重复)/.test(raw)) return { frequency: 'weekdays', used: true }
  if (/(?:每天|每日)(?!重复)/.test(raw)) return { frequency: 'daily', used: true }
  if (/仅一次|只提醒一次|一次即可/.test(raw)) return { frequency: 'once', used: true }
  return { frequency: 'once', used: false }
}

function parseRepeat(raw: string): { repeat: RepeatRule; weekday?: number; monthDay?: number; used: boolean } {
  const monthly = raw.match(/每月\s*(\d{1,2})\s*[号日]?/)
  if (monthly) {
    return { repeat: 'monthly', monthDay: Number(monthly[1]), used: true }
  }
  const weekly = raw.match(/每周\s*[周星期礼拜]?\s*([一二三四五六日天])/)
  if (weekly) {
    return { repeat: 'weekly', weekday: WEEKDAY_MAP[weekly[1]], used: true }
  }
  if (/每个?工作日重复|工作日例行/.test(raw)) return { repeat: 'weekdays', used: true }
  if (/每天重复|每日重复|每日例行/.test(raw)) return { repeat: 'daily', used: true }
  if (/每月/.test(raw)) return { repeat: 'monthly', used: true }
  if (/每周/.test(raw)) return { repeat: 'weekly', used: true }
  return { repeat: 'none', used: false }
}

function parseTags(raw: string): { tags: string[]; cleaned: string } {
  const tags: string[] = []
  const cleaned = raw.replace(/#([\p{L}\p{N}_-]{1,20})/gu, (_m, tag: string) => {
    if (!tags.includes(tag)) tags.push(tag)
    return ' '
  })
  return { tags, cleaned }
}

function parsePriority(raw: string): { priority: WorkPriority; used: boolean; cleaned: string } {
  let priority: WorkPriority = 'normal'
  let used = false
  let cleaned = raw

  const highRe = /(?<=^|[\s，,。.\[【])(重点|重要|紧急|加急|高优|高优先级|P0|P1)(?=$|[\s，,。.\]】])/gi
  const normalRe = /(?<=^|[\s，,。.\[【])(一般|一般优先级|普通|普通优先级|中优|低优|低优先级|不急|次要|P2|P3)(?=$|[\s，,。.\]】])/gi
  const bangRe = /(!{2,}|！{2,})/g

  if (highRe.test(cleaned) || bangRe.test(cleaned)) {
    priority = 'high'
    used = true
    cleaned = cleaned.replace(highRe, ' ').replace(bangRe, ' ')
  } else if (normalRe.test(cleaned)) {
    priority = 'normal'
    used = true
    cleaned = cleaned.replace(normalRe, ' ')
  }

  cleaned = cleaned.replace(/\[\s*\]|【\s*】/g, ' ')
  return { priority, used, cleaned }
}

function resolveDate(raw: string, now: Date): { date: Date; used: boolean; hint?: string } {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (/大后天/.test(raw)) return { date: addDays(todayStart, 3), used: true }
  if (/后天/.test(raw)) return { date: addDays(todayStart, 2), used: true }
  if (/明天/.test(raw)) return { date: addDays(todayStart, 1), used: true }
  if (/今天|今日/.test(raw)) return { date: todayStart, used: true }

  const daysLater = raw.match(/(\d{1,3})\s*[天日](?:后|之后|内)/)
  if (daysLater) {
    return { date: addDays(todayStart, Math.max(0, Number(daysLater[1]))), used: true }
  }

  const weeksLater = raw.match(/(\d{1,2})\s*(?:周|个?星期)(?:后|之后|内)/)
  if (weeksLater) {
    return { date: addDays(todayStart, Math.max(1, Number(weeksLater[1])) * 7), used: true }
  }

  const fullCn = raw.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[号日]?/)
  if (fullCn) {
    return { date: clampedDate(Number(fullCn[1]), Number(fullCn[2]) - 1, Number(fullCn[3])), used: true }
  }

  const fullIso = raw.match(/(\d{4})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{1,2})/)
  if (fullIso) {
    return { date: clampedDate(Number(fullIso[1]), Number(fullIso[2]) - 1, Number(fullIso[3])), used: true }
  }

  const nextMonthDay = raw.match(/下个?月\s*(\d{1,2})\s*[号日]?/)
  if (nextMonthDay) {
    return { date: clampedDate(now.getFullYear(), now.getMonth() + 1, Number(nextMonthDay[1])), used: true }
  }

  if (/下个?月底/.test(raw)) {
    return { date: new Date(now.getFullYear(), now.getMonth() + 2, 0), used: true }
  }

  if (/本?月底/.test(raw)) {
    return { date: new Date(now.getFullYear(), now.getMonth() + 1, 0), used: true }
  }

  const md = raw.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[号日]?/) ?? raw.match(/(?<!\d)(\d{1,2})\s*[-/]\s*(\d{1,2})(?!\d)/)
  if (md) {
    const month = Number(md[1]) - 1
    const day = Number(md[2])
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      let date = clampedDate(now.getFullYear(), month, day)
      if (date.getTime() < todayStart.getTime()) {
        date = clampedDate(now.getFullYear() + 1, month, day)
        return { date, used: true, hint: '该日期今年已过，已顺延到明年' }
      }
      return { date, used: true }
    }
  }

  const nextWeek = raw.match(/下周\s*[周星期礼拜]?\s*([一二三四五六日天])/)
  if (nextWeek) {
    return { date: thisOrNextWeekDay(now, WEEKDAY_MAP[nextWeek[1]], true), used: true }
  }

  const thisWeek = raw.match(/(?:本周|这周)\s*[周星期礼拜]?\s*([一二三四五六日天])/)
  if (thisWeek) {
    return { date: thisOrNextWeekDay(now, WEEKDAY_MAP[thisWeek[1]], false), used: true }
  }

  const weekly = raw.match(/每周\s*[周星期礼拜]?\s*([一二三四五六日天])/)
  if (weekly) {
    return { date: nextWeekday(now, WEEKDAY_MAP[weekly[1]]), used: true }
  }

  const bareWeekday = raw.match(/(?<![每下本这])(?:周|星期|礼拜)\s*([一二三四五六日天])/)
  if (bareWeekday) {
    return { date: thisOrNextWeekDay(now, WEEKDAY_MAP[bareWeekday[1]], false), used: true }
  }

  const monthly = raw.match(/每月\s*(\d{1,2})\s*[号日]?/)
  if (monthly) {
    const day = Number(monthly[1])
    let date = clampedDate(now.getFullYear(), now.getMonth(), day)
    if (date.getTime() < todayStart.getTime()) {
      date = clampedDate(now.getFullYear(), now.getMonth() + 1, day)
    }
    return { date, used: true }
  }

  const onlyDay = raw.match(/(\d{1,2})\s*[号日](?!.*月)/)
  if (onlyDay) {
    const day = Number(onlyDay[1])
    let date = clampedDate(now.getFullYear(), now.getMonth(), day)
    if (date.getTime() < todayStart.getTime()) {
      date = clampedDate(now.getFullYear(), now.getMonth() + 1, day)
      return { date, used: true, hint: '该日期本月已过，已顺延到下个月' }
    }
    return { date, used: true }
  }

  if (/每天重复|每日重复|每日例行|每个?工作日重复|工作日例行/.test(raw)) {
    return { date: todayStart, used: true }
  }

  return { date: addDays(todayStart, 1), used: false, hint: '未识别到日期，默认明天' }
}

export function parseWorkText(input: string, now = new Date()): ParsedWorkDraft {
  const sourceText = input.trim()
  const hints: string[] = []
  if (!sourceText) {
    return {
      title: '',
      dueAt: addDays(now, 1).toISOString(),
      priority: 'normal',
      tags: [],
      notify: { enabled: true, advanceDays: 0, time: '09:00', frequency: 'once' },
      repeat: 'none',
      notes: '',
      sourceText,
      confidence: 0,
      hints: ['请输入工作项，例如：月报 8月11号 提前5天通知 #财务 重点']
    }
  }

  const { tags, cleaned: withoutTags } = parseTags(sourceText)
  const { priority, used: priorityUsed, cleaned: withoutPriority } = parsePriority(withoutTags)

  const advance = withoutPriority.match(/提前\s*(\d+)\s*天/)
  const advanceDays = advance ? Number(advance[1]) : 0
  const timeInfo = parseTime(withoutPriority)
  const freqInfo = parseFrequency(withoutPriority)
  const repeatInfo = parseRepeat(withoutPriority)
  const dateInfo = resolveDate(withoutPriority, now)

  if (dateInfo.hint) hints.push(dateInfo.hint)
  if (advanceDays > 0) {
    const notifyDay = addDays(dateInfo.date, -advanceDays)
    hints.push(`将在 ${notifyDay.getMonth() + 1}月${notifyDay.getDate()}日 ${timeInfo.time} 提醒`)
  } else {
    hints.push(`将在截止当天 ${timeInfo.time} 提醒`)
  }

  let title = withoutPriority
  title = strip(title, /(\d{4}\s*年)?\s*\d{1,2}\s*月\s*\d{1,2}\s*[号日]?/g)
  title = strip(title, /\d{4}\s*[-/]\s*\d{1,2}\s*[-/]\s*\d{1,2}/g)
  title = strip(title, /(?<!\d)\d{1,2}\s*[-/]\s*\d{1,2}(?!\d)/g)
  title = strip(title, /下个?月\s*\d{1,2}\s*[号日]?/g)
  title = strip(title, /(?:下个?|本)?月底/g)
  title = strip(title, /每月\s*\d{1,2}\s*[号日]?/g)
  title = strip(title, /\d{1,3}\s*[天日](?:后|之后|内)/g)
  title = strip(title, /\d{1,2}\s*(?:周|个?星期)(?:后|之后|内)/g)
  title = strip(title, /(?:每周|下周|本周|这周)\s*[周星期礼拜]?\s*[一二三四五六日天]/g)
  title = strip(title, /(?:周|星期|礼拜)\s*[一二三四五六日天]/g)
  title = strip(title, /\d{1,2}\s*[号日]/g)
  title = strip(title, /大后天|后天|明天|今天|今日/g)
  title = strip(title, /提前\s*\d+\s*天/g)
  title = strip(title, /(上午|中午|下午|晚上)?\s*\d{1,2}\s*[:：]\s*\d{2}/g)
  title = strip(title, /(上午|中午|下午|晚上)?\s*\d{1,2}\s*点(?:\s*\d{1,2}\s*分?|半)?/g)
  title = strip(
    title,
    /每个?工作日重复|工作日例行|每天重复|每日重复|每日例行|每天|每日|工作日|每个工作日|每小时|仅一次|只提醒一次|一次即可|每月|每周/g
  )
  title = strip(title, /通知|提醒|截止|之前/g)
  title = title.replace(/[，,。.\s]+/g, ' ').trim()

  if (!title) {
    title = '未命名工作项'
    hints.push('没有识别到标题，已使用默认名称，可在下方修改')
  }

  const dueLocal = new Date(
    dateInfo.date.getFullYear(),
    dateInfo.date.getMonth(),
    dateInfo.date.getDate(),
    18,
    0,
    0,
    0
  )

  const notify: WorkNotify = {
    enabled: true,
    advanceDays,
    time: timeInfo.time,
    frequency: freqInfo.frequency
  }

  let confidence = 0.4
  if (dateInfo.used) confidence += 0.25
  if (title && title !== '未命名工作项') confidence += 0.2
  if (advance) confidence += 0.1
  if (timeInfo.used || priorityUsed || tags.length > 0) confidence += 0.05

  return {
    title,
    dueAt: dueLocal.toISOString(),
    priority,
    tags,
    notify,
    repeat: repeatInfo.repeat,
    notes: '',
    sourceText,
    confidence: Math.min(1, confidence),
    hints
  }
}

export function describeDraft(draft: ParsedWorkDraft): string {
  const due = new Date(draft.dueAt)
  const notifyDay = addDays(new Date(due.getFullYear(), due.getMonth(), due.getDate()), -draft.notify.advanceDays)
  const freqLabel: Record<NotifyFrequency, string> = {
    once: '到期前提醒一次',
    daily: '每天提醒',
    hourly: '每小时提醒',
    weekdays: '工作日提醒'
  }
  const repeatLabel: Record<RepeatRule, string> = {
    none: '不重复',
    daily: '每天重复',
    weekdays: '工作日重复',
    weekly: '每周重复',
    monthly: '每月重复'
  }
  const prioLabel: Record<WorkPriority, string> = {
    high: '重点',
    normal: '一般'
  }
  const parts = [
    `工作项「${draft.title}」`,
    `截止 ${due.getMonth() + 1}月${due.getDate()}日`,
    `提醒日 ${notifyDay.getMonth() + 1}月${notifyDay.getDate()}日 ${draft.notify.time}`,
    freqLabel[draft.notify.frequency],
    `优先级：${prioLabel[draft.priority]}`
  ]
  if (draft.repeat !== 'none') parts.push(repeatLabel[draft.repeat])
  if (draft.tags.length) parts.push(draft.tags.map((t) => `#${t}`).join(' '))
  return parts.join(' · ')
}

export function previewNotifyDate(dueAt: string, advanceDays: number, time: string): string {
  const due = new Date(dueAt)
  const day = addDays(new Date(due.getFullYear(), due.getMonth(), due.getDate()), -advanceDays)
  return `${toLocalDate(day)} ${time}`
}

export { atLocal }
