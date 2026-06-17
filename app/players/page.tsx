import { requireAuth } from '@/lib/auth';
import { getDB } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { redirect } from 'next/navigation';
import { bulkDeletePlayers, resetAllToStarterKit } from '@/app/actions';

async function getMergedPlayers(search: string) {
  const db = await getDB();

  // Build a filter that checks players.username OR users.email via a lookup
  // Strategy: fetch players, then join users. For search, we filter post-join.
  const players = await db
    .collection('players')
    .find({})
    .sort({ createdAt: -1 })
    .limit(500)
    .toArray();

  if (players.length === 0) return [];

  // Collect userIds — stored as strings in players collection
  const userIds = players
    .map((p) => p.userId)
    .filter(Boolean)
    .map((uid) => {
      try {
        return uid instanceof ObjectId ? uid : new ObjectId(String(uid));
      } catch {
        return null;
      }
    })
    .filter((x): x is ObjectId => x !== null);

  const users = await db
    .collection('users')
    .find({ _id: { $in: userIds } })
    .toArray();

  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const merged = players.map((p) => {
    const user = userMap.get(String(p.userId)) ?? null;
    return { player: p, user };
  });

  if (!search) return merged;

  const q = search.toLowerCase();
  return merged.filter(
    ({ player, user }) =>
      player.username?.toLowerCase().includes(q) ||
      user?.email?.toLowerCase().includes(q) ||
      user?.username?.toLowerCase().includes(q)
  );
}

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; reset?: string }>;
}) {
  await requireAuth();
  const params = await searchParams;
  const search = params.search ?? '';
  const resetDone = params.reset === '1';
  let rows: Awaited<ReturnType<typeof getMergedPlayers>> = [];
  let dbError = '';
  try {
    rows = await getMergedPlayers(search);
  } catch (e: unknown) {
    dbError = e instanceof Error ? e.message : 'Unknown database error';
    console.error('[Players] DB error:', e);
  }

  async function handleBulkDelete(formData: FormData) {
    'use server';
    const raw = formData.get('selectedIds') as string;
    const ids = raw ? raw.split(',').filter(Boolean) : [];
    await bulkDeletePlayers(ids);
  }

  async function handleReset(formData: FormData) {
    'use server';
    const keepPlayerId = formData.get('keepPlayerId') as string;
    if (!keepPlayerId) return;
    await resetAllToStarterKit(keepPlayerId);
    redirect('/players?reset=1');
  }

  return (
    <div className="p-8">
      {dbError && (
        <div className="bg-red-900/50 border border-red-700 rounded p-4 mb-4 text-red-300 text-sm">
          <strong>Database Error:</strong> {dbError}
        </div>
      )}
      {resetDone && (
        <div className="bg-green-900/40 border border-green-700 rounded p-3 mb-4 text-green-300 text-sm">
          Inventories reset to the starter kit (the kept account was preserved).
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-yellow-400">Players</h1>
          <a
            href="/players/new"
            className="bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded text-sm transition-colors"
          >
            + New account
          </a>
        </div>
        <span className="text-gray-400 text-sm">{rows.length} found</span>
      </div>

      {/* Danger zone — reset all inventories to the starter kit, keep one account */}
      <form action={handleReset} id="reset-form" className="mb-4">
        <div className="bg-red-950/40 border border-red-800 rounded-lg p-4">
          <div className="text-red-300 font-semibold mb-2 text-sm">
            ⚠ Reset all inventories to the starter kit
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-gray-400 text-sm">Keep all items for:</span>
            <select
              name="keepPlayerId"
              defaultValue=""
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 text-sm min-w-64"
              required
            >
              <option value="" disabled>
                — select the account to preserve —
              </option>
              {rows.map(({ player, user }) => (
                <option key={String(player._id)} value={String(player._id)}>
                  {player.username}
                  {user?.email ? ` (${user.email})` : ''}
                </option>
              ))}
            </select>
            <button
              type="submit"
              id="reset-btn"
              className="bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded text-sm transition-colors"
            >
              Reset everyone else
            </button>
          </div>
          <div className="text-gray-500 text-xs mt-2">
            Every other player drops to tee + jeans + sneakers (equipped). The selected account keeps everything. No undo.
          </div>
        </div>
      </form>

      {/* Search */}
      <form method="GET" className="mb-4">
        <div className="flex gap-2">
          <input
            name="search"
            defaultValue={search}
            placeholder="Search by username or email..."
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-80"
          />
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded transition-colors text-sm"
          >
            Search
          </button>
          {search && (
            <a
              href="/players"
              className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-2 rounded transition-colors text-sm"
            >
              Clear
            </a>
          )}
        </div>
      </form>

      {/* Bulk delete — uses a hidden input populated by JS */}
      <form action={handleBulkDelete} id="bulk-form" className="mb-3">
        <input type="hidden" name="selectedIds" id="selected-ids-input" />
        <button
          type="submit"
          id="bulk-delete-btn"
          className="hidden bg-red-700 hover:bg-red-600 text-white px-4 py-1.5 rounded text-sm transition-colors"
          onClick={(e) => {
            // Confirmation is handled via the data-confirm pattern in a client
            // component; here we rely on native confirm via the hidden input being
            // populated before submit.
          }}
        >
          Delete Selected
        </button>
      </form>

      <div className="bg-gray-900 border border-gray-700 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-800">
              <th className="px-4 py-3 w-8">
                <input
                  type="checkbox"
                  id="select-all"
                  className="accent-blue-500"
                />
              </th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">
                Username
              </th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">
                Email
              </th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">
                Lv
              </th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">
                XP
              </th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">
                Coins
              </th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">
                Races
              </th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">
                Wins
              </th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">
                Char
              </th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">
                Google
              </th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">
                Created
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={12}
                  className="text-center py-8 text-gray-500"
                >
                  No players found
                </td>
              </tr>
            )}
            {rows.map(({ player, user }) => (
              <tr
                key={String(player._id)}
                className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors"
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    className="row-checkbox accent-blue-500"
                    data-id={String(player._id)}
                  />
                </td>
                <td className="px-4 py-3 text-gray-100 font-medium">
                  {player.username}
                </td>
                <td className="px-4 py-3 text-gray-300 text-xs">
                  {user?.email ?? (
                    <span className="text-gray-600 italic">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-300">
                  {player.level ?? 1}
                </td>
                <td className="px-4 py-3 text-gray-300">
                  {(player.xp ?? 0).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-yellow-400">
                  {(player.coins ?? 0).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-gray-300">
                  {player.totalRaces ?? 0}
                </td>
                <td className="px-4 py-3 text-green-400">
                  {player.totalWins ?? 0}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {player.equippedChar ?? '—'}
                </td>
                <td className="px-4 py-3">
                  {user?.googleSub ? (
                    <span className="text-xs text-green-400">Linked</span>
                  ) : (
                    <span className="text-xs text-gray-600">No</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {player.createdAt
                    ? new Date(player.createdAt).toLocaleDateString()
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  <a
                    href={`/players/${String(player._id)}`}
                    className="text-blue-400 hover:text-blue-300 text-xs"
                  >
                    Edit
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Inline script for checkbox → bulk delete wiring */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
(function() {
  var selectAll = document.getElementById('select-all');
  var bulkBtn = document.getElementById('bulk-delete-btn');
  var input = document.getElementById('selected-ids-input');
  var form = document.getElementById('bulk-form');

  function getChecked() {
    return Array.from(document.querySelectorAll('.row-checkbox:checked'))
      .map(function(el) { return el.dataset.id; });
  }

  function syncBtn() {
    var ids = getChecked();
    if (ids.length > 0) {
      bulkBtn.classList.remove('hidden');
      bulkBtn.textContent = 'Delete ' + ids.length + ' Selected';
    } else {
      bulkBtn.classList.add('hidden');
    }
  }

  document.querySelectorAll('.row-checkbox').forEach(function(cb) {
    cb.addEventListener('change', syncBtn);
  });

  if (selectAll) {
    selectAll.addEventListener('change', function() {
      document.querySelectorAll('.row-checkbox').forEach(function(cb) {
        cb.checked = selectAll.checked;
      });
      syncBtn();
    });
  }

  if (form) {
    form.addEventListener('submit', function(e) {
      var ids = getChecked();
      if (ids.length === 0) { e.preventDefault(); return; }
      if (!confirm('Delete ' + ids.length + ' player(s) and all their data?')) {
        e.preventDefault();
        return;
      }
      input.value = ids.join(',');
    });
  }

  var resetForm = document.getElementById('reset-form');
  if (resetForm) {
    resetForm.addEventListener('submit', function(e) {
      var sel = resetForm.querySelector('[name=keepPlayerId]');
      if (!sel || !sel.value) {
        e.preventDefault();
        alert('Pick an account to keep first.');
        return;
      }
      var label = sel.options[sel.selectedIndex].text;
      if (!confirm('Reset ALL other players to the starter kit?\\n\\nKeep everything only for:\\n' + label + '\\n\\nThis cannot be undone.')) {
        e.preventDefault();
      }
    });
  }
})();
          `,
        }}
      />
    </div>
  );
}
