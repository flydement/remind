import { useState } from 'react'
import { BellOff, CheckCircle2, Plus, Trash2 } from 'lucide-react'
import type { HealthReminder } from '@shared/types'
import { createId } from '@shared/ids'
import { inWorkHours, nowIso } from '@shared/time'
import PageHead from '../components/PageHead'
import type { useAppState } from '../state'

export default function HealthPage({ app }: { app: ReturnType<typeof useAppState> }) {
  const [adding, setAdding] = useState(false)
  const [emoji, setEmoji] = useState('🍵')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [interval, setIntervalVal] = useState(45)

  const checkInNow = (h: HealthReminder): void => {
    const at = nowIso()
    app.patch((s) => ({
      ...s,
      health: s.health.map((x) => (x.id === h.id ? { ...x, lastFiredAt: at } : x))
    }))
    app.setFlash({
      id: createId('fl'),
      title: `${h.emoji} 已打卡：${h.title}`,
      body: `计时器已重置，将在 ${h.intervalMinutes} 分钟后再次提醒。`,
      source: 'health'
    })
  }

  const createCustom = (): void => {
    if (!title.trim()) return
    const item: HealthReminder = {
      id: createId('hl'),
      emoji: emoji.trim() || '🌿',
      title: title.trim(),
      message: message.trim() || '稍微停下手头工作，调整呼吸与坐姿。',
      enabled: true,
      intervalMinutes: Math.max(5, interval),
      workHoursOnly: true,
      workStart: app.state.settings.workStart,
      workEnd: app.state.settings.workEnd,
      lastFiredAt: nowIso()
    }
    app.patch((s) => ({ ...s, health: [...s.health, item] }))
    setTitle('')
    setMessage('')
    setAdding(false)
  }

  return (
    <>
      <PageHead
        title="健康节律"
        sub="科学管理久坐、饮水与用眼疲劳。工作时段内自动循环提醒，会议期间可一键开启勿扰。"
        right={
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={`btn ${app.stats.dndActive ? '' : 'ghost'} small`}
              onClick={() => app.setDndMinutes(app.stats.dndActive ? 0 : 60)}
            >
              <BellOff size={13} />
              {app.stats.dndActive ? '关闭勿扰模式' : '会议勿扰 60 分钟'}
            </button>
            <button className="btn small" onClick={() => setAdding((v) => !v)}>
              <Plus size={13} />
              新增健康节律
            </button>
          </div>
        }
      />

      {adding ? (
        <div className="card" style={{ marginBottom: 18 }}>
          <h3>新增自定义健康提醒</h3>
          <div className="form-grid">
            <div className="field">
              <label>图标符号</label>
              <input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="例如 🍵 / 🧘" />
            </div>
            <div className="field">
              <label>提醒标题</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：端正坐姿 / 颈椎拉伸" />
            </div>
            <div className="field">
              <label>循环间隔（分钟）</label>
              <input type="number" min={5} value={interval} onChange={(e) => setIntervalVal(Math.max(5, Number(e.target.value) || 30))} />
            </div>
            <div className="field">
              <label>提示语</label>
              <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="简短温和的行动提示..." />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
            <button className="btn ghost small" onClick={() => setAdding(false)}>取消</button>
            <button className="btn small" onClick={createCustom}>创建并启用</button>
          </div>
        </div>
      ) : null}

      <div className="grid-2-equal">
        {app.state.health.map((h) => {
          const inWindow = !h.workHoursOnly || inWorkHours(app.now, h.workStart, h.workEnd)
          const elapsedMin = h.lastFiredAt
            ? Math.max(0, (app.now.getTime() - new Date(h.lastFiredAt).getTime()) / 60_000)
            : 0
          const remainMin = Math.max(1, Math.ceil(h.intervalMinutes - elapsedMin))
          const pct = h.enabled && inWindow ? Math.min(100, Math.round((elapsedMin / h.intervalMinutes) * 100)) : 0

          return (
            <div className={`card health-card ${h.enabled ? 'active' : 'paused'}`} key={h.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="emoji-badge">{h.emoji}</div>
                  <div>
                    <h3 style={{ margin: 0 }}>{h.title}</h3>
                    <span className={`tag ${h.enabled ? 'accent' : ''}`} style={{ marginTop: 4 }}>
                      {!h.enabled
                        ? '已暂停'
                        : !inWindow
                          ? '非工作时段休眠中'
                          : `运行中 · 约 ${remainMin} 分钟后提醒`}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {h.enabled ? (
                    <button
                      className="btn ghost small"
                      title="已完成休息，重置本轮计时"
                      onClick={() => checkInNow(h)}
                    >
                      <CheckCircle2 size={13} />
                      打卡重置
                    </button>
                  ) : null}
                  {app.state.health.length > 1 ? (
                    <button
                      className="icon-btn"
                      title="删除该项"
                      onClick={() =>
                        app.patch((s) => ({
                          ...s,
                          health: s.health.filter((x) => x.id !== h.id)
                        }))
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                  <button
                    className={`toggle ${h.enabled ? 'on' : ''}`}
                    onClick={() =>
                      app.patch((s) => ({
                        ...s,
                        health: s.health.map((x) =>
                          x.id === h.id
                            ? {
                                ...x,
                                enabled: !x.enabled,
                                lastFiredAt: !x.enabled ? nowIso() : x.lastFiredAt
                              }
                            : x
                        )
                      }))
                    }
                  />
                </div>
              </div>

              <p className="muted" style={{ margin: '4px 0 0', lineHeight: 1.5 }}>{h.message}</p>

              {h.enabled && inWindow ? (
                <div className="sidebar-progress" style={{ margin: '2px 0' }}>
                  <div className="sidebar-progress-bar" style={{ width: `${pct}%` }} />
                </div>
              ) : null}

              <div className="form-grid">
                <div className="field">
                  <label>间隔（分钟）</label>
                  <input
                    type="number"
                    min={5}
                    value={h.intervalMinutes}
                    onChange={(e) =>
                      app.patch((s) => ({
                        ...s,
                        health: s.health.map((x) =>
                          x.id === h.id
                            ? { ...x, intervalMinutes: Math.max(5, Number(e.target.value) || 5) }
                            : x
                        )
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label>生效范围</label>
                  <select
                    value={h.workHoursOnly ? 'yes' : 'no'}
                    onChange={(e) =>
                      app.patch((s) => ({
                        ...s,
                        health: s.health.map((x) =>
                          x.id === h.id ? { ...x, workHoursOnly: e.target.value === 'yes' } : x
                        )
                      }))
                    }
                  >
                    <option value="yes">仅工作时段</option>
                    <option value="no">全天生效</option>
                  </select>
                </div>
                <div className="field">
                  <label>时段开始</label>
                  <input
                    type="time"
                    value={h.workStart}
                    onChange={(e) =>
                      app.patch((s) => ({
                        ...s,
                        health: s.health.map((x) =>
                          x.id === h.id ? { ...x, workStart: e.target.value || '09:00' } : x
                        )
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label>时段结束</label>
                  <input
                    type="time"
                    value={h.workEnd}
                    onChange={(e) =>
                      app.patch((s) => ({
                        ...s,
                        health: s.health.map((x) =>
                          x.id === h.id ? { ...x, workEnd: e.target.value || '18:30' } : x
                        )
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
