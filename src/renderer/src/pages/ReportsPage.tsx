import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  BookmarkCheck,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Edit3,
  FilePlus2,
  FileSpreadsheet,
  Percent,
  Printer,
  RefreshCw,
  Save,
  Trash2
} from 'lucide-react'
import type { ReportKind, ReportStyle } from '@shared/types'
import { createId } from '@shared/ids'
import { generateReport, periodOf, upsertReport } from '@shared/reports'
import { addDays, addMonthsClamped, formatDateTimeCn, toLocalDate } from '@shared/time'
import PageHead from '../components/PageHead'
import ExportExcelModal from '../components/ExportExcelModal'
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
  const [excelOpen, setExcelOpen] = useState(false)

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

  // Live instant preview when no archived report exists for the target period
  const liveDraft = useMemo(
    () => generateReport(app.state, kind, targetDate, style),
    [app.state, kind, targetDate, style]
  )

  const archived = useMemo(
    () => (selectedId ? list.find((r) => r.id === selectedId) : periodMatched) ?? null,
    [list, selectedId, periodMatched]
  )

  const current = archived ?? liveDraft
  const isLivePreview = !archived

  useEffect(() => {
    setSelectedId(null)
    setOffset(0)
    setCopied(false)
    setEditingBody(null)
  }, [kind])

  const archiveOrRefresh = (nextStyle = style, silent = false): void => {
    const wasPreview = !periodMatched
    setSelectedId(null)
    setEditingBody(null)
    app.patch((s) => upsertReport(s, kind, targetDate, nextStyle))
    if (!silent) {
      app.setFlash({
        id: createId('fl'),
        title: wasPreview ? '已归档本期报告' : '已重新汇总本期报告',
        body: current.title,
        source: 'info'
      })
    }
  }

  const handleStyleSwitch = (nextStyle: ReportStyle): void => {
    setStyle(nextStyle)
    setEditingBody(null)
    if (periodMatched) {
      archiveOrRefresh(nextStyle, true)
    }
  }

  const saveBodyEdit = (): void => {
    if (editingBody === null) return
    if (archived) {
      app.patch((s) => ({
        ...s,
        reports: s.reports.map((r) => (r.id === archived.id ? { ...r, body: editingBody } : r))
      }))
    } else {
      app.patch((s) => {
        const next = upsertReport(s, kind, targetDate, style)
        return {
          ...next,
          reports: next.reports.map((r, idx) => (idx === 0 ? { ...r, body: editingBody } : r))
        }
      })
    }
    setEditingBody(null)
    app.setFlash({
      id: createId('fl'),
      title: '已保存报告修改',
      body: current.title,
      source: 'info'
    })
  }

  const handleCopy = async (): Promise<void> => {
    const text = `${current.title}\n\n${editingBody ?? current.body}`
    const ok = await copyText(text)
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleExportMd = (): void => {
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
    app.setFlash({
      id: createId('fl'),
      title: '已导出 Markdown 报告',
      body: `${current.title.replace(/\s+/g, '')}.md`,
      source: 'info'
    })
  }

  const activePeriodLabel = `${toLocalDate(new Date(current.periodStart))} ~ ${toLocalDate(new Date(current.periodEnd))}`
  const targetPeriodLabel = `${toLocalDate(targetPeriod.start)} ~ ${toLocalDate(targetPeriod.end)}`

  return (
    <>
      <PageHead
        title="周报与月报"
        sub="实时自动汇总选定周期内的完成事项、推进状态与风险提示，打开即看、一键复制或导出台账。"
        right={
          <button className="btn ghost small" onClick={() => setExcelOpen(true)}>
            <FileSpreadsheet size={13} color="var(--forest)" />
            导出 Excel 台账
          </button>
        }
      />

      <div className="work-toolbar" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="seg-tabs">
            <button type="button" className={kind === 'weekly' ? 'on' : ''} onClick={() => setKind('weekly')}>
              工作周报
            </button>
            <button type="button" className={kind === 'monthly' ? 'on' : ''} onClick={() => setKind('monthly')}>
              工作月报
            </button>
          </div>
          <div className="seg-tabs">
            {(
              [
                ['executive', '严谨汇报'],
                ['concise', '精简要点'],
                ['warm', '温和复盘']
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={style === id ? 'on' : ''}
                onClick={() => handleStyleSwitch(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="period-stepper">
            <button
              type="button"
              className="icon-btn"
              title={kind === 'weekly' ? '上一周' : '上个月'}
              onClick={() => {
                setSelectedId(null)
                setEditingBody(null)
                setOffset((o) => o - 1)
              }}
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              className="period-stepper-label"
              disabled={offset === 0 && !selectedId}
              onClick={() => {
                setSelectedId(null)
                setEditingBody(null)
                setOffset(0)
              }}
              title={`点击回到${kind === 'weekly' ? '本周' : '本月'}（${targetPeriodLabel}）`}
            >
              {offset === 0 ? (kind === 'weekly' ? '本周' : '本月') : targetPeriodLabel}
            </button>
            <button
              type="button"
              className="icon-btn"
              title={kind === 'weekly' ? '下一周' : '下个月'}
              onClick={() => {
                setSelectedId(null)
                setEditingBody(null)
                setOffset((o) => o + 1)
              }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
          <button className="btn ghost small" onClick={() => archiveOrRefresh(style)}>
            {isLivePreview ? <BookmarkCheck size={13} /> : <RefreshCw size={13} />}
            {isLivePreview ? '归档该期' : '重新汇总'}
          </button>
        </div>
      </div>

      {list.length > 0 ? (
        <div className="report-history">
          <span className="muted">已归档：</span>
          {list.map((r) => (
            <button
              key={r.id}
              className={`chip ${archived?.id === r.id ? 'on' : ''}`}
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

      <div className="grid-4" style={{ marginBottom: 18 }}>
        <div className="card stat">
          <div className="stat-top">
            <span>阶段完成率</span>
            <div className="stat-icon primary">
              <Percent size={15} />
            </div>
          </div>
          <b>
            {current.stats.completionRate ??
              (current.stats.done + current.stats.pending > 0
                ? Math.round((current.stats.done / (current.stats.done + current.stats.pending)) * 100)
                : 0)}
            %
          </b>
        </div>
        <div className="card stat">
          <div className="stat-top">
            <span>本期新建</span>
            <div className="stat-icon">
              <FilePlus2 size={15} />
            </div>
          </div>
          <b>{current.stats.created}</b>
        </div>
        <div className="card stat">
          <div className="stat-top">
            <span>已完成交付</span>
            <div className="stat-icon forest">
              <CheckCircle2 size={15} />
            </div>
          </div>
          <b style={{ color: 'var(--forest)' }}>{current.stats.done}</b>
        </div>
        <div className="card stat">
          <div className="stat-top">
            <span>逾期需跟进</span>
            <div className="stat-icon terra">
              <AlertCircle size={15} />
            </div>
          </div>
          <b style={current.stats.overdue > 0 ? { color: 'var(--danger)' } : undefined}>{current.stats.overdue}</b>
        </div>
      </div>

      <div className="card">
        <div className="section-head">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h3>{current.title}</h3>
              {isLivePreview ? <span className="tag primary">实时草稿</span> : <span className="tag accent">已归档</span>}
            </div>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              {isLivePreview ? '随最新事项实时计算' : `归档于 ${formatDateTimeCn(current.generatedAt)}`} · 统计区间{' '}
              {activePeriodLabel}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {archived ? (
              <button
                className="icon-btn"
                title="移除该份归档报告（支持撤销）"
                onClick={() => {
                  app.deleteReport(archived.id)
                  setSelectedId(null)
                  setEditingBody(null)
                }}
              >
                <Trash2 size={14} />
              </button>
            ) : null}
            {editingBody === null ? (
              <button className="btn ghost small" onClick={() => setEditingBody(current.body)}>
                <Edit3 size={13} />
                微调正文
              </button>
            ) : (
              <>
                <button className="btn ghost small" onClick={() => setEditingBody(null)}>
                  取消
                </button>
                <button className="btn forest small" onClick={saveBodyEdit}>
                  <Save size={13} />
                  保存修改
                </button>
              </>
            )}
            <button className="btn ghost small" onClick={() => window.print()} title="打印或另存为 PDF">
              <Printer size={13} />
              打印 / PDF
            </button>
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

      <ExportExcelModal open={excelOpen} app={app} onClose={() => setExcelOpen(false)} />
    </>
  )
}
