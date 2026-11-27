import { useEffect, useRef, useState } from 'react'
import {
  Bell,
  BellOff,
  BookOpenText,
  Calendar,
  Cat,
  Check,
  ClipboardList,
  Eye,
  Heart,
  HeartPulse,
  LayoutDashboard,
  Minimize2,
  Moon,
  Palette,
  Pause,
  Play,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Square,
  Sun,
  Timer,
  X
} from 'lucide-react'
import { THEME_OPTIONS, type PageId, type ThemeMode, type WorkItem } from '@shared/types'
import { pad2, weekdayCn } from '@shared/time'
import { useAppState } from './state'
import { setBaseTitle } from './notify'
import logoSvg from './assets/logo.svg'
import pinkCatAvatar from './assets/pink-cat-avatar.svg'
import pinkCatPeeker from './assets/pink-cat-peeker.svg'
import pinkCatCorner from './assets/pink-cat-corner.svg'
import CommandPalette from './components/CommandPalette'
import ExportExcelModal from './components/ExportExcelModal'
import WorkEditor from './components/WorkEditor'
import TodayPage from './pages/TodayPage'
import WorkPage, { type WorkFilter } from './pages/WorkPage'
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

const THEME_NAME: Record<ThemeMode, string> = Object.fromEntries(
  THEME_OPTIONS.map((t) => [t.id, t.name])
) as Record<ThemeMode, string>

const THEME_ICON: Record<ThemeMode, typeof Sun> = {
  slate: Sun,
  eyecare: Eye,
  minimal: Minimize2,
  cute: Heart,
  pinkcat: Cat,
  cartoon: Sparkles,
  paper: Palette,
  dark: Moon
}

export default function App() {
  const app = useAppState()
  const [page, setPage] = useState<PageId>('today')
  const [workFilter, setWorkFilter] = useState<WorkFilter | null>(null)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const [mobileThemeOpen, setMobileThemeOpen] = useState(false)
  const [globalEditing, setGlobalEditing] = useState<WorkItem | null>(null)
  const [globalExcelOpen, setGlobalExcelOpen] = useState(false)
  const themePopRef = useRef<HTMLDivElement | null>(null)
  const mobileThemeRef = useRef<HTMLDivElement | null>(null)
  const mainRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [page])

  useEffect(() => {
    if (!themeMenuOpen && !mobileThemeOpen) return
    const onDocClick = (e: MouseEvent): void => {
      if (themeMenuOpen && themePopRef.current && !themePopRef.current.contains(e.target as Node)) {
        setThemeMenuOpen(false)
      }
      if (mobileThemeOpen && mobileThemeRef.current && !mobileThemeRef.current.contains(e.target as Node)) {
        setMobileThemeOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [themeMenuOpen, mobileThemeOpen])

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
      if (e.key === 'Escape') {
        if (themeMenuOpen || mobileThemeOpen) {
          setThemeMenuOpen(false)
          setMobileThemeOpen(false)
          return
        }
        if (app.reminder) {
          app.dismissReminder()
          return
        }
      }
      const tag = (e.target as HTMLElement | null)?.tagName
      const editable =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (e.target as HTMLElement | null)?.isContentEditable
      if (
        !editable &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        e.key.toLowerCase() === 'n' &&
        !cmdOpen &&
        !globalEditing
      ) {
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
  }, [app.reminder, app.dismissReminder, cmdOpen, globalEditing, themeMenuOpen, mobileThemeOpen])

  const goWorkWithFilter = (f: WorkFilter): void => {
    setWorkFilter(f)
    setPage('work')
  }

  const totalTasks = app.stats.open + app.stats.done
  const progressPct = totalTasks > 0 ? Math.round((app.stats.done / totalTasks) * 100) : 0

  const focusWork = app.focusTimer.workId
    ? app.state.workItems.find((w) => w.id === app.focusTimer.workId)
    : undefined
  const focusMin = Math.floor(app.focusTimer.remainingSeconds / 60)
  const focusSec = app.focusTimer.remainingSeconds % 60
  const focusPct =
    app.focusTimer.totalSeconds > 0
      ? Math.round(
          ((app.focusTimer.totalSeconds - app.focusTimer.remainingSeconds) / app.focusTimer.totalSeconds) * 100
        )
      : 0

  useEffect(() => {
    if (app.focusTimer.active) {
      const clock = `${pad2(focusMin)}:${pad2(focusSec)}`
      const prefix = app.focusTimer.paused ? '⏸' : app.focusTimer.mode === 'focus' ? '⏱' : '☕'
      const stateText = app.focusTimer.paused ? '已暂停' : app.focusTimer.mode === 'focus' ? '专注中' : '休息中'
      setBaseTitle(`${prefix} ${clock} ${stateText} · 小猫工作助手`)
    } else if (app.stats.unreadInbox > 0) {
      setBaseTitle(`(${app.stats.unreadInbox}) 小猫工作助手 · 任务与效率中枢`)
    } else {
      setBaseTitle('小猫工作助手 · 任务与效率中枢')
    }
  }, [app.focusTimer.active, app.focusTimer.paused, app.focusTimer.mode, focusMin, focusSec, app.stats.unreadInbox])

  const focusPresets = Array.from(new Set([15, app.defaultFocusMinutes, 45])).sort((a, b) => a - b)
  const ThemeIcon = THEME_ICON[app.theme] ?? Sun
  const isPinkCat = app.theme === 'pinkcat'
  const activeLogo = isPinkCat ? pinkCatAvatar : logoSvg
  const pinkCatMood = app.focusTimer.active
    ? app.focusTimer.mode === 'focus'
      ? '专注中，喵喵陪你冲刺~'
      : '休息时间，伸个懒腰喵~'
    : app.stats.overdue > 0
      ? `有 ${app.stats.overdue} 项逾期，先搞定一件喵~`
      : app.stats.open === 0 && totalTasks > 0
        ? '任务全清空，奖励小鱼干！'
        : '今天也要元气满满喵~'

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img className={`brand-mark ${isPinkCat ? 'pinkcat-brand-mark' : ''}`} src={activeLogo} alt="小猫工作助手" />
          <div className="brand-text">
            <h1>小猫工作助手</h1>
            <p>{isPinkCat ? '粉萌喵喵 · 治愈陪伴中' : '日程追踪与效率中枢'}</p>
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
                onClick={() => {
                  if (item.id === 'work') setWorkFilter(null)
                  setPage(item.id)
                }}
              >
                <Icon size={16} />
                <span className="label">{item.label}</span>
                {showWorkBadge ? (
                  <span className={`nav-badge ${app.stats.overdue > 0 ? 'warn' : ''}`}>{app.stats.open}</span>
                ) : showInboxBadge ? (
                  <span className="nav-badge accent">{app.stats.unreadInbox}</span>
                ) : null}
              </button>
            )
          })}
        </nav>

        <div className={isPinkCat ? 'focus-shell pinkcat-focus-shell' : 'focus-shell'}>
          {isPinkCat ? (
            <div className="pinkcat-peeker-wrap" aria-hidden="true">
              <span className="pinkcat-speech">{pinkCatMood}</span>
              <img className="pinkcat-peeker-img" src={pinkCatPeeker} alt="" />
            </div>
          ) : null}
          <div className={`focus-widget ${app.focusTimer.active ? 'running' : ''}`}>
            {app.focusTimer.active ? (
              <>
                <div className="focus-widget-top">
                  <span className="focus-mode-tag">
                    <Timer size={12} />
                    {app.focusTimer.mode === 'focus' ? '专注中' : '休息中'}
                  </span>
                  <span className="focus-clock">
                    {pad2(focusMin)}:{pad2(focusSec)}
                  </span>
                </div>
                {focusWork ? (
                  <button
                    type="button"
                    className="focus-task-name focus-task-link"
                    title={`点击查看或编辑：${focusWork.title}`}
                    onClick={() => setGlobalEditing(focusWork)}
                  >
                    {focusWork.title}
                  </button>
                ) : null}
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
              <div>
                <div className="focus-idle-row">
                  <div>
                    <div className="focus-idle-title">番茄专注</div>
                    <div className="focus-idle-sub">今日 {app.stats.todayFocusMinutes} 分钟</div>
                  </div>
                  <button
                    className="mini-btn"
                    onClick={() => app.startFocus(app.defaultFocusMinutes)}
                    title={`开启 ${app.defaultFocusMinutes} 分钟专注`}
                  >
                    <Play size={12} />
                    开始
                  </button>
                </div>
                <div className="focus-presets">
                  {focusPresets.map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      className={`focus-preset-btn ${mins === app.defaultFocusMinutes ? 'default' : ''}`}
                      onClick={() => app.startFocus(mins)}
                      title={`立即开启 ${mins} 分钟专注`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="sidebar-foot" ref={themePopRef} style={{ position: 'relative' }}>
          {themeMenuOpen ? (
            <div className="theme-popover" role="menu">
              <div className="theme-popover-title">快速切换外观</div>
              {THEME_OPTIONS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`theme-pop-item ${app.theme === t.id ? 'active' : ''}`}
                  onClick={() => {
                    app.setTheme(t.id)
                    setThemeMenuOpen(false)
                  }}
                >
                  <i style={{ background: t.colors[2] }} />
                  <span>{t.name}</span>
                  <em>{t.badge}</em>
                  {app.theme === t.id ? <Check size={12} color="var(--primary)" /> : null}
                </button>
              ))}
            </div>
          ) : null}

          <div className="sidebar-date">
            <span>
              {app.now.getMonth() + 1}月{app.now.getDate()}日 周{weekdayCn(app.now)}
            </span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <button
                className={`foot-icon-btn ${app.stats.dndActive ? 'active-warn' : ''}`}
                onClick={() => app.setDndMinutes(app.stats.dndActive ? 0 : 60)}
                title={app.stats.dndActive ? '勿扰开启中（点击恢复提醒）' : '开启 60 分钟勿扰'}
              >
                {app.stats.dndActive ? <BellOff size={13} /> : <Calendar size={13} />}
              </button>
              <button
                className={`foot-icon-btn ${themeMenuOpen ? 'active' : ''}`}
                onClick={() => setThemeMenuOpen((v) => !v)}
                title={`当前主题：${THEME_NAME[app.theme]}（点击展开 ${THEME_OPTIONS.length} 套主题）`}
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

      <main className="main" ref={mainRef}>
        <header className="mobile-topbar">
          <div className="mobile-brand" onClick={() => setPage('today')}>
            <img src={activeLogo} alt="小猫工作助手" />
            <span>小猫工作助手</span>
          </div>
          <div className="mobile-actions" ref={mobileThemeRef}>
            {app.focusTimer.active ? (
              <button
                type="button"
                className="mobile-focus-pill"
                onClick={app.pauseResumeFocus}
                title={app.focusTimer.paused ? '继续专注' : '暂停专注'}
              >
                <Timer size={12} />
                <span>
                  {pad2(focusMin)}:{pad2(focusSec)}
                </span>
              </button>
            ) : null}
            <button
              type="button"
              className="icon-btn"
              title="搜索与快捷命令"
              onClick={() => setCmdOpen(true)}
            >
              <Search size={15} />
            </button>
            <button
              type="button"
              className={`icon-btn ${mobileThemeOpen ? 'active' : ''}`}
              title={`切换外观（当前：${THEME_NAME[app.theme]}）`}
              onClick={() => setMobileThemeOpen((v) => !v)}
            >
              <ThemeIcon size={15} />
            </button>
            {mobileThemeOpen ? (
              <div className="theme-popover mobile-theme-popover" role="menu">
                <div className="theme-popover-title">切换外观主题</div>
                {THEME_OPTIONS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`theme-pop-item ${app.theme === t.id ? 'active' : ''}`}
                    onClick={() => {
                      app.setTheme(t.id)
                      setMobileThemeOpen(false)
                    }}
                  >
                    <i style={{ background: t.colors[2] }} />
                    <span>{t.name}</span>
                    <em>{t.badge}</em>
                    {app.theme === t.id ? <Check size={12} color="var(--primary)" /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </header>

        <div className="page-wrap" key={page}>
          {page === 'today' && <TodayPage app={app} go={setPage} goWorkWithFilter={goWorkWithFilter} />}
          {page === 'work' && <WorkPage app={app} initialFilter={workFilter} />}
          {page === 'reports' && <ReportsPage app={app} />}
          {page === 'quotes' && <QuotesPage app={app} />}
          {page === 'health' && <HealthPage app={app} />}
          {page === 'settings' && <SettingsPage app={app} />}
          {isPinkCat ? (
            <div className="pinkcat-footer-companion" aria-hidden="true">
              <img className="pinkcat-corner-art" src={pinkCatCorner} alt="" />
              <span>喵喵一直在角落为你加油，记得按时喝水、保护眼睛哦～</span>
            </div>
          ) : null}
        </div>
      </main>

      <nav className="mobile-nav">
        {NAV.map((item) => {
          const Icon = item.icon
          const showOverdueDot = item.id === 'work' && app.stats.overdue > 0
          const showOpenDot = item.id === 'work' && !showOverdueDot && app.stats.open > 0
          const showUnreadDot = item.id === 'today' && app.stats.unreadInbox > 0
          return (
            <button
              key={item.id}
              className={page === item.id ? 'active' : ''}
              onClick={() => {
                if (item.id === 'work') setWorkFilter(null)
                setPage(item.id)
              }}
            >
              <span className="mobile-nav-icon-wrap">
                <Icon size={17} />
                {showOverdueDot ? <i className="mobile-nav-dot danger" /> : null}
                {showOpenDot || showUnreadDot ? <i className="mobile-nav-dot" /> : null}
              </span>
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
                  <button className="btn ghost small" onClick={() => app.snoozeReminder(app.reminder!.workId!, 10)}>
                    延后 10 分钟
                  </button>
                  <button className="btn ghost small" onClick={() => app.snoozeReminder(app.reminder!.workId!, 60)}>
                    延后 1 小时
                  </button>
                  <button className="btn forest small" onClick={() => app.completeReminder(app.reminder!.workId!)}>
                    标记完成
                  </button>
                </>
              ) : null}
              <button className="btn small" onClick={() => app.dismissReminder()}>
                确认知晓
              </button>
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

      <ExportExcelModal open={globalExcelOpen} app={app} onClose={() => setGlobalExcelOpen(false)} />

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
