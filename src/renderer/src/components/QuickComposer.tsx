import { useMemo, useRef, useState } from 'react'
import { Bell, BellOff, Calendar, Flag, HelpCircle, Repeat, SlidersHorizontal, Sparkles, User, X } from 'lucide-react'
import type { RepeatRule, WorkItem, WorkPriority } from '@shared/types'
import { parseWorkText, previewNotifyDate, WORK_SYNTAX_GUIDE } from '@shared/parser'
import { addDays, startOfWeek, toLocalDate } from '@shared/time'
import { newWorkItem, type useAppState } from '../state'

const SAMPLES = [
  '整理财务月报 截止12月31日 从今天开始每天早上10点提醒 #财务',
  '周五 下午3点半 架构评审 #研发 重点',
  '每个工作日重复 17:30 填写工时'
]

const REPEAT_LABEL: Record<Exclude<RepeatRule, 'none'>, string> = {
  daily: '每天重复',
  weekdays: '工作日重复',
  weekly: '每周重复',
  monthly: '每月重复'
}

function makeEndOfDayIso(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 18, 0, 0, 0).toISOString()
}

export default function QuickComposer({
  app,
  compact = false,
  onOpenDetailed
}: {
  app: ReturnType<typeof useAppState>
  compact?: boolean
  onOpenDetailed: (draftItem: WorkItem, clearInput: () => void) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [text, setText] = useState('')
  const [showSyntax, setShowSyntax] = useState(false)
  const [priorityOverride, setPriorityOverride] = useState<WorkPriority | null>(null)
  const [notifyOverride, setNotifyOverride] = useState<boolean | null>(null)
  const [dueOverride, setDueOverride] = useState<string | null>(null)

  const parsed = useMemo(() => parseWorkText(text, app.now), [text, app.now])
  const effectivePriority: WorkPriority = priorityOverride ?? parsed.priority
  const effectiveNotifyEnabled: boolean = notifyOverride ?? parsed.notify.enabled
  const effectiveDueAt: string = dueOverride ?? parsed.dueAt

  const quickDates = useMemo(() => {
    const today = new Date(app.now.getFullYear(), app.now.getMonth(), app.now.getDate())
    return [
      { label: '今天', iso: makeEndOfDayIso(today) },
      { label: '明天', iso: makeEndOfDayIso(addDays(today, 1)) },
      { label: '后天', iso: makeEndOfDayIso(addDays(today, 2)) },
      { label: '下周一', iso: makeEndOfDayIso(addDays(startOfWeek(today), 7)) }
    ]
  }, [app.now])

  const resetAll = (): void => {
    setText('')
    setPriorityOverride(null)
    setNotifyOverride(null)
    setDueOverride(null)
  }

  const handleTextChange = (val: string): void => {
    setText(val)
    setDueOverride(null)
    if (!val.trim()) {
      setPriorityOverride(null)
      setNotifyOverride(null)
    }
  }

  const cycleQuickDate = (): void => {
    const curDate = toLocalDate(new Date(effectiveDueAt))
    const idx = quickDates.findIndex((q) => toLocalDate(new Date(q.iso)) === curDate)
    const next = quickDates[(idx + 1) % quickDates.length]
    setDueOverride(next.iso)
  }

  const buildItem = (): WorkItem =>
    newWorkItem({
      title: parsed.title,
      dueAt: effectiveDueAt,
      priority: effectivePriority,
      assignee: parsed.assignee,
      tags: parsed.tags,
      notify: { ...parsed.notify, enabled: effectiveNotifyEnabled },
      repeat: parsed.repeat,
      notes: parsed.notes,
      sourceText: parsed.sourceText
    })

  const quickCreate = (): void => {
    if (!text.trim()) {
      inputRef.current?.focus()
      return
    }
    app.saveWork(buildItem())
    resetAll()
    inputRef.current?.focus()
  }

  const openDetailed = (): void => {
    if (!text.trim()) {
      onOpenDetailed(newWorkItem({}), resetAll)
      return
    }
    onOpenDetailed(buildItem(), resetAll)
  }

  const dueStr = toLocalDate(new Date(effectiveDueAt))
  const notifyStr = effectiveNotifyEnabled
    ? previewNotifyDate(effectiveDueAt, parsed.notify.advanceDays, parsed.notify.time, parsed.notify.frequency)
    : '不提醒'
  const showSamples = !compact || app.state.workItems.length === 0

  return (
    <div className="card composer-card" style={{ marginBottom: compact ? 14 : 18 }}>
      {!compact ? (
        <div className="section-head" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>
            <Sparkles size={15} color="var(--primary)" /> 快速新建工作项
          </h3>
          <button
            type="button"
            className={`chip ${showSyntax ? 'on' : ''}`}
            style={{ padding: '4px 10px', fontSize: 12 }}
            onClick={() => setShowSyntax((v) => !v)}
          >
            <HelpCircle size={13} />
            {showSyntax ? '收起语法' : '语法速查'}
          </button>
        </div>
      ) : null}

      <div className="composer">
        <div className="composer-input-wrap">
          <Sparkles size={15} className="composer-icon" />
          <input
            ref={inputRef}
            data-quick-composer="true"
            value={text}
            placeholder="一句话回车即建，如：周五 15:30 架构评审 #研发 重点（按 N 聚焦）"
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                openDetailed()
              } else if (e.key === 'Enter') {
                e.preventDefault()
                quickCreate()
              } else if (e.key === 'Escape' && text) {
                e.preventDefault()
                resetAll()
              }
            }}
          />
          {text ? (
            <button
              type="button"
              className="composer-clear"
              title="清空输入 (Esc)"
              onClick={() => {
                resetAll()
                inputRef.current?.focus()
              }}
            >
              <X size={13} />
            </button>
          ) : null}
        </div>
        <button type="button" className="btn" onClick={quickCreate}>
          极速创建
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={openDetailed}
          title="展开完整设置弹窗 (Ctrl+Enter)"
        >
          <SlidersHorizontal size={14} />
          详细配置
        </button>
        {compact ? (
          <button
            type="button"
            className={`icon-btn ${showSyntax ? 'active' : ''}`}
            onClick={() => setShowSyntax((v) => !v)}
            title="查看自然语言录入语法"
          >
            <HelpCircle size={15} />
          </button>
        ) : null}
      </div>

      {text.trim() ? (
        <div className="parsed-preview">
          <div className="parsed-tokens">
            <span className="parsed-title-chip" title="识别出的事项名称">
              {parsed.title}
            </span>
            <button
              type="button"
              className="tag tag-interactive"
              title="点击快速切换截止日（今天 / 明天 / 后天 / 下周一）"
              onClick={cycleQuickDate}
            >
              <Calendar size={11} /> 截止 {dueStr}
            </button>
            <button
              type="button"
              className={`tag tag-interactive ${effectiveNotifyEnabled ? 'primary' : ''}`}
              title="点击可快速切换是否启用提醒"
              onClick={() => setNotifyOverride(!effectiveNotifyEnabled)}
            >
              {effectiveNotifyEnabled ? <Bell size={11} /> : <BellOff size={11} />}
              {notifyStr}
            </button>
            <button
              type="button"
              className={`tag tag-interactive ${effectivePriority === 'high' ? 'danger' : ''}`}
              title="点击可快速切换「重点 / 一般」优先级"
              onClick={() => setPriorityOverride(effectivePriority === 'high' ? 'normal' : 'high')}
            >
              <Flag size={11} />
              {effectivePriority === 'high' ? '重点' : '一般'}
            </button>
            {parsed.repeat !== 'none' ? (
              <span className="tag accent">
                <Repeat size={11} /> {REPEAT_LABEL[parsed.repeat]}
              </span>
            ) : null}
            {parsed.assignee ? (
              <span className="tag">
                <User size={11} /> {parsed.assignee}
              </span>
            ) : null}
            {parsed.tags.map((t) => (
              <span key={t} className="tag">
                #{t}
              </span>
            ))}
            {parsed.notes ? (
              <span className="tag" title={parsed.notes}>
                备注：{parsed.notes.length > 18 ? `${parsed.notes.slice(0, 18)}…` : parsed.notes}
              </span>
            ) : null}
          </div>
          <div className="parsed-preview-foot">
            <span className="muted">
              {parsed.hints.length ? parsed.hints.join('；') : '点击标签可直接微调截止日、提醒与优先级'}
            </span>
            <span className="muted">Enter 创建 · Ctrl+Enter 详配</span>
          </div>
        </div>
      ) : showSamples ? (
        <div className="quick-samples">
          <span>试试：</span>
          {SAMPLES.map((s) => (
            <button
              key={s}
              type="button"
              className="sample-pill"
              onClick={() => {
                handleTextChange(s)
                inputRef.current?.focus()
              }}
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      {showSyntax ? (
        <div className="syntax-guide">
          {WORK_SYNTAX_GUIDE.map((g) => (
            <div key={g.category} className="syntax-item">
              <b>{g.category}</b>
              <span>{g.patterns}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
