import type { NotifyFrequency, ParsedWorkDraft, RepeatRule, WorkNotify, WorkPriority } from './types'
import { addDays, atLocal, nextWorkday, pad2, startOfWeek, toLocalDate } from './time'

export interface SyntaxGuideItem {
  category: string
  patterns: string
  example: string
}

/**
 * 结构化任务创建语言规范（供界面语法面板与提示统一引用）
 */
export const WORK_SYNTAX_GUIDE: SyntaxGuideItem[] = [
  {
    category: '事项标题',
    patterns: '直接书写，或使用「任务： / 待办： / 提醒我…」开头',
    example: '任务：整理财务月报'
  },
  {
    category: '截止日期',
    patterns: '截止2026年12月31日 · 12/31前 · 明天 · 3天后 · 下周三 · 月底 · 年底',
    example: '截止日期2026年12月31日'
  },
  {
    category: '提醒起点',
    patterns: '从今天开始 · 自12月1日起 · 即日起 · 提前5天 · 提前一周 · 从A到B',
    example: '从今天开始'
  },
  {
    category: '时刻与频次',
    patterns: '每天早上10点提醒我一次 · 每个工作日 09:30 · 下午3点半 · 每小时 · 不提醒',
    example: '每天早上10点提醒我一次'
  },
  {
    category: '例行循环',
    patterns: '每天重复 · 每个工作日重复 · 每周五 · 每月10号（无截止日时自动转为周期事项）',
    example: '每个工作日重复 17:30 填写工时'
  },
  {
    category: '属性标记',
    patterns: '重点 / 一般 · #分类标签 · @责任人（或 负责人：张三） · 备注：补充说明',
    example: '#财务 重点 @张三'
  }
]

const WEEKDAY_MAP: Record<string, number> = {
  日: 0,
  天: 0,
  末: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6
}

const CN_DIGIT: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9
}

const CN_NUM = '(?:\\d+|[一二两三四五六七八九]?十[一二三四五六七八九]?|[零〇]?[一二两三四五六七八九])'
const PERIOD_WORD = '(?:凌晨|清晨|早上|早晨|上午|中午|正午|下午|午后|傍晚|黄昏|晚上|夜晚|夜里|早|晚)'

function parseCnInt(raw: string): number {
  const s = raw.trim()
  if (/^\d+$/.test(s)) return Number(s)
  if (s === '十') return 10
  const tenIdx = s.indexOf('十')
  if (tenIdx >= 0) {
    const tens = tenIdx === 0 ? 1 : (CN_DIGIT[s[0]] ?? 1)
    const ones = tenIdx < s.length - 1 ? (CN_DIGIT[s[tenIdx + 1]] ?? 0) : 0
    return tens * 10 + ones
  }
  let val = 0
  for (const ch of s) {
    if (ch in CN_DIGIT) val = val * 10 + CN_DIGIT[ch]
  }
  return val
}

function dayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function diffCalendarDays(later: Date, earlier: Date): number {
  const a = dayStart(later).getTime()
  const b = dayStart(earlier).getTime()
  return Math.round((a - b) / 86_400_000)
}

function nextWeekday(from: Date, weekday: number): Date {
  const d = dayStart(from)
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
  const today = dayStart(from)
  return candidate.getTime() < today.getTime() ? addDays(candidate, 7) : candidate
}

function todayOrNextWorkday(from: Date): Date {
  const d = dayStart(from)
  const wd = d.getDay()
  if (wd >= 1 && wd <= 5) return d
  return dayStart(nextWorkday(d))
}

function clampedDate(year: number, monthIndex: number, day: number): Date {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  return new Date(year, monthIndex, Math.min(Math.max(1, day), lastDay))
}

function applyPeriod(hour: number, period?: string): number {
  let h = hour
  if (!period) return Math.min(23, Math.max(0, h))
  if (/下午|午后|傍晚|黄昏|晚上|夜晚|夜里|晚/.test(period)) {
    if (h < 12) h += 12
  } else if (/中午|正午/.test(period)) {
    if (h < 11) h += 12
  } else if (/凌晨|清晨|早上|早晨|上午|早/.test(period) && h === 12) {
    h = 0
  }
  return Math.min(23, Math.max(0, h))
}

function defaultHourForPeriod(period: string): string {
  if (/凌晨/.test(period)) return '07:00'
  if (/清晨|早上|早晨|上午|早/.test(period)) return '09:00'
  if (/中午|正午/.test(period)) return '12:00'
  if (/下午|午后/.test(period)) return '14:00'
  if (/傍晚|黄昏/.test(period)) return '18:00'
  return '20:00'
}

/**
 * 展开紧凑口语词（今早 / 今晚 / 明早 / 明晚），避免粘连导致日期或时段漏拆
 */
function expandCompactDayPeriod(text: string): string {
  return text
    .replace(/今早/g, '今天 早上')
    .replace(/今晚/g, '今天 晚上')
    .replace(/明早/g, '明天 早上')
    .replace(/明晚/g, '明天 晚上')
}

function extractTags(raw: string): { tags: string[]; cleaned: string } {
  const tags: string[] = []
  const cleaned = raw.replace(/#([\p{L}\p{N}_-]{1,20})/gu, (_m, tag: string) => {
    if (!tags.includes(tag)) tags.push(tag)
    return ' '
  })
  return { tags, cleaned }
}

function extractNotes(raw: string): { notes: string; cleaned: string } {
  let notes = ''
  const cleaned = raw.replace(
    /(?:^|[\s，,。；;|/])(?:备注|说明|附注|补充)\s*[:：]\s*(.+)$/u,
    (_m, body: string) => {
      notes = body.trim()
      return ' '
    }
  )
  return { notes, cleaned }
}

function extractAssignee(raw: string): { assignee?: string; cleaned: string } {
  let assignee: string | undefined
  let cleaned = raw.replace(
    /(?:^|[\s，,。；;|/])(?:责任人|负责人|经办人|指派给)\s*[:：]?\s*([\p{L}\p{N}_-]{1,16})(?=$|[\s，,。；;|/])/gu,
    (_m, who: string) => {
      if (!assignee) assignee = who.trim()
      return ' '
    }
  )
  cleaned = cleaned.replace(
    /(?<![\p{L}\p{N}._-])@([\p{L}\p{N}_-]{1,16})(?![.\p{L}\p{N}])/gu,
    (_m, who: string) => {
      if (!assignee) assignee = who.trim()
      return ' '
    }
  )
  return { assignee, cleaned }
}

function extractPriority(raw: string): { priority: WorkPriority; used: boolean; cleaned: string } {
  let priority: WorkPriority = 'normal'
  let used = false
  let cleaned = raw

  const applyToken = (tok: string): void => {
    if (/^(重点|重要|紧急|加急|高优|高优先级|高|P0|P1)$/i.test(tok)) {
      priority = 'high'
      used = true
    } else if (!used) {
      priority = 'normal'
      used = true
    }
  }

  // 1) 显式键值：优先级：重点 / 优先级为一般
  cleaned = cleaned.replace(
    /(?:^|[\s，,。；;|/])优先级\s*[:：为是]?\s*(重点|重要|紧急|加急|高优|高优先级|高|P0|P1|一般|一般优先级|普通|普通优先级|常规|中优|低优|低优先级|低|不急|次要|P2|P3)(?=$|[\s，,。；;|/])/giu,
    (_m, tok: string) => {
      applyToken(tok)
      return ' '
    }
  )

  // 2) 括号包裹：【重点】 / [紧急] / （重点）
  cleaned = cleaned.replace(
    /[\[【(（]\s*(重点|重要|紧急|加急|高优|高优先级|P0|P1|一般|一般优先级|普通|普通优先级|中优|低优|低优先级|不急|次要|P2|P3)\s*[\]】)）]/giu,
    (_m, tok: string) => {
      applyToken(tok)
      return ' '
    }
  )

  // 3) 独立词令（前后有边界，避免误删「重点客户」中的「重点」）
  const highRe = /(?<=^|[\s，,。；;、|/])(重点|重要|紧急|加急|高优|高优先级|P0|P1)(?=$|[\s，,。；;、|/])/giu
  const normalRe =
    /(?<=^|[\s，,。；;、|/])(一般|一般优先级|普通|普通优先级|中优|低优|低优先级|不急|次要|P2|P3)(?=$|[\s，,。；;、|/])/giu
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

  cleaned = cleaned.replace(/\[\s*\]|【\s*】|\(\s*\)|（\s*）/g, ' ')
  return { priority, used, cleaned }
}

/**
 * 提取并消费时间点表达（如 15:30、早上10点、下午3点半、早」10点 等），
 * 同时避免把「3点建议 / 三点要求 / 一点想法」误判为时刻。
 */
function extractTime(raw: string): { time: string; used: boolean; cleaned: string } {
  let picked: string | undefined
  let cleaned = raw

  const record = (hRaw: number, mRaw: number, period?: string): boolean => {
    if (!Number.isFinite(hRaw) || hRaw < 0 || hRaw > 24) return false
    if (!Number.isFinite(mRaw) || mRaw < 0 || mRaw > 59) return false
    const h = applyPeriod(hRaw === 24 ? 0 : hRaw, period)
    picked = `${pad2(h)}:${pad2(mRaw)}`
    return true
  }

  // 1) 冒号格式：早上 10:30 / 14:30
  const colonRe = new RegExp(`(?:(${PERIOD_WORD})[」』丄]?\\s*)?(?<!\\d)(\\d{1,2})\\s*[:：]\\s*(\\d{2})(?!\\d)`, 'gu')
  cleaned = cleaned.replace(colonRe, (full, period: string | undefined, hh: string, mm: string) => {
    return record(Number(hh), Number(mm), period) ? ' ' : full
  })

  // 2a) 带时段前缀的「X点…」：早上10点 / 下午三点半 / 早」10点
  const periodPointRe = new RegExp(
    `(${PERIOD_WORD})[」』丄]?\\s*(${CN_NUM})\\s*点(?:\\s*(?:整|钟)|\\s*(${CN_NUM})\\s*分?|\\s*(半)|\\s*(一刻)|\\s*(三刻))?`,
    'gu'
  )
  cleaned = cleaned.replace(
    periodPointRe,
    (
      full,
      period: string,
      hh: string,
      mm: string | undefined,
      half: string | undefined,
      q1: string | undefined,
      q3: string | undefined
    ) => {
      const m = half ? 30 : q1 ? 15 : q3 ? 45 : mm ? parseCnInt(mm) : 0
      return record(parseCnInt(hh), m, period) ? ' ' : full
    }
  )

  // 2b) 无时段前缀但明确带「半 / 一刻 / 三刻 / 整 / 钟 / X分」：十点半 / 3点15分
  const qualifiedPointRe = new RegExp(
    `(?<!\\d)(${CN_NUM})\\s*点(?:\\s*(?:整|钟)|\\s*(${CN_NUM})\\s*分|\\s*(半)|\\s*(一刻)|\\s*(三刻))`,
    'gu'
  )
  cleaned = cleaned.replace(
    qualifiedPointRe,
    (
      full,
      hh: string,
      mm: string | undefined,
      half: string | undefined,
      q1: string | undefined,
      q3: string | undefined
    ) => {
      const m = half ? 30 : q1 ? 15 : q3 ? 45 : mm ? parseCnInt(mm) : 0
      return record(parseCnInt(hh), m) ? ' ' : full
    }
  )

  // 2c) 阿拉伯数字「10点 / 10点30」，排除「3点建议 / 5点要求」等数量词
  const digitPointRe =
    /(?<!\d)(\d{1,2})\s*点(?:\s*(\d{1,2})\s*分?)?(?!\s*(?:建议|意见|要求|问题|事项|说明|内容|总结|体会|看法))/gu
  cleaned = cleaned.replace(digitPointRe, (full, hh: string, mm: string | undefined) => {
    return record(Number(hh), mm ? Number(mm) : 0) ? ' ' : full
  })

  // 2d) 中文数字紧邻提醒动作：「十点提醒我」
  const cnPointBeforeRemindRe = new RegExp(
    `(${CN_NUM})\\s*点(?=\\s*(?:准时|按时|定时)?\\s*(?:提醒|通知|催|前|之前|开始|起))`,
    'gu'
  )
  cleaned = cleaned.replace(cnPointBeforeRemindRe, (full, hh: string) => {
    return record(parseCnInt(hh), 0) ? ' ' : full
  })

  if (picked) {
    return { time: picked, used: true, cleaned }
  }
  return { time: '09:00', used: false, cleaned }
}

/**
 * 单个日期原子的正则片段（用于拼装「截止<日期>」「从<日期>开始」「从<日期A>到<日期B>」等结构化子句）
 */
const DATE_ATOM = [
  '\\d{4}\\s*年\\s*\\d{1,2}\\s*月\\s*\\d{1,2}\\s*[号日]?',
  '\\d{4}\\s*[-/.]\\s*\\d{1,2}\\s*[-/.]\\s*\\d{1,2}',
  `(?:下个?月|本月|这个?月)\\s*${CN_NUM}\\s*[号日]?`,
  '(?:下个?月|本月|这个?月)?(?:月底|月末|月初)',
  '(?:今年|本年)?(?:年底|年末)',
  `${CN_NUM}\\s*月\\s*${CN_NUM}\\s*[号日]`,
  '\\d{1,2}\\s*月\\s*\\d{1,2}(?![\\d号日季周期次个份项条版轮点分时年月])',
  '(?<!\\d)\\d{1,2}\\s*[-/]\\s*\\d{1,2}(?!\\d)',
  `${CN_NUM}\\s*(?:周|个?星期|个?礼拜)(?:后|之后|以后|内|以内)`,
  `${CN_NUM}\\s*(?:天|日)(?:后|之后|以后|内|以内)`,
  '(?:下周|下星期|下礼拜|本周|这周|本星期|这星期|本礼拜|这礼拜)\\s*[周星期礼拜]?\\s*[一二三四五六日天末]',
  '(?<![每下本这])(?:周|星期|礼拜)\\s*[一二三四五六日天]',
  '大后天|后天|明天|明日|次日|今天|今日|当天',
  '(?<![月每\\d])\\d{1,2}\\s*[号日](?![\\s]*月|[楼栋门室厅线站车号])'
].join('|')

function resolveDateAtom(atomRaw: string, now: Date, allowPast = false): { date: Date; hint?: string } {
  const atom = atomRaw.trim()
  const today = dayStart(now)

  const fullCn = atom.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[号日]?$/)
  if (fullCn) {
    return { date: clampedDate(Number(fullCn[1]), Number(fullCn[2]) - 1, Number(fullCn[3])) }
  }

  const fullIso = atom.match(/^(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})$/)
  if (fullIso) {
    return { date: clampedDate(Number(fullIso[1]), Number(fullIso[2]) - 1, Number(fullIso[3])) }
  }

  const relMonthDay = atom.match(/^(下个?月|本月|这个?月)\s*(.+?)\s*[号日]?$/)
  if (relMonthDay) {
    const offset = relMonthDay[1].startsWith('下') ? 1 : 0
    return { date: clampedDate(now.getFullYear(), now.getMonth() + offset, parseCnInt(relMonthDay[2])) }
  }

  if (/^下个?月(?:底|末)$/.test(atom)) {
    return { date: new Date(now.getFullYear(), now.getMonth() + 2, 0) }
  }
  if (/^(?:本月|这个?月)?(?:月底|月末)$/.test(atom)) {
    return { date: new Date(now.getFullYear(), now.getMonth() + 1, 0) }
  }
  if (/^下个?月初$/.test(atom)) {
    return { date: new Date(now.getFullYear(), now.getMonth() + 1, 1) }
  }
  if (/^(?:本月|这个?月)?月初$/.test(atom)) {
    return { date: new Date(now.getFullYear(), now.getMonth(), 1) }
  }
  if (/^(?:今年|本年)?(?:年底|年末)$/.test(atom)) {
    return { date: new Date(now.getFullYear(), 11, 31) }
  }

  const mdCn = atom.match(new RegExp(`^(${CN_NUM})\\s*月\\s*(${CN_NUM})\\s*[号日]?$`))
  const mdSlash = atom.match(/^(\d{1,2})\s*[-/]\s*(\d{1,2})$/)
  if (mdCn || mdSlash) {
    const month = (mdCn ? parseCnInt(mdCn[1]) : Number(mdSlash![1])) - 1
    const day = mdCn ? parseCnInt(mdCn[2]) : Number(mdSlash![2])
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      let date = clampedDate(now.getFullYear(), month, day)
      if (!allowPast && date.getTime() < today.getTime()) {
        date = clampedDate(now.getFullYear() + 1, month, day)
        return { date, hint: '该日期今年已过，已顺延到明年' }
      }
      return { date }
    }
  }

  const weeksLater = atom.match(new RegExp(`^(${CN_NUM})\\s*(?:周|个?星期|个?礼拜)(?:后|之后|以后|内|以内)$`))
  if (weeksLater) {
    return { date: addDays(today, Math.max(1, parseCnInt(weeksLater[1])) * 7) }
  }

  const daysLater = atom.match(new RegExp(`^(${CN_NUM})\\s*(?:天|日)(?:后|之后|以后|内|以内)$`))
  if (daysLater) {
    return { date: addDays(today, Math.max(0, parseCnInt(daysLater[1]))) }
  }

  const nextWeek = atom.match(/^(?:下周|下星期|下礼拜)\s*[周星期礼拜]?\s*([一二三四五六日天末])$/)
  if (nextWeek) {
    return { date: thisOrNextWeekDay(now, WEEKDAY_MAP[nextWeek[1]], true) }
  }

  const thisWeek = atom.match(/^(?:本周|这周|本星期|这星期|本礼拜|这礼拜)\s*[周星期礼拜]?\s*([一二三四五六日天末])$/)
  if (thisWeek) {
    return { date: thisOrNextWeekDay(now, WEEKDAY_MAP[thisWeek[1]], false) }
  }

  const bareWeekday = atom.match(/^(?:周|星期|礼拜)\s*([一二三四五六日天])$/)
  if (bareWeekday) {
    return { date: thisOrNextWeekDay(now, WEEKDAY_MAP[bareWeekday[1]], false) }
  }

  if (atom === '大后天') return { date: addDays(today, 3) }
  if (atom === '后天') return { date: addDays(today, 2) }
  if (atom === '明天' || atom === '明日' || atom === '次日') return { date: addDays(today, 1) }
  if (atom === '今天' || atom === '今日' || atom === '当天') return { date: today }

  const onlyDay = atom.match(/^(\d{1,2})\s*[号日]$/)
  if (onlyDay) {
    const day = Number(onlyDay[1])
    let date = clampedDate(now.getFullYear(), now.getMonth(), day)
    if (!allowPast && date.getTime() < today.getTime()) {
      date = clampedDate(now.getFullYear(), now.getMonth() + 1, day)
      return { date, hint: '该日期本月已过，已顺延到下个月' }
    }
    return { date }
  }

  return { date: addDays(today, 1) }
}

/**
 * 在未带「截止 / 从…开始」标记的文本中按精度从高到低匹配首个目标日期，
 * 避免句中靠前的「今天」覆盖靠后的「2026年12月31日」。
 */
const ORDERED_UNMARKED_DATE_PATTERNS: RegExp[] = [
  /\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*[号日]?/u,
  /\d{4}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{1,2}/u,
  new RegExp(`(?:下个?月|本月|这个?月)\\s*${CN_NUM}\\s*[号日]?`, 'u'),
  /(?:下个?月|本月|这个?月)?(?:月底|月末|月初)|(?:今年|本年)?(?:年底|年末)/u,
  new RegExp(`${CN_NUM}\\s*月\\s*${CN_NUM}\\s*[号日]`, 'u'),
  /\d{1,2}\s*月\s*\d{1,2}(?![\d号日季周期次个份项条版轮点分时年月])/u,
  /(?<!\d)\d{1,2}\s*[-/]\s*\d{1,2}(?!\d)/u,
  new RegExp(`${CN_NUM}\\s*(?:周|个?星期|个?礼拜)(?:后|之后|以后|内|以内)`, 'u'),
  new RegExp(`${CN_NUM}\\s*(?:天|日)(?:后|之后|以后|内|以内)`, 'u'),
  /(?:下周|下星期|下礼拜|本周|这周|本星期|这星期|本礼拜|这礼拜)\s*[周星期礼拜]?\s*[一二三四五六日天末]/u,
  /(?<![每下本这])(?:周|星期|礼拜)\s*[一二三四五六日天]/u,
  /大后天|后天|明天|明日|次日|今天|今日|当天/u,
  /(?<![月每\d])\d{1,2}\s*[号日](?![\s]*月|[楼栋门室厅线站车号])/u
]

function extractRepeat(
  raw: string,
  now: Date
): { repeat: RepeatRule; impliedDue?: Date; used: boolean; cleaned: string } {
  const today = dayStart(now)
  let cleaned = raw

  const monthlyEnd = cleaned.match(/每月\s*(?:月底|月末)(?:\s*(?:重复|例行))?/u)
  if (monthlyEnd) {
    cleaned = cleaned.replace(monthlyEnd[0], ' ')
    return { repeat: 'monthly', impliedDue: new Date(now.getFullYear(), now.getMonth() + 1, 0), used: true, cleaned }
  }

  const monthlyDay = cleaned.match(new RegExp(`每月\\s*(${CN_NUM})\\s*[号日]?(?:\\s*(?:重复|例行))?`, 'u'))
  if (monthlyDay) {
    const day = parseCnInt(monthlyDay[1])
    let date = clampedDate(now.getFullYear(), now.getMonth(), day)
    if (date.getTime() < today.getTime()) {
      date = clampedDate(now.getFullYear(), now.getMonth() + 1, day)
    }
    cleaned = cleaned.replace(monthlyDay[0], ' ')
    return { repeat: 'monthly', impliedDue: date, used: true, cleaned }
  }

  const weeklyDay = cleaned.match(/每周\s*[周星期礼拜]?\s*([一二三四五六日天])(?:\s*(?:重复|例行))?/u)
  if (weeklyDay) {
    cleaned = cleaned.replace(weeklyDay[0], ' ')
    return { repeat: 'weekly', impliedDue: nextWeekday(now, WEEKDAY_MAP[weeklyDay[1]]), used: true, cleaned }
  }

  const weekdaysRe = /(?:每个?工作日|工作日)\s*(?:重复|例行)/u
  if (weekdaysRe.test(cleaned)) {
    cleaned = cleaned.replace(weekdaysRe, ' ')
    return { repeat: 'weekdays', impliedDue: todayOrNextWorkday(now), used: true, cleaned }
  }

  const dailyRe = /(?:每天|每日)\s*(?:重复|例行)/u
  if (dailyRe.test(cleaned)) {
    cleaned = cleaned.replace(dailyRe, ' ')
    return { repeat: 'daily', impliedDue: today, used: true, cleaned }
  }

  const bareMonthly = /每月(?:\s*(?:重复|例行|一次))?/u
  if (bareMonthly.test(cleaned)) {
    cleaned = cleaned.replace(bareMonthly, ' ')
    return { repeat: 'monthly', used: true, cleaned }
  }

  const bareWeekly = /每周(?:\s*(?:重复|例行|一次))?/u
  if (bareWeekly.test(cleaned)) {
    cleaned = cleaned.replace(bareWeekly, ' ')
    return { repeat: 'weekly', used: true, cleaned }
  }

  return { repeat: 'none', used: false, cleaned }
}

function extractFrequency(raw: string): { frequency: NotifyFrequency; used: boolean; cleaned: string } {
  let cleaned = raw
  if (/每\s*(?:1|一)?\s*个?\s*小时/u.test(cleaned)) {
    cleaned = cleaned.replace(/每\s*(?:1|一)?\s*个?\s*小时/gu, ' ')
    return { frequency: 'hourly', used: true, cleaned }
  }
  if (/(?:每个?工作日|工作日)(?!\s*(?:重复|例行))/u.test(cleaned)) {
    cleaned = cleaned.replace(/(?:每个?工作日|工作日)(?!\s*(?:重复|例行))/gu, ' ')
    return { frequency: 'weekdays', used: true, cleaned }
  }
  if (/(?:每天|每日)(?!\s*(?:重复|例行))/u.test(cleaned)) {
    cleaned = cleaned.replace(/(?:每天|每日)(?!\s*(?:重复|例行))/gu, ' ')
    return { frequency: 'daily', used: true, cleaned }
  }
  const onceRe = /(?:仅|只)\s*(?:提醒|通知)?\s*我?\s*(?:一\s*次|1\s*次)|仅一次|只提醒一次|一次即可/gu
  if (onceRe.test(cleaned)) {
    cleaned = cleaned.replace(onceRe, ' ')
    return { frequency: 'once', used: true, cleaned }
  }
  return { frequency: 'once', used: false, cleaned }
}

export function parseWorkText(input: string, now = new Date()): ParsedWorkDraft {
  const sourceText = input.trim()
  const hints: string[] = []
  const today = dayStart(now)

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
      hints: ['请输入工作项，例如：任务：整理财务月报 截止12月31日 从今天开始每天早上10点提醒 #财务 重点']
    }
  }

  // Layer 1: 标签、备注、责任人、优先级、标题前缀
  let working = sourceText.replace(/\u3000/g, ' ').trim()
  const { tags, cleaned: afterTags } = extractTags(working)
  working = afterTags

  const { notes, cleaned: afterNotes } = extractNotes(working)
  working = afterNotes

  const { assignee, cleaned: afterAssignee } = extractAssignee(working)
  working = afterAssignee

  const { priority, used: priorityUsed, cleaned: afterPriority } = extractPriority(working)
  working = afterPriority

  // 剥离句首结构化前缀：「任务：」「工作项:」「待办事项：」「新建任务：」等
  working = working.replace(
    /^(?:新建|创建|添加)?\s*(?:工作项|工作任务|工作内容|任务名称|事项名称|任务|事项|待办事项|待办|日程|备忘)\s*(?:[:：]|是\s*[:：]?|为\s*[:：]?)\s*/u,
    ' '
  )

  // Layer 2: 免提醒开关 & 紧凑词展开 & 时间提取
  let notifyEnabled = true
  const noNotifyRe = /(?:不(?:用|要|需|必)?(?:提醒|通知)|无需(?:提醒|通知)|免(?:提醒|通知)|关闭(?:提醒|通知))/gu
  if (noNotifyRe.test(working)) {
    notifyEnabled = false
    working = working.replace(noNotifyRe, ' ')
  }

  working = expandCompactDayPeriod(working)

  const timeInfo = extractTime(working)
  working = timeInfo.cleaned

  // Layer 3: 周期循环（先于日期提取，防止「每月11号」「每周五」被普通日期吞掉）
  const repeatInfo = extractRepeat(working, now)
  working = repeatInfo.cleaned

  // Layer 4: 语义角色化日期提取（区分「截止日期」与「提醒开始日期 / 提前天数」）
  let dueInfo: { date: Date; hint?: string } | undefined
  let notifyStartDate: Date | undefined
  let explicitAdvanceDays: number | undefined

  // 4.1 区间子句：「从 <日期A> (开始/起) 到/至 <日期B> (截止/前)」
  const rangeRe = new RegExp(
    `(?:从|自|由)\\s*(${DATE_ATOM})\\s*(?:开始|起)?\\s*(?:一直)?(?:到|至|直到)\\s*(${DATE_ATOM})\\s*(?:截止|到期|为止|之前|以前|前)?`,
    'u'
  )
  const rangeMatch = working.match(rangeRe)
  if (rangeMatch) {
    notifyStartDate = resolveDateAtom(rangeMatch[1], now, true).date
    dueInfo = resolveDateAtom(rangeMatch[2], now, false)
    working = working.replace(rangeMatch[0], ' ')
  }

  // 4.2 显式截止前缀子句：「截止日期2026年12月31日」「截止至12/31」「到期时间：周五」「DDL 12-31」
  if (!dueInfo) {
    const duePrefixRe = new RegExp(
      `(?:截止(?:日期|时间|日|至|到)?|到期(?:日期|时间|日)?|完成(?:日期|时间|期限)|最后期限|期限|死线|DDL)\\s*(?:[:：是为至到])?\\s*(${DATE_ATOM})\\s*(?:截止|到期|为止|之前|以前|前)?`,
      'iu'
    )
    const duePrefixMatch = working.match(duePrefixRe)
    if (duePrefixMatch) {
      dueInfo = resolveDateAtom(duePrefixMatch[1], now, false)
      working = working.replace(duePrefixMatch[0], ' ')
    }
  }

  // 4.3 显式截止后缀子句：「2026年12月31日截止」「12月31日前完成」「年底前完成固定资产盘点」
  if (!dueInfo) {
    const dueSuffixStrictRe = new RegExp(
      `(?:在|于)?\\s*(${DATE_ATOM})\\s*(?:之前|以前|前)?\\s*(?:截止|到期|为止)`,
      'u'
    )
    const strictMatch = working.match(dueSuffixStrictRe)
    if (strictMatch) {
      dueInfo = resolveDateAtom(strictMatch[1], now, false)
      working = working.replace(strictMatch[0], ' ')
    } else {
      const dueBeforeRe = new RegExp(
        `(?:在|于)?\\s*(${DATE_ATOM})\\s*(?:之前|以前|前)(?:\\s*(?:完成|提交|上交|交付|搞定|结项)(?=$|[\\s，,。；;|/]|(?:从|自|由|即日|提前|每|${PERIOD_WORD}|提醒|通知)))?`,
        'u'
      )
      const beforeMatch = working.match(dueBeforeRe)
      if (beforeMatch) {
        dueInfo = resolveDateAtom(beforeMatch[1], now, false)
        working = working.replace(beforeMatch[0], ' ')
      }
    }
  }

  // 4.4 显式提醒起点子句：「从今天开始」「自12月1日起」「即日起」「今天开始每天…」
  if (!notifyStartDate) {
    const immediateRe = /(?:即日起|从现在(?:开始|起)|现在(?:开始|起))/u
    if (immediateRe.test(working)) {
      notifyStartDate = today
      working = working.replace(immediateRe, ' ')
    } else {
      const fromDateRe = new RegExp(`(?:从|自|由)\\s*(${DATE_ATOM})\\s*(?:开始|起)?`, 'u')
      const fromMatch = working.match(fromDateRe)
      if (fromMatch) {
        notifyStartDate = resolveDateAtom(fromMatch[1], now, true).date
        working = working.replace(fromMatch[0], ' ')
      } else {
        const bareStartRe = new RegExp(
          `(${DATE_ATOM})\\s*(?:开始|起)(?=\\s*(?:每|${PERIOD_WORD}|\\d|提醒|通知|催))`,
          'u'
        )
        const bareStartMatch = working.match(bareStartRe)
        if (bareStartMatch) {
          notifyStartDate = resolveDateAtom(bareStartMatch[1], now, true).date
          working = working.replace(bareStartMatch[0], ' ')
        }
      }
    }
  }

  // 若时间原本夹在「从早上10点开始」中间，清理残留的「从 开始」并把提醒起点设为今天
  const emptyFromStartRe = /(?:^|[\s，,。；;])(?:从|自|由)\s*(?:开始|起)(?=$|[\s，,。；;]|每|提醒|通知)/u
  if (emptyFromStartRe.test(working)) {
    if (!notifyStartDate) notifyStartDate = today
    working = working.replace(emptyFromStartRe, ' ')
  }

  // 清理「直到截止日 / 到截止日期为止 / 直到完成」等修饰从句
  working = working.replace(
    /(?:一直)?(?:到|至|直到)\s*(?:截止(?:日期|时间|日)?|到期(?:日期|日)?|完成)(?:为止)?/gu,
    ' '
  )

  // 4.5 显式提前天数 / 周数：「提前5天」「提前三天」「提前一周」「提前半个月」
  const advHalfMonth = working.match(/提前\s*半个?月(?:\s*(?:开始|起))?/u)
  if (advHalfMonth) {
    explicitAdvanceDays = 15
    working = working.replace(advHalfMonth[0], ' ')
  } else {
    const advWeeks = working.match(new RegExp(`提前\\s*(${CN_NUM})\\s*(?:周|个?星期|个?礼拜)(?:\\s*(?:开始|起))?`, 'u'))
    if (advWeeks) {
      explicitAdvanceDays = parseCnInt(advWeeks[1]) * 7
      working = working.replace(advWeeks[0], ' ')
    } else {
      const advDays = working.match(new RegExp(`提前\\s*(${CN_NUM})\\s*(?:天|日)(?:\\s*(?:开始|起))?`, 'u'))
      if (advDays) {
        explicitAdvanceDays = parseCnInt(advDays[1])
        working = working.replace(advDays[0], ' ')
      }
    }
  }

  // 4.6 未带角色前缀的裸日期回退（按精度优先顺序仅消费一处，保留标题中可能存在的其他历史日期）
  if (!dueInfo && !repeatInfo.impliedDue) {
    for (const pat of ORDERED_UNMARKED_DATE_PATTERNS) {
      const m = working.match(pat)
      if (m) {
        dueInfo = resolveDateAtom(m[0], now, false)
        working = working.replace(m[0], ' ')
        break
      }
    }
  }

  // Layer 5: 提醒频次与无截止日例行循环的智能归一
  const freqInfo = extractFrequency(working)
  working = freqInfo.cleaned

  // 若未写具体几点，但有「早上 / 下午 / 晚上」等时段词（排除「下午茶 / 晚会」等名词），取对应默认整点
  let finalTime = timeInfo.time
  let finalTimeUsed = timeInfo.used
  const periodFallbackRe =
    /(凌晨|清晨|早上|早晨|上午|中午|正午|下午|午后|傍晚|黄昏|晚上|夜晚|夜里)[」』丄]?(?![茶点餐班课场会])/u
  const periodMatch = working.match(periodFallbackRe)
  if (periodMatch) {
    if (!finalTimeUsed) {
      finalTime = defaultHourForPeriod(periodMatch[1])
      finalTimeUsed = true
    }
    working = working.replace(new RegExp(periodFallbackRe.source, 'gu'), ' ')
  }

  let finalRepeat: RepeatRule = repeatInfo.repeat
  let finalFrequency: NotifyFrequency = freqInfo.frequency
  let finalDueDate: Date
  let dateRecognized = Boolean(dueInfo || repeatInfo.used || notifyStartDate)

  if (
    finalRepeat === 'none' &&
    !dueInfo &&
    explicitAdvanceDays === undefined &&
    (finalFrequency === 'daily' || finalFrequency === 'weekdays')
  ) {
    // 无截止日期且写「每天… / 每个工作日…」→ 自动归为周期例行事项（如「每天早上9点写日报」）
    finalRepeat = finalFrequency
    finalFrequency = 'once'
    finalDueDate =
      notifyStartDate ?? (finalRepeat === 'weekdays' ? todayOrNextWorkday(now) : today)
    notifyStartDate = undefined
    dateRecognized = true
  } else if (dueInfo) {
    finalDueDate = dueInfo.date
    if (dueInfo.hint) hints.push(dueInfo.hint)
  } else if (repeatInfo.impliedDue) {
    finalDueDate = repeatInfo.impliedDue
  } else if (repeatInfo.used) {
    finalDueDate = notifyStartDate ?? today
    notifyStartDate = undefined
  } else if (notifyStartDate) {
    finalDueDate = notifyStartDate
    notifyStartDate = undefined
  } else {
    finalDueDate = addDays(today, 1)
    hints.push('未识别到日期，默认明天')
  }

  // 计算提前提醒天数 advanceDays
  let advanceDays = 0
  if (explicitAdvanceDays !== undefined) {
    advanceDays = Math.max(0, explicitAdvanceDays)
  } else if (notifyStartDate) {
    const diff = diffCalendarDays(finalDueDate, notifyStartDate)
    if (diff < 0) {
      advanceDays = 0
      hints.push('提醒起点晚于截止日期，已调整为截止当天提醒')
    } else {
      advanceDays = diff
    }
  } else if (
    finalRepeat === 'none' &&
    (finalFrequency === 'daily' || finalFrequency === 'weekdays') &&
    diffCalendarDays(finalDueDate, today) > 0
  ) {
    // 有明确未来截止日且要求「每天 / 每个工作日提醒」，未写起点时默认从今天开始提醒直至截止日
    advanceDays = diffCalendarDays(finalDueDate, today)
  }

  // Layer 6: 清理提醒动词短语与语法连接残留（保护「放假通知」「消息提醒模块」等业务名词）
  // 6.1 句首祈使请求：「请记得提醒我…」「麻烦通知我…」
  working = working.replace(
    /^(?:请|麻烦|帮我|劳烦)?\s*(?:记得|别忘了|一定|务必要?)?\s*(?:提醒|通知|叫|催)(?:一下)?\s*我?\s*/u,
    ' '
  )

  // 6.2 带宾语「我」或次数补语「一次 / 一下 / 即可」的提醒指令：「提醒我一次」「通知我一下」「提醒一次即可」
  working = working.replace(
    new RegExp(
      `(?:请|麻烦|记得|准时|按时|定时)?\\s*(?:给?我\\s*)?(?:发个?(?:消息|弹窗)?\\s*)?(?:进行\\s*)?(?:提醒|通知|催办|叫醒|闹钟)\\s*(?:我(?:\\s*(?:一下|一\\s*次|1\\s*次|${CN_NUM}\\s*次))?|(?:一下|一\\s*次|1\\s*次|${CN_NUM}\\s*次))(?:\\s*(?:即可|就行|就好|吧|哦|呀|哈))?`,
      'gu'
    ),
    ' '
  )

  // 6.3 独立成词的提醒尾缀（前后均为空白或标点，不误伤「发送放假通知」「消息提醒模块」）
  working = working.replace(
    /(?:^|[\s，,。；;、])(?:请|记得|准时|按时|定时)?(?:提醒|通知|催办)(?:\s*(?:即可|就行|就好|吧|哦))?(?=$|[\s，,。；;、])/gu,
    ' '
  )

  // 6.4 规范化空白与首尾标点（保留标题内部的点号如 v2.0）
  let title = working
    .replace(/[，,。；;\s]+/g, ' ')
    .replace(/^[\s，,。；;、:：·\-—.]+/, '')
    .replace(/[\s，,。；;、:：·\-—.]+$/, '')
    .trim()

  if (!title) {
    title = '未命名工作项'
    hints.push('没有识别到标题，已使用默认名称，可在下方修改')
  }

  // 生成友好提示
  if (!notifyEnabled) {
    hints.push('已按指令关闭定时提醒')
  } else if (advanceDays > 0) {
    const notifyDay = addDays(finalDueDate, -advanceDays)
    if (finalFrequency === 'daily') {
      hints.push(`将从 ${notifyDay.getMonth() + 1}月${notifyDay.getDate()}日 起每天 ${finalTime} 提醒，直至截止日`)
    } else if (finalFrequency === 'weekdays') {
      hints.push(`将从 ${notifyDay.getMonth() + 1}月${notifyDay.getDate()}日 起每个工作日 ${finalTime} 提醒，直至截止日`)
    } else if (finalFrequency === 'hourly') {
      hints.push(`将从 ${notifyDay.getMonth() + 1}月${notifyDay.getDate()}日 ${finalTime} 起每小时提醒`)
    } else {
      hints.push(`将在 ${notifyDay.getMonth() + 1}月${notifyDay.getDate()}日 ${finalTime} 提醒`)
    }
  } else if (finalRepeat !== 'none') {
    hints.push(`周期事项，将于每个周期日 ${finalTime} 提醒`)
  } else {
    hints.push(`将在截止当天 ${finalTime} 提醒`)
  }

  const dueLocal = new Date(
    finalDueDate.getFullYear(),
    finalDueDate.getMonth(),
    finalDueDate.getDate(),
    18,
    0,
    0,
    0
  )

  const notify: WorkNotify = {
    enabled: notifyEnabled,
    advanceDays,
    time: finalTime,
    frequency: finalFrequency
  }

  let confidence = 0.4
  if (dateRecognized) confidence += 0.25
  if (title && title !== '未命名工作项') confidence += 0.2
  if (explicitAdvanceDays !== undefined || notifyStartDate) confidence += 0.1
  if (finalTimeUsed || priorityUsed || tags.length > 0 || assignee) confidence += 0.05

  return {
    title,
    dueAt: dueLocal.toISOString(),
    priority,
    assignee,
    tags,
    notify,
    repeat: finalRepeat,
    notes,
    sourceText,
    confidence: Math.min(1, confidence),
    hints
  }
}

export function describeDraft(draft: ParsedWorkDraft): string {
  const due = new Date(draft.dueAt)
  const notifyDay = addDays(new Date(due.getFullYear(), due.getMonth(), due.getDate()), -draft.notify.advanceDays)
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

  const dueStr = `${due.getFullYear()}年${due.getMonth() + 1}月${due.getDate()}日`
  const notifyDayStr = `${notifyDay.getMonth() + 1}月${notifyDay.getDate()}日`

  let notifySummary = '不提醒'
  if (draft.notify.enabled) {
    if (draft.notify.frequency === 'daily') {
      notifySummary =
        draft.notify.advanceDays > 0
          ? `自 ${notifyDayStr} 起每天 ${draft.notify.time} 提醒`
          : `每天 ${draft.notify.time} 提醒`
    } else if (draft.notify.frequency === 'weekdays') {
      notifySummary =
        draft.notify.advanceDays > 0
          ? `自 ${notifyDayStr} 起工作日 ${draft.notify.time} 提醒`
          : `每个工作日 ${draft.notify.time} 提醒`
    } else if (draft.notify.frequency === 'hourly') {
      notifySummary = `自 ${notifyDayStr} ${draft.notify.time} 起每小时提醒`
    } else {
      notifySummary = `提醒 ${notifyDayStr} ${draft.notify.time}`
    }
  }

  const parts = [
    `工作项「${draft.title}」`,
    `截止 ${dueStr}`,
    notifySummary,
    `优先级：${prioLabel[draft.priority]}`
  ]
  if (draft.repeat !== 'none') parts.push(repeatLabel[draft.repeat])
  if (draft.assignee) parts.push(`责任人：${draft.assignee}`)
  if (draft.tags.length) parts.push(draft.tags.map((t) => `#${t}`).join(' '))
  if (draft.notes) parts.push(`备注：${draft.notes}`)
  return parts.join(' · ')
}

export function previewNotifyDate(
  dueAt: string,
  advanceDays: number,
  time: string,
  frequency?: NotifyFrequency
): string {
  const due = new Date(dueAt)
  const day = addDays(new Date(due.getFullYear(), due.getMonth(), due.getDate()), -advanceDays)
  const dateStr = toLocalDate(day)
  if (!frequency || frequency === 'once') {
    return `${dateStr} ${time}`
  }
  if (frequency === 'daily') {
    return advanceDays > 0 ? `${dateStr} 起每天 ${time}` : `${dateStr} 每天 ${time}`
  }
  if (frequency === 'weekdays') {
    return advanceDays > 0 ? `${dateStr} 起工作日 ${time}` : `${dateStr} 工作日 ${time}`
  }
  return `${dateStr} ${time} 起每小时`
}

export { atLocal }
