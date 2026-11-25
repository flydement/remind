import PageHead from '../components/PageHead'
import type { useAppState } from '../state'

export default function HealthPage({ app }: { app: ReturnType<typeof useAppState> }) {
  return (
    <>
      <PageHead title="健康提醒" sub="久坐、缺水、眼睛盯屏幕太久，小猫工作助手会按时戳你一下。" />
      <div className="grid-2">
        {app.state.health.map((h) => (
          <div className={`card health-card ${h.enabled ? 'active' : 'paused'}`} key={h.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="emoji-badge">{h.emoji}</div>
                <div>
                  <h3 style={{ margin: 0 }}>{h.title}</h3>
                  <span className={`tag ${h.enabled ? 'accent' : ''}`} style={{ marginTop: 4 }}>
                    {h.enabled ? `运行中 · 每 ${h.intervalMinutes} 分钟` : '已暂停'}
                  </span>
                </div>
              </div>
              <button
                className={`toggle ${h.enabled ? 'on' : ''}`}
                onClick={() => app.patch((s) => ({
                  ...s,
                  health: s.health.map((x) => x.id === h.id ? {
                    ...x,
                    enabled: !x.enabled,
                    lastFiredAt: !x.enabled ? undefined : x.lastFiredAt
                  } : x)
                }))}
              />
            </div>
            <p className="muted" style={{ margin: '4px 0 0', lineHeight: 1.5 }}>{h.message}</p>
            <div className="form-grid">
              <div className="field">
                <label>间隔（分钟）</label>
                <input
                  type="number"
                  min={5}
                  value={h.intervalMinutes}
                  onChange={(e) => app.patch((s) => ({
                    ...s,
                    health: s.health.map((x) => x.id === h.id ? { ...x, intervalMinutes: Math.max(5, Number(e.target.value) || 5) } : x)
                  }))}
                />
              </div>
              <div className="field">
                <label>仅工作时间</label>
                <select
                  value={h.workHoursOnly ? 'yes' : 'no'}
                  onChange={(e) => app.patch((s) => ({
                    ...s,
                    health: s.health.map((x) => x.id === h.id ? { ...x, workHoursOnly: e.target.value === 'yes' } : x)
                  }))}
                >
                  <option value="yes">是</option>
                  <option value="no">全天</option>
                </select>
              </div>
              <div className="field">
                <label>工作开始</label>
                <input
                  type="time"
                  value={h.workStart}
                  onChange={(e) => app.patch((s) => ({
                    ...s,
                    health: s.health.map((x) => x.id === h.id ? { ...x, workStart: e.target.value || '09:00' } : x)
                  }))}
                />
              </div>
              <div className="field">
                <label>工作结束</label>
                <input
                  type="time"
                  value={h.workEnd}
                  onChange={(e) => app.patch((s) => ({
                    ...s,
                    health: s.health.map((x) => x.id === h.id ? { ...x, workEnd: e.target.value || '18:30' } : x)
                  }))}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
