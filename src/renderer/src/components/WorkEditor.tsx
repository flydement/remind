import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { NotifyFrequency, RepeatRule, WorkItem } from '@shared/types'
import { previewNotifyDate } from '@shared/parser'
import { pad2 } from '@shared/time'

function toDateInput(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export default function WorkEditor({
  item,
  onClose,
  onSave,
  onDelete
}: {
  item: WorkItem
  onClose: () => void
  onSave: (item: WorkItem) => void
  onDelete?: (item: WorkItem) => void
}) {
  const [draft, setDraft] = useState<WorkItem>(item)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    setDraft(item)
    setConfirmDelete(false)
  }, [item])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const preview = useMemo(
    () => previewNotifyDate(draft.dueAt, draft.notify.advanceDays, draft.notify.time),
    [draft.dueAt, draft.notify.advanceDays, draft.notify.time]
  )

  const handleDateChange = (raw: string): void => {
    if (!raw) return
    const parts = raw.split('-').map(Number)
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return
    const [y, m, d] = parts
    const next = new Date(y, m - 1, d, 18, 0, 0, 0)
    if (!Number.isFinite(next.getTime())) return
    setDraft({ ...draft, dueAt: next.toISOString() })
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="card sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3>工作项详情</h3>
          <button className="icon-btn" onClick={onClose} title="关闭 (Esc)">
            <X size={16} />
          </button>
        </div>
        {draft.sourceText ? <p className="muted" style={{ margin: '4px 0 0' }}>来自：「{draft.sourceText}」</p> : null}
        <div className="field" style={{ marginTop: 14 }}>
          <label>名称</label>
          <input
            value={draft.title}
            placeholder="请输入工作项名称"
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </div>
        <div className="form-grid">
          <div className="field">
            <label>截止日期</label>
            <input
              type="date"
              value={toDateInput(draft.dueAt)}
              onChange={(e) => handleDateChange(e.target.value)}
            />
          </div>
          <div className="field">
            <label>重复</label>
            <select
              value={draft.repeat}
              onChange={(e) => setDraft({ ...draft, repeat: e.target.value as RepeatRule })}
            >
              <option value="none">不重复</option>
              <option value="weekly">每周</option>
              <option value="monthly">每月</option>
            </select>
          </div>
        </div>
        <div className="switch" style={{ marginTop: 8 }}>
          <div>
            <b>启用提醒</b>
            <div className="muted">预计推送：{preview}</div>
          </div>
          <button
            className={`toggle ${draft.notify.enabled ? 'on' : ''}`}
            onClick={() => setDraft({ ...draft, notify: { ...draft.notify, enabled: !draft.notify.enabled } })}
          />
        </div>
        <div className="form-grid">
          <div className="field">
            <label>提前几天</label>
            <input
              type="number"
              min={0}
              value={draft.notify.advanceDays}
              onChange={(e) => setDraft({ ...draft, notify: { ...draft.notify, advanceDays: Math.max(0, Number(e.target.value) || 0) } })}
            />
          </div>
          <div className="field">
            <label>几点通知</label>
            <input
              type="time"
              value={draft.notify.time}
              onChange={(e) => setDraft({ ...draft, notify: { ...draft.notify, time: e.target.value || '09:00' } })}
            />
          </div>
          <div className="field">
            <label>通知频次</label>
            <select
              value={draft.notify.frequency}
              onChange={(e) => setDraft({ ...draft, notify: { ...draft.notify, frequency: e.target.value as NotifyFrequency } })}
            >
              <option value="once">仅一次（提醒日当天）</option>
              <option value="daily">每天一次直到截止</option>
              <option value="weekdays">工作日每天</option>
              <option value="hourly">每小时（提醒日当天起）</option>
            </select>
          </div>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label>备注</label>
          <textarea rows={3} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {onDelete ? (
              confirmDelete ? (
                <button className="btn danger small" onClick={() => onDelete(draft)}>确认删除</button>
              ) : (
                <button className="btn ghost small" onClick={() => setConfirmDelete(true)}>删除</button>
              )
            ) : null}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost" onClick={onClose}>取消</button>
            <button
              className="btn"
              onClick={() => onSave({ ...draft, title: draft.title.trim() || '未命名工作项', updatedAt: new Date().toISOString() })}
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
