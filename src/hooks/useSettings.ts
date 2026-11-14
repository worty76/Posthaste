import { useCallback, useEffect, useState } from "react";
import { api, on } from "../lib/ipc";
import type { Settings, SettingsState, ShortcutReport } from "../lib/types";

/**
 * Settings and shortcut registration status, kept current across windows.
 * `update` resolves with the applied state or rejects with an AppError,
 * leaving the previous settings in place.
 */
export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [shortcuts, setShortcuts] = useState<ShortcutReport | null>(null);

  const accept = useCallback((s: SettingsState) => {
    setSettings(s.settings);
    setShortcuts(s.shortcuts);
  }, []);

  const reload = useCallback(() => api.settingsGet().then(accept, () => undefined), [accept]);

  useEffect(() => {
    void reload();
    // Another window changed something: shortcut status may differ too.
    return on("settings-changed", () => void reload());
  }, [reload]);

  const update = useCallback(
    async (patch: Partial<Settings>) => {
      if (!settings) return;
      const applied = await api.settingsUpdate({ ...settings, ...patch });
      accept(applied);
    },
    [settings, accept],
  );

  return { settings, shortcuts, update, accept };
}
