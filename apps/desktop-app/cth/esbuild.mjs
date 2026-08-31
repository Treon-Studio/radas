import * as esbuild from "esbuild";

const pkg = (await import("../package.json", { with: { type: "json" } })).default;
const define = {
  __APP_VERSION__: JSON.stringify(pkg.version),
  __POSTHOG_KEY__: JSON.stringify(process.env.POSTHOG_KEY ?? ""),
  __POSTHOG_HOST__: JSON.stringify(process.env.POSTHOG_HOST ?? "https://us.i.posthog.com"),
  __MD_SHELL_FENCE__: JSON.stringify(""),
};

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
  define,
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
  define,
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
  define,
});

console.log("cth bundles built");
