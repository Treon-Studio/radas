// AI Office — the munder-difflin virtual office floor (PixiJS) ported into
// the RADAS console. Renders an animated office of characters going about
// agent-flavored activities. Standalone from the agent harness: the office
// store is a local shim with a mock cast.
import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
// Install the cth bridge shim BEFORE the scene mounts (module-scope side
// effect) so OfficeFloor's harness calls degrade instead of crashing.
import "@/components/office/cthShim";
import { OfficeFloor } from "@/components/office/OfficeFloor";
import { startMockLoop, stopMockLoop } from "@/components/office/mockEvents";

export const Route = createFileRoute("/office")({
  component: OfficeRoute,
});

function OfficeRoute() {
  // Drive the floor's life: agents commute, work, carry tools, and fly
  // handoff envelopes. Stopped when the office unmounts.
  useEffect(() => {
    startMockLoop();
    return () => stopMockLoop();
  }, []);
  return <OfficeFloor />;
}
