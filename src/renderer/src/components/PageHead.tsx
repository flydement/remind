import { greeting } from '@shared/time'

export default function PageHead({
  title,
  sub,
  now
}: {
  title?: string
  sub: string
  now?: Date
}) {
  return (
    <div className="topbar">
      <div>
        <h2>{title ?? greeting(now)}</h2>
        <p className="sub">{sub}</p>
      </div>
    </div>
  )
}
