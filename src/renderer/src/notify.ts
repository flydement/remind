import type { NotifyEvent } from '@shared/types'

const TITLE = '小猫工作助手'
let audioCtx: AudioContext | null = null
let titleTimer = 0

export async function registerNotifyWorker(): Promise<void> {
  if (window.rian) return
  if (!('serviceWorker' in navigator)) return
  try {
    await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
    await navigator.serviceWorker.ready
  } catch {
    // file:// or unsupported
  }
}

export function unlockNotifySound(): void {
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return
  audioCtx = audioCtx ?? new Ctor()
  void audioCtx.resume()
}

function beep(): void {
  if (!audioCtx) return
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.type = 'sine'
  osc.frequency.value = 880
  gain.gain.value = 0.06
  osc.connect(gain)
  gain.connect(audioCtx.destination)
  osc.start()
  osc.stop(audioCtx.currentTime + 0.2)
}

function flashTitle(text: string): void {
  window.clearInterval(titleTimer)
  if (!document.hidden) {
    document.title = TITLE
    return
  }
  let on = true
  document.title = `【提醒】${text}`
  titleTimer = window.setInterval(() => {
    if (!document.hidden) {
      window.clearInterval(titleTimer)
      document.title = TITLE
      return
    }
    document.title = on ? `【提醒】${text}` : TITLE
    on = !on
  }, 900)
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    window.clearInterval(titleTimer)
    document.title = TITLE
  }
})

export async function showSystemNotify(ev: NotifyEvent): Promise<void> {
  if (window.rian) {
    await window.rian.notify(ev)
    return
  }
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

  const icon = `${import.meta.env.BASE_URL}icon.png`
  const options: NotificationOptions = {
    body: ev.body,
    tag: ev.source,
    icon,
    silent: false,
    requireInteraction: true
  }

  try {
    const reg = await navigator.serviceWorker?.ready
    if (reg) await reg.showNotification(ev.title, options)
    else new Notification(ev.title, options)
  } catch {
    try {
      new Notification(ev.title, options)
    } catch {
      // ignore
    }
  }

  if (document.hidden) {
    beep()
    flashTitle(ev.title)
  }
}
