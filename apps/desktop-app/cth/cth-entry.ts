// CTH service entry — runs the FULL munder-difflin main process (hive,
// agent PTY spawning, durable db, git, triggers, integrations) as the
// service layer of the RADAS desktop app, WITHOUT munder's own windows:
// the RADAS console window (loading the console's /office route) is the UI,
// talking to these services through the cth preload bridge (window.cth).

import "./main/index";
