import { useMemo, useState } from 'react'
import { Search, Sparkles, X } from 'lucide-react'
import type { WorkItem } from '@shared/types'
import { parseWorkText, describeDraft } from '@shared/parser'
import { isPastDue, isSameDay } from '@shared/time'
import PageHead from '../components/PageHead'
import { newWorkItem, type useAppState } from '../state'
import WorkEditor from '../components/WorkEditor'
import WorkList from '../components/WorkList'

type Filter = 'open' | 'today' | 'overdue' | 'done' | 'all'

export default function WorkPage({ app }: { app: ReturnType<typeof useAppState> }) {
  const [filter, setFilter] = useState<Filter>('open')
  const [query, setQuery] = useState('')
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<WorkItem | null>(null)
  const draft = useMemo(() => parseWorkText(text, app.now), [text, app.now])

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = app.state.workItems.filter((w) => {
      if (filter === 'done' && w.status !== 'done') return false
      if (filter === 'open' && w.status === 'done') return false
      if (filter === 'today' && (w.status === 'done' || !isSameDay(new Date(w.dueAt), app.now))) return false
      if (filter === 'overdue' && (w.status === 'done' || !isPastDue(w.dueAt, app.now))) return false
      if (!q) return true
      return (
        w.title.toLowerCase().includes(q) ||
        w.notes.toLowerCase().includes(q) ||
        w.tags.some((t) => t.toLowerCase().includes(q))
      )
    })

    return [...filtered].sort((a, b) => {
      if (filter === 'done') {
        const tb = b.completedAt ? new Date(b.completedAt).getTime() : 0
        const ta = a.completedAt ? new Date(a.completedAt).getTime() : 0
        return tb - ta
      }
      if (a.status !== b.status) return a.status === 'done' ? 1 : -1
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
    })
  }, [app.state.workItems, filter, query, app.now])

  const isExisting = Boolean(editing && app.state.workItems.some((w) => w.id === editing.id))

  const openDraft = (): void => {
    if (!text.trim()) return
    setEditing(newWorkItem({
      title: draft.title,
      dueAt: draft.dueAt,
      notify: draft.notify,
      repeat: draft.repeat,
      sourceText: draft.sourceText
    }))
  }

  return (
    <>
      <PageHead title="工作项" sub="一句话创建。可再设置几点提醒、提前提几天、以及提醒频次。" />
      <div className="card composer-card" style={{ marginBottom: 18 }}>
        <div className="composer">
          <div className="composer-input-wrap">
            <Sparkles size={15} className="composer-icon" />
            <input
              value={text}
              placeholder='月报 8月11号 提前5天通知'
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && openDraft()}
            />
          </div>
          <button className="btn" onClick={openDraft}>新建工作项</button>
        </div>
        {text.trim() ? (
          <div className="hints">{describeDraft(draft)}{draft.hints.length ? `。${draft.hints.join('；')}` : ''}</div>
        ) : (
          <p className="muted" style={{ margin: '10px 0 0' }}>
            支持：明天交方案 9点、下周三 下午3点半评审、周报 每周五 17:00、每月11号写月报 提前5天 每天提醒、月底对账
          </p>
        )}
      </div>

      <div className="work-toolbar">
        <div className="filters" style={{ marginBottom: 0 }}>
          {([
            ['open', '未完成'],
            ['today', '今日到期'],
            ['overdue', app.stats.overdue > 0 ? `已逾期 (${app.stats.overdue})` : '已逾期'],
            ['done', '已完成'],
            ['all', '全部']
          ] as const).map(([id, label]) => (
            <button key={id} className={`chip ${filter === id ? 'on' : ''}`} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
        <div className="search-wrap">
          <Search size={14} className="search-icon" />
          <input
            className="search-bar"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索工作项或备注..."
          />
          {query ? (
            <button className="search-clear" onClick={() => setQuery('')} title="清空搜索">
              <X size={13} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="card">
        <WorkList
          items={items}
          now={app.now}
          empty={query.trim() ? '没有匹配搜索条件的工作项。' : '没有符合筛选的工作项。'}
          onToggle={(w) => app.toggleWork(w)}
          onOpen={setEditing}
          onDelete={(w) => app.deleteWork(w.id)}
        />
      </div>

      {editing ? (
        <WorkEditor
          item={editing}
          onClose={() => setEditing(null)}
          onSave={(item) => { app.saveWork(item); setEditing(null); setText('') }}
          onDelete={isExisting ? (item) => { app.deleteWork(item.id); setEditing(null) } : undefined}
        />
      ) : null}
    </>
  )
}
