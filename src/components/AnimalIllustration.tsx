import { useEffect, useRef, useState } from 'react'

// Only a handful of animals have hand-drawn frame sequences bundled so far —
// mirrors AnimalDrawingView.isAvailable(name:) in the iOS app, which checks
// for a `<name>_durations.json` file rather than hardcoding a list, but the
// web bundle only ships the same one animal today.
const AVAILABLE = new Set(['elephant'])

export function AnimalIllustration({ animalName }: { animalName: string }) {
  const resourceName = animalName.toLowerCase().replace(/ /g, '_')
  const available = AVAILABLE.has(resourceName)
  const [frameSrc, setFrameSrc] = useState<string | null>(null)
  const frameIndexRef = useRef(0)

  useEffect(() => {
    if (!available) return
    let cancelled = false
    let timeoutId: number | undefined

    async function play() {
      const base = import.meta.env.BASE_URL
      const res = await fetch(`${base}animals/${resourceName}_durations.json`)
      const durations: number[] = await res.json()
      if (cancelled || durations.length === 0) return

      const frameUrl = (i: number) => `${base}animals/${resourceName}_frame_${String(i).padStart(3, '0')}.png`
      frameIndexRef.current = 0

      const step = () => {
        if (cancelled) return
        setFrameSrc(frameUrl(frameIndexRef.current))
        const duration = durations[frameIndexRef.current] * 1000
        frameIndexRef.current = (frameIndexRef.current + 1) % durations.length
        timeoutId = window.setTimeout(step, duration)
      }
      step()
    }

    play()
    return () => {
      cancelled = true
      if (timeoutId) window.clearTimeout(timeoutId)
    }
  }, [available, resourceName])

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minHeight: 160,
        borderRadius: 16,
        background: 'var(--fb-surface)',
        border: '1px solid var(--fb-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {available && frameSrc ? (
        <img src={frameSrc} alt={animalName} style={{ maxWidth: '100%', maxHeight: '100%', padding: 16 }} />
      ) : (
        <span style={{ fontSize: 34, color: 'var(--fb-text-4)', opacity: 0.5 }}>🐾</span>
      )}
    </div>
  )
}
