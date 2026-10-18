/** Tile shades are semantic tokens; charts and table use the same group hue. */
export function spendingTileStyle(groupColor: string, index: number) {
  const name = groupColor.match(/--(spend-[a-z-]+)/)?.[1];
  const shade = Math.min(index + 1, 3);
  const darkText = index === 0 && name && ['spend-bills', 'spend-other', 'spend-food', 'spend-dining', 'spend-grocery'].includes(name);
  return {
    backgroundColor: name ? `var(--${name}-shade-${shade}, ${groupColor})` : groupColor,
    color: darkText ? 'var(--tile-ink)' : 'var(--on-brand)',
  };
}
