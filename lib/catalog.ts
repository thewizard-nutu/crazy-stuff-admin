// Game item catalog for the admin item picker. GENERATED from the game repo's
// src/shared/items.ts by scripts/sync-catalog.ts — do not edit by hand.
// Re-run `npm run sync-catalog` after adding new game items.

export interface CatalogItem {
  id: string;
  displayName: string;
  slot: string;
  rarity: string;
}

export const CATALOG: CatalogItem[] = [
  { id: 'beatup_sneakers', displayName: 'Beat-up Sneakers', slot: 'feet', rarity: 'common' },
  { id: 'sneakers_black', displayName: 'Black Sneakers', slot: 'feet', rarity: 'common' },
  { id: 'sneakers_blue', displayName: 'Blue Sneakers', slot: 'feet', rarity: 'common' },
  { id: 'sneakers_green', displayName: 'Green Sneakers', slot: 'feet', rarity: 'common' },
  { id: 'sneakers_pink', displayName: 'Pink Sneakers', slot: 'feet', rarity: 'common' },
  { id: 'sneakers_red', displayName: 'Red Sneakers', slot: 'feet', rarity: 'common' },
  { id: 'sneakers_yellow', displayName: 'Yellow Sneakers', slot: 'feet', rarity: 'common' },
  { id: 'wizard_hat', displayName: 'Wizard Hat', slot: 'head_accessory', rarity: 'rare' },
  { id: 'blue_jeans', displayName: 'Blue Jeans', slot: 'lower_body', rarity: 'common' },
  { id: 'jeans_black', displayName: 'Black Jeans', slot: 'lower_body', rarity: 'common' },
  { id: 'jeans_brown', displayName: 'Brown Jeans', slot: 'lower_body', rarity: 'common' },
  { id: 'jeans_green', displayName: 'Green Jeans', slot: 'lower_body', rarity: 'common' },
  { id: 'jeans_grey', displayName: 'Grey Jeans', slot: 'lower_body', rarity: 'common' },
  { id: 'jeans_khaki', displayName: 'Khaki Jeans', slot: 'lower_body', rarity: 'common' },
  { id: 'jeans_red', displayName: 'Red Jeans', slot: 'lower_body', rarity: 'common' },
  { id: 'worn_tshirt', displayName: 'Worn T-shirt', slot: 'upper_body', rarity: 'common' },
  { id: 'tshirt_black', displayName: 'Black T-shirt', slot: 'upper_body', rarity: 'common' },
  { id: 'tshirt_blue', displayName: 'Blue T-shirt', slot: 'upper_body', rarity: 'common' },
  { id: 'tshirt_brown', displayName: 'Brown T-shirt', slot: 'upper_body', rarity: 'common' },
  { id: 'tshirt_green', displayName: 'Green T-shirt', slot: 'upper_body', rarity: 'common' },
  { id: 'tshirt_pink', displayName: 'Pink T-shirt', slot: 'upper_body', rarity: 'common' },
  { id: 'tshirt_purple', displayName: 'Purple T-shirt', slot: 'upper_body', rarity: 'common' },
  { id: 'tshirt_red', displayName: 'Red T-shirt', slot: 'upper_body', rarity: 'common' },
  { id: 'tshirt_stripes', displayName: 'Striped T-shirt', slot: 'upper_body', rarity: 'common' },
  { id: 'tshirt_white', displayName: 'White T-shirt', slot: 'upper_body', rarity: 'common' },
  { id: 'tshirt_yellow', displayName: 'Yellow T-shirt', slot: 'upper_body', rarity: 'common' },
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
