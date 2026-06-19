'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import { getDB } from '@/lib/db';
import { CATALOG_BY_ID } from '@/lib/catalog';
import {
  verifyPassword,
  generateToken,
  setAuthCookie,
  clearAuthCookie,
} from '@/lib/auth';

// ---------------------------------------------------------------------------
// Schema note
// ---------------------------------------------------------------------------
// `inventory.playerId` is a STRING (= player._id.toString()) — matching the game
// (src/server/src/db/mongo.ts) and the player-detail query. `players.userId` is
// also a STRING, while `users._id` is an ObjectId. Mixing these up silently
// breaks add/delete (no matches), which is what this file previously did.

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function loginAction(password: string): Promise<{ error?: string }> {
  if (!verifyPassword(password)) {
    return { error: 'Invalid password' };
  }
  const token = generateToken();
  await setAuthCookie(token);
  redirect('/');
}

export async function logoutAction(): Promise<void> {
  await clearAuthCookie();
  redirect('/login');
}

// ---------------------------------------------------------------------------
// Players — stats
// ---------------------------------------------------------------------------

export async function updatePlayer(
  id: string,
  data: {
    username?: string;
    xp?: number;
    level?: number;
    coins?: number;
    totalRaces?: number;
    totalWins?: number;
    equippedChar?: string;
    pullCredits?: number;
    pityCounter?: number;
    lastFreePullAt?: Date | null;
  }
): Promise<void> {
  const db = await getDB();
  await db.collection('players').updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...data, updatedAt: new Date() } }
  );
}

/** Reset the daily free gacha pull so the player can pull again now. */
export async function resetFreePull(id: string): Promise<void> {
  const db = await getDB();
  await db.collection('players').updateOne(
    { _id: new ObjectId(id) },
    { $set: { lastFreePullAt: null, updatedAt: new Date() } }
  );
}

// ---------------------------------------------------------------------------
// Players — account (user record)
// ---------------------------------------------------------------------------

export async function updateUser(
  userId: string,
  data: { username?: string; email?: string }
): Promise<void> {
  const db = await getDB();
  await db.collection('users').updateOne(
    { _id: new ObjectId(userId) },
    { $set: { ...data } }
  );
}

export async function resetPassword(
  userId: string,
  newPassword: string
): Promise<void> {
  const db = await getDB();
  const hash = await bcrypt.hash(newPassword, 12);
  await db.collection('users').updateOne(
    { _id: new ObjectId(userId) },
    { $set: { passwordHash: hash } }
  );
}

// ---------------------------------------------------------------------------
// Players — create / delete
// ---------------------------------------------------------------------------

// Starter kit (kept in sync with the game's STARTER_KIT). playerId is a STRING.
const STARTER_KIT = [
  { itemType: 'upper_body', itemId: 'worn_tshirt', rarity: 'common' },
  { itemType: 'lower_body', itemId: 'blue_jeans', rarity: 'common' },
  { itemType: 'feet', itemId: 'beatup_sneakers', rarity: 'common' },
];
const STARTER_LOADOUT: Record<string, string> = {
  upper_body: 'worn_tshirt', lower_body: 'blue_jeans', feet: 'beatup_sneakers',
};

/**
 * Create a new account: user + player + equipped starter kit, mirroring the
 * game's registration (getOrCreatePlayer). Redirects to the new player on success.
 */
export async function createAccount(
  email: string,
  username: string,
  password: string
): Promise<{ error?: string }> {
  const db = await getDB();
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = username.trim();
  if (!cleanEmail || !cleanName) return { error: 'Email and username are required' };
  if (password.length < 6) return { error: 'Password must be at least 6 characters' };

  const users = db.collection('users');
  if (await users.findOne({ email: cleanEmail })) return { error: 'Email already registered' };
  if (
    await users.findOne({ username: cleanName }, { collation: { locale: 'en', strength: 2 } })
  ) {
    return { error: 'Username already taken' };
  }

  const now = new Date();
  const hash = await bcrypt.hash(password, 10);
  const userRes = await users.insertOne({
    email: cleanEmail, passwordHash: hash, googleSub: null, username: cleanName, createdAt: now,
  });
  const userId = userRes.insertedId.toString();

  const playerRes = await db.collection('players').insertOne({
    userId, username: cleanName, xp: 0, level: 1, coins: 0, totalRaces: 0, totalWins: 0,
    equippedChar: 'male', equippedLoadout: STARTER_LOADOUT,
    pityCounter: 0, lastFreePullAt: null, pullCredits: 0, createdAt: now, updatedAt: now,
  });
  const playerId = playerRes.insertedId.toString();

  await db.collection('inventory').insertMany(
    STARTER_KIT.map((k) => ({
      playerId, itemType: k.itemType, itemId: k.itemId, rarity: k.rarity,
      equipped: true, obtainedAt: now, source: 'starter',
    }))
  );

  redirect(`/players/${playerId}`);
}

export async function deletePlayer(id: string): Promise<void> {
  const db = await getDB();
  const player = await db.collection('players').findOne({ _id: new ObjectId(id) });
  if (!player) return;

  const tasks: Promise<unknown>[] = [
    db.collection('players').deleteOne({ _id: new ObjectId(id) }),
    // inventory.playerId is a STRING (= player._id.toString()).
    db.collection('inventory').deleteMany({ playerId: id }),
  ];
  // players.userId is a STRING; users._id is an ObjectId.
  if (player.userId) {
    try {
      tasks.push(db.collection('users').deleteOne({ _id: new ObjectId(String(player.userId)) }));
    } catch { /* malformed userId — skip user delete */ }
  }
  await Promise.all(tasks);

  redirect('/players');
}

export async function bulkDeletePlayers(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDB();
  const objectIds = ids.map((id) => new ObjectId(id));

  const players = await db
    .collection('players')
    .find({ _id: { $in: objectIds } })
    .toArray();

  const userIds = players
    .map((p) => p.userId)
    .filter(Boolean)
    .map((uid) => {
      try { return typeof uid === 'string' ? new ObjectId(uid) : uid; } catch { return null; }
    })
    .filter((x): x is ObjectId => x !== null);

  await Promise.all([
    db.collection('players').deleteMany({ _id: { $in: objectIds } }),
    // inventory.playerId is a STRING — match the string ids, not ObjectIds.
    db.collection('inventory').deleteMany({ playerId: { $in: ids } }),
    db.collection('users').deleteMany({ _id: { $in: userIds } }),
  ]);
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

/**
 * Give a catalog item to one player (slot + rarity resolved from the catalog).
 * Optionally equip it now: unequips anything else in that slot and updates the
 * player's denormalized equippedLoadout so the game renders it.
 */
export async function giveItem(
  playerId: string,
  itemId: string,
  equip = false
): Promise<{ error?: string }> {
  const def = CATALOG_BY_ID[itemId];
  if (!def) return { error: 'Unknown item' };
  const db = await getDB();

  if (equip) {
    await db.collection('inventory').updateMany(
      { playerId, itemType: def.slot, equipped: true },
      { $set: { equipped: false } }
    );
  }
  await db.collection('inventory').insertOne({
    playerId, // STRING — matches the game + the rest of this app
    itemType: def.slot,
    itemId: def.id,
    rarity: def.rarity,
    equipped: equip,
    obtainedAt: new Date(),
    source: 'admin',
  });
  if (equip) {
    await db.collection('players').updateOne(
      { _id: new ObjectId(playerId) },
      { $set: { [`equippedLoadout.${def.slot}`]: def.id, updatedAt: new Date() } }
    );
  }
  return {};
}

export async function updateItem(
  itemMongoId: string,
  data: { itemType?: string; itemId?: string; rarity?: string }
): Promise<void> {
  const db = await getDB();
  await db.collection('inventory').updateOne(
    { _id: new ObjectId(itemMongoId) },
    { $set: data }
  );
}

export async function deleteItem(itemId: string): Promise<void> {
  const db = await getDB();
  await db.collection('inventory').deleteOne({ _id: new ObjectId(itemId) });
}

export async function toggleEquip(itemId: string): Promise<void> {
  const db = await getDB();
  const item = await db.collection('inventory').findOne({ _id: new ObjectId(itemId) });
  if (!item) return;
  await db.collection('inventory').updateOne(
    { _id: new ObjectId(itemId) },
    { $set: { equipped: !item.equipped } }
  );
}

// ---------------------------------------------------------------------------
// Bulk inventory ops
// ---------------------------------------------------------------------------

/**
 * Reset every player EXCEPT `keepPlayerId` to the 3-item starter kit (equipped),
 * and fix their equippedLoadout. The kept account is left untouched. Destructive
 * — there's no undo. Returns how many players were reset.
 */
export async function resetAllToStarterKit(
  keepPlayerId: string
): Promise<{ reset: number }> {
  const db = await getDB();
  const players = await db
    .collection('players')
    .find({}, { projection: { _id: 1 } })
    .toArray();

  const resetObjIds = players
    .map((p) => p._id)
    .filter((id) => id.toString() !== keepPlayerId);
  const resetIds = resetObjIds.map((id) => id.toString());
  if (resetIds.length === 0) return { reset: 0 };

  const now = new Date();
  // playerId is a STRING here (matches the game) — do NOT use ObjectId.
  await db.collection('inventory').deleteMany({ playerId: { $in: resetIds } });
  const rows = resetIds.flatMap((pid) =>
    STARTER_KIT.map((k) => ({
      playerId: pid,
      itemType: k.itemType,
      itemId: k.itemId,
      rarity: k.rarity,
      equipped: true,
      obtainedAt: now,
      source: 'starter',
    }))
  );
  await db.collection('inventory').insertMany(rows);
  await db.collection('players').updateMany(
    { _id: { $in: resetObjIds } },
    { $set: { equippedLoadout: STARTER_LOADOUT, updatedAt: now } }
  );

  return { reset: resetIds.length };
}

// ---------------------------------------------------------------------------
// Coin store rotation (#25) — curate the 5 cosmetics on sale each month.
// Writes the `store_rotation` collection the game server reads (one doc per
// UTC month, keyed by seasonId "YYYY-MM"). The game validates eligibility +
// prices on its side, so this only needs to record known catalog ids.
// ---------------------------------------------------------------------------

const STORE_SIZE = 5;

/** Set a month's store rotation. Dedupes, drops unknown ids, caps at 5. */
export async function setStoreRotation(
  seasonId: string,
  itemIds: string[]
): Promise<{ error?: string; itemIds?: string[] }> {
  if (!/^\d{4}-\d{2}$/.test(seasonId)) return { error: 'Bad season id' };
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const id of itemIds) {
    if (!id || seen.has(id)) continue;
    if (!CATALOG_BY_ID[id]) return { error: `Unknown item: ${id}` };
    seen.add(id);
    clean.push(id);
  }
  if (clean.length > STORE_SIZE) return { error: `At most ${STORE_SIZE} items` };

  const db = await getDB();
  const now = new Date();
  await db.collection('store_rotation').updateOne(
    { seasonId },
    { $set: { itemIds: clean, updatedAt: now }, $setOnInsert: { seasonId, createdAt: now } },
    { upsert: true }
  );
  revalidatePath('/store');
  return { itemIds: clean };
}

/** Form-action wrapper: reads `seasonId` + `slot0..slot4` from the submitted form. */
export async function saveStoreRotationForm(formData: FormData): Promise<void> {
  const seasonId = String(formData.get('seasonId') ?? '');
  const itemIds = [0, 1, 2, 3, 4]
    .map((i) => String(formData.get(`slot${i}`) ?? ''))
    .filter(Boolean);
  await setStoreRotation(seasonId, itemIds);
}

/** Give a catalog item to ALL players (unequipped; slot + rarity from catalog). */
export async function giveItemToAll(itemId: string): Promise<{ count: number }> {
  const def = CATALOG_BY_ID[itemId];
  if (!def) return { count: 0 };
  const db = await getDB();
  const players = await db
    .collection('players')
    .find({}, { projection: { _id: 1 } })
    .toArray();
  if (players.length === 0) return { count: 0 };

  const now = new Date();
  const docs = players.map((p) => ({
    playerId: p._id.toString(), // STRING
    itemType: def.slot,
    itemId: def.id,
    rarity: def.rarity,
    equipped: false,
    obtainedAt: now,
    source: 'admin',
  }));

  await db.collection('inventory').insertMany(docs);
  return { count: players.length };
}
