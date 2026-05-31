import type { ShipDefinition, WeaponDefinition } from '@traveller-tools/core';
import React, { createContext, useContext } from 'react';

/**
 * Persistence for user-saved designs, keyed by `name`. The terminal entry backs
 * a store with a JSON file; the browser entry backs it with localStorage; tests
 * use the in-memory default. The UI only ever sees this interface.
 *
 * It's generic over the design type so ships and weapons share one
 * implementation — see {@link ShipStore} / {@link WeaponStore}.
 */
export interface NamedStore<T extends { name: string }> {
  list(): T[];
  /** Save (or overwrite, by name) a design. */
  save(def: T): void;
  remove(name: string): void;
}

export type ShipStore = NamedStore<ShipDefinition>;
export type WeaponStore = NamedStore<WeaponDefinition>;

/** An in-memory store (the default; also handy for tests). */
export function memoryStore<T extends { name: string }>(
  initial: T[] = [],
): NamedStore<T> {
  let items = [...initial];
  return {
    list: () => items.slice(),
    save: (def) => {
      items = [...items.filter((s) => s.name !== def.name), def];
    },
    remove: (name) => {
      items = items.filter((s) => s.name !== name);
    },
  };
}

const ShipStoreContext = createContext<ShipStore>(memoryStore());
const WeaponStoreContext = createContext<WeaponStore>(memoryStore());

export function StoreProvider({
  shipStore,
  weaponStore,
  children,
}: {
  shipStore?: ShipStore;
  weaponStore?: WeaponStore;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <ShipStoreContext.Provider value={shipStore ?? memoryStore()}>
      <WeaponStoreContext.Provider value={weaponStore ?? memoryStore()}>
        {children}
      </WeaponStoreContext.Provider>
    </ShipStoreContext.Provider>
  );
}

export const useShipStore = (): ShipStore => useContext(ShipStoreContext);
export const useWeaponStore = (): WeaponStore => useContext(WeaponStoreContext);
