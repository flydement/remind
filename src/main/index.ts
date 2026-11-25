import { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage, shell, screen } from 'electron'
import { join, dirname } from 'node:path'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { EMPTY_STATE, normalizePriority, type AppState, type NotifyEvent } from '../shared/types'
import { seedHealth, seedQuotes } from '../shared/defaults'
import { completeWorkItem, rolloverRepeats, snoozeWorkItem, tickScheduler } from '../shared/scheduler'

app.setName('小猫工作助手')
app.setAppUserModelId('com.rian.remind')

const gotSingleInstanceLock = app.requestSingleInstanceLock()

let win: BrowserWindow | null = null
let tray: Tray | null = null
let persistTimer: NodeJS.Timeout | null = null
let reminderWin: BrowserWindow | null = null
let reminderQueue: NotifyEvent[] = []
let reminderReady = false
let isQuitting = false

function dataFile(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const file = join(dir, 'rian-state.json')
  if (!existsSync(file)) {
    const legacy = join(dirname(dir), '日安', 'rian-state.json')
    if (existsSync(legacy)) {
      try {
        writeFileSync(file, readFileSync(legacy), 'utf-8')
      } catch {
        // 旧版本迁移失败时忽略，走空状态
      }
    }
  }
  return file
}

function loadState(): AppState {
  try {
    const raw = readFileSync(dataFile(), 'utf-8')
    const parsed = JSON.parse(raw) as AppState
    return {
      ...EMPTY_STATE,
      ...parsed,
      workItems: (parsed.workItems ?? []).map((w) => ({
        ...w,
        priority: normalizePriority(w.priority)
      })),
      quotes: parsed.quotes?.length ? parsed.quotes : seedQuotes(),
      health: parsed.health?.length ? parsed.health : seedHealth(),
      quoteSettings: { ...EMPTY_STATE.quoteSettings, ...parsed.quoteSettings },
      settings: { ...EMPTY_STATE.settings, ...parsed.settings },
      reports: parsed.reports ?? [],
      inbox: parsed.inbox ?? [],
      focusStats: { ...EMPTY_STATE.focusStats!, ...(parsed.focusStats ?? {}) }
    }
  } catch {
    return {
      ...EMPTY_STATE,
      quotes: seedQuotes(),
      health: seedHealth()
    }
  }
}

let state: AppState = EMPTY_STATE

function saveState(next: AppState): void {
  state = next
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  const target = dataFile()
  const tmp = `${target}.tmp`
  const payload = JSON.stringify(state, null, 2)
  try {
    writeFileSync(tmp, payload, 'utf-8')
    renameSync(tmp, target)
  } catch {
    writeFileSync(target, payload, 'utf-8')
  }
}

function scheduleSave(next: AppState): void {
  state = next
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => saveState(state), 200)
}

function flushSave(): void {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
    saveState(state)
  }
}

function resourceFile(name: string): string {
  if (app.isPackaged) return join(process.resourcesPath, name)
  return join(app.getAppPath(), 'resources', name)
}

function iconImage(): Electron.NativeImage {
  const png = resourceFile('icon.png')
  if (existsSync(png)) return nativeImage.createFromPath(png)
  return nativeImage.createEmpty()
}

function showMainWindow(): void {
  if (!win || win.isDestroyed()) {
    createWindow()
    return
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    title: '小猫工作助手',
    icon: iconImage(),
    backgroundColor: state.settings.theme === 'dark' ? '#0B1120' : state.settings.theme === 'paper' ? '#F6F0E6' : '#F4F6F9',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      contextIsolation: true
    }
  })

  win.on('ready-to-show', () => win?.show())
  win.on('close', (e) => {
    if (!isQuitting && process.platform !== 'darwin') {
      e.preventDefault()
      win?.hide()
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(rendererHtml())
  }
}

function preloadPath(): string {
  const packed = join(__dirname, 'preload.cjs')
  if (existsSync(packed)) return packed
  return join(__dirname, '../preload/index.js')
}

function rendererHtml(): string {
  const packed = join(__dirname, 'renderer/index.html')
  if (existsSync(packed)) return packed
  return join(__dirname, '../renderer/index.html')
}

function createReminderWin(): void {
  reminderWin = new BrowserWindow({
    width: 400,
    height: 244,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      contextIsolation: true
    }
  })
  reminderReady = false
  reminderWin.webContents.once('did-finish-load', () => {
    reminderReady = true
    showNextReminder()
  })
  reminderWin.on('closed', () => {
    reminderWin = null
    reminderReady = false
  })
  reminderWin.loadFile(resourceFile('reminder.html'))
}

function showNextReminder(): void {
  if (!reminderQueue.length) {
    reminderWin?.hide()
    return
  }
  if (!reminderWin || reminderWin.isDestroyed()) {
    createReminderWin()
    return
  }
  if (!reminderReady) return
  const ev = reminderQueue[0]
  reminderWin.webContents.send('rian:reminder', ev)
  const { workArea } = screen.getPrimaryDisplay()
  const [w, h] = reminderWin.getSize()
  reminderWin.setPosition(workArea.x + workArea.width - w - 20, workArea.y + workArea.height - h - 20)
  reminderWin.showInactive()
}

function enqueueReminder(ev: NotifyEvent): void {
  if (ev.workId) {
    const idx = reminderQueue.findIndex((item) => item.workId === ev.workId)
    if (idx >= 0) {
      reminderQueue[idx] = ev
      if (idx === 0) showNextReminder()
      return
    }
  }
  reminderQueue.push(ev)
  showNextReminder()
}

function dismissCurrentReminder(): void {
  reminderQueue.shift()
  reminderWin?.hide()
  showNextReminder()
}

function createTray(): void {
  const image = iconImage()
  tray = new Tray(image.isEmpty() ? nativeImage.createFromDataURL(trayFallback()) : image)
  tray.setToolTip('小猫工作助手')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开小猫工作助手', click: () => showMainWindow() },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          isQuitting = true
          flushSave()
          app.quit()
        }
      }
    ])
  )
  tray.on('click', () => {
    if (!win || win.isDestroyed()) {
      showMainWindow()
      return
    }
    if (win.isVisible()) win.hide()
    else showMainWindow()
  })
}

function trayFallback(): string {
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAABGUlEQVRYhe2WMQ6DMAxF/yMrd+gBOEJvgHTgAB07cADuwA3o0AN0zMhI3YAjsHdkQK1oSQlJQqDylS3H/vZzYgMQkeacF0RkQ0Q2zvl9rXUmpdxqrfdaq7uU8r4kN4DJzGRmM/vM/F5r/Qsh3J1zG2beANhU4A2A1cxsZvaZ+V0I8Qwh3J1zmwrgm5m3zLz9q8AEM1+YeT+l8D8q8ANgX2u9q7X+fAn8qMBPKeV2aV5KqZ1z7t5aPwG8ADha6w8zH5n5vYTwbK0/S4XNzPdS4TPzQQhxL6W8ADiVUh6llGdr/QRwa60/S4XNzPdS4TPzQQhxB3AupTyXUp6t9RPA7b9f4DcA3gC8W+sPMx+Z+b2E8GytP0uFzcx3AJfW+vN/A34B2y1kQbS8Z3QAAAAASUVORK5CYII='
}

function showNative(ev: NotifyEvent): void {
  let shown = false
  try {
    if (Notification.isSupported()) {
      const n = new Notification({
        title: ev.title,
        body: ev.body,
        silent: !state.settings.sound
      })
      n.on('click', () => showMainWindow())
      n.show()
      shown = true
    }
  } catch {
    // Windows portable builds often fail toast without a Start Menu shortcut.
  }
  if (!shown && process.platform === 'win32') {
    tray?.displayBalloon({
      title: ev.title,
      content: ev.body,
      iconType: 'info'
    })
  }
  if (win && !win.isDestroyed() && !win.isFocused()) {
    win.flashFrame(true)
    if (process.platform === 'darwin') app.dock?.bounce('critical')
  }
}

function ensureWinShortcut(): void {
  if (process.platform !== 'win32') return
  const shortcut = join(
    app.getPath('appData'),
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    '小猫工作助手.lnk'
  )
  shell.writeShortcutLink(shortcut, {
    target: process.execPath,
    cwd: dirname(process.execPath),
    appUserModelId: 'com.rian.remind',
    description: '小猫工作助手'
  })
}

function applyLoginItem(): void {
  app.setLoginItemSettings({ openAtLogin: state.settings.startWithSystem })
}

function syncToRenderer(next: AppState, events: NotifyEvent[] = []): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send('rian:event', { state: next, events })
  }
}

function tick(): void {
  const rolled = rolloverRepeats(state)
  const { state: next, events } = tickScheduler(rolled)
  if (events.length) {
    scheduleSave(next)
    for (const ev of events) {
      if (ev.modal) {
        enqueueReminder(ev)
      } else {
        showNative(ev)
      }
    }
    syncToRenderer(next, events)
  } else if (next !== state) {
    scheduleSave(next)
    syncToRenderer(next, [])
  }
}

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showMainWindow()
  })

  app.on('before-quit', () => {
    isQuitting = true
    flushSave()
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.rian.remind')
    ensureWinShortcut()
    state = loadState()
    applyLoginItem()
    createWindow()
    createTray()
    setInterval(tick, 20_000)
    setTimeout(tick, 1500)

    ipcMain.handle('rian:get', () => state)
    ipcMain.handle('rian:set', (_e, next: AppState) => {
      saveState(next)
      applyLoginItem()
      return state
    })
    ipcMain.handle('rian:notify', (_e, ev: NotifyEvent) => {
      showNative(ev)
      return true
    })
    ipcMain.on('rian:reminder-dismiss', () => {
      dismissCurrentReminder()
    })
    ipcMain.on('rian:reminder-snooze', (_e, workId: string, minutes: number) => {
      const next = snoozeWorkItem(state, workId, minutes)
      if (next !== state) {
        saveState(next)
        syncToRenderer(next, [])
      }
      dismissCurrentReminder()
    })
    ipcMain.on('rian:reminder-complete', (_e, workId: string) => {
      const next = completeWorkItem(state, workId)
      if (next !== state) {
        saveState(next)
        syncToRenderer(next, [])
      }
      dismissCurrentReminder()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      // keep tray
    }
  })

  app.on('activate', () => {
    showMainWindow()
  })
}
