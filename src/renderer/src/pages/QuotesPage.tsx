import { useState } from 'react'
import { Shuffle } from 'lucide-react'
import type { QuoteKind, QuoteSettings } from '@shared/types'
import { createId } from '@shared/ids'
import { nowIso } from '@shared/time'
import PageHead from '../components/PageHead'
import { KIND_LABEL } from '../kindLabel'
import type { useAppState } from '../state'

export default function QuotesPage({ app }: { app: ReturnType<typeof useAppState> }) {
  const s = app.state.quoteSettings
  const today = app.state.quotes.find((q) => q.id === s.lastQuoteId)
  const [showAnswer, setShowAnswer] = useState(false)

  const patchSchedule = (next: Partial<QuoteSettings>, resetSchedule = false): void =>
    app.patch((st) => ({
      ...st,
      quoteSettings: {
        ...st.quoteSettings,
        ...next,
        ...(resetSchedule ? { lastPushedDate: undefined } : {})
      }
    }))

  const pushNow = (): void => {
    const pool = app.state.quotes.filter((q) => q.enabled && s.kinds.includes(q.kind))
    if (!pool.length) return
    const unused = pool.filter((q) => q.id !== s.lastQuoteId)
    const pick = unused[Math.floor(Math.random() * unused.length)] ?? pool[0]
    const at = nowIso()
    const title = pick.kind === 'motivation' ? '今日一句' : pick.kind === 'riddle' ? '脑筋急转弯' : '轻松一下'
    const body = pick.answer ? `${pick.content}\n（想看答案就打开小猫工作助手）` : pick.content
    setShowAnswer(false)
    app.patch((st) => ({
      ...st,
      quoteSettings: { ...st.quoteSettings, lastPushedDate: at, lastQuoteId: pick.id }
    }))
    app.announce({
      id: createId('nt'),
      at,
      title,
      body,
      source: 'quote',
      read: false
    })
  }

  return (
    <>
      <PageHead title="语言库" sub="按设定时间，或在时段内按间隔重复推一句鸡血、脑筋急转弯或笑话。添加和管理内容在「设置」里。" />
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="switch">
          <div>
            <b>语言库推送</b>
            <div className="muted">到点后弹出系统通知，也可在今日页看到。</div>
          </div>
          <button
            className={`toggle ${s.enabled ? 'on' : ''}`}
            onClick={() => patchSchedule({ enabled: !s.enabled })}
          />
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label>推送频率</label>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div className="filters" style={{ margin: 0 }}>
              <button className={`chip ${s.frequency === 'once' ? 'on' : ''}`} onClick={() => patchSchedule({ frequency: 'once' }, true)}>每日一次</button>
              <button className={`chip ${s.frequency === 'interval' ? 'on' : ''}`} onClick={() => patchSchedule({ frequency: 'interval' }, true)}>时段内重复</button>
            </div>
            <button className="btn ghost small" onClick={pushNow}>
              <Shuffle size={13} />
              换一条并推送
            </button>
          </div>
        </div>
        {s.frequency === 'once' ? (
          <div className="form-grid">
            <div className="field">
              <label>推送时间</label>
              <input
                type="time"
                value={s.time}
                onChange={(e) => patchSchedule({ time: e.target.value || '09:30' }, true)}
              />
            </div>
            <div className="field">
              <label>包含类型</label>
              <div className="filters" style={{ margin: 0 }}>
                {(Object.keys(KIND_LABEL) as QuoteKind[]).map((k) => (
                  <button
                    key={k}
                    className={`chip ${s.kinds.includes(k) ? 'on' : ''}`}
                    onClick={() => {
                      const kinds = s.kinds.includes(k) ? s.kinds.filter((x) => x !== k) : [...s.kinds, k]
                      patchSchedule({ kinds: kinds.length ? kinds : [k] })
                    }}
                  >
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="form-grid">
            <div className="field">
              <label>开始时间</label>
              <input type="time" value={s.windowStart} onChange={(e) => patchSchedule({ windowStart: e.target.value || '08:00' })} />
            </div>
            <div className="field">
              <label>结束时间</label>
              <input type="time" value={s.windowEnd} onChange={(e) => patchSchedule({ windowEnd: e.target.value || '21:00' })} />
            </div>
            <div className="field">
              <label>间隔</label>
              <select value={s.intervalMinutes} onChange={(e) => patchSchedule({ intervalMinutes: Number(e.target.value) })}>
                <option value={5}>5 分钟</option>
                <option value={10}>10 分钟</option>
                <option value={15}>15 分钟</option>
                <option value={30}>30 分钟</option>
                <option value={60}>60 分钟</option>
              </select>
            </div>
            <div className="field">
              <label>包含类型</label>
              <div className="filters" style={{ margin: 0 }}>
                {(Object.keys(KIND_LABEL) as QuoteKind[]).map((k) => (
                  <button
                    key={k}
                    className={`chip ${s.kinds.includes(k) ? 'on' : ''}`}
                    onClick={() => {
                      const kinds = s.kinds.includes(k) ? s.kinds.filter((x) => x !== k) : [...s.kinds, k]
                      patchSchedule({ kinds: kinds.length ? kinds : [k] })
                    }}
                  >
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {today ? (
        <div className="card quote-hero" style={{ marginBottom: 16 }}>
          <div className="quote-kind">最近推送 · {KIND_LABEL[today.kind]}</div>
          <p className="quote-body">{today.content}</p>
          {today.answer ? (
            <div style={{ marginTop: 12 }}>
              {showAnswer ? (
                <p className="muted" style={{ margin: 0 }}>
                  答案：{today.answer}{' '}
                  <button className="riddle-btn" onClick={() => setShowAnswer(false)}>隐藏</button>
                </p>
              ) : (
                <button className="riddle-btn" onClick={() => setShowAnswer(true)}>查看答案</button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
