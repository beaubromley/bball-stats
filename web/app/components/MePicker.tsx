"use client";

import { useMe } from "./MeContext";

/**
 * Compact "Viewing as: ..." picker for the nav. Saves selection to
 * localStorage via MeContext; the rest of the site reads useMe() and
 * applies highlights/extensions accordingly.
 */
export default function MePicker() {
  const { me, options, setMe, loading } = useMe();

  if (loading || options.length === 0) return null;

  return (
    <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
      <span className="font-display uppercase tracking-wider hidden sm:inline">
        You:
      </span>
      <select
        value={me?.id ?? ""}
        onChange={(e) => setMe(e.target.value || null)}
        className="bg-transparent border border-gray-300 dark:border-gray-700 rounded px-2 py-1 text-xs text-gray-700 dark:text-gray-300 focus:outline-none focus:border-blue-500 max-w-[140px]"
      >
        <option value="">— Pick —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
