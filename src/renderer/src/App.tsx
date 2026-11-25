import { useEffect, useState } from 'react'
import {
  Bell,
  BookOpenText,
  Calendar,
  ClipboardList,
  HeartPulse,
  LayoutDashboard,
  Settings as SettingsIcon
} from 'lucide-react'
import type { PageId } from '@shared/types'
import { weekdayCn } from '@shared/time'
import { useAppState } from './state'
import logo from './assets/logo.png'
import TodayPage from './pages/TodayPage'
import WorkPage from './pages/WorkPage'
import ReportsPage from './pages/ReportsPage'
import QuotesPage from './pages/QuotesPage'
import HealthPage from './pages/HealthPage'
import SettingsPage from './pages/SettingsPage'

const NAV: { id: PageId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'today', label: '今日', icon: LayoutDashboard },
  { id: 'work', label: '工作项', icon: ClipboardList },
  { id: 'reports', label: '周报月报', icon: BookOpenText },
  { id: 'quotes', label: '语言库', icon: Bell },
  { id: 'health', label: '健康提醒', icon: HeartPulse },
  { id: 'settings', label: '设置', icon: SettingsIcon }
]

export default function App() {
  const app = useAppState()
  const [page, setPage] = useState<PageId>('today')

  useEffect(() => {
    if (!app.reminder) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') app.dismissReminder()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [app.reminder, app.dismissReminder])

  const totalTasks = app.stats.open + app.stats.done
  const progressPct = totalTasks > 0 ? Math.round((app.stats.done / totalTasks) * 100) : 0

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-mark" src={logo} alt="小猫工作助手" />
          <div>
            <h1>小猫工作助手</h1>
            <p>把一天过得轻一点</p>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((item) => {
            const Icon = item.icon
            const showBadge = item.id === 'work' && app.stats.open > 0
            return (
              <button
                key={item.id}
                className={page === item.id ? 'active' : ''}
                onClick={() => setPage(item.id)}
              >
                <Icon size={16} />
                <span className="label">{item.label}</span>
                {showBadge ? (
                  <span className={`nav-badge ${app.stats.overdue > 0 ? 'warn' : ''}`}>
                    {app.stats.open}
                  </span>
                ) : null}
              </button>
            )
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-date">
            <span>{app.now.getMonth() + 1}月{app.now.getDate()}日 周{weekdayCn(app.now)}</span>
            <Calendar size={13} color="var(--terra)" />
          </div>
          <div className="sidebar-progress">
            <div className="sidebar-progress-bar" style={{ width: `${progressPct}%` }} />
          </div>
          <div>
            未完成 {app.stats.open} 项
            {app.stats.overdue > 0 ? ` · 逾期 ${app.stats.overdue}` : totalTasks > 0 ? ` · 完成 ${progressPct}%` : ''}
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
      {app.flash ? (
        <div className="toast" onClick={() => app.setFlash(null)}>
          <div className="quote-kind" style={{ color: '#e8b86d' }}>提醒</div>
          <b>{app.flash.title}</b>
          <p className="muted" style={{ color: '#efe6d8', margin: '6px 0 0' }}>{app.flash.body}</p>
        </div>
      ) : null}
      {app.reminder ? (
        <div className="overlay">
          <div className="card sheet reminder-modal">
            <div className="quote-kind">工作提醒</div>
            <h2 style={{ margin: '8px 0 6px' }}>{app.reminder.title}</h2>
            <p style={{ margin: 0 }}>{app.reminder.body}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {app.reminder.workId ? (
                <>
                  <button
                    className="btn ghost"
                    onClick={() => app.snoozeReminder(app.reminder!.workId!, 10)}
                  >
                    10分钟后再提醒
                  </button>
                  <button
                    className="btn forest"
                    onClick={() => app.completeReminder(app.reminder!.workId!)}
                  >
                    标记完成
                  </button>
                </>
              ) : null}
              <button className="btn" onClick={() => app.dismissReminder()}>确认</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
