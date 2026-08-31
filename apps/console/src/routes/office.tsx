// AI Office — the full munder-difflin app (office floor + agent panels)
// vendored into the console. In the desktop app, window.cth is the REAL
// harness bridge (hive/pty/db via the cth main process); in a plain browser
// tab it degrades through the cthShim.
import "@/components/office/cthShim";
import "@/office-app/design/global.css";
import "@/office-app/i18n";
import { App as OfficeApp } from "@office/App";

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/office")({
  component: OfficeRoute,
});

function OfficeRoute() {
  return <OfficeApp />;
}
