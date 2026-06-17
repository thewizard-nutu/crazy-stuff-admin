// Regenerate lib/catalog.ts from the game repo's item catalog.
// Run: npm run sync-catalog   (from the admin repo root)
//
// Assumes the game repo `crazy-stuff` is a sibling folder (../../crazy-stuff).
// If your layout differs, adjust GAME_ITEMS_PATH below. The generated
// lib/catalog.ts is what the dashboard actually reads — this just refreshes it.
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// items.ts is self-contained (no external imports), so tsx can import it directly.
import { ITEMS } from '../../crazy-stuff/src/shared/items';

const here = dirname(fileURLToPath(import.meta.url));

const items = Object.values(ITEMS)
  .map((i) => ({ id: i.id, displayName: i.displayName, slot: i.slot, rarity: i.rarity }))
  .sort((a, b) => a.slot.localeCompare(b.slot) || a.displayName.localeCompare(b.displayName));

const rows = items
  .map(
    (i) =>
      `  { id: ${JSON.stringify(i.id)}, displayName: ${JSON.stringify(i.displayName)}, slot: ${JSON.stringify(i.slot)}, rarity: ${JSON.stringify(i.rarity)} },`
  )
  .join('\n');

const out = `// Game item catalog for the admin item picker. GENERATED from the game repo's
// src/shared/items.ts by scripts/sync-catalog.ts — do not edit by hand.
// Re-run \`npm run sync-catalog\` after adding new game items.

export interface CatalogItem {
  id: string;
  displayName: string;
  slot: string;
  rarity: string;
}

export const CATALOG: CatalogItem[] = [
${rows}
];

export const CATALOG_BY_ID: Record<string, CatalogItem> = Object.fromEntries(
  CATALOG.map((i) => [i.id, i])
);

/** Items grouped by slot, for <optgroup> rendering in the picker. */
export const CATALOG_BY_SLOT: Record<string, CatalogItem[]> = CATALOG.reduce(
  (acc, i) => {
    (acc[i.slot] ??= []).push(i);
    return acc;
  },
  {} as Record<string, CatalogItem[]>
);
`;

writeFileSync(resolve(here, '../lib/catalog.ts'), out);
console.log(`[sync-catalog] wrote ${items.length} items to lib/catalog.ts`);
