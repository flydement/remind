import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  Columns3,
  FastForward,
  FileSpreadsheet,
  LayoutList,
  Play,
  RotateCcw,
  Search,
  Trash2,
  X
} from 'lucide-react'
import type { WorkItem, WorkStatus } from '@shared/types'
import { formatDateCn, isPastDue, isSameDay, relativeDaysLabel } from '@shared/time'
import PageHead from '../components/PageHead'
import QuickComposer from '../components/QuickComposer'
import type { useAppState } from '../state'
import WorkEditor from '../components/WorkEditor'
import WorkList from '../components/WorkList'
import ExportExcelModal from '../components/ExportExcelModal'

export type WorkFilter = 'open' | 'doing' | 'today' | 'overdue' | 'done' | 'all'
type ViewMode = 'list' | 'kanban'
type SortBy = 'due' | 'priority' | 'created'

export default function WorkPage({
  app,
  initialFilter
}: {
  app: ReturnType<typeof useAppState>
  initialFilter?: WorkFilter | null
}) {
  const [view, setView] = useState<ViewMode>('list')
  const [filter, setFilter] = useState<WorkFilter>(initialFilter ?? 'open')
  const [sortBy, setSortBy] = useState<SortBy>('due')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<WorkItem | null>(null)
  const clearComposerRef = useRef<(() => void) | null>(null)
  const [excelOpen, setExcelOpen] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<WorkStatus | null>(null)

  useEffect(() => {
    if (initialFilter) {
      setView('list')
      setFilter(initialFilter)
    }
  }, [initialFilter])

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const w of app.state.workItems) {
      for (const t of w.tags) set.add(t)
    }
    return Array.from(set)
  }, [app.state.workItems])

  const baseMatched = useMemo(() => {
    const q = query.trim().toLowerCase()
    return app.state.workItems.filter((w) => {
      if (activeTag && !w.tags.includes(activeTag)) return false
      if (!q) return true
      return (
        w.title.toLowerCase().includes(q) ||
        w.notes.toLowerCase().includes(q) ||
        (w.assignee?.toLowerCase().includes(q) ?? false) ||
        w.tags.some((t) => t.toLowerCase().includes(q)) ||
        (w.subtasks?.some((s) => s.title.toLowerCase().includes(q)) ?? false)
      )
    })
  }, [app.state.workItems, activeTag, query])

  const sortItems = (arr: WorkItem[], mode: SortBy, forDone = false): WorkItem[] => {
    return [...arr].sort((a, b) => {
      if (forDone) {
        const tb = b.completedAt ? new Date(b.completedAt).getTime() : 0
        const ta = a.completedAt ? new Date(a.completedAt).getTime() : 0
        return tb - ta
      }
      if (a.status !== b.status && (a.status === 'done' || b.status === 'done')) {
        return a.status === 'done' ? 1 : -1
      }
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1
      if (mode === 'priority') {
        const pa = a.priority === 'high' ? 0 : 1
        const pb = b.priority === 'high' ? 0 : 1
        if (pa !== pb) return pa - pb
      } else if (mode === 'created') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
    })
  }

  const listItems = useMemo(() => {
    const filtered = baseMatched.filter((w) => {
      if (filter === 'done') return w.status === 'done'
      if (filter === 'open') return w.status !== 'done'
      if (filter === 'doing') return w.status === 'doing'
      if (filter === 'today') return w.status !== 'done' && isSameDay(new Date(w.dueAt), app.now)
      if (filter === 'overdue') return w.status !== 'done' && isPastDue(w.dueAt, app.now)
      return true
    })
    return sortItems(filtered, sortBy, filter === 'done')
  }, [baseMatched, filter, sortBy, app.now])

  const kanbanCols = useMemo(() => {
    return {
      todo: sortItems(baseMatched.filter((w) => w.status === 'todo'), sortBy),
      doing: sortItems(baseMatched.filter((w) => w.status === 'doing'), sortBy),
      done: sortItems(baseMatched.filter((w) => w.status === 'done'), sortBy, true).slice(0, 20)
    }
  }, [baseMatched, sortBy])

  const isExisting = Boolean(editing && app.state.workItems.some((w) => w.id === editing.id))

  const handleDropToCol = (targetCol: WorkStatus): void => {
    if (draggingId) {
      const found = app.state.workItems.find((w) => w.id === draggingId)
      if (found && found.status !== targetCol) {
        app.setWorkStatus(draggingId, targetCol)
      }
    }
    setDraggingId(null)
    setDragOverCol(null)
  }

  const renderKanbanCard = (w: WorkItem, col: WorkStatus) => {
    const overdue = col !== 'done' && isPastDue(w.dueAt, app.now)
    const rel = col !== 'done' ? relativeDaysLabel(w.dueAt, app.now) : null
    const sub = w.subtasks ?? []
    const doneSub = sub.filter((s) => s.done).length
    const hasBadges = (col !== 'done' && w.priority === 'high') || Boolean(rel) || w.tags.length > 0

    return (
      <div
        key={w.id}
        draggable
        onDragStart={(e) => {
          setDraggingId(w.id)
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', w.id)
        }}
        onDragEnd={() => {
          setDraggingId(null)
          setDragOverCol(null)
        }}
        className={`kanban-card ${overdue ? 'overdue' : ''} ${draggingId === w.id ? 'dragging' : ''}`}
        onClick={() => setEditing(w)}
      >
        {hasBadges ? (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
            {col !== 'done' && w.priority === 'high' ? <span className="tag danger">重点</span> : null}
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
            {w.tags.map((t) => (
              <span key={t} className="tag">
                #{t}
              </span>
            ))}
          </div>
        ) : null}
        <div
          style={{
            fontWeight: 600,
            fontSize: 13.5,
            lineHeight: 1.45,
            textDecoration: col === 'done' ? 'line-through' : 'none'
          }}
        >
          {w.title}
        </div>
        <div className="muted" style={{ marginTop: 5 }}>
          截止 {formatDateCn(w.dueAt)}
          {w.assignee ? ` · @${w.assignee}` : ''}
          {sub.length > 0 ? ` · 步骤 ${doneSub}/${sub.length}` : ''}
          {w.focusMinutes ? ` · 专注 ${w.focusMinutes}m` : ''}
        </div>
        <div className="kanban-card-foot" onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', gap: 4 }}>
            {col === 'todo' ? (
              <button className="mini-btn" onClick={() => app.setWorkStatus(w.id, 'doing')}>
                推进 <ArrowRight size={11} />
              </button>
            ) : null}
            {col === 'doing' ? (
              <>
                <button className="mini-btn ghost" onClick={() => app.setWorkStatus(w.id, 'todo')} title="退回待办">
                  <RotateCcw size={11} />
                </button>
                <button className="mini-btn" onClick={() => app.startFocus(25, w.id)} title="开启 25 分钟专注">
                  <Play size={11} /> 专注
                </button>
              </>
            ) : null}
            {col === 'done' ? (
              <button className="mini-btn ghost" onClick={() => app.setWorkStatus(w.id, 'todo')}>
                <RotateCcw size={11} /> 重开
              </button>
            ) : null}
          </div>
          {col !== 'done' ? (
            <button
              className="mini-btn"
              style={{ background: 'var(--forest-soft)', color: 'var(--forest)' }}
              onClick={() => app.setWorkStatus(w.id, 'done')}
            >
              <Check size={11} /> 完成
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <>
      <PageHead
        title="工作事项"
        sub="自然语言快速排期、多维筛选，支持列表与可拖拽看板双视图。"
        right={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              className="chip"
              onClick={() => setExcelOpen(true)}
              title="按标准模板导出本月完成情况与下月计划 Excel (.xlsx)"
            >
              <FileSpreadsheet size={13} color="var(--forest)" /> 导出 Excel
            </button>
            <button className={`chip ${view === 'list' ? 'on' : ''}`} onClick={() => setView('list')}>
              <LayoutList size={13} /> 列表视图
            </button>
            <button className={`chip ${view === 'kanban' ? 'on' : ''}`} onClick={() => setView('kanban')}>
              <Columns3 size={13} /> 看板视图
            </button>
          </div>
        }
      />

      <QuickComposer
        app={app}
        compact
        onOpenDetailed={(draftItem, clearInput) => {
          clearComposerRef.current = clearInput
          setEditing(draftItem)
        }}
      />

      <div className="work-toolbar">
        {view === 'list' ? (
          <div className="filters" style={{ marginBottom: 0 }}>
            {(
              [
                ['open', `未完成 (${app.stats.open})`],
                ['doing', `进行中 (${app.stats.doing})`],
                ['today', `今日到期 (${app.stats.dueToday})`],
                ['overdue', app.stats.overdue > 0 ? `已逾期 (${app.stats.overdue})` : '已逾期'],
                ['done', `已完成 (${app.stats.done})`],
                ['all', '全部']
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={`chip ${filter === id ? 'on' : ''}`}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <div className="muted">可直接拖拽卡片跨列流转状态，点击卡片可编辑子步骤与提醒规则。</div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="toolbar-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
          >
            <option value="due">按截止时间排序</option>
            <option value="priority">按优先级排序</option>
            <option value="created">按最新创建排序</option>
          </select>

          <div className="search-wrap">
            <Search size={14} className="search-icon" />
            <input
              className="search-bar"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索标题、标签、责任人..."
            />
            {query ? (
              <button className="search-clear" onClick={() => setQuery('')} title="清空搜索">
                <X size={13} />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {allTags.length > 0 || app.stats.overdue > 0 || app.stats.done > 0 ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 14
          }}
        >
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {allTags.length > 0 ? (
              <>
                <span className="muted">标签：</span>
                <button
                  className={`sample-pill ${activeTag === null ? 'active' : ''}`}
                  onClick={() => setActiveTag(null)}
                >
                  全部
                </button>
                {allTags.map((t) => (
                  <button
                    key={t}
                    className={`sample-pill ${activeTag === t ? 'active' : ''}`}
                    onClick={() => setActiveTag(activeTag === t ? null : t)}
                  >
                    #{t}
                  </button>
                ))}
              </>
            ) : null}
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {app.stats.overdue > 0 ? (
              <button className="btn ghost small" onClick={() => app.postponeOverdue(1)}>
                <FastForward size={12} />
                顺延全部逾期至明天
              </button>
            ) : null}
            {app.stats.done > 0 ? (
              <button className="btn ghost small" onClick={app.clearCompletedWork}>
                <Trash2 size={12} />
                清理已完成 ({app.stats.done})
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {view === 'list' ? (
        <div className="card">
          <WorkList
            items={listItems}
            now={app.now}
            empty={query.trim() || activeTag ? '没有匹配筛选条件的工作项。' : '当前列表为空，在上方输入一句话即可创建。'}
            onToggle={(w) => app.toggleWork(w)}
            onOpen={setEditing}
            onDelete={(w) => app.deleteWork(w.id)}
            onStartFocus={(w) => app.startFocus(25, w.id)}
            onTogglePin={(id) => app.togglePinWork(id)}
            onToggleSubtask={(wId, sId) => app.toggleSubtask(wId, sId)}
            onCycleDoing={(w) => app.setWorkStatus(w.id, w.status === 'doing' ? 'todo' : 'doing')}
            onPostponeOneDay={(w) => app.postponeWorkItem(w.id, 1)}
          />
        </div>
      ) : (
        <div className="kanban-grid">
          {(
            [
              { id: 'todo' as const, label: '待办事项', tone: '', badgeTone: '', items: kanbanCols.todo, emptyText: '暂无待办，可将卡片拖入此列' },
              { id: 'doing' as const, label: '推进中', tone: 'var(--primary)', badgeTone: 'primary', items: kanbanCols.doing, emptyText: '拖入事项开始推进' },
              { id: 'done' as const, label: '已完成（近 20 条）', tone: 'var(--forest)', badgeTone: 'accent', items: kanbanCols.done, emptyText: '拖入事项标记完成' }
            ]
          ).map((col) => (
            <div
              key={col.id}
              className={`kanban-col ${dragOverCol === col.id ? 'drag-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                if (dragOverCol !== col.id) setDragOverCol(col.id)
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setDragOverCol((prev) => (prev === col.id ? null : prev))
                }
              }}
              onDrop={(e) => {
                e.preventDefault()
                handleDropToCol(col.id)
              }}
            >
              <div className="kanban-col-head">
                <span style={col.tone ? { color: col.tone } : undefined}>{col.label}</span>
                <span className={`tag ${col.badgeTone}`}>{col.items.length}</span>
              </div>
              <div className="kanban-cards">
                {col.items.length ? col.items.map((w) => renderKanbanCard(w, col.id)) : <div className="empty">{col.emptyText}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing ? (
        <WorkEditor
          item={editing}
          app={app}
          onClose={() => setEditing(null)}
          onSave={(item) => {
            app.saveWork(item)
            setEditing(null)
            clearComposerRef.current?.()
            clearComposerRef.current = null
          }}
          onDelete={
            isExisting
              ? (item) => {
                  app.deleteWork(item.id)
                  setEditing(null)
                }
              : undefined
          }
        />
      ) : null}
      <ExportExcelModal open={excelOpen} app={app} onClose={() => setExcelOpen(false)} />
    </>
  )
}
