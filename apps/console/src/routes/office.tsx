// AI Office — the full munder-difflin app (office floor + agent panels)
// vendored into the console. The Electron harness behind window.cth is
// shimmed (degraded) in browser mode; the desktop app will expose the real
// bridge via its preload in a later phase.
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
