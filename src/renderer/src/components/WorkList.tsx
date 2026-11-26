import { useState } from 'react'
import { ChevronDown, ChevronRight, Pin, Play, Trash2 } from 'lucide-react'
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
  now = new Date(),
  onToggle,
  onOpen,
  onDelete,
  onStartFocus,
  onTogglePin,
  onToggleSubtask,
  onCycleDoing
}: {
  items: WorkItem[]
  empty: string
  now?: Date
  onToggle: (w: WorkItem) => void
  onOpen: (w: WorkItem) => void
  onDelete?: (w: WorkItem) => void
  onStartFocus?: (w: WorkItem) => void
  onTogglePin?: (workId: string) => void
  onToggleSubtask?: (workId: string, subtaskId: string) => void
  onCycleDoing?: (w: WorkItem) => void
}) {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({})

  if (!items.length) return <div className="empty">{empty}</div>

  const toggleExpand = (id: string): void => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }))
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
                {!isDone ? (
                  w.priority === 'high' ? (
                    <span className="tag danger">重点</span>
                  ) : (
                    <span className="tag">一般</span>
                  )
                ) : null}
                {isDoing ? <span className="tag primary">进行中</span> : null}
                {rel ? (
                  <span className={`tag ${rel.tone === 'danger' ? 'danger' : rel.tone === 'warn' ? 'warn' : rel.tone === 'accent' ? 'accent' : ''}`}>
                    {rel.text}
                  </span>
                ) : null}
                {w.repeat !== 'none' ? <span className="tag accent">{REPEAT_TAG[w.repeat]}</span> : null}
                {w.tags.map((t) => (
                  <span key={t} className="tag">#{t}</span>
                ))}
              </div>

              <div className="meta">
                <span>截止 {formatDateCn(w.dueAt)}</span>
                {w.notify.snoozedUntil ? <span>· 延后至 {formatDateTimeCn(w.notify.snoozedUntil)}</span> : null}
                {w.notify.enabled && !w.notify.snoozedUntil && !isDone ? (
                  <span>· 提醒 {previewNotifyDate(w.dueAt, w.notify.advanceDays, w.notify.time, w.notify.frequency)}</span>
                ) : null}
                {w.focusMinutes ? <span>· 已专注 {w.focusMinutes}m</span> : null}
                {subtasks.length > 0 ? (
                  <button
                    type="button"
                    className="sample-pill"
                    style={{ padding: '1px 7px', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                    onClick={() => toggleExpand(w.id)}
                  >
                    {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    子任务 {doneSub}/{subtasks.length}
                  </button>
                ) : null}
              </div>

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
                </div>
              ) : null}
            </div>

            <div className="work-actions">
              {!isDone && onCycleDoing ? (
                <button
                  type="button"
                  className={`btn ghost small`}
                  title={isDoing ? '切回待办' : '标记为进行中'}
                  onClick={() => onCycleDoing(w)}
                >
                  {isDoing ? '暂停' : '推进'}
                </button>
              ) : null}
              {!isDone && onStartFocus ? (
                <button
                  type="button"
                  className="icon-btn"
                  title="对此事项开启 25 分钟专注"
                  onClick={() => onStartFocus(w)}
                >
                  <Play size={14} />
                </button>
              ) : null}
              {!isDone && onTogglePin ? (
                <button
                  type="button"
                  className={`icon-btn ${w.pinned ? 'active' : ''}`}
                  title={w.pinned ? '取消置顶' : '置顶'}
                  onClick={() => onTogglePin(w.id)}
                >
                  <Pin size={14} />
                </button>
              ) : null}
              {onDelete ? (
                <button
                  type="button"
                  className="icon-btn"
                  title="删除（支持撤销）"
                  onClick={() => onDelete(w)}
                >
                  <Trash2 size={14} />
                </button>
              ) : (
                <span className="muted">{isDone ? '已完成' : overdue ? '已逾期' : isDoing ? '进行中' : '待办'}</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
