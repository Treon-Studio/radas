// AI Office — the munder-difflin virtual office floor (PixiJS) ported into
// the RADAS console. Renders an animated office of characters going about
// agent-flavored activities. Standalone from the agent harness: the office
// store is a local shim with a mock cast.
import { createFileRoute } from "@tanstack/react-router";
// Install the cth bridge shim BEFORE the scene mounts (module-scope side
// effect) so OfficeFloor's harness calls degrade instead of crashing.
import "@/components/office/cthShim";
import { OfficeFloor } from "@/components/office/OfficeFloor";

export const Route = createFileRoute("/office")({
  component: OfficeFloor,
});
