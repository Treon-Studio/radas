// CTH service entry — runs the FULL munder-difflin main process (hive,
// agent PTY spawning, durable db, git, triggers, integrations) as the
// service layer of the RADAS desktop app, WITHOUT munder's own windows:
// the RADAS console window (loading the console's /office route) is the UI,
// talking to these services through the cth preload bridge (window.cth).

// Fresh userData for the cth services — the default munder-difflin dir may
// hold stale locks from a disk-full crash (better-sqlite3 opening its db
// there hung uninterruptibly).
import { app } from "electron";
app.setPath("userData", app.getPath("userData") + "-cth");

import "./main/index";
