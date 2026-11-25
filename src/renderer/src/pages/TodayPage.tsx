import { useMemo, useState } from 'react'
import {
  AlertCircle,
  Bell,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Sparkles
} from 'lucide-react'
import type { PageId, WorkItem } from '@shared/types'
import { describeDraft, parseWorkText } from '@shared/parser'
import { formatDateTimeCn } from '@shared/time'
import PageHead from '../components/PageHead'
import { newWorkItem, type useAppState } from '../state'
import WorkEditor from '../components/WorkEditor'
import WorkList from '../components/WorkList'

const SAMPLES = [
  '月报 8月11号 提前5天通知',
  '下周三 下午3点半 评审',
  '月底对账 提前2天'
]

export default function TodayPage({
  app,
  go
}: {
  app: ReturnType<typeof useAppState>
  go: (p: PageId) => void
}) {
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<WorkItem | null>(null)
  const [showAnswer, setShowAnswer] = useState(false)
  const draft = useMemo(() => parseWorkText(text, app.now), [text, app.now])
  const quote = app.state.quotes.find((q) => q.id === app.state.quoteSettings.lastQuoteId)
    ?? app.state.quotes.find((q) => q.enabled)

  const upcoming = useMemo(
    () =>
      app.state.workItems
        .filter((w) => w.status !== 'done')
        .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
        .slice(0, 5),
    [app.state.workItems]
  )

  const isExisting = Boolean(editing && app.state.workItems.some((w) => w.id === editing.id))

  const createFromText = (): void => {
    if (!text.trim()) return
    setEditing(
      newWorkItem({
        title: draft.title,
        dueAt: draft.dueAt,
        notify: draft.notify,
        repeat: draft.repeat,
        notes: draft.notes,
        sourceText: draft.sourceText
      })
    )
  }

  return (
    <>
      <PageHead now={app.now} sub="用一句话记下要做的事。小猫工作助手会帮你算好该哪天提醒。" />

      {!window.rian && app.notifyPerm !== 'granted' ? (
        <div className="card banner-warn">
          <div>
            <b>尚未开启浏览器通知</b>
            <div className="muted">开启后，到点时即使切换标签页也能收到系统提醒。</div>
          </div>
          <button className="btn small" onClick={() => void app.enableNotifications()}>开启通知</button>
        </div>
      ) : null}

      <div className="grid-4" style={{ marginBottom: 18 }}>
        <div className="card stat clickable" onClick={() => go('work')}>
          <div className="stat-top">
            <span>未完成</span>
            <div className="stat-icon"><ClipboardList size={15} /></div>
          </div>
          <b>{app.stats.open}</b>
        </div>
        <div className="card stat clickable" onClick={() => go('work')}>
          <div className="stat-top">
            <span>今日到期</span>
            <div className="stat-icon honey"><CalendarClock size={15} /></div>
          </div>
          <b>{app.stats.dueToday}</b>
        </div>
        <div className="card stat clickable" onClick={() => go('work')}>
          <div className="stat-top">
            <span>已逾期</span>
            <div className="stat-icon terra"><AlertCircle size={15} /></div>
          </div>
          <b style={app.stats.overdue > 0 ? { color: 'var(--terra)' } : undefined}>{app.stats.overdue}</b>
        </div>
        <div className="card stat clickable" onClick={() => go('work')}>
          <div className="stat-top">
            <span>已完成</span>
            <div className="stat-icon forest"><CheckCircle2 size={15} /></div>
          </div>
          <b style={{ color: 'var(--forest)' }}>{app.stats.done}</b>
        </div>
      </div>

      <div className="card composer-card" style={{ marginBottom: 18 }}>
        <h3><Sparkles size={16} color="var(--terra)" /> 一句话新建工作项</h3>
        <div className="composer">
          <div className="composer-input-wrap">
            <Sparkles size={15} className="composer-icon" />
            <input
              value={text}
              placeholder='例如：月报 8月11号 提前5天通知 / 下周三 下午3点半 评审'
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createFromText()}
            />
          </div>
          <button className="btn" onClick={createFromText}>解析并创建</button>
        </div>
        {text.trim() ? (
          <div className="hints">{describeDraft(draft)}{draft.hints.length ? `。${draft.hints.join('；')}` : ''}</div>
        ) : (
          <div className="quick-samples">
            <span>试试点一下：</span>
            {SAMPLES.map((s) => (
              <button key={s} className="sample-pill" onClick={() => setText(s)}>{s}</button>
            ))}
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="section-head">
            <h3>接下来</h3>
            <button className="btn ghost small" onClick={() => go('work')}>全部工作项</button>
          </div>
          <WorkList
            items={upcoming}
            now={app.now}
            empty="还没有待办。试着输入「月报 8月11号 提前5天通知」。"
            onToggle={(w) => app.toggleWork(w)}
            onOpen={setEditing}
          />
        </div>
        <div>
          <div className="card quote-hero" style={{ marginBottom: 18 }}>
            <div className="quote-kind">{quote?.kind === 'joke' ? '轻松一下' : quote?.kind === 'riddle' ? '脑筋急转弯' : '今日一句'}</div>
            <p className="quote-body">{quote?.content ?? '打开语言库，给每天留一句轻的话。'}</p>
            {quote?.answer ? (
              <div style={{ marginTop: 12 }}>
                {showAnswer ? (
                  <p className="muted" style={{ margin: 0 }}>
                    答案：{quote.answer}{' '}
                    <button className="riddle-btn" onClick={() => setShowAnswer(false)}>隐藏</button>
                  </p>
                ) : (
                  <button className="riddle-btn" onClick={() => setShowAnswer(true)}>查看答案</button>
                )}
              </div>
            ) : null}
          </div>
          <div className="card">
            <h3><Bell size={15} color="var(--terra)" /> 最近提醒</h3>
            <div className="inbox">
              {app.state.inbox.length ? (
                <ul>
                  {app.state.inbox.slice(0, 6).map((n) => (
                    <li key={n.id}>
                      <span className={`inbox-dot ${n.source}`} />
                      <div>
                        <b>{n.title}</b>
                        <div className="muted">{formatDateTimeCn(n.at)} · {n.body}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <div className="empty">还没有推送。应用会在后台按你设的时间提醒。</div>}
            </div>
          </div>
        </div>
      </div>

      {editing ? (
        <WorkEditor
          item={editing}
          onClose={() => { setEditing(null); setText('') }}
          onSave={(item) => { app.saveWork(item); setEditing(null); setText('') }}
          onDelete={isExisting ? (item) => { app.deleteWork(item.id); setEditing(null) } : undefined}
        />
      ) : null}
    </>
  )
}
