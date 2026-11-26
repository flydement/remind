import { useMemo, useState } from 'react'
import { Check, Copy, MessageSquarePlus, Plus, Search, Shuffle, Trash2, X } from 'lucide-react'
import type { QuoteItem, QuoteKind, QuoteSettings } from '@shared/types'
import { createId } from '@shared/ids'
import { nowIso } from '@shared/time'
import PageHead from '../components/PageHead'
import { KIND_LABEL } from '../kindLabel'
import type { useAppState } from '../state'

async function copyToClipboard(text: string): Promise<boolean> {
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

export default function QuotesPage({ app }: { app: ReturnType<typeof useAppState> }) {
  const s = app.state.quoteSettings
  const today = app.state.quotes.find((q) => q.id === s.lastQuoteId) ?? app.state.quotes.find((q) => q.enabled)
  const [showAnswer, setShowAnswer] = useState(false)
  const [copiedHero, setCopiedHero] = useState(false)
  const [tab, setTab] = useState<'schedule' | 'library'>('schedule')
  const [adding, setAdding] = useState(false)
  const [kindFilter, setKindFilter] = useState<'all' | QuoteKind>('all')
  const [search, setSearch] = useState('')
  const [newKind, setNewKind] = useState<QuoteKind>('motivation')
  const [newContent, setNewContent] = useState('')
  const [newAnswer, setNewAnswer] = useState('')

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
    const title = pick.kind === 'motivation' ? '今日寄语' : pick.kind === 'riddle' ? '思维热身' : '工作间歇'
    const body = pick.answer ? `${pick.content}\n（打开应用可查看答案）` : pick.content
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

  const handleCopyHero = async (): Promise<void> => {
    if (!today) return
    const text = today.answer ? `${today.content}\n答案：${today.answer}` : today.content
    if (await copyToClipboard(text)) {
      setCopiedHero(true)
      window.setTimeout(() => setCopiedHero(false), 1800)
    }
  }

  const addQuote = (): void => {
    if (!newContent.trim()) return
    const item: QuoteItem = {
      id: createId('qt'),
      kind: newKind,
      content: newContent.trim(),
      answer: newAnswer.trim() || undefined,
      enabled: true
    }
    app.patch((st) => ({ ...st, quotes: [item, ...st.quotes] }))
    setNewContent('')
    setNewAnswer('')
    setAdding(false)
    app.setFlash({
      id: createId('fl'),
      title: '已添加新词条',
      body: `已加入「${KIND_LABEL[item.kind]}」推送池。`,
      source: 'quote'
    })
  }

  const deleteQuote = (q: QuoteItem): void => {
    app.patch((st) => ({
      ...st,
      quotes: st.quotes.filter((x) => x.id !== q.id)
    }))
    app.setFlash({
      id: createId('fl'),
      title: '已删除词条',
      body: q.content.slice(0, 32),
      source: 'info',
      actionLabel: '撤销',
      onAction: () => {
        app.patch((st) => ({ ...st, quotes: [q, ...st.quotes] }))
        app.setFlash(null)
      }
    })
  }

  const kindCounts = useMemo(() => {
    const counts: Record<QuoteKind, number> = { motivation: 0, riddle: 0, joke: 0 }
    for (const item of app.state.quotes) counts[item.kind]++
    return counts
  }, [app.state.quotes])

  const filteredQuotes = useMemo(() => {
    const q = search.trim().toLowerCase()
    return app.state.quotes.filter((item) => {
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false
      if (!q) return true
      return (
        item.content.toLowerCase().includes(q) ||
        (item.answer?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [app.state.quotes, kindFilter, search])

  return (
    <>
      <PageHead
        title="语言文库"
        sub="定时推送工作寄语、思维问答或轻松短句，支持一键复制、筛选检索与扩充词条。"
        right={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              className="btn ghost small"
              onClick={() => {
                setTab('library')
                setAdding((v) => !v)
              }}
            >
              <Plus size={13} />
              新增词条
            </button>
            <button className="btn small" onClick={pushNow}>
              <Shuffle size={13} />
              随机抽取并推送
            </button>
          </div>
        }
      />

      {today ? (
        <div className="card quote-hero" style={{ marginBottom: 18 }}>
          <div className="section-head" style={{ marginBottom: 4 }}>
            <div className="quote-kind">当前卡片 · {KIND_LABEL[today.kind]}</div>
            <button
              type="button"
              className="icon-btn"
              title="复制当前句"
              onClick={() => void handleCopyHero()}
            >
              {copiedHero ? <Check size={14} color="var(--forest)" /> : <Copy size={13} />}
            </button>
          </div>
          <p className="quote-body">{today.content}</p>
          {today.answer ? (
            <div style={{ marginTop: 12 }}>
              {showAnswer ? (
                <p className="muted" style={{ margin: 0 }}>
                  答案：{today.answer}{' '}
                  <button className="riddle-btn" onClick={() => setShowAnswer(false)}>
                    隐藏
                  </button>
                </p>
              ) : (
                <button className="riddle-btn" onClick={() => setShowAnswer(true)}>
                  查看答案
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="filters">
        <button className={`chip ${tab === 'schedule' ? 'on' : ''}`} onClick={() => setTab('schedule')}>
          推送计划配置
        </button>
        <button className={`chip ${tab === 'library' ? 'on' : ''}`} onClick={() => setTab('library')}>
          管理词条库（{app.state.quotes.length} 条）
        </button>
      </div>

      {tab === 'schedule' ? (
        <div className="card">
          <div className="switch">
            <div>
              <b>启用自动推送</b>
              <div className="muted">按设定频率发送桌面通知并更新今日概览卡片。</div>
            </div>
            <button
              className={`toggle ${s.enabled ? 'on' : ''}`}
              onClick={() => patchSchedule({ enabled: !s.enabled })}
            />
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label>推送模式</label>
            <div className="filters" style={{ margin: 0 }}>
              <button
                className={`chip ${s.frequency === 'once' ? 'on' : ''}`}
                onClick={() => patchSchedule({ frequency: 'once' }, true)}
              >
                每日固定时间
              </button>
              <button
                className={`chip ${s.frequency === 'interval' ? 'on' : ''}`}
                onClick={() => patchSchedule({ frequency: 'interval' }, true)}
              >
                时段内按间隔循环
              </button>
            </div>
          </div>

          {s.frequency === 'once' ? (
            <div className="form-grid">
              <div className="field">
                <label>每日推送时刻</label>
                <input
                  type="time"
                  value={s.time}
                  onChange={(e) => patchSchedule({ time: e.target.value || '09:30' }, true)}
                />
              </div>
              <div className="field">
                <label>启用内容分类</label>
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
                <label>时段开始</label>
                <input
                  type="time"
                  value={s.windowStart}
                  onChange={(e) => patchSchedule({ windowStart: e.target.value || '08:00' })}
                />
              </div>
              <div className="field">
                <label>时段结束</label>
                <input
                  type="time"
                  value={s.windowEnd}
                  onChange={(e) => patchSchedule({ windowEnd: e.target.value || '21:00' })}
                />
              </div>
              <div className="field">
                <label>推送间隔</label>
                <select
                  value={s.intervalMinutes}
                  onChange={(e) => patchSchedule({ intervalMinutes: Number(e.target.value) })}
                >
                  <option value={15}>15 分钟</option>
                  <option value={30}>30 分钟</option>
                  <option value={60}>60 分钟</option>
                  <option value={120}>120 分钟</option>
                </select>
              </div>
              <div className="field">
                <label>启用内容分类</label>
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
      ) : (
        <>
          {adding ? (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="section-head">
                <h3>
                  <MessageSquarePlus size={15} color="var(--primary)" /> 新增自定义词条
                </h3>
                <button className="icon-btn" onClick={() => setAdding(false)} title="收起">
                  <X size={14} />
                </button>
              </div>
              <div className="form-grid" style={{ marginTop: 4 }}>
                <div className="field">
                  <label>分类</label>
                  <select value={newKind} onChange={(e) => setNewKind(e.target.value as QuoteKind)}>
                    <option value="motivation">激励寄语</option>
                    <option value="riddle">思维问答</option>
                    <option value="joke">轻松幽默</option>
                  </select>
                </div>
                <div className="field">
                  <label>谜底 / 备注答案（可选）</label>
                  <input value={newAnswer} onChange={(e) => setNewAnswer(e.target.value)} placeholder="非问答类可留空" />
                </div>
              </div>
              <div className="field" style={{ marginTop: 10 }}>
                <label>正文内容</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    placeholder="输入一句格言、工作准则或趣味问答，按回车保存..."
                    onKeyDown={(e) => e.key === 'Enter' && addQuote()}
                  />
                  <button className="btn" onClick={addQuote}>
                    添加入库
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="work-toolbar">
            <div className="filters" style={{ marginBottom: 0 }}>
              <button className={`chip ${kindFilter === 'all' ? 'on' : ''}`} onClick={() => setKindFilter('all')}>
                全部 ({app.state.quotes.length})
              </button>
              {(Object.keys(KIND_LABEL) as QuoteKind[]).map((k) => (
                <button
                  key={k}
                  className={`chip ${kindFilter === k ? 'on' : ''}`}
                  onClick={() => setKindFilter(k)}
                >
                  {KIND_LABEL[k]} ({kindCounts[k]})
                </button>
              ))}
            </div>
            <div className="search-wrap">
              <Search size={14} className="search-icon" />
              <input
                className="search-bar"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="检索文库内容..."
              />
              {search ? (
                <button className="search-clear" onClick={() => setSearch('')}>
                  <X size={13} />
                </button>
              ) : null}
            </div>
          </div>

          <div className="card">
            <div className="work-list">
              {filteredQuotes.length ? (
                filteredQuotes.map((q) => (
                  <div className={`work ${q.enabled ? '' : 'done'}`} key={q.id}>
                    <button
                      className={`check ${q.enabled ? 'on' : ''}`}
                      title={q.enabled ? '点击停用' : '点击启用'}
                      onClick={() =>
                        app.patch((st) => ({
                          ...st,
                          quotes: st.quotes.map((x) => (x.id === q.id ? { ...x, enabled: !x.enabled } : x))
                        }))
                      }
                    />
                    <div>
                      <p className="title" style={{ textDecoration: 'none' }}>
                        {q.content}
                      </p>
                      <p className="meta">
                        <span className="tag">{KIND_LABEL[q.kind]}</span>
                        <span>{q.answer ? `答案：${q.answer}` : q.enabled ? '已加入推送池' : '已停用'}</span>
                      </p>
                    </div>
                    <div className="work-actions">
                      <button
                        className="icon-btn hover-reveal"
                        title="复制词条"
                        onClick={() => void copyToClipboard(q.answer ? `${q.content}\n答案：${q.answer}` : q.content)}
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        className="icon-btn hover-reveal"
                        title="删除词条（支持撤销）"
                        onClick={() => deleteQuote(q)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty">没有匹配的文库词条。</div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
