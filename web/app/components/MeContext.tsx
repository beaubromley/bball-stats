"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";

const STORAGE_KEY = "yba_me_player_id";

interface PlayerOption {
  id: string;
  name: string;
}

interface MeContextValue {
  /** The current "viewing as" player, or null if nobody is picked. */
  me: PlayerOption | null;
  /** Full active-player list (sorted by name). For the picker. */
  options: PlayerOption[];
  /** True before the player list returns + the saved id is resolved. */
  loading: boolean;
  setMe: (id: string | null) => void;
}

const MeContext = createContext<MeContextValue>({
  me: null,
  options: [],
  loading: true,
  setMe: () => {},
});

export function MeProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<PlayerOption[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Pull active players once for the picker and the id → name lookup.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/players?status=active")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (cancelled || !data) return;
        // /api/players?status=active returns { players: [...] }
        const raw = Array.isArray(data?.players) ? data.players : [];
        const opts: PlayerOption[] = raw
          .map((p: { id: string; display_name?: string; name?: string }) => ({
            id: p.id,
            name: p.display_name ?? p.name ?? "Unknown",
          }))
          .sort((a: PlayerOption, b: PlayerOption) => a.name.localeCompare(b.name));
        setOptions(opts);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) setMeId(saved);
          } catch {
            // localStorage blocked — fine, just no persistence.
          }
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setMe = useCallback((id: string | null) => {
    setMeId(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<MeContextValue>(() => {
    const me = meId ? options.find((o) => o.id === meId) ?? null : null;
    return { me, options, loading, setMe };
  }, [meId, options, loading, setMe]);

  return <MeContext.Provider value={value}>{children}</MeContext.Provider>;
}

export function useMe() {
  return useContext(MeContext);
}
