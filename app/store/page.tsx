import { requireAuth } from '@/lib/auth';
import { getDB } from '@/lib/db';
import { CATALOG_BY_SLOT, CATALOG_BY_ID } from '@/lib/catalog';
import { saveStoreRotationForm } from '@/app/actions';

// Coin prices by rarity — mirrors src/shared/store.ts (game is authoritative).
const STORE_PRICES: Record<string, number> = {
  common: 500, uncommon: 1500, rare: 4000, epic: 10000, legendary: 25000, crazy: 50000,
};
const SLOTS = 5;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function seasonIdOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function seasonLabel(id: string): string {
  const [y, m] = id.split('-');
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

async function getRotation(seasonId: string): Promise<string[]> {
  const db = await getDB();
  const doc = await db.collection('store_rotation').findOne({ seasonId });
  return (doc?.itemIds as string[]) ?? [];
}

export default async function StorePage() {
  await requireAuth();

  const now = new Date();
  const current = seasonIdOf(now);
  const next = seasonIdOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)));
  const [currentItems, nextItems] = await Promise.all([getRotation(current), getRotation(next)]);

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-yellow-400 mb-2">Coin Shop Rotation</h1>
      <p className="text-gray-400 text-sm mb-8">
        Pick up to {SLOTS} cosmetics for each month&apos;s coin shop. Players buy them with Crazy
        Coins — the price is set automatically by rarity (Common 500 → Crazy 50,000). Only items
        with finished art appear in the picker.
      </p>

      <MonthForm seasonId={current} selected={currentItems} live />
      <MonthForm seasonId={next} selected={nextItems} />
    </div>
  );
}

function MonthForm({
  seasonId,
  selected,
  live = false,
}: {
  seasonId: string;
  selected: string[];
  live?: boolean;
}) {
  return (
    <form
      action={saveStoreRotationForm}
      className="bg-gray-900 border border-gray-700 rounded-lg p-6 mb-6"
    >
      <input type="hidden" name="seasonId" value={seasonId} />
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-100">
          {seasonLabel(seasonId)}
          {live && (
            <span className="ml-2 text-xs bg-green-700 text-green-100 px-2 py-0.5 rounded">
              live now
            </span>
          )}
        </h2>
        <span className="text-xs text-gray-500">{seasonId}</span>
      </div>

      <div className="flex flex-col gap-3">
        {Array.from({ length: SLOTS }, (_, i) => {
          const sel = selected[i] ?? '';
          const price = sel && CATALOG_BY_ID[sel] ? STORE_PRICES[CATALOG_BY_ID[sel].rarity] : null;
          return (
            <div key={i} className="flex items-center gap-3">
              <span className="text-gray-500 text-sm w-6">{i + 1}.</span>
              <select
                name={`slot${i}`}
                defaultValue={sel}
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">— empty —</option>
                {Object.entries(CATALOG_BY_SLOT).map(([slot, items]) => (
                  <optgroup key={slot} label={slot.replace(/_/g, ' ')}>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.displayName} — {it.rarity} ({STORE_PRICES[it.rarity] ?? '?'})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <span className="text-yellow-400 text-xs w-16 text-right">
                {price !== null ? `💰 ${price}` : ''}
              </span>
            </div>
          );
        })}
      </div>

      <button
        type="submit"
        className="mt-5 bg-blue-600 hover:bg-blue-500 text-white font-medium px-5 py-2 rounded transition-colors text-sm"
      >
        Save {seasonLabel(seasonId)}
      </button>
    </form>
  );
}
