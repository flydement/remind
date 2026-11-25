import type { ReactNode } from 'react'
import { greeting } from '@shared/time'

export default function PageHead({
  title,
  sub,
  now,
  right
}: {
  title?: string
  sub: string
  now?: Date
  right?: ReactNode
}) {
  return (
    <div className="topbar">
      <div>
        <h2>{title ?? greeting(now)}</h2>
        <p className="sub">{sub}</p>
      </div>
      {right ? <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{right}</div> : null}
    </div>
  )
}
