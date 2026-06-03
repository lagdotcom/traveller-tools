import {
  BUILTIN_WEAPONS,
  parseWeapon,
  variantParams,
  type WeaponDefinition,
} from '@traveller-tools/core';
import React, { useMemo, useState } from 'react';

import { useFileImport } from '../components/importFile.js';
import { LibraryBrowser } from '../components/LibraryBrowser.js';
import { useWeaponStore } from '../storage.js';

/** Where a displayed entry came from: a base weapon, optionally one of its variants. */
interface Origin {
  base: WeaponDefinition;
  variant?: number;
}

/**
 * Flatten each weapon into a display entry per variant (`Base · Variant`, resolved
 * to full params) and remember where each entry came from, so loading a variant
 * row opens its base weapon positioned on that variant (the builder keeps the
 * whole design + its variant editor).
 */
function expand(defs: WeaponDefinition[]): {
  entries: WeaponDefinition[];
  origin: Map<WeaponDefinition, Origin>;
} {
  const entries: WeaponDefinition[] = [];
  const origin = new Map<WeaponDefinition, Origin>();
  for (const def of defs) {
    // A named base config shows as a peer (`Name · Army Model`); otherwise just `Name`.
    const baseEntry = def.baseVariant
      ? { ...def, name: `${def.name} · ${def.baseVariant}` }
      : def;
    entries.push(baseEntry);
    origin.set(baseEntry, { base: def });
    (def.variants ?? []).forEach((v, i) => {
      const entry: WeaponDefinition = {
        name: `${def.name} · ${v.name}`,
        description: v.description ?? def.description,
        ...(def.manufacturer ? { manufacturer: def.manufacturer } : {}),
        params: variantParams(def.params, v.override),
      };
      entries.push(entry);
      origin.set(entry, { base: def, variant: i });
    });
  }
  return { entries, origin };
}

/** Catalogue of the built-in (worked-example) weapons + your saved designs. */
export function WeaponLibraryScreen({
  onBack,
  onLoad,
}: {
  onBack: () => void;
  onLoad: (def: WeaponDefinition, variant?: number) => void;
}): React.JSX.Element {
  const store = useWeaponStore();
  const [savedVersion, setSavedVersion] = useState(0); // bump to re-read store
  const [message, setMessage] = useState('');
  const importer = useFileImport(parseWeapon, onLoad);

  const saved = useMemo(
    () => store.list(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, savedVersion],
  );

  const builtins = useMemo(() => expand(BUILTIN_WEAPONS), []);
  const savedEntries = useMemo(() => expand(saved), [saved]);

  // Loading a variant row opens its base weapon on that variant; anything else
  // (or an imported entry) loads as itself.
  const handleLoad = (def: WeaponDefinition) => {
    const o = builtins.origin.get(def) ?? savedEntries.origin.get(def);
    if (o) onLoad(o.base, o.variant);
    else onLoad(def);
  };

  if (importer.prompting) return importer.prompt('Import Weapon');

  return (
    <LibraryBrowser<WeaponDefinition>
      title="Weapon Library"
      builtinTitle="Field Catalogue"
      builtins={builtins.entries}
      saved={savedEntries.entries}
      savedEmpty="(none — build one and Ctrl+S)"
      message={message || importer.message}
      onLoad={handleLoad}
      onImport={importer.start}
      onDelete={(def) => {
        // Deleting a variant row removes its base saved design.
        const name = (savedEntries.origin.get(def)?.base ?? def).name;
        store.remove(name);
        setSavedVersion((v) => v + 1);
        setMessage(`Deleted “${name}”.`);
      }}
      onBack={onBack}
    />
  );
}
