'use server';

import { redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import { getDB } from '@/lib/db';
import {
  verifyPassword,
  generateToken,
  setAuthCookie,
  clearAuthCookie,
} from '@/lib/auth';

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
  }
): Promise<void> {
  const db = await getDB();
  await db.collection('players').updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...data, updatedAt: new Date() } }
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
// Players — delete
// ---------------------------------------------------------------------------

export async function deletePlayer(id: string): Promise<void> {
  const db = await getDB();
  const player = await db
    .collection('players')
    .findOne({ _id: new ObjectId(id) });

  if (!player) return;

  await Promise.all([
    db.collection('players').deleteOne({ _id: new ObjectId(id) }),
    db.collection('inventory').deleteMany({ playerId: new ObjectId(id) }),
    db.collection('users').deleteOne({ _id: player.userId }),
  ]);

  redirect('/players');
}

export async function bulkDeletePlayers(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDB();
  const objectIds = ids.map((id) => new ObjectId(id));

  // Find all players to get their userIds
  const players = await db
    .collection('players')
    .find({ _id: { $in: objectIds } })
    .toArray();

  const userIds = players
    .map((p) => p.userId)
    .filter(Boolean)
    .map((uid) => (typeof uid === 'string' ? new ObjectId(uid) : uid));

  await Promise.all([
    db.collection('players').deleteMany({ _id: { $in: objectIds } }),
    db.collection('inventory').deleteMany({ playerId: { $in: objectIds } }),
    db.collection('users').deleteMany({ _id: { $in: userIds } }),
  ]);
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export async function addItem(
  playerId: string,
  itemType: string,
  itemId: string,
  rarity: string
): Promise<void> {
  const db = await getDB();
  await db.collection('inventory').insertOne({
    playerId: new ObjectId(playerId),
    itemType,
    itemId,
    rarity,
    equipped: false,
    obtainedAt: new Date(),
  });
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
  const item = await db
    .collection('inventory')
    .findOne({ _id: new ObjectId(itemId) });
  if (!item) return;
  await db
    .collection('inventory')
    .updateOne(
      { _id: new ObjectId(itemId) },
      { $set: { equipped: !item.equipped } }
    );
}

// The new-player starter kit (kept in sync with the game's STARTER_KIT in
// src/server/src/db/mongo.ts). inventory.playerId is a STRING in this schema —
// matching the game and the player-detail page (NOT an ObjectId).
const STARTER_KIT = [
  { itemType: 'upper_body', itemId: 'worn_tshirt', rarity: 'common' },
  { itemType: 'lower_body', itemId: 'blue_jeans', rarity: 'common' },
  { itemType: 'feet', itemId: 'beatup_sneakers', rarity: 'common' },
];
const STARTER_LOADOUT: Record<string, string> = {
  upper_body: 'worn_tshirt', lower_body: 'blue_jeans', feet: 'beatup_sneakers',
};

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

export async function giveItemToAll(
  itemType: string,
  itemId: string,
  rarity: string
): Promise<{ count: number }> {
  const db = await getDB();
  const players = await db
    .collection('players')
    .find({}, { projection: { _id: 1 } })
    .toArray();

  if (players.length === 0) return { count: 0 };

  const docs = players.map((p) => ({
    playerId: p._id,
    itemType,
    itemId,
    rarity,
    equipped: false,
    obtainedAt: new Date(),
  }));

  await db.collection('inventory').insertMany(docs);
  return { count: players.length };
}
