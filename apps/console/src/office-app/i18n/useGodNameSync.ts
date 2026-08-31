// @ts-nocheck — vendored from chaitanyagiri/munder-difflin (upstream has its own typecheck)
import { useEffect } from 'react';
import { useStore } from '@office/store/store';
import { setGodName } from './index';

/**
 * Keep i18n's `{{godName}}` pointed at the orchestrator's real name.
 *
 * Mounted once, near the root. Reads the live agent (which is what a rename
 * updates) and pushes it into i18next's default variables, so every string that
 * mentions the orchestrator follows the rename immediately, in both locales,
 * without any of those call sites knowing the name.
 */
export function useGodNameSync(): void {
  const name = useStore((s) => s.agents.find((a) => a.isGod)?.name);
  useEffect(() => { setGodName(name); }, [name]);
}
