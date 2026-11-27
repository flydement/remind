import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Download, FileSpreadsheet, X } from 'lucide-react'
import {
  buildExcelFilename,
  collectMonthlyExcelPlan,
  generateWorkExcelBytes
} from '@shared/excel'
import { createId } from '@shared/ids'
import { formatDateCn, pad2 } from '@shared/time'
import type { useAppState } from '../state'

function toMonthInput(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

function parseMonthInput(ym: string, fallback: Date): Date {
  const parts = ym.split('-').map(Number)
  if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
    return fallback
  }
  return new Date(parts[0], parts[1] - 1, 1, 12, 0, 0, 0)
}

export default function ExportExcelModal({
  open,
  initialDate,
  app,
  onClose
}: {
  open: boolean
  initialDate?: Date
  app: ReturnType<typeof useAppState>
  onClose: () => void
}) {
  const baseDate = initialDate ?? app.now
  const [monthStr, setMonthStr] = useState(() => toMonthInput(baseDate))
  const [department, setDepartment] = useState(() => app.state.settings.department ?? '部门')
  const [defaultOwner, setDefaultOwner] = useState(() => app.state.settings.owner ?? '')
  const [carryOverOpen, setCarryOverOpen] = useState(true)
  const [showDetail, setShowDetail] = useState(false)

  useEffect(() => {
    if (!open) return
    setMonthStr(toMonthInput(initialDate ?? app.now))
    setDepartment(app.state.settings.department ?? '部门')
    setDefaultOwner(app.state.settings.owner ?? '')
    setShowDetail(false)
  }, [open, initialDate, app.now, app.state.settings.department, app.state.settings.owner])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const monthDate = useMemo(() => parseMonthInput(monthStr, baseDate), [monthStr, baseDate])

  const plan = useMemo(
    () =>
      collectMonthlyExcelPlan(app.state.workItems, {
        monthDate,
        department,
        defaultOwner,
        carryOverOpen
      }),
    [app.state.workItems, monthDate, department, defaultOwner, carryOverOpen]
  )

  if (!open) return null

  const totalDone = plan.doneKey.length + plan.doneNormal.length
  const totalPlan = plan.planKey.length + plan.planNormal.length
  const totalExported = totalDone + totalPlan

  const handleDownload = (): void => {
    const cleanDept = department.trim() || '部门'
    const cleanOwner = defaultOwner.trim()

    app.patch((s) => ({
      ...s,
      settings: {
        ...s.settings,
        department: cleanDept,
        owner: cleanOwner
      }
    }))

    const bytes = generateWorkExcelBytes(app.state.workItems, {
      monthDate,
      department: cleanDept,
      defaultOwner: cleanOwner,
      carryOverOpen
    })
    const filename = buildExcelFilename({
      monthDate,
      department: cleanDept
    })

    const blob = new Blob([bytes as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    app.setFlash({
      id: createId('fl'),
      title: '已导出 Excel 工作台账',
      body: `${filename}（共归集 ${totalExported} 项任务）`,
      source: 'work'
    })
    onClose()
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="card sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileSpreadsheet size={17} color="var(--forest)" />
            <h3>导出工作台账 Excel</h3>
          </div>
          <button className="icon-btn" onClick={onClose} title="关闭 (Esc)">
            <X size={16} />
          </button>
        </div>
        <p className="muted" style={{ margin: '4px 0 0' }}>
          自动生成标准合并单元格表格（含「部门 / 时间 / 工作类别 / 序号 / 工作内容 / 责任人 / 完成时间 / 备注」及重点工作、一般工作分组）。
        </p>

        <div className="form-grid" style={{ marginTop: 14 }}>
          <div className="field">
            <label>总结月份（自动关联下月计划）</label>
            <input type="month" value={monthStr} onChange={(e) => setMonthStr(e.target.value)} />
          </div>
          <div className="field">
            <label>部门名称（第一列合并单元格）</label>
            <input
              value={department}
              placeholder="例如：研发部 / 部门"
              onChange={(e) => setDepartment(e.target.value)}
            />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>默认责任人（当工作项未单独填写责任人时自动填入）</label>
            <input
              value={defaultOwner}
              placeholder="例如：张三（可留空）"
              onChange={(e) => setDefaultOwner(e.target.value)}
            />
          </div>
        </div>

        <div className="switch" style={{ marginTop: 10 }}>
          <div>
            <b>未完结待办并入{plan.nextMonth}月工作计划</b>
            <div className="muted">将截至 {plan.curMonth} 月底仍未完成的待办 / 进行中事项自动归入下月计划</div>
          </div>
          <button
            type="button"
            className={`toggle ${carryOverOpen ? 'on' : ''}`}
            onClick={() => setCarryOverOpen((v) => !v)}
          />
        </div>

        <div className="excel-summary-box">
          <div className="excel-summary-grid">
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{plan.curMonth}月工作完成情况</div>
              <div className="muted" style={{ marginTop: 4 }}>
                重点工作 <b>{plan.doneKey.length}</b> 项 · 一般工作 <b>{plan.doneNormal.length}</b> 项
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{plan.nextMonth}月工作计划</div>
              <div className="muted" style={{ marginTop: 4 }}>
                重点工作 <b>{plan.planKey.length}</b> 项 · 一般工作 <b>{plan.planNormal.length}</b> 项
              </div>
            </div>
          </div>

          {totalExported > 0 ? (
            <button
              type="button"
              className="excel-detail-toggle"
              onClick={() => setShowDetail((v) => !v)}
            >
              {showDetail ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              {showDetail ? '收起导出明细' : `预览即将导出的 ${totalExported} 项明细`}
            </button>
          ) : null}

          {showDetail && totalExported > 0 ? (
            <div className="excel-preview-list">
              {totalDone > 0 ? (
                <div className="excel-preview-group">
                  <div className="excel-preview-head">{plan.curMonth}月完成情况（{totalDone}）</div>
                  {plan.doneKey.map((r) => (
                    <div key={`dk-${r.id}`} className="excel-preview-row">
                      <span className="tag danger">重点</span>
                      <span className="excel-preview-title">{r.title}</span>
                      <span className="muted">{formatDateCn(r.completedAt ?? r.dueAt)}</span>
                    </div>
                  ))}
                  {plan.doneNormal.map((r) => (
                    <div key={`dn-${r.id}`} className="excel-preview-row">
                      <span className="tag">一般</span>
                      <span className="excel-preview-title">{r.title}</span>
                      <span className="muted">{formatDateCn(r.completedAt ?? r.dueAt)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {totalPlan > 0 ? (
                <div className="excel-preview-group">
                  <div className="excel-preview-head">{plan.nextMonth}月工作计划（{totalPlan}）</div>
                  {plan.planKey.map((r) => (
                    <div key={`pk-${r.id}`} className="excel-preview-row">
                      <span className="tag danger">重点</span>
                      <span className="excel-preview-title">{r.title}</span>
                      <span className="muted">{formatDateCn(r.dueAt)}</span>
                    </div>
                  ))}
                  {plan.planNormal.map((r) => (
                    <div key={`pn-${r.id}`} className="excel-preview-row">
                      <span className="tag">一般</span>
                      <span className="excel-preview-title">{r.title}</span>
                      <span className="muted">{formatDateCn(r.dueAt)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn forest" onClick={handleDownload}>
            <Download size={14} />
            导出 .xlsx 文件
          </button>
        </div>
      </div>
    </div>
  )
}
