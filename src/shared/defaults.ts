import type { HealthReminder, QuoteItem, WorkItem } from './types'
import { createId } from './ids'
import { addDays, atLocal, nowIso } from './time'

export const SAMPLE_QUOTES: Omit<QuoteItem, 'id'>[] = [
  { kind: 'motivation', content: '慢慢来，比较快。把今天这一小步走扎实，就已经赢了。', enabled: true },
  { kind: 'motivation', content: '你不需要一次做完所有事。你只需要开始做眼前这一件。', enabled: true },
  { kind: 'motivation', content: '完成比完美更重要。先交一版，再打磨一版。', enabled: true },
  { kind: 'motivation', content: '今天的你，已经比昨天的你多撑过了一整天。这本身就值得被看见。', enabled: true },
  { kind: 'motivation', content: '工作是马拉松，不是冲刺。喝口水，再接着跑。', enabled: true },
  { kind: 'motivation', content: '把大事拆成能在两小时内做完的小事，焦虑会自己退场。', enabled: true },
  { kind: 'motivation', content: '允许自己有普通的一天。普通的一天，也在把生活往前推。', enabled: true },
  { kind: 'motivation', content: '专注像肌肉：每次把注意力拉回来，就是一次训练。', enabled: true },
  { kind: 'riddle', content: '什么东西越洗越脏？', answer: '水。', enabled: true },
  { kind: 'riddle', content: '什么车没有轮子？', answer: '塞车。', enabled: true },
  { kind: 'riddle', content: '什么帽不能戴？', answer: '螺丝帽。', enabled: true },
  { kind: 'riddle', content: '什么布剪不断？', answer: '瀑布。', enabled: true },
  { kind: 'riddle', content: '什么鸡没有翅膀？', answer: '田鸡。', enabled: true },
  { kind: 'riddle', content: '什么天天都在增加，却从来看不见？', answer: '年龄。', enabled: true },
  { kind: 'joke', content: '周一的我：这周一定高效。周五的我：至少活下来了。', enabled: true },
  { kind: 'joke', content: '同事问我周末过得怎么样。我说：把周报提前写完了。他沉默了三秒，叫我滚。', enabled: true },
  { kind: 'joke', content: '我不是拖延，我是在给灵感发酵的时间。嗯，已经发酵成面包了。', enabled: true },
  { kind: 'joke', content: '会议的本质：本来可以一封邮件解决的事，变成了一封会后邮件。', enabled: true },
  { kind: 'joke', content: '我有一个减肥计划。它目前和我的待办清单住在一起，关系很好，谁也不打扰谁。', enabled: true },
  { kind: 'joke', content: '电脑卡住了，我和它对视。原来我们都在等对方先动。', enabled: true }
]

export const DEFAULT_HEALTH: Omit<HealthReminder, 'id'>[] = [
  {
    title: '喝口水',
    message: '起来接杯水吧。口腔和脑子都会感谢你。',
    emoji: '💧',
    enabled: true,
    intervalMinutes: 60,
    workHoursOnly: true,
    workStart: '09:00',
    workEnd: '18:30'
  },
  {
    title: '站起来走走',
    message: '离开椅子两分钟。走廊走一圈，肩膀会轻松很多。',
    emoji: '🚶',
    enabled: true,
    intervalMinutes: 50,
    workHoursOnly: true,
    workStart: '09:00',
    workEnd: '18:30'
  },
  {
    title: '看看远处',
    message: '抬眼看向窗外 20 秒。屏幕不是全世界。',
    emoji: '🌿',
    enabled: true,
    intervalMinutes: 30,
    workHoursOnly: true,
    workStart: '09:00',
    workEnd: '18:30'
  },
  {
    title: '活动肩膀',
    message: '滚一滚肩膀，伸个懒腰。你不是钉子，不必钉在桌前。',
    emoji: '🙆',
    enabled: false,
    intervalMinutes: 90,
    workHoursOnly: true,
    workStart: '09:00',
    workEnd: '18:30'
  }
]

export function seedQuotes(): QuoteItem[] {
  return SAMPLE_QUOTES.map((q) => ({ ...q, id: createId('qt') }))
}

export function seedHealth(): HealthReminder[] {
  return DEFAULT_HEALTH.map((h) => ({ ...h, id: createId('hl') }))
}

export function seedDemoWork(now = new Date()): WorkItem[] {
  const due = addDays(now, 5)
  due.setHours(18, 0, 0, 0)
  return [
    {
      id: createId('wk'),
      title: '月报',
      notes: '示例：一句话「月报 本月11号 提前5天通知」就会生成类似工作项。',
      dueAt: due.toISOString(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      status: 'todo',
      notify: {
        enabled: true,
        advanceDays: 5,
        time: '09:00',
        frequency: 'once'
      },
      repeat: 'none',
      sourceText: '月报 提前5天通知',
      tags: ['示例']
    }
  ]
}

export function notifyAtFor(dueAt: string, advanceDays: number, time: string): Date {
  const due = new Date(dueAt)
  const day = addDays(new Date(due.getFullYear(), due.getMonth(), due.getDate()), -advanceDays)
  return atLocal(
    `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`,
    time
  )
}
