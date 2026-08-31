const { app } = require("electron");
console.log("[abi-test] stage 1: electron only");
app.whenReady().then(() => {
  console.log("[abi-test] stage 2: ready");
  try { require("better-sqlite3"); console.log("[abi-test] sqlite OK"); } catch (e) { console.log("[abi-test] sqlite FAIL", e.message); }
  try { const pty = require("node-pty"); console.log("[abi-test] pty OK"); const p = pty.spawn("/bin/echo", ["hi"]); p.onData(() => {}); } catch (e) { console.log("[abi-test] pty FAIL", e.message); }
  setTimeout(() => { console.log("[abi-test] done"); app.quit(); }, 1000);
});
