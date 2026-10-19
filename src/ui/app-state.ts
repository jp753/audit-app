import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Brand, Library } from '../types';
import { DEFAULT_BRAND } from '../types';

export interface AppState {
  library: Library | undefined;
  brand: Brand;
  lastBackup: string | undefined;
  /** Re-read library/brand/backup date from storage. */
  reload: () => Promise<void>;
}

export const AppCtx = createContext<AppState>({
  library: undefined,
  brand: DEFAULT_BRAND,
  lastBackup: undefined,
  reload: async () => {},
});

export const useApp = () => useContext(AppCtx);
