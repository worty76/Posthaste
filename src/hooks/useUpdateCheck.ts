import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/ipc";
import type { UpdateInfo } from "../lib/types";

// One small request at most every 6 hours: frequent enough that a release
// is noticed the same day, rare enough that nobody notices the request.
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * State for the update banner and the Settings row. `update` is null until
 * a check finds something newer than this build. The last-check time lives
 * in memory, so the app checks once per launch and then every 6 hours.
 */
export function useUpdateCheck() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const lastCheckAt = useRef(0);

  /** Throws when the check itself fails; callers decide whether to show it. */
  const check = useCallback(async (): Promise<UpdateInfo | null> => {
    const found = await api.checkForUpdate();
    lastCheckAt.current = Date.now();
    setUpdate(found);
    return found;
  }, []);

  useEffect(() => {
    const maybeCheck = () => {
      if (Date.now() - lastCheckAt.current < CHECK_EVERY_MS) return;
      // A failed background check stays quiet: offline is normal.
      check().catch(() => undefined);
    };
    maybeCheck();
    const timer = setInterval(maybeCheck, CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [check]);

  const install = useCallback(async () => {
    setBusy(true);
    try {
      await api.installUpdate(); // restarts the app on success
    } finally {
      setBusy(false);
    }
  }, []);

  return { update, busy, check, install };
}
