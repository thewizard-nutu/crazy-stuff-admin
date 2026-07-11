'use client';

import { useMemo, useState } from 'react';
import { saveGachaConfig } from '@/app/actions';

const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'crazy'] as const;
type Rarity = (typeof RARITIES)[number];

const RARITY_COLOR: Record<Rarity, string> = {
  common: 'text-gray-300',
  uncommon: 'text-green-400',
  rare: 'text-blue-400',
  epic: 'text-purple-400',
  legendary: 'text-yellow-400',
  crazy: 'text-pink-400',
};

const SLOT_LABEL: Record<string, string> = {
  upper_body: 'Tops', lower_body: 'Bottoms', feet: 'Shoes',
  head_accessory: 'Head', hair: 'Hair', back: 'Back', air_space: 'Aura',
  eyes_accessory: 'Eyes', mouth_accessory: 'Mouth', face_accessory: 'Face',
};

interface Item { id: string; displayName: string; slot: string; defaultRarity: string; }
interface Override { rarity?: string; enabled?: boolean; }

export default function GachaEditor({
  items,
  initialWeights,
  initialOverrides,
}: {
  items: Item[];
  initialWeights: Record<string, number>;
  initialOverrides: Record<string, Override>;
}) {
  const [weights, setWeights] = useState<Record<string, number>>(() => ({ ...initialWeights }));
  const [rarityOf, setRarityOf] = useState<Record<string, Rarity>>(() => {
    const m: Record<string, Rarity> = {};
    for (const it of items) {
      const ov = initialOverrides[it.id]?.rarity;
      m[it.id] = (ov as Rarity) ?? (it.defaultRarity as Rarity);
    }
    return m;
  });
  const [enabledOf, setEnabledOf] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    for (const it of items) m[it.id] = initialOverrides[it.id]?.enabled !== false;
    return m;
  });
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // ── Live odds ──────────────────────────────────────────────────────────────
  const odds = useMemo(() => {
    const count: Record<Rarity, number> = {
      common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0, crazy: 0,
    };
    for (const it of items) if (enabledOf[it.id]) count[rarityOf[it.id]]++;
    const nonEmpty = RARITIES.filter((r) => count[r] > 0);
    const totalW = nonEmpty.reduce((s, r) => s + (weights[r] || 0), 0);
    const tierPct: Record<Rarity, number> = {
      common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0, crazy: 0,
    };
    for (const r of nonEmpty) tierPct[r] = totalW > 0 ? (weights[r] || 0) / totalW : 0;
    return { count, tierPct };
  }, [items, weights, rarityOf, enabledOf]);

  const perItemPct = (r: Rarity) =>
    odds.count[r] > 0 ? (odds.tierPct[r] / odds.count[r]) * 100 : 0;

  const bySlot = useMemo(() => {
    const g: Record<string, Item[]> = {};
    for (const it of items) (g[it.slot] ??= []).push(it);
    for (const s of Object.keys(g)) g[s].sort((a, b) => a.displayName.localeCompare(b.displayName));
    return g;
  }, [items]);

  async function onSave() {
    setStatus('saving');
    const itemOverrides: Record<string, Override> = {};
    for (const it of items) {
      const o: Override = {};
      if (rarityOf[it.id] !== it.defaultRarity) o.rarity = rarityOf[it.id];
      if (!enabledOf[it.id]) o.enabled = false;
      if (o.rarity !== undefined || o.enabled !== undefined) itemOverrides[it.id] = o;
    }
    try {
      await saveGachaConfig({ tierWeights: weights, itemOverrides });
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2500);
    } catch {
      setStatus('error');
    }
  }

  const dirtyCount = items.filter(
    (it) => rarityOf[it.id] !== it.defaultRarity || !enabledOf[it.id],
  ).length;

  return (
    <div className="space-y-8">
      {/* Tier weights + live odds */}
      <section className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <h2 className="text-lg font-semibold text-white mb-1">Tier weights</h2>
        <p className="text-gray-500 text-xs mb-4">
          Relative weights — the game normalizes them to the percentages shown. A tier with no
          enabled items is skipped and its share is redistributed.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {RARITIES.map((r) => (
            <div key={r} className="bg-gray-950 border border-gray-800 rounded p-3">
              <div className={`text-sm font-semibold capitalize mb-1 ${RARITY_COLOR[r]}`}>{r}</div>
              <input
                type="number"
                min={0}
                step={0.1}
                value={weights[r] ?? 0}
                onChange={(e) =>
                  setWeights((w) => ({ ...w, [r]: Math.max(0, Number(e.target.value) || 0) }))
                }
                className="w-full bg-gray-800 text-white rounded px-2 py-1 text-sm border border-gray-700 focus:border-blue-500 outline-none"
              />
              <div className="text-xs text-gray-400 mt-1">
                <span className="text-white font-medium">{(odds.tierPct[r] * 100).toFixed(2)}%</span>{' '}
                · {odds.count[r]} item{odds.count[r] === 1 ? '' : 's'}
                {odds.count[r] > 0 && (
                  <> · <span className="text-gray-300">{perItemPct(r).toFixed(3)}%</span> each</>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Per-item overrides */}
      <section className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <h2 className="text-lg font-semibold text-white mb-4">Items ({items.length})</h2>
        <div className="space-y-6">
          {Object.keys(bySlot)
            .sort((a, b) => (SLOT_LABEL[a] ?? a).localeCompare(SLOT_LABEL[b] ?? b))
            .map((slot) => (
              <div key={slot}>
                <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">
                  {SLOT_LABEL[slot] ?? slot}
                </div>
                <div className="space-y-1">
                  {bySlot[slot].map((it) => {
                    const r = rarityOf[it.id];
                    const on = enabledOf[it.id];
                    return (
                      <div
                        key={it.id}
                        className={`flex items-center gap-3 rounded px-3 py-1.5 ${on ? 'bg-gray-950' : 'bg-gray-950/40'} border border-gray-800`}
                      >
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) =>
                              setEnabledOf((m) => ({ ...m, [it.id]: e.target.checked }))
                            }
                          />
                        </label>
                        <span className={`flex-1 text-sm ${on ? 'text-gray-200' : 'text-gray-600 line-through'}`}>
                          {it.displayName}
                        </span>
                        <select
                          value={r}
                          disabled={!on}
                          onChange={(e) =>
                            setRarityOf((m) => ({ ...m, [it.id]: e.target.value as Rarity }))
                          }
                          className={`bg-gray-800 rounded px-2 py-1 text-xs border border-gray-700 capitalize ${RARITY_COLOR[r]} disabled:opacity-40`}
                        >
                          {RARITIES.map((rr) => (
                            <option key={rr} value={rr} className="text-white">
                              {rr}
                            </option>
                          ))}
                        </select>
                        <span className="w-20 text-right text-xs text-gray-400 tabular-nums">
                          {on ? `${perItemPct(r).toFixed(3)}%` : '—'}
                        </span>
                        {r !== it.defaultRarity && (
                          <span className="text-[10px] text-yellow-500" title={`default: ${it.defaultRarity}`}>
                            moved
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      </section>

      {/* Save bar */}
      <div className="sticky bottom-0 bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center gap-4">
        <button
          onClick={onSave}
          disabled={status === 'saving'}
          className="bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-semibold px-5 py-2 rounded text-sm"
        >
          {status === 'saving' ? 'Saving…' : 'Save & go live'}
        </button>
        {status === 'saved' && <span className="text-green-400 text-sm">Saved — live in ~5s.</span>}
        {status === 'error' && <span className="text-red-400 text-sm">Save failed. Try again.</span>}
        <span className="text-gray-500 text-xs ml-auto">
          {dirtyCount} item override{dirtyCount === 1 ? '' : 's'} active
        </span>
      </div>
    </div>
  );
}
