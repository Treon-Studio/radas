import * as esbuild from "esbuild";

const external = [
  "electron",
  "better-sqlite3",
  "node-pty",
  "posthog-node",
  "electron-updater",
  "localtunnel",
  "tunnelmole",
];

await esbuild.build({
  entryPoints: ["cth/cth-entry.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-cth/main.cjs",
  external,
  sourcemap: "inline",
  target: "node20",
});

await esbuild.build({
  entryPoints: ["cth/preload/index.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-cth/preload.cjs",
  external,
  sourcemap: "inline",
  target: "node20",
});

await esbuild.build({
  entryPoints: ["cth/console-preload.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-cth/console-preload.cjs",
  external,
  sourcemap: "inline",
  target: "node20",
});

console.log("cth bundles built");
