export type AnswerRowState = 'idle' | 'selected' | 'correct' | 'incorrect' | 'fadedOut'

export function answerRowState(
  option: string,
  selected: string | null,
  correctText: string | null,
  revealed: boolean
): AnswerRowState {
  if (!selected) return 'idle'
  if (!revealed || !correctText) return option === selected ? 'selected' : 'fadedOut'
  if (option === correctText) return 'correct'
  if (option === selected) return 'incorrect'
  return 'fadedOut'
}

const ACCENTS = ['var(--fb-coral)', 'var(--fb-teal)', 'var(--fb-gold)', 'var(--fb-violet)']
const SOFTS = ['var(--fb-coral-soft)', 'var(--fb-teal-soft)', 'var(--fb-gold-soft)', 'var(--fb-violet-soft)']

export function AnswerRow({
  text,
  index,
  state,
  onClick,
}: {
  text: string
  index: number
  state: AnswerRowState
  onClick: () => void
}) {
  const accent = ACCENTS[index % ACCENTS.length]
  const soft = SOFTS[index % SOFTS.length]
  const effectiveColor = state === 'correct' ? 'var(--fb-correct)' : state === 'incorrect' ? 'var(--fb-incorrect)' : accent
  const background = state === 'correct' ? 'var(--fb-correct-soft)' : state === 'incorrect' ? 'var(--fb-incorrect-soft)' : soft

  return (
    <button
      onClick={onClick}
      disabled={state !== 'idle'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        minHeight: 54,
        padding: '0 14px',
        borderRadius: 14,
        background,
        opacity: state === 'fadedOut' ? 0.4 : 1,
        outline: state === 'selected' ? `2px solid ${accent}` : 'none',
        outlineOffset: -2,
        transition: 'opacity .3s ease',
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          minWidth: 28,
          borderRadius: '50%',
          background: effectiveColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 700,
          color: '#000',
        }}
      >
        {String(index + 1).padStart(2, '0')}
      </span>
      <span
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: effectiveColor,
          textAlign: 'left',
          flex: 1,
        }}
      >
        {text}
      </span>
      {state === 'correct' && <span style={{ color: 'var(--fb-correct)', fontWeight: 700 }}>✓</span>}
      {state === 'incorrect' && <span style={{ color: 'var(--fb-incorrect)', fontWeight: 700 }}>✕</span>}
    </button>
  )
}
