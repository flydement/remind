import { useMemo, useState } from 'react'
import { BellOff, CheckCircle2, Plus, RotateCcw, SlidersHorizontal, Trash2 } from 'lucide-react'
import type { HealthReminder } from '@shared/types'
import { DEFAULT_HEALTH, HEALTH_CATALOG_VERSION, mergeBuiltinHealth } from '@shared/defaults'
import { createId } from '@shared/ids'
import { inWorkHours, nowIso } from '@shared/time'
import PageHead from '../components/PageHead'
import type { useAppState } from '../state'

export default function HealthPage({ app }: { app: ReturnType<typeof useAppState> }) {
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'paused'>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [emoji, setEmoji] = useState('🍵')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [interval, setIntervalVal] = useState(45)

  const activeCount = useMemo(() => app.state.health.filter((h) => h.enabled).length, [app.state.health])
  const pausedCount = app.state.health.length - activeCount

  const missingBuiltinCount = useMemo(() => {
    const existing = new Set(app.state.health.map((h) => h.title.trim()))
    return DEFAULT_HEALTH.filter((h) => !existing.has(h.title.trim())).length
  }, [app.state.health])

  const visibleHealth = useMemo(() => {
    if (filter === 'active') return app.state.health.filter((h) => h.enabled)
    if (filter === 'paused') return app.state.health.filter((h) => !h.enabled)
    return app.state.health
  }, [app.state.health, filter])

  const restoreBuiltinHealth = (): void => {
    const { health: merged, added } = mergeBuiltinHealth(app.state.health)
    if (!added) return
    app.patch((s) => ({
      ...s,
      health: merged,
      settings: { ...s.settings, healthCatalogVersion: HEALTH_CATALOG_VERSION }
    }))
    app.setFlash({
      id: createId('fl'),
      title: `已补全 ${added} 项内置健康节律`,
      body: `当前共有 ${merged.length} 项健康节律可供随时开启。`,
      source: 'health'
    })
  }

  const deleteHealth = (h: HealthReminder): void => {
    const prevList = app.state.health
    app.patch((s) => ({
      ...s,
      health: s.health.filter((x) => x.id !== h.id)
    }))
    app.setFlash({
      id: createId('fl'),
      title: `已删除节律「${h.title}」`,
      body: '误删可点击右侧撤销恢复。',
      source: 'info',
      actionLabel: '撤销',
      onAction: () => {
        app.patch((s) => ({ ...s, health: prevList }))
        app.setFlash(null)
      }
    })
  }

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
    app.setFlash({
      id: createId('fl'),
      title: `已创建健康节律：${item.title}`,
      body: `每 ${item.intervalMinutes} 分钟提醒一次，工作时段内生效。`,
      source: 'health'
    })
  }

  return (
    <>
      <PageHead
        title="健康节律"
        sub={`科学管理饮水、坐姿、肩颈手腕与用眼放松（已开启 ${activeCount} / 共 ${app.state.health.length} 项）。`}
        right={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className={`btn ${app.stats.dndActive ? '' : 'ghost'} small`}
              onClick={() => app.setDndMinutes(app.stats.dndActive ? 0 : 60)}
            >
              <BellOff size={13} />
              {app.stats.dndActive ? '关闭勿扰模式' : '会议勿扰 60 分钟'}
            </button>
            <button className="btn small" onClick={() => setAdding((v) => !v)}>
              <Plus size={13} />
              新增节律
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
              <input
                type="number"
                min={5}
                value={interval}
                onChange={(e) => setIntervalVal(Math.max(5, Number(e.target.value) || 30))}
              />
            </div>
            <div className="field">
              <label>提示语</label>
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="简短温和的行动提示..."
                onKeyDown={(e) => e.key === 'Enter' && createCustom()}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
            <button className="btn ghost small" onClick={() => setAdding(false)}>
              取消
            </button>
            <button className="btn small" onClick={createCustom}>
              创建并启用
            </button>
          </div>
        </div>
      ) : null}

      <div className="work-toolbar" style={{ marginBottom: 14 }}>
        <div className="seg-tabs">
          <button type="button" className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
            全部节律 ({app.state.health.length})
          </button>
          <button type="button" className={filter === 'active' ? 'on' : ''} onClick={() => setFilter('active')}>
            已启用 ({activeCount})
          </button>
          <button type="button" className={filter === 'paused' ? 'on' : ''} onClick={() => setFilter('paused')}>
            待开启 ({pausedCount})
          </button>
        </div>
        {missingBuiltinCount > 0 ? (
          <button
            type="button"
            className="btn ghost small"
            onClick={restoreBuiltinHealth}
            title="补充尚未收录或曾被删除的内置健康节律"
          >
            <RotateCcw size={12} />
            补全内置节律 (+{missingBuiltinCount})
          </button>
        ) : null}
      </div>

      {visibleHealth.length ? (
        <div className="grid-2-equal">
          {visibleHealth.map((h) => {
            const inWindow = !h.workHoursOnly || inWorkHours(app.now, h.workStart, h.workEnd)
            const elapsedMin = h.lastFiredAt
              ? Math.max(0, (app.now.getTime() - new Date(h.lastFiredAt).getTime()) / 60_000)
              : 0
            const remainMin = Math.max(1, Math.ceil(h.intervalMinutes - elapsedMin))
            const pct = h.enabled && inWindow ? Math.min(100, Math.round((elapsedMin / h.intervalMinutes) * 100)) : 0
            const isEditing = editingId === h.id

            return (
              <div className={`card health-card ${h.enabled ? 'active' : 'paused'}`} key={h.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="emoji-badge">{h.emoji}</div>
                    <div>
                      <h3 style={{ margin: 0 }}>{h.title}</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                        <span className={`tag ${h.enabled ? 'accent' : ''}`}>
                          {!h.enabled
                            ? '已暂停'
                            : !inWindow
                              ? '非工作时段休眠'
                              : `约 ${remainMin} 分钟后提醒`}
                        </span>
                        <span className="muted" style={{ fontSize: 12 }}>
                          每 {h.intervalMinutes}m · {h.workHoursOnly ? `${h.workStart}–${h.workEnd}` : '全天'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {h.enabled ? (
                      <button
                        className="btn ghost small"
                        title="已完成休息，重置本轮计时"
                        onClick={() => checkInNow(h)}
                      >
                        <CheckCircle2 size={13} />
                        打卡
                      </button>
                    ) : null}
                    <button
                      className={`icon-btn ${isEditing ? 'active' : ''}`}
                      title={isEditing ? '收起参数设置' : '调整间隔与生效时段'}
                      onClick={() => setEditingId(isEditing ? null : h.id)}
                    >
                      <SlidersHorizontal size={14} />
                    </button>
                    {app.state.health.length > 1 ? (
                      <button
                        className="icon-btn"
                        title="删除该项（支持撤销）"
                        onClick={() => deleteHealth(h)}
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

              <p className="muted" style={{ margin: '2px 0 0', lineHeight: 1.5 }}>
                {h.message}
              </p>

              {h.enabled && inWindow ? (
                <div className="sidebar-progress" style={{ margin: '2px 0' }}>
                  <div className="sidebar-progress-bar" style={{ width: `${pct}%` }} />
                </div>
              ) : null}

              {isEditing ? (
                <div className="health-drawer">
                  <div className="form-grid" style={{ marginTop: 0 }}>
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
              ) : null}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card empty">
          {filter === 'active' ? '当前暂无已启用的健康节律，可在「待开启」中挑选开启。' : '所有健康节律都已启用啦！'}
        </div>
      )}
    </>
  )
}
