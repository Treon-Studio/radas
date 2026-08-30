// window.cth shim — the munder-difflin scene talks to the agent harness
// through a preload-exposed `window.cth` bridge (hiveTasks / onHiveMessage).
// The console has no such bridge; without this shim OfficeFloor crashes on
// `window.cth.onHiveMessage` (undefined). Every consumer here handles a null
// result gracefully, so the shim degrades the scene to "no live hive" — the
// demo event path (cth:demo-handoff) still drives the animation.

interface CthBridge {
  hiveTasks: () => Promise<null>;
  onHiveMessage: (listener: (event: { from: string; targets: string[]; act: string; needsHuman: boolean }) => void) => () => void;
  [key: string]: unknown;
}

declare global {
  interface Window {
    cth?: CthBridge;
  }
}

export function installCthShim(): void {
  if (typeof window === "undefined" || window.cth) return;
  window.cth = {
    hiveTasks: async () => null,
    onHiveMessage: () => {
      // no live hive — return a no-op unsubscribe
      return () => {};
    },
  };
}

installCthShim();
