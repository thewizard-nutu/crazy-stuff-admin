import { requireAuth } from '@/lib/auth';
import { getDB } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { notFound } from 'next/navigation';
import {
  updatePlayer,
  updateUser,
  resetPassword,
  resetFreePull,
  deletePlayer,
  giveItem,
  updateItem,
  deleteItem,
  toggleEquip,
} from '@/app/actions';
import { CATALOG_BY_SLOT, CATALOG_BY_ID } from '@/lib/catalog';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHARACTERS = [
  'male',
  'female',
  'male-medium',
  'female-medium',
  'male-dark',
  'female-dark',
] as const;

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function getPlayerFull(id: string) {
  const db = await getDB();
  let oid: ObjectId;
  try {
    oid = new ObjectId(id);
  } catch {
    return null;
  }

  const player = await db.collection('players').findOne({ _id: oid });
  // playerId is stored as a STRING in the inventory collection
  const inventory = await db
    .collection('inventory')
    .find({ playerId: oid.toString() })
    .sort({ obtainedAt: -1 })
    .toArray();

  if (!player) return null;

  let user = null;
  if (player.userId) {
    try {
      const uid =
        player.userId instanceof ObjectId
          ? player.userId
          : new ObjectId(String(player.userId));
      user = await db.collection('users').findOne({ _id: uid });
    } catch {
      /* invalid userId format */
    }
  }

  return { player, user, inventory };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PlayerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAuth();
  const { id } = await params;
  const result = await getPlayerFull(id);
  if (!result) notFound();

  const { player, user, inventory } = result;
  const userId = String(player.userId ?? '');

  // -- Account actions -------------------------------------------------------

  async function handleUpdateAccount(formData: FormData) {
    'use server';
    await updateUser(userId, {
      username: formData.get('username') as string,
      email: formData.get('email') as string,
    });
    await updatePlayer(id, { username: formData.get('username') as string });
  }

  async function handleResetPassword(formData: FormData) {
    'use server';
    const newPw = formData.get('newPassword') as string;
    if (!newPw || newPw.length < 6) return;
    await resetPassword(userId, newPw);
  }

  // -- Stats actions ---------------------------------------------------------

  async function handleUpdateStats(formData: FormData) {
    'use server';
    await updatePlayer(id, {
      xp: Number(formData.get('xp')),
      level: Number(formData.get('level')),
      coins: Number(formData.get('coins')),
      totalRaces: Number(formData.get('totalRaces')),
      totalWins: Number(formData.get('totalWins')),
      equippedChar: formData.get('equippedChar') as string,
      pullCredits: Number(formData.get('pullCredits')),
      pityCounter: Number(formData.get('pityCounter')),
    });
  }

  async function handleResetFreePull() {
    'use server';
    await resetFreePull(id);
  }

  // -- Inventory actions -----------------------------------------------------

  async function handleGiveItem(formData: FormData) {
    'use server';
    const itemId = formData.get('itemId') as string;
    const equip = formData.get('equip') === 'on';
    if (!itemId) return;
    await giveItem(id, itemId, equip);
  }

  async function handleEditItem(formData: FormData) {
    'use server';
    const itemMongoId = formData.get('itemMongoId') as string;
    const newItemId = formData.get('newItemId') as string;
    const def = CATALOG_BY_ID[newItemId];
    if (!itemMongoId || !def) return;
    await updateItem(itemMongoId, {
      itemType: def.slot,
      itemId: def.id,
      rarity: def.rarity,
    });
  }

  // -- Delete ----------------------------------------------------------------

  async function handleDelete() {
    'use server';
    await deletePlayer(id);
  }

  const freePullAt = player.lastFreePullAt
    ? new Date(player.lastFreePullAt).toLocaleString()
    : null;

  return (
    <div className="p-8 max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 mb-6">
        <a href="/players" className="text-blue-400 hover:text-blue-300 text-sm">
          Players
        </a>
        <span className="text-gray-600">/</span>
        <h1 className="text-2xl font-bold text-yellow-400">{player.username}</h1>
        <span className="text-gray-500 text-sm font-mono text-xs mt-1">
          {String(player._id)}
        </span>
      </div>

      {/* Account */}
      <Section title="Account">
        <form action={handleUpdateAccount} className="grid grid-cols-2 gap-4">
          <Field
            name="username"
            label="Username"
            defaultValue={user?.username ?? player.username ?? ''}
          />
          <Field
            name="email"
            label="Email"
            type="email"
            defaultValue={user?.email ?? ''}
          />
          <div className="col-span-2 flex items-center gap-4">
            <div className="text-sm text-gray-400">
              Google:{' '}
              {user?.googleSub ? (
                <span className="text-green-400">Linked ({user.googleSub})</span>
              ) : (
                <span className="text-gray-600">Not linked</span>
              )}
            </div>
            <div className="text-sm text-gray-400">
              Password hash:{' '}
              {user?.passwordHash ? (
                <span className="text-green-400">Set</span>
              ) : (
                <span className="text-gray-600">None</span>
              )}
            </div>
          </div>
          <div className="col-span-2">
            <SaveButton label="Save Account" />
          </div>
        </form>

        <div className="mt-5 pt-5 border-t border-gray-700">
          <p className="text-sm text-gray-400 mb-3">Reset Password</p>
          <form action={handleResetPassword} className="flex gap-2">
            <input
              name="newPassword"
              type="password"
              placeholder="New password (min 6 chars)"
              minLength={6}
              required
              className={inputCls + ' w-64'}
            />
            <button
              type="submit"
              className="bg-orange-700 hover:bg-orange-600 text-white px-4 py-2 rounded transition-colors text-sm"
            >
              Reset Password
            </button>
          </form>
        </div>
      </Section>

      {/* Stats */}
      <Section title="Stats">
        <form action={handleUpdateStats} className="grid grid-cols-2 gap-4">
          <Field name="xp" label="XP" type="number" defaultValue={player.xp ?? 0} />
          <Field name="level" label="Level" type="number" defaultValue={player.level ?? 1} />
          <Field name="coins" label="Coins" type="number" defaultValue={player.coins ?? 0} />
          <Field name="totalRaces" label="Total Races" type="number" defaultValue={player.totalRaces ?? 0} />
          <Field name="totalWins" label="Total Wins" type="number" defaultValue={player.totalWins ?? 0} />
          <div>
            <label className="block text-sm text-gray-400 mb-1">Equipped Character</label>
            <select name="equippedChar" defaultValue={player.equippedChar ?? ''} className={selectCls}>
              <option value="">— none —</option>
              {CHARACTERS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          {/* Gacha / economy */}
          <Field name="pullCredits" label="Pull Credits" type="number" defaultValue={player.pullCredits ?? 0} />
          <Field name="pityCounter" label="Pity Counter" type="number" defaultValue={player.pityCounter ?? 0} />
          <div className="col-span-2">
            <SaveButton label="Save Stats" />
          </div>
        </form>

        <div className="mt-5 pt-5 border-t border-gray-700 flex items-center gap-4">
          <div className="text-sm text-gray-400">
            Free pull used at:{' '}
            {freePullAt ? (
              <span className="text-gray-200">{freePullAt}</span>
            ) : (
              <span className="text-green-400">available now</span>
            )}
          </div>
          <form action={handleResetFreePull}>
            <button
              type="submit"
              className="bg-indigo-700 hover:bg-indigo-600 text-white px-4 py-2 rounded transition-colors text-sm"
            >
              Reset Free Pull
            </button>
          </form>
        </div>
      </Section>

      {/* Inventory */}
      <Section title={`Inventory (${inventory.length} items)`}>
        {inventory.length > 0 && (
          <table className="w-full text-sm mb-5">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-2 pr-3 text-gray-400 font-medium">Type</th>
                <th className="text-left py-2 pr-3 text-gray-400 font-medium">Item ID</th>
                <th className="text-left py-2 pr-3 text-gray-400 font-medium">Rarity</th>
                <th className="text-left py-2 pr-3 text-gray-400 font-medium">Equipped</th>
                <th className="text-left py-2 pr-3 text-gray-400 font-medium">Change item</th>
                <th className="text-left py-2 text-gray-400 font-medium">Delete</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((item) => {
                const itemMongoId = String(item._id);

                async function handleToggle() {
                  'use server';
                  await toggleEquip(itemMongoId);
                }
                async function handleDeleteItem() {
                  'use server';
                  await deleteItem(itemMongoId);
                }

                return (
                  <tr key={itemMongoId} className="border-b border-gray-800">
                    <td className="py-2 pr-3 text-gray-300 text-xs">{item.itemType}</td>
                    <td className="py-2 pr-3 text-gray-300 font-mono text-xs">{item.itemId}</td>
                    <td className="py-2 pr-3">
                      <RarityBadge rarity={item.rarity} />
                    </td>
                    <td className="py-2 pr-3">
                      <form action={handleToggle}>
                        <button
                          type="submit"
                          className={`text-xs px-2 py-1 rounded transition-colors ${
                            item.equipped
                              ? 'bg-green-800 text-green-300 hover:bg-green-700'
                              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                          }`}
                        >
                          {item.equipped ? 'Equipped' : 'Unequipped'}
                        </button>
                      </form>
                    </td>
                    {/* Edit in place — swap this row to a different catalog item */}
                    <td className="py-2 pr-3">
                      <form action={handleEditItem} className="flex gap-1 items-center">
                        <input type="hidden" name="itemMongoId" value={itemMongoId} />
                        <select
                          name="newItemId"
                          defaultValue={CATALOG_BY_ID[item.itemId] ? item.itemId : ''}
                          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-100 text-xs"
                        >
                          <option value="">change to…</option>
                          <CatalogOptions />
                        </select>
                        <button
                          type="submit"
                          className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 px-2 py-1 rounded transition-colors"
                        >
                          Save
                        </button>
                      </form>
                    </td>
                    <td className="py-2">
                      <form action={handleDeleteItem}>
                        <button
                          type="submit"
                          className="text-xs text-red-400 hover:text-red-300 transition-colors"
                        >
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Give item — pick from the real catalog */}
        <div className="border-t border-gray-700 pt-4">
          <p className="text-sm text-gray-400 mb-3">Give Item</p>
          <form action={handleGiveItem} className="flex gap-2 flex-wrap items-center">
            <select name="itemId" required defaultValue="" className={selectCls + ' min-w-56'}>
              <option value="" disabled>
                Select item…
              </option>
              <CatalogOptions />
            </select>
            <label className="flex items-center gap-1.5 text-sm text-gray-300">
              <input type="checkbox" name="equip" className="accent-blue-500" />
              equip now
            </label>
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded transition-colors text-sm"
            >
              Give
            </button>
          </form>
        </div>
      </Section>

      {/* Danger Zone */}
      <section className="bg-gray-900 border border-red-900/50 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-red-400 mb-2">Danger Zone</h2>
        <p className="text-gray-400 text-sm mb-4">
          Permanently delete this player, their user account, and all inventory.
          This cannot be undone.
        </p>
        <form action={handleDelete}>
          <button
            type="submit"
            className="bg-red-700 hover:bg-red-600 text-white px-5 py-2 rounded transition-colors text-sm font-medium"
          >
            Delete Player
          </button>
        </form>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared style tokens + sub-components
// ---------------------------------------------------------------------------

const inputCls =
  'bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm';

const selectCls =
  'bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-gray-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm';

/** Catalog <optgroup>s, grouped by slot — reused by the give + edit selects. */
function CatalogOptions() {
  return (
    <>
      {Object.entries(CATALOG_BY_SLOT).map(([slot, items]) => (
        <optgroup key={slot} label={slot}>
          {items.map((it) => (
            <option key={it.id} value={it.id}>
              {it.displayName} ({it.rarity})
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-gray-900 border border-gray-700 rounded-lg p-6 mb-5">
      <h2 className="text-lg font-semibold text-gray-100 mb-4">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  name,
  label,
  type = 'text',
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue: string | number;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm text-gray-400 mb-1">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
      />
    </div>
  );
}

function SaveButton({ label }: { label: string }) {
  return (
    <button
      type="submit"
      className="bg-green-700 hover:bg-green-600 text-white px-5 py-2 rounded transition-colors text-sm font-medium"
    >
      {label}
    </button>
  );
}

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
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${cls}`}>{rarity}</span>
  );
}
