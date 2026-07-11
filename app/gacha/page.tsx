import { requireAuth } from '@/lib/auth';
import { getDB } from '@/lib/db';
import { CATALOG } from '@/lib/catalog';
import GachaEditor from './GachaEditor';

// Game defaults — mirror src/shared/gacha.ts GACHA_CONFIG.tierWeights. The game
// is authoritative; these are the fallback shown when no override is saved yet.
const DEFAULT_WEIGHTS: Record<string, number> = {
  common: 50, uncommon: 30, rare: 15, epic: 4, legendary: 0.9, crazy: 0.1,
};

interface GachaConfigDoc {
  tierWeights?: Record<string, number>;
  itemOverrides?: Record<string, { rarity?: string; enabled?: boolean }>;
}

async function loadConfig(): Promise<GachaConfigDoc> {
  const db = await getDB();
  const doc = await db.collection('gacha_config').findOne({ _id: 'active' as never });
  return (doc as GachaConfigDoc | null) ?? {};
}

export default async function GachaPage() {
  await requireAuth();
  const cfg = await loadConfig();

  const weights = { ...DEFAULT_WEIGHTS, ...(cfg.tierWeights ?? {}) };
  const items = CATALOG.map((i) => ({
    id: i.id,
    displayName: i.displayName,
    slot: i.slot,
    defaultRarity: i.rarity,
  }));

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-yellow-400 mb-2">Gacha Control</h1>
      <p className="text-gray-400 text-sm mb-6">
        Tune the pull odds. Adjust the six <strong>tier weights</strong> (relative, auto-normalized
        to %), move any item to a different <strong>rarity</strong>, or toggle an item{' '}
        <strong>in/out of the pool</strong>. Changes go live in the game within ~5 seconds of saving
        — no deploy. Only items with finished art appear here.
      </p>
      <GachaEditor
        items={items}
        initialWeights={weights}
        initialOverrides={cfg.itemOverrides ?? {}}
      />
    </div>
  );
}
