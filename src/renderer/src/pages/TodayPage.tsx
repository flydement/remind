import { useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Bell,
  CalendarClock,
  CheckCheck,
  ClipboardList,
  FastForward,
  RefreshCw,
  Timer,
  Trash2
} from 'lucide-react'
import type { PageId, WorkItem } from '@shared/types'
import { formatDateTimeCn, isSameDay } from '@shared/time'
import PageHead from '../components/PageHead'
import QuickComposer from '../components/QuickComposer'
import type { useAppState } from '../state'
import WorkEditor from '../components/WorkEditor'
import WorkList from '../components/WorkList'
import type { WorkFilter } from './WorkPage'

export default function TodayPage({
  app,
  go,
  goWorkWithFilter
}: {
  app: ReturnType<typeof useAppState>
  go: (p: PageId) => void
  goWorkWithFilter: (f: WorkFilter) => void
}) {
  const [editing, setEditing] = useState<WorkItem | null>(null)
  const clearComposerRef = useRef<(() => void) | null>(null)
  const [showAnswer, setShowAnswer] = useState(false)
  const [scheduleTab, setScheduleTab] = useState<'priority' | 'today' | 'doing'>('priority')
  const [inboxFilter, setInboxFilter] = useState<'all' | 'work' | 'health' | 'quote'>('all')

  const quote =
    app.state.quotes.find((q) => q.id === app.state.quoteSettings.lastQuoteId) ??
    app.state.quotes.find((q) => q.enabled)

  const upcoming = useMemo(() => {
    const open = app.state.workItems.filter((w) => w.status !== 'done')
    const scoped =
      scheduleTab === 'today'
        ? open.filter((w) => isSameDay(new Date(w.dueAt), app.now))
        : scheduleTab === 'doing'
          ? open.filter((w) => w.status === 'doing')
          : open
    return scoped
      .sort((a, b) => {
        if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1
        const pa = a.priority === 'high' ? 0 : 1
        const pb = b.priority === 'high' ? 0 : 1
        const da = new Date(a.dueAt).getTime()
        const db = new Date(b.dueAt).getTime()
        if (Math.abs(da - db) < 3600_000 && pa !== pb) return pa - pb
        return da - db
      })
      .slice(0, 7)
  }, [app.state.workItems, app.now, scheduleTab])

  const filteredInbox = useMemo(
    () =>
      app.state.inbox
        .filter((n) => inboxFilter === 'all' || n.source === inboxFilter)
        .slice(0, 8),
    [app.state.inbox, inboxFilter]
  )

  const isExisting = Boolean(editing && app.state.workItems.some((w) => w.id === editing.id))

  return (
    <>
      <PageHead
        now={app.now}
        sub="一句话自然录入事项，自动推算提醒节点与周期汇总。"
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
          <button className="btn small" onClick={() => void app.enableNotifications()}>
            开启系统通知
          </button>
        </div>
      ) : null}

      <div className="grid-4" style={{ marginBottom: 18 }}>
        <div
          className="card stat clickable"
          onClick={() => goWorkWithFilter('open')}
          title="点击查看全部未完成事项"
        >
          <div className="stat-top">
            <span>待处理事项{app.stats.doing > 0 ? `（进行中 ${app.stats.doing}）` : ''}</span>
            <div className="stat-icon primary">
              <ClipboardList size={15} />
            </div>
          </div>
          <b>{app.stats.open}</b>
        </div>
        <div
          className="card stat clickable"
          onClick={() => goWorkWithFilter('today')}
          title="点击筛选今日到期事项"
        >
          <div className="stat-top">
            <span>今日到期</span>
            <div className="stat-icon honey">
              <CalendarClock size={15} />
            </div>
          </div>
          <b>{app.stats.dueToday}</b>
        </div>
        <div
          className="card stat clickable"
          onClick={() => goWorkWithFilter('overdue')}
          title="点击筛选已逾期事项"
        >
          <div className="stat-top">
            <span>已逾期</span>
            <div className="stat-icon terra">
              <AlertCircle size={15} />
            </div>
          </div>
          <b style={app.stats.overdue > 0 ? { color: 'var(--danger)' } : undefined}>{app.stats.overdue}</b>
        </div>
        <div
          className="card stat clickable"
          onClick={() => {
            if (!app.focusTimer.active) app.startFocus()
          }}
          title={
            app.focusTimer.active
              ? '专注计时进行中'
              : `点击开启 ${app.defaultFocusMinutes} 分钟番茄专注`
          }
        >
          <div className="stat-top">
            <span>今日专注（分钟）</span>
            <div className="stat-icon forest">
              <Timer size={15} />
            </div>
          </div>
          <b style={{ color: 'var(--forest)' }}>{app.stats.todayFocusMinutes}</b>
        </div>
      </div>

      <QuickComposer
        app={app}
        onOpenDetailed={(draftItem, clearInput) => {
          clearComposerRef.current = clearInput
          setEditing(draftItem)
        }}
      />

      <div className="grid-2">
        <div className="card">
          <div className="section-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h3>近期排期</h3>
              <div className="seg-tabs">
                <button
                  type="button"
                  className={scheduleTab === 'priority' ? 'on' : ''}
                  onClick={() => setScheduleTab('priority')}
                >
                  优先 ({app.stats.open})
                </button>
                <button
                  type="button"
                  className={scheduleTab === 'today' ? 'on' : ''}
                  onClick={() => setScheduleTab('today')}
                >
                  今日 ({app.stats.dueToday})
                </button>
                <button
                  type="button"
                  className={scheduleTab === 'doing' ? 'on' : ''}
                  onClick={() => setScheduleTab('doing')}
                >
                  推进中 ({app.stats.doing})
                </button>
              </div>
            </div>
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
              <button className="btn ghost small" onClick={() => go('work')}>
                全部事项
              </button>
            </div>
          </div>
          <WorkList
            items={upcoming}
            now={app.now}
            empty={
              scheduleTab === 'today'
                ? '今天没有到期事项，保持从容节奏。'
                : scheduleTab === 'doing'
                  ? '暂无标记为「进行中」的事项，点击事项右侧「推进」即可开始。'
                  : '当前暂无待办事项。在上方输入一句话即可快速排期。'
            }
            onToggle={(w) => app.toggleWork(w)}
            onOpen={setEditing}
            onStartFocus={(w) => app.startFocus(undefined, w.id)}
            onTogglePin={(id) => app.togglePinWork(id)}
            onToggleSubtask={(wId, sId) => app.toggleSubtask(wId, sId)}
            onCycleDoing={(w) => app.setWorkStatus(w.id, w.status === 'doing' ? 'todo' : 'doing')}
            onPostponeOneDay={(w) => app.postponeWorkItem(w.id, 1)}
          />
        </div>

        <div>
          <div className="card quote-hero" style={{ marginBottom: 18 }}>
            <div className="section-head" style={{ marginBottom: 4 }}>
              <div className="quote-kind">
                {quote?.kind === 'joke' ? '工作间歇' : quote?.kind === 'riddle' ? '思维热身' : '每日寄语'}
              </div>
              <button
                type="button"
                className="icon-btn"
                title="换一句"
                onClick={() => {
                  setShowAnswer(false)
                  app.shuffleQuote()
                }}
              >
                <RefreshCw size={13} />
              </button>
            </div>
            <p className="quote-body">{quote?.content ?? '张弛有度，方能行稳致远。'}</p>
            {quote?.answer ? (
              <div style={{ marginTop: 12 }}>
                {showAnswer ? (
                  <p className="muted" style={{ margin: 0 }}>
                    答案：{quote.answer}{' '}
                    <button className="riddle-btn" onClick={() => setShowAnswer(false)}>
                      收起
                    </button>
                  </p>
                ) : (
                  <button className="riddle-btn" onClick={() => setShowAnswer(true)}>
                    揭晓答案
                  </button>
                )}
              </div>
            ) : null}
          </div>

          <div className="card">
            <div className="section-head">
              <h3>
                <Bell size={15} color="var(--primary)" /> 消息动态
              </h3>
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
                      className={n.read ? '' : 'unread'}
                      style={{ cursor: n.workId || !n.read ? 'pointer' : 'default' }}
                      onClick={() => {
                        if (!n.read) app.markInboxRead(n.id)
                        if (!n.workId) return
                        const found = app.state.workItems.find((w) => w.id === n.workId)
                        if (found) setEditing(found)
                      }}
                    >
                      <span className={`inbox-dot ${n.source}`} />
                      <div>
                        <b style={{ opacity: n.read ? 0.78 : 1 }}>{n.title}</b>
                        <div className="muted">
                          {formatDateTimeCn(n.at)} · {n.body}
                        </div>
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
    </>
  )
}
