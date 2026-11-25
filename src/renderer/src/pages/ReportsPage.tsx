import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, CheckCircle2, Copy, FilePlus2, RefreshCw } from 'lucide-react'
import type { ReportKind } from '@shared/types'
import { upsertReport } from '@shared/reports'
import { formatDateTimeCn } from '@shared/time'
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const list = useMemo(
    () => app.state.reports.filter((r) => r.kind === kind),
    [app.state.reports, kind]
  )

  const current = useMemo(
    () => list.find((r) => r.id === selectedId) ?? list[0] ?? null,
    [list, selectedId]
  )

  useEffect(() => {
    setSelectedId(null)
    setCopied(false)
  }, [kind])

  const generate = (): void => {
    setSelectedId(null)
    app.patch((s) => upsertReport(s, kind))
  }

  const handleCopy = async (): Promise<void> => {
    if (!current) return
    const ok = await copyText(`${current.title}\n\n${current.body}`)
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <>
      <PageHead title="周报月报" sub="根据这段时间的工作项自动汇总。你可以随时重新生成，也可以回看历史记录。" />
      <div className="filters">
        <button className={`chip ${kind === 'weekly' ? 'on' : ''}`} onClick={() => setKind('weekly')}>本周周报</button>
        <button className={`chip ${kind === 'monthly' ? 'on' : ''}`} onClick={() => setKind('monthly')}>本月月报</button>
        <button className="btn small" onClick={generate}>
          <RefreshCw size={13} />
          {list.length ? '生成 / 刷新本期' : '生成本期'}
        </button>
      </div>

      {list.length > 1 ? (
        <div className="report-history">
          <span className="muted">历史报告：</span>
          {list.map((r) => (
            <button
              key={r.id}
              className={`chip ${current?.id === r.id ? 'on' : ''}`}
              onClick={() => { setSelectedId(r.id); setCopied(false) }}
            >
              {r.title}
            </button>
          ))}
        </div>
      ) : null}

      {current ? (
        <>
          <div className="grid-3" style={{ marginBottom: 18 }}>
            <div className="card stat">
              <div className="stat-top">
                <span>新建</span>
                <div className="stat-icon"><FilePlus2 size={15} /></div>
              </div>
              <b>{current.stats.created}</b>
            </div>
            <div className="card stat">
              <div className="stat-top">
                <span>完成</span>
                <div className="stat-icon forest"><CheckCircle2 size={15} /></div>
              </div>
              <b style={{ color: 'var(--forest)' }}>{current.stats.done}</b>
            </div>
            <div className="card stat">
              <div className="stat-top">
                <span>逾期</span>
                <div className="stat-icon terra"><AlertCircle size={15} /></div>
              </div>
              <b style={current.stats.overdue > 0 ? { color: 'var(--terra)' } : undefined}>{current.stats.overdue}</b>
            </div>
          </div>
          <div className="card">
            <div className="section-head">
              <div>
                <h3>{current.title}</h3>
                <p className="muted" style={{ margin: '4px 0 0' }}>生成于 {formatDateTimeCn(current.generatedAt)}</p>
              </div>
              <button className="btn ghost small" onClick={() => void handleCopy()}>
                {copied ? <Check size={14} color="var(--forest)" /> : <Copy size={14} />}
                {copied ? '已复制' : '复制全文'}
              </button>
            </div>
            <div className="report-paper">
              <div className="report">{current.body}</div>
            </div>
          </div>
        </>
      ) : (
        <div className="card empty">还没有{kind === 'weekly' ? '周报' : '月报'}。点「生成本期」，小猫工作助手会根据工作项写出一版草稿。</div>
      )}
    </>
  )
}
