import { useEffect, useMemo, useState } from 'react'
import { Pin, Play, Plus, Trash2, X } from 'lucide-react'
import { normalizePriority, type NotifyFrequency, type RepeatRule, type SubtaskItem, type WorkItem, type WorkPriority, type WorkStatus } from '@shared/types'
import { createId } from '@shared/ids'
import { previewNotifyDate } from '@shared/parser'
import { pad2 } from '@shared/time'
import type { useAppState } from '../state'

function toDateInput(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export default function WorkEditor({
  item,
  app,
  onClose,
  onSave,
  onDelete
}: {
  item: WorkItem
  app?: ReturnType<typeof useAppState>
  onClose: () => void
  onSave: (item: WorkItem) => void
  onDelete?: (item: WorkItem) => void
}) {
  const [draft, setDraft] = useState<WorkItem>({
    ...item,
    priority: normalizePriority(item.priority),
    tags: item.tags ?? [],
    subtasks: item.subtasks ?? []
  })
  const [tagInput, setTagInput] = useState('')
  const [subtaskInput, setSubtaskInput] = useState('')

  useEffect(() => {
    setDraft({
      ...item,
      priority: normalizePriority(item.priority),
      tags: item.tags ?? [],
      subtasks: item.subtasks ?? []
    })
    setTagInput('')
    setSubtaskInput('')
  }, [item])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose()
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        onSave({
          ...draft,
          title: draft.title.trim() || '未命名工作项',
          updatedAt: new Date().toISOString()
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onSave, draft])

  const preview = useMemo(
    () => previewNotifyDate(draft.dueAt, draft.notify.advanceDays, draft.notify.time, draft.notify.frequency),
    [draft.dueAt, draft.notify.advanceDays, draft.notify.time, draft.notify.frequency]
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

  const addTag = (): void => {
    const clean = tagInput.trim().replace(/^#+/, '')
    if (!clean) return
    if (!draft.tags.includes(clean)) {
      setDraft({ ...draft, tags: [...draft.tags, clean] })
    }
    setTagInput('')
  }

  const removeTag = (t: string): void => {
    setDraft({ ...draft, tags: draft.tags.filter((x) => x !== t) })
  }

  const addSubtask = (): void => {
    const clean = subtaskInput.trim()
    if (!clean) return
    const nextSub: SubtaskItem = { id: createId('st'), title: clean, done: false }
    setDraft({ ...draft, subtasks: [...(draft.subtasks ?? []), nextSub] })
    setSubtaskInput('')
  }

  const toggleSub = (id: string): void => {
    setDraft({
      ...draft,
      subtasks: (draft.subtasks ?? []).map((s) => (s.id === id ? { ...s, done: !s.done } : s))
    })
  }

  const removeSub = (id: string): void => {
    setDraft({
      ...draft,
      subtasks: (draft.subtasks ?? []).filter((s) => s.id !== id)
    })
  }

  const subtasks = draft.subtasks ?? []
  const doneSubCount = subtasks.filter((s) => s.done).length

  return (
    <div className="overlay" onClick={onClose}>
      <div className="card sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3>工作项配置</h3>
            <button
              type="button"
              className={`icon-btn ${draft.pinned ? 'active' : ''}`}
              title={draft.pinned ? '取消置顶' : '置顶该事项'}
              onClick={() => setDraft({ ...draft, pinned: !draft.pinned })}
            >
              <Pin size={14} />
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {app && draft.status !== 'done' ? (
              <button
                type="button"
                className="btn ghost small"
                onClick={() => {
                  onSave({ ...draft, title: draft.title.trim() || '未命名工作项', updatedAt: new Date().toISOString() })
                  app.startFocus(25, draft.id)
                }}
              >
                <Play size={12} />
                专注 25m
              </button>
            ) : null}
            <button className="icon-btn" onClick={onClose} title="关闭 (Esc)">
              <X size={16} />
            </button>
          </div>
        </div>

        {draft.sourceText ? <p className="muted" style={{ margin: '4px 0 0' }}>解析自：「{draft.sourceText}」</p> : null}

        <div className="field" style={{ marginTop: 12 }}>
          <label>事项名称</label>
          <input
            value={draft.title}
            placeholder="请输入工作项名称"
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </div>

        <div className="form-grid">
          <div className="field">
            <label>当前状态</label>
            <select
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value as WorkStatus })}
            >
              <option value="todo">待办</option>
              <option value="doing">进行中</option>
              <option value="done">已完成</option>
            </select>
          </div>
          <div className="field">
            <label>优先级</label>
            <select
              value={draft.priority ?? 'normal'}
              onChange={(e) => setDraft({ ...draft, priority: e.target.value as WorkPriority })}
            >
              <option value="normal">一般</option>
              <option value="high">重点</option>
            </select>
          </div>
          <div className="field">
            <label>截止日期</label>
            <input
              type="date"
              value={toDateInput(draft.dueAt)}
              onChange={(e) => handleDateChange(e.target.value)}
            />
          </div>
          <div className="field">
            <label>循环周期</label>
            <select
              value={draft.repeat}
              onChange={(e) => setDraft({ ...draft, repeat: e.target.value as RepeatRule })}
            >
              <option value="none">不重复</option>
              <option value="daily">每天重复</option>
              <option value="weekdays">每个工作日</option>
              <option value="weekly">每周重复</option>
              <option value="monthly">每月重复</option>
            </select>
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>责任人（选填，用于导出 Excel 工作台账）</label>
            <input
              value={draft.assignee ?? ''}
              placeholder={app?.state.settings.owner ? `未填则默认使用「${app.state.settings.owner}」` : '例如：张三'}
              onChange={(e) => setDraft({ ...draft, assignee: e.target.value })}
            />
          </div>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label>分类标签</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {draft.tags.map((t) => (
              <span key={t} className="tag primary">
                #{t}
                <button
                  type="button"
                  style={{ border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', padding: '0 0 0 3px' }}
                  onClick={() => removeTag(t)}
                >
                  ×
                </button>
              </span>
            ))}
            <div style={{ display: 'flex', gap: 6, flex: 1, minWidth: 160 }}>
              <input
                value={tagInput}
                placeholder="输入标签后按回车添加（如 研发、汇报）"
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault()
                    addTag()
                  }
                }}
              />
              <button type="button" className="btn ghost small" onClick={addTag}>添加</button>
            </div>
          </div>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label>子任务拆解 {subtasks.length > 0 ? `(${doneSubCount}/${subtasks.length})` : ''}</label>
          {subtasks.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
              {subtasks.map((st) => (
                <div key={st.id} className={`subtask-row ${st.done ? 'done' : ''}`}>
                  <button
                    type="button"
                    className={`check ${st.done ? 'on' : ''}`}
                    style={{ width: 16, height: 16, marginTop: 0 }}
                    onClick={() => toggleSub(st.id)}
                  />
                  <span style={{ flex: 1, cursor: 'pointer' }} onClick={() => toggleSub(st.id)}>{st.title}</span>
                  <button type="button" className="icon-btn" style={{ width: 22, height: 22 }} onClick={() => removeSub(st.id)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={subtaskInput}
              placeholder="拆解可执行小步骤，按回车快速添加..."
              onChange={(e) => setSubtaskInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addSubtask()
                }
              }}
            />
            <button type="button" className="btn ghost small" onClick={addSubtask}>
              <Plus size={13} />
              添加步骤
            </button>
          </div>
        </div>

        <div className="switch" style={{ marginTop: 10 }}>
          <div>
            <b>启用定时提醒</b>
            <div className="muted">预计推送时间：{preview}</div>
          </div>
          <button
            type="button"
            className={`toggle ${draft.notify.enabled ? 'on' : ''}`}
            onClick={() => setDraft({ ...draft, notify: { ...draft.notify, enabled: !draft.notify.enabled } })}
          />
        </div>

        {draft.notify.enabled ? (
          <div className="form-grid">
            <div className="field">
              <label>提前天数</label>
              <input
                type="number"
                min={0}
                value={draft.notify.advanceDays}
                onChange={(e) => setDraft({ ...draft, notify: { ...draft.notify, advanceDays: Math.max(0, Number(e.target.value) || 0) } })}
              />
            </div>
            <div className="field">
              <label>提醒时刻</label>
              <input
                type="time"
                value={draft.notify.time}
                onChange={(e) => setDraft({ ...draft, notify: { ...draft.notify, time: e.target.value || '09:00' } })}
              />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>提醒频次</label>
              <select
                value={draft.notify.frequency}
                onChange={(e) => setDraft({ ...draft, notify: { ...draft.notify, frequency: e.target.value as NotifyFrequency } })}
              >
                <option value="once">仅一次（提醒日当天触发）</option>
                <option value="daily">每天一次直到截止日</option>
                <option value="weekdays">每个工作日提醒</option>
                <option value="hourly">每小时提醒（提醒日当天起）</option>
              </select>
            </div>
          </div>
        ) : null}

        <div className="field" style={{ marginTop: 12 }}>
          <label>备注说明</label>
          <textarea
            rows={2}
            value={draft.notes}
            placeholder="补充背景信息、文档链接或验收标准..."
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {onDelete ? (
              <button type="button" className="btn ghost small" style={{ color: 'var(--danger)' }} onClick={() => onDelete(draft)}>
                <Trash2 size={13} />
                删除事项
              </button>
            ) : null}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="muted" style={{ marginRight: 4 }}>Ctrl+Enter 保存</span>
            <button type="button" className="btn ghost" onClick={onClose}>取消</button>
            <button
              type="button"
              className="btn"
              onClick={() => onSave({ ...draft, title: draft.title.trim() || '未命名工作项', updatedAt: new Date().toISOString() })}
            >
              保存更改
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
