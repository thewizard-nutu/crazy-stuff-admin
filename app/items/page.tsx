import { requireAuth } from '@/lib/auth';
import { getDB } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { giveItemToAll } from '@/app/actions';
import { CATALOG_BY_SLOT } from '@/lib/catalog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ItemRow {
  _id: string;
  playerId: string;
  playerUsername: string;
  itemType: string;
  itemId: string;
  rarity: string;
  equipped: boolean;
  obtainedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function getItems(
  search: string,
  groupBy: string
): Promise<ItemRow[]> {
  const db = await getDB();

  const filter: Record<string, unknown> = {};
  if (search) {
    filter.itemId = { $regex: search, $options: 'i' };
  }

  const items = await db
    .collection('inventory')
    .find(filter)
    .sort({ obtainedAt: -1 })
    .limit(1000)
    .toArray();

  if (items.length === 0) return [];

  // Join with players to get usernames
  const playerIds = [
    ...new Set(items.map((i) => String(i.playerId))),
  ].map((pid) => {
    try {
      return new ObjectId(pid);
    } catch {
      return null;
    }
  }).filter(Boolean) as ObjectId[];

  const players = await db
    .collection('players')
    .find({ _id: { $in: playerIds } }, { projection: { _id: 1, username: 1 } })
    .toArray();

  const playerMap = new Map(players.map((p) => [String(p._id), p.username]));

  const rows: ItemRow[] = items.map((item) => ({
    _id: String(item._id),
    playerId: String(item.playerId),
    playerUsername: playerMap.get(String(item.playerId)) ?? '(unknown)',
    itemType: item.itemType ?? '',
    itemId: item.itemId ?? '',
    rarity: item.rarity ?? '',
    equipped: !!item.equipped,
    obtainedAt: item.obtainedAt ?? null,
  }));

  if (groupBy === 'itemType') {
    rows.sort((a, b) => a.itemType.localeCompare(b.itemType));
  } else if (groupBy === 'rarity') {
    const order = ['crazy', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
    rows.sort(
      (a, b) =>
        order.indexOf(a.rarity) - order.indexOf(b.rarity)
    );
  }

  return rows;
}

async function getPlayerCount(): Promise<number> {
  const db = await getDB();
  return db.collection('players').countDocuments();
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; groupBy?: string; result?: string }>;
}) {
  await requireAuth();
  const params = await searchParams;
  const search = params.search ?? '';
  const groupBy = params.groupBy ?? 'none';
  const giveResult = params.result ?? '';

  const [items, playerCount] = await Promise.all([
    getItems(search, groupBy),
    getPlayerCount(),
  ]);

  async function handleGiveToAll(formData: FormData) {
    'use server';
    const itemId = formData.get('itemId') as string;
    if (!itemId) return;
    const { count } = await giveItemToAll(itemId);
    const { redirect } = await import('next/navigation');
    redirect(`/items?result=${count}`);
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-yellow-400">Items Browser</h1>
        <span className="text-gray-400 text-sm">
          {items.length} items &bull; {playerCount} players
        </span>
      </div>

      {/* Give to All */}
      <section className="bg-gray-900 border border-gray-700 rounded-lg p-5 mb-6">
        <h2 className="text-base font-semibold text-gray-200 mb-3">
          Give Item to ALL Players
        </h2>
        {giveResult && (
          <p className="text-green-400 text-sm mb-3">
            Item given to {giveResult} player(s).
          </p>
        )}
        <form action={handleGiveToAll} className="flex gap-2 flex-wrap items-end">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Item</label>
            <select name="itemId" required defaultValue="" className={selectCls + ' min-w-56'}>
              <option value="" disabled>
                Select item…
              </option>
              {Object.entries(CATALOG_BY_SLOT).map(([slot, items]) => (
                <optgroup key={slot} label={slot}>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.displayName} ({it.rarity})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="bg-purple-700 hover:bg-purple-600 text-white px-5 py-2 rounded transition-colors text-sm font-medium"
          >
            Give to All ({playerCount})
          </button>
        </form>
      </section>

      {/* Filters */}
      <form method="GET" className="mb-4 flex gap-2 flex-wrap">
        <input
          name="search"
          defaultValue={search}
          placeholder="Search by item ID..."
          className={inputCls + ' w-64'}
        />
        <select name="groupBy" defaultValue={groupBy} className={selectCls}>
          <option value="none">No grouping</option>
          <option value="itemType">Group by type</option>
          <option value="rarity">Group by rarity</option>
        </select>
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded transition-colors text-sm"
        >
          Apply
        </button>
        {(search || groupBy !== 'none') && (
          <a
            href="/items"
            className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-2 rounded transition-colors text-sm"
          >
            Reset
          </a>
        )}
      </form>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-700 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-800">
              <th className="text-left px-4 py-3 text-gray-400 font-medium">
                Type
              </th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">
                Item ID
              </th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">
                Rarity
              </th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">
                Equipped
              </th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">
                Owner
              </th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">
                Obtained
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="text-center py-8 text-gray-500"
                >
                  No items found
                </td>
              </tr>
            )}
            {items.map((item) => (
              <tr
                key={item._id}
                className="border-b border-gray-800 hover:bg-gray-800/40 transition-colors"
              >
                <td className="px-4 py-3 text-gray-300 text-xs font-mono">
                  {item.itemType}
                </td>
                <td className="px-4 py-3 text-gray-100 font-mono text-xs">
                  {item.itemId}
                </td>
                <td className="px-4 py-3">
                  <RarityBadge rarity={item.rarity} />
                </td>
                <td className="px-4 py-3">
                  {item.equipped ? (
                    <span className="text-xs text-green-400">Yes</span>
                  ) : (
                    <span className="text-xs text-gray-600">No</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <a
                    href={`/players/${item.playerId}`}
                    className="text-blue-400 hover:text-blue-300 text-xs"
                  >
                    {item.playerUsername}
                  </a>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {item.obtainedAt
                    ? new Date(item.obtainedAt).toLocaleDateString()
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  <a
                    href={`/players/${item.playerId}`}
                    className="text-gray-500 hover:text-gray-300 text-xs"
                  >
                    View player
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared style tokens
// ---------------------------------------------------------------------------

const inputCls =
  'bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm';

const selectCls =
  'bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-gray-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RarityBadge({ rarity }: { rarity: string }) {
  const colors: Record<string, string> = {
    common: 'text-gray-400 bg-gray-700',
    uncommon: 'text-green-400 bg-green-900/40',
    rare: 'text-blue-400 bg-blue-900/40',
    epic: 'text-purple-400 bg-purple-900/40',
    legendary: 'text-yellow-400 bg-yellow-900/40',
    crazy: 'text-pink-400 bg-pink-900/40',
  };
  const cls = colors[rarity?.toLowerCase()] ?? 'text-gray-400 bg-gray-700';
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${cls}`}>
      {rarity}
    </span>
  );
}
