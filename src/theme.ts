/** Rose/blue accent swap for Community-pool screens — sets the
 * `data-community` attribute theme.css keys its accent-token overrides off
 * of. Mirrors ThemeManager.shared.isCommunity (native apps): call this as
 * early as possible in a pool-aware screen, before render, so there's no
 * visible flash of the wrong accent color. */
export function setCommunityTheme(enabled: boolean): void {
  if (enabled) {
    document.documentElement.setAttribute('data-community', 'true')
  } else {
    document.documentElement.removeAttribute('data-community')
  }
}
