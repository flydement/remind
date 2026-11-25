export function nowIso(): string {
  return new Date().toISOString()
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function parseHm(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(':').map((x) => Number(x))
  return { h: Number.isFinite(h) ? h : 9, m: Number.isFinite(m) ? m : 0 }
}

export function atLocal(date: string, time: string): Date {
  const { h, m } = parseHm(time)
  const [y, mo, d] = date.split('-').map(Number)
  return new Date(y, mo - 1, d, h, m, 0, 0)
}

export function formatDateCn(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export function formatDateTimeCn(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function weekdayCn(d: Date): string {
  return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
}

export function greeting(d = new Date()): string {
  const h = d.getHours()
  if (h < 6) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

export function startOfWeek(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = copy.getDay() || 7
  copy.setDate(copy.getDate() - day + 1)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function endOfWeek(d: Date): Date {
  const s = startOfWeek(d)
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6, 23, 59, 59, 999)
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0)
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), 0, 0)
}

export function nextWorkday(d: Date): Date {
  let next = addDays(d, 1)
  while (next.getDay() === 0 || next.getDay() === 6) {
    next = addDays(next, 1)
  }
  return next
}

export function addMonthsClamped(d: Date, months: number): Date {
  const totalMonths = d.getFullYear() * 12 + d.getMonth() + months
  const year = Math.floor(totalMonths / 12)
  const month = ((totalMonths % 12) + 12) % 12
  const lastDay = new Date(year, month + 1, 0).getDate()
  const day = Math.min(d.getDate(), lastDay)
  return new Date(year, month, day, d.getHours(), d.getMinutes(), 0, 0)
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function inWorkHours(now: Date, start: string, end: string): boolean {
  const { h: sh, m: sm } = parseHm(start)
  const { h: eh, m: em } = parseHm(end)
  const t = now.getHours() * 60 + now.getMinutes()
  const s = sh * 60 + sm
  const e = eh * 60 + em
  if (s <= e) return t >= s && t <= e
  // 支持跨午夜工作时段，例如 22:00 - 06:00
  return t >= s || t <= e
}

export function isPastDue(dueAt: string, now = new Date()): boolean {
  const t = new Date(dueAt).getTime()
  return Number.isFinite(t) && t < now.getTime()
}

export function relativeDaysLabel(
  dueAt: string,
  now = new Date()
): { text: string; tone: 'danger' | 'warn' | 'accent' | 'neutral' } {
  const due = new Date(dueAt)
  if (!Number.isFinite(due.getTime())) return { text: '未知日期', tone: 'neutral' }
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const diffDays = Math.round((dueStart - todayStart) / 86_400_000)

  if (isPastDue(dueAt, now)) {
    const over = Math.max(0, -diffDays)
    return {
      text: over === 0 ? '今日已逾时' : `逾期 ${over} 天`,
      tone: 'danger'
    }
  }
  if (diffDays === 0) return { text: '今日到期', tone: 'warn' }
  if (diffDays === 1) return { text: '明天截止', tone: 'accent' }
  if (diffDays === 2) return { text: '后天截止', tone: 'neutral' }
  if (diffDays > 2 && diffDays <= 7) return { text: `${diffDays} 天后`, tone: 'neutral' }
  return { text: formatDateCn(due), tone: 'neutral' }
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / 60000
}

export function dueDateOf(itemDueAt: string): string {
  const d = new Date(itemDueAt)
  return toLocalDate(d)
}
