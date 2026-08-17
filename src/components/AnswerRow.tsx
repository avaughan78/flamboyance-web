export type AnswerRowState = 'idle' | 'selected'

export function answerRowState(option: string, selected: string | null): AnswerRowState {
  return option === selected ? 'selected' : 'idle'
}

/** The heavier, filled row used in Party rounds — "the heavier target suits
 * a room of people racing." Selection is the only state a row itself knows
 * about; correctness is revealed on the separate Reveal screen. */
export function AnswerRow({
  text,
  state,
  onClick,
}: {
  text: string
  state: AnswerRowState
  onClick: () => void
}) {
  const selected = state === 'selected'
  return (
    <button
      onClick={onClick}
      disabled={selected}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        width: '100%',
        minHeight: 54,
        padding: '0 16px',
        borderRadius: 12,
        background: selected ? 'var(--fb-tint-row-bg)' : 'var(--fb-surface)',
        border: `1px solid ${selected ? 'var(--fb-tint-row-border)' : 'var(--fb-border)'}`,
        transition: 'opacity .3s ease',
      }}
    >
      <span
        style={{
          fontSize: 16,
          fontWeight: 500,
          color: selected ? 'var(--fb-accent-text)' : 'var(--fb-text)',
          textAlign: 'left',
        }}
      >
        {text}
      </span>
      {selected && <span style={{ color: 'var(--fb-accent-text)', fontSize: 16 }}>●</span>}
    </button>
  )
}
