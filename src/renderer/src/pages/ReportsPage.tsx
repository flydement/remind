import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Edit3,
  FilePlus2,
  Percent,
  RefreshCw,
  Save
} from 'lucide-react'
import type { ReportKind, ReportStyle } from '@shared/types'
import { periodOf, upsertReport } from '@shared/reports'
import { addDays, addMonthsClamped, formatDateTimeCn, toLocalDate } from '@shared/time'
import PageHead from '../components/PageHead'
import type { useAppState } from '../state'

async function copyText(text: string): Promise<boolean> {
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

export default function ReportsPage({ app }: { app: ReturnType<typeof useAppState> }) {
  const [kind, setKind] = useState<ReportKind>('weekly')
  const [style, setStyle] = useState<ReportStyle>('executive')
  const [offset, setOffset] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [editingBody, setEditingBody] = useState<string | null>(null)

  const targetDate = useMemo(() => {
    if (offset === 0) return app.now
    return kind === 'weekly' ? addDays(app.now, offset * 7) : addMonthsClamped(app.now, offset)
  }, [app.now, kind, offset])

  const targetPeriod = useMemo(() => periodOf(kind, targetDate), [kind, targetDate])

  const list = useMemo(
    () => app.state.reports.filter((r) => r.kind === kind),
    [app.state.reports, kind]
  )

  const periodMatched = useMemo(
    () =>
      list.find(
        (r) =>
          new Date(r.periodStart).getTime() === targetPeriod.start.getTime() &&
          new Date(r.periodEnd).getTime() === targetPeriod.end.getTime()
      ),
    [list, targetPeriod]
  )

  const current = useMemo(
    () => (selectedId ? list.find((r) => r.id === selectedId) : periodMatched ?? list[0]) ?? null,
    [list, selectedId, periodMatched]
  )

  useEffect(() => {
    setSelectedId(null)
    setOffset(0)
    setCopied(false)
    setEditingBody(null)
  }, [kind])

  const generate = (nextStyle = style): void => {
    setSelectedId(null)
    setEditingBody(null)
    app.patch((s) => upsertReport(s, kind, targetDate, nextStyle))
  }

  const handleStyleSwitch = (nextStyle: ReportStyle): void => {
    setStyle(nextStyle)
    if (periodMatched || current) {
      generate(nextStyle)
    }
  }

  const saveBodyEdit = (): void => {
    if (!current || editingBody === null) return
    app.patch((s) => ({
      ...s,
      reports: s.reports.map((r) => (r.id === current.id ? { ...r, body: editingBody } : r))
    }))
    setEditingBody(null)
  }

  const handleCopy = async (): Promise<void> => {
    if (!current) return
    const text = `${current.title}\n\n${editingBody ?? current.body}`
    const ok = await copyText(text)
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleExportMd = (): void => {
    if (!current) return
    const md = `# ${current.title}\n\n${editingBody ?? current.body}\n`
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${current.title.replace(/\s+/g, '')}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const periodLabel = `${toLocalDate(targetPeriod.start)} ~ ${toLocalDate(targetPeriod.end)}`

  return (
    <>
      <PageHead
        title="周报与月报"
        sub="自动汇总选定周期内的完成事项、推进状态、子步骤进度与风险提示，支持三种汇报模板与在线修订。"
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div className="filters" style={{ marginBottom: 0 }}>
          <button className={`chip ${kind === 'weekly' ? 'on' : ''}`} onClick={() => setKind('weekly')}>工作周报</button>
          <button className={`chip ${kind === 'monthly' ? 'on' : ''}`} onClick={() => setKind('monthly')}>工作月报</button>
          <span className="muted" style={{ margin: '0 4px' }}>|</span>
          {(
            [
              ['executive', '严谨汇报版'],
              ['concise', '精简要点版'],
              ['warm', '温和复盘版']
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className={`chip ${style === id ? 'on' : ''}`}
              onClick={() => handleStyleSwitch(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn ghost small" onClick={() => { setSelectedId(null); setOffset((o) => o - 1) }}>
            <ChevronLeft size={13} />
            {kind === 'weekly' ? '上一周' : '上个月'}
          </button>
          <button
            className="btn ghost small"
            disabled={offset === 0}
            onClick={() => { setSelectedId(null); setOffset(0) }}
            title={periodLabel}
          >
            {offset === 0 ? (kind === 'weekly' ? '本周' : '本月') : periodLabel}
          </button>
          <button className="btn ghost small" onClick={() => { setSelectedId(null); setOffset((o) => o + 1) }}>
            {kind === 'weekly' ? '下一周' : '下个月'}
            <ChevronRight size={13} />
          </button>
          <button className="btn small" onClick={() => generate(style)}>
            <RefreshCw size={13} />
            {periodMatched ? '重新生成该期' : '生成该期报告'}
          </button>
        </div>
      </div>

      {list.length > 1 ? (
        <div className="report-history">
          <span className="muted">已归档报告：</span>
          {list.map((r) => (
            <button
              key={r.id}
              className={`chip ${current?.id === r.id ? 'on' : ''}`}
              onClick={() => {
                setSelectedId(r.id)
                setCopied(false)
                setEditingBody(null)
              }}
            >
              {r.title}
            </button>
          ))}
        </div>
      ) : null}

      {current ? (
        <>
          <div className="grid-4" style={{ marginBottom: 18 }}>
            <div className="card stat">
              <div className="stat-top">
                <span>阶段完成率</span>
                <div className="stat-icon primary"><Percent size={15} /></div>
              </div>
              <b>{current.stats.completionRate ?? (current.stats.done + current.stats.pending > 0 ? Math.round((current.stats.done / (current.stats.done + current.stats.pending)) * 100) : 0)}%</b>
            </div>
            <div className="card stat">
              <div className="stat-top">
                <span>本期新建</span>
                <div className="stat-icon"><FilePlus2 size={15} /></div>
              </div>
              <b>{current.stats.created}</b>
            </div>
            <div className="card stat">
              <div className="stat-top">
                <span>已完成交付</span>
                <div className="stat-icon forest"><CheckCircle2 size={15} /></div>
              </div>
              <b style={{ color: 'var(--forest)' }}>{current.stats.done}</b>
            </div>
            <div className="card stat">
              <div className="stat-top">
                <span>逾期需跟进</span>
                <div className="stat-icon terra"><AlertCircle size={15} /></div>
              </div>
              <b style={current.stats.overdue > 0 ? { color: 'var(--danger)' } : undefined}>{current.stats.overdue}</b>
            </div>
          </div>

          <div className="card">
            <div className="section-head">
              <div>
                <h3>{current.title}</h3>
                <p className="muted" style={{ margin: '4px 0 0' }}>
                  生成于 {formatDateTimeCn(current.generatedAt)} · 统计区间 {periodLabel}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {editingBody === null ? (
                  <button className="btn ghost small" onClick={() => setEditingBody(current.body)}>
                    <Edit3 size={13} />
                    微调正文
                  </button>
                ) : (
                  <button className="btn forest small" onClick={saveBodyEdit}>
                    <Save size={13} />
                    保存修改
                  </button>
                )}
                <button className="btn ghost small" onClick={handleExportMd}>
                  <Download size={13} />
                  导出 .md
                </button>
                <button className="btn small" onClick={() => void handleCopy()}>
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? '已复制全文' : '复制全文'}
                </button>
              </div>
            </div>

            {editingBody !== null ? (
              <div style={{ marginTop: 12 }}>
                <textarea
                  className="report-editor"
                  value={editingBody}
                  onChange={(e) => setEditingBody(e.target.value)}
                />
              </div>
            ) : (
              <div className="report-paper">
                <div className="report">{current.body}</div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="card empty">
          尚未生成 {periodLabel} 的{kind === 'weekly' ? '周报' : '月报'}。点击右上角「生成该期报告」即可一键汇总草稿。
        </div>
      )}
    </>
  )
}
