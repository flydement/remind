import { useState } from 'react'
import type { WorkItem } from '@shared/types'
import { formatDateCn, formatDateTimeCn, isPastDue } from '@shared/time'
import { previewNotifyDate } from '@shared/parser'

const REPEAT_TAG = {
  weekly: '每周重复',
  monthly: '每月重复'
} as const

export default function WorkList({
  items,
  empty,
  now = new Date(),
  onToggle,
  onOpen,
  onDelete
}: {
  items: WorkItem[]
  empty: string
  now?: Date
  onToggle: (w: WorkItem) => void
  onOpen: (w: WorkItem) => void
  onDelete?: (w: WorkItem) => void
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null)

  if (!items.length) return <div className="empty">{empty}</div>
  return (
    <div className="work-list">
      {items.map((w) => {
        const overdue = w.status !== 'done' && isPastDue(w.dueAt, now)
        const confirming = confirmId === w.id
        return (
          <div className={`work ${w.status === 'done' ? 'done' : ''} ${overdue ? 'overdue' : ''}`} key={w.id}>
            <button
              className={`check ${w.status === 'done' ? 'on' : ''}`}
              title={w.status === 'done' ? '标为未完成' : '标为已完成'}
              onClick={() => onToggle(w)}
            />
            <div onClick={() => onOpen(w)} style={{ cursor: 'pointer' }}>
              <p className="title">
                {w.title}
                {overdue ? <span className="tag danger" style={{ marginLeft: 8 }}>已逾期</span> : null}
                {w.repeat !== 'none' ? <span className="tag accent" style={{ marginLeft: 6 }}>{REPEAT_TAG[w.repeat]}</span> : null}
              </p>
              <p className="meta">
                截止 {formatDateCn(w.dueAt)}
                {w.notify.snoozedUntil ? ` · 延后至 ${formatDateTimeCn(w.notify.snoozedUntil)}` : ''}
                {w.notify.enabled && !w.notify.snoozedUntil ? ` · 提醒 ${previewNotifyDate(w.dueAt, w.notify.advanceDays, w.notify.time)}` : ''}
                {w.notify.lastFiredAt ? ` · 上次提醒 ${formatDateTimeCn(w.notify.lastFiredAt)}` : ''}
              </p>
            </div>
            {onDelete ? (
              confirming ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn danger small"
                    onClick={() => {
                      setConfirmId(null)
                      onDelete(w)
                    }}
                  >
                    确认
                  </button>
                  <button className="btn ghost small" onClick={() => setConfirmId(null)}>取消</button>
                </div>
              ) : (
                <button className="btn ghost small" onClick={() => setConfirmId(w.id)}>删除</button>
              )
            ) : (
              <span className="muted">{w.status === 'done' ? '完成' : overdue ? '逾期' : '待办'}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
