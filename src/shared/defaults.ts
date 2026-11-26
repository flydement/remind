import type { HealthReminder, QuoteItem, WorkItem } from './types'
import { createId } from './ids'
import { addDays, atLocal, nowIso } from './time'

export const QUOTES_CATALOG_VERSION = 2

export const SAMPLE_QUOTES: Omit<QuoteItem, 'id'>[] = [
  // === 激励寄语 / 工作心法（48 条） ===
  { kind: 'motivation', content: '慢慢来，比较快。把今天这一小步走扎实，就已经赢了。', enabled: true },
  { kind: 'motivation', content: '你不需要一次做完所有事。你只需要开始做眼前这一件。', enabled: true },
  { kind: 'motivation', content: '完成比完美更重要。先交一版，再打磨一版。', enabled: true },
  { kind: 'motivation', content: '今天的你，已经比昨天的你多撑过了一整天。这本身就值得被看见。', enabled: true },
  { kind: 'motivation', content: '工作是马拉松，不是冲刺。喝口水，再接着跑。', enabled: true },
  { kind: 'motivation', content: '把大事拆成能在两小时内做完的小事，焦虑会自己退场。', enabled: true },
  { kind: 'motivation', content: '允许自己有普通的一天。普通的一天，也在把生活往前推。', enabled: true },
  { kind: 'motivation', content: '专注像肌肉：每次把注意力拉回来，就是一次训练。', enabled: true },
  { kind: 'motivation', content: '行动是缓解焦虑最直接的解药，先写下第一行就成功了一半。', enabled: true },
  { kind: 'motivation', content: '重要的事未必紧急，但值得你每天留出最清醒的一小时。', enabled: true },
  { kind: 'motivation', content: '与其反复纠结最优解，不如先做出可运行的第一步再迭代。', enabled: true },
  { kind: 'motivation', content: '复盘不是为了责怪自己，而是为了下次走得更省力。', enabled: true },
  { kind: 'motivation', content: '把消耗精力的琐事写进清单，大脑就能腾出来思考真正的问题。', enabled: true },
  { kind: 'motivation', content: '节奏稳的人，往往比一直狂奔的人走得更远。', enabled: true },
  { kind: 'motivation', content: '拒绝一个不合理的急件，也是在保护真正重要的交付。', enabled: true },
  { kind: 'motivation', content: '好方案大多不是灵光一现，而是把基础信息理顺后的水到渠成。', enabled: true },
  { kind: 'motivation', content: '情绪上头时先停十秒，多数问题在冷静后会小一半。', enabled: true },
  { kind: 'motivation', content: '每天能按计划闭环三件关键事，这一周就足够出色。', enabled: true },
  { kind: 'motivation', content: '复杂项目最好的推进方式，就是把下一步写得足够具体。', enabled: true },
  { kind: 'motivation', content: '别拿别人的高光时刻，去对比自己正在铺路的日常。', enabled: true },
  { kind: 'motivation', content: '哪怕今天只推进了百分之十，也比停在原地强得多。', enabled: true },
  { kind: 'motivation', content: '清晰的沟通省掉一半返工，发消息前多确认一句目标和截止时间。', enabled: true },
  { kind: 'motivation', content: '休息不是偷懒，而是为了下半场依然能做出好判断。', enabled: true },
  { kind: 'motivation', content: '长期主义的秘密，不过是把简单正确的事重复做到位。', enabled: true },
  { kind: 'motivation', content: '遇到卡点先换个视角，或起身走两分钟，答案常在松弛时出现。', enabled: true },
  { kind: 'motivation', content: '把标准定清楚，比事后反复修改轻松十倍。', enabled: true },
  { kind: 'motivation', content: '值得记录的成果不必惊天动地，每个按时交付的节点都算数。', enabled: true },
  { kind: 'motivation', content: '控制能控制的进度，接纳暂时无法改变的变量。', enabled: true },
  { kind: 'motivation', content: '提前十分钟整理桌面和待办，全天都会顺畅很多。', enabled: true },
  { kind: 'motivation', content: '真正的专业，是在忙碌时依然保持条理与分寸感。', enabled: true },
  { kind: 'motivation', content: '别让零碎消息打断深度思考，集中时段统一回复更高效。', enabled: true },
  { kind: 'motivation', content: '每次把模糊的想法写成文字，问题本身就解决了一大半。', enabled: true },
  { kind: 'motivation', content: '进度偶尔落后并不可怕，重新排期就是新的起点。', enabled: true },
  { kind: 'motivation', content: '善用工具替你记住琐事，把珍贵的注意力留给创造性工作。', enabled: true },
  { kind: 'motivation', content: '温和对待自己，严密对待细节，这两件事并不矛盾。', enabled: true },
  { kind: 'motivation', content: '凡事有交代，件件有着落，事事有回音，是最稳的职场底牌。', enabled: true },
  { kind: 'motivation', content: '学会在合适的时候收尾，比无限延长工作时间更见功力。', enabled: true },
  { kind: 'motivation', content: '今天种下的一个好习惯，三个月后会悄悄替你省下大把时间。', enabled: true },
  { kind: 'motivation', content: '面对一堆待办不知从哪下手时，先挑最轻的一件开个好头。', enabled: true },
  { kind: 'motivation', content: '把精力投向高价值产出，而不是制造“看起来很忙”的疲惫。', enabled: true },
  { kind: 'motivation', content: '每一次认真记录过程，都会在写周报和月报时回馈你。', enabled: true },
  { kind: 'motivation', content: '方向比速度更关键，出发前花五分钟对齐预期最划算。', enabled: true },
  { kind: 'motivation', content: '不必等待状态满分才开工，先干五分钟后状态自然会跟上来。', enabled: true },
  { kind: 'motivation', content: '保持好奇心和耐心，很多难题只是还没遇到合适的切入口。', enabled: true },
  { kind: 'motivation', content: '准点下班也是一种能力，前提是白天把核心事项安排到位。', enabled: true },
  { kind: 'motivation', content: '团队协作里，透明同步进度永远比默默扛着更让人安心。', enabled: true },
  { kind: 'motivation', content: '你的价值不由未完成清单的长度决定，而由已创造的成果定义。', enabled: true },
  { kind: 'motivation', content: '给自己一点正向反馈，每勾掉一项任务都值得轻轻点个赞。', enabled: true },

  // === 思维热身 / 脑筋急转弯（36 条） ===
  { kind: 'riddle', content: '什么东西越洗越脏？', answer: '水。', enabled: true },
  { kind: 'riddle', content: '什么车没有轮子？', answer: '塞车。', enabled: true },
  { kind: 'riddle', content: '什么帽不能戴？', answer: '螺丝帽。', enabled: true },
  { kind: 'riddle', content: '什么布剪不断？', answer: '瀑布。', enabled: true },
  { kind: 'riddle', content: '什么鸡没有翅膀？', answer: '田鸡。', enabled: true },
  { kind: 'riddle', content: '什么天天都在增加，却从来看不见？', answer: '年龄。', enabled: true },
  { kind: 'riddle', content: '什么门永远关不上？', answer: '球门。', enabled: true },
  { kind: 'riddle', content: '什么路不能走？', answer: '电路（或套路）。', enabled: true },
  { kind: 'riddle', content: '什么书在书店买不到？', answer: '秘书。', enabled: true },
  { kind: 'riddle', content: '什么瓜不能吃？', answer: '傻瓜。', enabled: true },
  { kind: 'riddle', content: '什么东西越生气，它就越大？', answer: '脾气。', enabled: true },
  { kind: 'riddle', content: '什么东西天气越热，它爬得越高？', answer: '温度计里的水银柱。', enabled: true },
  { kind: 'riddle', content: '什么人每天靠“运气”赚钱？', answer: '运煤气罐的工人。', enabled: true },
  { kind: 'riddle', content: '什么海里没有一滴水？', answer: '辞海（或人海）。', enabled: true },
  { kind: 'riddle', content: '什么字全世界的人都认识？', answer: '阿拉伯数字。', enabled: true },
  { kind: 'riddle', content: '什么桥下面没有水？', answer: '立交桥。', enabled: true },
  { kind: 'riddle', content: '什么东西你越拿走，它反而越大？', answer: '坑（洞）。', enabled: true },
  { kind: 'riddle', content: '什么东西早上四条腿，中午两条腿，晚上三条腿？', answer: '人（幼年爬行、成年行走、老年拄拐）。', enabled: true },
  { kind: 'riddle', content: '什么东西有眼睛却看不见？', answer: '针（针眼）。', enabled: true },
  { kind: 'riddle', content: '什么东西有牙齿却不能咬东西？', answer: '梳子（或拉链）。', enabled: true },
  { kind: 'riddle', content: '什么东西必须先打破了才能用？', answer: '鸡蛋。', enabled: true },
  { kind: 'riddle', content: '什么东西越擦越黑？', answer: '黑板。', enabled: true },
  { kind: 'riddle', content: '什么动物最爱贴在墙上？', answer: '海豹（海报）。', enabled: true },
  { kind: 'riddle', content: '什么鱼不会游泳？', answer: '木鱼。', enabled: true },
  { kind: 'riddle', content: '什么球不能踢也不能打？', answer: '地球（或眼球）。', enabled: true },
  { kind: 'riddle', content: '什么表能看时间，却一秒也不走？', answer: '时刻表。', enabled: true },
  { kind: 'riddle', content: '什么东西完全属于你，但别人用得比你多？', answer: '你的名字。', enabled: true },
  { kind: 'riddle', content: '什么马不能骑？', answer: '海马（或斑马线）。', enabled: true },
  { kind: 'riddle', content: '什么牛不会吃草？', answer: '蜗牛。', enabled: true },
  { kind: 'riddle', content: '什么东西越晒太阳反而越湿？', answer: '冰块。', enabled: true },
  { kind: 'riddle', content: '什么东西能装满整个房间，却一点也不占重量？', answer: '光。', enabled: true },
  { kind: 'riddle', content: '什么井里永远打不出水？', answer: '天井。', enabled: true },
  { kind: 'riddle', content: '什么东西有城市没房子，有河流没有水，有山脉没有树？', answer: '地图。', enabled: true },
  { kind: 'riddle', content: '什么人一年只上一天班，还不怕被开除？', answer: '圣诞老人。', enabled: true },
  { kind: 'riddle', content: '什么东西用左手能拿起来，用右手却怎么也拿不起来？', answer: '自己的右手。', enabled: true },
  { kind: 'riddle', content: '什么东西越分反而越多？', answer: '快乐（或知识）。', enabled: true },

  // === 轻松幽默 / 职场段子（36 条） ===
  { kind: 'joke', content: '周一的我：这周一定高效。周五的我：至少活下来了。', enabled: true },
  { kind: 'joke', content: '同事问我周末过得怎么样。我说：把周报提前写完了。他沉默了三秒，叫我滚。', enabled: true },
  { kind: 'joke', content: '我不是拖延，我是在给灵感发酵的时间。嗯，已经发酵成面包了。', enabled: true },
  { kind: 'joke', content: '会议的本质：本来可以一封邮件解决的事，变成了一封会后邮件。', enabled: true },
  { kind: 'joke', content: '我有一个减肥计划。它目前和我的待办清单住在一起，关系很好，谁也不打扰谁。', enabled: true },
  { kind: 'joke', content: '电脑卡住了，我和它对视。原来我们都在等对方先动。', enabled: true },
  { kind: 'joke', content: '文件命名进化史：最终版、绝对最终版、最终版改、打死不改版、真·最终版v2。', enabled: true },
  { kind: 'joke', content: '早上喝咖啡是为了提神，下午喝咖啡是为了维持生命体征。', enabled: true },
  { kind: 'joke', content: '同事说“我就简单改一个字”，结果整份文档排版像多米诺骨牌一样全塌了。', enabled: true },
  { kind: 'joke', content: '闹钟响了三次我没醒，但工作群“叮”了一声，我瞬间弹射起步。', enabled: true },
  { kind: 'joke', content: '所谓“有空聊一下”，翻译过来通常是：你现在最好就有空。', enabled: true },
  { kind: 'joke', content: '每次说“先歇五分钟”，再抬头已经到了该思考午饭吃什么的时候。', enabled: true },
  { kind: 'joke', content: 'PPT 做得再精美，到演示那一刻投影仪也会先给你表演一个找不到信号。', enabled: true },
  { kind: 'joke', content: '我以为的架构评审：思想碰撞；实际的架构评审：先对齐一下这个词的定义。', enabled: true },
  { kind: 'joke', content: '刚把工位收拾得一尘不染，才发现只是因为实在不想开始写方案。', enabled: true },
  { kind: 'joke', content: '有人问我抗压能力怎么样，我说：键盘上的 Ctrl+S 已经快被我按出包浆了。', enabled: true },
  { kind: 'joke', content: '每到周五下午四点，全办公室的打字声都会自动切换到加速模式。', enabled: true },
  { kind: 'joke', content: '同事说“这个需求很简单”，我听完觉得“简单”两个字在这句话里承担了太多。', enabled: true },
  { kind: 'joke', content: '午休睡了二十分钟，醒来恍惚得像穿越回了上个世纪。', enabled: true },
  { kind: 'joke', content: '写周报最考验的不是总结能力，而是把“每天救火”写成“保障核心链路平稳运行”。', enabled: true },
  { kind: 'joke', content: '刚立下“今天绝不摸鱼”的誓言，转身就开始认真挑选新主题配色。', enabled: true },
  { kind: 'joke', content: '为什么周一离周五那么远，周五离周一却只有一眨眼？这是物理学未解之谜。', enabled: true },
  { kind: 'joke', content: '主持说“大家畅所欲言”，会议室立刻安静得能听见空调出风口的呼吸声。', enabled: true },
  { kind: 'joke', content: '喝水提醒响了：端起空杯子看了三秒，又默默放回原位，假装喝过了。', enabled: true },
  { kind: 'joke', content: '每次把一个大 Bug 修好，我都像侦探破案一样骄傲——哪怕那 Bug 是我昨天自己写的。', enabled: true },
  { kind: 'joke', content: '下班前十分钟收到一句“在吗”，心率瞬间从 65 飙升到 120。', enabled: true },
  { kind: 'joke', content: '买了人体工学椅之后，我坐姿确实端正了整整十五分钟。', enabled: true },
  { kind: 'joke', content: '计划表写得像精密仪器，执行起来像自由爵士乐。', enabled: true },
  { kind: 'joke', content: '我和早睡之间，永远隔着“再看最后五分钟手机”的深渊。', enabled: true },
  { kind: 'joke', content: '看到“无需回复，知悉即可”这八个字，是我今天收获的最温暖的关怀。', enabled: true },
  { kind: 'joke', content: '同事夸我脾气好，其实只是因为工位抽屉里备了足够多的零食。', enabled: true },
  { kind: 'joke', content: '打开冰箱忘拿东西、打开网页忘搜什么，说明大脑正在自动清理缓存。', enabled: true },
  { kind: 'joke', content: '所谓“稍后同步”，有时候是十分钟后，有时候是下个季度。', enabled: true },
  { kind: 'joke', content: '电脑重启能解决百分之八十的问题，去接杯水再回来能解决剩下百分之二十的情绪。', enabled: true },
  { kind: 'joke', content: '我把待办全标成了“重点”，结果全部重点等于没有重点，只好老实重新排。', enabled: true },
  { kind: 'joke', content: '今天最大的成就：在截止时间前两小时交稿，成功体验了一把游刃有余。', enabled: true }
]

export const HEALTH_CATALOG_VERSION = 2

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
    title: '端正坐姿',
    message: '收一收下巴、沉下双肩、双脚平放地面，别不知不觉把背卷成虾米。',
    emoji: '🪑',
    enabled: true,
    intervalMinutes: 45,
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
  },
  {
    title: '放松颈椎',
    message: '缓慢左右侧倾头部与轻仰下巴各保持 10 秒，给紧绷的颈肩松松绑。',
    emoji: '🦒',
    enabled: false,
    intervalMinutes: 75,
    workHoursOnly: true,
    workStart: '09:00',
    workEnd: '18:30'
  },
  {
    title: '活动手腕手指',
    message: '甩一甩手腕、张开五指再轻握 10 次，缓解长时间敲键盘与握鼠标的僵硬。',
    emoji: '👐',
    enabled: false,
    intervalMinutes: 80,
    workHoursOnly: true,
    workStart: '09:00',
    workEnd: '18:30'
  },
  {
    title: '深呼吸减压',
    message: '做 3 次 4-4-6 慢呼吸：吸气 4 秒、停顿 4 秒、缓缓呼气 6 秒，帮大脑降降温。',
    emoji: '🌬️',
    enabled: false,
    intervalMinutes: 60,
    workHoursOnly: true,
    workStart: '09:00',
    workEnd: '18:30'
  },
  {
    title: '眨眼润目',
    message: '连续慢眨眼 10 次，或闭目掌心轻敷 20 秒，让干涩的双眼重新湿润放松。',
    emoji: '👁️',
    enabled: false,
    intervalMinutes: 40,
    workHoursOnly: true,
    workStart: '09:00',
    workEnd: '18:30'
  },
  {
    title: '勾脚踝活血',
    message: '坐姿抬起脚尖交替勾脚、轻转脚踝 15 次，促进久坐后的下肢血液循环。',
    emoji: '🦶',
    enabled: false,
    intervalMinutes: 70,
    workHoursOnly: true,
    workStart: '09:00',
    workEnd: '18:30'
  },
  {
    title: '午后补给小憩',
    message: '下午容易犯困，起来泡杯温茶、吃几颗坚果或洗把脸，轻轻重启专注力。',
    emoji: '🍵',
    enabled: false,
    intervalMinutes: 120,
    workHoursOnly: true,
    workStart: '14:00',
    workEnd: '17:30'
  },
  {
    title: '整理桌面收尾',
    message: '顺手归置桌面水杯与纸笔、清理多余浏览器标签，给今天的工作一个利落的句号。',
    emoji: '🧹',
    enabled: false,
    intervalMinutes: 180,
    workHoursOnly: true,
    workStart: '17:00',
    workEnd: '18:30'
  }
]

export function seedQuotes(): QuoteItem[] {
  return SAMPLE_QUOTES.map((q) => ({ ...q, id: createId('qt') }))
}

/**
 * 将新增的内置词条合并至已有词条库（按正文去重，保留用户自定义词条与已有开关状态）
 */
export function mergeBuiltinQuotes(existing: QuoteItem[]): { quotes: QuoteItem[]; added: number } {
  const seen = new Set(existing.map((q) => q.content.trim()))
  const additions: QuoteItem[] = []
  for (const sample of SAMPLE_QUOTES) {
    if (!seen.has(sample.content.trim())) {
      seen.add(sample.content.trim())
      additions.push({ ...sample, id: createId('qt') })
    }
  }
  if (!additions.length) return { quotes: existing, added: 0 }
  return { quotes: [...existing, ...additions], added: additions.length }
}

export function seedHealth(): HealthReminder[] {
  return DEFAULT_HEALTH.map((h) => ({ ...h, id: createId('hl') }))
}

/**
 * 将新增的内置健康节律合并至已有列表（按标题去重，保留用户自定义节律与已有开关/时段配置）
 */
export function mergeBuiltinHealth(existing: HealthReminder[]): { health: HealthReminder[]; added: number } {
  const seen = new Set(existing.map((h) => h.title.trim()))
  const additions: HealthReminder[] = []
  for (const sample of DEFAULT_HEALTH) {
    if (!seen.has(sample.title.trim())) {
      seen.add(sample.title.trim())
      additions.push({ ...sample, id: createId('hl') })
    }
  }
  if (!additions.length) return { health: existing, added: 0 }
  return { health: [...existing, ...additions], added: additions.length }
}

export function seedDemoWork(now = new Date()): WorkItem[] {
  const todayDue = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0, 0)
  const in3Days = addDays(todayDue, 3)
  const in7Days = addDays(todayDue, 7)
  const at = nowIso()

  return [
    {
      id: createId('wk'),
      title: '整理月度工作复盘与下月计划',
      notes: '完成后可直接去「周报月报」或右上角一键导出标准 Excel 台账。',
      dueAt: in3Days.toISOString(),
      createdAt: at,
      updatedAt: at,
      status: 'doing',
      priority: 'high',
      pinned: true,
      subtasks: [
        { id: createId('st'), title: '汇总本月重点项目交付结果', done: true },
        { id: createId('st'), title: '梳理遗留风险与下月排期', done: false },
        { id: createId('st'), title: '导出 Excel 台账并同步团队', done: false }
      ],
      notify: {
        enabled: true,
        advanceDays: 3,
        time: '10:00',
        frequency: 'daily'
      },
      repeat: 'monthly',
      sourceText: '任务：整理月度工作复盘与下月计划 3天后 从今天开始每天早上10点提醒 #汇报 重点',
      tags: ['汇报', '示例']
    },
    {
      id: createId('wk'),
      title: '核对本周需求评审结论',
      notes: '确认排期边界与接口联调时间节点。',
      dueAt: todayDue.toISOString(),
      createdAt: at,
      updatedAt: at,
      status: 'todo',
      priority: 'normal',
      subtasks: [],
      notify: {
        enabled: true,
        advanceDays: 0,
        time: '15:30',
        frequency: 'once'
      },
      repeat: 'none',
      sourceText: '今天 15:30 核对本周需求评审结论 #研发',
      tags: ['研发', '示例']
    },
    {
      id: createId('wk'),
      title: '归档季度费用报销与发票凭证',
      notes: '纸质发票需按日期分类粘贴，电子发票统一汇总。',
      dueAt: in7Days.toISOString(),
      createdAt: at,
      updatedAt: at,
      status: 'todo',
      priority: 'normal',
      subtasks: [],
      notify: {
        enabled: true,
        advanceDays: 2,
        time: '09:30',
        frequency: 'once'
      },
      repeat: 'none',
      sourceText: '7天后 归档季度费用报销与发票凭证 提前2天通知 #财务',
      tags: ['财务', '示例']
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
