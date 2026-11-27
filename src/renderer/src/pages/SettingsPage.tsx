import { useRef, useState } from 'react'
import { BellRing, Check, Database, Download, Keyboard, Palette, SlidersHorizontal, Upload } from 'lucide-react'
import { THEME_OPTIONS } from '@shared/types'
import { toLocalDate } from '@shared/time'
import pinkCatAvatar from '../assets/pink-cat-avatar.svg'
import PageHead from '../components/PageHead'
import type { useAppState } from '../state'

export default function SettingsPage({ app }: { app: ReturnType<typeof useAppState> }) {
  const s = app.state.settings
  const [backupMsg, setBackupMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

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
    setBackupMsg({ ok: true, text: '已成功导出完整数据备份文件（JSON）。' })
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
      <PageHead
        title="系统设置"
        sub="自定义视觉主题、工作时段、默认台账署名与本地数据备份。"
      />

      <div className="card" style={{ marginBottom: 18 }}>
        <h3>
          <Palette size={15} color="var(--primary)" /> 界面外观主题（共 {THEME_OPTIONS.length} 套风格）
        </h3>
        <div className="theme-cards">
          {THEME_OPTIONS.map((t) => {
            const active = app.theme === t.id
            const isDark = t.id === 'dark'
            const isPinkCat = t.id === 'pinkcat'
            const cardSurface = isDark ? '#131c2e' : t.id === 'eyecare' ? '#f2f7f1' : '#ffffff'
            const stroke =
              t.id === 'cartoon'
                ? '1.5px solid #1e293b'
                : isPinkCat
                  ? '1.5px solid #f08cb6'
                  : isDark
                    ? '1px solid rgba(148,163,184,0.22)'
                    : '1px solid rgba(15,23,42,0.1)'
            return (
              <button
                key={t.id}
                type="button"
                className={`theme-card ${active ? 'active' : ''}`}
                onClick={() => app.setTheme(t.id)}
              >
                <div
                  className="theme-mini-preview"
                  style={{ background: t.colors[0], border: stroke }}
                  aria-hidden="true"
                >
                  <div
                    className="theme-mini-side"
                    style={{ background: t.colors[1], opacity: isDark || isPinkCat ? 0.95 : 0.35 }}
                  />
                  <div className="theme-mini-body">
                    <div
                      className="theme-mini-card"
                      style={{
                        background: cardSurface,
                        border:
                          t.id === 'cartoon'
                            ? '1.5px solid #1e293b'
                            : isPinkCat
                              ? '1.5px solid #f5a9c9'
                              : undefined
                      }}
                    >
                      {isPinkCat ? (
                        <img className="theme-mini-cat" src={pinkCatAvatar} alt="" />
                      ) : (
                        <span className="theme-mini-pill" style={{ background: t.colors[2] }} />
                      )}
                      <span
                        className="theme-mini-line"
                        style={{
                          background: isDark
                            ? 'rgba(226,232,240,0.45)'
                            : isPinkCat
                              ? 'rgba(240,78,136,0.32)'
                              : 'rgba(15,23,42,0.22)'
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="theme-card-head" style={{ marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 13.5 }}>{t.name}</span>
                    {active ? <Check size={13} color="var(--primary)" /> : null}
                  </div>
                  <span className={`tag ${active ? 'primary' : ''}`}>{t.badge}</span>
                </div>
                <div className="muted" style={{ lineHeight: 1.45 }}>
                  {t.desc}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h3>
          <SlidersHorizontal size={15} color="var(--primary)" /> 常规与提醒参数
        </h3>
        {window.rian ? (
          <div className="switch">
            <div>
              <b>开机自动启动</b>
              <div className="muted">登录系统后自动驻留系统托盘守护提醒计划。</div>
            </div>
            <button
              className={`toggle ${s.startWithSystem ? 'on' : ''}`}
              onClick={() =>
                app.patch((st) => ({
                  ...st,
                  settings: { ...st.settings, startWithSystem: !st.settings.startWithSystem }
                }))
              }
            />
          </div>
        ) : null}
        <div className="switch">
          <div>
            <b>通知提示音</b>
            <div className="muted">控制事项提醒与专注计时结束时的声音提示。</div>
          </div>
          <button
            className={`toggle ${s.sound ? 'on' : ''}`}
            onClick={() =>
              app.patch((st) => ({
                ...st,
                settings: { ...st.settings, sound: !st.settings.sound }
              }))
            }
          />
        </div>
        <div className="switch">
          <div>
            <b>通知通道自检</b>
            <div className="muted">立即发送一条测试通知，验证系统弹窗与提示音状态。</div>
          </div>
          <button className="btn ghost small" onClick={() => app.testNotify()}>
            <BellRing size={13} />
            发送测试通知
          </button>
        </div>

        <div className="form-grid" style={{ marginTop: 14 }}>
          <div className="field">
            <label>默认工作开始时间</label>
            <input
              type="time"
              value={s.workStart}
              onChange={(e) =>
                app.patch((st) => ({
                  ...st,
                  settings: { ...st.settings, workStart: e.target.value || '09:00' }
                }))
              }
            />
          </div>
          <div className="field">
            <label>默认工作结束时间</label>
            <input
              type="time"
              value={s.workEnd}
              onChange={(e) =>
                app.patch((st) => ({
                  ...st,
                  settings: { ...st.settings, workEnd: e.target.value || '18:30' }
                }))
              }
            />
          </div>
          <div className="field">
            <label>默认番茄专注时长</label>
            <select
              value={s.focusMinutesDefault ?? 25}
              onChange={(e) =>
                app.patch((st) => ({
                  ...st,
                  settings: { ...st.settings, focusMinutesDefault: Number(e.target.value) || 25 }
                }))
              }
            >
              <option value={15}>15 分钟（短冲刺）</option>
              <option value={25}>25 分钟（标准番茄钟）</option>
              <option value={35}>35 分钟（进阶专注）</option>
              <option value={45}>45 分钟（深度工作）</option>
              <option value={60}>60 分钟（长时段沉浸）</option>
            </select>
          </div>
          <div className="field">
            <label>默认部门（Excel 台账署名）</label>
            <input
              value={s.department ?? ''}
              placeholder="例如：研发部 / 财务部"
              onChange={(e) =>
                app.patch((st) => ({
                  ...st,
                  settings: { ...st.settings, department: e.target.value }
                }))
              }
            />
          </div>
          <div className="field">
            <label>默认责任人（Excel 台账署名）</label>
            <input
              value={s.owner ?? ''}
              placeholder="例如：张三"
              onChange={(e) =>
                app.patch((st) => ({
                  ...st,
                  settings: { ...st.settings, owner: e.target.value }
                }))
              }
            />
          </div>
        </div>
      </div>

      <div className="grid-2-equal">
        <div className="card">
          <h3>
            <Keyboard size={15} color="var(--primary)" /> 全局键盘快捷键
          </h3>
          <div className="switch">
            <span className="muted">呼出全局搜索、命令与一句话建任务</span>
            <span>
              <kbd className="kbd">Ctrl</kbd> + <kbd className="kbd">K</kbd>
            </span>
          </div>
          <div className="switch">
            <span className="muted">聚焦一句话快速新建框</span>
            <kbd className="kbd">N</kbd>
          </div>
          <div className="switch">
            <span className="muted">输入框内直接创建 / 展开详细配置</span>
            <span>
              <kbd className="kbd">Enter</kbd> / <kbd className="kbd">Ctrl+Enter</kbd>
            </span>
          </div>
          <div className="switch">
            <span className="muted">快速切换六大功能页</span>
            <span>
              <kbd className="kbd">Alt</kbd> + <kbd className="kbd">1 ~ 6</kbd>
            </span>
          </div>
          <div className="switch">
            <span className="muted">关闭弹窗或忽略当前强提醒</span>
            <kbd className="kbd">Esc</kbd>
          </div>
        </div>

        <div className="card">
          <h3>
            <Database size={15} color="var(--forest)" /> 本地数据备份与迁移
          </h3>
          <p className="muted" style={{ marginTop: 0, lineHeight: 1.6 }}>
            所有数据均安全保存在本地（当前含 {app.state.workItems.length} 项任务、{app.state.reports.length} 份周月报、累计专注 {app.stats.totalFocusMinutes} 分钟）。跨设备迁移或清理浏览器前建议导出备份。
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
            <button className="btn small" onClick={handleExport}>
              <Download size={13} />
              导出 JSON 备份
            </button>
            <button className="btn ghost small" onClick={() => fileRef.current?.click()}>
              <Upload size={13} />
              导入 JSON 恢复
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={(e) => void handleImportFile(e.target.files?.[0])}
            />
          </div>
          {backupMsg ? <div className={`status-msg ${backupMsg.ok ? 'ok' : 'err'}`}>{backupMsg.text}</div> : null}
        </div>
      </div>
    </>
  )
}
