import { useEffect, useState } from 'react'
import {
  Bell,
  BellOff,
  BookOpenText,
  Calendar,
  ClipboardList,
  HeartPulse,
  LayoutDashboard,
  Moon,
  Palette,
  Pause,
  Play,
  Search,
  Settings as SettingsIcon,
  Square,
  Sun,
  Timer,
  X
} from 'lucide-react'
import type { PageId, ThemeMode, WorkItem } from '@shared/types'
import { pad2, weekdayCn } from '@shared/time'
import { useAppState } from './state'
import logoSvg from './assets/logo.svg'
import CommandPalette from './components/CommandPalette'
import ExportExcelModal from './components/ExportExcelModal'
import WorkEditor from './components/WorkEditor'
import TodayPage from './pages/TodayPage'
import WorkPage from './pages/WorkPage'
import ReportsPage from './pages/ReportsPage'
import QuotesPage from './pages/QuotesPage'
import HealthPage from './pages/HealthPage'
import SettingsPage from './pages/SettingsPage'

const NAV: { id: PageId; label: string; shortLabel: string; icon: typeof LayoutDashboard }[] = [
  { id: 'today', label: '今日概览', shortLabel: '今日', icon: LayoutDashboard },
  { id: 'work', label: '工作事项', shortLabel: '事项', icon: ClipboardList },
  { id: 'reports', label: '周报月报', shortLabel: '报告', icon: BookOpenText },
  { id: 'quotes', label: '语言文库', shortLabel: '文库', icon: Bell },
  { id: 'health', label: '健康节律', shortLabel: '健康', icon: HeartPulse },
  { id: 'settings', label: '系统设置', shortLabel: '设置', icon: SettingsIcon }
]

const THEME_ORDER: ThemeMode[] = ['slate', 'paper', 'dark']
const THEME_NAME: Record<ThemeMode, string> = {
  slate: '严谨商务',
  paper: '温润纸感',
  dark: '深色专注'
}

export default function App() {
  const app = useAppState()
  const [page, setPage] = useState<PageId>('today')
  const [cmdOpen, setCmdOpen] = useState(false)
  const [globalEditing, setGlobalEditing] = useState<WorkItem | null>(null)
  const [globalExcelOpen, setGlobalExcelOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdOpen((v) => !v)
        return
      }
      if (e.altKey && e.key >= '1' && e.key <= '6') {
        const target = NAV[Number(e.key) - 1]
        if (target) {
          e.preventDefault()
          setPage(target.id)
        }
        return
      }
      if (e.key === 'Escape' && app.reminder) {
        app.dismissReminder()
        return
      }
      const tag = (e.target as HTMLElement | null)?.tagName
      const editable =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (e.target as HTMLElement | null)?.isContentEditable
      if (!editable && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'n' && !cmdOpen && !globalEditing) {
        const input = document.querySelector<HTMLInputElement>('[data-quick-composer="true"]')
        if (input) {
          e.preventDefault()
          input.focus()
        } else {
          e.preventDefault()
          setPage('work')
          window.setTimeout(() => {
            document.querySelector<HTMLInputElement>('[data-quick-composer="true"]')?.focus()
          }, 40)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [app.reminder, app.dismissReminder, cmdOpen, globalEditing])

  const totalTasks = app.stats.open + app.stats.done
  const progressPct = totalTasks > 0 ? Math.round((app.stats.done / totalTasks) * 100) : 0

  const focusWork = app.focusTimer.workId
    ? app.state.workItems.find((w) => w.id === app.focusTimer.workId)
    : undefined
  const focusMin = Math.floor(app.focusTimer.remainingSeconds / 60)
  const focusSec = app.focusTimer.remainingSeconds % 60
  const focusPct =
    app.focusTimer.totalSeconds > 0
      ? Math.round(((app.focusTimer.totalSeconds - app.focusTimer.remainingSeconds) / app.focusTimer.totalSeconds) * 100)
      : 0

  const cycleTheme = (): void => {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(app.theme) + 1) % THEME_ORDER.length]
    app.setTheme(next)
  }

  const ThemeIcon = app.theme === 'dark' ? Moon : app.theme === 'paper' ? Palette : Sun

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-mark" src={logoSvg} alt="小猫工作助手" />
          <div className="brand-text">
            <h1>小猫工作助手</h1>
            <p>日程追踪与效率中枢</p>
          </div>
        </div>

        <button className="cmd-trigger" onClick={() => setCmdOpen(true)} title="打开快捷命令面板 (Ctrl+K)">
          <Search size={14} />
          <span>搜索或执行命令...</span>
          <kbd className="kbd">Ctrl K</kbd>
        </button>

        <nav className="nav">
          {NAV.map((item) => {
            const Icon = item.icon
            const showWorkBadge = item.id === 'work' && app.stats.open > 0
            const showInboxBadge = item.id === 'today' && app.stats.unreadInbox > 0
            return (
              <button
                key={item.id}
                className={page === item.id ? 'active' : ''}
                onClick={() => setPage(item.id)}
              >
                <Icon size={16} />
                <span className="label">{item.label}</span>
                {showWorkBadge ? (
                  <span className={`nav-badge ${app.stats.overdue > 0 ? 'warn' : ''}`}>
                    {app.stats.open}
                  </span>
                ) : showInboxBadge ? (
                  <span className="nav-badge accent">{app.stats.unreadInbox}</span>
                ) : null}
              </button>
            )
          })}
        </nav>

        <div className={`focus-widget ${app.focusTimer.active ? 'running' : ''}`}>
          {app.focusTimer.active ? (
            <>
              <div className="focus-widget-top">
                <span className="focus-mode-tag">
                  <Timer size={12} />
                  {app.focusTimer.mode === 'focus' ? '专注中' : '休息中'}
                </span>
                <span className="focus-clock">{pad2(focusMin)}:{pad2(focusSec)}</span>
              </div>
              {focusWork ? <div className="focus-task-name" title={focusWork.title}>{focusWork.title}</div> : null}
              <div className="sidebar-progress" style={{ margin: '7px 0' }}>
                <div className="sidebar-progress-bar accent" style={{ width: `${focusPct}%` }} />
              </div>
              <div className="focus-actions">
                <button className="mini-btn" onClick={app.pauseResumeFocus}>
                  {app.focusTimer.paused ? <Play size={12} /> : <Pause size={12} />}
                  {app.focusTimer.paused ? '继续' : '暂停'}
                </button>
                <button className="mini-btn ghost" onClick={app.stopFocus}>
                  <Square size={11} />
                  结束
                </button>
              </div>
            </>
          ) : (
            <div className="focus-idle-row">
              <div>
                <div className="focus-idle-title">番茄专注</div>
                <div className="focus-idle-sub">今日 {app.stats.todayFocusMinutes} 分钟</div>
              </div>
              <button className="mini-btn" onClick={() => app.startFocus(25)} title="开启 25 分钟专注">
                <Play size={12} />
                25m
              </button>
            </div>
          )}
        </div>

        <div className="sidebar-foot">
          <div className="sidebar-date">
            <span>{app.now.getMonth() + 1}月{app.now.getDate()}日 周{weekdayCn(app.now)}</span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <button
                className={`foot-icon-btn ${app.stats.dndActive ? 'active-warn' : ''}`}
                onClick={() => app.setDndMinutes(app.stats.dndActive ? 0 : 60)}
                title={app.stats.dndActive ? '勿扰开启中（点击恢复提醒）' : '开启 60 分钟勿扰'}
              >
                {app.stats.dndActive ? <BellOff size={13} /> : <Calendar size={13} />}
              </button>
              <button
                className="foot-icon-btn"
                onClick={cycleTheme}
                title={`当前主题：${THEME_NAME[app.theme]}（点击切换）`}
              >
                <ThemeIcon size={13} />
              </button>
            </div>
          </div>
          <div className="sidebar-progress">
            <div className="sidebar-progress-bar" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="sidebar-summary">
            <span>待处理 {app.stats.open} 项</span>
            <span>
              {app.stats.overdue > 0 ? (
                <em className="text-danger">逾期 {app.stats.overdue}</em>
              ) : totalTasks > 0 ? (
                `完成率 ${progressPct}%`
              ) : (
                THEME_NAME[app.theme]
              )}
            </span>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="page-wrap" key={page}>
          {page === 'today' && <TodayPage app={app} go={setPage} />}
          {page === 'work' && <WorkPage app={app} />}
          {page === 'reports' && <ReportsPage app={app} />}
          {page === 'quotes' && <QuotesPage app={app} />}
          {page === 'health' && <HealthPage app={app} />}
          {page === 'settings' && <SettingsPage app={app} />}
        </div>
      </main>

      <nav className="mobile-nav">
        {NAV.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              className={page === item.id ? 'active' : ''}
              onClick={() => setPage(item.id)}
            >
              <Icon size={17} />
              <span>{item.shortLabel}</span>
            </button>
          )
        })}
      </nav>

      {app.flash ? (
        <div className="toast" role="status">
          <div className="toast-main" onClick={() => app.setFlash(null)}>
            <div className="toast-kicker">
              {app.flash.source === 'work'
                ? '事项通知'
                : app.flash.source === 'health'
                  ? '健康提醒'
                  : app.flash.source === 'quote'
                    ? '每日文库'
                    : '系统消息'}
            </div>
            <b>{app.flash.title}</b>
            <p>{app.flash.body}</p>
          </div>
          <div className="toast-actions">
            {app.flash.actionLabel && app.flash.onAction ? (
              <button
                className="toast-action-btn"
                onClick={() => {
                  app.flash?.onAction?.()
                }}
              >
                {app.flash.actionLabel}
              </button>
            ) : null}
            <button className="toast-close" onClick={() => app.setFlash(null)} title="关闭">
              <X size={14} />
            </button>
          </div>
        </div>
      ) : null}

      {app.reminder ? (
        <div className="overlay">
          <div className="card sheet reminder-modal">
            <div className="quote-kind">工作事项到期提醒</div>
            <h2 style={{ margin: '8px 0 6px' }}>{app.reminder.title}</h2>
            <p style={{ margin: 0 }}>{app.reminder.body}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {app.reminder.workId ? (
                <>
                  <button
                    className="btn ghost small"
                    onClick={() => app.snoozeReminder(app.reminder!.workId!, 10)}
                  >
                    延后 10 分钟
                  </button>
                  <button
                    className="btn ghost small"
                    onClick={() => app.snoozeReminder(app.reminder!.workId!, 60)}
                  >
                    延后 1 小时
                  </button>
                  <button
                    className="btn forest small"
                    onClick={() => app.completeReminder(app.reminder!.workId!)}
                  >
                    标记完成
                  </button>
                </>
              ) : null}
              <button className="btn small" onClick={() => app.dismissReminder()}>确认知晓</button>
            </div>
          </div>
        </div>
      ) : null}

      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        app={app}
        go={setPage}
        onEditWork={(w) => setGlobalEditing(w)}
        onOpenExcel={() => setGlobalExcelOpen(true)}
      />

      <ExportExcelModal
        open={globalExcelOpen}
        app={app}
        onClose={() => setGlobalExcelOpen(false)}
      />

      {globalEditing ? (
        <WorkEditor
          item={globalEditing}
          app={app}
          onClose={() => setGlobalEditing(null)}
          onSave={(item) => {
            app.saveWork(item)
            setGlobalEditing(null)
          }}
          onDelete={(item) => {
            app.deleteWork(item.id)
            setGlobalEditing(null)
          }}
        />
      ) : null}
    </div>
  )
}
