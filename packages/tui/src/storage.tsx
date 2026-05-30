import type { ShipDefinition } from '@traveller-tools/core';
import React, { createContext, useContext } from 'react';

/**
 * Persistence for user-saved ships. The terminal entry backs this with a JSON
 * file; the browser entry backs it with localStorage; tests use the in-memory
 * default. The UI only ever sees this interface.
 */
export interface ShipStore {
  list(): ShipDefinition[];
  /** Save (or overwrite, by name) a ship. */
  save(def: ShipDefinition): void;
  remove(name: string): void;
}

/** An in-memory store (the default; also handy for tests). */
export function memoryStore(initial: ShipDefinition[] = []): ShipStore {
  let ships = [...initial];
  return {
    list: () => ships.slice(),
    save: (def) => {
      ships = [...ships.filter((s) => s.name !== def.name), def];
    },
    remove: (name) => {
      ships = ships.filter((s) => s.name !== name);
    },
  };
}

const StoreContext = createContext<ShipStore>(memoryStore());

export function StoreProvider({
  store,
  children,
}: {
  store: ShipStore;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
  );
}

export const useStore = (): ShipStore => useContext(StoreContext);
