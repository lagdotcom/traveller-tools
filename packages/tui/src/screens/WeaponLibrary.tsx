import {
  BUILTIN_WEAPONS,
  parseWeapon,
  variantParams,
  type WeaponDefinition,
} from '@traveller-tools/core';
import React, { useMemo, useState } from 'react';

/** Flatten each built-in's variants into their own loadable (resolved) entries. */
const BUILTIN_LIST: WeaponDefinition[] = BUILTIN_WEAPONS.flatMap((def) => [
  def,
  ...(def.variants ?? []).map((v) => ({
    name: `${def.name} · ${v.name}`,
    description: v.description ?? def.description,
    ...(def.manufacturer ? { manufacturer: def.manufacturer } : {}),
    params: variantParams(def.params, v.override),
  })),
]);

import { useFileImport } from '../components/importFile.js';
import { LibraryBrowser } from '../components/LibraryBrowser.js';
import { useWeaponStore } from '../storage.js';

/** Catalogue of the built-in (worked-example) weapons + your saved designs. */
export function WeaponLibraryScreen({
  onBack,
  onLoad,
}: {
  onBack: () => void;
  onLoad: (def: WeaponDefinition) => void;
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

  if (importer.prompting) return importer.prompt('Import Weapon');

  return (
    <LibraryBrowser<WeaponDefinition>
      title="Weapon Library"
      builtinTitle="Field Catalogue"
      builtins={BUILTIN_LIST}
      saved={saved}
      savedEmpty="(none — build one and Ctrl+S)"
      message={message || importer.message}
      onLoad={onLoad}
      onImport={importer.start}
      onDelete={(def) => {
        store.remove(def.name);
        setSavedVersion((v) => v + 1);
        setMessage(`Deleted “${def.name}”.`);
      }}
      onBack={onBack}
    />
  );
}
