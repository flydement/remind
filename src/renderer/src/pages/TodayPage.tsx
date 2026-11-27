import { useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Bell,
  CalendarClock,
  Check,
  CheckCheck,
  CheckCircle2,
  ClipboardList,
  Copy,
  FastForward,
  HeartPulse,
  RefreshCw,
  Timer,
  Trash2,
  X
} from 'lucide-react'
import type { HealthReminder, PageId, WorkItem } from '@shared/types'
import { createId } from '@shared/ids'
import { formatDateTimeCn, inWorkHours, isSameDay, nowIso } from '@shared/time'
import pinkCatBanner from '../assets/pink-cat-banner.svg'
import PageHead from '../components/PageHead'
import QuickComposer from '../components/QuickComposer'
import type { useAppState } from '../state'
import WorkEditor from '../components/WorkEditor'
import WorkList from '../components/WorkList'
import type { WorkFilter } from './WorkPage'

async function copyQuoteText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fallback below
  }
  try {
    const el = document.createElement('textarea')
    el.value = text
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    return ok
  } catch {
    return false
  }
}

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
  const [copiedQuote, setCopiedQuote] = useState(false)
  const [scheduleTab, setScheduleTab] = useState<'priority' | 'today' | 'doing'>('priority')
  const [inboxFilter, setInboxFilter] = useState<'all' | 'work' | 'health' | 'quote'>('all')
  const [notifyBannerHidden, setNotifyBannerHidden] = useState(() => {
    try {
      return sessionStorage.getItem('rian-hide-notify-banner') === '1'
    } catch {
      return false
    }
  })

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

  const nextHealth = useMemo(() => {
    const enabled = app.state.health.filter((h) => h.enabled)
    if (!enabled.length) return null
    const scored = enabled.map((h) => {
      const inWin = !h.workHoursOnly || inWorkHours(app.now, h.workStart, h.workEnd)
      const elapsedMin = h.lastFiredAt
        ? Math.max(0, (app.now.getTime() - new Date(h.lastFiredAt).getTime()) / 60_000)
        : 0
      const remainMin = Math.max(1, Math.ceil(h.intervalMinutes - elapsedMin))
      return { item: h, inWin, remainMin }
    })
    scored.sort((a, b) => {
      if (a.inWin !== b.inWin) return a.inWin ? -1 : 1
      return a.remainMin - b.remainMin
    })
    return scored[0]
  }, [app.state.health, app.now])

  const quickCheckInHealth = (h: HealthReminder): void => {
    const at = nowIso()
    app.patch((s) => ({
      ...s,
      health: s.health.map((x) => (x.id === h.id ? { ...x, lastFiredAt: at } : x))
    }))
    app.setFlash({
      id: createId('fl'),
      title: `${h.emoji} 已打卡：${h.title}`,
      body: `计时器已重置，将在 ${h.intervalMinutes} 分钟后再次提醒。`,
      source: 'health'
    })
  }

  const handleCopyQuote = async (): Promise<void> => {
    if (!quote) return
    const payload = quote.answer ? `${quote.content}\n答案：${quote.answer}` : quote.content
    if (await copyQuoteText(payload)) {
      setCopiedQuote(true)
      window.setTimeout(() => setCopiedQuote(false), 1800)
    }
  }

  const isExisting = Boolean(editing && app.state.workItems.some((w) => w.id === editing.id))
  const activeHealthCount = app.state.health.filter((h) => h.enabled).length

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

      {app.theme === 'pinkcat' ? (
        <div className="card pinkcat-hero-card">
          <div className="pinkcat-hero-copy">
            <span className="pinkcat-kicker">粉萌喵喵工作台</span>
            <h3>小猫已就位，陪你甜甜顺顺安排今天～</h3>
            <p className="muted" style={{ margin: 0, lineHeight: 1.55 }}>
              {app.stats.dueToday > 0
                ? `今日有 ${app.stats.dueToday} 项到期事项，还有 ${activeHealthCount} 项健康节律守护你喝水与放松。`
                : `当前有 ${app.stats.open} 项待办事项与 ${activeHealthCount} 项健康节律运行中，按自己的节奏慢慢推进吧。`}
            </p>
            <div className="pinkcat-hero-actions">
              <button className="btn small" onClick={() => go('health')}>
                查看健康节律
              </button>
              <button className="btn ghost small" onClick={() => go('quotes')}>
                抽一条今日喵语
              </button>
            </div>
          </div>
          <img
            className="pinkcat-hero-art"
            src={pinkCatBanner}
            alt="粉萌卡通小猫在粉色书桌前陪伴办公的插画"
          />
        </div>
      ) : null}

      {!window.rian && app.notifyPerm !== 'granted' && !notifyBannerHidden ? (
        <div className="banner-soft">
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            <Bell size={14} color="var(--primary)" style={{ flexShrink: 0 }} />
            <span className="muted" style={{ color: 'var(--ink-soft)' }}>
              <b style={{ color: 'var(--ink)', fontWeight: 600 }}>开启浏览器系统通知</b>，切换标签页也能准时收到事项与健康提醒
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button className="btn ghost small" onClick={() => void app.enableNotifications()}>
              立即开启
            </button>
            <button
              type="button"
              className="icon-btn"
              title="本次会话暂不提示"
              onClick={() => {
                setNotifyBannerHidden(true)
                try {
                  sessionStorage.setItem('rian-hide-notify-banner', '1')
                } catch {
                  // ignore storage errors
                }
              }}
            >
              <X size={13} />
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid-4" style={{ marginBottom: 18 }}>
        <div
          className="card stat clickable"
          onClick={() => goWorkWithFilter('open')}
          title="点击查看全部未完成事项"
        >
          <div className="stat-top">
            <span>{app.stats.doing > 0 ? `待处理 · 进行中 ${app.stats.doing}` : '待处理事项'}</span>
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
            if (app.focusTimer.active) app.pauseResumeFocus()
            else app.startFocus()
          }}
          title={
            app.focusTimer.active
              ? app.focusTimer.paused
                ? '点击继续番茄专注'
                : '点击暂停番茄专注'
              : `点击开启 ${app.defaultFocusMinutes} 分钟番茄专注`
          }
        >
          <div className="stat-top">
            <span>
              今日专注（分钟）
              {app.focusTimer.active ? (app.focusTimer.paused ? ' · 已暂停' : ' · 计时中') : ''}
            </span>
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
            emptyAction={
              app.state.workItems.length === 0
                ? { label: '导入 3 条体验示例', onClick: app.loadDemoWork }
                : undefined
            }
            onToggle={(w) => app.toggleWork(w)}
            onOpen={setEditing}
            onDelete={(w) => app.deleteWork(w.id)}
            onStartFocus={(w) => app.startFocus(undefined, w.id)}
            onTogglePin={(id) => app.togglePinWork(id)}
            onToggleSubtask={(wId, sId) => app.toggleSubtask(wId, sId)}
            onAddSubtask={(wId, title) => app.addSubtask(wId, title)}
            onCycleDoing={(w) => app.setWorkStatus(w.id, w.status === 'doing' ? 'todo' : 'doing')}
            onPostponeOneDay={(w) => app.postponeWorkItem(w.id, 1)}
          />
        </div>

        <div className="today-side-col">
          <div className="card quote-hero">
            <div className="section-head" style={{ marginBottom: 4 }}>
              <div className="quote-kind">
                {quote?.kind === 'joke' ? '工作间歇' : quote?.kind === 'riddle' ? '思维热身' : '每日寄语'}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  className="icon-btn"
                  title="复制这一句"
                  onClick={() => void handleCopyQuote()}
                >
                  {copiedQuote ? <Check size={13} color="var(--forest)" /> : <Copy size={13} />}
                </button>
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
            </div>
            <p className="quote-body">{quote?.content ?? '张弛有度，方能行稳致远。'}</p>
            {quote?.answer ? (
              <div style={{ marginTop: 10 }}>
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

          <div className="card health-peek-card">
            <div className="section-head" style={{ marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>
                <HeartPulse size={15} color="var(--forest)" /> 健康节律护航
              </h3>
              <button type="button" className="btn ghost small" onClick={() => go('health')}>
                管理 ({activeHealthCount}/{app.state.health.length})
              </button>
            </div>
            {nextHealth ? (
              <div className="health-peek-row">
                <div className="emoji-badge health-peek-emoji">{nextHealth.item.emoji}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{nextHealth.item.title}</div>
                  <div className="muted" style={{ marginTop: 2 }}>
                    {nextHealth.inWin
                      ? `约 ${nextHealth.remainMin} 分钟后提醒 · 每 ${nextHealth.item.intervalMinutes}m`
                      : `工作时段 ${nextHealth.item.workStart}–${nextHealth.item.workEnd} 自动守护`}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn ghost small"
                  title="完成本次休息并重置计时"
                  onClick={() => quickCheckInHealth(nextHealth.item)}
                >
                  <CheckCircle2 size={13} />
                  打卡
                </button>
              </div>
            ) : (
              <div className="muted">暂未启用健康节律，点击右上角「管理」可一键开启。</div>
            )}
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
            {app.state.inbox.length > 0 ? (
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
            ) : null}
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
                <div className="empty" style={{ padding: '18px 8px' }}>
                  暂无消息记录，系统将按设定计划准时推送。
                </div>
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
