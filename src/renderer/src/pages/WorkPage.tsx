import { useMemo, useState } from 'react'
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
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X
} from 'lucide-react'
import type { WorkItem, WorkStatus } from '@shared/types'
import { describeDraft, parseWorkText } from '@shared/parser'
import { formatDateCn, isPastDue, isSameDay, relativeDaysLabel } from '@shared/time'
import PageHead from '../components/PageHead'
import { newWorkItem, type useAppState } from '../state'
import WorkEditor from '../components/WorkEditor'
import WorkList from '../components/WorkList'
import ExportExcelModal from '../components/ExportExcelModal'

type Filter = 'open' | 'doing' | 'today' | 'overdue' | 'done' | 'all'
type ViewMode = 'list' | 'kanban'
type SortBy = 'due' | 'priority' | 'created'

export default function WorkPage({ app }: { app: ReturnType<typeof useAppState> }) {
  const [view, setView] = useState<ViewMode>('list')
  const [filter, setFilter] = useState<Filter>('open')
  const [sortBy, setSortBy] = useState<SortBy>('due')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<WorkItem | null>(null)
  const [excelOpen, setExcelOpen] = useState(false)
  const draft = useMemo(() => parseWorkText(text, app.now), [text, app.now])

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

  const quickCreate = (): void => {
    if (!text.trim()) return
    app.saveWork(
      newWorkItem({
        title: draft.title,
        dueAt: draft.dueAt,
        priority: draft.priority,
        tags: draft.tags,
        notify: draft.notify,
        repeat: draft.repeat,
        sourceText: draft.sourceText
      })
    )
    setText('')
  }

  const openDraft = (): void => {
    if (!text.trim()) {
      setEditing(newWorkItem({}))
      return
    }
    setEditing(
      newWorkItem({
        title: draft.title,
        dueAt: draft.dueAt,
        priority: draft.priority,
        tags: draft.tags,
        notify: draft.notify,
        repeat: draft.repeat,
        sourceText: draft.sourceText
      })
    )
  }

  const renderKanbanCard = (w: WorkItem, col: WorkStatus) => {
    const overdue = col !== 'done' && isPastDue(w.dueAt, app.now)
    const rel = col !== 'done' ? relativeDaysLabel(w.dueAt, app.now) : null
    const sub = w.subtasks ?? []
    const doneSub = sub.filter((s) => s.done).length
    return (
      <div
        key={w.id}
        className={`kanban-card ${overdue ? 'overdue' : ''}`}
        onClick={() => setEditing(w)}
      >
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
          {col !== 'done' ? (
            w.priority === 'high' ? (
              <span className="tag danger">重点</span>
            ) : (
              <span className="tag">一般</span>
            )
          ) : null}
          {rel ? (
            <span className={`tag ${rel.tone === 'danger' ? 'danger' : rel.tone === 'warn' ? 'warn' : rel.tone === 'accent' ? 'accent' : ''}`}>
              {rel.text}
            </span>
          ) : null}
          {w.tags.map((t) => (
            <span key={t} className="tag">#{t}</span>
          ))}
        </div>
        <div style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.45, textDecoration: col === 'done' ? 'line-through' : 'none' }}>
          {w.title}
        </div>
        <div className="muted" style={{ marginTop: 5 }}>
          截止 {formatDateCn(w.dueAt)}
          {sub.length > 0 ? ` · 子步骤 ${doneSub}/${sub.length}` : ''}
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
        sub="支持自然语言快速录入、标签筛选、子步骤拆解，以及列表 / 看板双视图切换。"
        right={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              className="chip"
              onClick={() => setExcelOpen(true)}
              title="按标准模板导出本月完成情况与下月计划 Excel (.xlsx)"
            >
              <FileSpreadsheet size={13} color="var(--forest)" /> 导出 Excel
            </button>
            <button
              className={`chip ${view === 'list' ? 'on' : ''}`}
              onClick={() => setView('list')}
            >
              <LayoutList size={13} /> 列表视图
            </button>
            <button
              className={`chip ${view === 'kanban' ? 'on' : ''}`}
              onClick={() => setView('kanban')}
            >
              <Columns3 size={13} /> 看板视图
            </button>
          </div>
        }
      />

      <div className="card composer-card" style={{ marginBottom: 16 }}>
        <div className="composer">
          <div className="composer-input-wrap">
            <Sparkles size={15} className="composer-icon" />
            <input
              data-quick-composer="true"
              value={text}
              placeholder="例如：月报 8月11号 提前5天通知 #财务 重点（回车极速创建，Ctrl+回车详细配置）"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  openDraft()
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  quickCreate()
                }
              }}
            />
          </div>
          <button className="btn" onClick={quickCreate}>极速创建</button>
          <button className="btn ghost" onClick={openDraft}>
            <SlidersHorizontal size={14} />
            详细配置
          </button>
        </div>
        {text.trim() ? (
          <div className="parsed-preview">
            <div className="parsed-tokens">
              <span className="tag primary">识别结果</span>
              <span>{describeDraft(draft)}</span>
            </div>
            {draft.hints.length ? <span className="muted">{draft.hints.join('；')}</span> : null}
          </div>
        ) : (
          <p className="muted" style={{ margin: '9px 0 0' }}>
            支持语法：明天 / 3天后 / 周五 / 下周三 15:30 / 每月11号 提前5天 / #标签 / 重点 / 一般
          </p>
        )}
      </div>

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
          <div className="muted">点击卡片可编辑子任务与提醒规则，底部按钮可一键流转状态。</div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            style={{
              border: '1px solid var(--line-strong)',
              background: 'var(--input-bg)',
              color: 'var(--ink)',
              borderRadius: 9,
              padding: '6px 10px',
              fontSize: 12
            }}
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
              placeholder="搜索标题、标签、子任务..."
            />
            {query ? (
              <button className="search-clear" onClick={() => setQuery('')} title="清空搜索">
                <X size={13} />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {(allTags.length > 0 || app.stats.overdue > 0 || app.stats.done > 0) ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {allTags.length > 0 ? (
              <>
                <span className="muted">标签：</span>
                <button
                  className={`sample-pill ${activeTag === null ? 'on' : ''}`}
                  style={activeTag === null ? { borderColor: 'var(--primary)', color: 'var(--primary)', borderStyle: 'solid' } : undefined}
                  onClick={() => setActiveTag(null)}
                >
                  全部
                </button>
                {allTags.map((t) => (
                  <button
                    key={t}
                    className="sample-pill"
                    style={activeTag === t ? { borderColor: 'var(--primary)', color: 'var(--primary)', borderStyle: 'solid' } : undefined}
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
            empty={query.trim() || activeTag ? '没有匹配筛选条件的工作项。' : '当前列表为空。'}
            onToggle={(w) => app.toggleWork(w)}
            onOpen={setEditing}
            onDelete={(w) => app.deleteWork(w.id)}
            onStartFocus={(w) => app.startFocus(25, w.id)}
            onTogglePin={(id) => app.togglePinWork(id)}
            onToggleSubtask={(wId, sId) => app.toggleSubtask(wId, sId)}
            onCycleDoing={(w) => app.setWorkStatus(w.id, w.status === 'doing' ? 'todo' : 'doing')}
          />
        </div>
      ) : (
        <div className="kanban-grid">
          <div className="kanban-col">
            <div className="kanban-col-head">
              <span>待办事项</span>
              <span className="tag">{kanbanCols.todo.length}</span>
            </div>
            <div className="kanban-cards">
              {kanbanCols.todo.length ? kanbanCols.todo.map((w) => renderKanbanCard(w, 'todo')) : <div className="empty">暂无待办</div>}
            </div>
          </div>
          <div className="kanban-col">
            <div className="kanban-col-head">
              <span style={{ color: 'var(--primary)' }}>推进中</span>
              <span className="tag primary">{kanbanCols.doing.length}</span>
            </div>
            <div className="kanban-cards">
              {kanbanCols.doing.length ? kanbanCols.doing.map((w) => renderKanbanCard(w, 'doing')) : <div className="empty">暂无进行中事项</div>}
            </div>
          </div>
          <div className="kanban-col">
            <div className="kanban-col-head">
              <span style={{ color: 'var(--forest)' }}>已完成（最近 20 条）</span>
              <span className="tag accent">{kanbanCols.done.length}</span>
            </div>
            <div className="kanban-cards">
              {kanbanCols.done.length ? kanbanCols.done.map((w) => renderKanbanCard(w, 'done')) : <div className="empty">暂无已完成</div>}
            </div>
          </div>
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
            setText('')
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
      <ExportExcelModal
        open={excelOpen}
        app={app}
        onClose={() => setExcelOpen(false)}
      />
    </>
  )
}
