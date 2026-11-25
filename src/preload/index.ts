import { contextBridge, ipcRenderer } from 'electron'
import type { AppState, NotifyEvent, RianApi } from '../shared/types'

const api: RianApi = {
  getState: () => ipcRenderer.invoke('rian:get'),
  setState: (state) => ipcRenderer.invoke('rian:set', state),
  notify: (event) => ipcRenderer.invoke('rian:notify', event),
  onEvent: (cb) => {
    const listener = (_e: unknown, payload: { state: AppState; events: NotifyEvent[] }): void => cb(payload)
    ipcRenderer.on('rian:event', listener)
    return () => ipcRenderer.removeListener('rian:event', listener)
  },
  onReminder: (cb) => {
    const listener = (_e: unknown, ev: NotifyEvent): void => cb(ev)
    ipcRenderer.on('rian:reminder', listener)
    return () => ipcRenderer.removeListener('rian:reminder', listener)
  },
  dismissReminder: () => ipcRenderer.send('rian:reminder-dismiss'),
  snoozeReminder: (workId, minutes) => ipcRenderer.send('rian:reminder-snooze', workId, minutes),
  completeReminder: (workId) => ipcRenderer.send('rian:reminder-complete', workId)
}

contextBridge.exposeInMainWorld('rian', api)
