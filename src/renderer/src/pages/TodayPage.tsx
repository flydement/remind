import { useMemo, useState } from 'react'
import {
  AlertCircle,
  Bell,
  CalendarClock,
  CheckCheck,
  ClipboardList,
  FastForward,
  HelpCircle,
  SlidersHorizontal,
  Sparkles,
  Timer,
  Trash2
} from 'lucide-react'
import type { PageId, WorkItem } from '@shared/types'
import { describeDraft, parseWorkText, WORK_SYNTAX_GUIDE } from '@shared/parser'
import { formatDateTimeCn } from '@shared/time'
import PageHead from '../components/PageHead'
import { newWorkItem, type useAppState } from '../state'
import WorkEditor from '../components/WorkEditor'
import WorkList from '../components/WorkList'

const SAMPLES = [
  '任务：整理财务月报 截止12月31日 从今天开始每天早上10点提醒我一次 #财务',
  '周五 下午3点半 架构评审 #研发 重点',
  '月报 8月11号 提前5天通知 #汇报'
]

export default function TodayPage({
  app,
  go
}: {
  app: ReturnType<typeof useAppState>
  go: (p: PageId) => void
}) {
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<WorkItem | null>(null)
  const [showAnswer, setShowAnswer] = useState(false)
  const [showSyntax, setShowSyntax] = useState(false)
  const [inboxFilter, setInboxFilter] = useState<'all' | 'work' | 'health' | 'quote'>('all')
  const draft = useMemo(() => parseWorkText(text, app.now), [text, app.now])
  const quote =
    app.state.quotes.find((q) => q.id === app.state.quoteSettings.lastQuoteId) ??
    app.state.quotes.find((q) => q.enabled)

  const upcoming = useMemo(
    () =>
      app.state.workItems
        .filter((w) => w.status !== 'done')
        .sort((a, b) => {
          if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1
          const pa = a.priority === 'high' ? 0 : 1
          const pb = b.priority === 'high' ? 0 : 1
          const da = new Date(a.dueAt).getTime()
          const db = new Date(b.dueAt).getTime()
          if (Math.abs(da - db) < 3600_000 && pa !== pb) return pa - pb
          return da - db
        })
        .slice(0, 6),
    [app.state.workItems]
  )

  const filteredInbox = useMemo(
    () =>
      app.state.inbox
        .filter((n) => inboxFilter === 'all' || n.source === inboxFilter)
        .slice(0, 10),
    [app.state.inbox, inboxFilter]
  )

  const isExisting = Boolean(editing && app.state.workItems.some((w) => w.id === editing.id))

  const quickCreate = (): void => {
    if (!text.trim()) return
    const created = newWorkItem({
      title: draft.title,
      dueAt: draft.dueAt,
      priority: draft.priority,
      assignee: draft.assignee,
      tags: draft.tags,
      notify: draft.notify,
      repeat: draft.repeat,
      notes: draft.notes,
      sourceText: draft.sourceText
    })
    app.saveWork(created)
    setText('')
  }

  const openDetailedDraft = (): void => {
    if (!text.trim()) {
      setEditing(newWorkItem({}))
      return
    }
    setEditing(
      newWorkItem({
        title: draft.title,
        dueAt: draft.dueAt,
        priority: draft.priority,
        assignee: draft.assignee,
        tags: draft.tags,
        notify: draft.notify,
        repeat: draft.repeat,
        notes: draft.notes,
        sourceText: draft.sourceText
      })
    )
  }

  return (
    <>
      <PageHead
        now={app.now}
        sub="自然语言极速录入事项，自动推算提醒节点与周期汇总。"
        right={
          app.stats.dndActive ? (
            <button className="btn ghost small" onClick={() => app.setDndMinutes(0)}>
              勿扰模式开启中 · 点击恢复提醒
            </button>
          ) : null
        }
      />

      {!window.rian && app.notifyPerm !== 'granted' ? (
        <div className="card banner-warn">
          <div>
            <b>尚未授权浏览器系统通知</b>
            <div className="muted">开启后，即使切换到其他窗口或标签页也能准时接收桌面提醒。</div>
          </div>
          <button className="btn small" onClick={() => void app.enableNotifications()}>开启系统通知</button>
        </div>
      ) : null}

      <div className="grid-4" style={{ marginBottom: 18 }}>
        <div className="card stat clickable" onClick={() => go('work')}>
          <div className="stat-top">
            <span>待处理事项{app.stats.doing > 0 ? `（进行中 ${app.stats.doing}）` : ''}</span>
            <div className="stat-icon primary"><ClipboardList size={15} /></div>
          </div>
          <b>{app.stats.open}</b>
        </div>
        <div className="card stat clickable" onClick={() => go('work')}>
          <div className="stat-top">
            <span>今日到期</span>
            <div className="stat-icon honey"><CalendarClock size={15} /></div>
          </div>
          <b>{app.stats.dueToday}</b>
        </div>
        <div className="card stat clickable" onClick={() => go('work')}>
          <div className="stat-top">
            <span>已逾期</span>
            <div className="stat-icon terra"><AlertCircle size={15} /></div>
          </div>
          <b style={app.stats.overdue > 0 ? { color: 'var(--danger)' } : undefined}>{app.stats.overdue}</b>
        </div>
        <div
          className="card stat clickable"
          onClick={() => {
            if (!app.focusTimer.active) app.startFocus(25)
          }}
          title={app.focusTimer.active ? '专注计时进行中' : '点击开启 25 分钟番茄专注'}
        >
          <div className="stat-top">
            <span>今日专注（分钟）</span>
            <div className="stat-icon forest"><Timer size={15} /></div>
          </div>
          <b style={{ color: 'var(--forest)' }}>{app.stats.todayFocusMinutes}</b>
        </div>
      </div>

      <div className="card composer-card" style={{ marginBottom: 18 }}>
        <div className="section-head" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}><Sparkles size={15} color="var(--primary)" /> 快速新建工作项</h3>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => setShowSyntax((v) => !v)}
          >
            <HelpCircle size={13} />
            {showSyntax ? '收起语法说明' : '创建语法说明'}
          </button>
        </div>
        <div className="composer">
          <div className="composer-input-wrap">
            <Sparkles size={15} className="composer-icon" />
            <input
              data-quick-composer="true"
              value={text}
              placeholder="支持长句或短词，如：任务：整理财务月报 截止2026年12月31日 从今天开始每天早上10点提醒我一次"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  openDetailedDraft()
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  quickCreate()
                }
              }}
            />
          </div>
          <button className="btn" onClick={quickCreate}>极速创建</button>
          <button className="btn ghost" onClick={openDetailedDraft} title="展开完整设置 (Ctrl+Enter)">
            <SlidersHorizontal size={14} />
            详细配置
          </button>
        </div>
        {text.trim() ? (
          <div className="parsed-preview">
            <div className="parsed-tokens">
              <span className="tag primary">识别预览</span>
              <span>{describeDraft(draft)}</span>
            </div>
            {draft.hints.length ? <span className="muted">{draft.hints.join('；')}</span> : null}
          </div>
        ) : (
          <div className="quick-samples">
            <span>快捷示例（按 N 随时聚焦输入框）：</span>
            {SAMPLES.map((s) => (
              <button key={s} className="sample-pill" onClick={() => setText(s)}>{s}</button>
            ))}
          </div>
        )}
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

      <div className="grid-2">
        <div className="card">
          <div className="section-head">
            <h3>近期重点排期</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              {app.stats.overdue > 0 ? (
                <button
                  className="btn ghost small"
                  onClick={() => app.postponeOverdue(1)}
                  title="将所有已逾期未完成事项统一顺延到明天"
                >
                  <FastForward size={13} />
                  顺延逾期 ({app.stats.overdue})
                </button>
              ) : null}
              <button className="btn ghost small" onClick={() => go('work')}>查看全部</button>
            </div>
          </div>
          <WorkList
            items={upcoming}
            now={app.now}
            empty="当前暂无待办事项。在上方输入一句话即可快速排期。"
            onToggle={(w) => app.toggleWork(w)}
            onOpen={setEditing}
            onStartFocus={(w) => app.startFocus(25, w.id)}
            onTogglePin={(id) => app.togglePinWork(id)}
            onToggleSubtask={(wId, sId) => app.toggleSubtask(wId, sId)}
            onCycleDoing={(w) => app.setWorkStatus(w.id, w.status === 'doing' ? 'todo' : 'doing')}
          />
        </div>

        <div>
          <div className="card quote-hero" style={{ marginBottom: 18 }}>
            <div className="quote-kind">
              {quote?.kind === 'joke' ? '工作间歇' : quote?.kind === 'riddle' ? '思维热身' : '每日寄语'}
            </div>
            <p className="quote-body">{quote?.content ?? '张弛有度，方能行稳致远。'}</p>
            {quote?.answer ? (
              <div style={{ marginTop: 12 }}>
                {showAnswer ? (
                  <p className="muted" style={{ margin: 0 }}>
                    答案：{quote.answer}{' '}
                    <button className="riddle-btn" onClick={() => setShowAnswer(false)}>收起</button>
                  </p>
                ) : (
                  <button className="riddle-btn" onClick={() => setShowAnswer(true)}>揭晓答案</button>
                )}
              </div>
            ) : null}
          </div>

          <div className="card">
            <div className="section-head">
              <h3><Bell size={15} color="var(--primary)" /> 消息动态中心</h3>
              {app.state.inbox.length > 0 ? (
                <div style={{ display: 'flex', gap: 4 }}>
                  {app.stats.unreadInbox > 0 ? (
                    <button className="icon-btn" title="全部标为已读" onClick={app.markAllInboxRead}>
                      <CheckCheck size={14} />
                    </button>
                  ) : null}
                  <button className="icon-btn" title="清空通知记录" onClick={app.clearInbox}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ) : null}
            </div>
            <div className="filters" style={{ marginBottom: 8 }}>
              {(
                [
                  ['all', '全部'],
                  ['work', '事项'],
                  ['health', '健康'],
                  ['quote', '文库']
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  className={`chip ${inboxFilter === k ? 'on' : ''}`}
                  onClick={() => setInboxFilter(k)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="inbox">
              {filteredInbox.length ? (
                <ul>
                  {filteredInbox.map((n) => (
                    <li
                      key={n.id}
                      style={{ cursor: n.workId ? 'pointer' : 'default' }}
                      onClick={() => {
                        if (!n.workId) return
                        const found = app.state.workItems.find((w) => w.id === n.workId)
                        if (found) setEditing(found)
                      }}
                    >
                      <span className={`inbox-dot ${n.source}`} />
                      <div>
                        <b style={{ opacity: n.read ? 0.78 : 1 }}>{n.title}</b>
                        <div className="muted">{formatDateTimeCn(n.at)} · {n.body}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty">暂无消息记录，系统将按设定计划准时推送。</div>
              )}
            </div>
          </div>
        </div>
      </div>

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
    </>
  )
}
