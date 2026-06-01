import {
  BUILTIN_SHIPS,
  parseShip,
  type ShipDefinition,
} from '@traveller-tools/core';
import React, { useMemo, useState } from 'react';

import { useFileImport } from '../components/importFile.js';
import { LibraryBrowser } from '../components/LibraryBrowser.js';
import { useShipStore } from '../storage.js';

export function ShipLibraryScreen({
  onBack,
  onLoad,
}: {
  onBack: () => void;
  onLoad: (def: ShipDefinition) => void;
}): React.JSX.Element {
  const store = useShipStore();
  const [savedVersion, setSavedVersion] = useState(0); // bump to re-read store
  const [message, setMessage] = useState('');
  const importer = useFileImport(parseShip, onLoad);

  const saved = useMemo(
    () => store.list(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, savedVersion],
  );

  if (importer.prompting) return importer.prompt('Import Ship');

  return (
    <LibraryBrowser<ShipDefinition>
      title="Ship Library"
      builtinTitle="Built-in"
      builtins={BUILTIN_SHIPS}
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
