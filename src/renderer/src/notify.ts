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
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return
  audioCtx = audioCtx ?? new Ctor()
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume()
  }
}

function playTone(freq: number, startOffset: number, duration: number, gainVal = 0.06): void {
  if (!audioCtx) return
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  const t0 = audioCtx.currentTime + startOffset
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, t0)
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(gainVal, t0 + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(gain)
  gain.connect(audioCtx.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}

function beep(): void {
  unlockNotifySound()
  playTone(880, 0, 0.18, 0.06)
}

export function playFocusChime(enabled = true): void {
  if (!enabled) return
  unlockNotifySound()
  playTone(587.33, 0, 0.18, 0.07)
  playTone(880, 0.16, 0.28, 0.07)
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

export async function showSystemNotify(ev: NotifyEvent, soundEnabled = true): Promise<void> {
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
    silent: !soundEnabled,
    requireInteraction: ev.source === 'work'
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
    if (soundEnabled) beep()
    flashTitle(ev.title)
  }
}
