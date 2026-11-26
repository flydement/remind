import { useState } from 'react'
import { CalendarPlus, ChevronDown, ChevronRight, Pin, Play, Plus, Sparkles, Trash2 } from 'lucide-react'
import type { RepeatRule, WorkItem } from '@shared/types'
import { formatDateCn, formatDateTimeCn, isPastDue, relativeDaysLabel } from '@shared/time'
import { previewNotifyDate } from '@shared/parser'

const REPEAT_TAG: Record<Exclude<RepeatRule, 'none'>, string> = {
  daily: '每天',
  weekdays: '工作日',
  weekly: '每周',
  monthly: '每月'
}

export default function WorkList({
  items,
  empty,
  emptyAction,
  now = new Date(),
  onToggle,
  onOpen,
  onDelete,
  onStartFocus,
  onTogglePin,
  onToggleSubtask,
  onAddSubtask,
  onCycleDoing,
  onPostponeOneDay
}: {
  items: WorkItem[]
  empty: string
  emptyAction?: { label: string; onClick: () => void }
  now?: Date
  onToggle: (w: WorkItem) => void
  onOpen: (w: WorkItem) => void
  onDelete?: (w: WorkItem) => void
  onStartFocus?: (w: WorkItem) => void
  onTogglePin?: (workId: string) => void
  onToggleSubtask?: (workId: string, subtaskId: string) => void
  onAddSubtask?: (workId: string, title: string) => void
  onCycleDoing?: (w: WorkItem) => void
  onPostponeOneDay?: (w: WorkItem) => void
}) {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({})
  const [subInputs, setSubInputs] = useState<Record<string, string>>({})

  if (!items.length) {
    return (
      <div className="empty">
        <div>{empty}</div>
        {emptyAction ? (
          <button
            type="button"
            className="btn ghost small"
            style={{ marginTop: 12 }}
            onClick={emptyAction.onClick}
          >
            <Sparkles size={13} color="var(--primary)" />
            {emptyAction.label}
          </button>
        ) : null}
      </div>
    )
  }

  const toggleExpand = (id: string): void => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const submitSubtask = (workId: string): void => {
    const val = (subInputs[workId] ?? '').trim()
    if (!val || !onAddSubtask) return
    onAddSubtask(workId, val)
    setSubInputs((prev) => ({ ...prev, [workId]: '' }))
  }

  return (
    <div className="work-list">
      {items.map((w) => {
        const isDone = w.status === 'done'
        const isDoing = w.status === 'doing'
        const overdue = !isDone && isPastDue(w.dueAt, now)
        const rel = !isDone ? relativeDaysLabel(w.dueAt, now) : null
        const subtasks = w.subtasks ?? []
        const doneSub = subtasks.filter((s) => s.done).length
        const subPct = subtasks.length > 0 ? Math.round((doneSub / subtasks.length) * 100) : 0
        const expanded = Boolean(expandedIds[w.id])

        return (
          <div
            className={`work ${isDone ? 'done' : ''} ${overdue ? 'overdue' : ''} ${w.pinned && !isDone ? 'pinned' : ''}`}
            key={w.id}
          >
            <button
              type="button"
              className={`check ${isDone ? 'on' : isDoing ? 'doing' : ''}`}
              title={isDone ? '标为未完成' : '标为已完成'}
              onClick={() => onToggle(w)}
            />
            <div style={{ minWidth: 0 }}>
              <div className="title" onClick={() => onOpen(w)} style={{ cursor: 'pointer' }}>
                {w.pinned && !isDone ? <Pin size={13} color="var(--primary)" /> : null}
                <span className="title-text">{w.title}</span>
                {!isDone && w.priority === 'high' ? <span className="tag danger">重点</span> : null}
                {isDoing ? <span className="tag primary">进行中</span> : null}
                {rel ? (
                  <span
                    className={`tag ${
                      rel.tone === 'danger'
                        ? 'danger'
                        : rel.tone === 'warn'
                          ? 'warn'
                          : rel.tone === 'accent'
                            ? 'accent'
                            : ''
                    }`}
                  >
                    {rel.text}
                  </span>
                ) : null}
                {w.repeat !== 'none' ? <span className="tag accent">{REPEAT_TAG[w.repeat]}</span> : null}
                {w.tags.map((t) => (
                  <span key={t} className="tag">
                    #{t}
                  </span>
                ))}
              </div>

              <div className="meta">
                <span>截止 {formatDateCn(w.dueAt)}</span>
                {w.assignee ? <span>· @{w.assignee}</span> : null}
                {w.notify.snoozedUntil ? <span>· 延后至 {formatDateTimeCn(w.notify.snoozedUntil)}</span> : null}
                {w.notify.enabled && !w.notify.snoozedUntil && !isDone ? (
                  <span>
                    · 提醒 {previewNotifyDate(w.dueAt, w.notify.advanceDays, w.notify.time, w.notify.frequency)}
                  </span>
                ) : null}
                {w.focusMinutes ? <span>· 已专注 {w.focusMinutes}m</span> : null}
                {subtasks.length > 0 ? (
                  <button type="button" className="subtask-pill" onClick={() => toggleExpand(w.id)}>
                    {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    <span>
                      步骤 {doneSub}/{subtasks.length}
                    </span>
                    <i className="subtask-mini-bar">
                      <em style={{ width: `${subPct}%` }} />
                    </i>
                  </button>
                ) : null}
              </div>

              {w.notes.trim() ? (
                <div className="work-note-line" title={w.notes} onClick={() => onOpen(w)}>
                  {w.notes.trim()}
                </div>
              ) : null}

              {expanded && subtasks.length > 0 ? (
                <div className="subtask-inline">
                  {subtasks.map((st) => (
                    <div key={st.id} className={`subtask-row ${st.done ? 'done' : ''}`}>
                      <button
                        type="button"
                        className={`check ${st.done ? 'on' : ''}`}
                        style={{ width: 15, height: 15, marginTop: 0 }}
                        onClick={() => onToggleSubtask?.(w.id, st.id)}
                      />
                      <span
                        style={{ cursor: onToggleSubtask ? 'pointer' : 'default' }}
                        onClick={() => onToggleSubtask?.(w.id, st.id)}
                      >
                        {st.title}
                      </span>
                    </div>
                  ))}
                  {!isDone && onAddSubtask ? (
                    <div className="subtask-inline-add">
                      <Plus size={12} color="var(--ink-faint)" />
                      <input
                        value={subInputs[w.id] ?? ''}
                        placeholder="添加新步骤，回车保存..."
                        onChange={(e) => setSubInputs((prev) => ({ ...prev, [w.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            submitSubtask(w.id)
                          }
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="work-actions">
              {overdue && onPostponeOneDay ? (
                <button
                  type="button"
                  className="btn ghost small"
                  title="一键顺延到明天"
                  onClick={() => onPostponeOneDay(w)}
                >
                  <CalendarPlus size={12} />
                  顺延
                </button>
              ) : null}
              {!isDone && onCycleDoing ? (
                <button
                  type="button"
                  className={`btn ghost small ${isDoing ? '' : 'hover-reveal'}`}
                  title={isDoing ? '切回待办' : '标记为进行中'}
                  onClick={() => onCycleDoing(w)}
                >
                  {isDoing ? '暂停' : '推进'}
                </button>
              ) : null}
              {!isDone && onStartFocus ? (
                <button
                  type="button"
                  className="icon-btn hover-reveal"
                  title="开启番茄专注"
                  onClick={() => onStartFocus(w)}
                >
                  <Play size={14} />
                </button>
              ) : null}
              {!isDone && onTogglePin ? (
                <button
                  type="button"
                  className={`icon-btn ${w.pinned ? 'active' : 'hover-reveal'}`}
                  title={w.pinned ? '取消置顶' : '置顶'}
                  onClick={() => onTogglePin(w.id)}
                >
                  <Pin size={14} />
                </button>
              ) : null}
              {onDelete ? (
                <button
                  type="button"
                  className="icon-btn hover-reveal"
                  title="删除（支持撤销）"
                  onClick={() => onDelete(w)}
                >
                  <Trash2 size={14} />
                </button>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
