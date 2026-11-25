import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BellOff,
  BookOpenText,
  CheckCircle2,
  ClipboardList,
  CornerDownLeft,
  FileSpreadsheet,
  HeartPulse,
  LayoutDashboard,
  Moon,
  Palette,
  Play,
  Plus,
  Search,
  Settings,
  Sun,
  Timer
} from 'lucide-react'
import type { PageId, WorkItem } from '@shared/types'
import { upsertReport } from '@shared/reports'
import { formatDateCn } from '@shared/time'
import type { useAppState } from '../state'

interface CommandEntry {
  id: string
  group: string
  title: string
  hint?: string
  icon: typeof Search
  run: () => void
}

export default function CommandPalette({
  open,
  onClose,
  app,
  go,
  onEditWork,
  onOpenExcel
}: {
  open: boolean
  onClose: () => void
  app: ReturnType<typeof useAppState>
  go: (p: PageId) => void
  onEditWork: (w: WorkItem) => void
  onOpenExcel: () => void
}) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIdx(0)
    window.setTimeout(() => inputRef.current?.focus(), 10)
  }, [open])

  const entries = useMemo<CommandEntry[]>(() => {
    const base: CommandEntry[] = [
      {
        id: 'act-new-work',
        group: '快捷操作',
        title: '新建工作项',
        hint: '前往工作项创建',
        icon: Plus,
        run: () => {
          go('work')
          window.setTimeout(() => {
            const el = document.querySelector<HTMLInputElement>('[data-quick-composer="true"]')
            el?.focus()
          }, 40)
        }
      },
      {
        id: 'act-focus-25',
        group: '快捷操作',
        title: app.focusTimer.active ? '结束当前专注计时' : '开启 25 分钟番茄专注',
        hint: app.focusTimer.active ? '停止计时' : '沉浸专注模式',
        icon: Timer,
        run: () => {
          if (app.focusTimer.active) app.stopFocus()
          else app.startFocus(25)
        }
      },
      {
        id: 'act-export-excel',
        group: '快捷操作',
        title: '导出月度工作台账 Excel (.xlsx)',
        hint: '按重点 / 一般工作分组导出',
        icon: FileSpreadsheet,
        run: () => onOpenExcel()
      },
      {
        id: 'act-weekly-report',
        group: '快捷操作',
        title: '生成 / 刷新本周周报',
        hint: '自动汇总并跳转',
        icon: BookOpenText,
        run: () => {
          app.patch((s) => upsertReport(s, 'weekly', new Date(), 'executive'))
          go('reports')
        }
      },
      {
        id: 'act-monthly-report',
        group: '快捷操作',
        title: '生成 / 刷新本月月报',
        hint: '自动汇总并跳转',
        icon: BookOpenText,
        run: () => {
          app.patch((s) => upsertReport(s, 'monthly', new Date(), 'executive'))
          go('reports')
        }
      },
      {
        id: 'act-dnd',
        group: '快捷操作',
        title: app.stats.dndActive ? '关闭勿扰模式（恢复通知）' : '开启 60 分钟会议勿扰',
        hint: app.stats.dndActive ? '当前勿扰中' : '暂停弹窗与提示音',
        icon: BellOff,
        run: () => app.setDndMinutes(app.stats.dndActive ? 0 : 60)
      },
      ...(app.stats.overdue > 0
        ? [
            {
              id: 'act-postpone',
              group: '快捷操作',
              title: `将 ${app.stats.overdue} 项逾期任务顺延至明天`,
              hint: '批量重排期',
              icon: ClipboardList,
              run: () => app.postponeOverdue(1)
            }
          ]
        : []),
      {
        id: 'theme-slate',
        group: '外观主题',
        title: '切换主题：严谨商务（冷灰蓝）',
        hint: app.theme === 'slate' ? '当前使用' : '结构清晰',
        icon: Sun,
        run: () => app.setTheme('slate')
      },
      {
        id: 'theme-paper',
        group: '外观主题',
        title: '切换主题：温润纸感（暖米色）',
        hint: app.theme === 'paper' ? '当前使用' : '柔和阅读',
        icon: Palette,
        run: () => app.setTheme('paper')
      },
      {
        id: 'theme-dark',
        group: '外观主题',
        title: '切换主题：深色专注（夜间护眼）',
        hint: app.theme === 'dark' ? '当前使用' : '暗色低眩光',
        icon: Moon,
        run: () => app.setTheme('dark')
      },
      {
        id: 'nav-today',
        group: '页面跳转',
        title: '前往：今日工作台',
        hint: 'Alt+1',
        icon: LayoutDashboard,
        run: () => go('today')
      },
      {
        id: 'nav-work',
        group: '页面跳转',
        title: '前往：工作项管理（列表 / 看板）',
        hint: 'Alt+2',
        icon: ClipboardList,
        run: () => go('work')
      },
      {
        id: 'nav-reports',
        group: '页面跳转',
        title: '前往：周报与月报',
        hint: 'Alt+3',
        icon: BookOpenText,
        run: () => go('reports')
      },
      {
        id: 'nav-quotes',
        group: '页面跳转',
        title: '前往：语言库',
        hint: 'Alt+4',
        icon: Play,
        run: () => go('quotes')
      },
      {
        id: 'nav-health',
        group: '页面跳转',
        title: '前往：健康提醒',
        hint: 'Alt+5',
        icon: HeartPulse,
        run: () => go('health')
      },
      {
        id: 'nav-settings',
        group: '页面跳转',
        title: '前往：系统设置与备份',
        hint: 'Alt+6',
        icon: Settings,
        run: () => go('settings')
      }
    ]

    const workEntries: CommandEntry[] = app.state.workItems.slice(0, 40).map((w) => ({
      id: `wk-${w.id}`,
      group: w.status === 'done' ? '已完成工作项' : '待办与进行中工作项',
      title: `${w.title}${w.tags.length ? ` (${w.tags.map((t) => `#${t}`).join(' ')})` : ''}`,
      hint: `${w.status === 'done' ? '已完成' : `截止 ${formatDateCn(w.dueAt)}`} · 打开详情`,
      icon: w.status === 'done' ? CheckCircle2 : ClipboardList,
      run: () => onEditWork(w)
    }))

    const all = [...base, ...workEntries]
    const q = query.trim().toLowerCase()
    if (!q) return all.slice(0, 18)
    return all.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.group.toLowerCase().includes(q) ||
        (e.hint?.toLowerCase().includes(q) ?? false)
    )
  }, [app, go, onEditWork, onOpenExcel, query])

  useEffect(() => {
    setActiveIdx(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-cmd-idx="${activeIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx, open])

  if (!open) return null

  const execute = (entry: CommandEntry | undefined): void => {
    if (!entry) return
    onClose()
    entry.run()
  }

  return (
    <div className="overlay cmd-overlay" onClick={onClose}>
      <div className="cmd-palette" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-input-row">
          <Search size={17} className="cmd-search-icon" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入命令、搜索工作项、切换页面或主题..."
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
              } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActiveIdx((i) => (entries.length ? (i + 1) % entries.length : 0))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActiveIdx((i) => (entries.length ? (i - 1 + entries.length) % entries.length : 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                execute(entries[activeIdx])
              }
            }}
          />
          <kbd className="kbd">ESC</kbd>
        </div>
        <div className="cmd-list" ref={listRef}>
          {entries.length === 0 ? (
            <div className="empty">未找到匹配的命令或工作项</div>
          ) : (
            entries.map((entry, idx) => {
              const Icon = entry.icon
              const prevGroup = idx > 0 ? entries[idx - 1].group : null
              return (
                <div key={entry.id}>
                  {entry.group !== prevGroup ? <div className="cmd-group">{entry.group}</div> : null}
                  <button
                    type="button"
                    data-cmd-idx={idx}
                    className={`cmd-item ${idx === activeIdx ? 'active' : ''}`}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => execute(entry)}
                  >
                    <Icon size={15} className="cmd-item-icon" />
                    <span className="cmd-item-title">{entry.title}</span>
                    {entry.hint ? <span className="cmd-item-hint">{entry.hint}</span> : null}
                    {idx === activeIdx ? <CornerDownLeft size={13} className="cmd-enter-icon" /> : null}
                  </button>
                </div>
              )
            })
          )}
        </div>
        <div className="cmd-foot">
          <span><kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> 选择</span>
          <span><kbd className="kbd">Enter</kbd> 执行</span>
          <span><kbd className="kbd">Alt+1~6</kbd> 快速切页</span>
        </div>
      </div>
    </div>
  )
}
