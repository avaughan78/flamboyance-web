// A lightweight CSS-only confetti burst — plain divs falling via a CSS
// animation rather than JS-driven positions, mirroring ConfettiView.swift's
// one-shot celebration on the native app's equivalent screen.
export function ConfettiBurst() {
  const palette = ['var(--fb-accent)', 'var(--fb-accent-bright)', 'var(--fb-success-bright)', '#ffd45a']
  const pieces = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    color: palette[Math.floor(Math.random() * palette.length)],
    delay: Math.random() * 0.5,
    duration: 1.8 + Math.random() * 1.1,
    drift: Math.random() * 120 - 60,
    rotate: Math.random() * 540 - 270,
    width: 6 + Math.random() * 4,
    height: 8 + Math.random() * 6,
  }))
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {pieces.map((p) => (
        <div
          key={p.id}
          style={
            {
              position: 'absolute',
              top: -20,
              left: `${p.left}%`,
              width: p.width,
              height: p.height,
              background: p.color,
              animation: `fb-confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
              '--fb-confetti-drift': `${p.drift}px`,
              '--fb-confetti-rotate': `${p.rotate}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}
