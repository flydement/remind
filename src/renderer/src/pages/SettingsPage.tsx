import { useRef, useState } from 'react'
import { BellRing, Database, Download, MessageSquarePlus, SlidersHorizontal, Upload } from 'lucide-react'
import type { QuoteItem, QuoteKind } from '@shared/types'
import { createId } from '@shared/ids'
import { toLocalDate } from '@shared/time'
import PageHead from '../components/PageHead'
import { KIND_LABEL } from '../kindLabel'
import type { useAppState } from '../state'

export default function SettingsPage({ app }: { app: ReturnType<typeof useAppState> }) {
  const s = app.state.settings
  const [kind, setKind] = useState<QuoteKind>('motivation')
  const [content, setContent] = useState('')
  const [answer, setAnswer] = useState('')
  const [confirmQuoteId, setConfirmQuoteId] = useState<string | null>(null)
  const [backupMsg, setBackupMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const addQuote = (): void => {
    if (!content.trim()) return
    const item: QuoteItem = {
      id: createId('qt'),
      kind,
      content: content.trim(),
      answer: answer.trim() || undefined,
      enabled: true
    }
    app.patch((st) => ({ ...st, quotes: [item, ...st.quotes] }))
    setContent('')
    setAnswer('')
  }

  const handleExport = (): void => {
    const json = app.exportState()
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `小猫工作助手-备份-${toLocalDate(new Date())}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setBackupMsg({ ok: true, text: '已导出本地备份文件（JSON）。' })
  }

  const handleImportFile = async (file: File | undefined): Promise<void> => {
    if (!file) return
    const text = await file.text()
    const res = await app.importState(text)
    setBackupMsg({ ok: res.ok, text: res.message })
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <>
      <PageHead title="设置" sub="数据保存在本机。以后接到手机时，工作项解析、提醒规则和周报算法都可以复用。" />
      <div className="card">
        <h3><SlidersHorizontal size={15} color="var(--terra)" /> 常规与通知</h3>
        <div className="switch">
          <div>
            <b>开机启动</b>
            <div className="muted">让小猫工作助手在托盘里默默盯着截止日。</div>
          </div>
          <button
            className={`toggle ${s.startWithSystem ? 'on' : ''}`}
            onClick={() => app.patch((st) => ({ ...st, settings: { ...st.settings, startWithSystem: !s.startWithSystem } }))}
          />
        </div>
        <div className="switch">
          <div>
            <b>通知声音</b>
            <div className="muted">系统通知是否出声。</div>
          </div>
          <button
            className={`toggle ${s.sound ? 'on' : ''}`}
            onClick={() => app.patch((st) => ({ ...st, settings: { ...st.settings, sound: !s.sound } }))}
          />
        </div>
        <div className="switch">
          <div>
            <b>通知通道测试</b>
            <div className="muted">发送一条测试提醒，确认系统通知正常工作。</div>
          </div>
          <button className="btn ghost small" onClick={() => app.testNotify()}>
            <BellRing size={13} />
            发送测试通知
          </button>
        </div>
        <div className="form-grid" style={{ marginTop: 16 }}>
          <div className="field">
            <label>默认工作开始</label>
            <input
              type="time"
              value={s.workStart}
              onChange={(e) => app.patch((st) => ({ ...st, settings: { ...st.settings, workStart: e.target.value || '09:00' } }))}
            />
          </div>
          <div className="field">
            <label>默认工作结束</label>
            <input
              type="time"
              value={s.workEnd}
              onChange={(e) => app.patch((st) => ({ ...st, settings: { ...st.settings, workEnd: e.target.value || '18:30' } }))}
            />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3><Database size={15} color="var(--forest)" /> 数据备份与恢复</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          导出全部工作项、周月报、自定义语录与健康设置，换电脑或重装系统时可一键导入恢复。
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <button className="btn ghost small" onClick={handleExport}>
            <Download size={13} />
            导出备份 JSON
          </button>
          <button className="btn ghost small" onClick={() => fileRef.current?.click()}>
            <Upload size={13} />
            导入备份 JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(e) => void handleImportFile(e.target.files?.[0])}
          />
        </div>
        {backupMsg ? (
          <div className={`status-msg ${backupMsg.ok ? 'ok' : 'err'}`}>{backupMsg.text}</div>
        ) : null}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3><MessageSquarePlus size={15} color="var(--terra)" /> 添加语言库内容</h3>
        <div className="form-grid">
          <div className="field">
            <label>类型</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as QuoteKind)}>
              <option value="motivation">鸡血</option>
              <option value="riddle">脑筋急转弯</option>
              <option value="joke">笑话</option>
            </select>
          </div>
          <div className="field">
            <label>答案（急转弯可选）</label>
            <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="可留空" />
          </div>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label>内容</label>
          <textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} placeholder="写一句轻松的话..." />
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn" onClick={addQuote}>加入语言库</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3>全部语言（{app.state.quotes.length} 条）</h3>
        <div className="work-list">
          {app.state.quotes.map((q) => (
            <div className="work" key={q.id}>
              <button
                className={`check ${q.enabled ? 'on' : ''}`}
                title={q.enabled ? '点击停用' : '点击启用'}
                onClick={() => app.patch((st) => ({ ...st, quotes: st.quotes.map((x) => x.id === q.id ? { ...x, enabled: !x.enabled } : x) }))}
              />
              <div>
                <p className="title">{q.content}</p>
                <p className="meta">
                  <span className="tag">{KIND_LABEL[q.kind]}</span>
                  {q.answer ? `答案：${q.answer}` : '启用后会进入推送池'}
                </p>
              </div>
              {confirmQuoteId === q.id ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn danger small"
                    onClick={() => {
                      setConfirmQuoteId(null)
                      app.patch((st) => ({ ...st, quotes: st.quotes.filter((x) => x.id !== q.id) }))
                    }}
                  >
                    确认
                  </button>
                  <button className="btn ghost small" onClick={() => setConfirmQuoteId(null)}>取消</button>
                </div>
              ) : (
                <button className="btn ghost small" onClick={() => setConfirmQuoteId(q.id)}>删除</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
