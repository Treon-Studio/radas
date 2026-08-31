"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// cth/main/kg-core.cjs
var require_kg_core = __commonJS({
  "cth/main/kg-core.cjs"(exports2, module2) {
    "use strict";
    var fs = require("node:fs");
    var path3 = require("node:path");
    var crypto = require("node:crypto");
    var { spawnSync: spawnSync6 } = require("node:child_process");
    var DEFAULT_CHUNK_SIZE = 1200;
    var DEFAULT_CHUNK_OVERLAP = 150;
    var MAX_INDEX_BYTES = 5 * 1024 * 1024;
    var DEFAULT_SEARCH_LIMIT = 8;
    var SNIPPET_RADIUS = 160;
    var STOPWORDS = new Set(
      "a an and are as at be but by for from has have how in is it its of on or that the their this to was were what when where which who will with your you we our us they them he she his her i me my do does did not can could would should about into over than then there here so if no yes".split(" ")
    );
    var IMAGE_EXTS = /* @__PURE__ */ new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "tif", "tiff", "heic"]);
    var CODE_EXTS = /* @__PURE__ */ new Set([
      "ts",
      "tsx",
      "js",
      "jsx",
      "mjs",
      "cjs",
      "py",
      "go",
      "rs",
      "java",
      "rb",
      "c",
      "h",
      "cc",
      "cpp",
      "hpp",
      "cs",
      "php",
      "swift",
      "kt",
      "scala",
      "sh",
      "bash",
      "zsh",
      "sql"
    ]);
    var SHEET_EXTS = /* @__PURE__ */ new Set(["csv", "tsv"]);
    var TEXT_EXTS = /* @__PURE__ */ new Set([
      "md",
      "markdown",
      "mdx",
      "txt",
      "text",
      "rst",
      "json",
      "jsonl",
      "yaml",
      "yml",
      "toml",
      "ini",
      "log",
      "html",
      "htm",
      "css",
      "xml",
      "env"
    ]);
    var MIME_BY_EXT2 = {
      md: "text/markdown",
      markdown: "text/markdown",
      txt: "text/plain",
      json: "application/json",
      csv: "text/csv",
      tsv: "text/tab-separated-values",
      yaml: "application/yaml",
      yml: "application/yaml",
      html: "text/html",
      htm: "text/html",
      pdf: "application/pdf",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml"
    };
    function genId() {
      return crypto.randomBytes(8).toString("hex");
    }
    function extOf(p) {
      return path3.extname(String(p || "")).replace(/^\./, "").toLowerCase();
    }
    function mimeFor(p) {
      return MIME_BY_EXT2[extOf(p)] || "application/octet-stream";
    }
    function ensureDir(d) {
      fs.mkdirSync(d, { recursive: true });
    }
    function nowIso() {
      return (/* @__PURE__ */ new Date()).toISOString();
    }
    function clampLimit2(n, fallback) {
      const v = Math.floor(Number(n));
      if (!Number.isFinite(v) || v <= 0) return fallback;
      return Math.min(100, v);
    }
    function detectModality(filePath) {
      const e = extOf(filePath);
      if (IMAGE_EXTS.has(e)) return "image";
      if (e === "pdf") return "pdf";
      if (SHEET_EXTS.has(e)) return "sheet";
      if (CODE_EXTS.has(e)) return "code";
      if (TEXT_EXTS.has(e)) return "text";
      return "text";
    }
    function tokenize(s) {
      const m = String(s || "").toLowerCase().match(/[a-z0-9]+/g);
      if (!m) return [];
      return m.filter((t) => t.length > 1 && !STOPWORDS.has(t));
    }
    function deriveTitle(text) {
      const lines = String(text || "").split("\n");
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        const h = line.replace(/^#+\s*/, "").trim();
        return h.length > 80 ? h.slice(0, 80) + "\u2026" : h;
      }
      return "";
    }
    function chunkText(text, opts = {}) {
      const size = Math.max(200, opts.size ?? DEFAULT_CHUNK_SIZE);
      const overlap = Math.min(opts.overlap ?? DEFAULT_CHUNK_OVERLAP, Math.floor(size / 2));
      const t = String(text || "").replace(/\r\n/g, "\n").trim();
      if (!t) return [];
      if (t.length <= size) return [t];
      const chunks = [];
      let i = 0;
      while (i < t.length) {
        let end = Math.min(i + size, t.length);
        if (end < t.length) {
          const window = t.slice(i, end);
          const br = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"), window.lastIndexOf(" "));
          if (br > size * 0.6) end = i + br;
        }
        const piece = t.slice(i, end).trim();
        if (piece) chunks.push(piece);
        if (end >= t.length) break;
        i = Math.max(end - overlap, i + 1);
      }
      return chunks;
    }
    function scoreChunk(rec, queryTerms, queryRaw) {
      if (!queryTerms.length) return 0;
      const text = String(rec.text || "");
      const titleLc = String(rec.title || "").toLowerCase();
      const tf = /* @__PURE__ */ Object.create(null);
      for (const tok of tokenize(text)) tf[tok] = (tf[tok] || 0) + 1;
      let score = 0;
      let matched = 0;
      for (const term of queryTerms) {
        const c = tf[term] || 0;
        if (c > 0) {
          matched++;
          score += 1 + Math.log(1 + c);
        }
        if (titleLc.includes(term)) score += 2;
      }
      if (matched === 0) return 0;
      score += matched * 0.5;
      const q = String(queryRaw || "").trim().toLowerCase();
      if (q.length >= 3 && text.toLowerCase().includes(q)) score += 5;
      return score;
    }
    function makeSnippet(text, queryTerms) {
      const t = String(text || "").replace(/\s+/g, " ").trim();
      if (!t) return "";
      const lc = t.toLowerCase();
      let at = -1;
      for (const term of queryTerms) {
        const idx = lc.indexOf(term);
        if (idx !== -1 && (at === -1 || idx < at)) at = idx;
      }
      if (at === -1) return t.length > SNIPPET_RADIUS * 2 ? t.slice(0, SNIPPET_RADIUS * 2) + "\u2026" : t;
      const start = Math.max(0, at - SNIPPET_RADIUS);
      const end = Math.min(t.length, at + SNIPPET_RADIUS);
      return (start > 0 ? "\u2026" : "") + t.slice(start, end).trim() + (end < t.length ? "\u2026" : "");
    }
    function extractText(input) {
      const { srcPath, inlineText, modality, title, caption, tags, source } = input;
      if (typeof inlineText === "string" && inlineText.length) {
        return { text: inlineText, title: title || deriveTitle(inlineText) || source, extractor: "inline@1", mime: "text/plain" };
      }
      if (modality === "image") {
        const parts = [title, caption, ...tags || [], source].filter(Boolean);
        return { text: parts.join("\n"), title: title || source, extractor: "image-meta@1", mime: mimeFor(srcPath) };
      }
      if (modality === "pdf") {
        const out = tryPdfToText(srcPath);
        if (out != null && out.trim()) {
          return { text: out, title: title || deriveTitle(out) || source, extractor: "pdftotext@1", mime: "application/pdf" };
        }
        const parts = [title, caption, ...tags || [], source].filter(Boolean);
        return { text: parts.join("\n"), title: title || source, extractor: "pdf-pending@1", mime: "application/pdf" };
      }
      if (srcPath && fs.existsSync(srcPath)) {
        let raw = "";
        try {
          raw = fs.readFileSync(srcPath, "utf8");
        } catch {
          raw = "";
        }
        return { text: raw, title: title || deriveTitle(raw) || source, extractor: "text-utf8@1", mime: mimeFor(srcPath) };
      }
      return { text: inlineText || "", title: title || source || "untitled", extractor: "empty@1", mime: "text/plain" };
    }
    function tryPdfToText(srcPath) {
      if (!srcPath || !fs.existsSync(srcPath)) return null;
      try {
        const res = spawnSync6("pdftotext", ["-q", srcPath, "-"], { encoding: "utf8", timeout: 2e4, maxBuffer: 32 * 1024 * 1024 });
        if (res.status === 0 && typeof res.stdout === "string") return res.stdout;
      } catch {
      }
      return null;
    }
    function ingest(kgRoot, input = {}) {
      ensureDir(kgRoot);
      ensureDir(path3.join(kgRoot, "docs"));
      const docId = input.id || genId();
      const docDir = path3.join(kgRoot, "docs", docId);
      ensureDir(docDir);
      const srcPath = input.srcPath || null;
      const inlineText = input.text != null ? input.text : input.inlineText;
      const source = input.source || (srcPath ? path3.basename(srcPath) : input.title || "untitled");
      const modality = input.modality || (srcPath ? detectModality(srcPath) : "text");
      const origExt = srcPath ? extOf(srcPath) || "bin" : "txt";
      const tags = Array.isArray(input.tags) ? input.tags.map(String) : [];
      let bytes = 0;
      if (srcPath && fs.existsSync(srcPath)) {
        try {
          bytes = fs.statSync(srcPath).size;
          fs.copyFileSync(srcPath, path3.join(docDir, "original." + origExt));
        } catch {
        }
      }
      const ex = extractText({ srcPath, inlineText, modality, title: input.title, caption: input.caption, tags, source });
      const fullText = String(ex.text || "");
      fs.writeFileSync(path3.join(docDir, "text.md"), fullText, "utf8");
      let indexText = fullText;
      let truncated = false;
      if (indexText.length > MAX_INDEX_BYTES) {
        indexText = indexText.slice(0, MAX_INDEX_BYTES);
        truncated = true;
      }
      const title = input.title || ex.title || source;
      let chunks = chunkText(indexText);
      if (chunks.length === 0) chunks = [String(title)];
      const lines = chunks.map((c, i) => JSON.stringify({ docId, title, source, modality, chunkIdx: i, text: c }));
      fs.appendFileSync(path3.join(kgRoot, "index.jsonl"), lines.join("\n") + "\n", "utf8");
      const meta = {
        id: docId,
        title,
        source,
        modality,
        mime: ex.mime || null,
        origExt,
        bytes,
        tags,
        caption: input.caption || null,
        chunkCount: chunks.length,
        addedAt: nowIso(),
        extractor: ex.extractor,
        truncated
      };
      fs.writeFileSync(path3.join(docDir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
      return { docId, chunkCount: chunks.length, meta };
    }
    function search(kgRoot, query, opts = {}) {
      const limit = clampLimit2(opts.limit, DEFAULT_SEARCH_LIMIT);
      const queryTerms = tokenize(query);
      if (!queryTerms.length) return [];
      const idxPath = path3.join(kgRoot, "index.jsonl");
      if (!fs.existsSync(idxPath)) return [];
      const scored = [];
      const lines = fs.readFileSync(idxPath, "utf8").split("\n");
      for (const line of lines) {
        const s = line.trim();
        if (!s) continue;
        let rec;
        try {
          rec = JSON.parse(s);
        } catch {
          continue;
        }
        const sc = scoreChunk(rec, queryTerms, query);
        if (sc > 0) scored.push({ rec, score: sc });
      }
      scored.sort((a, b) => b.score - a.score || String(a.rec.docId).localeCompare(String(b.rec.docId)) || a.rec.chunkIdx - b.rec.chunkIdx);
      return scored.slice(0, limit).map(({ rec, score }) => ({
        docId: rec.docId,
        title: rec.title,
        source: rec.source,
        modality: rec.modality,
        chunkIdx: rec.chunkIdx,
        score: Math.round(score * 1e3) / 1e3,
        snippet: makeSnippet(rec.text, queryTerms)
      }));
    }
    function list(kgRoot) {
      const docsDir = path3.join(kgRoot, "docs");
      if (!fs.existsSync(docsDir)) return [];
      const out = [];
      for (const id of fs.readdirSync(docsDir)) {
        try {
          out.push(JSON.parse(fs.readFileSync(path3.join(docsDir, id, "meta.json"), "utf8")));
        } catch {
        }
      }
      return out.sort((a, b) => String(b.addedAt || "").localeCompare(String(a.addedAt || "")));
    }
    function getDoc(kgRoot, docId) {
      const docDir = path3.join(kgRoot, "docs", String(docId || ""));
      if (!docId || !fs.existsSync(docDir)) return null;
      let meta = null;
      try {
        meta = JSON.parse(fs.readFileSync(path3.join(docDir, "meta.json"), "utf8"));
      } catch {
      }
      if (!meta) return null;
      let text = "";
      try {
        text = fs.readFileSync(path3.join(docDir, "text.md"), "utf8");
      } catch {
      }
      return { meta, text };
    }
    function removeDoc(kgRoot, docId) {
      const docDir = path3.join(kgRoot, "docs", String(docId || ""));
      if (!docId || !fs.existsSync(docDir)) return false;
      fs.rmSync(docDir, { recursive: true, force: true });
      const idxPath = path3.join(kgRoot, "index.jsonl");
      if (fs.existsSync(idxPath)) {
        const kept = fs.readFileSync(idxPath, "utf8").split("\n").filter((line) => {
          const s = line.trim();
          if (!s) return false;
          try {
            return JSON.parse(s).docId !== docId;
          } catch {
            return false;
          }
        });
        fs.writeFileSync(idxPath, kept.length ? kept.join("\n") + "\n" : "", "utf8");
      }
      return true;
    }
    function stats(kgRoot) {
      const docs = list(kgRoot);
      let chunkCount = 0;
      const byModality = /* @__PURE__ */ Object.create(null);
      for (const d of docs) {
        chunkCount += d.chunkCount || 0;
        byModality[d.modality] = (byModality[d.modality] || 0) + 1;
      }
      return { docCount: docs.length, chunkCount, byModality };
    }
    module2.exports = {
      ingest,
      search,
      list,
      getDoc,
      removeDoc,
      stats,
      detectModality,
      extractText,
      chunkText,
      tokenize,
      scoreChunk,
      makeSnippet,
      deriveTitle,
      DEFAULT_CHUNK_SIZE,
      DEFAULT_CHUNK_OVERLAP
    };
  }
});

// cth/main/slack-trigger.cjs
var require_slack_trigger = __commonJS({
  "cth/main/slack-trigger.cjs"(exports2, module2) {
    "use strict";
    var ACTIVATED_THREADS_MAX = 500;
    var MAX_FILES_PER_MESSAGE = 10;
    var SEEN_EVENTS_MAX = 500;
    var ActivatedThreads = class {
      constructor(maxSize = ACTIVATED_THREADS_MAX) {
        this.maxSize = maxSize;
        this._set = /* @__PURE__ */ new Set();
        this._order = [];
      }
      add(threadTs) {
        if (this._set.has(threadTs)) return;
        if (this._set.size >= this.maxSize) {
          const oldest = this._order.shift();
          if (oldest !== void 0) this._set.delete(oldest);
        }
        this._set.add(threadTs);
        this._order.push(threadTs);
      }
      has(threadTs) {
        return this._set.has(threadTs);
      }
      get size() {
        return this._set.size;
      }
    };
    var SeenEvents = class {
      constructor(maxSize = SEEN_EVENTS_MAX) {
        this.maxSize = maxSize;
        this._set = /* @__PURE__ */ new Set();
        this._order = [];
      }
      /**
       * Record `key` and report whether it was ALREADY present.
       * @returns {boolean} true if `key` was seen before (caller should skip as a
       *          duplicate); false if it is new (now recorded — caller should process).
       *          Empty/falsy keys are never deduped: they always return false and are
       *          not stored (so a malformed event can't poison or fill the cache).
       */
      seen(key) {
        if (!key) return false;
        if (this._set.has(key)) return true;
        if (this._set.size >= this.maxSize) {
          const oldest = this._order.shift();
          if (oldest !== void 0) this._set.delete(oldest);
        }
        this._set.add(key);
        this._order.push(key);
        return false;
      }
      get size() {
        return this._set.size;
      }
    };
    function dedupKey(ev) {
      if (!ev) return "";
      const channel = typeof ev.channel === "string" ? ev.channel : "";
      const ts = typeof ev.ts === "string" ? ev.ts : "";
      return channel && ts ? `${channel}:${ts}` : "";
    }
    function shouldTrigger(ev, botUserId, channelId, activatedThreads) {
      if (!ev) return { trigger: false, text: "", files: [] };
      const channelOk = !channelId || ev.channel === channelId;
      if (!channelOk) return { trigger: false, text: "", files: [] };
      if (ev.bot_id || ev.subtype && ev.subtype !== "file_share") {
        return { trigger: false, text: "", files: [] };
      }
      const text = typeof ev.text === "string" ? ev.text : "";
      const isMention = ev.type === "app_mention" || ev.type === "message" && botUserId != null && text.includes(`<@${botUserId}>`) || ev.subtype === "file_share" && botUserId != null && text.includes(`<@${botUserId}>`);
      const isActivatedThread = !!(ev.thread_ts && activatedThreads.has(ev.thread_ts));
      if (!isMention && !isActivatedThread) return { trigger: false, text: "", files: [] };
      if (isMention) {
        const threadRoot = ev.thread_ts || ev.ts;
        if (threadRoot) activatedThreads.add(threadRoot);
      }
      const files = (Array.isArray(ev.files) ? ev.files : []).filter((f) => f && typeof f.url_private === "string" && f.url_private).slice(0, MAX_FILES_PER_MESSAGE).map((f) => ({
        id: f.id,
        url_private: f.url_private,
        name: typeof f.name === "string" ? f.name : void 0,
        mimetype: typeof f.mimetype === "string" ? f.mimetype : void 0,
        size: typeof f.size === "number" ? f.size : void 0
      }));
      return { trigger: true, text, files };
    }
    module2.exports = {
      shouldTrigger,
      ActivatedThreads,
      SeenEvents,
      dedupKey,
      ACTIVATED_THREADS_MAX,
      SEEN_EVENTS_MAX,
      MAX_FILES_PER_MESSAGE
    };
  }
});

// cth/main/console-assets.cjs
var require_console_assets = __commonJS({
  "cth/main/console-assets.cjs"(exports2, module2) {
    "use strict";
    var { existsSync: existsSync18, statSync: statSync11 } = require("node:fs");
    var { extname, join: join17, resolve: resolve4, sep: sep3 } = require("node:path");
    function resolveConsoleAsset2(consoleRoot, requestUrl) {
      const match = requestUrl.match(/^[a-z][a-z\d+.-]*:\/\/[^/]*(\/[^?#]*)?/i);
      if (!match) return { status: 400 };
      let pathname;
      try {
        pathname = decodeURIComponent(match[1] || "/");
      } catch {
        return { status: 400 };
      }
      const candidate = resolve4(consoleRoot, `.${pathname}`);
      if (candidate !== consoleRoot && !candidate.startsWith(`${consoleRoot}${sep3}`)) {
        return { status: 403 };
      }
      if (existsSync18(candidate) && statSync11(candidate).isFile()) {
        return { status: 200, filePath: candidate };
      }
      if (extname(pathname)) return { status: 404 };
      return { status: 200, filePath: join17(consoleRoot, "index.html") };
    }
    function startupDiagnosticHtml2(isPackaged) {
      const guidance = isPackaged ? "The bundled console assets are missing or invalid. Reinstall RADAS or rebuild the desktop package." : "Start the console on port 8080, or set CONSOLE_URL, then relaunch RADAS.";
      return `<!doctype html>
    <html><head><meta charset="utf-8"><title>RADAS startup</title></head>
    <body style="font:16px system-ui;padding:32px;background:#fff8e7;color:#29251f">
      <h1>RADAS could not load the console</h1>
      <p>${guidance}</p>
    </body></html>`;
    }
    module2.exports = { resolveConsoleAsset: resolveConsoleAsset2, startupDiagnosticHtml: startupDiagnosticHtml2 };
  }
});

// cth/main/index.ts
var import_electron10 = require("electron");
var import_node_child_process8 = require("node:child_process");
var import_node_fs19 = require("node:fs");
var import_node_crypto8 = require("node:crypto");
var import_node_path20 = require("node:path");
var import_node_os6 = require("node:os");
var import_node_url = require("node:url");
var import_node_https4 = require("node:https");

// cth/main/pty.ts
var pty = __toESM(require("node-pty"));
var import_node_fs2 = require("node:fs");
var import_node_path2 = require("node:path");
var import_node_child_process3 = require("node:child_process");

// cth/main/procKill.ts
var import_node_child_process = require("node:child_process");
var KILL_GRACE_MS = 4e3;
function hardKillTree(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return;
  if (process.platform === "win32") {
    try {
      (0, import_node_child_process.spawnSync)("taskkill", ["/pid", String(pid), "/T", "/F"], { timeout: 1e4 });
    } catch {
    }
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
    }
  }
}
function ensureKilled(pid, graceMs = KILL_GRACE_MS) {
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) return;
  const t = setTimeout(() => hardKillTree(pid), graceMs);
  t.unref?.();
}

// cth/main/fs.ts
var import_promises = require("node:fs/promises");
var import_node_path = require("node:path");
var import_node_os = require("node:os");

// cth/shared/imageTypes.ts
var MIME_BY_EXT = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
  avif: "image/avif",
  svg: "image/svg+xml"
};
function extensionOf(p) {
  if (typeof p !== "string") return "";
  const clean = p.split("#")[0].split("?")[0];
  const base = clean.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot < 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}
function imageMimeForPath(p) {
  return MIME_BY_EXT[extensionOf(p)] ?? null;
}

// cth/main/fs.ts
function safeJoin(root, rel) {
  const absRoot = (0, import_node_path.resolve)(root);
  const absPath = (0, import_node_path.isAbsolute)(rel) ? (0, import_node_path.normalize)(rel) : (0, import_node_path.resolve)(absRoot, rel);
  const rel2 = (0, import_node_path.relative)(absRoot, absPath);
  if (rel2.startsWith("..") || (0, import_node_path.isAbsolute)(rel2)) return null;
  return absPath;
}
async function listDir(root, rel) {
  const abs = safeJoin(root, rel);
  if (!abs) return { ok: false, error: "path escapes root" };
  try {
    const names = await (0, import_promises.readdir)(abs);
    const entries = await Promise.all(names.map(async (name) => {
      try {
        const s = await (0, import_promises.stat)((0, import_node_path.join)(abs, name));
        return { name, isDir: s.isDirectory(), size: s.size, mtime: s.mtimeMs };
      } catch {
        return { name, isDir: false, size: 0, mtime: 0 };
      }
    }));
    entries.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return { ok: true, entries, path: abs };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
var MAX_READ_BYTES = 2 * 1024 * 1024;
async function readFileText(root, rel) {
  const abs = safeJoin(root, rel);
  if (!abs) return { ok: false, error: "path escapes root" };
  try {
    const s = await (0, import_promises.stat)(abs);
    if (s.size > MAX_READ_BYTES) {
      return { ok: false, error: `file too large (${(s.size / 1024 / 1024).toFixed(1)} MB)` };
    }
    const buf = await (0, import_promises.readFile)(abs);
    if (buf.includes(0)) return { ok: false, error: "binary file (not displayable)" };
    return { ok: true, content: buf.toString("utf8"), path: abs, size: s.size };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
var MAX_BINARY_READ_BYTES = 10 * 1024 * 1024;
async function readFileBinary(root, rel, maxBytes = MAX_BINARY_READ_BYTES) {
  const abs = safeJoin(root, rel);
  if (!abs) return { ok: false, error: "path escapes root" };
  try {
    const s = await (0, import_promises.stat)(abs);
    if (!s.isFile()) return { ok: false, error: "not a regular file" };
    if (s.size > maxBytes) {
      return { ok: false, error: `file too large (${(s.size / 1024 / 1024).toFixed(1)} MB)` };
    }
    const buf = await (0, import_promises.readFile)(abs);
    if (buf.byteLength > maxBytes) {
      return { ok: false, error: "file grew past the size limit while reading" };
    }
    const bytes = new Uint8Array(buf.byteLength);
    bytes.set(buf);
    return {
      ok: true,
      bytes,
      mime: imageMimeForPath(abs) ?? "application/octet-stream",
      path: abs,
      size: s.size
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
async function writeFileText(root, rel, content) {
  const abs = safeJoin(root, rel);
  if (!abs) return { ok: false, error: "path escapes root" };
  try {
    await (0, import_promises.writeFile)(abs, content, "utf8");
    return { ok: true, path: abs };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
function expandTilde(p) {
  if (typeof p !== "string") return p;
  const t = p.trim();
  if (!t) return p;
  let out = t;
  if (t === "~") out = (0, import_node_os.homedir)();
  else if (t.startsWith("~/") || t.startsWith("~\\")) out = (0, import_node_path.join)((0, import_node_os.homedir)(), t.slice(2));
  if (!(0, import_node_path.isAbsolute)(out)) return t;
  return (0, import_node_path.resolve)(out);
}
function normalizeHiveHome(home, prior = [], cap = 8) {
  const abs = expandTilde(home);
  const seen = /* @__PURE__ */ new Set([abs]);
  const recentHives = [abs];
  for (const h of prior) {
    if (typeof h !== "string" || !h.trim()) continue;
    const e = expandTilde(h);
    if (seen.has(e)) continue;
    seen.add(e);
    recentHives.push(e);
  }
  return { home: abs, recentHives: recentHives.slice(0, cap) };
}
async function statAbs(p) {
  const abs = expandTilde(p);
  if (!(0, import_node_path.isAbsolute)(abs)) return { exists: false, isFile: false, path: p };
  try {
    const s = await (0, import_promises.stat)(abs);
    return { exists: true, isFile: s.isFile(), path: abs };
  } catch {
    return { exists: false, isFile: false, path: abs };
  }
}

// cth/main/ptyEnv.ts
var CLAUDE_MARKER_RE = /^CLAUDE(CODE|_)/;
var CLAUDE_CONFIG_KEEP = /* @__PURE__ */ new Set([
  "CLAUDE_CONFIG_DIR",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX"
]);
function buildPtyEnv(parentEnv, userPath, agentEnv, platform = process.platform) {
  const inherited = {};
  for (const [k, v] of Object.entries(parentEnv)) {
    if (v === void 0) continue;
    if (CLAUDE_MARKER_RE.test(k) && !CLAUDE_CONFIG_KEEP.has(k)) continue;
    inherited[k] = v;
  }
  return {
    ...inherited,
    PATH: userPath,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    // Help apps that look for a real interactive shell
    FORCE_COLOR: "1",
    // A Finder/Dock-launched Electron app inherits NO locale from launchd
    // (`launchctl getenv LANG` is empty), so without this every child runs in
    // the C/POSIX locale — where macOS's CoreFoundation default text encoding
    // is Mac OS Roman (__CF_USER_TEXT_ENCODING=<uid>:0:0). Any locale-sensitive
    // tool an agent runs then decodes UTF-8 as MacRoman and paints mojibake
    // into the grid ("—" → "‚Äî"), which copy faithfully reproduces. This
    // terminal IS UTF-8 (xterm.js + Unicode11), so say so.
    //
    // LC_CTYPE only, deliberately: it is the character-encoding category. Using
    // LC_ALL would also override collation and date formatting for every user
    // who never exported a locale. A locale the user really did export wins.
    ...platform === "win32" ? {} : {
      LANG: parentEnv.LANG ?? "en_US.UTF-8",
      LC_CTYPE: parentEnv.LC_ALL ?? parentEnv.LC_CTYPE ?? parentEnv.LANG ?? "en_US.UTF-8"
    },
    // Per-agent hive identity (AGENT_ID, HIVE_ROOT, …) when provided.
    ...agentEnv ?? {}
  };
}

// cth/main/shellEnv.ts
var import_node_fs = require("node:fs");
var import_node_child_process2 = require("node:child_process");
var cachedPath = null;
var shellCapture = /* @__PURE__ */ new Map();
function captureFromLoginShell(script) {
  const cached = shellCapture.get(script);
  if (cached !== void 0) return cached;
  const value = captureFromLoginShellUncached(script);
  if (value !== null) shellCapture.set(script, value);
  return value;
}
function captureFromLoginShellUncached(script) {
  const mark = "__MD_SHELL_FENCE__";
  try {
    const res = (0, import_node_child_process2.spawnSync)(
      process.env.SHELL ?? "/bin/zsh",
      ["-ilc", `printf %s ${mark}; ${script}; printf %s ${mark}`],
      { encoding: "utf8", timeout: 3e3 }
    );
    const out = res.stdout ?? "";
    const start = out.indexOf(mark);
    const end = out.lastIndexOf(mark);
    if (start < 0 || end <= start) return null;
    return out.slice(start + mark.length, end);
  } catch {
    return null;
  }
}
function userShellPath() {
  if (cachedPath !== null) return cachedPath;
  if (process.platform === "win32") {
    cachedPath = process.env.PATH || "";
    return cachedPath;
  }
  const shellPath = captureFromLoginShell('printf %s "$PATH"')?.trim();
  cachedPath = shellPath && !shellPath.includes("\n") ? shellPath : process.env.PATH || "";
  return cachedPath;
}
function isSafeCommandName(command) {
  return /^[A-Za-z0-9._+-]+$/.test(command);
}
function resolveCommand(command) {
  if (command.includes("/") || command.includes("\\")) return command;
  if (!isSafeCommandName(command)) return command;
  if (process.platform === "win32") {
    try {
      const res = (0, import_node_child_process2.spawnSync)("where", [command], { encoding: "utf8", timeout: 3e3 });
      const path3 = (res.stdout ?? "").trim().split(/\r?\n/)[0];
      if (path3 && (0, import_node_fs.existsSync)(path3)) return path3;
    } catch {
    }
    const appData = process.env.APPDATA ?? "";
    const localAppData = process.env.LOCALAPPDATA ?? "";
    const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
    const winCandidates = [
      `${appData}\\npm\\${command}.cmd`,
      `${appData}\\npm\\${command}`,
      `${localAppData}\\Programs\\claude\\${command}.exe`,
      `${home}\\.claude\\local\\${command}.cmd`,
      `${home}\\.claude\\local\\${command}`
    ];
    for (const c of winCandidates) if ((0, import_node_fs.existsSync)(c)) return c;
    return command;
  }
  const which = captureFromLoginShell(`which ${command}`);
  if (which) {
    const path3 = which.trim().split("\n").map((l) => l.trim()).filter(Boolean).pop();
    if (path3 && (0, import_node_fs.existsSync)(path3)) return path3;
  }
  const candidates = [
    `/opt/homebrew/bin/${command}`,
    `/usr/local/bin/${command}`,
    `${process.env.HOME ?? ""}/.local/bin/${command}`,
    `${process.env.HOME ?? ""}/.claude/local/${command}`,
    `${process.env.HOME ?? ""}/.volta/bin/${command}`
  ];
  for (const c of candidates) if ((0, import_node_fs.existsSync)(c)) return c;
  return command;
}

// cth/main/pty.ts
function withHiveRuntimeFallback(path3, hiveRoot) {
  if (!hiveRoot) return path3;
  const dir = (0, import_node_path2.join)(hiveRoot, "bin", "runtime");
  if (!(0, import_node_fs2.existsSync)(dir)) return path3;
  const entries = path3.split(import_node_path2.delimiter).filter(Boolean);
  if (entries.includes(dir)) return path3;
  return [...entries, dir].join(import_node_path2.delimiter);
}
function buildCmdCommandLine(resolved, args) {
  const quoteToken = (s) => {
    const escaped = s.replace(/"/g, '\\"');
    return /[ \t"&|^<>()%!]/.test(s) ? `"${escaped}"` : escaped;
  };
  const inner = [resolved, ...args].map(quoteToken).join(" ");
  return `/d /s /c "${inner}"`;
}
var SHIM_INTERPRETERS = /* @__PURE__ */ new Set(["node", "bun", "deno"]);
var SHIM_SCRIPT_EXT = /\.(?:c|m)?js$/i;
function parseNpmCmdShim(shimPath, content) {
  if (typeof shimPath !== "string" || typeof content !== "string") return null;
  if (!shimPath || !content) return null;
  if (content.length > 8192 || content.includes("\0")) return null;
  const dir = import_node_path2.win32.dirname(shimPath);
  if (!dir || dir === ".") return null;
  const expand = (raw) => {
    let s = raw.replace(/%~dp0%?|%dp0%/gi, `${dir}\\`);
    if (s.includes("%")) return null;
    if (!s.trim()) return null;
    const unc = /^[\\/]{2}/.test(s);
    s = s.replace(/[\\/]+/g, "\\");
    if (unc) s = `\\${s}`;
    if (!import_node_path2.win32.isAbsolute(s)) return null;
    return import_node_path2.win32.normalize(s);
  };
  const progValues = [];
  for (const m of content.matchAll(/^\s*@?SET\s+"?_prog=([^"\r\n]*)"?/gim)) progValues.push(m[1]);
  const lines = content.split(/\r?\n/);
  let execLine = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes("%*")) {
      execLine = lines[i];
      break;
    }
  }
  if (!execLine) return null;
  const head = execLine.slice(0, execLine.lastIndexOf("%*"));
  const quoted = [...head.matchAll(/"([^"]*)"/g)].map((m) => ({
    text: m[1],
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length
  }));
  if (quoted.length === 0) return null;
  const scriptTok = quoted[quoted.length - 1];
  let progRaw;
  if (quoted.length >= 2) {
    const progTok = quoted[quoted.length - 2];
    if (head.slice(progTok.end, scriptTok.start).trim() !== "") return null;
    progRaw = progTok.text;
  } else {
    const before = head.slice(0, scriptTok.start).trim().replace(/^@/, "").trim();
    if (before === "") {
      const exe = expand(scriptTok.text);
      if (!exe) return null;
      if (!/\.(exe|com)$/i.test(exe)) return null;
      return { interpreter: null, scriptPath: exe };
    }
    const word = before.split(/\s+/).filter(Boolean).pop();
    if (!word || word !== before) return null;
    progRaw = word;
  }
  if (/^%_prog%$/i.test(progRaw)) {
    if (progValues.length === 0) return null;
    progRaw = progValues.find((v) => !/[%\\/]/.test(v)) ?? progValues[progValues.length - 1];
  }
  const interpreter = (progRaw.split(/[\\/]/).pop() ?? "").replace(/\.exe$/i, "").toLowerCase();
  if (!SHIM_INTERPRETERS.has(interpreter)) return null;
  const scriptPath = expand(scriptTok.text);
  if (!scriptPath || !SHIM_SCRIPT_EXT.test(scriptPath)) return null;
  return { interpreter, scriptPath };
}
var PtyManager = class {
  sessions = /* @__PURE__ */ new Map();
  webContents = null;
  /** Fired when a PTY exits on its OWN (child finished/crashed/killed
   *  externally), so the main process can run the SAME lifecycle teardown
   *  (archive, worktree removal, map cleanup) that the explicit kill() path
   *  runs. Best-effort — set once by the main process. */
  exitHandler = null;
  /** The default/fallback output sink — set to the PRIMARY window. Used only for
   *  sessions with no recorded owner; owned sessions route to their owner. */
  attachWebContents(wc) {
    this.webContents = wc;
  }
  /** Count live PTYs owned by a given window — used to scope a floor's
   *  close-confirmation to its OWN terminals, not the whole app's. */
  countByOwner(wc) {
    let n = 0;
    for (const s of this.sessions.values()) if (s.owner === wc) n++;
    return n;
  }
  /** Kill every PTY owned by a window (its onExit runs the normal teardown:
   *  archive + worktree cleanup). Called when a floor window closes so its
   *  terminals don't linger as orphaned processes writing to a dead webContents. */
  killByOwner(wc) {
    for (const [id, s] of [...this.sessions.entries()]) {
      if (s.owner === wc) {
        try {
          const pid = s.proc.pid;
          s.proc.kill();
          ensureKilled(pid);
        } catch {
        }
        void id;
      }
    }
  }
  /** Register the natural-exit teardown callback. Invoked from inside node-pty's
   *  onExit after the session is cleaned up. The exit code is forwarded so the
   *  handler can distinguish a clean exit (e.g. a successful first-time CLI
   *  install → auto restart-and-continue) from a crash. */
  setExitHandler(handler) {
    this.exitHandler = handler;
  }
  /** Send to the renderer only if it's still alive. During app quit, killing a
   *  PTY fires onExit asynchronously — by then app.quit() may have destroyed the
   *  window, and `.send()` on a destroyed webContents throws "Object has been
   *  destroyed", which surfaces as the main-process crash dialog. Guard it. */
  safeSend(channel, payload, target) {
    const wc = target ?? this.webContents;
    if (!wc || wc.isDestroyed()) return;
    try {
      wc.send(channel, payload);
    } catch {
    }
  }
  /** Whether an engine CLI is actually installed/locatable on this machine.
   *  Used PRE-SPAWN by the missing-CLI auto-install path: a bare `claude`/`codex`
   *  that resolveCommand can't locate would otherwise be spawned and die with
   *  "process exited (code 1)". Reuses the exact same `which`/`where` +
   *  candidate-dir logic as spawn(), so detection and spawning never disagree. */
  isCommandAvailable(command) {
    return this.resolveCommand(command).found;
  }
  /** The absolute path a bare command resolves to for THIS user, or null when it
   *  isn't installed. Same resolution + cache as spawn(), so a caller that probes
   *  a binary (e.g. `node --version`, to decide whether it is too old to keep)
   *  inspects exactly the executable an agent would have run. */
  commandPath(command) {
    const r = this.resolveCommand(command);
    return r.found ? r.path : null;
  }
  /** Session cache of SUCCESSFUL command resolutions. Each miss costs a full
   *  interactive-shell launch (`$SHELL -ilc which …` sources the user's whole
   *  zshrc — nvm/asdf init is routinely ~1s) run synchronously on the main
   *  process, and every agent spawn used to pay it TWICE (pre-check + spawn) —
   *  a multi-second all-windows freeze per spawn, ×N on a team restore.
   *  Negatives are deliberately NOT cached: the missing-CLI auto-install path
   *  must see a just-installed binary on its re-check. */
  resolvedCommands = /* @__PURE__ */ new Map();
  /** Resolve a bare command (e.g. 'claude') against the user's PATH +
   *  common install locations. Needed because Electron's spawn env on
   *  macOS launches without the user's interactive shell PATH. Returns the
   *  best path AND whether an existing executable was actually located (`found`):
   *  when nothing is found, `path` falls back to the bare command (spawn would
   *  ENOENT) and `found` is false — the signal the missing-CLI path keys on. */
  resolveCommand(command) {
    const cached = this.resolvedCommands.get(command);
    if (cached && (0, import_node_fs2.existsSync)(cached.path)) return cached;
    const res = this.resolveCommandUncached(command);
    if (res.found) this.resolvedCommands.set(command, res);
    else this.resolvedCommands.delete(command);
    return res;
  }
  resolveCommandUncached(command) {
    if (command.includes("/") || command.includes("\\")) return { path: command, found: (0, import_node_fs2.existsSync)(command) };
    if (!isSafeCommandName(command)) return { path: command, found: false };
    if (process.platform === "win32") {
      try {
        const res = (0, import_node_child_process3.spawnSync)("where", [command], { encoding: "utf8", timeout: 3e3 });
        const lines = (res.stdout ?? "").trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const pathExts = (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").map((e) => e.trim().toUpperCase()).filter(Boolean);
        const isExecutable = (p) => {
          const dot = p.lastIndexOf(".");
          const sep3 = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
          if (dot <= sep3) return false;
          return pathExts.includes(p.slice(dot).toUpperCase());
        };
        const exe = lines.find((p) => isExecutable(p) && (0, import_node_fs2.existsSync)(p));
        if (exe) return { path: exe, found: true };
      } catch {
      }
      const appData = process.env.APPDATA ?? "";
      const localAppData = process.env.LOCALAPPDATA ?? "";
      const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
      const winCandidates = [
        `${appData}\\npm\\${command}.cmd`,
        `${appData}\\npm\\${command}`,
        `${localAppData}\\Programs\\claude\\${command}.exe`,
        `${home}\\.claude\\local\\${command}.cmd`,
        `${home}\\.claude\\local\\${command}`
      ];
      for (const c of winCandidates) if ((0, import_node_fs2.existsSync)(c)) return { path: c, found: true };
      return { path: command, found: false };
    }
    const which = captureFromLoginShell(`which ${command}`);
    if (which) {
      const path3 = which.trim().split("\n").map((l) => l.trim()).filter(Boolean).pop();
      if (path3 && (0, import_node_fs2.existsSync)(path3)) return { path: path3, found: true };
    }
    const candidates = [
      `/opt/homebrew/bin/${command}`,
      `/usr/local/bin/${command}`,
      `${process.env.HOME ?? ""}/.local/bin/${command}`,
      `${process.env.HOME ?? ""}/.claude/local/${command}`,
      `${process.env.HOME ?? ""}/.volta/bin/${command}`
    ];
    for (const c of candidates) if ((0, import_node_fs2.existsSync)(c)) return { path: c, found: true };
    return { path: command, found: false };
  }
  /**
   * WINDOWS ONLY. Decide whether `resolved` is an npm-style shim we can spawn
   * DIRECTLY (its real interpreter + script, as an argv ARRAY) instead of routing
   * it through `cmd.exe /d /s /c "<one big string>"`.
   *
   * The cmd.exe route destroys any multi-line argument (see buildCmdCommandLine),
   * which is what silently stripped the HIVE PROTOCOL block out of every
   * npm-installed agent CLI's system prompt on Windows — agents booted fine and
   * then never messaged each other because they never learned inbox/outbox exist.
   *
   * Returns null for anything not fully understood, and EVERY failure mode here
   * (not a shim, unreadable, unknown shape, script missing on disk, interpreter
   * not installed or itself not a real .exe) degrades to exactly today's cmd.exe
   * behaviour. Never throws.
   */
  resolveWindowsShimSpawn(resolved) {
    if (process.platform !== "win32") return null;
    try {
      const lower = resolved.toLowerCase();
      const shimPath = lower.endsWith(".cmd") || lower.endsWith(".bat") ? resolved : (0, import_node_fs2.existsSync)(`${resolved}.cmd`) ? `${resolved}.cmd` : null;
      if (!shimPath) return null;
      const st = (0, import_node_fs2.statSync)(shimPath);
      if (!st.isFile() || st.size > 8192) return null;
      const target = parseNpmCmdShim(shimPath, (0, import_node_fs2.readFileSync)(shimPath, "utf8"));
      if (!target) return null;
      if (!(0, import_node_fs2.existsSync)(target.scriptPath)) return null;
      if (target.interpreter === null) {
        return { file: target.scriptPath, script: null };
      }
      const interp = this.resolveCommand(target.interpreter);
      if (!interp.found) return null;
      const il = interp.path.toLowerCase();
      if (!il.endsWith(".exe") && !il.endsWith(".com")) return null;
      return { file: interp.path, script: target.scriptPath };
    } catch {
      return null;
    }
  }
  spawn(opts, owner = null) {
    if (this.sessions.has(opts.id)) {
      return { ok: false, error: `pty already exists for id ${opts.id}` };
    }
    opts = { ...opts, cwd: expandTilde(opts.cwd) };
    if (!(0, import_node_fs2.existsSync)(opts.cwd)) {
      return { ok: false, error: `cwd does not exist: ${opts.cwd}` };
    }
    const resolved = this.resolveCommand(opts.command).path;
    try {
      const userPath = withHiveRuntimeFallback(
        process.platform === "win32" ? process.env.PATH || "" : userShellPath(),
        opts.env?.HIVE_ROOT
      );
      const isWin = process.platform === "win32";
      const lower = resolved.toLowerCase();
      const directExe = lower.endsWith(".exe") || lower.endsWith(".com");
      const needsCmd = isWin && !directExe;
      const shimSpawn = needsCmd && typeof opts.shellScript !== "string" ? this.resolveWindowsShimSpawn(resolved) : null;
      let file;
      let spawnArgs;
      if (typeof opts.shellScript === "string") {
        if (isWin) {
          file = process.env.ComSpec || "cmd.exe";
          spawnArgs = `/d /s /c "${opts.shellScript}"`;
        } else {
          file = process.env.SHELL || "/bin/sh";
          spawnArgs = ["-lc", opts.shellScript];
        }
      } else if (needsCmd && shimSpawn) {
        file = shimSpawn.file;
        spawnArgs = shimSpawn.script === null ? [...opts.args ?? []] : [shimSpawn.script, ...opts.args ?? []];
      } else {
        file = needsCmd ? process.env.ComSpec || "cmd.exe" : resolved;
        spawnArgs = needsCmd ? buildCmdCommandLine(resolved, opts.args ?? []) : opts.args ?? [];
        if (needsCmd) {
          const multiline = (opts.args ?? []).some((a) => a.includes("\n"));
          console.warn(
            `[pty] Windows: "${resolved}" could not be decoded as an npm shim \u2014 falling back to cmd.exe.` + (multiline ? " A MULTI-LINE ARGUMENT IS PRESENT AND WILL BE TRUNCATED AT ITS FIRST NEWLINE. The agent will start and look healthy without ever receiving the hive protocol." : " No multi-line argument in this spawn, so nothing is lost here.")
          );
        }
      }
      const proc = pty.spawn(file, spawnArgs, {
        name: "xterm-256color",
        cols: opts.cols ?? 100,
        rows: opts.rows ?? 30,
        cwd: opts.cwd,
        // Inherited env minus the parent Claude session's identity markers,
        // then the app's defaults and locale, then per-agent values — see
        // ptyEnv.ts for why the strip exists and why it is prefix-based.
        env: buildPtyEnv(process.env, userPath, opts.env)
      });
      const session = {
        id: opts.id,
        proc,
        cwd: opts.cwd,
        command: resolved,
        lastOutputAt: Date.now(),
        hasOutput: false,
        owner
      };
      this.sessions.set(opts.id, session);
      proc.onData((data) => {
        if (this.sessions.get(opts.id) !== session) return;
        session.hasOutput = true;
        session.lastOutputAt = Date.now();
        this.safeSend(`pty:data:${opts.id}`, data, session.owner);
      });
      proc.onExit(({ exitCode, signal }) => {
        if (this.sessions.get(opts.id) !== session) return;
        this.safeSend(`pty:exit:${opts.id}`, { exitCode, signal }, session.owner);
        this.sessions.delete(opts.id);
        try {
          this.exitHandler?.(opts.id, exitCode);
        } catch {
        }
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  write(id, data) {
    const s = this.sessions.get(id);
    if (!s) return { ok: false, error: `no pty: ${id}` };
    try {
      s.proc.write(data);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  resize(id, cols, rows) {
    const s = this.sessions.get(id);
    if (!s) return { ok: false, error: `no pty: ${id}` };
    try {
      s.proc.resize(cols, rows);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  /** Ask the foreground TUI for a fresh frame without changing its geometry.
   *  Startup output may predate the renderer subscription, and a same-sized
   *  first fit otherwise emits no resize. */
  redraw(id) {
    const s = this.sessions.get(id);
    if (!s) return { ok: false, error: `no pty: ${id}` };
    try {
      s.proc.resize(s.proc.cols, s.proc.rows);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  kill(id) {
    const s = this.sessions.get(id);
    if (!s) return { ok: false, error: `no pty: ${id}` };
    try {
      const pid = s.proc.pid;
      s.proc.kill();
      ensureKilled(pid);
      this.sessions.delete(id);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  list() {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      cwd: s.cwd,
      command: s.command,
      pid: s.proc.pid,
      lastOutputAt: s.lastOutputAt,
      hasOutput: s.hasOutput
    }));
  }
  /** Epoch ms of this PTY's most recent output, or undefined if no such PTY. */
  lastOutputAt(id) {
    return this.sessions.get(id)?.lastOutputAt;
  }
  /** Milliseconds since this PTY last produced output (Date.now() - lastOutputAt),
   *  or undefined if no such PTY. The idle handshake: large value = safe to type. */
  idleFor(id) {
    const s = this.sessions.get(id);
    return s ? Date.now() - s.lastOutputAt : void 0;
  }
  /** Bulk-kill every PTY for app quit / reset. This is wholesale shutdown, not
   *  individual agent lifecycle, so it suppresses the natural-exit teardown —
   *  we don't want to archive every agent or fire a storm of `git worktree
   *  remove` while the process is tearing down.
   *
   *  On Windows the tree sweep runs SYNCHRONOUSLY here, unlike kill():
   *  ensureKilled's grace timer is unref'd, and on the quit path the main
   *  process exits (will-quit caps the analytics flush at ~1.2s) long before
   *  the 4s grace — so the deferred `taskkill /T /F` never ran and agent trees
   *  survived the app. conpty's own kill is async and best-effort (and our
   *  conpty patch degrades a failed console enumeration to killing nothing),
   *  so the synchronous sweep is the only reliable reaper at quit. POSIX keeps
   *  the graceful path: closing the pty HUPs the foreground process group, so
   *  trees die without us SIGKILLing mid-cleanup. */
  killAll() {
    this.exitHandler = null;
    const sweepNow = process.platform === "win32";
    for (const s of this.sessions.values()) {
      const pid = s.proc.pid;
      if (sweepNow) {
        try {
          hardKillTree(pid);
        } catch {
        }
        try {
          s.proc.kill();
        } catch {
        }
      } else {
        try {
          s.proc.kill();
        } catch {
        }
        ensureKilled(pid);
      }
    }
    this.sessions.clear();
  }
};

// cth/main/updater.ts
var import_electron2 = require("electron");
var import_node_https = require("node:https");
var import_node_fs4 = require("node:fs");
var import_node_path4 = require("node:path");

// cth/main/config.ts
var import_electron = require("electron");
var import_node_fs3 = require("node:fs");
var import_node_path3 = require("node:path");
var import_node_os2 = require("node:os");

// cth/shared/claudeCommands.ts
var COMMAND_GROUPS = [
  {
    title: "SESSION",
    items: [
      { cmd: "/clear", kind: "slash", desc: "Start a fresh conversation and reclaim the full context window. The old one stays in /resume." },
      { cmd: "/resume", kind: "slash", desc: "Pick or search a past session to continue.", usage: "/resume auth refactor" },
      { cmd: "/rewind", kind: "slash", desc: "Roll code AND conversation back to an earlier checkpoint." },
      { cmd: "/compact", kind: "slash", desc: "Summarize the conversation so far to free context without losing the thread.", usage: "/compact keep the auth decisions" },
      { cmd: "claude -c", kind: "cli", desc: "Continue the most recent session in this directory." },
      { cmd: "claude -r", kind: "cli", desc: "Resume \u2014 pick or search a past session.", usage: "claude -r auth" },
      { cmd: "claude --fork-session", kind: "cli", desc: "When resuming, branch into a new session id instead of reusing the original." }
    ]
  },
  {
    title: "CONTEXT & MEMORY",
    items: [
      { cmd: "/context", kind: "slash", desc: "Visualize what is filling the context window, with optimization hints." },
      { cmd: "/memory", kind: "slash", desc: "Open the project & user CLAUDE.md memory files for editing." },
      { cmd: "/init", kind: "slash", desc: "Scan the repo and generate a CLAUDE.md capturing its conventions." },
      { cmd: "# ", kind: "slash", desc: "Quick memory: start a line with # to append a durable note to memory.", usage: "# always run prettier before committing" },
      { cmd: "claude --add-dir ../other-repo", kind: "cli", desc: "Grant the session read/write access to an extra directory." }
    ]
  },
  {
    title: "MODELS & EFFORT",
    items: [
      { cmd: "/model", kind: "slash", desc: "Switch the model for this session (saved as default); arrows tune effort.", usage: "/model opus" },
      { cmd: "/effort", kind: "slash", desc: "Set reasoning effort: low / medium / high / xhigh / max.", usage: "/effort high" },
      { cmd: "/fast", kind: "slash", desc: "Toggle fast mode \u2014 Opus with faster output, no model downgrade." },
      { cmd: "claude --model claude-sonnet-4-6[1m]", kind: "cli", desc: "Launch on a specific model. The [1m] suffix selects the 1M-token window (Dwight)." },
      { cmd: "claude --fallback-model sonnet", kind: "cli", desc: "Auto-fall back to another model when the primary is unavailable." }
    ]
  },
  {
    title: "PLAN & EXECUTE",
    items: [
      { cmd: "/plan", kind: "slash", desc: "Enter plan mode \u2014 design the change before any edits.", usage: "/plan refactor the auth module" },
      { cmd: "/goal", kind: "slash", desc: "Set a goal condition; Claude keeps working across turns until it is met.", usage: "/goal all tests pass" },
      { cmd: "/batch", kind: "slash", desc: "Decompose a large change into parallel units in git worktrees.", usage: "/batch migrate components to v2" },
      { cmd: "/diff", kind: "slash", desc: "Open the interactive diff viewer for the current changes." },
      { cmd: "/run", kind: "slash", desc: "Launch and drive the project app to see a change actually working." },
      { cmd: "/verify", kind: "slash", desc: "Build, run, and observe to confirm a change does what it should." },
      { cmd: "claude --worktree feat/x", kind: "cli", desc: "Start the session in an isolated git worktree." }
    ]
  },
  {
    title: "REVIEW & GIT",
    items: [
      { cmd: "/code-review", kind: "slash", desc: 'Hunt correctness bugs in the diff. --fix applies them, --comment posts inline; "ultra" runs a cloud deep review.', usage: "/code-review high --fix" },
      { cmd: "/simplify", kind: "slash", desc: "Cleanup-only pass over changed code (reuse/simplify) \u2014 no bug hunt." },
      { cmd: "/review", kind: "slash", desc: "Review a pull request in this session.", usage: "/review 123" },
      { cmd: "/security-review", kind: "slash", desc: "Scan pending changes for security vulnerabilities." },
      { cmd: "/ultrareview", kind: "slash", desc: "Multi-agent cloud review of the current branch / a PR." }
    ]
  },
  {
    title: "SUBAGENTS & BACKGROUND",
    items: [
      { cmd: "claude agents", kind: "cli", desc: "Open the agent view across your live + background Claude sessions." },
      { cmd: "claude agents --json", kind: "cli", desc: "Print live sessions as JSON \u2014 scriptable fleet status." },
      { cmd: "/agents", kind: "slash", desc: "Create and manage custom subagents for delegated work." },
      { cmd: "/fork", kind: "slash", desc: "Spawn a background subagent that inherits the full conversation.", usage: "/fork implement the perf fix" },
      { cmd: "/background", kind: "slash", desc: "Detach the current session so it keeps running in the background." },
      { cmd: "/tasks", kind: "slash", desc: "View and manage everything running in the background." },
      { cmd: "/stop", kind: "slash", desc: "Stop the current background session (when attached)." },
      { cmd: "claude --agent reviewer", kind: "cli", desc: "Start the session using a specific agent configuration." }
    ]
  },
  {
    title: "TOOLS & PERMISSIONS",
    items: [
      { cmd: "/permissions", kind: "slash", desc: "View and edit which tools are allowed / asked / denied." },
      { cmd: "/hooks", kind: "slash", desc: "View the configured lifecycle hooks (PreToolUse, Stop, etc.)." },
      { cmd: "claude --permission-mode bypassPermissions", kind: "cli", desc: 'Run without per-tool approval prompts (this is what "auto mode" uses).' },
      { cmd: 'claude --allowedTools "Bash(git *) Edit Read"', kind: "cli", desc: "Pre-allow specific tools so they never prompt." }
    ]
  },
  {
    title: "MCP & PLUGINS",
    items: [
      { cmd: "/mcp", kind: "slash", desc: "List/manage connected MCP servers and authenticate (OAuth)." },
      { cmd: "/plugin", kind: "slash", desc: "Manage plugins (list, install, enable, disable)." },
      { cmd: "claude mcp list", kind: "cli", desc: "List configured MCP servers and their health." },
      { cmd: "claude mcp add <name> <command>", kind: "cli", desc: "Register a new MCP server (stdio or HTTP)." }
    ]
  },
  {
    title: "USAGE & COST",
    items: [
      { cmd: "/usage", kind: "slash", desc: "Session cost, plan limits, and a breakdown by skill / subagent / MCP." },
      { cmd: "/status", kind: "slash", desc: "Account, active model, version, and connection status." },
      { cmd: 'claude -p "..." --max-budget-usd 5', kind: "cli", desc: "Cap the dollar spend for a headless run." },
      { cmd: "claude --max-turns 20", kind: "cli", desc: "Limit agentic turns (a coarse runaway guard)." }
    ]
  },
  {
    title: "AUTOMATION (HEADLESS)",
    items: [
      { cmd: 'claude -p "your prompt"', kind: "cli", desc: "Print mode: run one prompt non-interactively and exit.", usage: 'cat log | claude -p "summarize"' },
      { cmd: 'claude -p "..." --output-format json', kind: "cli", desc: "Headless with structured JSON (result, usage, cost)." },
      { cmd: 'claude -p "..." --output-format stream-json', kind: "cli", desc: "Streaming JSON events for live consumption." },
      { cmd: 'claude -p "..." --json-schema <schema>', kind: "cli", desc: "Force the headless result to match a JSON Schema." },
      { cmd: 'claude --append-system-prompt "..."', kind: "cli", desc: "Append extra instructions to the default system prompt." }
    ]
  },
  {
    title: "CONFIG",
    items: [
      { cmd: "/config", kind: "slash", desc: "Open Settings: theme, model, output style, preferences." },
      { cmd: "/theme", kind: "slash", desc: "Change the color theme (auto / light / dark / colorblind / custom)." },
      { cmd: "/statusline", kind: "slash", desc: "Configure the Claude Code status line." }
    ]
  },
  {
    title: "HELP & DIAGNOSTICS",
    items: [
      { cmd: "/help", kind: "slash", desc: "List every available slash command." },
      { cmd: "/doctor", kind: "slash", desc: "Diagnose installation / health issues (press f to auto-fix)." },
      { cmd: "/debug", kind: "slash", desc: "Enable debug logging and troubleshoot the current session." },
      { cmd: "/release-notes", kind: "slash", desc: "Browse the Claude Code changelog by version." },
      { cmd: "/remote-control", kind: "slash", desc: "Expose this session for control from claude.ai / your phone." }
    ]
  }
];

// cth/shared/codexCommands.ts
var CODEX_COMMAND_GROUPS = [
  {
    title: "SESSION",
    items: [
      { cmd: "/clear", kind: "slash", desc: "Start a fresh chat without quitting \u2014 clears the conversation context." },
      // Verified present in the codex 0.137.0 binary's own command table. It was
      // missing here while providerAutomation sent it, so the two disagreed.
      // Unlike Claude's, this one ignores any trailing focus text.
      { cmd: "/compact", kind: "slash", desc: "Summarize the conversation so far to stay under the context limit." },
      { cmd: "/help", kind: "slash", desc: "List every available slash command." },
      { cmd: "/copy", kind: "slash", desc: "Copy the latest model output to the clipboard." },
      { cmd: "/logout", kind: "slash", desc: "Clear locally stored credentials." },
      { cmd: "/rename", kind: "slash", desc: "Rename the current conversation." }
    ]
  },
  {
    title: "UI & PREFERENCES",
    items: [
      { cmd: "/theme", kind: "slash", desc: "Toggle between light and dark themes." },
      { cmd: "/vim", kind: "slash", desc: "Toggle Vim key-bindings in the input box." },
      { cmd: "/raw", kind: "slash", desc: "Toggle raw (unformatted) output for the model response." }
    ]
  },
  {
    title: "MEMORY & SKILLS",
    items: [
      { cmd: "/memories", kind: "slash", desc: "View and manage what Codex has remembered about you." },
      { cmd: "/skills", kind: "slash", desc: "Browse and manage installed Codex skills / extensions." },
      { cmd: "/hooks", kind: "slash", desc: "View the configured lifecycle hooks." }
    ]
  },
  {
    title: "APPROVALS & PERMISSIONS",
    items: [
      { cmd: "codex --dangerously-bypass-approvals-and-sandbox", kind: "cli", desc: "Skip ALL approval prompts AND drop the OS sandbox (full filesystem access). Munder Difflin no longer uses this for auto mode; it keeps the sandbox and adds the hive agent folder via --add-dir." },
      { cmd: "codex -a never -s workspace-write", kind: "cli", desc: "Never prompt for approval (-a never) but keep the sandbox scoped to the project workspace (-s workspace-write). What Munder Difflin uses for auto mode; the hive agent folder is added with --add-dir <dir>." },
      { cmd: "codex -a untrusted", kind: "cli", desc: "Only run trusted commands without asking; escalate to the user for anything else." },
      { cmd: "codex -s danger-full-access", kind: "cli", desc: "Remove all sandbox restrictions (fine-grained flag \u2014 pair with -a for full control)." }
    ]
  },
  {
    title: "AUTOMATION (HEADLESS)",
    items: [
      { cmd: 'codex -p "your prompt"', kind: "cli", desc: "Non-interactive print mode: run one prompt and exit.", usage: 'codex -p "summarise this file"' },
      { cmd: "CODEX_NON_INTERACTIVE=1 codex", kind: "cli", desc: "Suppress all interactive installer / first-run prompts. Set automatically by Munder Difflin in auto mode." }
    ]
  },
  {
    title: "CONFIG",
    items: [
      { cmd: "codex --model <model>", kind: "cli", desc: "Choose the model (e.g. o4-mini, o3).", usage: "codex --model o4-mini" },
      { cmd: "codex --provider <provider>", kind: "cli", desc: "Select the API provider (openai, azure, anthropic\u2026).", usage: "codex --provider openai" }
    ]
  }
];

// cth/shared/grokCommands.ts
var GROK_COMMAND_GROUPS = [
  {
    title: "SESSION",
    items: [
      { cmd: "/new", kind: "slash", desc: "Start a fresh session and clear the current context." },
      { cmd: "/load", kind: "slash", desc: "Load a previous workspace session.", usage: "/load [workspace] [session]" },
      { cmd: "/compact", kind: "slash", desc: "Compact conversation history while retaining the important working context.", usage: "/compact keep the current task and next step" },
      { cmd: "grok --resume <session-id>", kind: "cli", desc: "Resume an existing Grok session by ID or title." }
    ]
  },
  {
    title: "MODELS & PERMISSIONS",
    items: [
      { cmd: "/model", kind: "slash", desc: "Switch the model used by the current session." },
      { cmd: "grok --model grok-4.6", kind: "cli", desc: "Launch Grok with the Grok 4.6 coding model (the CLI default)." },
      { cmd: "/always-approve", kind: "slash", desc: "Toggle automatic approval of tool executions." },
      { cmd: "grok --permission-mode bypassPermissions", kind: "cli", desc: "Launch in always-approve mode. Munder uses this when Auto Mode is on." }
    ]
  },
  {
    title: "TOOLS & WORKFLOW",
    items: [
      { cmd: "/rewind", kind: "slash", desc: "Rewind to a previous prompt and restore its file state." },
      { cmd: "/hooks-list", kind: "slash", desc: "Show lifecycle hooks active in this session." },
      { cmd: "/skills", kind: "slash", desc: "List or load installed skills." },
      { cmd: "/multiline", kind: "slash", desc: "Toggle multiline prompt entry." }
    ]
  }
];

// cth/shared/agentProvider.ts
var AGENT_PROVIDER_PRESETS = [
  {
    id: "claude",
    label: "Claude Code",
    defaultCommand: "claude",
    commandGroups: COMMAND_GROUPS,
    autoModeFlag: "--permission-mode bypassPermissions",
    supportsModel: true,
    modelFlag: "--model",
    autoFlag: "--permission-mode bypassPermissions",
    hiveAware: true,
    canReceiveInbox: true,
    // Longest-context Claude variant — matches the "give Michael a bigger model"
    // advisory and the Recommended tag on the orchestrator picker.
    recommendedOrchestratorModel: "claude-opus-4-8[1m]",
    resumeFlag: "--resume",
    // Official Claude Code install (npm global). Used by the missing-CLI auto-install.
    installCommand: "npm install -g @anthropic-ai/claude-code",
    // Anthropic's official native installer — a standalone binary, no node/npm.
    // The only rung of the ladder that works on a machine with no Node at all.
    nativeInstallCommand: {
      posix: "curl -fsSL https://claude.ai/install.sh | bash",
      win32: "powershell -c irm https://claude.ai/install.ps1 ^| iex"
    },
    docsUrl: "https://docs.claude.com/en/docs/claude-code"
  },
  {
    id: "codex",
    label: "Codex \xB7 GPT",
    defaultCommand: "codex",
    commandGroups: CODEX_COMMAND_GROUPS,
    // Auto mode: never prompt (-a never) but KEEP codex's OS sandbox, scoped to the
    // workspace (-s workspace-write). The app used to spawn with
    // `--dangerously-bypass-approvals-and-sandbox` for one reason only: a hive
    // worker must write to its agent folder at <harnessHome>/hive/agents/<id>/,
    // a different path tree from cwd, which workspace-write blocked. That is a
    // path-layout problem, not a reason to drop the sandbox: codex's documented
    // `--add-dir <DIR>` makes extra directories writable alongside the workspace,
    // and the hive spawn path (hive.ts, which knows the agent dir) appends it.
    // So: approvals off, sandbox on, hive housekeeping still works.
    autoModeFlag: "-a never -s workspace-write",
    autoFlag: "-a never -s workspace-write",
    // Any of these on a command line means the user already chose a posture
    // (including the old full bypass) — do not stack ours on top.
    autoStanceTokens: ["-a", "--ask-for-approval", "-s", "--sandbox", "--full-auto", "--dangerously-bypass-approvals-and-sandbox"],
    // Suppresses first-run interactive prompts (directory-trust gate, installer).
    nonInteractiveEnv: { CODEX_NON_INTERACTIVE: "1" },
    supportsModel: true,
    modelFlag: "--model",
    // Codex is NOT hiveAware in the Claude-flag sense: it has no
    // `--append-system-prompt`/`--settings`. The hive protocol is injected as
    // Codex's INITIAL prompt, which it takes POSITIONALLY (`codex "<prompt>"`) —
    // hence initialPromptFlag is undefined and hive.ts appends it as a trailing arg.
    hiveAware: false,
    // …but Codex DOES expose a Claude-style hooks system (hooks.json / config.toml
    // [hooks]; PreToolUse/PostToolUse/Stop/…), so it gets full hive parity via the
    // 'codex' bridge: a per-agent CODEX_HOME/hooks.json wired to the cth-hook shim
    // (see hive.installCodexHooks). Stop→drain works natively (Codex's Stop honors
    // {decision:'block',reason} = continue-with-prompt, exactly like Claude).
    hookBridge: "codex",
    // Inbox drains via the codex-hook bridge's Stop→drain (the renderer's idle
    // inbox-wake nudge remains as a harmless fallback for an idle worker).
    canReceiveInbox: true,
    initialPromptFlag: void 0,
    positionalInitialPrompt: true,
    // Codex's long-context coding model for the orchestrator role. // TODO-verify
    // the exact codex CLI model id (couldn't install the codex CLI to confirm).
    recommendedOrchestratorModel: "gpt-5-codex",
    // Codex resumes via a SUBCOMMAND, not a flag: `codex resume [OPTIONS]
    // [SESSION_ID]`. A `--resume <id>` flag does not exist, which is why restarts
    // used to silently start a brand-new session instead of continuing.
    resumeFlag: void 0,
    resumeSubcommand: "resume",
    // Official OpenAI Codex CLI install (npm global). Used by the missing-CLI auto-install.
    installCommand: "npm install -g @openai/codex",
    docsUrl: "https://github.com/openai/codex"
  },
  {
    id: "grok",
    label: "Grok \xB7 xAI",
    defaultCommand: "grok",
    commandGroups: GROK_COMMAND_GROUPS,
    // Grok documents bypassPermissions as the CLI/config spelling of its
    // always-approve mode. Deny rules and lifecycle gates still take precedence.
    autoModeFlag: "--permission-mode bypassPermissions",
    autoFlag: "--permission-mode bypassPermissions",
    supportsModel: true,
    modelFlag: "--model",
    hiveAware: false,
    // Grok supports Claude-compatible lifecycle events but sends camelCase
    // payloads. The bridge normalizes them before forwarding to HookServer.
    hookBridge: "grok",
    canReceiveInbox: true,
    // `grok [PROMPT]` accepts the initial hive protocol as a positional prompt.
    positionalInitialPrompt: true,
    // Grok resumes interactively with `grok --resume <session-id-or-title>`.
    resumeFlag: "--resume"
  },
  {
    id: "kimi",
    label: "Kimi Code",
    defaultCommand: "kimi",
    commandGroups: [],
    // Kimi --auto handles every approval and does not stop to ask questions,
    // matching Munder Difflin's autonomous Claude/Codex default.
    autoModeFlag: "--auto",
    autoFlag: "--auto",
    supportsModel: true,
    modelFlag: "--model",
    hiveAware: false,
    // Kimi's interactive TUI has no positional initial-prompt form. It supports
    // lifecycle hooks, but Munder Difflin does not yet install a Kimi hook bridge,
    // so mail must bounce rather than being delivered with no drain path.
    canReceiveInbox: false
  },
  {
    // Google's official Gemini CLI. Unlike Antigravity (`agy`), this is the
    // open-source `@google/gemini-cli` binary and uses Gemini's native settings
    // hooks (BeforeTool/AfterTool/BeforeAgent/AfterAgent/SessionStart).
    id: "gemini",
    label: "Gemini CLI",
    defaultCommand: "gemini",
    commandGroups: [],
    // `--yolo` is deprecated upstream; approval-mode is the current spelling.
    autoModeFlag: "--approval-mode=yolo",
    autoFlag: "--approval-mode=yolo",
    supportsModel: true,
    modelFlag: "--model",
    hiveAware: false,
    bridge: { kind: "hooks", shim: "gemini" },
    canReceiveInbox: true,
    // Keep the TUI alive after processing the hive protocol seed.
    initialPromptFlag: "-i",
    recommendedOrchestratorModel: "pro",
    resumeFlag: "--resume",
    installCommand: "npm install -g @google/gemini-cli",
    docsUrl: "https://github.com/google-gemini/gemini-cli"
  },
  {
    id: "antigravity",
    label: "Antigravity \xB7 Gemini",
    defaultCommand: "agy",
    commandGroups: [],
    autoModeFlag: "--dangerously-skip-permissions",
    supportsModel: true,
    modelFlag: "--model",
    autoFlag: "--dangerously-skip-permissions",
    hiveAware: false,
    hookBridge: "agy",
    // installAgyHooks() → ~/.gemini/.../hooks.json (translating shim)
    canReceiveInbox: true,
    // via the agy-hook bridge (Stop→drain); verified agy honors hook decisions
    initialPromptFlag: "-i",
    // agy --prompt-interactive: orient the session, then continue
    recommendedOrchestratorModel: "Gemini 3.1 Pro (High)",
    // agy takes the display-name label
    resumeFlag: "--conversation"
    // agy: resume a previous conversation by ID
  },
  {
    // qwen-code — the Qwen CLI (a gemini-cli fork) driving any OpenAI-compatible
    // endpoint (OPENAI_BASE_URL). It has no hook surface, so it rides a PROXY
    // bridge (bridge.kind==='proxy'), with the OpenAI usage/tool-call shape.
    id: "qwen",
    label: "Qwen (local available)",
    defaultCommand: "qwen",
    commandGroups: [],
    // gemini-cli heritage: --yolo auto-approves all actions. // TODO-verify
    autoModeFlag: "--yolo",
    supportsModel: true,
    modelFlag: "--model",
    autoFlag: "--yolo",
    hiveAware: false,
    // SPIKE/TODO-verify: confirm qwen-code reads OPENAI_BASE_URL for its upstream
    // ('serve' inboxDelivery is reserved for a later qwen-serve HTTP push path).
    bridge: { kind: "proxy", api: "openai", baseUrlEnv: "OPENAI_BASE_URL", inboxDelivery: "terminal" },
    canReceiveInbox: true,
    // gemini-cli style interactive-orient flag. // TODO-verify
    initialPromptFlag: "-i",
    // Qwen's long-context coder model for the orchestrator. // TODO-verify
    recommendedOrchestratorModel: "qwen3-coder-plus",
    resumeFlag: void 0
  },
  {
    // OpenCode — the TypeScript AI coding agent (opencode.ai / anomalyco/opencode,
    // ex sst/opencode). NOT the archived Go opencode-ai/opencode (→ Crush). Run as
    // its interactive TUI in a PTY (like codex), oriented by --prompt.
    id: "opencode",
    label: "OpenCode",
    defaultCommand: "opencode",
    commandGroups: [],
    // OpenCode's TUI exposes no skip-permissions FLAG; headless auto-approve is a
    // config concern (permission:allow). To keep auto-mode gated behind the floor
    // `config.autoMode` toggle (Pam guardrail #2), the permission JSON is NOT a
    // static nonInteractiveEnv — spawnAgentCore builds OPENCODE_CONFIG_CONTENT
    // dynamically (permission:allow only when autoMode is on; + a local provider
    // block when a base-URL is set). So no auto flag is spliced onto the command.
    autoModeFlag: "",
    autoFlag: "",
    supportsModel: true,
    modelFlag: "--model",
    // value form: provider/model, e.g. anthropic/claude-sonnet-4-5
    hiveAware: false,
    // no --append-system-prompt/--settings; protocol rides in via --prompt
    // NATIVE PLUGIN bridge (god Decision 1): OpenCode has no Claude-shaped Stop hook,
    // but its plugin API DOES expose a real lifecycle event (session.idle). A bundled
    // per-agent plugin drains the inbox on idle and posts HIVE_SOCK payloads — the
    // same Stop→drain semantics as codex's hooks, provider-agnostic, no traffic
    // interception. Modeled as a `hooks` bridge with a new `opencode` shim so it
    // reuses the existing hooks dispatch arm (installOpenCodePlugin, sibling of
    // installCodexHooks). The config-injection proxy is the documented fallback only.
    bridge: { kind: "hooks", shim: "opencode" },
    // god-eligible. NOTE: the plugin bridge is architecturally verified (event surface
    // + payload contract) but its live runtime (auto-load + session.idle firing +
    // injection) is UNVERIFIED pending BYOK keys / a local LLM. The renderer idle
    // inbox-wake nudge (useHive.ts) is the guaranteed fallback so a god still drains.
    canReceiveInbox: true,
    initialPromptFlag: "--prompt",
    // opencode --prompt "<orchestrator/worker brief>"
    // NO recommended model — deliberately. This used to preselect
    // `anthropic/claude-sonnet-4-5` under the comment "OpenCode's own default",
    // which was wrong on both halves: it is not OpenCode's default, and it is a
    // BYOK slug that resolves only for a user who has authenticated Anthropic
    // inside OpenCode. Without that key OpenCode SILENTLY falls back to whatever
    // it can reach (observed live on Windows: "DeepSeek V4 Flash Free" via
    // OpenCode Zen) while every surface in this app went on reporting Claude
    // Sonnet 4.5 — the picker said one model, the agent ran another, and nothing
    // flagged the divergence. Undefined means buildSpawnCommand emits no
    // `--model` at all, so OpenCode uses the model the user actually configured;
    // every BYOK slug in the OpenCode model catalog stays one click away for
    // whoever has the key.
    recommendedOrchestratorModel: void 0,
    // Capturing the TUI session id for resume is unverified; spawn fresh on respawn
    // (protocol re-injected as the initial prompt), matching codex.
    resumeFlag: void 0,
    installCommand: "npm install -g opencode-ai@latest",
    // trusted, hardcoded
    // Node-free installers, for the rung that runs when npm is absent AND no Node
    // installer could be resolved (offline / unsupported platform) — until now
    // OpenCode had none, so that rung printed a manual hint and installed nothing.
    // Both are trusted, hardcoded constants and contain no double-quotes (the
    // win32 form is wrapped verbatim in `cmd /d /s /c "…"`).
    //
    // Unlike Claude, OpenCode ships NO standalone Windows one-liner: opencode.ai
    // serves the POSIX install script but has no `install.ps1` (verified 404), and
    // its docs list Chocolatey/Scoop as the Windows-native routes. `-y` because the
    // banner runs the command unattended in the agent terminal. Honest limitation:
    // this rung needs Chocolatey already present; when it isn't, the user sees
    // choco's own "not recognized" error plus the banner's existing "run the
    // command above manually" fallback — no worse off than the manual-only text.
    nativeInstallCommand: {
      posix: "curl -fsSL https://opencode.ai/install | bash",
      win32: "choco install opencode -y"
    },
    docsUrl: "https://opencode.ai/docs"
  },
  {
    // Crush — Charmbracelet's Go TUI coding agent (charmbracelet/crush), successor to
    // the archived Go opencode-ai/opencode. Non-hiveAware. Its hook surface is
    // Claude-shaped but exposes ONLY PreToolUse today (NO Stop/SessionEnd) — so a
    // hooks bridge can't drain on turn-end. Hence a PROXY bridge (qwen tier): a
    // loopback sidecar observes its LLM traffic and SYNTHESIZES the Stop→drain.
    id: "crush",
    label: "Crush \xB7 Charm",
    defaultCommand: "crush",
    commandGroups: [],
    // No CODEX_NON_INTERACTIVE analogue. First-run onboarding is suppressed by the
    // harness-written per-agent CRUSH_GLOBAL_CONFIG (provider+model+key pre-seeded),
    // set in env at spawn by installCrushConfig — NOT via this field.
    nonInteractiveEnv: void 0,
    autoModeFlag: "--yolo",
    // -y: accept all permissions (dangerous; unsandboxed). Gated by config.autoMode.
    autoFlag: "--yolo",
    supportsModel: true,
    modelFlag: "--model",
    // value format: provider/model-id, e.g. anthropic/claude-..., openai/gpt-4o
    hiveAware: false,
    // PROXY bridge. baseUrlEnv is an INTENTIONALLY INERT sentinel: Crush has NO
    // base-URL env override, so the generic proxy env-rewrite does nothing for it.
    // Real routing is via a per-agent CRUSH_GLOBAL_CONFIG whose provider base_url
    // points at the loopback (installCrushConfig, special-cased in the proxy arm).
    // Do NOT "fix" this to a real env var — it would have no effect.
    bridge: { kind: "proxy", api: "openai", baseUrlEnv: "CRUSH_PROXY_BASE_URL", inboxDelivery: "terminal" },
    // OpenAI-WIRE default so the out-of-box Crush god routes through the proxy
    // cleanly (the proxy serves one wire-shape; an anthropic/* default would route to
    // the wrong upstream — Dwight verify-crush MF1). Advisory/editable; non-OpenAI-wire
    // Crush-via-proxy is on-device live-verify. // exact long-context id humanQA
    recommendedOrchestratorModel: "openai/gpt-4o",
    // god-eligible via the proxy bridge (terminal inbox delivery on synthesized idle).
    // Live runtime (proxy parse of Crush traffic + synthesized Stop) is UNVERIFIED
    // pending keys; the renderer idle nudge is the guaranteed drain fallback.
    canReceiveInbox: true,
    // Bare `crush` is an interactive Bubble Tea TUI on a Cobra root command: the
    // first positional is parsed as a SUBCOMMAND, so a positional seed dies with
    // `unknown command "You are…"` (ondev-b live repro / spec-crush MF3). Crush has
    // NO --prompt flag either. So neither flag nor positional works → deliver the
    // protocol by TYPING it into the TUI after boot (renderer nudge path).
    initialPromptFlag: void 0,
    seedDelivery: "type-into-tui",
    resumeFlag: "--session",
    // Crush supports resume by id (also --continue for most-recent)
    installCommand: "npm install -g @charmland/crush",
    // trusted, hardcoded (brew/go/winget also valid)
    docsUrl: "https://github.com/charmbracelet/crush"
  },
  {
    // Pi (Pi Coding Agent, earendil-works; npm @earendil-works/pi-coding-agent).
    // Terminal-first, headless-driveable, 15-provider BYOK. Non-hiveAware, but has a
    // rich pi.on(event) lifecycle (tool_call→PreToolUse, agent_end→Stop, …). Bridged
    // via a bundled per-agent extension (installPiHooks) that posts HIVE_SOCK payloads
    // and auto-approves tools — a `hooks` bridge with a new `pi` shim.
    id: "pi",
    label: "Pi",
    defaultCommand: "pi",
    commandGroups: [],
    // pi has NO yolo flag. `--approve` is per-run PROJECT trust (accept the cwd so pi
    // doesn't prompt to trust the folder); the actual tool auto-allow lives INSIDE the
    // bridge extension's tool_call handler, which respects the floor auto-state via
    // HIVE_AUTO_APPROVE env (Pam guardrail #5). Gated by config.autoMode like the rest.
    autoModeFlag: "--approve",
    autoFlag: "--approve",
    // Suppress first-run version-check / telemetry chatter in the PTY. // humanQA exact names
    nonInteractiveEnv: { PI_SKIP_VERSION_CHECK: "1", PI_TELEMETRY: "0" },
    supportsModel: true,
    modelFlag: "--model",
    // value form: provider/model, e.g. anthropic/claude-sonnet-4-5 (thinking via :high)
    hiveAware: false,
    // HOOKS bridge via the new `pi` shim (installPiHooks). NOTE: only the structured
    // `bridge` is set (NOT the legacy hookBridge) — bridgeOf returns preset.bridge
    // first, so a hookBridge:'pi' would be dead weight + force a second union widening.
    bridge: { kind: "hooks", shim: "pi" },
    recommendedOrchestratorModel: "anthropic/claude-sonnet-4-5",
    // god-eligible. Live runtime (whether the extension auto-continues from agent_end,
    // or we lean on the renderer idle nudge) is UNVERIFIED pending keys. Renderer nudge
    // is the guaranteed drain fallback either way.
    canReceiveInbox: true,
    initialPromptFlag: void 0,
    // positional, like codex: pi "<prompt>"
    resumeFlag: "--session",
    // --ignore-scripts: don't run the package's postinstall on the user's machine.
    installCommand: "npm install -g --ignore-scripts @earendil-works/pi-coding-agent",
    docsUrl: "https://pi.dev/docs/latest"
  },
  {
    // GitHub Copilot CLI (`copilot`, npm @github/copilot). Driven in print mode:
    // `copilot -p "<prompt>" -s --allow-all-tools --no-ask-user [--model]`, the
    // documented non-interactive shape (single prompt, clean stdout, exits when
    // done). Non-hiveAware: it has no --append-system-prompt/--settings, so the
    // hive identity+protocol rides in as the initial prompt via `-p`.
    id: "copilot",
    label: "Copilot",
    defaultCommand: "copilot",
    commandGroups: [],
    // Non-interactive autonomy: -s prints only the agent's final response (clean
    // stdout), --allow-all-tools never blocks on a permission prompt (env:
    // COPILOT_ALLOW_ALL), --no-ask-user disables the ask_user tool so it never
    // stops to ask. Gated by the floor `config.autoMode` toggle like the rest.
    autoModeFlag: "-s --allow-all-tools --no-ask-user",
    autoFlag: "-s --allow-all-tools --no-ask-user",
    supportsModel: true,
    modelFlag: "--model",
    // e.g. claude-sonnet-4.5 (default), gpt-5.4, or 'auto'
    hiveAware: false,
    // no --append-system-prompt/--settings; protocol rides in via -p
    initialPromptFlag: "-p",
    // copilot -p "<orchestrator/worker brief>" runs it non-interactively
    recommendedOrchestratorModel: "claude-sonnet-4.5",
    // Copilot's default; user may pick gpt-5.4
    // Copilot supports session resume by id (`--resume=<id>`); attached only when a
    // prior session id was recorded (no hook bridge captures it yet → best-effort).
    resumeFlag: "--resume",
    // Print mode exits per turn and there is no hook bridge to drain on idle, so a
    // copilot worker can't receive routed inbox mail (it bounces to the god).
    canReceiveInbox: false,
    installCommand: "npm install -g @github/copilot",
    // trusted, hardcoded
    docsUrl: "https://docs.github.com/copilot/concepts/agents/about-copilot-cli"
  },
  {
    // Cursor Agent CLI (`cursor-agent`, https://cursor.com/docs/cli). The official
    // installer puts `cursor-agent` on PATH; `agent` is a shorter alias. Interactive
    // TUI by default (no `-p`), so the session stays alive for hive mail via the
    // renderer idle / work-order path — same class as Crush. Print mode (`-p`) is
    // available for scripts but exits per turn; this preset intentionally does
    // NOT use `-p` so Michael and workers remain god-eligible / inbox-capable.
    // Models (including cheap gpt-5.6-luna-*) bill against Cursor credits via the
    // logged-in CLI — there is no separate "plain OpenAI API" path for Luna.
    id: "cursor",
    label: "Cursor",
    defaultCommand: "cursor-agent",
    commandGroups: [],
    // --force/--yolo: allow tool calls without confirmations. --trust: skip the
    // workspace trust prompt so unattended Mac Mini spawns do not stall. Gated by
    // the floor config.autoMode toggle like every other engine.
    autoModeFlag: "--force --trust",
    autoFlag: "--force --trust",
    supportsModel: true,
    modelFlag: "--model",
    // e.g. gpt-5.6-luna-high, auto, composer-2.5
    hiveAware: false,
    // No Cursor hook bridge yet — mail delivery uses the terminal work-order /
    // idle-nudge fallback (same honesty as Crush before its proxy is verified).
    canReceiveInbox: true,
    // `cursor-agent` parses early argv as Cobra-style commands (login, models, mcp, …).
    // A long hive protocol string must NOT ride as a positional — type it into
    // the TUI after boot instead (Crush pattern).
    initialPromptFlag: void 0,
    seedDelivery: "type-into-tui",
    recommendedOrchestratorModel: "gpt-5.6-luna-high",
    resumeFlag: "--resume",
    // Official install is a curl|bash script (not npm). Prefer the native rung so
    // a node-free machine can still self-heal. Trusted hardcoded constants only.
    nativeInstallCommand: {
      posix: "curl https://cursor.com/install -fsS | bash",
      win32: "irm https://cursor.com/install?win32=true | iex"
    },
    docsUrl: "https://cursor.com/docs/cli/install"
  },
  {
    id: "custom",
    label: "Custom",
    defaultCommand: "",
    commandGroups: [],
    autoModeFlag: "",
    supportsModel: false,
    autoFlag: "",
    hiveAware: false,
    canReceiveInbox: false
    // no inbox-drain path → mail bounces to the god
  }
];
function isAgentProvider(value) {
  return value === "claude" || value === "codex" || value === "grok" || value === "kimi" || value === "gemini" || value === "antigravity" || value === "qwen" || value === "opencode" || value === "crush" || value === "pi" || value === "copilot" || value === "cursor" || value === "custom";
}
function normalizeAgentProvider(value) {
  return isAgentProvider(value) ? value : void 0;
}
function providerPreset(provider) {
  return AGENT_PROVIDER_PRESETS.find((p) => p.id === provider) ?? AGENT_PROVIDER_PRESETS[0];
}
function isClaudeProvider(provider) {
  return provider === "claude";
}
function isHiveAwareProvider(provider) {
  return providerPreset(provider ?? "claude").hiveAware;
}
function canReceiveInbox(provider) {
  return providerPreset(provider ?? "claude").canReceiveInbox;
}
function commandBinary(command) {
  const first = (command ?? "").trim().split(/\s+/)[0] ?? "";
  const leaf = first.split(/[\\/]/).pop() ?? first;
  return leaf.replace(/\.(exe|cmd|bat|ps1)$/i, "").toLowerCase();
}
function inferAgentProvider(command, explicit) {
  const normalized = normalizeAgentProvider(explicit);
  if (normalized) return normalized;
  const bin = commandBinary(command);
  if (bin === "codex") return "codex";
  if (bin === "grok") return "grok";
  if (bin === "kimi") return "kimi";
  if (bin === "gemini") return "gemini";
  if (bin === "agy" || bin === "antigravity") return "antigravity";
  if (bin === "qwen") return "qwen";
  if (bin === "opencode") return "opencode";
  if (bin === "crush") return "crush";
  if (bin === "pi") return "pi";
  if (bin === "copilot") return "copilot";
  if (bin === "cursor-agent") return "cursor";
  if (bin === "agent") return "cursor";
  if (bin === "claude" || !bin) return "claude";
  return "custom";
}
function bridgeOf(provider) {
  const preset = providerPreset(provider ?? "claude");
  if (preset.bridge) return preset.bridge;
  if (preset.hookBridge) return { kind: "hooks", shim: preset.hookBridge };
  return void 0;
}
function autoModeFlagForProvider(provider) {
  return providerPreset(provider).autoModeFlag ?? "";
}
function argsWithAutoModeFlag(args, autoMode, provider) {
  if (!autoMode) return args;
  const flag = autoModeFlagForProvider(provider);
  if (!flag) return args;
  if (hasAutoModeStance(args, provider)) return args;
  return [...args, ...flag.trim().split(/\s+/)];
}
function hasAutoModeStance(args, provider) {
  const preset = providerPreset(provider);
  const flag = preset.autoModeFlag ?? "";
  const lead = flag.trim().split(/\s+/)[0];
  const stance = /* @__PURE__ */ new Set([...lead ? [lead] : [], ...preset.autoStanceTokens ?? []]);
  return args.some((a) => stance.has(a));
}
function nonInteractiveEnvForProvider(provider) {
  return providerPreset(provider).nonInteractiveEnv ?? {};
}
function installInfoForProvider(provider, platform = process.platform) {
  const p = providerPreset(provider);
  const native = p.nativeInstallCommand;
  return {
    command: p.installCommand,
    nativeCommand: native ? platform === "win32" ? native.win32 : native.posix : void 0,
    label: p.label,
    docsUrl: p.docsUrl
  };
}

// cth/shared/mcpCatalog.ts
var MCP_CATALOG = [
  // ─── Safe, read-only, no-secret — shipped ON ──────────────────────────────
  {
    id: "sequential-thinking",
    label: "Sequential Thinking",
    description: "Structured step-by-step reasoning scratchpad. No I/O, no secrets.",
    spec: { command: "npx", args: ["-y", "@modelcontextprotocol/server-sequential-thinking"] },
    tier: "safe-readonly",
    defaultEnabled: true
  },
  {
    id: "time",
    label: "Time",
    description: "Current time and timezone conversions.",
    // Reference time server ships as Python. // TODO-verify transport (uvx vs an npm port)
    spec: { command: "uvx", args: ["mcp-server-time"] },
    tier: "safe-readonly",
    defaultEnabled: true
  },
  {
    id: "fetch",
    label: "Fetch",
    description: "Fetch a URL and return its content as markdown (read-only HTTP GET).",
    // Reference fetch server ships as Python. // TODO-verify transport (uvx vs an npm port)
    spec: { command: "uvx", args: ["mcp-server-fetch"] },
    tier: "safe-readonly",
    defaultEnabled: true
  },
  {
    id: "context7",
    label: "Context7 Docs",
    description: "Up-to-date library/framework documentation lookups.",
    spec: { command: "npx", args: ["-y", "@upstash/context7-mcp"] },
    tier: "safe-readonly",
    defaultEnabled: true
  },
  {
    id: "filesystem",
    label: "Filesystem (cwd)",
    description: "Read/edit files within the agent workspace only (scoped to cwd at spawn).",
    // The trailing arg is the allowed root — Workstream 3 replaces this placeholder
    // with the agent cwd at merge time so it is NEVER whole-disk.
    spec: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "<cwd>"] },
    tier: "safe-readonly",
    defaultEnabled: true
  },
  {
    id: "git",
    label: "Git (cwd)",
    description: "Inspect git status/log/diff for the workspace repo (scoped to cwd at spawn).",
    // Reference git server ships as Python; `--repository <cwd>` is set at merge time.
    // TODO-verify transport (uvx vs an npm port).
    spec: { command: "uvx", args: ["mcp-server-git", "--repository", "<cwd>"] },
    tier: "safe-readonly",
    defaultEnabled: true
  },
  // ─── Write / secret — shipped OFF, consent-gated ──────────────────────────
  {
    id: "github-token",
    label: "GitHub",
    description: "Read/write GitHub issues, PRs, and repos. Requires a personal access token.",
    spec: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: "" }
    },
    tier: "secret",
    defaultEnabled: false
  },
  {
    id: "db",
    label: "Database",
    description: "Query a SQL database. Requires a connection string.",
    // TODO-verify exact server package for the user's DB engine (Postgres assumed).
    spec: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-postgres"],
      env: { DATABASE_URL: "" }
    },
    tier: "secret",
    defaultEnabled: false
  },
  {
    id: "email-calendar",
    label: "Email & Calendar",
    description: "Read/send mail and read/write calendar events. Requires account credentials.",
    // TODO-verify provider package (Gmail/Google Calendar assumed).
    spec: { command: "npx", args: ["-y", "@modelcontextprotocol/server-gsuite"], env: { GOOGLE_OAUTH_TOKEN: "" } },
    tier: "secret",
    defaultEnabled: false
  },
  {
    id: "search-with-key",
    label: "Web Search",
    description: "Keyed web search. Requires a search-provider API key.",
    // TODO-verify provider package (Brave Search assumed).
    spec: { command: "npx", args: ["-y", "@modelcontextprotocol/server-brave-search"], env: { BRAVE_API_KEY: "" } },
    tier: "secret",
    defaultEnabled: false
  }
];
function mcpCatalogEntry(id) {
  return MCP_CATALOG.find((e) => e.id === id);
}
function defaultMcpDefaults() {
  const out = {};
  for (const e of MCP_CATALOG) out[e.id] = { enabled: e.defaultEnabled };
  return out;
}

// cth/shared/tokenCaps.ts
var MAX_AGENT_TOKEN_CAP = 1e10;

// cth/shared/triggers.ts
var DEFAULT_TRIGGER_MODE = "strict";
function isAutoAllowed(mode, kind) {
  if (mode === "allow-all") return true;
  if (mode === "communication-only") return kind === "communication";
  return false;
}
function classifyInboundKind(text) {
  const t = text.trim().toLowerCase();
  if (!t) return "communication";
  const asksOnly = /^(what|how|when|where|who|why|is|are|do|does|did|can|could|status|any)\b/.test(t) && t.endsWith("?") && !/\b(fix|build|ship|deploy|run|write|create|add|remove|delete|refactor|implement|update|merge|revert)\b/.test(t);
  return asksOnly ? "communication" : "directive";
}
var DEFAULT_COMPACTION_FOCUS = "Keep the current task, recent decisions, open questions, and file paths in play. Drop resolved tangents.";
var DEFAULT_CONTEXT_TRIGGER = {
  compact: {
    enabled: true,
    everyMs: 72e5,
    // 2h — was 1h
    minContextPct: 60,
    // was a documented-but-unenforced 30
    minContextPctLargeWindow: 40,
    // was a documented-but-unenforced 20
    message: DEFAULT_COMPACTION_FOCUS
  },
  clear: {
    enabled: false,
    everyMs: 72e5,
    minContextPct: 90,
    minContextPctLargeWindow: 80,
    message: ""
  }
};
var DEFAULT_WEBHOOK_SCHEMA_OBJECT = {
  type: "object",
  required: ["message"],
  properties: {
    message: { type: "string", description: "What you want the orchestrator to know or do." },
    title: { type: "string", description: "Short label for the kanban card." },
    kind: {
      type: "string",
      enum: ["directive", "communication"],
      description: "directive = asks the hive to act; communication = informational."
    },
    from: { type: "string", description: "Who is sending, for the trigger history." }
  }
};
var DEFAULT_WEBHOOK_SCHEMA = JSON.stringify(DEFAULT_WEBHOOK_SCHEMA_OBJECT, null, 2);
var DEFAULT_ORG_TRIGGER = {
  apiKey: "",
  enabled: false,
  mode: DEFAULT_TRIGGER_MODE
};
var TRIGGER_HISTORY_LIMIT = 500;
function validateAgainstSchema(value, schema) {
  if (!schema || typeof schema !== "object") return { ok: true };
  const s = schema;
  const expected = typeof s.type === "string" ? s.type : void 0;
  if (expected && !matchesType(value, expected)) {
    return { ok: false, error: `expected ${expected}` };
  }
  if (Array.isArray(s.enum) && !s.enum.some((e) => e === value)) {
    return { ok: false, error: `must be one of ${s.enum.map((e) => String(e)).join(", ")}` };
  }
  if (expected === "object" || !expected && isPlainObject(value)) {
    if (!isPlainObject(value)) return { ok: false, error: "expected object" };
    for (const key of Array.isArray(s.required) ? s.required : []) {
      if (typeof key !== "string") continue;
      const v = value[key];
      if (v === void 0 || v === null || v === "") return { ok: false, error: `${key} required` };
    }
    const props = isPlainObject(s.properties) ? s.properties : {};
    for (const [key, sub] of Object.entries(props)) {
      const v = value[key];
      if (v === void 0) continue;
      const r = validateAgainstSchema(v, sub);
      if (!r.ok) return { ok: false, error: `${key}: ${r.error}` };
    }
  }
  return { ok: true };
}
function matchesType(value, type) {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return isPlainObject(value);
    case "null":
      return value === null;
    default:
      return true;
  }
}
function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// cth/main/config.ts
var OPS_STANDUP_MISSION = {
  id: "ops-standup",
  label: "Hourly ops standup",
  intervalMs: 36e5,
  to: "god",
  body: "Hourly ops standup. Review every agent: who is doing what, and confirm each is still running (not stalled or idle-stale). Check the task board \u2014 are in-flight tasks on track, and is anything blocked or unowned? Flag stale agents and at-risk tasks, and keep the board accurate. (As part of this standup each working agent is asked to summarise its current task and the next step, then compact and resume from the same point \u2014 so terminal contexts stay bounded without losing work. The compaction is queued and runs when an agent is idle, so it never interrupts work mid-step.)",
  enabled: true
  // NO autoCompact. Compaction belongs to contextTrigger.compact and nothing else.
  // This flag used to live here as well, which meant a default install asked for
  // compaction on TWO cadences — hourly from this standup and 2-hourly from the
  // trigger — the exact "two controls that disagree" the maint-1 retirement below
  // was written to end. The standup's own prose still describes compaction, and
  // that stays true: the trigger does it, just not on this mission's clock.
};
var HEARTBEAT_MISSION = {
  id: "heartbeat",
  label: "Floor heartbeat",
  intervalMs: 12e4,
  to: "god",
  body: "Floor heartbeat: the team has gone quiet. Review the digest in your inbox, re-engage anyone stalled or blocked, and keep the board accurate \u2014 or rest if the work is genuinely done.",
  enabled: false,
  kind: "heartbeat",
  quietThresholdMs: 3e5
};
var COMPACT_MAINTENANCE_MISSION = {
  id: "compact-maintenance",
  label: "Auto-compact (maintenance)",
  // 2h, matching DEFAULT_CONTEXT_TRIGGER.compact.everyMs. The two cadences must
  // agree: this mission is the schedule half of the same behaviour the context
  // trigger now owns, and a 1h seed here would keep interrupting agents on the
  // old rhythm no matter what the trigger says.
  intervalMs: 72e5,
  to: "",
  body: "",
  enabled: false,
  autoCompact: true,
  kind: "compact"
};
var LEGACY_COMPACT_MAINTENANCE_INTERVAL_MS = 36e5;
var DEFAULTS = {
  onboardingComplete: false,
  harnessHome: null,
  recentHives: [],
  registeredRepos: [],
  autoMode: true,
  orchestratorMaySpawn: false,
  defaultCommand: "claude",
  godProvider: "claude",
  godModel: "claude-opus-4-8",
  // Global default model for every agent that hasn't picked one explicitly — wins
  // over the role-based tiers (modelForRole) in the spawn handler, so all agents
  // (incl. god) default to Fable 5. A per-agent model choice still overrides it.
  defaultModel: "claude-fable-5",
  // Seeded from the MCP catalog so the consent defaults never drift from it
  // (safe-readonly ON, write/secret OFF).
  mcpDefaults: defaultMcpDefaults(),
  maxConcurrentWorkers: 4,
  workerIdleTimeoutMinutes: 20,
  integrations: [],
  defaultWorkerTokenCap: 0,
  // 0 = unlimited (human directive: NO per-worker cap)
  semanticMemory: true,
  embeddingModel: "minilm",
  missions: [OPS_STANDUP_MISSION],
  notifications: false,
  strongKeepalive: false,
  autoUpdate: true,
  telemetryEnabled: true,
  multiWindow: true,
  tvShowOffices: false,
  officeTheme: "office",
  slackEnabled: false,
  slackSigningSecret: void 0,
  slackBotToken: void 0,
  slackChannelId: void 0,
  slackPort: void 0,
  slackProactivePosting: false,
  freeflowEnabled: true,
  groqApiKey: void 0,
  freeflowModel: "whisper-large-v3-turbo",
  realtimeVoiceEnabled: false,
  realtimeIdleDisconnectMs: 18e4,
  webhookEnabled: false,
  webhookSecret: void 0,
  webhookPort: void 0,
  // Triggers. These three are the ONLY object/array defaults that get handed
  // straight back out of `readConfig` for a config that never persisted them, so
  // `withTriggerDefaults` re-copies them on every read — see the note there.
  contextTrigger: DEFAULT_CONTEXT_TRIGGER,
  webhookTriggers: [],
  orgTrigger: DEFAULT_ORG_TRIGGER,
  triggersMigratedV1: false,
  // Memory reflection — preventive; nobody is over threshold today, so it sits
  // dark until an agent's memory crosses one of these (the verify gate is the
  // safety for the LLM step). Thresholds DECIDED by god 2026-06-06.
  reflectEnabled: true,
  reflectIntervalMs: 18e5,
  reflectByteTriggerPct: 50,
  reflectSectionTrigger: 50,
  reflectRecentKeep: 12,
  reflectMinBytes: 16384,
  // Enterprise Knowledge Graph — opt-in; dark until the user enables it.
  // v0.3.4 fix: default OFF, matching the field's own documentation ("Default
  // OFF / dark until enabled") — the true default contradicted it. Existing
  // installs keep their persisted value.
  knowledgeGraph: { enabled: false }
};
function configPath() {
  return (0, import_node_path3.join)(import_electron.app.getPath("userData"), "config.json");
}
function withTriggerDefaults(cfg) {
  return {
    ...cfg,
    contextTrigger: {
      compact: { ...DEFAULT_CONTEXT_TRIGGER.compact, ...cfg.contextTrigger?.compact },
      clear: { ...DEFAULT_CONTEXT_TRIGGER.clear, ...cfg.contextTrigger?.clear }
    },
    orgTrigger: { ...DEFAULT_ORG_TRIGGER, ...cfg.orgTrigger },
    webhookTriggers: Array.isArray(cfg.webhookTriggers) ? cfg.webhookTriggers.map((t) => ({ ...t })) : []
  };
}
var triggersMigrationRan = false;
function migrateTriggersV1(cfg) {
  if (cfg.triggersMigratedV1 || triggersMigrationRan) return cfg;
  triggersMigrationRan = true;
  try {
    const next = { ...cfg, triggersMigratedV1: true };
    const legacySecret = typeof cfg.webhookSecret === "string" ? cfg.webhookSecret.trim() : "";
    if (legacySecret && (cfg.webhookTriggers?.length ?? 0) === 0) {
      next.webhookTriggers = [
        {
          id: "legacy",
          name: "Default webhook",
          secret: legacySecret,
          enabled: cfg.webhookEnabled ?? false,
          mode: DEFAULT_TRIGGER_MODE,
          schema: DEFAULT_WEBHOOK_SCHEMA,
          createdAt: Date.now()
        }
      ];
    }
    const missions = Array.isArray(cfg.missions) ? cfg.missions : [];
    const stale = (m) => m?.id === COMPACT_MAINTENANCE_MISSION.id && m.intervalMs === LEGACY_COMPACT_MAINTENANCE_INTERVAL_MS;
    if (missions.some(stale)) {
      next.missions = missions.map(
        (m) => stale(m) ? { ...m, intervalMs: COMPACT_MAINTENANCE_MISSION.intervalMs } : m
      );
    }
    persistConfig(next);
    return next;
  } catch {
    return cfg;
  }
}
function readConfig() {
  const p = configPath();
  if (!(0, import_node_fs3.existsSync)(p)) return withTriggerDefaults({ ...DEFAULTS });
  try {
    const raw = (0, import_node_fs3.readFileSync)(p, "utf8");
    const parsed = JSON.parse(raw);
    return normalizeStoredHomes(migrateTriggersV1(withTriggerDefaults({ ...DEFAULTS, ...parsed })));
  } catch {
    return withTriggerDefaults({ ...DEFAULTS });
  }
}
function normalizeStoredHomes(cfg) {
  if (typeof cfg.harnessHome === "string" && cfg.harnessHome.trim()) {
    cfg.harnessHome = expandTilde(cfg.harnessHome);
  }
  if (Array.isArray(cfg.recentHives)) {
    const seen = /* @__PURE__ */ new Set();
    cfg.recentHives = cfg.recentHives.filter((h) => typeof h === "string" && !!h.trim()).map((h) => expandTilde(h)).filter((h) => seen.has(h) ? false : (seen.add(h), true));
  }
  return cfg;
}
var configWriteListeners = /* @__PURE__ */ new Set();
function onConfigWritten(listener) {
  configWriteListeners.add(listener);
  return () => {
    configWriteListeners.delete(listener);
  };
}
function persistConfig(next) {
  const p = configPath();
  (0, import_node_fs3.mkdirSync)((0, import_node_path3.dirname)(p), { recursive: true });
  (0, import_node_fs3.writeFileSync)(p, JSON.stringify(next, null, 2), "utf8");
  const view = normalizeStoredHomes(withTriggerDefaults({ ...DEFAULTS, ...next }));
  for (const listener of configWriteListeners) {
    try {
      listener(view);
    } catch {
    }
  }
  return next;
}
function writeConfig(patch) {
  const current = readConfig();
  const next = { ...current, ...patch };
  if (Array.isArray(patch.registeredRepos)) {
    const seen = /* @__PURE__ */ new Set();
    next.registeredRepos = patch.registeredRepos.map((r) => expandTilde(r)).filter((r) => r && !seen.has(r) && (seen.add(r), true));
  }
  if (typeof patch.harnessHome === "string" && patch.harnessHome) {
    const { home, recentHives } = normalizeHiveHome(patch.harnessHome, current.recentHives ?? []);
    next.harnessHome = home;
    next.recentHives = recentHives;
  }
  return persistConfig(next);
}
function setAgentTokenCap(agentId, tokenCap) {
  if (typeof agentId !== "string" || agentId.trim().length === 0) {
    throw new Error("invalid agent token cap");
  }
  if (tokenCap !== void 0 && (typeof tokenCap !== "number" || !Number.isInteger(tokenCap) || tokenCap <= 0 || tokenCap > MAX_AGENT_TOKEN_CAP)) throw new Error("invalid agent token cap");
  const current = readConfig();
  const agentTokenCaps = { ...current.agentTokenCaps ?? {} };
  if (tokenCap === void 0) delete agentTokenCaps[agentId];
  else agentTokenCaps[agentId] = tokenCap;
  return persistConfig({
    ...current,
    agentTokenCaps
  });
}
function resetConfig() {
  persistConfig({ ...DEFAULTS });
  triggersMigrationRan = false;
  return withTriggerDefaults({ ...DEFAULTS });
}
var MODEL_GOD = "claude-opus-4-8";
var MODEL_WORKER = "claude-sonnet-4-6";
var MODEL_HELPER = "claude-haiku-4-5-20251001";
function modelForRole(meta, config) {
  if (meta.isGod) {
    const preset = providerPreset(config?.godProvider ?? "claude");
    return config?.godModel ?? preset.recommendedOrchestratorModel ?? MODEL_GOD;
  }
  const hay = `${meta.role ?? ""} ${(meta.capabilities ?? []).join(" ")}`.toLowerCase();
  if (/\b(triage|rout|verif|lint|format|summar|classif|label)/.test(hay)) return MODEL_HELPER;
  return MODEL_WORKER;
}
function ensureHarnessHome(path3) {
  try {
    (0, import_node_fs3.mkdirSync)(expandTilde(path3), { recursive: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
function ensureClaudePermissionsAccepted(cwd) {
  const home = (0, import_node_os2.homedir)();
  if (!home) return;
  try {
    const dir = (0, import_node_path3.join)(home, ".claude");
    const p = (0, import_node_path3.join)(dir, "settings.json");
    let s = {};
    if ((0, import_node_fs3.existsSync)(p)) {
      try {
        s = JSON.parse((0, import_node_fs3.readFileSync)(p, "utf8"));
      } catch {
        s = {};
      }
    }
    if (s.skipDangerousModePermissionPrompt !== true || s.skipAutoPermissionPrompt !== true) {
      s.skipDangerousModePermissionPrompt = true;
      s.skipAutoPermissionPrompt = true;
      (0, import_node_fs3.mkdirSync)(dir, { recursive: true });
      (0, import_node_fs3.writeFileSync)(p, JSON.stringify(s, null, 2), "utf8");
    }
  } catch {
  }
  if (cwd) {
    try {
      const p = (0, import_node_path3.join)(home, ".claude.json");
      let c = {};
      if ((0, import_node_fs3.existsSync)(p)) {
        try {
          c = JSON.parse((0, import_node_fs3.readFileSync)(p, "utf8"));
        } catch {
          c = {};
        }
      }
      if (c.projects?.[cwd]?.hasTrustDialogAccepted !== true) {
        c.projects = c.projects ?? {};
        c.projects[cwd] = { ...c.projects[cwd] ?? {}, hasTrustDialogAccepted: true };
        (0, import_node_fs3.writeFileSync)(p, JSON.stringify(c, null, 2), "utf8");
      }
    } catch {
    }
  }
}

// cth/shared/dropFonts.ts
var DROP_FONT_WOFF2_BASE64 = {
  inter: "d09GMgABAAAAAL0wABQAAAAB4AgAALy3AAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGoZeG4KyRBzVcD9IVkFSi2k/TVZBUl4GYD9TVEFUgU4nJgCFNi9sEQgKgbtAgaEUC4gOADCCnD4BNgIkA5AYBCAFhi4HoQRbbM1xJ9pEvFeIqaVsuokIsO22SVU1fQk3aHa/1VxA501dSsJn5lSwbRr1bgcRJN0fNvv////PTSpjaFO2tAUBUdXp/H+hZmYeWbxMkksUg6gSjR4sJp1OluyFAZzHknNZFfcOC/jkm4TBTvWYFyAlzqJGm4RoBKtiTp9mkyGfCzYwC/BDbocpQqUSQIhMa7ygZvA0U75Y4LFTHnT/aGZJWR6pLqVniIDetGuXwgUe8/POsOsP1Q9VUiWTp72izbt5tKtLgWhoWrfh09M7RFpXf5QIFuBDxYUkcftGuBj4EcUodLrLBqOES28ulU2C4bvURfopCwxHk8sX8DGo2D5LQadmFhKB7no9F66EECKF6kb1LqY15mIYK93FNtnkyduuV/xNv9PH6x75G9MA70vGml6p8vX9jTf8AlMyEzuyoIG97E5cYX23aa9Hhfa/gh+rhMr0p6hG3V/wUX/4bg8BtusHxJhISTNsDu+T58G6+P7cJFXdA5Grx9UI3uHDWFqdI9Ktmb2SSyGEEKqU0AMiIERQ9DXQRVFERKTZsDREnyYqQuzAK/KWiqiIvCLvK49+s1SK7ysqomJ9xU6RIlJyVj8G+727t4KYRiKJ6Uw3iRAa2bRlQiZEItHsW/vD03T+u+jlcsnF5JJcVJs03iStI4UWK6LFbFo+M0LKTNmHjYkoait4BVakjq+l1KiQpkOgZ1ejQ422tKUtSiXWioidPSUhIkaCIEQiJCIRxIrZgS6Umqtf2qKtjv1Px/y9+msMz2/q/7lAgHjTWFWm1u39lwuknXfinuWlXXeFXDRAULlcJHiACBaVSpLG6zrP9pfj382aQdsZgpTumfvX7RNCulCnLRXfvMwJ+YXfUxXkTPjnn/182+cl+UV2VSRMdTuAwgDh8lHDRrIjMIL8qBEeMNcHvm3fH+/WjbYKuzHASXJESqJioBVY17svf6PqbzuK4d/N6iGtj+iaWFkz/5I7p6zJuXQ61p1ScwoePIQQgkYhEBIIwQMEAPR8+/VWPTOJIpIZnRPLCgkX7n+LqGKXJDBIYOoauuaHLayoaOIjGdjlV6MOfAKzjwhVNzQG8uRBYAVG2G770u2fvmQSp6bxI+T7xENyB+QBe8AeoEcZuQ+kAeuBNUAPWC5Q9GWfx1lOJY/yDoxbtnO9DPRjm33JS4DgNZ9ZFz3tVZR+Oa2onNy/uJXaQAMEgOdzqn9JzlyoZbnAjsVZJcsFBJQRPR7+3U9T2ylSxF9XdraQNyIXPyBJZMSM6/E1btLkwv/za5LnfprgMqmiIj2Tlm3ZuArXd/NTJInsditVbStcBuZmuh2o+5q/Le+s6Wn6HRGdCSs788v5/j+BxKuXa14CfoTIRDS2lRoVt+HWDIa+ViyxC8jxO7gBW/OIoGiLnaEaCsXU2aW+WOJz2VEo+nvGlPjd/j3RNKHmv5gaD0KBXUYZRsEehmEIuDF2TFNM/H2pWtf/Gh9kA5phEeCu2FpPaNrLnY+JkCacQbXkCSnd99xAEwa6AVINiJIBUAGkU4Myxx8UaYPksMwGFGjSKVLakO2sTfkDlGpalDzVJhVAOVGaqPJtYqA3hHCL8bS1p91biOe9nUK+7Snkw+m+x93rZXn+//fmbO5s6ij+etAlEhlh/sKqKS05REF/DrprzauscSBjvAD+v5+m+OmM5rkr2p9WEdv5sgNIAA7ga3fN3Y1SuiawdVQqlAsK8gQgT1AHpHVcAQpjISAAx/+cllRPT77x/4su6bQ1zlclIxd5i51a0HpTCwsK4UFHYADC+WmtX/2Le4iQCUnMG41QmMfyvu0XQ8yiv5WbO/8ijmop1ELNs4MdJLETVBI8H960wDp7QLiL8kmCA8CPYRj2l6qfLR6BNyR/5kVeCKEozyFWJ3cVsIvVYrFYEUzzQYI8pUskpR8yJQetwH8GeSGGyjFQF0LsfOXVrly5c1V6ehdFFXLfmIf+l+/s3iS0stDloIiOcN+q3Ucdhtaqa0U4MBYhP8Jx8ECgLqa7fnPxCKfgAxOkGc4hlEASFBLH+3xTZ9v8XOc6hmIrhE8c8ssqm9XruP+Qa2oewlIXHDK9wBLCOBOecPNd7o+pilS1stzLEdZ9OtYygqAgwlXJwr/bC6/nhumPhSelkyKhBBdk7HPWxMpSrcMGsGGGxQgzCCOEEI1ohBA6YRzfxPl9y2RNdvv3faPQ77zZeW6nHCQEEREJEkQknX0IdYqXva4nCasWr+lFjEq5Tuwb6+8dY7Yf8GuX1ae/5AEBBTmWNsEitkz2kJfKUKpQ4/X//dLPi8Gk3T2+ZZaNLIdSawnBKxJFQgjHOvM1lqqKI1Neth/ZVFpz6cNukFF/QZG7/ffQd4HvIswRhVCRs1CVR9Bjz6GX+qBBOhiCBDA0MoCRoAQwUtQHjHUEjEMGmOAIMOHRYQqrh9mTHmZ/RpiDWWBO5Yc5XQjm79IwF2uDqWkEldauwHTUgUp33SiIAKsDi0NsahpsqOGu1Q1hbkNQbkWDshFwCnAIsDI9iEDggQXOPtm7vQDyP9G7f7Y+9Uco+35f/hvvxaeBOeAe8BVQIAKkd761/u0pr4EC5AXBef4Jv3BX5YMrdv/fntv3rzjw+FMrbkKPvnKL8+Ss2yrvXH5X5d3L7x1/7/J7V967+t619y9/wFzrrI0/uPxhZX30kvNS5WOOf8ufeLisvQxMT3+SceW8K5VPLnly+VOO64broevxZ21NrqaspmBT5fO+oNGKHwAzshFCBHGhdDGLTbIkqN+rVUtPnanehoztbX4LDnwYRsg7nJ7e3O5O97OLD6X00c9wSAOP4vjSkvmmO/3zkzm43GqWP6fTWR0xUuSYKIYBa86TTyEiarHkbGOExU976TuJWFQmOdOY+BzOl0cycktZhDqgD46jsLEgZEEYhRYehAy2sjksbIUO+7URjkhEI5ahclSowhWtwk5PzjXn//QTtXTZ1kFMbNzlbxBNZ3pTSr99G7pYktK+O5qgBtbtcGNhHofHE+ydhAVbBIk4MqWyXWnKUu7JZKJUmtjOvegIivXu6zsL3wGPAwAEoE24SCKtUzsbQpFUh8Vm9/j8cBjDE8k0STFslsvxhdJgwvN5KGJMorKq6YZlZwViBaHRGsxWRyhcINEa7aFsDhAgHQYdFQRgbxoQYFERitD738bp4f14iY/B5WneH4XLC+5sAuZoQOcNUFAm1Cg7xs0ue5JPYOSkqf6Vi1C+GI3v2hwIJjg2ercBtaG5gnHXJxpf5uewRmhJsWSQCMIlSsXzzuJCgqHhwZExCaok7FnpBR+uQxWG6SBafD6UPwfUfNiMH3ni8C5UivfKiBb3hgy2AKpvJjiC/7WCaVABDXhcuSU8D0fg4hdIkmMcFh0GZ6/4Nx//0NL/Xgvdl/o/fPtXfAS+9ri+Oiv5yz/M4Z/3YVOo7H1x2cPOd9ZbLrnI2U/bComrutjZTqugctwTnkMe5bE9FGFX/sfFF9rlmTOue7U1n9iqja3nMt+DQZNpZStM37ahV14eNqdTW8WOpiRGfInEHq0zI42y2/K/TWbYIc7yifFGF0EQDrb9bPk6tzrgfOXrtltrqdTdwLeD3zXbRCNsqqD0sFkdS1ZO13RB+cpYQcqNSytCVSqQqFizFS+PTJIIZnopMHqFFnlsoMG0u83Q6RM0QotZQzlTmNZrOJlIwmkwm7EgL1ZZgpHoryUL19xpef5XpYpVq+qG6qiq4jqqq8wFSZ0uzQblYfjE45lscxbjjTWy8PN9C5rxfvRh7CjtSco3lsiCkD5z4ga0a9Su2BojujTIuVGO1aSioUr9emM1TEaEAnNAyLcAatm0GSMCYqu5ZIhYBZ0Yg4BEinZJlRlGUrIK4agtQinyvBsACEeSpeqAztqyiNe24NAk6E39qzMefI9uaAVcVbTyv9DevGWz/kU3hK0nNstO7Z+FwrRJWWLW9zLpWcR4Crd9E15Xz+OhLZ+9KVXx74Y2nOQMUF71midvXjG807SupKyoEX2RM2S43m3CkbgV8131NbICl2yOfDhPVePOWXFLFhn3Xza9foOTJzgQKjOcTZhWDYGp86oAef2Rp68ex54tWo7GuAdTr++81yZwExUeu0b7UOqZwCa+aWayiWrXLvwJf7uhEG30URWB+3bwRRkbDbvvaMvl4Ja1mtqZD3OI7J2DcIGh/SkX/MuaGYHD/bIvl2OzZSx6L+QlngLk1VeGNPOs7eYZlkr6enPTOaVYX246qNY5hIvuMNvMe7Xp/MY/PdufDHWu7DNZifO0Py8e7GdvMpHnFmMQCss4oiRcsmPT5PgitkzQP9ebG4+/UpPxh78OoYHMk6uy8BFZsNHm/4Q/GcJyfjhfo72Yx88Ds3DApGaFzw4mLOGro34kNfhwiLweyV4GloOmDWkLShB29CMIeF4SklM1HdexIkRC9h8jacvLa7bnRe3VEo+L1n7qOCFIGloxb258jez5vvZtDIsCBmFtMWezGTAYMVsJX7LrfNUSb3j64t79YLru5cUH5sQSy2o5MJ/dcPnF5b7E69xbIGPrYo7h75JpfsRxCNazc0hDXryxrLHdZMsqZ5xxe4nixaYYjswSbL1JJAhZW5/pVo4bUY4ZmXGOsYcbLIaaJesN+abkwXl/sIPL4G9CDLry3D8Mxxyf31ZBt0RumZcuMvPR7+M/XZXfhqdlKKl4QE3H99HPg1EIxFGzK5socjt93p4b+6osmW3c114Nmftxv+/I+rSdoxuLwQl0/qOMzdf7r2OfFcDX8GBWMqF0CTPhJIHWu5Mgoiv0ku4p6Sq7SGc+Gik3+Q97OqgvsOJvnlgXBNm6jllh/09lLgqxM+dzr+a/vTwGItvUZxPJVS6WILXSzk/HhmTRVaxzHNDT/vDl3URwqTYxDx7ugT9igPsAXGj3hdbUMpRqQa1XTsiWbvqyvcyqOjn7vE25N9nu8hgfuQgVVaJCdKlKFCfmZzm1PAayaUomkivx0achqFcVi67u9UdOqWL0csxnQkEIlDWfy/MTBc0hzFtnKF7o18mCfLiIPcER2D+f19iv2BeavAa7/SEe8koirLipmRtyQOslMeydafS9cLw0q+yy+rHXQ57cscKJbr7IHrZhLoIAujkH0ebqqx6sGSCDKx3fJvvByq1d0/ogEjg/OFmq+ZRWLseTxF1tbUrRQCGdwOV4Aqi3/jyH31zAvzh9SKHeY11+87s/89dhhPQkMy2gpkWfFmNaTLrHYh1D/FBPwVYAWHwjFmHwhctsDnKJV0R5vJ9ufYKJ8Lxl5NF/tmlRH/CRW1iM93b/Ar/jHSJ+e9CRn6LOsIx31Sz8O77lG3dDE7rHpYvZULZMMorcaCGoctnYkku8CQ4MJholbZDqcdbKYiYZRW7TQsSrgmyYIIvDWrJBhklfksumb1J3sGf1jLGvDYW09mFEHK9B7ilGjsUmlpcuQxONYF/l6lo7DwPY5Y5Pt7coWJ+sL72jyWSAXZsCZ0i5eh4O5usH4ls5cCXu2YQhpgvt62ddyNLggPChj9NG0xOTLzJcJRjunLj6YdBcLlJUm26+6K7B2rFp4o90bg2g2qJ9Ujyn+1nALJjjQYnyJBw6dmPkjI6QDzPRE5Ivt5AU3R0cSpAMwyB7HG9U88DT/jPjqmEm0zybZ/w8luTP/pUHxUjbOxJ2Rq4i9H6Vw3cT8yKK/HiSM8z8WROAYrlMG+A0Z32fvocv4ahfTogMDbXG5b36HM4s9Jwva32ddsFTsXr+QqncGP9PFFuhj5AASzMgZsSTHrWphoqWb4LtCuUqstN6e5y1aXvhKH9zg3q1bCN6r9+i+l0fITCidNGZ3tRaeg+R61eQoYHK/Nc/LkRlcfkVwNTuEiFDbbBf+w2QAmXNvwSCdX7t/cNQbnD3nqzAIT34LffMLoOn6Wn3jnPveJUxiBnIvmMakw6eEJpQXOSlxoUDEhey74dwn0NZYeFCkxYXacE46GP+kMORXlxK/xQnjy/umhEdzy/ddVISi7+1O7qJUO7zL1Y2EMqMdEh+aWhavF9+vdHXVa8p7WLktOqGlMeptrLvPa8oTjAVTdeertpdj3XpKwgxXnrstaYtez62v4UYRqzPgd86TZvjMgnXChBRmvMg0lns4xy3PU7YPfwpo8tAnAWZwfycJK5F5J6Er0TCbEg1WLvJv+khooV7UMrSHMmV9pkYmBvXhwT9ZY3TW5LGO8KBPK6Afv4qtaCln4yELfw91hqEvtHc6+7yYwye1ZPMpsbNB//77n3HPPlaB/DXSaCXZRqiDzSunsKvpzUS6AZlGw8fRuvPw/Hn/cDTJleElYkhkoTPvNzkj2wOeBHEM9pMVdwlE2Dxlg7xQxG733+LjTV8m+nDmR/G/MJxZ0/++k/8uVnaIWRIWUXRHs8n2JZUFvyGW1zwOeafwKwbg984nXMEZ77vJ4EZBdoVsC5/Uz/sJN3H6wpHrvUlrakWkzWNTvq97ul+VVp+0q990kLMUxL0VDj6g0o1WWtRyTdKp9nX7be2g+bDCIITEhnjDV3/uGYdtargr7zznmjol8cjaH/ZWHFPBBCuV/0UMDL3l1yU2lu53YWNF7+S4eNmpScWqAhRDFxsQBw7JHFAL6pH0owoQj/+UZg0sWDTpJVtU+NJmpHAn7MTcWp+OZxbWSHP1qXmXVWVxrQpQkAakwvLcYIp6cwoMmcK09NDTM4xIwNBbEbzictEISHzHyRmuZSZ2eig2fmok+ZBd+Y8lga9tMAAFmFgcds7r0R1EZG7qQgcKju6QxIC5JGBeRTgGhVYRwOKYCCPAZxDJtiXZMfkQ+KdH2Yk0BkFxheS0WDGQMcfg/IwrQBpQpBmPNKEwSaKoU2DynRsqwATB514MDOhMwtxZgfCzCmLKEmlPzUv6Zv55eCyuAKCLKsIkxTArMC4xzHpCYx7EpOqApLMtDBZBTqrwayBZC2YnF6VG3atBzobwGzsqDYlWLcmppd8oFOAVW/AZhuy3pr06r6ZDbBsG8Pajk0f4NSHGLaDIX2Msk8w6rO2szVul77Q5AAKps/idMcuNw3zuFmETKwvezakTFBUjGJWWQ7PjGLqIZh0Ag4XrtarKofUd1VZhPGXluWHJYPPDSoMTxbmayiOuKg1g2eSTBgPcb2EC1f9sVMEdQ+pOEKPiJgeEWGxHwrRWU5oMISFISxWtQ6p8rK+68qG1HRVTfoIJQkFfRRrLhh2Me1wzsw5MiVnxXYw7NKAeZOJgC/uJhBYtvx7PylyOj1znvdqfonLq/+CUruliObVkTwIKRQgh0KcFt/884w1pM6Qv2DR9B5lv9MJi880OPmTGAWWB5bZAmjZN70o+3WymLd39LtLkvo3D+whMrDPC3xiTVY4qGEOlFYIkzo2BxXhU81hirs+AjNN0MkG0BHwkbvfbdjJ1zEvDg79Jo6Cw1YG1g7/ZNNn9z1ueQqcsi7MJXDy2qgsHnq3VVZRZvUsQahYtFo4z5WQufqcr4DDF9+Sl9k+D8AOvLsSgJO+jWy8JUD+aGD1PkmfMn6ftvGPFPvwN0WVJjjhq0FwABJod1IJtrfj8uq973PvVigbsvAitAw/vRjHlYgcP0kZVenUXaUVp6mhel4iaXXJkucoVDv9swb2zqhlT+MDkscxE0FyeNyO3X1Ixg1NGK5lEInXovMfh2onMXkUS7AFOZDb/9iQXho5CeJ9ThKNWpNoWSD3ju93QkfIKw0UEBoCdP0E60XXqqDDHlA3xOI5L4RdYCChSDgOCI77qCHDoXJu4/0yzgFsiGXKfO+tiTUPSzak2GjYCPiKcuVVaKeeHdQPdrytNOxaT8z/yI+oQOsVjAvvO0xmDb4EzjVIAjOEq1gaoW1t0EkHme/jh08HnyIHXRF414zh/pBhrTkQvKHk4vrsOLC9BNxx8T8NS2C2XdiU7E+IQyWUYa+tttQzTjNnt7LWC9e7pfWUsyKrq42twquxPxr7SGbsfvV1a7wP93fEnYzWZVC6u67gPa1Zj8UgP6AONLhVWHZ9/Sleco3mOW/x0Xhd3sn8IgnfzgKsHO6rqfgj2lYUHJrEtBA0C3Okbh/A0eLeopw+z7TYFXnMIg/Gj+TuXLYD2I9lJUfypOd4riONqU2Vd2X8k/vF7v6m5ba23Lrjqq8fu0HFH7nk17z2Tshz/Jz3S+0aA9a4oDM1AcWaKXNWzLLOZVHsc53inwk4FeqpZ5vr5PhaHcW91ECnWuR6OmR9Y3/KVhKt8DdYdhK/e4xxcdH93pi2XenKsj5Z3LVEyUpuf9V8xpZWyP/aRT85mpTClkMAE+/1NeVFYYmSiB6gkg6+tP4ctL0tPLZvMMnA3/oucglcfkbrBOIVO3E6fNnnDNp/as09e9wMMCnHXz9db2hoLJZ6wkmhU1sGOak6q01Cyf64r/eXCXJKdp7Ft72r8gBeQqBWZBU5qpK2vu1DGhBl+zbTImFj3Cj/CvlNQRYdK2oK/4AZuWwsrlwJ+SdASreBOgMvEVfR1LK7ay4X1I2Nfjb64PFaL0ZqLAuOh/vRAi6Tq6lHgU9eoM5YS8m69/yxDkBehoBj1pOY1t/V+3Uwb5bKojsuImX0i3ZLLJahuNxdT3Kn/g4Kp9r95ncaS1ygnXN9jSPanz2GsfNveFzwXB4wJfUnvMzNBAmqfrCihQ34sTyg7fwmy45ahgTlDz8LqbF1oZQw+6Goor/OxxbgM294ScsB7V+Gwk6dPHEXaoFtLzu+FPjLbmuSr8neSSfwtB5P+9WVSoLscOZiKQCt7aGlFp18/BKkxQmvM5hs8vX+6NO0hcIjrHvsadflz4s7xUqjrYHtPn4C8Ve4OLAu8xdki1ZoHMSLAk9q83qBrhrgSF4j9p1DOMKTdcBc6vGzePMaSRvR8LYkmLBnU7DOr0CYzxmeWSEcNL4H87yeE9qqMAdzHWZ+poQ5QdUCQA3jwMEjHmms8zI+Wx+SONG8cXVKtjgBPzhKAzc2rICvR5fFAKB0nub1gdftYfFxPab0ZRSwH9yx59qr9xuKzIWVoMTkj8C5VUuT/yy1936dEVzUo22lqVN12whkFjsd1o5AlAcvplEXcTVHP6T2SJ/jIOkSBodKcKTNfQHWE3PW89f8QhbRUwow/kXdcUBqgTQw7z1bUIz0tigpihnsTwdjt2VnbdquEfcxaxDdzlZodSK6AsQg4G4D9ysA8f91Qf2Bq7C66Y7nZYxqfIDInFidSS5nd7HRHeN0ySkYyEoseFj5KSUGwkvwFgBLgMHXLkw4zGDB/eSirNVpnSgv4fNnlohB+vhi5c5r+9AyMR/RqM87vTOWC3yK5gwsm9YpK6PpK0TCx2nM8TKZOylbvrJBbZLfSza/YcOZYikZA7WqpEX/WZbtqdU6e7fu42198XZ8hHqI7fFJHJmbsQUUz8gJbR8ZrO58fQmQ2vi8826tWcxly+o802PpRvgMi7nAapSBWKo8ajB/ykvkgC05sD/u65G9dD/emWIKnAXJ6x5CkJ/We38Y6GMYXvFulAMfjO7Ica8w6FeLld+RANuPYv7y95zsWN0AMwHATHJKFCgkAACQHQzMTTG1Eou4wyeAsSZELefgr2d6BorScAwyGzRm3djXxMcb/LOiBHAtkmwCTXsS9xxeqrzEAQo5h7fnz/TS+XVyQ9W78Ru3jVV+cEyYq/nFxBcYcMwibnH0P7fR371wlTi7WpUlE6A3bD2OXmDKjnslfb9scm4JWWtec+FcWUL7f4TF/l/btcW9C1nkbQeWNIeoH32CGLDaQ6xI+L2s61LgZDASZA3U6iB/iPbAuOvqPM7ExFEFlhgEo9XvMxSE/OHPA5i3bqt79YIDPu5ELFB1dyq69mw84l5M6jj7qKlp1izx36MWTz+AVrQYtwsv/RkBDPlRDUodPwRKweAB9qMLxh+xoytgpW+nEOl44vCrD2QJDrMekP2BmY+iBQvRTCMYY7A7/D78/gbmER62y5TFM8qQ9KMYgui79//R+R5BCgZikAVdQhQj4Dpj0EMy2h1S0OGQiqqOduqdRtecNDftgHZQc9c8NS8tQAvRYNJDO3XcOjnc2Xz31Cl22tMver7vaV9GN63nQyVoEVyr97Cf3KrQzp5eJWkcYtna0Smwe9awebziqFeNTWu3HiuYim6VsPZPRYv/HBgHaMpysIoN6u4Jcdlw4alD64DGxqp9tEqLnXVQixh7bMHb0lq6sX2N6OEjt8SNXezliet2tmu2Qa3a4lqWgBeWtLIVaqkW261X6w4s36LRjQTAs1VhrOSh7bIoBNnI1M+1SYtHbmZLZcdsDStax2grk9qpx17Uvf9TxQaEPoaMASSnQDNiC9lxQHPkDLkYSsHVMMiNB4XhPCEvXuyo+UH+pqJFmQZFi0abbgYUK56BBIn0zLSU0DLLmUmRylKadHIZskmsk8uY1jYC2+2AihxGlChh74hjiFJl0Anl9P3iJCunnKavUiUrv/qNvrPOMVXlT+gvV1GuuYP4z12Ue+4hGjxAeegRsSZN0GNPsZo9x3nhhbFeeovT4j2RD76w0KqNuXbfiPTqY6JfPzRgADFokC8dHedISMA9MlIwIioy4BMNWfAIRg7cY6AQxoWgCEanScMmXTo2GTKwOVuz+8jOkCRlREpGyohbvE4ZNJSroVwN5frMugnjJptK588wOeaCaBhm1DmTpIxIGVFx4EjFgS2lIaSG8zScJxkpI1IyUjJSRqRkpFwY8WZt2M8uvZ2KU1vtJnUf3PRDfz405pRI0mPZqnsGIxGbERIMPfoEzUFeZqcZo5mwIWBrGdYosWyRmKqYtkVxv3oz4mMUcyryaKoRjB3ur8CxZzs2KaujfP27wDZOttsJ7XEYNgprFgghR8JynKmErZpxkX4XNgcLItKxHCUARcyGkjiGCpowfrzEOgKRuIaADeKkTbGsrLHSGIORjzEYuaAcPtl8svlkx3UCJysrqwLaWAAjh5HzcHDycLDFfBonU0zNARMRFRlHYeRjbIzByC9ijQDGSy7Oxc/Lfazdl0wRu4zcXgLsBM7YbDXaKrK8N4M1Soly8uAhW9D/8DBRufT5Up4SyQVilv2YSSKRgIjPAyo2v33K633kqanzx3p+2TRKkxzV+Q3PbR19qkc+LgO2HH0/e7An25pkbmgS28p258KPBPjt16/EejwPAq+M3Z143/+5Wkh46vI/ebHLXjnt0cjFmG3p17Yq4OtCFhUyKi6NqigpTDSuGuCIvRiPSeCgYInBnQiJiElIycjhFJRUCGoaBkYmZjZ2bh5eaxYFLhpCjFhx4iVIlAQJhYuHT0CoTbsO5w0aOhi+s+U1GDFuwqRpM2azEJBFuOAdFy1ZdsllV6xYteaqax5514ZNj1XOTfoDO8w/i7TuI5WOD2CtLWhfElBPRwGNwRLgCImISeiR0j9MJHR52SPxMGdZ370wINnye1M64mmFlX6U+gDevfuSx6/yVU/gabjcu1gXF1DhtF+d8VvImaQh+n0EPSdAblZOwy+CnBxOARVOp9LmV2f8dszjYQ34U+SEKfFTDqdUOO1XZ/zmrHPHdPRXPqrEFR4wjXCZ4jDF3QWcUuG0X53x2zGVwkPFDJ7MkyUYFKEL9Yy2kTNztbUf4Ci/eylVdJM5sNqeu5p7xTzKdl+ydnw4YPP+bylDjUFp7ZBC2zT/Lpq0g33DPn7WMXN9mbW1zA/WPOJ/PtmCqQx6g8zJKllWW2Ot7BgvlSj5syQ3DLYp98H9tnnIy173tWr/swsKw0cQmDQ1mX4JbJvYUgZFKRbUEWSlbwE5sl/SjIHCbTeeTXFLREDfMmcWT+67bzNZY8FjGlFWFz6fhKXaPz6nn5fL0UfSVvbSusQnsEQ2+/GseCGXZCIZS9d6C4n1InImklbQXUuESc7CD+fp7J9PR/Q7aNd0LtdVY7FP19y1fjvY6HkQpS3PUoHHyyjs7nO6nijRrCTIZbNTrOB9YR/idI3fC54Jc2H04S79ySTX3TBZk+emeOmLmL1dzX/uOZ2cJG2xPKhjUja+WrGzqZXb32xape9XzmSknsrcW1TWu/cfyK7T1rWuda1rXeta9yZm3BCjyJ80rBTs2HPgL0CgIMFChBovzAQThZtksghTRJoqOhI6kpgzV87CbHPMlWSe+RZYaJHFllgaz5GAy4FQfH/E8jSZIdcbjCazxWo7xEXP60seFIArgRCMoARiSBxFDoWLUWl0BpPFDofDuLz5x9xxEgiFxLXIoXAclUZnMFnsb/mS9MeU/JBpnBlyvcFoMlusthZAHQjAaSCUik8VGp3BZLEPvXIyHIDgoMCchKAEYihciUqjM5gsdqTSZHKFUqXW6A1Gk9li7bZ5DwXyqKfsVFdicq2RlhRoDJYAR0hETEKPlD6vtxKC4R5bJ6dyzy+HoUHx4YC6KC6ddlnVrd7RFmcoap1TKj0P/EcZdTp4ortnIpl1qnqp1QUnDvtWQZE2UvVvopOmIM4G+86hbfnHnJ63rzQlDRNp29KYfh0SquuoCtop9K1r3biB77XLxtFW+EMCj0GThaQ+tELGOZJxrtcVYhs7cSPeoX722FB+JJV8wVS/w3l+yDlrnvl37O3YdTeiuVPPPPfCS6+89r833ubHnA69vnd9LeOHez4ar3NSiki/LtcwiH6UfO4vvOjtWD4ysCjrzhTvCASJ2efXPX/ijmC3qLb2FN+d/Ag6+FZbfJf1HcNZsjvHs+pazJYTqBglVUhbHiKvT7a+ASm3Vyb7Oyl7uN8NvYAIdF6AvPgYphegm3WJd3b/iTvv0VgW6ed54ykkn59IxrHwQt7tRdjlSW8MgVfm4jzGvvL7LEa+8U95hpYLZp1nWdS0JXBEJKRkhy/TjJkyZ8GK0k1woLz9m8aWHUdOhl79ybxb86a/X6PVzOkf1T+oilQbVEm926vYZZnygYt+8arFIp2EeC7FrejR7P8iUJQoitCnD7081HHIepBBpJhXHsRAIDjEUl6hqIdS1EdZ3HjxEyRMHp4qIkXK1GnSZ0ibLmOmRImTJE2WOUvWbNlz5MyVu6y8+crOX6BgocJ5ihQtByEKQTFA9o9ElAkxyapIwLg5iZi0snymramIeU9Vx7JXk3DvXHsNlxv6Nocb6fA7NWREKA4VKkxxZGHDRYwUPkKUqDFiRoueIFGbuVZ2CBGslSvSV1lTezJWdegQrJvzq41IEhGRXUaCY0HknknsSzGG2BRWlaUvflri0lOw3PljHe9EJzvV6c50tnOd70IXu4QQaNWaj+FkmJhScQcqfxVLklYlveQlZlxdh5kYExoABHnFpIX+0lzHmsZ+VVyGTkiqamWKrDDxmGGWAWbwNvJOuc2Ub7xQ52uvsFX1Vd21agpTXUnGHmP02ZNAuMz6UFyzB5T6pVrXJKRgCxDT6NmNg0WUwNCOmw8UUsgiB9c86AJpO2cWcN9QqLZmzw3lGE8jj9HW1JyNWJDUJpyRIR+lgiQnG8NWKzuPehLVGD2reiMeiwm+nga0iD3pi0iH0nwa6ggrmPcqBqe93Y8EQq1qJBSKAbQEGo0QRTBcvp9vRrHdHMCxgR2OIjFJcWD5OmbYhMSE9sCCDD0sRWIcPWClDD9EJUbUa2M3IUy4hDEjSUHLC+3mUNBif0fTQUGL7GR7AwUtkvR2GwUtJ3KTL9XOQEGLl2tbERS0vBpPh4KWZVo8FLQsiAaioGUqTNgFkg8WwdYEmwloBuh0nENPskYMM9l8byTH5j1tFGYvI5EuZB8+tbg8EsSjnSlNYF55aZECGbj1xIu0uWo2XaOavLaKKZMxk+bRmNtza6GA81NXiQ+FVB6KTg5OPqyF+XswO4dK4khfo6C0u2ZICZ65gm3+fM0HUT0HRZGYm3XDOms0Ei1KwwtskRIlR8PFlkgERDdCz+F76oGxah6oid4gmk8ewNaoGoa5aiipQh+IaX8iLobftiq8BjZQOrcFSqhwG8REYbPLwpVDQgSYs5gNlZmw+47JQAJs6MSjOA6l8YCU5aEIOVewWrf/7YAdonqukKw7iaZ15pne9Zy7l/rEH+uLDEkKu/oCAmISRt0YWf17Lnhq3J9jMCO5qSjP/kP1HD5wZuvdS5Ku3ZGnQ/94C90gC+9sjZMg7hI2k6giViqztZh4U5l/xzFNOkrQZJTjMqIiURVM20NCF2NCJj846g213nVs9QA66v6Gjqoy6AgVsRrM8WZoOhUimWxpKRakNKU8Uv4kxpBdKV0hHMnGC1OEnGyoDCztziQdIH/XlvYFivjnhari11orlFgzrFhZSkE1B4p0ttWMw9CLJpmx6HbRMHOGociXnVkPn+xIWFN9b0+EBYX9tYKiQsLEJCyl1H1ErK2aL7Xsta3eQbJxGRMK0SYJ5EtVjcsl2HxCsm5S6Qvzo/n1dkSneTaffhLKc43qyFU4aq9tNsiSYr5E7vcWbCxvbhwjQU9vUMkJ0eaPKsOEDPmtTf1MZpXKIMiIvkOLOPlsVREPDjpuTkY2I5uRydgNQ0VZ/liS90lmXtT6SgLVkGG+fGUNgZE8qNiyYEyWJdmSD/kI8u3YbuxgKuqN5NL70TqIS9q7q6Gqxhrfz60oioFoN+vwSsYP6RinqSW5lw1WYN9LE8GTkhQFFGOoK1NtsDg8QhiuH5uSVZ6EuinEJGpjsh3TSuYrXYi5DjUCMmZKpUkJl7nEzJLFR9eN4pGaI1+/w0NrjAPQ4qe/9ks/9qt/4vu+5fUp38vG93zTV37BR8Qg+sfxR3akey/uM5/yhLfnshc51xmO+/TSupMd52jCgZU2u8lFyqdn2vkNLLn6lS1/aza1gbWtdmUrXu9alljRokISV1zvi1L+Y7iWQMz8l2i8sUYdcZBUpSCZEYQebGLjiiF4eIEFOsvO2XaZL7nQWQ6ZstEKE97tEudabK7JRhpumzWWmC2g2T4VxeqGmM4pV3H5ZJdWUmGqlkLZShFT+FekfGWlBEJYsP2HPMO06D80/UOJ0E0zlRRyD9WUU8JkUokmgg7qKCOHNMfQA5WabbJIoZo630DJ6isrvzVNNVBbtZVVXG8tJSoqShOqN0Lo4AnEntVEX47yxdQRB0lVYvHEFFVzuvBIaOTxWpkiTUhNkO2zhYU0u2xUn6RGlYrFrJE3okeLWhVSrunRokaZAtmEIwRfjzqJk/l6mQmU7lOYxqEI1oyaLw6Hw+FQFEVRFEEQBEGwWCwWi8VgMBgMJPqhkvuhNmcjtLIWZmZmJEkCAKCqqioiIpW1HJuZmZlZ7kqTSJIEAEBVVVVERG5EkiRJkiRJkiRJkiRJkgAAAAAAAAAAAAAAAAAgfpIkSZIkSZIkSZIkSZIEAAAAAAAAAAAMPzH7JnPKhO1JnTxJyVFDh8iRLlmcaKPHPIlApvlnvFeNSjFW43uuY1tt7vJyMzYvie56minobFVVSliP1wCPPd4eTwchIQFBCVaskiRJAADDB04HrCmPLOJ4YwkRUVCKkF4F6Vca/odVo3q1qlYsYpUxPZpUybimS4O4PGHUIYPgwcoqcQJsmKGOWJQ1LvzjE/sLRX7frlapmNUm9GlRrcQNPZpUKhAhgP+AhwTDh5VlInV05N1kieHDhh7ZBEwrmTUpIqTJeQOS6pXJt8aUAW1qlSnWq0VCkSgh2IsADU4AO6tE8WJFjfgJ/v0YHkyoYNjAiw0dOAJQpGHgE4/32qfx+NMEfN7s6x0/KP2RHeqUyZGGA0hkSYIAYWKeACR6ZPCpIUUAG1pkiPFigUAEigR6BRoP2NerK8uKd2/blB05X70/dnwQr0VivNbvt+myqEbie6JnNdL/3X2/RiO0shZmZmYkSQIAIA+TJAGQ+rmg1hBhCs5MhwQDSLHShjgSyPay20szwMOcRVsU1ligYPM/9stH2wDrcCfMv84c+XxTApJrHc4U9uXjbqJ/4DpAlDF3+XbAqDX8bHrUXcLISIuH2Gpl2TuvhQ7kQZ/YKiuyCVzEgSwdYitdjsHaC30eYitcVGOkQjVDbLnzcrRIqGyILHNV+YriiTYNsaX04EegtXDQEpnMT5VKc5aUSgZfBV7N9e8LF6mxaLHitZYoVbKWmmpm7GaXaD2w2ERx7iv2+qIShBtn/nM2b6j2ehFgaUYdjUrY57FDRATDV81qVDmqUI4Uc0QJNYYrvMdgkVGSEcDEGChcQLmgrsKkXdBWZTKTYEgArAbGRKZAY04SIafJThNkhZrsIolAlAgWHZgpTpRdLFE7iVrJHAyAPi4ckpDphxa6mIy0bqJWVGCeKv4w08vifjJrtuw5InPmyZuvhtxRuRA0J1QAidiQNKU8L9aVYe+mquiStPLEyMHHQl4IEqRN2eG0y+2A25SSxKI+rsyFdefZ8yKEo0dJTnTeC5joDOeXJT6Nyv6bo2ayXvrlXvqhz/N++WLP8loehf7adNePR39WU05p1P4I82Fs6Q/Hy1pdNqLbz7XsR+5EsY8sKLP7gc/roZidHtq8mG31IX2/vrwJZoG/HjcNsIAXOL450A/68hngj3wm+L32QMXTfq2ng2vfZJIUNJGOus2eNqxGQJefzlvEe+hCyFRM7tiZ+EzdjAOtE/E5rEM8EO1Hdc1meG/Wwv7NZ4HJdBoN1bjQ6uK8+Lm0dTY+bobUE8Fs9UwwAPrvS5aj1hmmgw5rT2dyoJmWw95mYsFOmsT8Zt/ENzLOCwAb/CrFjtQzgI9RDbCJfBrwa3oizd8yoG+czX0LfRm6OJmsPmWUNYb9M58FzGEG0PM3N/D/idm2Mq25r9pHWopbtYWfOhoxyxJdNUT9FI9M4+JVUFaoDEGq5ESvCpIWVbm4hTT1iRoVJe1KilB82740Q5J4USYKNNZInoXR0ogs0byRJOYym1lnF6NS9y0XzR31DVhYdkRagI5nvupENhPzqPhHM65GmFHFpFRNm4lcrif5G5jLNXwzpilSiWC8BdQdAgUrBAQzuR4wSXe8hZf1qd5E6ZpAJ4aESb4vp/iZJtQaZ2PTesY0R6fCqObIBd6MOMYZU1/twYU9K6bkPB02vO7mId/c83ouocMwXG1o1cEolavplFdzCHXsHyYUXNZawYZTyihmnd9mEeoMwQxTs7I6WeqpBnFjV7QbIF2KfoKSjIgRQkHDwlSiqvlfeiH0yMgZMWHHkTM1H75+4C9IlOliJZhpmRRpMqyjVWC7IrvscUSpE8pVOe8vF11z038aPPRYsxYftGrXuxUfS0VnV/zmbKHvCj8jUayxVBhgxfv0ptcLpn/E9GRqGv64GuBEJ3rLPobOjJxybhWdon6kBnEdO+Pc580IaOsDywPaseJCg6jirRibhgk2vnh0mCSM4KIRrYDsGTSFEJ8xplEbwsAq+HLC3hxG68JW32g5se3sLFIQiRJDU0YDN2U3ayYWO5s7UG8SDB2Ehxere9GxxQKz1k/Jm47VPaqnid0eZHmxPTh+r9B09gyp+Im1jZ4YRhhiFB/D+2IRGFvUzoqwqBztt8JUYDsWKjNePU0+OW3ywYBnSFWsy03WiXv/OUuiI4tC2CI3AB4psc0DKkqkFAQ9/eB6fNziO4R2RBQLU9kYyZwtzjD6/EkRpixNNoSECZGhPMgfZ4yxZHwadyl1diTrB5ITUKA3FO640OyEDSnJYnq9w+x8lJJcq8fYQsdz9vJDaq/wi0guTBEV1D23c4B3bIiKHSDIByjg78CNwPKM15E5zT6LbPfPlt0vHZ/lCmeVdb2L3N41s2X9v+mdqdM31ow0oY+a5cXHzj4h23ubNxMNn1nhZp7FfZFz3Wv0/FDh/OQsp6em/5P/vbnXF+xa6NeFdG+6efs/d5acnc497NEj2mcVvOjIyw6+rvRNN989/5Gjn3Lwi3Z+zabvyv+x7T+x5ye0P1X5U5d+ZvfP5f1O8+w34mPwpfiv4Gm4JMBtBZxdFi6uDXFAAQK1TmPOsxBai0/kd6m6Sk+H9v983jAGGS+c8JhOm86aVcz9OSdfkC+iLhDfyXtHcTFpibpUsZx5af+loiveKz4r+DXsVejVpdcz1iPWp96g3Yy4XXpXcX/j/v9ezkPwkPquYiN685nHHm1/af5j3kbHFf+V8DX8uui6o0nSJG0OtUraJO34jRWv5b+edc/VueE99v13P6j24MGOB6f1fPzRJx+XR9ZQPUStz0s4/n8BZLdNw5kk8fihdcwFfxjKuZliqK+2Xa3/BOfSGQA3XOlLQhSz++aLg1mX4h9bddqwOJKLz/7ZB+65Me+/tdcpMGDYbn0OeFT7lK8pKLZOTA3dAz0HXARc6vY2O/a4LR0ug9n0fbBrYPqzRQ3yFKCdudkA1iaBX1p571ueGNgcueqVTLkBAW66KJRt2AJ4yRvuWAMSsVuebCvNES3MWJ4cGaMQJH4AAQJBdlpVPxp3XBGNOyz7G7dfKjzb1Q81xIQKR/s0bpNt49ZqqGErSY8KSkaRhsZ2Qf72ufjXDtVe2C8WGZ7qvyvLy/VVPltz3ZpuJwW1hy5H1+9P8x/ed8+tjJKtAo8nN2W5vPQts8v8CqJoSkjZXSQRB4hDxGlCRigJDWEgsogQkS94XW2rfkf9s0ae6d0BrM2DrxKVubPy5RLDwwBVKe6kU4SEwJ+zhwhCnfL/FHIZjzT7v8PPwnL26a++RjgIO3E7gF8dTIwymvD+SPjRTnoMX5qelA5PLVD/FAz7imdqoTs9T2ZXq/P4I4Kdy8Nu0+ZrwWXFNtilKlr0hYqumqpuUUFLxv2pkGANfU/eOejIyGd5bbb9WK/+uUSJ1vKbDc5PqDFhnbSf87WV9AHngkxwD+8lhcaLVGUP49AFeBweTSfqqi5F31WftN7k7a4rfR1eRN3X3Upbfd93pXRt8X7i6AOfwtFjyJQZc0O4GsaNS/eNFSxEqEAB0Qkyy2xzzJWpX5PN1tsg30Z5Cvxsn/0O2OuUCqf9YsAlt9SodcP17HLTS6+89sxXO3SY6k4BeE53Pvd0NZTubpZXc6gMlkYgBSGuMYchCeRu0GabS9AdLNWt52D4otlGsjm2xd3YDn8z20s5GTvgQ7Oj1LWxU1lA/7vObQOUEYC2OECOAcu9BWCt64AlDwaLNgAsCpR+S5baTGpm55Emeqly8ikJWYpDjzL4raqTufMgoTw8EXoE7pvsNnsQ6y3Wqd9AyxlwsNHUVdTrsdm0SvrflWTdNb+MmUBJBAEQaj+ogpCg66vfMtpBdjMwIlCrCb3CwqrGRpMjPZdskk2KCQIkApKtxIdPoFEYxXT1kk2lqXYwjeYPvy6uoE7ZMaPwzKTuLY0WE0Ah/qKoPZARVHPezHc4CGBN0ByQIESbun5x2jEKGejLKKWaW0sv1uJp67CZpXZX/k0ib+Nmdsib5wy8AYeHZp9cm5HTCfFlN2E1Ghg1hoQnNhhvGTG8WUO/nb1Jb5fZFjvbvgMrAht9wSMs2jnbYuWXnvLlhY/p+HTWmqjCzNnQDVvatpPrmYix+/wq9nPl8Sl2fPkYY4cz6eXU21lpzT02IWPMlUBye7ajkdPAixObr5fe0qLH3HWJgwhja8dtaZHIPIjMsyLvzOWlEIKHZDEHXE14SUWYLSVgZCA0DypgcuR+GZKRXLKbbP3SLOwo6qOGu4gKAyzMemXIJwrHdlFovVOhE+5B7Neg97YjTXqdCManGpTDJ8E2rOHa5G8Yx/7nTkNDU58PpDbyC0S0x8mGguWuLBAbvwf4ky9M/AqB/RM5EpaSWH6+NimOXbw8hwVqj/2YVCnNjtLFlOSlstRGERlaBAfiMA+1kAYOeIedDd7cI2xbkqjoVGHbuvqTqmY8d2+YigfT/RFxYNWgbPyUh8q7y34hRfehOvIfbLrfyNWzklQwqz//I0xvc1lZrQLTTK7uVOlR24Nc0XkNU72Vp+sVmiX417PB+mKfzCWK+0C0exUWeH6pLaXiW6ExEmJciGEJcrzRtal9uf60nXuCZciZ0idrWsu0nqQfuyD/FCJ2G/tL1wqHXo5iirVzKnSxiAVawC+cTC97wfqV6Gj2oy46hV9wMxdNF9KgZhgajdkUozwPPLmLUB7LEPpQnVL3uAATbbWd9T0Gke8R43X5ODOjQNkBCiE9A76RNcJbEK4d1m0Yp7qUy2owqwO1Kp+qD/hkolKdSY2iE1rrkclKKnps5nfNuvwYAhJO8dM3Sdu4glOxUd0yX2qKWDgYQD6n7uPXqSetO1BrBJWj2fEjpCdgcEY/LJCwpOI6n1Mgj244PvFwdds8zcBirX0svsQ+WUYi64B0xwT6GFY31a1tZLNxkhCxQjUdXw95uNGTzug1iZDZkgZygzdpzgebC3YraJ19YndCxTKNWlt7zWC3ga/d1w2SbNYH+cJg9oDaY1SzTOwo3VCXEx+OCod5HiZowbYDbrNLRUPMt4ggHeXVSwTVtJ4p1jb5VFHwyjVTi9E1xcQOpHVmAx5qwZzjSP3IxEcxl2GaU9A8U5qHKMkVX4qTePdMa40ZKB2qFri/pY+c8SLe5WdG3anQTwfv8yFV+57ruL0r3FQLrG/vbXkO58kEdVf59vBPb+gMXUFPyyiYxxKEUIAe52ZlIkI9UVbNRuhYreO5r8WH+/VXCJd+jIWdiWey8MxBh9aV4lTkGl8stBnKLkERHRTRYmqbWp+5pZp6V4+0p7DU2ehy1kIowhKIKlonto54r8uqXKgNwnu1JGfV0znxiZ9J0zjF2BzUP7VyGts95DQUILVz12HERyoa8I78Tw5QGCiEEkwn7TA7Bpxq+XmmXoJ8hd+npBtShkq8ipG3rj/mrtuKYsUAUEv2rVrMdHkSW3lUPc/kc9EN6IN45GlLjUcX+ujgzLvIWILIxJU6pjnaO4TQRz/5i+lIEEqs//LUCvM2Muy+lU0CfkhrJY1uhitEoW5ywz4d+sU4mtOOtjmstOUNrxt3ROqx4VHn0U5BxGGl7QlJBSLAb+iivGxwHqS1/W/k0CjlbtBwEeTbGdejb6usYkAiiXy2Hsd+3/UxQy35VVMf9wcx48W/GQ7N/0NiyhcPyDH4yELoOR22XJu0I/kCRNZM5jsdQi90TPHxjDHRXREcpNvZ/7d4N0fqN7osr+D3CiNbVmFGWoti7vIJwFwUY3V4hNqchCTeGgWc6selKL0UsRPII8LIdIQbyrFvV3Gdx0ZBLUtPWOfjT802eHrGNmZ5ZrqOAqt7wh5rICFujOKOdXT1QHKou5LlzHq0uRKKKFE3FxrR5/Q8n3Rt6FugO7KwmuZUkMaa+ltvf1Plnhkb5jtfegYtyTyWEiUopoeXnG7yPFW50gzGzdSknXitMaXHJ9SkvxJc/VWAE1c5cY0T6O7ttf6G6X6mNaxzaa/T7Rl+w3fjRDOGcxflaOS8CzSx7j+cKV6RcNbuSY39gMdyaU558rOKSU7MogfSCsmjqWagHjOIvN2q3yxTLyB52OTaNNmNqWc5E7VhjEOXNYMQAUlQloFf7slEJiuYllzGgb+vFwq7ta8Sl/XPmfxOKn/PjNCxPoiwr589oeWWGn33rVp/UgLvpzPyqeVr/ni2ZChNCq1g4/3Qy98splbAIN24gH8NjbBwL/8WwtCI/boQirycHQqdNjAlqTqTVRnMYl4psGAIJr7RIXynCWcfti57VYtNBqqABwoPTXPmSa7kC7WtR5jAg5zi21vB2da+EsB9tJ9iiCu66wf7PRDmJv6gnJr7iRCfiZ9lXAL56lCvXzo4BxNa4z0TR+pVq4jqpX7gw4RLp9KcmsQCbHyvc1SsigiIxNkaBPCldmcSZV1zpzV8nugHXKnnIaBOzTHDgA4AXBv3iMQ+X3jEVfbjlt0afvfVemzci7Y7fvsldyYPZNqhtL1bqx+0ed2xr/+QCmEEr+yfcUwizDdxvr59cYEIXHf6Zrhp5m12c2vWDAdYgbKx70coOveo+DtjaATLnXDv9KP3Gu/6tRttye0JEcqON5rGTXjz7GPGmd3b8eeEKCrCss6NElV02qFNvpqKVzk5EzhZK1DJlzvI7i1lfjqz5ZKj723Cgn4CVA489lfkzHlKNo+G+selhYuPuQ/t/3Mx293vqHDwLjy10sPSufPnyC9IGLAPZOKbHpDzZO/+W5B1wh92j/P1yhWMl2klZgBCn9o9sFBKru6aBrdF49xgNAxS12RqNBDU5KyoARszEM11GYjwA7XJJtypJ7sAfyP6OC8ZyuqjWWW/0x27fwCPM/XNANjWPRtAnGeePTWg8os+f2YESJC0ula19v9GHARn2S7RWpIRZz5E9v1vq2t9xT7JYaQEaUz68NXoWzVeGu2S9vw/UrEEwLye1L32xm3cdr7+5CEW9Rf4FZ+oVfofbhTnSDWud+jfIeANulGXOXL/256Rnu+fjbQA6qQ0389mmHt7pnrAX4DKXjpzV545VyjB6BUk5G5HnHUTX3SutFg2/yp3JnNYPHXUnEGhVDZRJLl9RKYpkVJCy6gzd9BB2I+C1YCLY8nffjeWHLC0qryN6jXIF5xLVpyoVJWCYfYl1T2rr9y6umLY+myTmWT2U9CpaifKyh6lfL7XeBsNzB+PiC5831RqvTivBp83TmpGal7CZs9Tv/hqkJ4w7yndALYsF1CZgs+ARh5+fnbk7C/PRj5fuXHk1n9469ha4Ga63LIuDSd/8518Br5Lq5r7uHMm+Zxz/vo+AkWZy6oJYNQ8qavcupZrsH2xudGwKpev1zVdGoofWDrrtOc4n25urWPtSrbfkOMQEEOqbGYWh51vDJ55ylxhNlhaVSV0JA1+K35PH54BUaP3InDZxjxtxeUP/9w12u5x3Vx+P/9Z9bUSwR/Lfn3qmF9WE9fTAbXlnLTvRC/se/vT2uFMH5VXyVrAG3Wxj9pLenXfwIQTsGWUEwLSrExWZsddLtiQ1qBa38JNl80pg3uPcDYg8qDq0HZX4p79VqYttVt04ZzhjGzIJ3vUGBW9A8I+uJ237cyWmpCjEs807HV9MpmsTx/DVx6xUWy7ZGPxY4NwYCUY58bpVf+lseTvvhWW/8WVafPTOsPWlTUjq2Cue1YvrK4YbAuBeN2+PEZ//yNgBy+tHx453P6iRWs1O2VSL35pn05AtMbP9D4JfWgoeGI2Fzz7wDiVNyzRtDGRzQIBsqmdUQYHTCtw772bgy9O/k66ee5F15WT0oT5ezQFj2Zx74OSqROjzZpWLMrAF6Kq24iD+TqV0/O0sAe8vfzctznm5e3669s4GQXdML60D5VWxiAyheYYxt75iPGD4NaB44b6y1/ktB/7KKd6zrp42b5gUWOWtCcyCvB0ibgWJj7ut9oeXSPitubqDNd/+gZs/TRgRDayCWxbrgBqS9DXzGxtbPvh5LOV2/nioel0nW4qPW0o//bKs5NtP9g0ggp/3O28+gCF+W/UEiRqhTGwfdfrszpw1026cc3x+h97iF6dnqccWPsdWXf9SOeU7eR89LnjW6Uz0bvT69RC/MD8/Ws30XH+6LqbeePNLusZ19Tg58IWv71m/w08z+ltBAR9VKgW7yyP15fjQnHx6RGp/6u7JzVREop7GfdMw9nX7ONMfGWjPRsjCBd85//SI4hNWdmqBYJMb0zxa+iHbib1qF8R1U9JOx5ChXx4zc85E1QT/gMfBKGldREoWqrtkpVo54h9g7/1o3Z4eQsMG9GFDwbHEXDZTT7BkJ5USChlBuxJL9qOLPtKh6tfbsVHSnIi6UxlOJ68bwIRIO0omQ5NRrQeqGUkn6n5aLbbHsphm6OTerIbaQQ99vQEyUXsJLA7itxWDMWQkbFxtBxf8MhNPsnXkme0kIcPs7mcRIcC1GSLlH8D3ZFJ60mV6nnjJ4VSTD6ETiVOBblxK6reIap1a6yKDpd0D5gPS13Wg8wWjsdaqtlPTlMuMer82Bwkv1qQnd1Aw+ux6biIDJmE712oLu9quafce9jFkcVWJTYeAaXlchMRJwpxmZwCVJbm6xiMSTESCpsfW8qtZufKrB//PNSX11yMXylV45abC+U5lhz8Rb2ecKVZTvep0JGxAOhrWNn7uz9tM1pPTBtt9K+mblabv4bOK9lHnAhbDifgYamHoovb1LgrxQrc5TZVMSLNnQgPp1weD9tLTlaXsTsCgGa/5UlLmfXcbLnVk+2WQiMBm+Lu6LsAqOzMpIsHXlRFZPTJLHLCFb0ef9GSkyNvLsQtq0vxKy3FQLW//+s2w5aJiQrbj//sFk7ENldznpymZHdbc6IV2LF6iVTalkkxvzhxSiBDI9oH9GSoG6fCeIEAArLFp46ecliX32akmDpQLCTHBRF+8vE9KIfCZd0DmUv6hcSynKCONCOeVg7PrJswNn24OxTLr0IX1D0xVLydntT+99RiKajC41KDd89PV7SbLrzmNefLLCLClK4Mv2CR5chbCvCLxSrCdEsmYJ3tqdO7YVqNZ8SpyyajckwkXm69ufiOqa6jlGnEkczgkzcXxGBHibw4BVaQujoYhT5DXnSCgAPwHR94ven8wGaPSyEZ2LI0QGUvjnsbDXvOASFk4yL47n03DYbDGymZmto4oq7zxF6tqzMnT9uJEmb0csSj1T8vfKetz0mhFCTGFhJeLvxvF2U6qiQeVyZck+xs8SRgv4UcowELxWysn/ysEDbTE0brzz72PmWHCndZUYRb6VArLf1VB2cdgAamYi6O1N4MtSsVHQCpzbCm/gWGo+0nyAfHl5DL/JTH9UuQ+Mu9582pCXsPbo8s2yXjx0Xl7z5MA5qgpl4G0v2qObSqxjl9zG9/ai0vu7QpCxfLpLL3LAV2HTnWqZHkH11ml6n6sNnlrvR+/3x5RkF2bSo+UUjO2Dfi23Wko1OVqei+yQcLz1UqFtYlVYabItV4ud4wJfdxbHeYXT+lyV9az6sdHB5UNzXmK0921JjGUom5RIQanVPfqik+WitnAki2+BT61PCOBTwlHkvYTeD4dC3hdxzpONfdCCQOg+SlFr1DPTLsti69Z1E85eQaeWbFqM95WnDnEmt08RSqJgFbnTu0kBH9V8T9tI+l0VghDShKaJUw5YeDg8VmOjOhtcjPCnx0YEF847tOiAx2H09HW3nQdbKpemPFPjhZChOv1n9xMCvpH2Wvp3t3wr94nvmLtZphb7L4fxRnDnueSvwHz63/YrXF1nz7n3up/r2+wy7Jfs48vxH/c3vJ/TsEQF2sBq/Yszeankdx6B3+GHEABt8B57Q8f9hfYF4ofW/gLxiL2uyHTPdD4pqjWIN/AYs6+LRPodCeQDnA8BQdWMiWrDEn8t7/m+yHznWPRVsvgbikEs4IwzkAQ51vJHRn+jChDersvrN0GCAbN9aALcu3XThnBH1z6pKrmrKSa69UfVVDVbLmBIKKzSaUNSNlVSBSWp9yJKRQeMQF6tD5prH8pzM9ZT/erddz9TE8rm7X4dSa995/OMoj6vXxb4/cstFg1xZ0/18XHO3NtWQQBmVi5GJTeXFekxw7nZOZNN4kB9wXYNumcrBtU9xqz53zBAxLkmuw3WBCPQpSd2y/CtGGOlij8ziC2F+D2JAf04HFgiuOANJAaIApD1//PABrykKFVKmVxGXcurrg0YPy1pILqZqhXcUTB/fIayvz0yuoMaYtTJfRLejIFG50+iHuDrey4e0hycGJo6FmfW1dmHdPZ2AnyP3kOqb9AqwdlnEEfRQBO0rwniT2vJMdr/RG6q7WFdlezSvaenWjDlXslRFjIp+hEO4Ri+f3XjyT/O13WN3epXnlHSowFw99NV/BffuzyftqcXDw68UK3s8/68VqfmiwsKuFYXdlhWHf1VJoyFbGzpUrDLsMMD1Jeoj+o8dHdjl29wd8D06JvndlCwvro3U4OklZGc/k6bEYPfdCrfbWewqz+b5CfamUFdPdcbXGgkuxnx4GG52PfpRVO2tTumaL58qa4DxxO5JTSmMxdSdxRdpBLb82kaSkkZGFZfEsai2cK7UivmOtrpl9nlVjuV2Uvyg31E4rvezFjnUZ+BNiXc3qZwpQFnLabx1WfU/zUFnZrxo2hqQBYtAioDLAca55JKuYs1FetEXRcvSxlJRmDuOYWMLpak8W41oCZ2f38j/aNVwcMbf9yfYwmmyCZKzDLxa0VX3wQRXYUpy2hOnuTd398AQ5rHXjToGx8kZW5exu9bKrxGJSl5w38/+Zt68sEjSG0Ko2Kw3vt1sqPv6ormsopU3I6UxLZR5v4adg1TC+KEyDErA620Tgtr/U0/4fz/VZf54XyHTu+lxedUkrpvTV5LMdty89aFzSlJTOPZCZa3BeNHMlmqqlvIPbmY41+bQ+sbb60ufyE+ez2pB0NYPDMXQQRWJjl2PgMGjqDmTWCkObiFdSKJhCXTyLbXRMIb4jY5UViSDW2Xgjq3J+t+byvkxLjaZkwCz4d8FeXyRoCKNXPTEY3m+zVH76cV23VSp4p7LrbKrTQ5Mc3rJxp6BwBVsaxReFa9DJ7OOtIlFKq4DTKUplHrfwQRdsfLW8n382eF96vlrURTVQhkYzfeeVVVGG0RZyrV75KjWDtr6TfS6/Qmd+WeZ0XXq25nOZ37EU8fHg/C4DEKuNHjHuIham08eDczb/eFCK2O9Yzqdl6dImm9pOCAvrnoY4ZBSXGtNmL8xfAOfMWisP8uEKMR6GNHVVV/6x4AFT9rlGkq2DfJLWVKWl6Q8h3NNY2E6INl0H0qWaT3Oq+gvgWJBnJHEe7IwBwHM+9qSg5KIqk9HSrBWgXvcP/B5EgxHEqSwELziECUdESPmF0ZiAT+IvYIMMiaGbeEKYJew6z1MUn0vmtwuxESpBxin/17MxZDWOhFNUJrCFA0RTPWW1fPI45kpy4b14Iv0lDdx7H1x/OwI23770DYJOj5Z6BIKGotNgLXdJjW11M9dsRC8TdFqPaHL5hRMY1nY2wo5nJWP9UL5CHR+PzC6MxsYVhBFybNkrNpWa6asiTfVKdt5siTZvXBL7WynRO0e4k/+A/xRd5p0NsBNZPKw/Dx8cUqqIxniIOTYevWbmk02r0ryZzZG+NIJ3rgC7aYiwVPMHXogH0NkqMlk3TT1TzIkjHzXDnBQhvNlpw/PqqyB9n+BCYViEQ9XRVaOIQzsz3XJ31GSUtP+D2qv6x+CjfUAwsPXkx2DrKx9/ADbue1dbV65Z0AaFJ3rjX3AclOUDvvbrr8uSXz/Rsr78lqZ//BBe+97Hee7d+Xuf5s81FKhhWk8RqWV7r1miNM/VpHzYUiffXNaVSapwg3bcnmPxaCGSRMtyf/Slnv3l8NL/sWcnHHIv3crwuHAxw+Pq8YPSZWa3e5nPHYtlox1y3vUsMUNDg5/RlMfVaeB8toqb0MwVhZ8rygS3nKQbXU64jciPdrieELmeiN99ugpd2HIY6HXtStnXBdqc9c/S+8dSPzGbpVz/6DOxvuK5eGBUlLKiTwfGSqHuXPk1Q8mm0YSMa/rysnW9etNkNBbrBq+3mFpx64G2Ytt5XZdfqr13D1+ln+n3tKy+uZSruPcABOJdPbb+4ZalwIHoOcD44+wbA4eUo+Ojdp1fD48OA9b/dwvDP74w1DoE4lYDArApUQUCK7Zb0MHjdQiEvHYVBMJ2niAU8DqGArsmu07Dm/jwocCHP9xBStef3gu/JqzEtm3l5XfLTj/TAQyo040+Gvj1WsWUr/d9NZUBT1271XwFNggOz69Dq6zeR61dM1PuJvDo23BNmX2PhrtWgXpLGQyOvToudD+QjPbVgKe33Kbg0ZvwY703ekHR3NmJ0QkQ7yuOrEGoSjEvNrJKrVKpPAlu2DgzNjq2wYmm0aLhNGp0NJUKlxQN/usXnooAmkxRxMJg8AA7MjMSZ0XLxzMQ8uv3v4Lh5i0V7BN1aDJZm8DE036FJuKF/PNbdJwTZjSZWoGkosWfQmMpLCAG0bNxTqd7sVPgG2YC3MyEUWClT4PUt4L17Oe/FEYdcFFiH79zjFDp1jHqBONTrrLtO+PtOocxWoky2gJB/9llZWt+ojW03ottecSoV/2SjdGeLqp+yBOZ/GJb79EaND+pmeD7V8o3Unp7UzbKy0VWuSTLtXkQYmFBs+6WRnNLpyOZ1uu0t8cyvN1/maz+t7r23weuu7xpPnBybByCzfSHXJ/Z66YICyvZp7gK/me16vq6qix3SlDS5SCZcSTVpnOJZXhCGYlI0BhrIlctdiTP2EvyTw4JcsvW1Y2s4frevZrNTc3e3l6RUS7j9eZZPZMVT1MHBlKfVlSQTDKNVzF+u4CoyOVv9mf21w3UZXy1P8I13bXYNcO148uML62ujx/kgt/zBfqx0+u463OYN3xyinPPC96uPJGc8HBOJCzpnAjUuRFBh0Xi+wg3HKyo4zXEMpXsdJn0bBBnO2N7pt3X79pg+ZRkvgwb1wf1pJSI2v2pUWWu8kSMMiV4SLXDZGITzeQcGJwbJl/m7E6zuz5qRx4iMVYSD77UV14qkF011ciuXcqvrFzOz7lWYzIy7E3fypHTYdUMRmRNPoPDLqkaJqOW8Z0DZHzhes7V5u1PUJ7PES7UB3sEigFOzuT3va4nq7aeVZNYytYOo1PvLzSegEAQpQIUL0hmw+19pVU+rq9TbrzS9S7v/J3K0X/4RQSXnCNlNu2V9Pm7puTKFWlKJiM6nESI3OM28KtECiuNT4gullJw1j5oBEbJaL13fmhg9lxAZ5eflyRVJpPk8UhR4WRipI/bIAoqlkUoY5NiFTICyhb6NkJz50eIMxonyQ6Wj4SuWBba3wN3+bb7wM+cgwlslJ87/oO/gSd8Kmjy5PaXsPthBdg2t7qCY//rX7EHPC0RRxAkwodKLjS0dy3U5no5o6Mo0lRWXLdi26IF4APlmb0x4twtuJn9eREkemZCaLg8QUStoNKy4sOCeQgsPhN+aBgUpOR1x4kz2uMZOSisNIVtt3WxvTKDhhPl98eDQth247hUBerZ3ec27t3tf9LV1f/0zt2+ze46KrmtvpHcQcV/yj3a0EBuBfKsoKBz53es/dXXrwfyAicoMZYbEkqODI341X26sEev0p2oSYN4MoVlyel5ajt8PXiTzakJoSeTB3KZnmGxDEQIjIClcQ3caGwiLKg2PJAPiTgVz0o1RVJ5JUlx2dF4YtobO94OtoyeNV4DZulNmOC8NczttJ0PN/2jHwigdwUBbQ6tHI5LCzwdjg0IjGNQEhJ5XMyuBWWLZ4z2Zj3uwIVtr8X9EKoGh9XS6FSdmQBa2SGKg1nMpDOmTuFaZ6qQqo2jS+2QvZ+iwiMp6Xr9Th9pNBKvwuDKGJqB85bqJC4vKZ7BQ0KRPlP4vOQMYEg+tbO1DtEs6AVJtqgplipDh/ty8DEXd/Sgs+OTCBn6aBazEkHISEzAZBl2dOFiAjgRaLqsKTZFjyUnwBAsbEISE4uAkRJweTBsbEQEChGNQCIiItCxIH0HTRtHy7VD9T1BRsIiqNGBRRw7bE5cIr4Uiyunc+jVTSShVZXcLZuGPlPbLbx6LJV3LAgV4IvxxnIlWCQ7OTGBxgNUo1+VH+ep1lcLusdrIbVgywGjo9HBGjpWgWolH3orfzkQfTSpjnK4FHPIkjAUln+UWEr/BcTRI4viRw40IEvJh5F1RwNRmGXfWxWl1F/IZeCbHcHf2xcFQOqBXx/Ur6+0NOIm9uH5pPRqNrqRTWdjGh55YkkVG9UwqUc3Vn3fqKYm5GLo6Lg8OgWZh6ZjEnNRmA/KPq8mNnJD0i6Zi7LtNvxogdw5AgFG6h/XCL12FN0/q28NaAUmsxcE7/phsfMB0yGDlZBeyvRFubWT3NxOkCus0thKkGzhn5qoVBvveVcXmXLhq91sB/Z2f6shK3/2drZj12qBiJTFFrGlG++V61L2gW+kRNmuqDVaB8nXvvfu7ikGwH2SX6OuWXm6e3qeOHR+sJoJhjCWOPHlIAkmMGdKRewstohUsFrPdgy5AKshq4BU6NCwCq3ONRVFePnAF8tiAU8jQcmwKiVLf3Y8V8Au5KmcKJBftVWldLq7e2XZ1pFmsh5ifggGXXiTeCj3ngZPfbije3q6EJnetgXJaiY47yrfkigHjy3RyYT86oNcSlnE3yaavnqaAcen1gzMzZgkD33UCqnyPnDTFMtYdqMu/QNM+JTO9rsmgat/1t0tWYdqYjlY720cKTLlVmf+3eAQfdgBLkMuAZvY5X/fJMkXTd48E4i91SWX9i6uzjFl/a11BH/k/2wO7EY60nZvOA4XLgjLYS8P9zRPASd1bySpMyJI2EgY6hHhxT7YXWo1u+PrZ8a/sduR2jIF+C6DxDIMXonnaLGmiCQNQjGv1OiVUV0OBiMSoyRIv/whAZfsHxvwDQPXXCwaSyL9MGI7ZRR86MjTRE9AIOPRbPfP5oclZ1inUFkCBaschH62qzWg9UGXxfnOEWfgZfOnpFcLm0c3Xrd09u+qgKpuII235nznNWcRV+mbukztvJ9564rQ4U0UlzHcZ5sjXonLFmvQpBVFzw48Ll9KntoJuGhEvmvUNlpQEvN9Jt6y9Mj1JXRgK6u2WE0NxsLuZWrba48geDj5ysRXJ/SvkH5opXn9qzd3mVE0Tde3b302Osb+nJvDGr7DmLUfaI5AAIAAO2BeSTUuD66HDNeijmvwDHei/GoQ3wFQrYMZe/U7LMbVVzz/vfCpG3cBetU6qgDTGtovWQi2Qf7TQyh8N55qiAQy8sImbyK/C8eMSfllxZ3QxB1gS3WgXSI0bBvitzxW9DXuxien9VAjO4llHk3rkPCODF1CkaMMHPDOdFNXzb26v7iWz3ENrOJOfjXX8ye5jh+33cAldMFa6nzhlNSJ4uxfn1jysaNKvoQv5JsavtYPOcGi+aHMMmwtLk0BjvHHuRxUj8xrBOEoIGXA4zm4hki5E1dwHRr5O1xgHmXxgZhuidCoGuK3XH4Ut92EunMSvCfOR6kOvt+H6c2taYbxu2Lt+MDE4hMlEL7QzGxgrpkJiplZngrugGKuh9+5Dnn8HY7Fe+N9PAD9th/5aW5AD2d28cHtstXIkVs5kDKtJVNycA0ZsR24NWXHqNJSQwIyqjV4mLgDYrkO9tpalKYycEwZgvGTyUBU69j9G6oIwavS2t/8AGQ7YfMXix33uiIgGuRaUHA3am1dENUuGLR26p1RMK3Dvbma1pCftD0OPkXRuAdnZ8ikYq12eWG+34NApz3ikNGegPJiw3ZCVWK7lVRwNZelKWEy9nTqo3UEWOqPBAepphQrVLpq4sCuHJ2vROXWfwcxuF7XP63lrXlAtIY7+fJqHX/aZ9DdunWMkq2hYFC+MupnNyzfgOQIVR0gU1Urq4HzJ0vQkyxPyXmlyNhA6a/y4ZXwry553V/MWxDTvPhLUS20u7F+rcbecWAY1s+aEoJFaL0/Va4yHOadcDErULDGXMNjOS66cRaAjeNfdiwGjmFbnqb/IuBz36D6EN/LR/iwi57wYRd9/jGGsDGthfEfEvnmpAMIm3cxD5cpN7os5rCdUL2qR9OMlWpOFOW+hXnn+yh8MB4fth3aGbYWv0vLjEnmA8rR2ulo8O0D/i+EoiS32rrp2FogUyYsVjvBF7YHo9U7wqte2WM07hkm0nY+I2M2KYsq8FTOUoVRKrIaxZa0m83f85+Mq5e0945kBB/xH1BmcOrvwD8mbkW/gC2wdzsWAx3Ao0EyDdY8CukGNs6r5x0aLQHGKrrpWPKIhTHVnnT7WTCmGdCYfm/SjK+a2eExVpHFatbY2msEmAdq1I40KALHQjr/YMjgPwqZ/IfpqjQrXW1rbI+tve4gTMyngIQC5SoIBBNCqI2/WoBhAOClOxYDn8EMi+2EFnd+D1ugOaLOzsEoAMasMAtTmM3siZzaExOjQvUEyrEEC/OFeNUEcTVeIOUpAgCnGpm0Nkl6DSUWWhQDVImTETzpt9AU0DAKsWqXEUQkDA7MFfEK3C3IXOmvNHySTwNAYhozIBMOqFWmygKuhjWwB9bCQWN/npThATyIh7AYD2MJHsGjeAxL8TiW4YlM+XGwFToQ7yPhKW05SDUm2Q4tpsKyh7A9+LL10EmYWh061avTddKzphV8YLEB3sB9DzzU6JEmjz3xVLNnHGQ877AFGMn7iYR5DQB9ft/OD9ac9Ohp7/3E6Viq+8qPu19n1VT1w7nb72OXxM6Ox0fX3tgIOv+dH+N7wfpwoWr5L7IOAMB67L5+GMA6AQAAqAEwUwTpGhd9MXnYZ4XkuEW5zDM3Yhp8KoJlLkpRHsTJd2p2rKmP9FrItJDzHdeW7zWxGwfQ481kwnQrZBP3iIR+/c54uYgbNrgkQ2JYY22KgnT+rjyJh/tPnM09gtwargwNiRl5nkEU1JzkLVjEf9dRCULg8wyULxqO08pOLuWUAjoF9uaGjv0GdpM9mW97qmARsnkkFKYSqe2vBOkEi4yH6iyY1yQPVsjX4xbho9JhcOTqM6QEnEM+RISwUr1PAd7H3/uaTXzvReWJereUYXze+HFK1piOi6yQjdyiL+aRPJwL0FDiNafX2DpBpa79dJeNg7GtzoypZeELVdzEEJnHBb66D8n5DIDeZiRH9nR2P9irvlZbWREMko3NLaBXo87Um/hRZqAy9tmIcjIvVnyc1slmGuDj+nzHjV5Kzjccg4UQSsx2IUvoizCuMvd9ZXCoZoNuu4owo9rJgHVHS6aB/78AioJ02H0mzGAp/sxZiD9L+EbP4uQsfA8ARopiDD7HX5EnvvBKR8rch2cR23ZL19RnShZLwQt0AJ3IvzabV9I9UTN0qCBPbgpE1chLKqMuMn7aUDJrbFIObFXplSEtC6YbjnHkjtNYanY2IORo76k+3KrofNs1MCaWGzOJkhviusqTHVqwHuVOdqw8eWisPVPrIb0WPg9rPfbM1WeK9GoouVArjVnI39s/Kgok8MmxtIIlG5huJ5uMydxvpRNtHW8A9PgT4Q2Mn90BYP/XTF/E2DYbhwIHYJBc5nEOy/hGzH2Tcq3iOms3ZAOoL142nexqf4HM4JVMC2jnivb2VP/nm6qZBoiqVYBO/SCCZlgFenWbWrH/D/B5/auKYD+KuR4/QVQ87eIiEnvnUqttMN8/qH9jh0GKkPpSaAtelVkCPCEoPwjYjH0W6M6ToK1LdfmTiDPVTC6AdpalQnCJWyjL6TnQViDZ7oTkdDz1I8R5v7OKdoFr6qFXk0MlwdcZ1YroI5agQ05ge+XZoFMhvZuSIEsK1uxghPZ1MQwcnLCWbtBBOp42loUE9Cr6X+hOW+mllAZCfHo5fUXngvehP0I783PphT3Jld5NlUMfi7GIvg+zs9Ty2Xx4GzCA45ACu0AIirZWwGPrGncGDZsNirSTsqJ8AXgADcBVRoB+oXJoZ2jIO8jaHLXzpJS3b3X9a5bCxXJ/UzEc4MP2ecoxQohLZX3tcz07DhEC/kK78IyuZmiXVmfy6Yey1AR4H0WZQWvgaUHQ0iH2lXkMA13wsd12HaQX08ZwjcXYQt+AsbSVXk1pCiE+nU1f0bmAD/0R9jI/w14oS670caocdrYOkavMNXi8VYa1Fn1PCVIo9f0ILqHXXKTO+L51gFRI8YWL6OE1ZJ2C87LUg9HReAH/azuSEmYSfD+5z2/911WDF+v3fXz9gY3lpZrWi4gAskccD8De5QbshsUhjsHftavV1l78H5TfSwkonG9EAxmtyHs70nZ+OCYO4AEH9X8MwbK+7gf0EXbM5P6ExxZRsdL/PY256ucPNOhiw/K5GbvVrPD+wa4CO/NcCpgfpUA/ZsP0qDzBN7qC0i3wrNoZfqm3AgDm3l5jSb4f5su5+dCsB/TJZQk7zuL132ZoMAnzsAob8YrtvrXTCTTU02hS+nqjTM0ghq3uxV3S7W3tQCd7oMs62nUDrLdSFuOfL6dx2md+7k/DGqBNln5lrcRirLSVv7SrfmVIY+TUMMACcvkFXWnYWVJIrybp9Zs1AgOrbHfYJeY72yWussxm+9zqPpeme6piTndncCDGuOjIa0cODfw3MDzIQ8aR249+c/Tno3U5O3K+z9mVc2KwfrBtsHtwdIipV5kXHXv92GfHTg31D5ONHLoH2s57N+/EcMNwx3DvFsjMsMZYB7OeyH8r/5MCA/tI9uknnz755snPT9acFBVsK/i6cM2pXadEhb3bAWfF6TOcq5w73JIzM87sLDrOreO2cu9z0zuRnISn560628V7tIuRL22c07iycUPjq8Xbi78p/qv4KP8iv5nfyc/sRgs+QV5TVdOWkvdKvir5q+So4KKwsHla8+Lm70t3lZ4Q1gvbRAFRYcvUlsqWx1peaHmjbEfZ92W7ympEl8Xx1tLWX8sfHJU5Gq1sbHtp2fvLkWp5+6L2x9t/X35w+VmZS5Yjm9Axq2NFR1XHlhW/rTi04rw8JC/unN65uPPxzkMrz+My3IwH8KKu6V1Lup7sSq36bdWBVWcUrGb1GnbrqZ5f1xpV76+9RdDG5ws61GL1pg3Y7k7NKe3EgS821mgvadu13dr06Yw9RTqtzqWL6ooHZwwuH9wwmNr0xqZtwVu9EJINKYLoIGZIK6QL0g+ZhCxD7uif6j/R/6j/12AH3Q/1gYZDE6FkqBCaC9VAa6FHoeeg09AV6APDS/oPXqPed9L3Q5PI74XZyR/tL/Iv9f/OkhkIC0QG0gKFgdJAZWBloCVwPsgzKCwIHSQKUgQZg1qCTgctB922bdret31ltwp2Cw4LRgYzgyXB6uDa4LPB48GXgt+3/2D/P9mGeIeEheBDRCEFIfqQ4ZD7js8cfzvtQ4NCFaFNoY+cb5zfOP9w2YbtCTscFhwWF0YKE4UVhB0Lu+92CleG33H/5cFHLEVujQyLzI40wggwKWwmyi3KLyo7yhR1IzsQzoePRTtGB0QPIRwRPogoBAVRjhhE3Ai8CnwV+D1oG+Mc4xUTGpMQQ4kRxuTElMbUxHTE9MZMxjwIfhL8PWQfezj2cejD0LehP8I2cbvi3OP84+Bx5DhxXGHcSNyFuJW4mwY9OK6RoHhL/HT8+9H4hFMJlxO+zTmUeDtwrGLl5h8VIyPbiAfhd+HP4R/hv3VtPz0/k0RfYiKxmBAlpKSGdJIp89fqT6Y7pzc4UvdcN3Xx7t7dx7yheVL6x0+8Vjkmv8z89sl7nnyx8r3Kf27ro4EOkAQoeABCHAASqVWuZMMvwfYZR1p+oDGXHj82mYDBfG6RogR2afx4CgnJUZpDRTRNP9io77KuSKCpXlu8YK2gQkMExof8WiZHkBAgCJgp8znV1xV602sS1ynuvl/DVpVlNXy11Q10YFTKSQ/A4FoEcgWecWt34CfLXeagcboYtilGcHutu5ng6yugj6XODxzgYaUbUXKO+TRE4geNoRgffuF0UgjQEBw6fBAK9qE9gBQmEww5HmgxCpTItUlPAhB51fDnrzGc1LcYIZEG9n2NaXt8awHNybr6nxfBk/Nw9lVA3zSz4mMaO9OYJHIJwBmy4S2+zKhHI/8esQbHCpWSdNtogoPuMYDzp9HmwpeFmY2fBryCKbCOdvZ6+zuj8GpryP4gBPlsi2T7qT1freAk/OeknK+oOwoVhP2jf46B48HzOVKulLIjJ3VpquRWnyx+ETFxZcgWQjUiMyAsL/sdFP8U2OCa6PKxKRa9pa6K8vUSApja/8o1TkkTpQ7rgD18arX9gWs+rcaj+zMOsCqJ52N1sV7G0JjKzCpGn+RiBGq7SLkErjZ0eV9R+7FxrhEY0zTlpLkOaN8A/bmqgApYbWi7B3VZs2aORBXkooEXXHZ5R/d1o5yqwnPisSU2l/OBS4VRcDUog87Q0N8O6044raFn/9kUsHzZUjkGGs5xrWYHaqqt/7hFUp1P5UnPTAlFUiV0BjVZz1JN1Dgo8jxHIQZvyvr8HJYEtPX/HGvkc2Riwr8C7JIo41s3SMRa5luLa65Jv10eC+psipxdg/sKUEskuz9cyOqCCUoHN1iNywW1aVcxIaFMNkIGOvfKoX3xbdgIWVBYMOTuCarCjs9q/pIexqdPyoMXaJ8oMUbd4/30es4mCeec2pxYns0lBSmiG9xSzD6c23O+0j1MNFtaXvp2VxbkOXjXaqNUl0auqAC0O+PcJvcvS4zTzO+58nyVx8LrBgZ1WzTlVrTXPSCAIckaAdttZsCqr1KDY/sSv6Zn/f34iyhUEakJ9Hi3gkw3dQrXxOrxLLXXE541FMEyMxvbS17BvZJHMCd5EcdKBuAZK+9vVot79LNFJaZmHuzhrDcTLA3ggYWEHSyjzrKM+l9qeOwXmLIe7IyucXmIF53/RHeH02XJWLmAubDWcO76E5XFmtXfjaMfYPeLu/3y1n7Pf+SwrP2FnbHphrmGCYjVUa7bIJYf/ucJPjczKohxS2yeZgo+/smal3e3nLD+GbtJhY4e8fdmP25IaBcskm7uNkopDta08bU8IJQqa9yxL+VGy1O5+eZW4fbpEiEODIbb53U6AV3L9nd+ymRsP1QaWD1O3m7QsQBIFny52uzyTPSRJaNCygYlcQ8a7kKRmY0DAyIBu6AQlT8JlD728PO3/Pdr0GXwnyQIjGCpYM5VExgFObAzRKxPt2frU6mUenn4wXMbCjjAI0oeVcYYkxzSZAGdICF2dLIKt82c3k6wGNtBE7hNjniGLdmIFZK/Y0yyFXdIHsbDkkpcILkIy2vvmZXm3ruxbt9tYAJ/lk8vR4J+Eqb7/JXoYXYNZYLmDJEoSq4LYLUd10Pt9UkM853jhAcSo1aMPVoww0VAp03LcHcSzRKYfD6aR0ynoMr6K9o2CbkY4QX8UGCPfXo7nCTZ43PrLgrk5mr1V5TneF+wGjfC2stoqNbk+3ttFoceUnBa8vmfhbUKrOMzExJ0G+Hya3c4iaBWRUWlSWg/vcxd1zImNSAcDJiYYa3RohOuLNrXqT8xmDZFflxY75bf7H47w+lI6zv8rNATdNfExsDDQgI4myGnBT2AWAwgeBklApcANDWcUpfNNzdBuFUl4ad2m7xp0ygjohUH1SODvmuD2Y5KRFce3QF9vQDBexDYAlurQLU6Xg8s+wZ62z8Vuvj3t7ZSHNHNvcmHY1fCkIQ4d9vitF3zyHaN3tmYaIpFwkFsgMvGeB7lhbwTes/dJuP/SJuZmB2RaH1gsUQT6OQG9crKYqDhgChog5a5zEe0RQ7+xUCKSXJBguo2QBUVcLEQe/nkyhTSYY3W7MnOraulg45NR5tbJsfnpYGezrbCLdTNYXywvDq9UJFACCEZKfKiqgCfZ19ZnuAhjIdLyJWZyUDJ9bIAL2/YXM+rhU4vryfu5+ogI0+exd4dVP3Vrwt/KHoVmhA9dHexqA3yWkHrDhFWY949orXu5VKYDjP2I1SrN72yIxYM8Ls00NJSHR0aPJttP8ldfVMBtzNJsPlYMlRsoiSvu3YNdy6DiD5GGq+YoRwG+VMpKTT8LKodmhwrJvyzr9j8Hq+dsqja0B+O/f71dTpfsYbXjIi6sjDA+iT2aEnBMeeAAB6DMSEUp/8pu/65Guj08iJ6aYUvajdHdP93zkvrtQaHBiOwMbPxCMlHOKC23Kwk90SHumobmARzDZv7vzFkIZDuVhY2EzAr7IxMJDZ494f/K5+ZbRDMG2VwIhj8W1u/fwOhABJnqXNFxQdQNuX85Yo2QzDVziC6l54i0h1EpB43ZFGEfDzI1UsHxMGPg7bVY77r5dWuwNjF6yeWQP8fMDJ6HGEaBTeftLiglOwWbEtAQKRL6+2G5oY7UGZm435JfTwgeQlbSx7FBpL38FvJ33BIwFQnNa4tJqzlwD2/a0QEB698pBk7blXzojPGZh5sCU9NNjaUJ/PA8YoSH9qlBy8BAD+9O0VlF5iKASKSSqHt5HWugnediMyc2fluxEp+d2dcLqfO3GGF/yLQDYUHJMNQM5JBXe6QmVky97V6CdT9pUCeYTfqqSkjdWk6PTOOAU4DLcCGQLtV0Vt7W4qEyU4lJf3syYmJuBODvT3ACbSj8QGx5xMoXjZOz3aOnsnPJ0687B4H65hDqAFifcy83s6U8VVPXjib/bWy36wl3Nrz1Y+gzfhSTOloi2tATxC5YYPGX/I7d7Ki4g5T3FFJpFAjoqaTCNcc7Ws5p2Z1YF4e2kQXDryBJq22Qnf1CjqGZnADKmopvEZwcfG/sAnmQ9XXtvPSpzZRnsyfGzPuL1vQ/ho9pOwy8m+60h3/fn5A4T5P6zlp8N/luyWh6GgCZCZWVrw4CPOHEJSMtVQ8T5IwwDGsds7828+gz/hSlqWt2R8P0rRbiWS/JlJZ+qz7EF3RAJ+dXYMilLvFxvwted9pwF1JvDCThxc8PtFDvbK7dUuEXJ9thVimLrwIOrnDZnCXAbnrJ+v23QXr4GULQ9PDisnyvtqcPNSo6BvhUg9p4d0tWJ2464DOuMWEbAge0cGCLa/QpiEhZ/4bVmQ76MldJAgyGObeJ6S8rZ/g+m3hSFyoF9IGisqUHvKs8+AT4irqWq95lnR20rk6pBh2dNl63wjway9YZo3kn0QQ4fGAkDBPj7QaOZXJ2J98ix/1aNQSpuxSpbQSNRI2pG215S1i4EnSYZYvloKAk7S48M1auC7pHYbNaz5HaDBachjdjnE3xtOWfR+qblrm+9yxWCkzzMF2ZyA4pTYvHR1fgQ5343jtSUARbzWVYjVmRlvfGG48vom+ETVAl39JQK2Dz0+AlaqEIEe97sKj4EH5FBDfHM0KgqoJ1zhT37sYXWGd3gtGwiABTtt69n3/PxGsLPsEPX20C1k763ZkLUC4c7xeXth1+0+eKdTqeUvNSjAI4DBoMjGaScg1jUE9cbrA9Zo2m6QrUCKHDz0icPaLCVsrYMzT5s5O+AsbX5d8E3dK/oh7JTtxjqQLD/6u+SbDXZK3cbTWadaoe+zsojfGzDxYELAbrMj5zkEyAE2lGr4w/9wWNYWWXQ2bXoPdKxiMcauka+1yWl3NVdqFTu8m1fXl8w/JSNAjKzPCd9IvczgkcXj4Ow7GKZ5wNYeH2bMT6JJnU9j3IqwIowbKYY22sXlgxd5bNPzngdxYBPFB2/rKlcX1S8mmeI/VvJZaaqWrSi0FT55E0MWWSJwAUmNcBcxh8vWHLPgKpisS1L+zGgc79rwufKvwgJTVHaC2vgL+YTMS6lCgrnGzgzH+Ag10rqb3v1j5o4uBUDh2lsMIM6VrxtwtmkBtSstKEZgNmD5j3BKBrnA5z/whOpNCh2wYkUus1k918lhDUocsXHc7/TjeQVXeb1AA/Y4+8w78YQVc8L9OJw60McIFqjYxELApRUMkwPCkPsEAoBwWHGdK+OlTPa5+Xf9HcybRa3ZajBurFQrY4mLIP8NeBzTXEmvpGzFcQI1A14cnYSPD5t22WMyuE5TfelY5/YNmp88yqNZC43XO/Lnc7THLKWgQwve4cGDBUDVjw9meizy6iBHj6NA4OjrO6knmaQjQoOOXC0cOGoEmlTk7a5WJ3N6mzKXyvqonJG3aQvDMYMVKyrSbCL7s3hpAYRgcjAQEwPUOQGxt2Ro+sq74pTn1W1xACyn9TAmiRsDbGdqgOI8+kxb14O2LEmKfP3/xC+qWlpTziK3nuYxwkIM6DrYiys/aq8DrpWdU41P17+wAnNVO40uIlohILPaEs88xQF9cxOfoLwUPNDwr0RfnoFZt3oFbWiyECMyeXz1T0wVmkVPnKFQPG3a3cnQRi8IjASsfNu9VVWDCSHb57FUKOpkrhrG/jNn4eTglFxHcKT705s2I/GzTFYJBl/2XhXsgIWWMBE62hgoJzgmAvejDHZoBAl6dVLeR0r2nKw3jxVPOoOKdcFGvRVMZ6LBgzYoajFcMDaA/IaEWt+oBaq8hYCO8Yozu+hsVxLdzEOnrGVBYjiBmy5RBVUJ5cdNBx2ZlDC7iiuHPr31IdacAGeLlV5+tr9O2rQ00ex2J6Hraa+c68VSMLvW5E04eMhdSjzH6yXx8etWTyL0wTjHMIDt2NLPCpu+IpFWrlFQfFKQm6/GSf076MHyhleb2RICcccuZrYHVJMRoauOaZ+yYCgZiZCCUdWZPIhNyNt7Uv+K2gqO/fYA99hQFC9jPLyjxSJbDLK1UB0ITcplZEUvfcFDsT4zuXmguODFK7/BnTkiW0WRXZsuCmwy+1OHyw0EYk8ueaUFnxEtGOxsgVGxm438l2/BtyJQcoLidT6X+zjiXx1lnJhhbDtPBcAQ/Rxg8nrB6wn2AuwJisA/+ycQ6R5BQPp0Vt/qeCor50NAxxvabjvbZJui0d56mAGuAIAT/dOK0CqETDOnh+n9ecpG9ia4ILv1oL3Ls1vCluelsAykmIPAoN0lkoON9xO2FFdq4LkuqDtWquDWyO9TYM9F+XrMZHsqDhaljHx++7wTjYxM7FFG0MTvu/vaGcUaYewJZtu4cC3MLhwCup6X2pPXC1/eDmHckEGTUebwYPRJcq5L6ashlqlsdcE0SHIM4Lgqd8E5nRCBt49FuyFHYKtBnvWr4ypaUp77N7PH+VS+Ml2yJVVQR0C4Xkr632mOxFDiVTTBLq1WPiHQKPvRngmxd4F6mTK6SSdXiQqqNYrnmP7AVe3iBv3lV59V4aR2bSGUsEWx/lx7qaJ33B/vIF5LfBnaJCku5YNyj52IDN+MwO+AHKIMnbZlq27z7jF7vDaYvSCO1j4Vdc+4QTYN8o+IkxEN8YpWykZwFHUHp0EGroger3tdMqEhY+GW0BUFvfNgw39ltRg5bmvYMNVmH70COnygkVry9j2qct8Nd3oqDRkKoT1WFEyDuttz8WjCcOrm3kAGGFY4ITfmoTBaieSWd2aZ3i4OYkyXCScOGljjiA8qqAdByLhJKh2YK3PwEsTF+Nx938zD/e2VJSf/UkWQWkvB3CEA5WkIBYxckkMVaAHUaw2Uz9s32LCOjk1muZ8bJM4V+o8eu/zw2LXE0580wsywlVjpLn/TghAAlkoFyz9FXHtRU5eiw+e/NCwYCbpfIR+OZs0q16zkwK6vl+D//7qWH1PEMrCRKe9ZtvA3y6soh6pNj5ZAI+KXRNNNPi7w2t94ZkxICjOcuOXjsqPzaXBrLQL5gItC2enXeviCkrLdOXiv4ndcvwfHK4Pcxr9lQBpXtqqi0nVa8hA8rldv1yyQGuQT7kgjTi4egbERcB+uT3j5d0rmIifr+AMvgRX/U4CWrolMQNIVPdKplorEvEz/Yte7vQRTsxbxGrcrptlp3n/2N2e1QGm4bOzbO8K7OwQsZ2MnQu2FL81EZJqIFZcBFm+mY1hUNDKber5y6T3liAvx784mmI2DjqhLW3l0+XNdyK0yFuRlzv1avtIQ+VLxNSMottq6aY1umDpkFpTk852i5GkwQVyTGBHA+6CaGJScdS/i6urpqodRu4lOFXby2uhwJCLRIBpSGZ7sst/NEY3ebLn75mHwWBD46Db7O4Q75p7yvr5YNA9fJ7R+3ZTp1VvdMvafrHJTvbJgbnnr9rQWnCtWog75uBORC0RJ3xHVsyR+xSPIqvie5F0+onWNWsPuge4v23GHmwRrnDXPwVWEGSCACucqFr+zs9+pE6GXTboJjoF82xARRX881YVVgDY2vBrR06f4JG31+QFGIZGblKIv83EStKbManUGiO/r5OAEkZ6b4MjRkRMEvwKcJjvmhNeVXnR2FBnWBrnipQ63X/dfcaKiCTZV8mv7mtip2tU7lE23+dUbF/RkpoEfHi+J+sfj/ycUnEVIz76G8eeA40CHq+0Fb/uo+Ufnto9qaHmqNn3PyQ2sjFPJQxzfChoYvNSidkXCQcK+nVwfuyQJ1zioMnf2Bv8HutWI24F4c1mFEeN9jkta+cfoa9RJtc2/IeAo9Rp3a5bXZ9kjEqcnM5li2o21zPjltVtaUCDviMrZX9KSjLC0pbe4rP6WUg/6cbUpaNtOlorY2fU6IrxRknbb0PoT/0I2+qGn/46pYV0aa1xwuPpduCI5HsAMywAPj46ZnArrJ3dbWYXUFPWjZ2h9fIMG18HSzsLamEPx0eqZcps+k/Bl+7cHUy6fvxjxW9mJCBIWPEOFMrw2V6nGEX4H4hxTgxzDZaR0dD0dpHa3qJP6zPdS1g4KEhiy3Vwf/KqNEYIa79lw6IcOrhLrrPIcvY98cKyTXGjAESahp9hV82WNO3NBz+Q7J8Xa2pC9WSP6LWckB/ESyGY+RzMbyABaYHDOdlZYui4JNqWXJ8xfgy4nYVnaRZV1NMijBOGOpe7nX4xsokkidve4z4K5RWmWtMMq4ZNoTwsHgTt8Vca1SVaQHD4i4yyW8l+aCXdqLepNqmicWvSq4O+ZlQ8EEnorUkSNKph8fhs85J4fNuOFnCFMBM82jpkAhS5NqKOh//o74+m6ts1+M6+xUTQ3ufhycnzsJ5zAGqMpoXtPS9lVb+ym0x7va5Ytv9jIk0936Wv5herGEiZA5rAV1EEJ6LBlM8fHQVY/7Q6yTgINWUXirVnxaMtltU7fK3iYdwAx4KWp9sPGtm6KCLYnUeCiKIcEAFrAG3S0u0EaBGbRNlPRHZkkGuBisqFcKE0HO30QLdS0Y9sWTLGj/x015VgWPru7Lj6lJ6KiGapyPQIgDFTrMkHigsNGCE4IASTpI0kMfXaVeb9SQU3MW0FDgB72+cMgOTwkNBDcwA0ZsbMnZEao2Yq6r8u/Zhk7R3qHF9qRJLITO6MGzKKj75Sx99mktvR388JrDZ9CbUOyHu4d/Rp9BXMJiLfreq9ugRGAlrz+rGlM8HMMqAitXbdYy19uggWozxK3YkgRbbnPUl7CCjt6aT6AA5qxSu7qpiHk1RDdWKDfzO7p6R7zsxGkwGXQ1Q6dhE7QIG5Spojc+dM1qbfNyTGGfoKzYV4cvxTPjW6PTCE5zOGRnFW/ZzrVMR7j+yPEzGJhGutczpRnCwj3ObSbxCJqfKzuwJFjS2k5yn4mTrb2KBKKoYrxd0PhcXsA98T52gLIWgbZuiJD13Qepi3FhK+c5M8Eyydf4jeRVHFybZNaF26lx0RW1mQdbBHxehUZ3tbYPkqQRGZJ0XWOWS3iHALO4FCagDJ6KqnKZ77wTtLDfVspPuwyW66EltQqvrQRRJmbP4sXrbMU8uAu5nKjF9x4alrR6bRcaSIk0Ne5JjwDyI14cVHartq9R+i3m6cwOJZLtfoxG91wuqPVmrgAtnMhknv3d1xMXsz+zk2bzbrLauVMX83TmQuuJsgInKkyCkbYqk/72vZbfSSSynpR32kYjncHq6xvQxR/QD4QQNTsTkc1b5M67sJeDbdRSA8JPOrI2L4+x8zRUtlYHP3QGq7GxnsnA3o5g1Zjt6Rc5RFXEB58ivmfIkU7j9tS9SoM58ARzWPPlAdziU3v7UcXQROSrzmiQzelJWw6Q1HJ2y4s1M2Jjh+Oggd0wABJGbxj7ooPXhYsKMukL/f9ntaJLI2MCYVf47kXxqsjWTACyu5EUW5nEiMlu/OPUoZ66U4t07RcRKXkbauoJtvcuonrbEVhLC6ccNDe5bgqtkrHA0RIsrerSHOxKCYWWPfGtYL7ZWeYPw27L+ggudpziIQLaXK1j4Xoyw1a/PxpfUTNp23/hEp4+8LMSfie3p+7yz6ASNupMbxGK4Wx0Vtcl4Bp26dwaA5Iv6LN/0TlofAlr3a5ZfWxBpQBt3AjYBwEjNLsKcXJpOTm9L4n+1my+5pS8hNB6+thSdJ8YH/BX4iqJ5tlqZsXwAZVryhYMDOee41xouMxR1iANGM4u8tBDGXWV8jOrHH9E2WdXcBoFYX7wAWM2QvvSldauqW+vJDJXT0HDf/+P3oRobKZ7UC4V2tZX0NT9L65usk7zSvEC0ViBFyckSFj3V39jxJbtPGbkWSDMNp60+8wBqRceHap9X7I9tx/R6jWyV/1LY6ouumm44WMzg9Mz0UMO0o+UOiwosbQnyWnyFhbAqD25M0eoIH4hJKqobGOg0ewg40ilHqJBToV6QF0sdRF2ciqQgtqcbmJIsjx2U0NfiLPtYniyvTtP3SUXTRSCnjAyHejD9KxT02JoUzCC09uI31Q7q97nchq/ubNR7XH5RD+spvNkZtduxANJCX0clIZlM3ooL02DKhdIpPLxFA2zD6pGGndtQshHidPYAbkwHtbH9E2lmuYqdmBS0J1kLEOSwgnjWSy7qqP7jHPa7T5J4xh7d8dhuX6+jkWUceqIygJjtrq3c4Rc2GHAWeFXyKKc8vFofpsiVHTXt87bEaaiHRx7djvEU5Yt9ZkpX6701mioAVH7CBi7MYgoZyDElFUUqFyQBD9MQR2aLLsv0CUUiDWvK+UNxZeitidukc95yczGuCQFP1jODQfDUd4NQ8S6VFI01/NUej6OmwQGsEEB1t8oYw7HB5PeANyPmJKu+J/+C8wZY20tncrnI2MiAvqjcYSWRWyUmttWsJvNHBJMBIzcGAcD8rw8iE2SkGGIYHv74SmES8rdqqdqK5msDSw/Vg40w/WXGOfqAedM4L4//hvUyd06Br/o//RTb0xzDei/TrLA8j1wMerud+h4oSvVY8dSqh78oflvDf6uop7rfsvOK/PRDy6jUlISDeWXKjj+G3TiAoxlMW0yI/RYrcZOGOFiQoic2nRr5PUcOhhd3RDzLE2OQs7oDRNQBKjOHkZc0xdEo4kKaP4Tv2qxK7Zbtj9qHgdm1MyP6jZGXX+K4sE7CJ+fiw4y405syQZsVotmjbs9Ptc1ZUIejPsfRaq/59s3jY7zwZDfcyUnJq/7xuv1VNSfLg39ei85OqKvQBqB6jyTrAN/nZL7366YUMj3EcpKi+xjS20ic+dy401HaAT3YtY07dao3qFv4xEhSpTA4qmDzWSeqJHrCJABgxmBYsrNmhDSSWPNQ5T7+m1eht//vvY0o+Pvu5FHbxOQQNdgEEBT3g0ACz6SDFMtnX2EY8ekPxTso+vSqf81O1tnJRlF18Kiv6AWyO32P5OsVxyjiYT3PyKUVs82p7Kv9Rjcfnm/C6/HkiZWs/2+m/no5AhHGEKeyzbSYASdQVEeVIgRIErrqAvQllwvy4+hNJJ/FU1LbKpwbwbMwHS8E89g6NCZd2B9h3HxKLUaBGF4jnp0cUs+x7tS4G56imIkdPEhUKs0Q/z7DmcUB3gNwduIoQKlcpxiOXuHKT79C57Ljx8HvUbo5dmnSvt5pvZtAT+bAwgJQSQUdnVpDFt73BqiAaAZ4Rfz8qR6mVzBMEEgCcvP9e6wD8LR6ta7Ufd/OPghzhhi2a6/6e4J56Q72cZhilvIunTSZhM97AMo46VnJtrZh90SY6Yv9DOROdrMZ+V3H4DkdA4dUPauVCXS4wHj1GNkr/xnClmx3PTZwcUCPB+81B8IZBFMnyb0f8Xrsy4zN6xGWzUMy2BjIcY6uGyOWSdkVqV2BoPjowSQmxsiUvH0br9XPNKKeKzJy/YgFI1IZPmjjYEuOCdvc046dQlAdIOBYmM/n45EdpQY1Q2XvOYYYFLxs4rGSztjK3LYsY7T1xxQ4ODMxLpr91a5mL4dxZ7XT9gPe0IhLU8lm6oXhcnktUtlCeuKZsB0YGDmumY8A/RMZEecpqMiuea/1zpPAlC6hcSv8k6/NVDAmoUdP1zZFUgsW0x86JQUEJvFQpO8cYevN9insMwmQEgKVfD2bWNhmX9bEgpv9fuI1taTkwoTbCtt78RCjfXuvy2SC2EGrLx1rBxOTU0k7WLB6a26zGy2Wq+nXTI4BRdkzyRu+lSjY6PpDzrN5putO5uL+dWxATVB6HfOBXcCWb5B2d9E89Cv1m0sC1Iw3b1LnwDMV3ceIjtR3/WulheX33oCdLDzepr2/FMARjjyV7U9lP2bm88lYacV5qHq+QB2HNcHvDqNiNTPR51mHdv8gFg02cKRcbXJLRD0HxsLOq7HmqvVSBPR2fy2QBAY7aGDsIcKtaHy4AxjnDQt6Fl0KIDAev+Y5egQerr37NnLU7kdFCbw8VCxbowtI4EhLIcGeh3TGEjwOLYTavUsccFRklS3e8zcDD2khsm9v8R2jN5KisQhvanS/mseMFpvSPmndWm6ViZozGxHRy0/QaC5ig+eku9ZXFa5XOqZJL3xbFOjrLAEVtJY8yBvwCY9jijvqxNS4uAfLwSxLu8faBOu2tQjxeFS+f2gUJ1zkjktN1PPH1yvPvjX6gIN9IZpoqwRdN3JU0rbNRcbs2GHwTSRWP1/aFloTviqURMH3jjl9OOOITu6IoMe/gDG9fMbdDpmCJ0W8V+KHBbngA0JnXkH20N5kmkCb/8Fa6sr9cCRx48NjR1tgUV0FnYIfejaXHp7dCxNCwXrIcTW1IWgrOtpvIpSzLamzf+pi3C0T+cGFDnGxyb7PhBcfSBkk8EIIP2/9vyoAiwDL7/jOQw2VhSchXkAPP9FiJfwIURCI1Jo+2PUt1nTzl9GPD+fjFamaWmrPSmfPmmfCITdCO6aDSpYhPAgBOKQOdPjogDWGVvuXrxB8SAFacrP3cnuwHFmXDvcowO/GoOerxIwwarm0Ig+NHaMZkjB3GAc9a5XvDD0CsUwh5brdFxHNFBWZpSz9unogyEdZZgyT9PZ3IfF8qz9WgkdlUSWfNx6YlihyZ5TsAqHOCtLTnWymTVCpbG6kgIBv7Smpueue519T4Flvrk8/w9v6sKuRJmGmvoKtHAtD7+ib6YL8HgQGEOdILh7fNZ2wrU4HGyqDXRu4rLDHM0h/o1YlIsBE6bGwhp4wyK7pd9Uat+R2vvJVsMaf2SN92LXuVu7s6xkfbEN0mTdrKFtimxOeCB0YnGdxmLRuB+0GF0PYaGsPSSA8BzM99pi6HR3Qo175Jk3g4BMcDqah5Z4bEC00bJbqMSTGHZsHeTXwYXt4vPbi+wFP+rf3zkANQ7g3K49BHaHMy9NQoO+nXFgPdaC8g1W/Z/yeHYZqP80G/BUjk+CMoTBUlWEgQxbSRMnpq8Img81dFc/+f3zRj7vKBwklbAmEqMFQ25vMi2qKbJZELPJCiyrXcB1IXLu3t29TRctTG+SId80jKkCoDPk3IlykCFrvzU33w6whs+zrscPPLPom1vqizr1y31lIU5DJ30h+C7Qnpev1VWo5ydyvSvBhVEvBuO4JyrVNNZswat8qX+Abvl3hLwW3mhr2aj+1uNXKoxk2KmtB8GRAH6tOAaRWj4mCOGertTyDKxNmyaZX1W46WgggX2KlwajeBIjwr9yoEMHJdLNk5oN4kGYivK+xVySAKoLUxx83G6em82GZRARxIcbZy80vSwtxBdBs3i+UpW9REFS0ovVQvmofawNUcJWJWROT2Ys9/r4XfYTKzQ6Md35hmdhK4XW2FNghcdgJLjY3qjgmCYwu65q3mjQq9Uy2KqjaouSZ40spVeC4AAuJc7DdteCWwy7m9F6X6cDyIwyeUpur3VlbnQrBIQcvxGSffJFQhXssLAGE3wLffG2rT9RH/djoaevc/2bL8BzC/t6Ih4OJtFouWdSqIPCWk5jbmy7VVu3HezZjQkLAWKkiPrvtHCd6D/Ui1SPeHJ0Wi1yHGssDU2aC187C6ZUOdQkgVFLv72+lNDzVEMBv/6rJzbAINlMamqNDMJRpbcLh3P71r9yZHQSFDuWEJDYchABPjehXfhWj3JfSgpmjNDWrSrtj6AHZuMW4ST6WuvQUICHkgjXoILl7TXGMQlb4HNj3F1IZB5CZXa7ra5YIgITXMS2QQRJMtCcINonuNY+RcQkaXvoQB0RnuW6tiDGRrnIYen8+g6qQH3QPFIsdwtyyCkrh4BzK1nPsQlveq4oxwBeedc3w7d3D2OhGeWjh0Q9Vnor4Zmdp5x1nmBvshqKokQX5eIVQu5rV+7E6Pz/xLDCRkq0ochCgP1iCK1YzREJmo5kOHlctJKBmQylydUKkfphwuHlsehcBiLsUJUwzcauoHlUlclJnYfegEeJc2umyfveaMUTGVYl9Nghp0hDWrBQFuMaTXRBetYl70OX1QgD1MnJcsOlbngcXrGJn2vuKpsPZY2jVIXzxEaDUmTL7E9da7ZNyrit0Or8fttkJKvls2Laa7PNXtktkzn7Huk7ITT6//+fNzJ9w8ZyXEvaEbkNYkoMVD100YoWDoFTL+GHrG/RXsnq3Rt6ZL3LwIhKOs7BOlCYzj0hIu4etzqRoHkl3jbCCHa7YWKVgaHlFaq2T2sW8J7Amr1zW+wT9i7O7ju/oMHXYaaVajiPDtAIlAXSm/mH2ZhX6qB7W9NVgKg0IkNopibEbW7lyCgX+PvYoH/S7S0Mxd2uGuRDhaEe3eOOFuEUjLLOFaKfbtuOPGIai/PQXPdQHvw51LaUkZfbwJv60R3G0nRokpIIjil7j9f3KobS0b8vEHKuMM0o43NnoCTnCgRZ0kkYjTVZY11gSSgBOS1b1vSD5pu4OkeG+jDYsIYAqS1QAnF4LJnsj6hGs0Gjm8CJwVAQ6E0ZfuYtyP/Ou2N6NvvrZDKZ/h3Km47Xh1+gAS1B6t1O82lt+SmTSVFnuOsAS53iq+M41YJ/OySIv5oBQikw8IJ0aJ0CQAHKrgE7xQeuPg8dYBbEttoIjKlDX2+fhgB+J4C0IU86KOgdDb3g74n1msB2hHdTiJcCA1TcZsMholiNsKSmBUhAObP6AFb8HeZAZc46Wa1XsS87MQLDKbQvVji5buSAgoeH06vVgq5GPQUvx2k1mLq5+2BbLPHMBDkD4/vDbv0nTIoVu2O9rGPy0QUM08hX6JTsL+16/fbHMtubmz+2aOTo2/aXBsf1wb4ubh2uGV4nUc2JzNgOF+h6fJHPZVPsrkdjJX9ZlqVMcszAZ3n0jnVW5I6+sMOXOWFPMBAo5mfoAHw/fw32i5B/fm7Jf3E5cr8d3WWykC/hcNCXrMb0QGTRiL8+nInf+lskmJ+e7PttwGmkqrrZFCNf6YlEGiC1Hiq7MtbWtoj19kCBUqfoGPmsWv7/frae5o/Rtsotmrp/0c6+OE0n+/J4PeJZNPyvDxcQLljkiabpiw6HSi8fsLoKGmWW6w+FFKlMZa9ZWUeJPjF8bBvnHlc9dJHu5Pk/BUOJ1bfPU+BzkueWHmgPZjn6TAxg1uaW1nQN5VosNmsgaSQS5FJ/27b1RszBIQh4AHA7zOwEi816MnBrisehcp40EQcm1e8QSV13iH8vNGUXuflwJzWWXHHvFlENp0IQdxLOmnc4sRb9DppZCZcF5x7NT1sPtXC4tu3BhQ5xzRNf2dFGF1l71WzRA/6Bt+A7Q9g+Jp4N+ShJU1u0CrH7kvlffJpnhSo/eqMe8hO1ki4h9/ANh5awGQVTR+TzEZwWNWyrbPnR0XYkJgELbTFalq50A0utmfYjA0pVUQZb9lWd3mYQJDkoEd5ZIdbLUBmLvEptdmgFE6cQL2msZzq1ViUl5k7Akb1t1csypb6Rth6yl+KkzYrbzLHFRWY2nSagOXP972k+A9GsOsKlpv52h0lFQ+AHlR1ekI9IEQJwBlTjnXSA1mgPUUJvpSCtYLoSCGl/J+2HjVKewczGXrI1d3sRXF929XtDJDMi9tc+edLvsyzEW44fZS7eZWGAw9GjolZP5wmI6ozvUC+ptIO9KCsUyg1tglwNOzzns+CS+D0fHwLjodVr34F16wQAEGVQ9F4ybf4yx97s+QxE7qG1KGDaDX5JXl/Fy2bPynseyzJ3wACELycgnOT60YbuLatJn2NOj8CUjUPvGL5HfVKK0d4L0AKn2CHuoQ+oSd4iXxVqZmo/MUrr2DCd7ZQVrISkzjZHlKLZnKAdzUh6UcyxSPWJrfJM2jUXRmwlLXaq/mRvtkDbZP79tF0g4+LhR08ey8pVpcg+I8X0YBvJxKs6hfSCIjRt3WXInvqllrJopv7qcL7Xxya0qXwUEyqMxWbbOHCCi4IYH5E6UjH8pSEFrHTSmPv2z0yYEGTb7Hm0bX74bAa1+CEUsXsjLc7hmsRcDpK5d3ESOa3fq9kw99oy3c1liNylWCpfVk3cY6vIDCugWqdujR8VDcDWHtVWpu5Ejzd/89d4byQhMzaiVFcppPVXdgmElpnm/trIPZP+5TWVGN1K5kIH5VKJy+1YR9z/ME/ZD/cGcNcEK60cMDFJTceH53VbE2nD4/jKx04wwXGOMK+1XQKzYZpClTOQoQs/6HbFdvvDiFk5xtQzbmRASNtJtDlHQAOf+nayu7GsKFZ7JVcZIzgQnNLSkjQ6LIGO0w60DLplCgHa0yQOMVvrxme4rBsShgBc4LCgFUbkto864/Ch/Sma6JLPMYvHRygFB7zEahjNqiCB/Qgr/+6Jbp21XM8sK3O53B8coIEgKo0he5n/b3Vw4PYkQmM4JpelRRyQDeRJqKvH/oAR3IbcoeCwJc2cHb8HdIIjsDQCk5GCF/9vs3nrYUI+6EyTGuYGru5ylKIg3AHdgQjxHC6iErV4j9tl6ol0wInoXIbhWBj5y5YBdxVnNno+KPPqRf5As/114NKdMyiV0RMhVLT7Jo45kfgJsFXY4fnErv80sl7x9TsXF2br8YkZHSi3JyDpx4xhWLwlQcjYVzXcQfu/rH5yKSpx8V99tazMl8Dxzj0Uqfuty61IldCROHM51nAjwTjo+FIQ9DDoPrGXA7lu9HBnPT0Qi9ABuaQRnC4dVnU/Z3sZLGqnTaRuo4Ah7e7BPHghz/71wX6Fin2FWm3aPeXVHa5FE/714RTw4n0uMr9xWPkok3H9rdvQ4RsE07BZePRIkEfGo9HUCStYkDRL0bD8rcX/OS81uFCCBmx3vXSlFd0t59JiqFmRcjs5g3AIGqnYVbrJKIuf3sTtrgvme622epHmxP4r+KylX+U2C/GXSoXmpbXd3WOiV5XzC35cU/dAsH7NIWbmjrtZz8hvI+0gqKPxcTkIlYAPzTlgObsDEMktY2OG65JhMsY18esvnyBk6esyQhct1w6NEpHfFSsi+zNHvqdeaPLSAynJbiM/XZBr8xNL0h24tWa2siWP3DbCSH+nTJ7MZM9cAps5fgbap8RzNcKhhIcp4czuUKkEUga5DtZ25BdW7BqlMNtoMOhZRJT/fqc6FILEpqZLJBiwDNSb5YWpHL5+PJ5IJkrNyrcnFZKSMIm4VDToAdtAdQ6vmIdMYDg+Nb8MBxrAexDb+hWtbJxtrjh2DIqwopzNmlB+ekVb077kTJNAquHG5jyRTov9hNHPQFf2M6O7LSBFvbOHsj7joNSBIhUFytrn0+zoXC9fdVuetrCNd/ablxW53jGuceisdCugGklM5r+i21sfx9JZ68Fisy518NYTBw06Q2i68HwAugPW1o28NFQFHeD3HNSgLsP1+86eHR6tMZ+y+4crFEBJnJ517txlg5XvzJkrUkVX/n3V8xb5SsK0Mf+av/W1Rd0PGL0p/BEy48roX9V2tQ2FlbCQsmqYjBNM/Ig4iiB+p0V3+j8rl9XrkYi6F1kQc02Xd2yVVz1yOlIpsr8dMl61RtyzpvYPk42C2yjE89ufX5d65sCm6ak274ZB8PQX6VO/x67Aug/dLfz90G+jR1/7LfXoBOlGlsPpyIoUcWqTOxAMuE1qTsYyEKyM4zTGg9RwCYU2r1Uk8kSXoXgYj8sAI33zApdLCcPQRwErpeuAs/LoLuS2XfmmF2FjEFpVBAxA7TAlJSUCUGUBBynS/Pw5+HQtMtfiUfLzF+Kw8VH9oX0uobkgx/ZvCuTjvFFV2rE2KMwN5AhbsvNBDDGCDwa1cixCofjECqKd0PPnd7EoTK61Utu3FfnTooEWuwVoDt9PPLTDbJnb7OZ8a9wJAxfQzXZ0K57iQNyYwLCJEyBSZQV0mEOgNs15ah2A2373O4J1K95cgEMI3ETd1I0Wui6XCbyvWuP5mf3SizIxgMTRlj2gcDWaDwDPI950fAIAUbzlwxYLMoMfwg9NoQAiBEVj/dBKJh8CC+BgJ3Z9RqGsjm3yEZEA4m8NPhlDKjUm2IAAHsXS7dMIGM0Iv4aykqpIuUsAy+eqrntAzpujnwHWtVjyZArK3QXlNcvPe1qrzrIqLjeZGthpIjoLGjHX41toAL9PRB1wmZIrpdLP4pB6EWwvGOhQD2iIjc61wAX+cJRINHzeTkK/MhzcnoIsrBKgZjZ09RhkPkvMnFkQP36yG81hSG/m1tSggGZoQSG0jgO8iEjqCLSrFB8QLdPcY55XUQo1uvQBZHOIhC5N+8g4/ioa1o/pR0KLbnNTpWLqGJAHUBs5ufkCUJtAOIQUnzO2RKs5KVJZKk0JpGnYRwg9tAMa2aUDyLj54SyI2bpesYD2oxSfwYBJPq2lFcCYk2ODyYqieY6HQqf2dFwBh9LujBKaQ1/M01nfZZhjDjp3pMe2qEKAy2HDAUKKEIWJYMLzrZkKBSSKYE+PH31EMRVW/HciS4/qAaJUgItjbu0uDuENYKgWAFAq1Vb1kkNqdtRTvs4VjJrm2ARgZPn7IFI1PC//NPnr1zVnaRixg27M7h+c4B4hhvgzFxWYSfZDqgIC8ALx8VHBWWaz5a3Kr8GoIceBEXlncPC7BlmA6Z47+UbvAafTy7f8AThZlDX8cjhmafLb6xNBYHEM2x1G5mlyak+enlncq/1585UyME5/NHxFJAF57rnhY6CnyMEG3fP7jT9cKBy9/qT//qr74M0K8vydzy28C1hF4vuSc6Scw1+0JU8lDg2+gqjPzFn2r4lMIetHMBqWxVTXeG5j3dkpGvX7bfYtHdyVdd9zAE5Yvy08O/vbHc9+pUfwovwkxhauNCZ0OssTsL4vgY8N3N6mO9Ofq+zzDkaPPD/FWrOlVKD6FbZm4bUAKJb4n7p6CmlZBLU6Z0VarCYXj0Yds9oEiZRUPNLw5B8cw/l+jyPhne7/Lgzvnee56neevIgeHjYMKRfgL6yrV/6aLDZ8O9p77o7/3TCKA+bVV9n9A2vIhm/ejAPJtGNKHyEH5cwTUEi0EkgorssUTItHm/+mQqNRRqWxYR52hASjWenumXdH8I0zqXmPQ+tQXKvVSwRYTYbzranVnXfihb2sLBZLg3VY+DGzRz3hsjoipdvWSAycO7NHrp40VcHpTMaRo56t3yWYTXPRSROdhkECjQKEOBf1LDuQGuMXJ/+50rVscw58aMIrOaY7rwIDIeGFZMlDbH+NqoI1X1l98QHyvND2FwF3GL36HDCJ1aFNQIfQj6AFRV/q8YlAz1ZGwsIc3HF4Ji0HsMnKzM6eosOiuVCZ5ly+khl3+s7VfXASXoKHTpCnoc1NUC5ec6jdrQQzhI8H36m5JSpsuaVxXrh29J3dZ4++dgH8G4QZtVwGtzQc0zOPIeeDyyOj1VCCI8BP04en3xmaQMpgQM7Lqw/N8Hk5Ywi4R5avTuFnghcymmRGDVdB27HaIAKRD1eMFAT40/rKu9+92IB3Tb0TsBklSVg+NfT+XQk0Ls/vsZV9kNuLfjlBrqaPIxN5onsPLptU5h8U3teEPPcQZNuFIbLLYM2OuWgcuGbPJoDWUcOX7eGzXLxwwnVwk7Z55rGxCrdb4Z/25OHTdN8PUn4DhlloHgVkd+t98kJnCEknuPWok5k+fU3o3n/bObcehTvxU5DwKbXdn7OXAPs/u0F14+eO1GmwouAwz3b0ecSRNdyQgMDUbhj0aETQsaJj99T2WiWJgiJhTKiroWKIkZ+higJoDTV5HZvhdqpj14kDQ2JKYQDOUEqntpmp79zRa1ghFnNGuD5q1Hp7KqkDmTDPTjme72k+VKAJZ8plZAwxoGHgK9T7qMy2RCyYfJoeYX+jVscLjFMi77VSigXiIAGQfZE832aLlcuWgeZvCUJNkqnTemjTjuQy8UdUBD4QSAZwdXWUNZJMnoj/zf5vkUf6HW70XSyOkm3fLnuy9SETT9HZrPMfravH+XyrIpHcYHhyNTIPFmzvjuxLxNRE9f9gPr+cvCyspFDonFdPv+AHKWMg+D5dIgG6JNiUggqiBOR11mBJnKZJEBDZ4ViX3Ify6H16Ho2vgoGKN8H+gP0ahUJUuF4kBGqI40oxtvsCSDHTJyIIUaa6NZHIVJPDC+YznqWRdnE8Ry9qeTDLab153KuDpzrTzslBsFcIvYbl92ACwVu2mObpEvhejfWua2i+O9Yr8Ra0YcW/2/fhdFkMN+H+jVLR1Z9NpuCFvXiH1bDa8A5rsYI+d5q2jPbJLTproXFrCdLHEQJZsOBfJpIx+xFCJSO4hIHzt9FeO+jMXYM1f+B67dFknOT4Pa7pEFtLKkZQz7q5rvJMdh8jPLpz+tRf5kjA53EZoa7vn/g97W3ebV4CTcbDPrLI9huKNG9f87FbneM4Fv+nryWCoaNHYgHCI+wSGqfbWwCG5F2oIQNJB05cdk6AWR0nBJ1P42L/wQdCqwIzXQ+H48QYSjawBUEQ60VL3LZBISqkgPo+KJZI8CE37rIQrrjQ3D2X6BsWqCW9RetxMJe1D6tREgyGHIvBIEiE/4LKP9uo5Fth0q3D+GEVvp6diByE2LFUjizCoWK7rkViQNjqKPc+vHYa4Mm1SD1TmDwzNU3XrtpZkzBTfM1dzXR0SWjagb0EbQGXIH70n27VFB6x8Ey5MZA0nqvVUbrx4+x5sVeXKmpuvo09+W9aQbH0BekhsGibaiNatjbhGUNYTIgDO9hTop+Do/onCvFwKIjW2R276f0RdAbckqLBTHIgmv1kliU6B0OUKiuRPxfoSClLSBVSC59rToBy2zh8eCEaqx9pxnxaTF2HJmzrqwN4SRYItAdjsC8EOLWeTBu1uhft0Rymff8JVF3KDrecsrtiqds/AqNvc8Af6CIbYMPbZBzkZef5SqUijCDz1Qj01xZMyCBcuWsBH481nImsRtdoM5T5D7AUvmldXWjd5cs4pEujUvsHUSLGHTm8w5Bk/L7cYHYbY9oByw/tnY69QSuGm/Tmj6fsDck78tuiN+gY0cYlI2Ihm2v1hOKEaQktf3uNQrG0ZLmsX2z2VsdlmSUBRO0UlK/BW3taOh5b2bBWTY/ykVkpXiEYq1vIfLR8DeubIMPpQHkz4iGwTC6zIGO1nt0+XrjZkjq9JQJpNYZFKruXtBMSedwbu4eGmeHtnYds7kC6e7VEXWDRKlhqPcUkQd4ezg3dHFr1/4zrOAPeEHHMU1AMtKjSXfRsIYed55yY0Nr3fVNgnCtPf44Puyo68Hx5wXE5ZCioZRdinHgIEqW+zo+j2kmZGhAtM6SfR+p6d7MZ/JRSxZ1wugKnGnHS2W3ZksWwIhEHv5v1Vs4rkcteP+VeaVjgNzr8oLGyWALW5svol39KdjyOShWBfFoik43uUmuSovejUne62X3Xfmlv4xCpq6d6S+93gNNZxdu7P98nkBpjigSPN8jaaehoQWXz/hGPL00tG6qX0aAIS5M7J3Cv3OhU4w5Ocxnm0ZvqLXO5FpVZ1X/LOE7tMZhVkSwPFd6eaJ60JY5Td0mln0gDi2AR03n9vx6ReLs+NdMYl+wL99EXFyvsAWyddC6X0rZh9gkbotvvNxss/IMg7Ft5PKYo9hZPIUzkew2oUZB0TYLoZ6iJyFZRaFEqRErgjTArl7rdoKb3y3f7hFpkM+Tu+GH2qb297KzaW2H5sJiU9VkTHYjbUqnDbaFdAZW5tV8mcpPJW4AwjqM+UoUJOrKemxaEppbKoknZjwkgwTpwNCdnWG0q6W/qgMQClF4kxcMfCkA2+LLSppFShOGE6f9C26FyXuhLOMZZ/SDh8rGxvlwsDCORa6TfekZzfVb84R3e/fhyA9YRthpi8wWRgTcq5AzhSYxVMCFoKcvOK2HwMQNFowQWE5zTttXRFGo4UdXbdAyKkuNJwQGD8TDM5tClekN2kfTLBteQDNBsoDW97WS5qZQFYhCmRHw+ZczQWJzBpMl0tok+xNbo7IRZ/9PKj6bBH0GW7WmZ5SvMpEgaSCsRS7bYKTP8q4YG/qqmJhW0BVZdyALB2bOxatPP4GzJ/UKJMADY7+XFcGzECyC2CDmjJIUQ6nkvcGXY2YMFMI/puHa7paJvG9JzjbLk7bp+eEGlzO4Jz1OefMRPhjang2i+AL4suxekfMvYGAmA5fsRRulWgTx5wkwUFTORjsWwMGI/yXE8ny2wbL6Spm4bbm30BE9X0BLeAxmpuEJla5LNyYOi9MIZmC4FRQsilwRlC5MDxEn0Rnrd6QzGEDxG/ggaF3hjfQxBc1wzp9yTHA1BH8vSa1KGHKAH/XHnsswD29oGvm+wWLKoAO/YQMAFmtP1oZtiJ896TgWMtlDo0+wbNHW+jX6Mv1CynwWz8+RYkyy4c5JSWVt7y94BCwP6sEiYABOYuobWKqG+ZWqaEIdjY1vMvpHMoXzhD5P2SCzmc5L0CfeBVm+IrmR9f8mEwsHCkH6ogNINhc61XLhwu46dZDZXCnFqk1UyyPI3BF0WJVPW3gGrwzfC3iFt1yCOz/FurQW3DmLJDSTIGNxumxtBI+MOslatnjlRefu2ycTsYZdyQsGnQcI/N9eou0CDMu31eGH7YY18gdQVXg4FPVa3hzSoEeLjjDKj1e5lh7khMwp8vnlsTLQJ48vpbmGwHDfglu9bQz0sJ4wXuj/6hxJyFmYm7Z/y47dK6J5QwJ6Etql9QV/7vWZVWyJn56e6nUohgkZMd2eg5kutkbhkFOiT6I2MokLOancUFskTXa+iI5Xi+1l6TgIhu13CxB3OLgmJZzcnEHLCKHriLcPh7E+bwEiQLKfFUl9/QXX2bY+HZY+RZoGxIFkPeP5EZaeG4Gl4ygjefWSJGiGW4rhCQDA5hzvWidampmQmLfZiXNcmULf7x4UJTmUSxu4ih+yNg7HcPzbWL3e4TJZjODaTxsKsxsk/sTMZriBH6e+N44ycl9HPhKa6LUxF1sOgeYzFsE0uHOuCqCVCoBKR8ud0wWJCGA6HchWnrenk5F5dd5coCOUsIWhyZ8SWHfiT6L10Q2OaoZtaViCUKmFIBQIeYuq6qmwUKEivV4novgxFROilUj51VOJ0LgmkqmpfaOdtXWpv5yU/e9LjmVoUpcwESkZUJGVzKBUwqpnJuWRew0Td76PWCZgjwGf05mExl4P+D9FZKQpFPJtsKvIYjIStK/trdSk4/myo0CUaskxOWg+2+OQuV7gxYGSQXdFovDTPbMMLklxO0oy+ADNLy6MOWCpVNwkfKR3QW5BWTLXR6JgooVOJok6xTQFL0TIytV7BBpxFxaUevZDP6eEmZZ7CkwomfT8t12B1hPZQ2QkuoHSe13eGhLJn77ldGTFrRxNJcpQw9h5Dcs8uKUjfZ89EHdX+shi8RP3G5co++MTRE1vAgAwMwGVbUlB5WUdlXpwW7W9gK/jDhQyyBY5G6T4G6vkrw2Fr7aK6uhAS3i02kVUJBZd+fN8Cf6WQKhOMMaJRmWVgjMgpoVmcx7KKqOAHEkEqGckAzenPKSpz+54OZbUMZmTM3mzHgu1EkjndYNR0wIRUTZZkBEGIRFUHLAd4PjFGHc61pHte3jmrhb5WHQMALZxklXBgobPKdgJG4tzBWtFe6ON0yZRwUNHARpxZAarMf7wB0JL0AWngtRn95cd29r9x+uljZadDJygBt6Inxj/OxhnJDfgPyQKckizHAck1uFWyAvskN+MRyUU8drHeLw4fk1yGD0kuv7BHeXD0ovxFthgLL9176+Tunn8cTLv0XxDuzCjjgBeDJYkJu9nwD5HDAKU3ERsVf83dS9/g1q87/YqeAAxqcPziQ2rYaHFRTXeCW+JXgcdxPTlQlIKNeFaYS/x4gAJ2wlc52R8jaZJ9Uu5pHR9vqtVHE5cHLEQb3rdAH//fi92VEyCU9qOZbVRgQHqIE2F9zJOgiqp1ztoG+6m79W0jRwKqwDWvr3A69UoNiQFPMLN2V+qdV69WdycdOkGLWdLuD/EtLCJA+os0ShBY4J8264fWCXC0n8Vy7HVg4kHB2ruXV0PGJzPNtaumJmmai24uiXLgTeFSmRGUbd084x4DSqAocdPJAZruwjVLY3kxpqXAynonbblNT7WwqPTi5wyHDwe6fL54eXPrbP4gTIdt6M039UV7izYdWAzIYuQqrzfXHFA3U4/1Bi41qvwwlDSWHdImHR/4fmTb4QXHVrEcVLh+BaA6Qu5YOn70UO5qze81tMyoil6BCSEOwvGv+YGr1JVlgB8F7McCWaDeGsbp/LExw1+IhOLI+bGhDx0tGTIc8hBK6x1rxi5IzPYxwQXg6NuUuzyscl2Ezv8HunDOGrzgrVrcw1dQ90dsJgLoMAfdv6vCsnpuNaUN5VKpzh2JmIXjtO31KdhpICTZqG7aRnnRD/vbcPx3ygPZhgJTqaSSL/aPYvzzD0zwiozbvS2r3oLzb9zkdg844mColtuEwogdYtzfdIJyAeSMmmoHf+Zo14LyzFuYVYWW4HPV1Gns9uChiA01IiYQ1MfmoKoiUm1r0wVZ5Tzd/c4REOgYeP5id2H1sPOs3IS6rUHXv6N4jWrEUD2PhBADwQ4jjB2IOEGSJkxI0Gl1OoUAVwtI7gqAdiqUvloCHTL0+EmT5Hi/nmwxIrzkoPA93ymriz9PdPUC9odCTRKZ7+tvaDgKvWA2O1dWNuQMveCFHF8pAmSgpqg+6LtjHNQqdqS8s1kYmf9M93Xhv3AYLLgQzLOQSaf5zxCrZQSpKmHxaRGgr7Exd9r4B7JMGUw9ZBx/22IKml/79MRTI771rH1xVKrNosWHu97744i/+aYf00oFT75ZLv30zEubXlcvzJhzDs/PbhiHw2CQWxgQQhGmkwmO+lGOMlHmHIZCiJXjMqEGnrs4QHDCgPDMvEU+YuPkTdHjOWpuNCHfmedYJSDPX/yMRXqQwLBDCJ6wbtzKVccpHhJCjam6deOOrTyy+FE0dXVTmIh5q/t7hCeTvvshx0qC8G20YrGSv/fwFDcNhAfQ7JPp2SYjjoPI322h7PnqoegkQALKfGRjNThuKa9Z7AYBWzU6fKz7/n8a6MlBDuf6KY/TIZJzgK2mJkaJ0Xg16jtozE6PYmi3Ylgt3ERAvSGKm1L5bDXs/AfAIr/SKoNwslR1ZGiUq2kZ6pCxJ8Dy1GAtS/B2UOhGIJ8zyY0egOyQgpecmsEVHYSv4h+HtuQLW2C3z0UPzy6z9NYlgtptkU1bjyPUni4eKZpobuBeYJpgNgKDwO25ot2DsXsx18HbtySt7FrY764HtzaklAhsrvdgGLj/EKRMqeYPHVwNCaFVJW6P2liIvQX6yCcPobk89JMQ96eKg8AUh02hMJnmQEwukE8tT4vcH4LZHBylUvT2VyUS+pziEi5DmAnrtrqT1em9CucdKWxWgw9awxO0IJjxkGCEaT/GNCMk8GAGoZ52fit69IGwJp5EKCnsRIqAPaBIiBGlnWGq1zwHbVutLDDEq6pAjxauWICLNJfkcDlBDqNCS5w90vrTDq5WWjmc6+9hY1h1x087HgZRJoUdrmnjcAMSOR7ffWDCCH6mpB21c/YNDEM8WKra5fkfp2fR5dmKcrFZPb66Om3dYSJczDxMsCwwqjwHVWVr1bdGeyE5pnt61V0EzZ1TpPBigJenAkOAHBl4jYvbpmma+1Qzo50oMaTwwREgRUI8iupCQeYGyGGWKEFU4Mj1YzIFirP8aYI/9fsEpeQfJZBDoMBJnCizfV5i0P0ZCK2Hv2/5PLptKAboQO+k3lr/e0yf5Y3w1oKwgOyN6hOBZiNgpNO5LvCFtpc9cMCRysUJlNdpBNKR9xvWlrySZIX+nzDwa6rgeheARGB6OFYciEOcMXfbwouGlENuZ6M8eSSpp5Dp2wrj7Jccs/yZ3r64pvjCLASRMab0GiH72BkEbHVfqjwabQMxCZDPL3xwW7Diypnoo4dxNoSTHmqigg5P0WffcPi0XCi4jlRmmg/Yt1jqaEnHWzyR4AYWZOGZSOg9jxWRKMFkxSn0D7kWsFPw1i6beTD3/IAmMH7efzcFSWNggvcIfZp792A4TKEWDRq9kCWBI1oiRbFKwFNJkEqqGhA2qT+zHu7gNSezmuH1kNuL5/P596QlQXUmNbOsdtaMIyXMkuEcYZiUSrmtxlB9tCUiOnoDZWciEAIWyKH47e2+SFn/pY5kdjZuUpoI76gBWXJCoCR0StmODnDl5x1lsuU5tO5ED0Y0QQVP2kE/nJimmZFgUTMno7IIUh5TG8HrSOlDlhP9g6xdvODJm9PHQ3FOV7dRaKyLF7suQmNdbIzzvv/YNbAF7QobWPb6+gu4JMgqF6zItZaFYkNJgmg3Wsi51to+Tc4PoyQkKLRfuK0oEMYLN1Rsf3S7mQC2OQ/u/q8KvcdqACjokcnFRMJ0LWibMzuP6R0sktSv9wg/BiH8yLUzjWMbjor9PPMnAjT+FbQm8GPry9Lt2mgfY8dhOzxppyo75ZSe+ujx2ozmkw4xRLW446LukGahat3zFDkK5Dn/CcvC0ItO41dieqSeWIxfkLm4sjMfA5LuuMgW+evUBaGfB8CChkSidYUjeuRy6rb6ZNCxKUQQ9YquL9RKzz3bdChHccY4fTpMi03M+nw7s+vtKlGP1esdguTEKbCh8WVRJoIomGBCCdz6/D53Cv1DjtEJkUm02xmabnjjyOHOo2lJMyQAfiEdCrcRoXRNAhlaNNNaZMMLNd5o9a2TgrRk/dyspCsQK5E/qAp+JGKg53iQuAJ9Rk1gXv2wGC3kCVUQnyLgyAmIjR2pEqsKJxS9tPu2io9dzbF1KRI5RRtPUgKBRcR3AVAqY1rKNK/OP4jWzrvv570nK++KrLpPii3crLaFZl9mt/s07cv4Zxb165dRIrl3T7ivkT+RQ9rwtFYd1YRQa3SnfhFWAbqTQ99UD4fR3irqtr5UHtuymzpJmS+Gjne2F0bhieSJ/Z6c/FlFCoRmidbrKZ+Cw4K6reWkJbn9U7NI+6KtcgsGNk1N34IkM6ZUbW3X0Vmj4IYw8A8PzqhJCTARs3WGxGHWvbzXnVag4bpv8Xff3nyyTS6AxQtU8Jj0rPNnFbfvszz93v/9jWl5BCXu/NmcG/zI8ZZb7l4DOXn87kOhvwAEaPz/u5MIHz4V//uU4gDw6xu/uFvv/4kZ1nWX/wGeAioCAlo/QKO+whsb18DqccDtu5AyMpqI6xkwLKR+a9zX54RNRFXjtCzvTVXPqLYPJR46/Clr8c+q3GWLay6gK2uITWBqDeiJy9In3NfqJQ0SVY2N0Dh50FMbWS/UNbL4qd0nDYdUyQQXgkaocYPUhgBzXuC/qDKXYYJ2nLB5yqjnfS31YhiyXu5mENs44Xto+1xxo9JC5+crOUaV3yjWdyyCT7ik2GdIV61Bxa4xAtpWMmER0WtEumGdxtJD1u8rDvkly1GtUGrtxIpT8NRa8llHLBxvqmm285P/R6feu7BaQ7F62NoWY+kjf6+qWCmSczmtCCCyIqnFP/N+iXuvCz6hifkp7i3F4lWyqWGf8tZgofpTSnSsZazWHZIHHvUGhayKMqt9ZH+7Zu0QKLOtymm/y2r15rS3sh5dQ5htN7yCf2A3rIKzsAeqtb0It+PYQmpaWg/jISUeqd1ptsh2+hBWKblcgovwAKpqr7Xa1T2Zk4HWx82yBdAyw0YWFpqSJa1cZNP88o0nMAteN62ueQpv9urJsiya0bCb7easzPIxt+X7mMTZ5ce36eoXhQ2AKdDmBMzTyIpKVNOHGmqygVDS9KbMfC/eNr82CYUuR1AynpcVRvzTZVctlkRTRBuV1BQxUFTCF3gN1wIb4M7FUebe28vqBvVzIpsVrBz8M8f/eUkTpvJ2QmQdpK0OAfW1STkhplaY1TYkt2ZZpcjc2iildliQxh2mdplUDppQforKO0BS9RJX/pJa7cvgm0KqLUyq9pZzs6o6kH/AplywkaYxNcq5xOeHE+MtE8b8shNHSJq80lI0yqF3t2Qlq9KdjWYHr+uYB+VdLoveAVB4EAS+u+yvc0VWQQK+6cz1btTkWXWLJulYQa1lzwf4wNoG8AjZzlwSwJdVxxh42+Zhw4djFOtNqtyOMMsDtwIXApsC5wOPAd9tkUrSCukhqzqlDcCv3UG0Dx/Tls2y2xlsqxWZfLH+3zv1E54QlBFiicRioFusmpkVY88jmhDA3VH0zUiUTc2ENJnNFI+Km2nmOZoZ3nqbWeaeq9IIlw9ABImDaHbH2dnsQSGneTiR9DGeMRPodeZc3KwmE9s8Aiey2ZucptmHiHfzSKas1FE4jZs1JETgtzdwrOWWmS3ZeKlzuqUWmWs4tRSpJnehhWJNK01duSzz+Dd1dpBbIkjmVl2ptL/lWpWk1amZjcssMiEcktQ0Uyfa9RZYKDV09DIdZeE6J9l08xB6k6tvih/5cleXW26eZPPr+mSpkkML9cdHdQt6VlpgvD1IbqVhIlvnAmmiZYtFq84fLQrNV1Jz4zFyw422QGpqOuZNcujxMVedwyiu5SjNoblIU4XfF3Z0bLMx2icWkNTGVVYm3ankydnpTZkVdd40SVAjenq5xS4217PTT1quYstTm1RJlbcwhi+UZg43c4sfc/dUl91Rd0WYT3NG3F7b7AMFDqmMAMLeHJVOq3XL3KvoSUJhf4/AIRgcJRnkFANU6s1Toy45KL5on25w5nLZPklD+/1wdScl/nPbvym9XJ8KhnFLmoz7RfwkeXSnGW7+lfzsW83TAr/a4b677mXDxfz012fImAkVnOGVjdqIMcm7j9LCuo3U6IGHFibiqn4SRjVvhO9vUsWKG13CGJ/8FW6YsOHC+6GiiAItssTSkCwOOYpky5TkiWiCQtcq2HI6IWEI9aMVUqwMM1bsOMYLCzeeCUmOb6JHMiKQJlX6BbikhONscekm//UFkiL6zUyRGekFhN3nkdZY64gsq6xObnnJy/ebqSkQZVoKU4hOUcW2mh5lJWLk5rvU1smWk0sASprRrxXb8+J2Id6fPl/iT1JCnwU/sC8+Ethgt40hGFIwYszko9u2LXrp70JQkvSxovo/1r+nTpP2A+FeveEiAHpUrtzXASAaWuKf9v+voqnmWmotQYh2jK2jxCTG0kg0i117S5UuU1vtdWD9Q26m98aROeuczemsq+56VDtPhFHldzdcT2999Bk4xbJ/WLnmokt+cZI1G0pSbdpd8LPZf1OuvwSONNre9rVfKX9+9HJPnnwF1jukOGON22JTJjrYpL8z1d8JVjS8WPESJUuVvhQh+tfz+utcjOKkLw1ZTq5U+304QGaJwiUk0yiruqHpd6QQJVlRNd0wLdtxPVw8fAJCImISUjJyOEXIciIVgpqGlo6egZGJmYWVjZ2Dk4ubR5b0j1it6nZn1/C4NmlWlPq4rFRpgGxhiTJG2ToeetRToto5LEMpQUbJYhu1QBXkXKpSdZQSEmR/RAmeHcyy6+GzH7Duei5gqY04vSMCLwdWxwxW6ZEt8zVr2RIeOZJ+M/I2QspSedYkrHIjTS20Mc9/Zum/2S/r/az9B1EC3vsvrsCHOkOilYNPYxz+dAQUFcgDLepcwFIbS2KxjTw/oARf/u/qU29pi092v3Sm36A67m9dCOkeiR7CCHwr6u6wgorKOwrwveco6yrDnTCs96L0Q/15gnRCAfu6lhK1KtbGonWUAWmLAzNTw+Z8QFnXgfCTj93EJqX4WaAy+TPxo2VnD2A5NJ5tVQ8iGKzPFJT2MGy7xOKuK98e+QkU7CZosEfMKs9LDo6joiKfaq0V+11mKS5VgUsq93xMa+B8rM0zO7JKSlUsw50wuB5hpMgnSHD79z7Gj9SBXcJ/n8Xl4R+gsjePD+dA5Sh0XX5LqOdFrBNzykr25oI+G2WPchpln6zNeuNs85GU2tX7ogvvLe26DiGqXUwtD/L5ysTXwYYyERUuShF8tmv0OGg0zZhJRIZRdLfoD78W+zPuDWvU7ppRoz5cDRsLcxAJYeNGA7ZJNOQfd3bdzBbFIkdjS6glx7Sap15IWRI0+ijJyWZ5fHFWZm1vfBW8l9fGnAYfWZ70T7L037Det+ZSkdwH1fGh1zek5KETbdPitrJgFXYnB9+Yj3f1KppB+xqqoyH4OfM98WgNxtfg+6SoHH0+yhxwFRyrtNaOIxSLKTqY9/iQItH6xWI6hbXV949G7kPeWZt5+1bZ5icZH6rHSqmsfV1E7va8k7dxF3gQUM+jxqWeR8OQ+j5FIorFNAzpGpjkw16dgLVZOtft1/642TsNu/IYrtyLWz4MluTBFgCFcOVe5DgwRYQB7FzY5RIGjBMH6J55AK31xR9AgubfJqjAvQMwaD86bAFQCDNoHAAE7BQwAAAHAKB7AFrAH0CCCjwFDXKPTf1x496Mcbg/P+OUuMeTyIvT2YPyKw1eCGLlyBnCVH5qt97tGqQHRJ55RSOfKMO7VImG6ER4ueib7o9ZHGjvqzD9T9csjVo2Lkq3nMBzHnA7Zq3g6XGTV9Rt2UT9cteBDg1Exj0MUseiifsaVhyzapLUtR+MBh6WGMsmmkKQPOabYbXOv7G6fPSyW9PFtmKlTFhTPkX/qXBm7aJu7LrW6Bn7XuRk8sT2p8B7smynMe6xr/vZRM4Rn8+lZ/EqqvCkob7UmTeIl+TYTmK7Co5HYTfuDeFZ6+DP9utwr7Pqm1jGfsKzl6vam0jBjqqhxjrz5lD+Z7+wyeNjCwAA",
  jetbrainsMono: "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"
};

// cth/shared/releaseDrop.ts
var FRAME_FONT_CSS = `
  @font-face {
    font-family: 'Inter';
    font-style: normal;
    font-weight: 400 700;
    font-display: swap;
    src: url(data:font/woff2;base64,${DROP_FONT_WOFF2_BASE64.inter}) format('woff2');
  }
  @font-face {
    font-family: 'JetBrains Mono';
    font-style: normal;
    font-weight: 400 700;
    font-display: swap;
    src: url(data:font/woff2;base64,${DROP_FONT_WOFF2_BASE64.jetbrainsMono}) format('woff2');
  }
`;
var DEFAULT_DROP_HTML = `<style>
  html, body { height: 100%; }
  body { overflow: hidden; }
  .stage { height: 100%; }
  .pg { position: absolute; opacity: 0; pointer-events: none; }

  .page { display: none; height: 100%; flex-direction: column;
          padding: clamp(24px, 4vw, 46px); }
  #pg1:checked ~ .stage .p1,
  #pg2:checked ~ .stage .p2,
  #pg3:checked ~ .stage .p3,
  #pg4:checked ~ .stage .p4,
  #pg5:checked ~ .stage .p5,
  #pg6:checked ~ .stage .p6 { display: flex; animation: rise .34s cubic-bezier(.2,.7,.3,1) both; }
  @keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

  .content { flex: 1; min-height: 0; overflow-y: auto; }
  .center { display: flex; flex-direction: column; justify-content: center; }
  .nav { flex-shrink: 0; display: flex; align-items: center; gap: 12px;
         padding-top: 16px; margin-top: 12px; border-top: 1px solid var(--line); }
  .dots { display: flex; gap: 7px; flex: 1; }
  .dot { width: 7px; height: 7px; border-radius: 999px; background: rgba(20,19,26,.16);
         cursor: pointer; transition: background .2s, transform .2s; }
  .dot:hover { background: rgba(20,19,26,.34); }
  .dot.on { background: var(--accent); transform: scale(1.25); }
  .btn { cursor: pointer; border-radius: 999px; font-size: 13.5px; font-weight: 600;
         padding: 9px 18px; border: 1px solid var(--line); color: var(--ink-soft);
         user-select: none; transition: background .16s, color .16s; }
  .btn:hover { background: rgba(20,19,26,.04); }
  .btn.primary { background: var(--ink); border-color: var(--ink); color: #FBFAF8; }
  .btn.primary:hover { background: #2a2733; }

  .kicker { font-size: 11.5px; font-weight: 700; letter-spacing: .14em;
            text-transform: uppercase; color: var(--accent); margin: 0 0 14px; }
  h1 { font-size: clamp(1.8rem, 4.4vw, 2.7rem); }
  .lede { margin-bottom: 1.4em; }
  .big { font-size: clamp(3.2rem, 10vw, 5.4rem); line-height: .92; letter-spacing: -.045em;
         font-weight: 700; margin: 0 0 .1em;
         background: linear-gradient(135deg, #14131A 20%, #1B7F5A 115%);
         -webkit-background-clip: text; background-clip: text; color: transparent; }
  .stat { display: flex; gap: 24px; flex-wrap: wrap; margin-top: 24px;
          padding-top: 18px; border-top: 1px solid var(--line); }
  .stat b { display: block; font-size: 1.5rem; letter-spacing: -.03em; font-weight: 680; }
  .stat span { font-size: 12px; color: var(--ink-soft); }

  .tag { display: inline-block; font-size: 10.5px; font-weight: 700; letter-spacing: .1em;
         text-transform: uppercase; color: var(--accent);
         background: rgba(27,127,90,.09); padding: 4px 9px; border-radius: 999px; }
  .quote { border-left: 2px solid var(--accent); padding-left: 15px; margin: 18px 0 0;
           color: var(--ink-soft); font-size: 14.5px; }
  .rows { list-style: none; padding: 0; margin: 0; }
  .rows li { display: grid; grid-template-columns: 96px 1fr; gap: 12px; align-items: baseline;
             padding: 7px 0; border-bottom: 1px solid var(--line); font-size: 13.5px; }
  .rows i { font-style: normal; font-size: 10px; font-weight: 700; letter-spacing: .09em;
            text-transform: uppercase; color: var(--ink-soft); }
  .rows b { font-weight: 620; }
  .rows p { margin: 1px 0 0; color: var(--ink-soft); font-size: 12.5px; }
  .card { border: 1px solid var(--line); border-radius: var(--radius); padding: 16px 18px; }
  .card h2 { margin: 10px 0 .2em; font-size: 1.15rem; }
  .card p { margin: 0; color: var(--ink-soft); font-size: 13.5px; }
  .split { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
  /* 16:10, not 4:3 \u2014 the taller ratio pushed the second row past the fold, and a
     drop page that scrolls cuts a sentence in half at the boundary. */
  .split .placeholder { aspect-ratio: 16 / 10; }
</style>

<input class="pg" type="radio" name="pg" id="pg1" checked>
<input class="pg" type="radio" name="pg" id="pg2">
<input class="pg" type="radio" name="pg" id="pg3">
<input class="pg" type="radio" name="pg" id="pg4">
<input class="pg" type="radio" name="pg" id="pg5">
<input class="pg" type="radio" name="pg" id="pg6">

<div class="stage">

  <section class="page p1">
    <div class="content center">
      <p class="kicker">Munder Difflin</p>
      <h1 class="big">0.4.4</h1>
      <p class="lede" style="font-size:clamp(1.05rem,2.1vw,1.3rem);margin-top:.5em">
        The release where Windows finally joined the floor \u2014 and the first run
        stopped quietly failing.
      </p>
      <div class="stat">
        <div><b>27</b><span>fixes</span></div>
        <div><b>4</b><span>new surfaces</span></div>
        <div><b>1</b><span>platform unbroken</span></div>
      </div>
    </div>
    <div class="nav">
      <div class="dots">
        <label class="dot on" for="pg1"></label><label class="dot" for="pg2"></label>
        <label class="dot" for="pg3"></label><label class="dot" for="pg4"></label>
        <label class="dot" for="pg5"></label><label class="dot" for="pg6"></label>
      </div>
      <label class="btn primary" for="pg2">Start &rarr;</label>
    </div>
  </section>

  <section class="page p2">
    <div class="content">
      <p class="kicker">The headline</p>
      <h1>Agents can talk to each other on Windows.</h1>
      <p class="lede">Roughly half of all downloads run on Windows, where
      agent-to-agent messaging had never worked at all.</p>
      <div class="placeholder" data-label="Two agents messaging" style="aspect-ratio:24/9"></div>
      <p class="quote">Every agent booted, rendered, and looked completely healthy.
      None of them had been told they had an inbox.</p>
      <p style="margin-top:16px;color:var(--ink-soft);font-size:14px">Any CLI that is
      not an .exe was launched through cmd.exe, which cuts a multi-line argument at
      its first newline \u2014 taking the protocol block with it. Spawns now launch the
      real interpreter with an argument array, so the whole prompt survives.</p>
    </div>
    <div class="nav">
      <div class="dots">
        <label class="dot" for="pg1"></label><label class="dot on" for="pg2"></label>
        <label class="dot" for="pg3"></label><label class="dot" for="pg4"></label>
        <label class="dot" for="pg5"></label><label class="dot" for="pg6"></label>
      </div>
      <label class="btn" for="pg1">&larr; Back</label>
      <label class="btn primary" for="pg3">Next &rarr;</label>
    </div>
  </section>

  <section class="page p3">
    <div class="content">
      <p class="kicker">The first five minutes</p>
      <h1>Setup finishes. The floor wakes up.</h1>
      <p class="lede">Four separate bugs sat on the very first thing a new user does.</p>
      <ul class="rows">
        <li><i>Wizard</i><div><b>The suggested folder works</b>
          <p>Accepting ~/HarnessAgents stored a literal tilde and died on ENOENT.
          It now resolves to a real path \u2014 and the field actually suggests it.</p></div></li>
        <li><i>Wizard</i><div><b>It tells you at step one</b>
          <p>An empty folder used to walk you through all four steps before bouncing
          you back. The panel no longer overflows a short screen either.</p></div></li>
        <li><i>Hive</i><div><b>Services start at setup, not next launch</b>
          <p>On a fresh install the message router, hooks and telemetry stayed dead
          until you restarted \u2014 so mail never moved and agents never reported.</p></div></li>
        <li><i>Agents</i><div><b>Restart &amp; Continue has something to resume</b>
          <p>The live session id is recorded from a second source, so continuing
          works even when a hook never lands.</p></div></li>
      </ul>
    </div>
    <div class="nav">
      <div class="dots">
        <label class="dot" for="pg1"></label><label class="dot" for="pg2"></label>
        <label class="dot on" for="pg3"></label><label class="dot" for="pg4"></label>
        <label class="dot" for="pg5"></label><label class="dot" for="pg6"></label>
      </div>
      <label class="btn" for="pg2">&larr; Back</label>
      <label class="btn primary" for="pg4">Next &rarr;</label>
    </div>
  </section>

  <section class="page p4">
    <div class="content">
      <p class="kicker">New</p>
      <h1>Four things that were not here before.</h1>
      <div class="split">
        <div class="card">
          <span class="tag">Skills</span>
          <h2>Every skill your agents can use</h2>
          <p>What is installed across Claude Code, OpenCode and Codex \u2014 and a
          browsable catalog of 227 more, with search, filters, install and
          uninstall.</p>
        </div>
        <div class="card">
          <span class="tag">Prerequisites</span>
          <h2>Whether you actually have the tools</h2>
          <p>MemPalace, uv, git and every agent engine, with live status and where
          each one sits on disk. One button asks Michael to fill in the gaps.</p>
        </div>
        <div class="card">
          <span class="tag">Release drops</span>
          <h2>This page</h2>
          <p>Update notes used to be three clipped bullets in the corner. A release
          can now carry its own designed page, and you are reading the first one.</p>
        </div>
        <div class="card">
          <span class="tag">Dark mode</span>
          <h2>Rebuilt for reading</h2>
          <p>Every control border measured under 2:1 against its background, so the
          edges defining them were invisible. Re-tuned and measured, not eyeballed.</p>
        </div>
      </div>
    <div class="nav">
      <div class="dots">
        <label class="dot" for="pg1"></label><label class="dot" for="pg2"></label>
        <label class="dot" for="pg3"></label><label class="dot on" for="pg4"></label>
        <label class="dot" for="pg5"></label><label class="dot" for="pg6"></label>
      </div>
      <label class="btn" for="pg3">&larr; Back</label>
      <label class="btn primary" for="pg5">Next &rarr;</label>
    </div>
  </section>

  <section class="page p5">
    <div class="content">
      <p class="kicker">Everything else</p>
      <h1>The rest of the list.</h1>
      <ul class="rows">
        <li><i>Terminal</i><div><b>Copy comes back clean</b>
          <p>The quote rail is stripped and terminals run in UTF-8, so an em dash
          survives the trip to another app.</p></div></li>
        <li><i>Terminal</i><div><b>Dictation pastes what you just said</b></div></li>
        <li><i>IDE</i><div><b>Images open as images</b>
          <p>PNG, SVG and embedded screenshots render. The title names the agent.</p></div></li>
        <li><i>Agents</i><div><b>Restart &amp; Continue revives a dead agent</b></div></li>
        <li><i>Agents</i><div><b>Grok 4.6 in the model picker</b></div></li>
        <li><i>Agents</i><div><b>OpenCode runs the model you actually have</b></div></li>
        <li><i>Board</i><div><b>Task cards stop going missing</b></div></li>
        <li><i>Hive</i><div><b>A wake nudge survives an odd message id</b></div></li>
        <li><i>Hive</i><div><b>Compact fires once, not every hour</b></div></li>
        <li><i>Hive</i><div><b>The cost ledger is out of your git history</b></div></li>
        <li><i>Office</i><div><b>The floor stops rendering when nobody is looking</b></div></li>
        <li><i>Layout</i><div><b>Michael sits first on the dock again</b></div></li>
      </ul>
    </div>
    <div class="nav">
      <div class="dots">
        <label class="dot" for="pg1"></label><label class="dot" for="pg2"></label>
        <label class="dot" for="pg3"></label><label class="dot" for="pg4"></label>
        <label class="dot on" for="pg5"></label><label class="dot" for="pg6"></label>
      </div>
      <label class="btn" for="pg4">&larr; Back</label>
      <label class="btn primary" for="pg6">Next &rarr;</label>
    </div>
  </section>

  <section class="page p6">
    <div class="content center">
      <p class="kicker">One last thing</p>
      <h1 style="font-size:clamp(1.9rem,4.6vw,2.9rem)">Thank you for running this
      on your own machine.</h1>
      <p class="lede" style="margin-top:.4em">Every agent here starts on your
      hardware, in your folders, under your keys. Nothing about that changes.</p>
      <p class="quote">If it has been useful, a star is the entire marketing budget.
      The button is just below this page.</p>
    </div>
    <div class="nav">
      <div class="dots">
        <label class="dot" for="pg1"></label><label class="dot" for="pg2"></label>
        <label class="dot" for="pg3"></label><label class="dot" for="pg4"></label>
        <label class="dot" for="pg5"></label><label class="dot on" for="pg6"></label>
      </div>
      <label class="btn" for="pg5">&larr; Back</label>
      <label class="btn" for="pg1">Start over</label>
    </div>
  </section>

</div>`;

// cth/shared/updateState.ts
var REPO = "chaitanyagiri/munder-difflin";
function installerUrl(version, platform, arch) {
  const v = version.replace(/^v/, "");
  const file = platform === "darwin" ? `Munder-Difflin-${v}-mac-${arch}.dmg` : platform === "win32" ? `Munder-Difflin-${v}-win-x64-setup.exe` : `Munder-Difflin-${v}-linux-x86_64.AppImage`;
  return `https://github.com/${REPO}/releases/download/v${v}/${file}`;
}
function parseVersion(v) {
  const m = String(v ?? "").trim().replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
function isNewer(candidate, current) {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}
function shouldShowReleaseDrop(previous, current) {
  if (previous === current) return false;
  if (previous === null) return true;
  return !isNewer(previous, current);
}
function clampPercent(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
function rank(s) {
  switch (s.state) {
    case "idle":
      return 0;
    case "checking":
      return 1;
    case "not-available":
      return 1;
    case "error":
      return 1;
    case "just-updated":
      return 1;
    case "available-manual":
      return 2;
    case "available":
      return 3;
    case "downloading":
      return 4;
    case "downloaded":
      return 5;
  }
}
function versionOf(s) {
  return "version" in s ? s.version : null;
}
function reduceStatus(prev, next) {
  if (!prev) return next;
  const pv = versionOf(prev);
  const nv = versionOf(next);
  if (pv && nv && isNewer(nv, pv)) return next;
  if (pv && nv && pv !== nv) return next;
  return rank(next) >= rank(prev) ? next : prev;
}

// cth/main/updater.ts
var REPO2 = "chaitanyagiri/munder-difflin";
var CHECK_INTERVAL_MS = 6 * 60 * 60 * 1e3;
var FALLBACK_CACHE_MS = 60 * 60 * 1e3;
var sendTo = null;
var started = false;
var lastFallbackCheck = 0;
var lastStatus = null;
var pendingRestart = null;
function abortPendingRestart() {
  if (!pendingRestart) return;
  const resolve4 = pendingRestart;
  pendingRestart = null;
  logLine("quitAndInstall cancelled by the user at the quit warning");
  resolve4({ ok: false, error: "cancelled" });
}
function failPendingRestart(error) {
  if (!pendingRestart) return;
  const resolve4 = pendingRestart;
  pendingRestart = null;
  resolve4({ ok: false, error });
}
function logLine(msg) {
  const line = `[${(/* @__PURE__ */ new Date()).toISOString()}] ${msg}
`;
  console.log("[updater]", msg);
  try {
    const dir = import_electron2.app.getPath("userData");
    (0, import_node_fs4.mkdirSync)(dir, { recursive: true });
    (0, import_node_fs4.appendFileSync)((0, import_node_path4.join)(dir, "updater.log"), line);
  } catch {
  }
}
function emit(status) {
  lastStatus = reduceStatus(lastStatus, status);
  try {
    sendTo?.()?.send("update:status", lastStatus);
  } catch {
  }
}
function autoUpdateEnabled() {
  try {
    return readConfig().autoUpdate !== false;
  } catch {
    return true;
  }
}
var autoUpdaterPromise = null;
async function loadAutoUpdater() {
  autoUpdaterPromise ??= (async () => {
    const ns = await import("electron-updater");
    const found = ns.autoUpdater ?? ns.default?.autoUpdater;
    if (!found) throw new Error("electron-updater loaded but exposes no `autoUpdater` export");
    return found;
  })();
  try {
    return await autoUpdaterPromise;
  } catch (e) {
    autoUpdaterPromise = null;
    throw e;
  }
}
function errText(e) {
  const m = e instanceof Error ? e.message : String(e);
  return m.length > 300 ? `${m.slice(0, 300)}\u2026` : m;
}
function pickDownloadAsset(assets, platform = process.platform, arch = process.arch) {
  if (!Array.isArray(assets)) return null;
  const want = platform === "darwin" ? new RegExp(`-mac-${arch}\\.dmg$`) : platform === "win32" ? /-win-x64-setup\.exe$/ : platform === "linux" ? /-linux-x86_64\.AppImage$/ : null;
  if (!want) return null;
  const hit = assets.find((a) => typeof a.name === "string" && want.test(a.name) && typeof a.browser_download_url === "string");
  return hit?.browser_download_url ?? null;
}
function fetchReleaseBody(version, done) {
  try {
    const req = (0, import_node_https.request)(
      {
        hostname: "api.github.com",
        path: `/repos/${REPO2}/releases/tags/v${version}`,
        method: "GET",
        headers: { "User-Agent": "munder-difflin-updater", Accept: "application/vnd.github+json" },
        timeout: 1e4
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (d) => {
          body += d;
          if (body.length > 262144) req.destroy();
        });
        res.on("end", () => {
          try {
            const rel = JSON.parse(body);
            done(typeof rel.body === "string" ? rel.body : void 0);
          } catch {
            done(void 0);
          }
        });
      }
    );
    req.on("error", () => done(void 0));
    req.on("timeout", () => {
      req.destroy();
      done(void 0);
    });
    req.end();
  } catch {
    done(void 0);
  }
}
function fallbackCheck(reason, force = false) {
  const now = Date.now();
  if (!force && now - lastFallbackCheck < FALLBACK_CACHE_MS) return;
  lastFallbackCheck = now;
  try {
    const req = (0, import_node_https.request)(
      {
        hostname: "api.github.com",
        path: `/repos/${REPO2}/releases/latest`,
        method: "GET",
        headers: { "User-Agent": "munder-difflin-updater", Accept: "application/vnd.github+json" },
        timeout: 1e4
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (d) => {
          body += d;
          if (body.length > 262144) req.destroy();
        });
        res.on("end", () => {
          try {
            const rel = JSON.parse(body);
            const tag = rel.tag_name ?? "";
            if (tag && isNewer(tag, import_electron2.app.getVersion())) {
              emit({
                state: "available-manual",
                version: tag.replace(/^v/, ""),
                url: rel.html_url ?? `https://github.com/${REPO2}/releases/latest`,
                reason,
                downloadUrl: pickDownloadAsset(rel.assets) ?? void 0,
                // Already in the response we just parsed — carrying it costs
                // nothing and lets the notify-only toast show "What's new" too.
                // NOT a new request: see TELEMETRY.md, this app never adds one.
                notes: typeof rel.body === "string" ? rel.body : void 0
              });
            }
          } catch {
          }
        });
      }
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => {
    });
    req.end();
  } catch {
  }
}
var CHECK_TIMEOUT_MS = 3e4;
function withTimeout(p, ms, label) {
  return new Promise((resolve4, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1e3)}s`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve4(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}
async function runCheck() {
  emit({ state: "checking" });
  try {
    const result = await withTimeout(
      loadAutoUpdater().then((autoUpdater) => autoUpdater.checkForUpdates()),
      CHECK_TIMEOUT_MS,
      "update check"
    );
    if (!result || !isNewer(result.updateInfo.version, import_electron2.app.getVersion())) {
      emit({ state: "not-available" });
    }
    return { ok: true };
  } catch (e) {
    const message = errText(e);
    logLine(`native check failed: ${message}`);
    emit({ state: "error", message });
    fallbackCheck(message);
    return { ok: false, error: message };
  }
}
async function runDownload() {
  try {
    const autoUpdater = await loadAutoUpdater();
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (e) {
    const message = errText(e);
    logLine(`download failed: ${message}`);
    emit({ state: "error", message });
    fallbackCheck(message);
    return { ok: false, error: message };
  }
}
var SIMULATED_NOTES = `# Munder Difflin v9.9.9

**A local hive of Claude Code, Antigravity, Codex, Grok & Copilot agents that run themselves** \u2014
messaging, routing, and remembering, coordinated by your clone, Michael, who you talk to.

---

## What's new in 9.9.9 \u2014 *simulated release*

**On Windows, agents were never told they could message each other.** They started, rendered, and
looked perfectly healthy \u2014 but a multi-line prompt handed to a CLI through \`cmd.exe\` is cut off at
its first newline.

- **Agent-to-agent messaging works on Windows.** Prompt-carrying spawns now run the CLI's real
  interpreter directly instead of routing through \`cmd.exe\`, so the whole protocol survives.
- **Setup can finish again.** Accepting the suggested \`~/HarnessAgents\` folder wrote a literal
  \`~\`, and the wizard then died on \`ENOENT: mkdir '~/HarnessAgents'\`.
- **Copying from a terminal is clean.** The Edit menu was intercepting \u2318C before the terminal saw it.
- **Agent terminals are UTF-8.** They ran with no locale at all.`;
function initAutoUpdater(getWebContents) {
  sendTo = getWebContents;
  import_electron2.ipcMain.handle("update:restartAndInstall", async () => {
    if (pendingRestart) return { ok: false, error: "a restart is already in progress" };
    try {
      const autoUpdater = await loadAutoUpdater();
      logLine("quitAndInstall requested by the user");
      const cancelled = new Promise((resolve4) => {
        pendingRestart = resolve4;
      });
      autoUpdater.quitAndInstall();
      return await cancelled;
    } catch (e) {
      pendingRestart = null;
      const error = errText(e);
      logLine(`quitAndInstall failed: ${error}`);
      emit({ state: "error", message: error });
      return { ok: false, error };
    }
  });
  import_electron2.ipcMain.handle("update:checkNow", async () => {
    if (!import_electron2.app.isPackaged) return { ok: false, error: "dev build \u2014 updates are only checked in packaged apps" };
    return runCheck();
  });
  import_electron2.ipcMain.handle("update:download", async () => {
    if (!import_electron2.app.isPackaged) return { ok: false, error: "dev build \u2014 updates are only downloaded in packaged apps" };
    return runDownload();
  });
  import_electron2.ipcMain.handle("update:current", () => lastStatus ?? { state: "idle" });
  import_electron2.ipcMain.handle("update:simulate", (_evt, opts) => {
    if (import_electron2.app.isPackaged) return { ok: false, error: "simulate is dev-only" };
    const o = opts ?? {};
    const version = typeof o.version === "string" && o.version ? o.version : "9.9.9";
    const notes = typeof o.notes === "string" ? o.notes : o.drop === true ? `<!-- drop -->
${DEFAULT_DROP_HTML}
<!-- /drop -->` : SIMULATED_NOTES;
    emit(o.state === "downloaded" ? { state: "downloaded", version, notes } : { state: "available-manual", version, notes, url: `https://github.com/${REPO2}/releases/tag/v${version}`, downloadUrl: installerUrl(version, process.platform, process.arch) });
    logLine(`SIMULATED ${o.state === "downloaded" ? "downloaded" : "available-manual"} ${version} (dev only)`);
    return { ok: true };
  });
  const previewPath = process.env.MD_DROP_PREVIEW;
  if (!import_electron2.app.isPackaged && previewPath) {
    try {
      const notes = (0, import_node_fs4.readFileSync)(previewPath, "utf8");
      const m = notes.match(/what[’']?s\s+new\s+in\s+v?(\d+\.\d+\.\d+)/i) ?? notes.match(/\bv(\d+\.\d+\.\d+)\b/);
      const version = m?.[1] ?? "9.9.9";
      emit({ state: "available-manual", version, notes, url: `https://github.com/${REPO2}/releases/tag/v${version}`, downloadUrl: installerUrl(version, process.platform, process.arch) });
      logLine(`SIMULATED available-manual ${version} from MD_DROP_PREVIEW=${previewPath} (dev only)`);
    } catch (e) {
      logLine(`MD_DROP_PREVIEW unreadable: ${errText(e)}`);
    }
  }
  if (!previewPath) {
    try {
      const stampFile = (0, import_node_path4.join)(import_electron2.app.getPath("userData"), "last-run-version");
      let previous = null;
      try {
        previous = (0, import_node_fs4.readFileSync)(stampFile, "utf8").trim() || null;
      } catch {
      }
      const current = import_electron2.app.getVersion();
      let stamped = false;
      if (previous !== current) {
        try {
          (0, import_node_fs4.mkdirSync)(import_electron2.app.getPath("userData"), { recursive: true });
          (0, import_node_fs4.writeFileSync)(stampFile, current + "\n", "utf8");
          stamped = true;
        } catch (e) {
          logLine(`last-run-version stamp failed: ${errText(e)}`);
        }
      }
      if (stamped && shouldShowReleaseDrop(previous, current)) {
        logLine(`first run of ${current} (previous ${previous ?? "none"}); fetching its release page`);
        fetchReleaseBody(current, (notes) => {
          emit({ state: "just-updated", version: current, notes });
          logLine(`just-updated ${current} ${notes ? "with" : "without"} release notes`);
        });
      }
    } catch (e) {
      logLine(`post-update check failed: ${errText(e)}`);
    }
  }
  import_electron2.ipcMain.handle("update:openRelease", (_evt, url) => {
    const href = typeof url === "string" ? url : `https://github.com/${REPO2}/releases/latest`;
    if (!href.startsWith(`https://github.com/${REPO2}/`)) return { ok: false };
    const asset = /\/releases\/download\/v([0-9][^/]*)\//.exec(href);
    if (asset) logLine(`manual download opened: ${asset[1]}`);
    void import_electron2.shell.openExternal(href);
    return { ok: true };
  });
  if (!import_electron2.app.isPackaged) return;
  if (started) return;
  started = true;
  void (async () => {
    try {
      const autoUpdater = await loadAutoUpdater();
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = false;
      autoUpdater.on("update-available", (info) => {
        logLine(`update available: ${info.version}`);
        emit({ state: "available", version: info.version, notes: typeof info.releaseNotes === "string" ? info.releaseNotes : void 0 });
      });
      autoUpdater.on("download-progress", (p) => {
        const version = lastStatus && "version" in lastStatus ? lastStatus.version : import_electron2.app.getVersion();
        emit({ state: "downloading", version, percent: clampPercent(p.percent) });
      });
      autoUpdater.on("update-downloaded", (info) => {
        logLine(`update downloaded: ${info.version} \u2014 waiting for the user to restart`);
        emit({ state: "downloaded", version: info.version, notes: typeof info.releaseNotes === "string" ? info.releaseNotes : void 0 });
      });
      autoUpdater.on("error", (err) => {
        const message = errText(err);
        logLine(`native updater error: ${message}`);
        emit({ state: "error", message });
        failPendingRestart(message);
        fallbackCheck(message);
      });
      logLine(`native updater ready (current v${import_electron2.app.getVersion()})`);
    } catch (e) {
      const message = errText(e);
      logLine(`electron-updater unavailable; notify-only mode: ${message}`);
      emit({ state: "error", message });
    }
    const tick = () => {
      if (autoUpdateEnabled()) void runCheck();
    };
    setTimeout(tick, 3e4);
    setInterval(tick, CHECK_INTERVAL_MS);
  })();
}

// cth/main/realtimeFloorWatcher.ts
var POLL_MS = 5e3;
var MIN_PUSH_GAP_MS = 12e3;
var ACTIVE_WINDOW_MS = 8e3;
var MAX_PUSH_CHARS = 600;
var RealtimeFloorWatcher = class {
  deps;
  timer = null;
  live = false;
  lastPushAt = 0;
  buffer = [];
  prevAgents = /* @__PURE__ */ new Map();
  prevTasks = /* @__PURE__ */ new Map();
  prevActive = /* @__PURE__ */ new Map();
  primed = false;
  constructor(deps) {
    this.deps = deps;
  }
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      try {
        this.tick();
      } catch {
      }
    }, POLL_MS);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  setSessionLive(live) {
    this.live = live;
    this.buffer = [];
    this.primed = false;
  }
  tick() {
    if (!this.deps.enabled()) return;
    const reg = this.deps.registry();
    const agents = /* @__PURE__ */ new Map();
    for (const [id, m] of Object.entries(reg.agents ?? {})) {
      agents.set(id, { archived: !!m.archived, name: m.name || id });
    }
    const tasksRaw = this.deps.tasks();
    const tasks = /* @__PURE__ */ new Map();
    for (const t of Array.isArray(tasksRaw?.tasks) ? tasksRaw.tasks : []) {
      if (typeof t?.id === "string") tasks.set(t.id, { status: t.status ?? "todo", title: t.title ?? t.id });
    }
    const now = Date.now();
    const active = /* @__PURE__ */ new Map();
    for (const p of this.deps.ptys()) {
      active.set(p.id.replace(/^pty-/, ""), now - p.lastOutputAt < ACTIVE_WINDOW_MS);
    }
    if (this.primed && this.live) {
      for (const [id, cur] of agents) {
        const prev = this.prevAgents.get(id);
        if (!prev) this.buffer.push(`${cur.name} joined the floor`);
        else if (!prev.archived && cur.archived) this.buffer.push(`${cur.name} was archived`);
        else if (prev.archived && !cur.archived) this.buffer.push(`${cur.name} is back from the archive`);
      }
      for (const [id, cur] of tasks) {
        const prev = this.prevTasks.get(id);
        if (!prev) this.buffer.push(`new task "${cur.title.slice(0, 60)}"`);
        else if (prev.status !== cur.status) this.buffer.push(`task "${cur.title.slice(0, 60)}" moved to ${cur.status}`);
      }
      for (const [id, isActive] of active) {
        const prev = this.prevActive.get(id);
        const name = agents.get(id)?.name;
        if (prev === void 0 || !name || agents.get(id)?.archived) continue;
        if (prev && !isActive) this.buffer.push(`${name} went quiet (likely done or idle)`);
        else if (!prev && isActive) this.buffer.push(`${name} started producing output`);
      }
    }
    this.prevAgents = agents;
    this.prevTasks = tasks;
    this.prevActive = active;
    this.primed = true;
    if (!this.live || this.buffer.length === 0) {
      if (!this.live) this.buffer = [];
      return;
    }
    if (now - this.lastPushAt < MIN_PUSH_GAP_MS) return;
    const text = this.buffer.join("; ").slice(0, MAX_PUSH_CHARS);
    this.buffer = [];
    this.lastPushAt = now;
    this.deps.push(text);
  }
};

// cth/shared/weeklySchedule.ts
var WEEKLY_CATCHUP_MS = 6 * 60 * 60 * 1e3;
function normalizeWeekly(w) {
  if (!w || typeof w !== "object") return null;
  const raw = w;
  if (!Array.isArray(raw.days)) return null;
  const days = [...new Set(
    raw.days.filter((d) => typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6)
  )].sort((a, b) => a - b);
  if (days.length === 0) return null;
  const minute = raw.minute;
  if (typeof minute !== "number" || !Number.isInteger(minute) || minute < 0 || minute > 1439) return null;
  return { days, minute };
}
function slotAt(from, offset, minute) {
  return new Date(
    from.getFullYear(),
    from.getMonth(),
    from.getDate() + offset,
    Math.floor(minute / 60),
    minute % 60,
    0,
    0
  );
}
function nextWeeklyFireMs(w, nowMs) {
  const n = normalizeWeekly(w);
  if (!n) return null;
  const from = new Date(nowMs);
  for (let offset = 0; offset <= 7; offset++) {
    const slot = slotAt(from, offset, n.minute);
    if (!n.days.includes(slot.getDay())) continue;
    const t = slot.getTime();
    if (t > nowMs) return t;
  }
  return null;
}
function previousWeeklyFireMs(w, nowMs) {
  const n = normalizeWeekly(w);
  if (!n) return null;
  const from = new Date(nowMs);
  for (let offset = 0; offset >= -7; offset--) {
    const slot = slotAt(from, offset, n.minute);
    if (!n.days.includes(slot.getDay())) continue;
    const t = slot.getTime();
    if (t <= nowMs) return t;
  }
  return null;
}
function weeklyDelayMs(w, nowMs, lastFiredAt = 0) {
  const n = normalizeWeekly(w);
  if (!n) return null;
  const prev = previousWeeklyFireMs(n, nowMs);
  if (prev !== null && prev > lastFiredAt && nowMs - prev <= WEEKLY_CATCHUP_MS) return 0;
  const next = nextWeeklyFireMs(n, nowMs);
  return next === null ? null : Math.max(0, next - nowMs);
}

// cth/main/git.ts
var import_node_child_process4 = require("node:child_process");
var import_promises2 = require("node:fs/promises");
function runGit(cwd, args, timeoutMs = 8e3) {
  return new Promise((resolve4) => {
    const proc = (0, import_node_child_process4.spawn)("git", args, { cwd });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
      }
    }, timeoutMs);
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", (e) => {
      clearTimeout(timer);
      resolve4({ ok: false, error: e.message });
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve4({ ok: true, stdout });
      else resolve4({ ok: false, error: stderr.trim() || `git exited ${code}` });
    });
  });
}
async function getBranch(cwd) {
  const head = await runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!head.ok) return { error: head.error };
  const name = head.stdout.trim();
  if (name === "HEAD") return { current: null, detached: true };
  return { current: name, detached: false };
}
async function getStatus(cwd) {
  const res = await runGit(cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (!res.ok) return { error: res.error };
  const entries = [];
  const untracked = [];
  const tokens = res.stdout.split("\0").filter(Boolean);
  for (const token of tokens) {
    if (token.length < 3) continue;
    const index = token[0];
    const worktree = token[1];
    const path3 = token.slice(3);
    if (index === "?" && worktree === "?") untracked.push(path3);
    else entries.push({ path: path3, index, worktree });
  }
  return {
    staged: entries.filter((e) => e.index !== " " && e.index !== "?"),
    unstaged: entries.filter((e) => e.worktree !== " " && e.worktree !== "?"),
    untracked
  };
}
async function getLog(cwd, n) {
  const sep3 = "";
  const fsep = "";
  const fmt = ["%H", "%P", "%s", "%an", "%at", "%D"].join(fsep) + sep3;
  const res = await runGit(cwd, ["log", "--all", `--max-count=${n}`, `--pretty=format:${fmt}`]);
  if (!res.ok) return { error: res.error };
  const out = [];
  for (const rec of res.stdout.split(sep3)) {
    if (!rec.trim()) continue;
    const [sha, parents, subject, author, atime, refs] = rec.split(fsep);
    if (!sha) continue;
    out.push({
      sha,
      shortSha: sha.slice(0, 7),
      parents: parents.split(" ").filter(Boolean),
      subject: subject ?? "",
      author: author ?? "",
      time: parseInt(atime, 10) || 0,
      refs: (refs ?? "").split(", ").map((s) => s.trim()).filter(Boolean)
    });
  }
  return out;
}
async function getBranches(cwd) {
  const res = await runGit(cwd, ["branch", "-a", "--format=%(HEAD)%(refname:short)"]);
  if (!res.ok) return { error: res.error };
  let current = null;
  const local = [];
  const remote = [];
  for (const line of res.stdout.split("\n")) {
    if (!line) continue;
    const [head, name] = line.split("");
    if (!name) continue;
    if (head.trim() === "*") current = name;
    if (name.startsWith("remotes/")) remote.push(name.replace(/^remotes\//, ""));
    else local.push(name);
  }
  return { local, remote, current };
}
async function getAheadBehind(cwd) {
  const up = await runGit(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (!up.ok) return { ahead: 0, behind: 0, upstream: null };
  const upstream = up.stdout.trim();
  const ab = await runGit(cwd, ["rev-list", "--left-right", "--count", `HEAD...${upstream}`]);
  if (!ab.ok) return { error: ab.error };
  const [ahead, behind] = ab.stdout.trim().split("	").map((n) => parseInt(n, 10) || 0);
  return { ahead, behind, upstream };
}
async function isRepo(cwd) {
  const res = await runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
  return res.ok && res.stdout.trim() === "true";
}
var MAX_DIFF_BYTES = 2 * 1024 * 1024;
async function getDiff(cwd, relPath) {
  const abs = safeJoin(cwd, relPath);
  if (!abs) return { ok: false, error: "path escapes repository root" };
  let head = "";
  let headExists = false;
  const show = await runGit(cwd, ["show", `HEAD:${relPath}`]);
  if (show.ok) {
    head = show.stdout;
    headExists = true;
  }
  let working = "";
  let workingExists = false;
  let workingBinary = false;
  try {
    const s = await (0, import_promises2.stat)(abs);
    if (s.size > MAX_DIFF_BYTES) {
      return { ok: false, error: `file too large to diff (${(s.size / 1048576).toFixed(1)} MB)` };
    }
    const buf = await (0, import_promises2.readFile)(abs);
    workingExists = true;
    if (buf.includes(0)) workingBinary = true;
    else working = buf.toString("utf8");
  } catch {
    workingExists = false;
  }
  const isBinary = workingBinary || head.includes("\0");
  return {
    ok: true,
    path: abs,
    relPath,
    head: isBinary ? "" : head,
    working: isBinary ? "" : working,
    headExists,
    workingExists,
    isBinary
  };
}
async function mainRepoRoot(cwd) {
  const res = await runGit(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (!res.ok) return null;
  const gitDir = res.stdout.trim();
  if (!gitDir) return null;
  const stripped = gitDir.replace(/[\\/]\.git[\\/]?$/, "");
  return stripped || gitDir;
}
function agentBranchFor(wtPath) {
  const base = wtPath.split(/[\\/]/).filter(Boolean).pop() ?? "agent";
  const slug2 = base.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "agent";
  return `agent/${slug2}`;
}
async function addWorktree(cwd, wtPath, baseBranch) {
  const branch = agentBranchFor(wtPath);
  const fresh = await runGit(cwd, ["worktree", "add", wtPath, "-b", branch, baseBranch]);
  if (fresh.ok) return { ok: true };
  const fallback = await runGit(cwd, ["worktree", "add", wtPath, baseBranch]);
  if (fallback.ok) return { ok: true };
  return { ok: false, error: fallback.error };
}
async function removeWorktree(cwd, wtPath) {
  const res = await runGit(cwd, ["worktree", "remove", "--force", wtPath]);
  if (res.ok) return { ok: true };
  return { ok: false, error: res.error };
}
async function worktreeHasUnintegratedWork(wtPath, baseBranch) {
  const br = await getBranch(wtPath);
  const branch = "current" in br && br.current ? br.current : "(detached)";
  const status = await runGit(wtPath, ["status", "--porcelain"]);
  const dirty = status.ok ? status.stdout.trim().length > 0 : true;
  let ahead = 0;
  let aheadKnown = true;
  const rl = await runGit(wtPath, ["rev-list", "--count", `${baseBranch}..HEAD`]);
  if (rl.ok) {
    const n = parseInt(rl.stdout.trim(), 10);
    ahead = Number.isFinite(n) ? n : 0;
  } else {
    aheadKnown = false;
  }
  const keep = dirty || ahead > 0 || !aheadKnown;
  const detail = `dirty=${dirty}, commitsAheadOf(${baseBranch})=${aheadKnown ? ahead : "unknown"}`;
  return { keep, detail, branch, dirty, ahead };
}
async function worktreeIsGcSafe(wtPath, baseBranch) {
  const status = await runGit(wtPath, ["status", "--porcelain"]);
  if (!status.ok) return { gc: false, detail: "status query failed" };
  if (status.stdout.trim().length > 0) return { gc: false, detail: "working tree dirty" };
  const rl = await runGit(wtPath, ["rev-list", "--count", `${baseBranch}..HEAD`]);
  if (rl.ok) {
    const n = parseInt(rl.stdout.trim(), 10);
    if (Number.isFinite(n) && n === 0) return { gc: true, detail: `clean + 0 commits ahead of ${baseBranch}` };
  }
  const diff = await runGit(wtPath, ["diff", "--quiet", baseBranch, "HEAD"]);
  if (diff.ok) return { gc: true, detail: `clean + tree identical to ${baseBranch} (integrated/squashed)` };
  return { gc: false, detail: `clean but content not yet in ${baseBranch}` };
}
function isSafeRev(rev) {
  return rev.length > 0 && rev.length <= 256 && !rev.startsWith("-") && /^[0-9A-Za-z._/^~@{}-]+$/.test(rev);
}
async function getLogGraph(cwd, n, skip = 0) {
  const sep3 = "";
  const fsep = "";
  const fmt = ["%H", "%P", "%s", "%an", "%at", "%D"].join(fsep) + sep3;
  const res = await runGit(cwd, [
    "log",
    "--all",
    "--topo-order",
    `--max-count=${n}`,
    ...skip > 0 ? [`--skip=${skip}`] : [],
    `--pretty=format:${fmt}`
  ], 15e3);
  if (!res.ok) return { error: res.error };
  const out = [];
  for (const rec of res.stdout.split(sep3)) {
    if (!rec.trim()) continue;
    const [sha, parents, subject, author, atime, refs] = rec.split(fsep);
    if (!sha) continue;
    out.push({
      sha: sha.trim(),
      shortSha: sha.trim().slice(0, 7),
      parents: (parents ?? "").split(" ").filter(Boolean),
      subject: subject ?? "",
      author: author ?? "",
      time: parseInt(atime, 10) || 0,
      refs: (refs ?? "").split(", ").map((s) => s.trim()).filter(Boolean)
    });
  }
  return out;
}
function parseNameStatusZ(stdout) {
  const tokens = stdout.split("\0").filter((t) => t.length > 0);
  const files = [];
  for (let i = 0; i < tokens.length; i++) {
    const status = tokens[i];
    if (!/^[A-Z]/.test(status)) continue;
    const kind = status[0];
    if (kind === "R" || kind === "C") {
      const oldPath = tokens[i + 1];
      const path3 = tokens[i + 2];
      i += 2;
      if (path3) files.push({ path: path3, status: kind, oldPath });
    } else {
      const path3 = tokens[i + 1];
      i += 1;
      if (path3) files.push({ path: path3, status: kind });
    }
  }
  return files;
}
async function getCommitFiles(cwd, sha) {
  if (!isSafeRev(sha)) return { error: "invalid revision" };
  const res = await runGit(cwd, ["diff-tree", "--no-commit-id", "-r", "--root", "-z", "-M", "--name-status", sha, "--"]);
  if (!res.ok) return { error: res.error };
  return parseNameStatusZ(res.stdout);
}
var MAX_SHOW_BYTES = 2 * 1024 * 1024;
async function getFileAtRev(cwd, rev, relPath) {
  if (!isSafeRev(rev)) return { ok: false, error: "invalid revision" };
  if (!safeJoin(cwd, relPath)) return { ok: false, error: "path escapes repository root" };
  const size = await runGit(cwd, ["cat-file", "-s", `${rev}:${relPath}`]);
  if (!size.ok) return { ok: true, exists: false, isBinary: false, content: "" };
  if ((parseInt(size.stdout.trim(), 10) || 0) > MAX_SHOW_BYTES) {
    return { ok: false, error: "file too large to diff (>2 MB)" };
  }
  const res = await runGit(cwd, ["show", `${rev}:${relPath}`]);
  if (!res.ok) return { ok: true, exists: false, isBinary: false, content: "" };
  if (res.stdout.includes("\0")) return { ok: true, exists: true, isBinary: true, content: "" };
  return { ok: true, exists: true, isBinary: false, content: res.stdout };
}
async function compareRefs(cwd, base, head, mode) {
  if (!isSafeRev(base) || !isSafeRev(head)) return { error: "invalid revision" };
  const counts = await runGit(cwd, ["rev-list", "--left-right", "--count", `${base}...${head}`]);
  if (!counts.ok) return { error: counts.error };
  const [behind, ahead] = counts.stdout.trim().split("	").map((x) => parseInt(x, 10) || 0);
  const mb = await runGit(cwd, ["merge-base", base, head]);
  const mergeBase = mb.ok ? mb.stdout.trim() : null;
  const diffArgs = mode === "three" ? ["diff", "-z", "-M", "--name-status", `${base}...${head}`, "--"] : ["diff", "-z", "-M", "--name-status", base, head, "--"];
  const res = await runGit(cwd, diffArgs, 15e3);
  if (!res.ok) return { error: res.error };
  return { ahead, behind, mergeBase, files: parseNameStatusZ(res.stdout) };
}
async function listWorktrees(cwd) {
  const res = await runGit(cwd, ["worktree", "list", "--porcelain"]);
  if (!res.ok) return { error: res.error };
  const out = [];
  let cur = {};
  for (const line of res.stdout.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (cur.path) out.push(cur);
      cur = { path: line.slice(9), head: "", branch: null };
    } else if (line.startsWith("HEAD ")) cur.head = line.slice(5);
    else if (line.startsWith("branch ")) cur.branch = line.slice(7).replace(/^refs\/heads\//, "");
  }
  if (cur.path) out.push(cur);
  return out;
}
async function checkoutRef(cwd, ref, detach) {
  if (!isSafeRev(ref)) return { ok: false, error: "invalid revision" };
  const st = await getStatus(cwd);
  if ("error" in st) return { ok: false, error: `could not verify a clean tree: ${st.error}` };
  const dirty = st.staged.length + st.unstaged.length;
  if (dirty > 0) {
    return { ok: false, error: `working tree has ${dirty} uncommitted change${dirty === 1 ? "" : "s"} \u2014 commit or stash first` };
  }
  const res = await runGit(cwd, detach ? ["switch", "--detach", ref] : ["switch", ref], 15e3);
  if (!res.ok) {
    if (/already checked out|already used by worktree/i.test(res.error)) {
      const wts = await listWorktrees(cwd);
      const holder = Array.isArray(wts) ? wts.find((w) => w.branch === ref.replace(/^refs\/heads\//, "")) : void 0;
      return { ok: false, error: holder ? `'${ref}' is checked out in another worktree: ${holder.path}` : res.error };
    }
    return { ok: false, error: res.error };
  }
  return { ok: true, detached: detach };
}

// cth/main/hive.ts
var import_node_fs5 = require("node:fs");
var import_node_path5 = require("node:path");
var import_node_os3 = require("node:os");
var import_node_child_process5 = require("node:child_process");
var import_node_crypto = require("node:crypto");

// cth/shared/broadcast.ts
function selectBroadcastTargets(agents, fromId) {
  return Object.keys(agents).filter((id) => {
    const agent = agents[id];
    if (!agent) return false;
    if (id === fromId) return false;
    if (agent.isAssistant) return false;
    if (agent.archived) return false;
    return true;
  });
}

// cth/shared/agentRole.ts
var TRANSIENT_ROLE_RE = /^(on\s+)?standby$|^(idle|awaiting|paused|resumed|working|thinking|archived|starting up|reconnecting…?|running the floor|a fresh harness)$/i;
function isDurableRole(text) {
  const value = (text ?? "").trim();
  if (!value) return false;
  return !TRANSIENT_ROLE_RE.test(value);
}
function preferredAgentRole(candidate, fallback, isGod = false) {
  const incoming = (candidate ?? "").trim();
  const existing = (fallback ?? "").trim();
  if (isDurableRole(incoming)) return incoming;
  if (isDurableRole(existing)) return existing;
  if (incoming) return incoming;
  if (existing) return existing;
  return isGod ? "orchestrator (god)" : "agent";
}

// cth/shared/taskLedger.ts
function isRawTask(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function idOf(value) {
  if (!isRawTask(value)) return null;
  return typeof value.id === "string" && value.id ? value.id : null;
}
function mergeTaskLedger(existing, incoming) {
  const incomingList = Array.isArray(incoming) ? incoming : [];
  const existingList = Array.isArray(existing) ? existing : [];
  const byId = /* @__PURE__ */ new Map();
  for (const entry of existingList) {
    const id = idOf(entry);
    if (id && !byId.has(id)) byId.set(id, entry);
  }
  return incomingList.map((entry) => {
    const id = idOf(entry);
    if (!id) return entry;
    const prior = byId.get(id);
    return prior ? { ...prior, ...entry } : entry;
  });
}

// cth/shared/godIdentity.ts
var DEFAULT_GOD_NAME = "Michael";
function resolveGodName(persistedName) {
  const trimmed = persistedName?.trim();
  return trimmed ? trimmed : DEFAULT_GOD_NAME;
}

// cth/main/hive.ts
var HOP_CAP = 12;
function sleepSync(ms) {
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}
function stamp() {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
}
function shortRand() {
  return (0, import_node_crypto.randomBytes)(3).toString("hex");
}
var PROXY_BIND_ATTEMPTS = 3;
var PROXY_BIND_BACKOFF_MS = [250, 750];
var MINE_IGNORE_LINES = ["settings.json", "cursor.json", "inbox/", "outbox/", ".codex/"];
function ensureMineIgnore(agentDir) {
  const path3 = (0, import_node_path5.join)(agentDir, ".gitignore");
  let existing = "";
  try {
    if ((0, import_node_fs5.existsSync)(path3)) existing = (0, import_node_fs5.readFileSync)(path3, "utf8");
  } catch {
    return;
  }
  const have = new Set(existing.split("\n").map((l) => l.trim()));
  const missing = MINE_IGNORE_LINES.filter((l) => !have.has(l));
  if (missing.length === 0) return;
  const prefix = existing && !existing.endsWith("\n") ? existing + "\n" : existing;
  try {
    (0, import_node_fs5.writeFileSync)(path3, prefix + missing.join("\n") + "\n", "utf8");
  } catch {
  }
}
function redactSecrets(text) {
  if (typeof text !== "string" || !text) return typeof text === "string" ? text : "";
  let s = text;
  s = s.replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, "[redacted]");
  s = s.replace(/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g, "[redacted]");
  s = s.replace(
    /(?:sk-(?:ant-)?[A-Za-z0-9_-]{16,}|xox[bpaors]-[A-Za-z0-9-]{10,}|xapp-[A-Za-z0-9-]{10,}|gh[posru]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|AIza[A-Za-z0-9_-]{20,})/g,
    "[redacted]"
  );
  s = s.replace(/\b(bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [redacted]");
  s = s.replace(
    /\b((?:[a-z0-9]+[_-])*(?:api[_-]?key|secret[_-]?access[_-]?key|secret|token|password|passwd|pwd|access[_-]?token|refresh[_-]?token|client[_-]?secret|signing[_-]?secret|webhook[_-]?secret|auth[_-]?token|bot[_-]?token|private[_-]?key))(\s*[:=]\s*)(["']?)[^\s"',}]{6,}\3/gi,
    (_m, k) => `${k}=[redacted]`
  );
  return s;
}
var HiveManager = class {
  /**
   * @param getHome  Lazily resolve harnessHome so the hive follows config changes.
   * @param emit     Optional sink for renderer-facing events (set by the main
   *                 process to `webContents.send`). Used to animate routed
   *                 messages on the office floor; a no-op in tests/headless.
   */
  constructor(getHome, emit2) {
    this.getHome = getHome;
    this.emit = emit2;
  }
  getHome;
  emit;
  routerTimer = null;
  /** The embedded OTLP collector's loopback URL, set by the main process once the
   *  collector is bound (telemetry.ts). null = telemetry off → no OTel env is
   *  injected at spawn (the transcript reconciler remains the cost source). */
  _otelEndpoint = null;
  /** Point newly-spawned agents at the live telemetry collector. Call after the
   *  collector starts; only affects spawns made afterwards. */
  setOtelEndpoint(url) {
    this._otelEndpoint = url;
  }
  /** The collector URL agents are pointed at, or null when telemetry is off. */
  otelEndpoint() {
    return this._otelEndpoint;
  }
  /** What the app running this hive actually IS: its version, and whether it is a
   *  packaged build or a local dev run.
   *
   *  Agents could not see this before, and it cost real time. A multi-agent
   *  investigation into anomalous file modes ran for hours before the explanation
   *  turned out to be that the operator had quit a downloaded build and started a
   *  local one, which inherits the launching shell's umask instead of Finder's
   *  022. No agent could observe that, several published conclusions had to be
   *  withdrawn, and log.jsonl carried no app-start marker to notice the switch
   *  from either. */
  _runtime = null;
  setRuntimeInfo(info) {
    this._runtime = info;
  }
  runtimeInfo() {
    return this._runtime;
  }
  /** Whether config.orchestratorMaySpawn is on, mirrored here so the prompt
   *  builder can decide whether to tell god the spawn queue is available. Set at
   *  bootstrap and on every config write; hive.ts deliberately does not import
   *  the config module. */
  _maySpawn = false;
  setOrchestratorMaySpawn(on) {
    this._maySpawn = on;
  }
  orchestratorMaySpawn() {
    return this._maySpawn;
  }
  // — paths —
  root() {
    const home = this.getHome();
    return home ? (0, import_node_path5.join)(home, "hive") : null;
  }
  enabled() {
    return this.root() !== null;
  }
  agentDir(id) {
    return (0, import_node_path5.join)(this.root(), "agents", id);
  }
  /** IPC endpoint the cth-hook shim talks to (Phase 1 autonomy).
   *  On POSIX this is a Unix-domain socket file under the hive root. On Windows,
   *  Node's `net` IPC uses named pipes (a flat `\\.\pipe\` namespace, not the
   *  filesystem), so a raw file path fails to bind with EACCES — derive a stable,
   *  per-root pipe name instead. Both the server (`listen`) and the shim
   *  (`createConnection`) read this same value, so they stay in sync. */
  sockPath() {
    const root = this.root();
    if (!root) return null;
    if (process.platform === "win32") {
      const id = (0, import_node_crypto.createHash)("sha1").update(root).digest("hex").slice(0, 12);
      return `\\\\.\\pipe\\munder-difflin-${id}`;
    }
    return (0, import_node_path5.join)(root, "hooks.sock");
  }
  shimPath() {
    const root = this.root();
    return root ? (0, import_node_path5.join)(root, "bin", "cth-hook.cjs") : null;
  }
  /** The proxy-bridge sidecar (qwen). Pure-Node loopback reverse-proxy that
   *  observes a hookless CLI's LLM traffic and synthesizes the same HIVE_SOCK
   *  payloads the hook shims emit. Written in ensureHive alongside cth-hook.cjs. */
  proxyShimPath() {
    const root = this.root();
    return root ? (0, import_node_path5.join)(root, "bin", "hive-proxy.cjs") : null;
  }
  /**
   * The BUNDLED-NODE launcher: `<root>/bin/hive-node` (POSIX) / `hive-node.cmd`
   * (Windows). Every `.cjs` shim in the hive is executed through it.
   *
   * Why it exists: hooks are run by the agent CLI through a plain
   * `/bin/sh -c` with a bare `PATH=/usr/bin:/bin:/usr/sbin:/sbin`. A user whose
   * node comes from nvm (PATH set only by an interactive login shell) has NO node
   * there, so a hook written as `node "<shim>"` exits **127 — command not found**
   * and every payload is silently lost: no live status, no Stop→inbox drain, no
   * session ids. Electron's own binary IS a full Node runtime under
   * `ELECTRON_RUN_AS_NODE=1`, and it is guaranteed present (it is us).
   *
   * A wrapper SCRIPT rather than an inline `ELECTRON_RUN_AS_NODE=1 "<exe>" …`
   * prefix because that prefix is POSIX-sh syntax — it is a hard error under
   * cmd.exe, which is what runs hook commands on Windows. The wrapper also gives
   * agents a `$HIVE_NODE` they can invoke directly (running the Electron binary
   * WITHOUT the env var would launch a second app window, not a script).
   *
   * Rewritten on every bootstrap, so an app update/move re-bakes execPath.
   */
  nodeLauncherPath() {
    const root = this.root();
    if (!root) return null;
    return (0, import_node_path5.join)(root, "bin", process.platform === "win32" ? "hive-node.cmd" : "hive-node");
  }
  /** Write the launcher described above. Best-effort: on failure callers fall
   *  back to bare `node`, i.e. exactly the pre-fix behavior. */
  writeNodeLauncher() {
    const p = this.nodeLauncherPath();
    if (!p) return;
    try {
      if (process.platform === "win32") {
        (0, import_node_fs5.writeFileSync)(p, `@echo off\r
set ELECTRON_RUN_AS_NODE=1\r
"${process.execPath}" %*\r
`, "utf8");
      } else {
        (0, import_node_fs5.writeFileSync)(p, `#!/bin/sh
ELECTRON_RUN_AS_NODE=1 exec "${process.execPath}" "$@"
`, "utf8");
        (0, import_node_fs5.chmodSync)(p, 493);
      }
    } catch (e) {
      console.error("[hive] writeNodeLauncher failed:", e);
    }
  }
  /** The launcher path if it is actually on disk, else null (→ callers fall back
   *  to bare `node`, i.e. exactly the pre-fix behavior — never worse than before). */
  nodeLauncher() {
    const p = this.nodeLauncherPath();
    return p && (0, import_node_fs5.existsSync)(p) ? p : null;
  }
  /** The ABSOLUTE bundled-node command to BAKE into any text an agent is expected
   *  to run (`<launcher> <script> …`), falling back to bare `node`.
   *
   *  Exactly the value of the agent's `HIVE_NODE` env var — but agent-facing text
   *  must never spell it as `$HIVE_NODE`: that is POSIX shell syntax. A Windows
   *  agent runs its commands through cmd.exe/PowerShell, where `$HIVE_NODE`
   *  expands to NOTHING (cmd) or to an undefined variable (PowerShell), so every
   *  such instruction is dead on arrival there. The absolute path is correct on
   *  every platform and needs no expansion at all. */
  nodeCommand() {
    return this.nodeLauncher() ?? "node";
  }
  /**
   * `<root>/bin/runtime` — the same bundled-node trick as `hive-node`, but the
   * wrapper is NAMED `node`, so anything that resolves `node` off PATH finds one.
   *
   * `hive-node` only covers commands WE generate. It does nothing for node that
   * the agent's own work needs at runtime: an MCP server declared as
   * `node ./server.js`, a provider CLI that shells out to node, a `.cjs` helper an
   * agent wrote itself. On a machine with no system node those all die with 127
   * exactly like the hooks did.
   *
   * This dir is APPENDED to the agent's PATH (see pty.spawn), never prepended: a
   * user who has their own node keeps their own version — we are strictly the
   * fallback. Prepending would silently swap every agent's node for Electron's
   * (20.18.1 as of Electron 32.3.3) underneath the user's own projects.
   *
   * NOTE: `node` only — deliberately no `npm`/`npx`. Electron bundles the Node
   * RUNTIME, not the npm CLI (which is ~12MB of JS we do not ship), so an `npm`
   * wrapper here could only be a stub that fails confusingly. A missing `npm` is
   * the honest signal; the install ladder (main/cliInstall.ts) detects it and
   * installs a REAL system Node — which brings npm with it. This shim is only the
   * last resort for when that install could not run (offline, or a platform with
   * no official installer).
   */
  runtimeBinDir() {
    const root = this.root();
    return root ? (0, import_node_path5.join)(root, "bin", "runtime") : null;
  }
  /** Write the `node` shim described above. Best-effort: on failure the dir is
   *  simply absent from PATH and behavior is exactly as before. */
  writeRuntimeShims() {
    const dir = this.runtimeBinDir();
    if (!dir) return;
    try {
      (0, import_node_fs5.mkdirSync)(dir, { recursive: true });
      if (process.platform === "win32") {
        (0, import_node_fs5.writeFileSync)(
          (0, import_node_path5.join)(dir, "node.cmd"),
          `@echo off\r
set ELECTRON_RUN_AS_NODE=1\r
"${process.execPath}" %*\r
`,
          "utf8"
        );
      } else {
        const p = (0, import_node_path5.join)(dir, "node");
        (0, import_node_fs5.writeFileSync)(p, `#!/bin/sh
ELECTRON_RUN_AS_NODE=1 exec "${process.execPath}" "$@"
`, "utf8");
        (0, import_node_fs5.chmodSync)(p, 493);
      }
    } catch (e) {
      console.error("[hive] writeRuntimeShims failed:", e);
    }
  }
  /** Build a hook command string that runs `script` under the guaranteed node,
   *  DOUBLE-QUOTED (safe for paths with spaces). */
  nodeRun(script, ...args) {
    const launcher = this.nodeLauncher();
    return [launcher ? `"${launcher}"` : "node", `"${script}"`, ...args].join(" ");
  }
  /** Same, but UNQUOTED — for the CLIs whose hook config mangles embedded quotes
   *  (agy on cmd.exe) or stores the command in a quote-sensitive literal (codex's
   *  single-quoted TOML). Safe because both the hive root and the launcher inside
   *  it are space-free by construction; this only preserves each installer's
   *  existing quoting convention while swapping `node` for the bundled runtime. */
  nodeRunUnquoted(script, ...args) {
    return [this.nodeLauncher() ?? "node", script, ...args].join(" ");
  }
  /** One proxy sidecar per live proxy-tier agent, keyed by agentId. Spawned in
   *  ensureAgent, killed on PTY exit / removeAgent / app quit (index.ts) — so a
   *  dead agent never leaks an orphan loopback listener. */
  proxyChildren = /* @__PURE__ */ new Map();
  // — bootstrap —
  /** Create the hive skeleton + git repo if missing. Idempotent. */
  ensureHive() {
    const root = this.root();
    if (!root) return;
    (0, import_node_fs5.mkdirSync)((0, import_node_path5.join)(root, "agents"), { recursive: true });
    (0, import_node_fs5.writeFileSync)((0, import_node_path5.join)(root, "PROTOCOL.md"), PROTOCOL_MD, "utf8");
    const registry = (0, import_node_path5.join)(root, "registry.json");
    if (!(0, import_node_fs5.existsSync)(registry)) {
      this.writeJson(registry, { godId: null, agents: {} });
    }
    const userCodexHome = (0, import_node_path5.join)((0, import_node_os3.homedir)(), ".codex");
    for (const [id, agent] of Object.entries(this.registry().agents)) {
      const codexHome = (0, import_node_path5.join)(root, "agents", id, ".codex");
      if (agent.provider === "codex" && (0, import_node_fs5.existsSync)(codexHome)) {
        this.exposeCodexDataDirs(codexHome, userCodexHome, id);
      }
    }
    const board = (0, import_node_path5.join)(root, "board.md");
    if (!(0, import_node_fs5.existsSync)(board)) {
      (0, import_node_fs5.writeFileSync)(board, "# Hive board\n\n_Shared plans live here. The god agent is the scribe._\n", "utf8");
    }
    const tasks = (0, import_node_path5.join)(root, "tasks.json");
    if (!(0, import_node_fs5.existsSync)(tasks)) this.writeJson(tasks, { tasks: [] });
    const log = (0, import_node_path5.join)(root, "log.jsonl");
    if (!(0, import_node_fs5.existsSync)(log)) (0, import_node_fs5.writeFileSync)(log, "", "utf8");
    (0, import_node_fs5.writeFileSync)((0, import_node_path5.join)(root, "COMMANDS.md"), COMMANDS_MD, "utf8");
    const gitignore = (0, import_node_path5.join)(root, ".gitignore");
    const want = ["fleet.json", "hooks.sock", "cost-ledger.jsonl", ".DS_Store"];
    let lines = [];
    if ((0, import_node_fs5.existsSync)(gitignore)) {
      try {
        lines = (0, import_node_fs5.readFileSync)(gitignore, "utf8").split("\n");
      } catch {
        lines = [];
      }
    }
    const missing = want.filter((w) => !lines.includes(w));
    if (missing.length) (0, import_node_fs5.writeFileSync)(gitignore, [...lines.filter(Boolean), ...missing].join("\n") + "\n", "utf8");
    (0, import_node_fs5.mkdirSync)((0, import_node_path5.join)(root, "bin"), { recursive: true });
    (0, import_node_fs5.writeFileSync)(this.shimPath(), HOOK_SHIM, "utf8");
    (0, import_node_fs5.writeFileSync)(this.proxyShimPath(), PROXY_BRIDGE_SHIM, "utf8");
    this.writeNodeLauncher();
    this.writeRuntimeShims();
    if (!(0, import_node_fs5.existsSync)((0, import_node_path5.join)(root, ".git"))) {
      this.git(["init", "-q"], root);
      this.commit("hive: init");
    }
  }
  /** Validate an agent's cwd the way a spawn does — it must be an ABSOLUTE path
   *  that exists as a directory. Surfaced as `cwdValid` on the registry entry so
   *  the roster reliably exposes whether a worker's working directory is usable.
   *  Best-effort; never throws (a stat error degrades to invalid). */
  cwdValidity(cwd) {
    if (!cwd || typeof cwd !== "string") return { valid: false, issue: "missing" };
    cwd = expandTilde(cwd);
    if (!(0, import_node_path5.isAbsolute)(cwd)) return { valid: false, issue: "not-absolute" };
    try {
      return (0, import_node_fs5.statSync)(cwd).isDirectory() ? { valid: true, issue: null } : { valid: false, issue: "not-a-directory" };
    } catch {
      return { valid: false, issue: "missing-dir" };
    }
  }
  /**
   * Ensure an agent's workspace + registry entry, returning the spawn injection
   * (provider-specific args + env) that makes the process hive-aware.
   */
  async ensureAgent(meta, opts = {}) {
    const root = this.root();
    if (!root) return { args: [], env: {} };
    this.ensureHive();
    const dir = this.agentDir(meta.id);
    (0, import_node_fs5.mkdirSync)((0, import_node_path5.join)(dir, "inbox", ".done"), { recursive: true });
    (0, import_node_fs5.mkdirSync)((0, import_node_path5.join)(dir, "outbox", ".sent"), { recursive: true });
    const reg = this.registry();
    const prev = reg.agents[meta.id];
    if (meta.cwd) meta = { ...meta, cwd: expandTilde(meta.cwd) };
    const role = preferredAgentRole(meta.role, prev?.role, !!meta.isGod);
    meta = { ...meta, role };
    const identity = (0, import_node_path5.join)(dir, "identity.md");
    (0, import_node_fs5.writeFileSync)(identity, this.identityText(meta), "utf8");
    if (opts.skillsDir) this.copyBundledSkills(opts.skillsDir, (0, import_node_path5.join)(dir, ".claude", "skills"));
    const memory2 = (0, import_node_path5.join)(dir, "memory.md");
    if (!(0, import_node_fs5.existsSync)(memory2)) {
      (0, import_node_fs5.writeFileSync)(memory2, `# Memory \u2014 ${meta.name} (${meta.id})

_Append durable facts, decisions, and context below._
`, "utf8");
    }
    ensureMineIgnore(dir);
    const cursor = (0, import_node_path5.join)(dir, "cursor.json");
    if (!(0, import_node_fs5.existsSync)(cursor)) this.writeJson(cursor, { lastProcessed: null });
    const cwd = this.cwdValidity(meta.cwd);
    reg.agents[meta.id] = {
      ...prev,
      ...meta,
      capabilities: meta.capabilities ?? prev?.capabilities ?? [],
      role,
      status: "idle",
      cwdValid: cwd.valid,
      // A (re)spawn always means a live terminal — clear any prior archived flag.
      archived: false,
      lastSeen: Date.now()
    };
    if (meta.isGod) reg.godId = meta.id;
    this.atomicWriteJson((0, import_node_path5.join)(root, "registry.json"), reg);
    this.appendLog({ kind: "spawn", agentId: meta.id, name: meta.name, isGod: !!meta.isGod });
    if (!cwd.valid) {
      this.appendLog({ kind: "cwd_invalid", agentId: meta.id, cwd: meta.cwd, issue: cwd.issue });
    }
    this.commit(`hive: register ${meta.id}`);
    const env = {
      AGENT_ID: meta.id,
      AGENT_NAME: meta.name,
      HIVE_ROOT: root,
      AGENT_DIR: dir
    };
    env.HIVE_NODE = this.nodeCommand();
    if (opts.theme) env.COLORFGBG = opts.theme === "dark" ? "15;0" : "0;15";
    const claudeProvider = isClaudeProvider(meta.provider ?? "claude");
    if (!isHiveAwareProvider(meta.provider)) {
      const preset = providerPreset(meta.provider ?? "claude");
      const flag = preset.initialPromptFlag;
      const prompt = this.injectedPrompt(meta, dir, root, opts.semanticMemory ?? false, opts.knowledgeGraph ?? false, opts.kgCliPath);
      const preArgs = [];
      let degraded;
      const desc = bridgeOf(meta.provider);
      const sock2 = this.sockPath();
      if (desc && sock2) {
        env.HIVE_SOCK = sock2;
        try {
          if (desc.kind === "hooks") {
            if (desc.shim === "agy") this.installAgyHooks();
            else if (desc.shim === "codex") {
              env.CODEX_HOME = this.installCodexHooks(dir, meta.id);
              preArgs.push("--dangerously-bypass-hook-trust");
              for (const d of this.sandboxWritableDirs(meta, dir, root, opts.extraWritableDirs)) preArgs.push("--add-dir", d);
            } else if (desc.shim === "pi") {
              env.PI_CODING_AGENT_DIR = this.installPiHooks(dir);
            } else if (desc.shim === "opencode") {
              env.OPENCODE_CONFIG_DIR = this.installOpenCodePlugin(dir, opts.theme);
            } else if (desc.shim === "gemini") {
              env.GEMINI_CLI_SYSTEM_SETTINGS_PATH = this.installGeminiHooks(dir);
            } else if (desc.shim === "grok") this.installGrokHooks();
          } else if (desc.kind === "proxy") {
            const spawnTs = String(Date.now());
            const sessionId = `proxy-${meta.id}-${(0, import_node_crypto.createHash)("sha1").update(root + meta.id + spawnTs).digest("hex").slice(0, 12)}`;
            env.HIVE_PROXY_SESSION = sessionId;
            const upstream = process.env[desc.baseUrlEnv] || (desc.api === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com/v1");
            const port = await this.startProxyBridgeWithRetry(meta.id, { sock: sock2, sessionId, api: desc.api, upstream });
            if (port > 0) {
              const loopback = `http://127.0.0.1:${port}`;
              if (meta.provider === "crush") {
                const crush = this.installCrushConfig(dir, loopback, desc.api, opts.theme);
                env.CRUSH_GLOBAL_CONFIG = dir;
                env.CRUSH_GLOBAL_DATA = crush.data;
              } else {
                env[desc.baseUrlEnv] = loopback;
              }
            } else {
              degraded = `${meta.name} is running without hive events: its proxy bridge did not bind after ${PROXY_BIND_ATTEMPTS} attempts. Live status, cost and inbox wake will not work for this session. Respawn the agent to try again.`;
              console.error(`[hive] proxy bridge for ${meta.id} did not bind \u2014 spawning without hive events`);
              this.appendLog({ kind: "proxy-degraded", agentId: meta.id, name: meta.name, provider: meta.provider, attempts: PROXY_BIND_ATTEMPTS });
              this.emit?.("hive:degraded", { agentId: meta.id, name: meta.name, reason: "proxy-bind", message: degraded });
            }
          }
        } catch (e) {
          console.error(`[hive] install ${desc.kind} bridge failed:`, e);
        }
      }
      const deg = degraded ? { degraded } : {};
      if (preset.seedDelivery === "type-into-tui") return { args: [...preArgs], env, seedPrompt: prompt, ...deg };
      if (flag) return { args: [...preArgs, flag, prompt], env, ...deg };
      if (preset.positionalInitialPrompt) return { args: [...preArgs, prompt], env, ...deg };
      return { args: preArgs, env, ...deg };
    }
    if (claudeProvider && this._otelEndpoint) {
      env.CLAUDE_CODE_ENABLE_TELEMETRY = "1";
      env.OTEL_METRICS_EXPORTER = "otlp";
      env.OTEL_LOGS_EXPORTER = "otlp";
      env.OTEL_EXPORTER_OTLP_PROTOCOL = "http/json";
      env.OTEL_EXPORTER_OTLP_ENDPOINT = this._otelEndpoint;
      env.OTEL_METRIC_EXPORT_INTERVAL = "5000";
      env.OTEL_LOGS_EXPORT_INTERVAL = "2000";
      env.OTEL_RESOURCE_ATTRIBUTES = `agent.id=${meta.id},agent.name=${meta.name}`;
    }
    const args = [];
    if (!claudeProvider) return { args, env };
    args.push("--append-system-prompt", this.injectedPrompt(meta, dir, root, opts.semanticMemory ?? false, opts.knowledgeGraph ?? false, opts.kgCliPath));
    const sock = this.sockPath();
    const shim = this.shimPath();
    if (sock && shim) {
      env.HIVE_SOCK = sock;
      const settingsPath = (0, import_node_path5.join)(dir, "settings.json");
      this.writeJson(settingsPath, this.hookSettings(shim, meta.cwd, opts.mcpDefaults, opts.theme, this.sandboxWritableDirs(meta, dir, root, opts.extraWritableDirs)));
      args.push("--settings", settingsPath);
    }
    return { args, env };
  }
  /** Update the durable job string (hire role) without respawning. Refreshes
   *  registry.json + identity.md so the floor editor and the hive stay aligned. */
  patchAgentRole(id, role) {
    const root = this.root();
    if (!root) return { ok: false, error: "hive disabled" };
    const next = role.trim();
    if (!next) return { ok: false, error: "empty role" };
    try {
      const reg = this.registry();
      const agent = reg.agents[id];
      if (!agent) return { ok: false, error: "unknown agent" };
      if (agent.role === next) return { ok: true };
      agent.role = next;
      agent.lastSeen = Date.now();
      this.writeJson((0, import_node_path5.join)(root, "registry.json"), reg);
      (0, import_node_fs5.writeFileSync)((0, import_node_path5.join)(this.agentDir(id), "identity.md"), this.identityText(agent), "utf8");
      this.appendLog({ kind: "role", agentId: id, role: next });
      this.commit(`hive: role ${id}`);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  /**
   * Flip an agent's archived flag and persist the registry. Closing a terminal
   * tab archives the agent (retained + flagged, NOT deleted); a (re)spawn clears
   * it. No-op if the agent isn't registered or the flag is already set the way
   * asked. Best-effort — never throws, so a dying PTY/kill handler can't crash.
   */
  setArchived(id, archived) {
    const root = this.root();
    if (!root) return;
    try {
      const reg = this.registry();
      const agent = reg.agents[id];
      if (!agent || agent.archived === archived) return;
      agent.archived = archived;
      agent.lastSeen = Date.now();
      this.atomicWriteJson((0, import_node_path5.join)(root, "registry.json"), reg);
      this.appendLog({ kind: "archive", agentId: id, archived });
      this.commit(`hive: ${archived ? "archive" : "unarchive"} ${id}`);
    } catch {
    }
  }
  /**
   * Change an agent's display name without changing its durable identity.
   * The registry key, agent directory, session id, and every mailbox path remain
   * keyed by `id`; only the human-facing name is updated.
   *
   * `fleet.json` is patched in the same operation so god's next prompt receives
   * the new name immediately rather than waiting for the periodic fleet refresh.
   */
  /**
   * Put an agent on hold, or take it off, and tell Michael immediately.
   *
   * `fleet.json` is patched in the same operation for the same reason
   * `renameAgent` does it: god's roster is injected from that file on its next
   * prompt, and waiting up to 8s for the periodic refresh means one more
   * dispatch can still land on someone the human has just claimed.
   */
  setAgentHold(id, hold) {
    const root = this.root();
    if (!root) return { ok: false, error: "hive disabled (no harnessHome)" };
    try {
      const reg = this.registry();
      const agent = reg.agents[id];
      if (!agent) return { ok: false, error: "Agent not found" };
      if (!!agent.onHold === hold) return { ok: true, onHold: hold };
      agent.onHold = hold;
      this.writeJson((0, import_node_path5.join)(root, "registry.json"), reg);
      const fleetPath = (0, import_node_path5.join)(root, "fleet.json");
      if ((0, import_node_fs5.existsSync)(fleetPath)) {
        try {
          const fleet = this.readJson(fleetPath, {});
          if (Array.isArray(fleet.agents)) {
            const row = fleet.agents.find((candidate) => candidate.id === id);
            if (row) {
              row.onHold = hold;
              this.writeJson(fleetPath, fleet);
            }
          }
        } catch {
        }
      }
      this.appendLog({ kind: "agent-hold", id, onHold: hold });
      return { ok: true, onHold: hold };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  renameAgent(id, name) {
    const root = this.root();
    if (!root) return { ok: false, error: "hive disabled (no harnessHome)" };
    const nextName = name.trim();
    if (!nextName) return { ok: false, error: "Name is required" };
    try {
      const reg = this.registry();
      const agent = reg.agents[id];
      if (!agent) return { ok: false, error: "Agent not found" };
      if (agent.name === nextName) return { ok: true, name: nextName };
      const previousName = agent.name;
      agent.name = nextName;
      this.writeJson((0, import_node_path5.join)(root, "registry.json"), reg);
      const fleetPath = (0, import_node_path5.join)(root, "fleet.json");
      if ((0, import_node_fs5.existsSync)(fleetPath)) {
        try {
          const fleet = this.readJson(fleetPath, {});
          if (Array.isArray(fleet.agents)) {
            const row = fleet.agents.find((candidate) => candidate.id === id);
            if (row) {
              row.name = nextName;
              this.writeJson(fleetPath, fleet);
            }
          }
        } catch {
        }
      }
      this.appendLog({ kind: "rename", agentId: id, previousName, name: nextName });
      this.commit(`hive: rename ${id}`);
      return { ok: true, name: nextName };
    } catch {
      return { ok: false, error: "Could not rename agent" };
    }
  }
  /**
   * Persist the agent's Claude Code session_id (Lane A #6.6a). Captured from hook
   * payloads; written only when it actually changes (a new session), so this is a
   * no-op on the vast majority of hook events. The id is the `--resume` key for
   * idempotent resume after a crash/restart AND the accounting/dedup key for cost
   * samples. Best-effort — never throws into a hook handler.
   */
  recordSession(agentId, sessionId) {
    const root = this.root();
    if (!root || !sessionId) return;
    try {
      const reg = this.registry();
      const agent = reg.agents[agentId];
      if (!agent || agent.sessionId === sessionId) return;
      agent.sessionId = sessionId;
      agent.lastSeen = Date.now();
      this.atomicWriteJson((0, import_node_path5.join)(root, "registry.json"), reg);
      this.appendLog({ kind: "session", agentId, sessionId });
      this.commit(`hive: session ${agentId}`);
    } catch {
    }
  }
  /** The last known session_id for an agent, or undefined. Used to build a
   *  `claude --resume <id>` spawn so a restarted agent resumes its thread. */
  lastSession(agentId) {
    return this.registry().agents[agentId]?.sessionId;
  }
  /** Claude Code settings that route every relevant hook through the shim, plus
   *  (W3) the default MCP bundle merged into this PER-SESSION settings file. cwd
   *  scopes the filesystem/git servers; cfg (the consent map) gates which servers
   *  are written. Claude-only — this is invoked solely on the Claude spawn path. */
  /**
   * Directories a sandboxed agent may write BESIDES its cwd: its own agent
   * folder (hive housekeeping) and the hive root (research deliverables; the
   * board and tasks.json for god; outbox delivery is done by main, not the agent).
   * This is what lets auto mode keep the OS sandbox on — the old full-bypass
   * posture existed only because these paths sit outside the project cwd.
   */
  sandboxWritableDirs(meta, dir, root, extra) {
    const out = [dir, root, ...extra ?? []].filter((d) => typeof d === "string" && d.length > 0);
    return Array.from(new Set(out));
  }
  hookSettings(shim, cwd, cfg, theme, writableDirs = []) {
    const cmd = this.nodeRun(shim);
    const entry = (matcher) => ({
      ...matcher ? { matcher } : {},
      hooks: [{ type: "command", command: cmd }]
    });
    const mcpServers = this.buildDefaultMcpServers(cwd, cfg);
    return {
      // Match the TUI's truecolor palette to the harness terminal theme —
      // PER SESSION, so the user's global Claude theme (their own terminals
      // outside the app) is never touched.
      //
      // 'auto', not the literal light/dark. Pinning the value matched the theme at
      // SPAWN and then ignored every change: Claude Code supports DEC 2031 theme
      // notifications, but a pinned theme has nothing to reconsider, so flipping
      // the app left a running agent painting its message blocks in the old
      // palette (black highlight on a cream terminal). 'auto' is the value that
      // listens. The terminal reports the current theme the moment the CLI enables
      // 2031, so startup still matches without pinning anything.
      ...theme ? { theme: "auto" } : {},
      // W3 — default skills/MCP bundle. Written into the PER-SESSION settings file
      // only (never ~/.claude), so the user's own MCP servers are never clobbered;
      // Claude merges this additively. Omitted entirely when empty so a settings
      // file with no enabled servers is unchanged from before.
      ...Object.keys(mcpServers).length ? { mcpServers } : {},
      // The status line gets the session status JSON after every response —
      // including context_window.{total_input_tokens,context_window_size},
      // the only clean programmatic source for the session's REAL context
      // window. The shim prints a compact in-terminal gauge and forwards the
      // payload to the harness (agent-card context gauge, exact limit).
      statusLine: { type: "command", command: `${cmd} --status`, padding: 0 },
      // Native OS sandbox for Bash subprocesses (macOS Seatbelt / Linux bubblewrap).
      // Auto mode spawns with `--permission-mode bypassPermissions`, which only
      // silences PROMPTS; the sandbox is a separate, opt-in layer that was never
      // switched on. Verified live (claude 2.1.239): with this block, bypass mode
      // still writes cwd and the listed dirs but `touch $HOME/x` fails with
      // "Operation not permitted". Two layers are needed: `sandbox.filesystem`
      // governs Bash children, `permissions.additionalDirectories` governs the
      // Edit/Write tools; with only one the agent deadlocks on its own inbox.
      // failIfUnavailable stays false: a platform without a sandbox (Windows)
      // runs as before rather than refusing to spawn.
      ...writableDirs.length ? {
        sandbox: { enabled: true, filesystem: { allowWrite: writableDirs } },
        permissions: { additionalDirectories: writableDirs }
      } : {},
      hooks: {
        Stop: [entry()],
        SubagentStop: [entry()],
        PreToolUse: [entry("*")],
        PostToolUse: [entry("*")],
        UserPromptSubmit: [entry()],
        Notification: [entry()],
        SessionStart: [entry()],
        // #5C: surface mid-`/compact` so an agent boxing up its context reads as
        // 'compacting' on the floor instead of looking frozen.
        PreCompact: [entry()],
        PostCompact: [entry()]
      }
    };
  }
  /**
   * W3 — build the per-agent `mcpServers` map from the default catalog. Includes a
   * server only when it's enabled (catalog ∩ consent), scopes filesystem/git to the
   * agent cwd (never whole-disk), and namespaces every id `munder-<id>` so a server
   * of the same name in the user's own ~/.claude is never clobbered. A write/secret
   * server is included ONLY on an explicit `enabled:true` consent — never via a
   * default — so a malformed/partial config can't silently arm a keyed server.
   */
  buildDefaultMcpServers(cwd, cfg) {
    const out = {};
    for (const e of MCP_CATALOG) {
      const consented = cfg?.[e.id]?.enabled;
      const enabled = consented ?? e.defaultEnabled;
      if (!enabled) continue;
      if (e.tier !== "safe-readonly" && consented !== true) continue;
      const args = e.spec.args.map((a) => a === "<cwd>" ? cwd : a);
      out[`munder-${e.id}`] = {
        command: e.spec.command,
        args,
        ...e.spec.env ? { env: e.spec.env } : {}
      };
    }
    return out;
  }
  /**
   * W3 — refresh an agent's bundled skills from the app-resources `skills/` dir.
   * Mirrors `identity.md`: overwritten every spawn so the shipped safe set tracks
   * the app. Best-effort and fully tolerant — a missing/empty source dir is a no-op
   * (Kevin populates the resource dir in lp-manifest), and any IO error is swallowed
   * so skill provisioning can never block a spawn.
   */
  copyBundledSkills(srcDir, destDir) {
    try {
      if (!(0, import_node_fs5.existsSync)(srcDir)) return;
      const copyTree = (from, to) => {
        const entries = (0, import_node_fs5.readdirSync)(from, { withFileTypes: true });
        if (!entries.length) return;
        (0, import_node_fs5.mkdirSync)(to, { recursive: true });
        for (const ent of entries) {
          const s = (0, import_node_path5.join)(from, ent.name);
          const d = (0, import_node_path5.join)(to, ent.name);
          if (ent.isDirectory()) copyTree(s, d);
          else if (ent.isFile()) (0, import_node_fs5.copyFileSync)(s, d);
        }
      };
      copyTree(srcDir, destDir);
    } catch (e) {
      console.error("[hive] copyBundledSkills failed:", e);
    }
  }
  /**
   * W1 — start a proxy-bridge sidecar for a hookless proxy-tier agent (qwen).
   * Spawns `<root>/bin/hive-proxy.cjs` under Node, which binds a loopback port and
   * reports it back as a one-line `{"port":N}` on stdout. Resolves the bound port
   * (or 0 on failure, so the caller degrades gracefully without redirecting the
   * CLI). Idempotent: any prior sidecar for the agent is killed first, so a respawn
   * never leaks a listener. Tracked in `proxyChildren` for teardown.
   */
  /** startProxyBridge with a short retry ladder. Every attempt kills the previous
   *  sidecar first (startProxyBridge is idempotent), so a retry never leaks a
   *  listener. Resolves the bound port, or 0 once every attempt has failed. */
  async startProxyBridgeWithRetry(agentId, cfg) {
    for (let attempt = 1; attempt <= PROXY_BIND_ATTEMPTS; attempt++) {
      const port = await this.startProxyBridge(agentId, cfg);
      if (port > 0) return port;
      if (attempt < PROXY_BIND_ATTEMPTS) {
        console.warn(`[hive] proxy bridge for ${agentId} did not bind (attempt ${attempt}/${PROXY_BIND_ATTEMPTS}), retrying`);
        await new Promise((r) => setTimeout(r, PROXY_BIND_BACKOFF_MS[attempt - 1] ?? 1e3));
      }
    }
    return 0;
  }
  startProxyBridge(agentId, cfg) {
    this.stopProxyBridge(agentId);
    const script = this.proxyShimPath();
    if (!script) return Promise.resolve(0);
    return new Promise((resolve4) => {
      let settled = false;
      const settle = (port) => {
        if (!settled) {
          settled = true;
          resolve4(port);
        }
      };
      let child;
      try {
        child = (0, import_node_child_process5.spawn)(process.execPath, [script], {
          env: {
            ...process.env,
            // Run the .cjs under Electron's bundled Node, not as a second app window.
            ELECTRON_RUN_AS_NODE: "1",
            HIVE_SOCK: cfg.sock,
            AGENT_ID: agentId,
            UPSTREAM_BASE_URL: cfg.upstream,
            HIVE_PROXY_SESSION: cfg.sessionId,
            HIVE_PROXY_API: cfg.api
          },
          // Read the port line from stdout; never inherit stdio (the sidecar must
          // never write into the agent's terminal or leak request bodies to a log).
          stdio: ["ignore", "pipe", "ignore"]
        });
      } catch (e) {
        console.error(`[hive] startProxyBridge spawn failed for ${agentId}:`, e);
        return settle(0);
      }
      this.proxyChildren.set(agentId, child);
      let buf = "";
      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", (d) => {
        if (settled) return;
        buf += d;
        const nl = buf.indexOf("\n");
        if (nl === -1) return;
        try {
          const msg = JSON.parse(buf.slice(0, nl));
          if (typeof msg.port === "number" && msg.port > 0) settle(msg.port);
          else settle(0);
        } catch {
          settle(0);
        }
      });
      child.on("error", () => settle(0));
      child.on("exit", () => {
        if (this.proxyChildren.get(agentId) === child) this.proxyChildren.delete(agentId);
        settle(0);
      });
      setTimeout(() => settle(0), 4e3).unref?.();
    });
  }
  /** Kill the proxy sidecar for an agent, if any. Idempotent; never throws. */
  stopProxyBridge(agentId) {
    const child = this.proxyChildren.get(agentId);
    if (!child) return;
    this.proxyChildren.delete(agentId);
    try {
      child.kill();
    } catch {
    }
  }
  /** Kill every live proxy sidecar (app quit). Best-effort. */
  stopAllProxyBridges() {
    for (const id of [...this.proxyChildren.keys()]) this.stopProxyBridge(id);
  }
  /**
   * Drain an agent's inbox for the Stop hook. Returns whether to block-to-continue
   * and the message text to feed back. Uses the per-agent cursor so a message is
   * surfaced exactly once (no infinite loop).
   */
  drainForStop(agentId) {
    const dir = this.agentDir(agentId);
    if (!(0, import_node_fs5.existsSync)(dir)) return { block: false };
    const cursorPath = (0, import_node_path5.join)(dir, "cursor.json");
    const cursor = this.readJson(cursorPath, { lastProcessed: null });
    const fresh = this.inbox(agentId).filter((m) => !cursor.lastProcessed || m.id > cursor.lastProcessed).sort((a, b) => a.id < b.id ? -1 : 1);
    if (fresh.length === 0) return { block: false };
    cursor.lastProcessed = fresh[fresh.length - 1].id;
    this.atomicWriteJson(cursorPath, cursor);
    this.appendLog({ kind: "drain", agentId, count: fresh.length });
    const lines = fresh.map((m) => `- [from ${m.from}, ${m.act}] ${m.subject}: ${m.body}`).join("\n");
    const reason = [
      `You have ${fresh.length} new hive message(s) in your inbox. Address them before finishing:`,
      lines,
      // Native separators (join, not string-concatenated `/`) so a Windows agent is
      // handed a path its own shell/tools accept, not `C:\…\agents\god/inbox/`.
      `Open the files in ${(0, import_node_path5.join)(dir, "inbox")} for full detail, act on each, then move handled ones to ${(0, import_node_path5.join)(dir, "inbox", ".done")}. Reply via your outbox if a message requires it.`
    ].join("\n");
    return { block: true, reason };
  }
  // — agent-facing text —
  identityText(meta) {
    const caps = (meta.capabilities ?? []).join(", ") || "\u2014";
    return [
      `# ${meta.name} (${meta.id})`,
      "",
      `- Role: ${meta.role ?? (meta.isGod ? "orchestrator (god)" : "agent")}`,
      `- Capabilities: ${caps}`,
      `- Working directory: ${meta.cwd}`,
      meta.isGod ? "- You are the **god / orchestrator**. You run the floor \u2014 keep awareness of the whole team, delegate execution, and personally own only the important calls (decomposition, sign-offs, conflicts, integration), not the grunt work." : "",
      meta.isGod ? "- Monitor the team with `fleet.json` (live per-agent status/tokens/cost/breaker) and `registry.json`; full command reference in `COMMANDS.md`. `claude agents` does NOT list your hive siblings." : "",
      ""
    ].filter(Boolean).join("\n");
  }
  /**
   * The system-prompt prefix injected into every spawn via --append-system-prompt.
   *
   * 🔒 PROMPT-CACHE INVARIANT — keep this prefix VOLATILE-FREE. It interpolates
   * only values stable for an agent's whole lifetime (name, id, dir, root,
   * semanticMemory). Do NOT add dates, UUIDs, counters, board/registry state, or
   * any `Date.now()`-derived text here: a prefix that changes per spawn defeats
   * Anthropic's prompt cache (re-priming the whole system prompt every turn).
   * Volatile context belongs on the live channels — the inbox (hive messages) and
   * the PTY — never baked into this prefix. (Lane A #6.1.)
   *
   * 🪟 NO SHELL SYNTAX. Every path and command here is written the way the AGENT
   * will actually type it, on the platform it is running on. That rules out two
   * habits that were silently Windows-only breakage:
   *  - `$VAR` — POSIX-only. Under cmd.exe `$HIVE_NODE`/`$KG_CLI` expand to nothing
   *    and under PowerShell to an undefined variable, so those instructions were
   *    dead on every Windows floor. Bake the ABSOLUTE resolved path instead: it is
   *    platform-independent, needs no expansion, and stays prompt-cache-stable.
   *  - `'…' + '/inbox/'` — string-concatenating separators told a Windows agent to
   *    read `C:\Users\x\hive\agents\god/inbox/`. Use join() so the agent's own
   *    tooling gets a path it can pass straight to its shell.
   */
  injectedPrompt(meta, dir, root, semanticMemory, knowledgeGraph, kgCliPath) {
    const inDir = (...parts) => (0, import_node_path5.join)(dir, ...parts);
    const inRoot = (...parts) => (0, import_node_path5.join)(root, ...parts);
    const godRegistry = meta.isAssistant ? this.registry() : null;
    const godNameForPrompt = godRegistry ? resolveGodName(godRegistry.agents[godRegistry.godId ?? "god"]?.name) : "";
    const ctxLine = "LIVE CONTEXT: each agent row in the LIVE ROSTER carries a `ctx NN%` tag \u2014 its live context-window occupancy. Treat it as the real headroom signal when routing: prefer an agent with a LOW `ctx` for a big task; treat a HIGH `ctx` (near 100%) as busy rather than idle, even if the cumulative token count looks modest.";
    const memoryLine = semanticMemory ? 'Semantic memory: the whole hive shares a searchable MemPalace at the path in your MEMPALACE_PALACE_PATH environment variable. To recall relevant past knowledge across the team, run `mempalace search "<query>"`; run `mempalace wake-up` at the start of a task for a memory digest. Your notes in memory.md are mined into the palace automatically \u2014 write durable facts there.' : "";
    const hiveNode = this.nodeCommand();
    const kgCli = kgCliPath || (process.platform === "win32" ? "%KG_CLI%" : "$KG_CLI");
    const knowledgeLine = knowledgeGraph ? `Enterprise knowledge: this organisation has a private Knowledge Graph of its own documents, policies, and business context. When a task needs that context \u2014 company-specific facts, house style, internal processes \u2014 query it instead of guessing: run \`"${hiveNode}" "${kgCli}" search "<query>"\` for ranked passages, \`"${hiveNode}" "${kgCli}" list\` to see what is available, and \`"${hiveNode}" "${kgCli}" get <id>\` for a full document. (That first path is the harness's bundled Node \u2014 use it instead of bare \`node\`, which may not be on your PATH.)` : "";
    const rt = this.runtimeInfo();
    const runtimeLine = rt ? `RUNNING BUILD: Munder Difflin v${rt.version}, ${rt.packaged ? "packaged app" : "local dev build"}${rt.appPath ? `, from ${rt.appPath}` : ""}. Say this version if asked which one is running, and do not assume behaviour from an older one. A local dev build inherits the launching shell's environment (umask included) where a packaged app does not, so file modes and inherited env can legitimately differ between the two. \`log.jsonl\` records an \`app-start\` event on every launch, which is how you spot a restart or a build switch.` : "";
    const spawnQueueLine = meta.isGod && this.orchestratorMaySpawn() ? `SPAWNING A WORKER: you can start an ephemeral worker yourself by writing ONE JSON file into ${inRoot("spawn-requests")}/<id>.json. Required: \`objective\` (what the worker must do) and \`cwd\` (the repo it runs in). Optional: \`name\`, \`command\`, \`provider\`, \`model\`, \`isolate\` (default true = its own git worktree), \`tokenCap\`, and \`slack\` ({channel, thread_ts}) to route its failures back to a thread. The harness polls that directory, spawns \`worker-<id>\`, and moves the request to \`spawn-requests/.done/\` on success or \`.failed/\` with a reason. This is the ONLY way you can spawn; a hire manifest under research/hires/ needs the human to confirm it in the UI, so it is not a route you can complete on your own. Reuse an existing agent first, as above \u2014 a worker is a fresh spend every time.` : "";
    const godLine = meta.isGod ? `You are the GOD / ORCHESTRATOR of this hive \u2014 your job is to ORCHESTRATE, not to implement: maintain live situational awareness and delegate the work. (1) AWARENESS \u2014 always know what is going on: keep an accurate picture of every agent (active vs archived/idle), the task board, and all in-flight work; drain your inbox continually and triage every other agent's requests, answering clarifications so the team runs autonomously. (2) DELEGATE \u2014 decompose work and fan it out to the hive agents via their inboxes (route messages and assign owners; do not do their jobs); do NOT take on grunt implementation yourself. Stay aware of who is already on the floor and delegate OPPORTUNISTICALLY: BEFORE you spawn anything, CHECK THE LIVE ROSTER (active agents in registry.json + their state in fleet.json) and prefer routing to an EXISTING agent that fits \u2014 above all when the request names one ("ask Pam to\u2026", "have Jim\u2026"), route to that agent instead of reflexively creating a new one. Reuse an idle or already-running agent whose role matches; only spawn a fresh agent when no existing one is a sensible fit, and say that you checked. One capable owner beats a duplicate. (3) OWN ONLY THE IMPORTANT, high-leverage things \u2014 task decomposition, dispatch decisions, sign-offs, conflict resolution, branch integration, and final QA \u2014 and remain the sole scribe of board.md. You are otherwise fully autonomous \u2014 there is NO separate approval queue. For the genuinely critical (destructive actions, spending real money, scope changes, unresolvable conflicts), ask the human directly in your own session and let the tool-permission prompt gate the action; the human approves natively, including remotely from their phone via /remote-control. Keep the team unblocked. When you DISPATCH a task, write it as a 4-part contract so the agent can run autonomously: (1) OBJECTIVE \u2014 the concrete goal; (2) OUTPUT \u2014 the expected deliverable/format; (3) TOOLS \u2014 what to use or avoid, and any references to read instead of re-deriving; (4) BOUNDARIES \u2014 scope limits + the definition of done. Pass references (file paths, message ids, board sections), not pasted content \u2014 keep dispatches short. MONITOR the floor by reading ${inRoot("fleet.json")} (live per-agent tokens, cost, status, last tool, breaker level, inbox backlog) and ${inRoot("registry.json")} \u2014 note that running 'claude agents' will NOT list your hive's sibling agents. A full Claude Code command reference is at ${inRoot("COMMANDS.md")} (slash commands act ONLY on your own session; CLI commands run in your shell and can target the fleet). You periodically receive scheduler / "Heartbeat" standup requests \u2014 on each, review every agent via fleet.json, re-engage anyone stalled, over-budget, or breaker-armed, and keep board.md and tasks.json accurate. In tasks.json, ALWAYS set each task's "assignee" to the worker's agent id the moment you dispatch it, and NEVER clear it on status changes \u2014 a done card must still say who did the work (the human reads the board by who-did-what). HUMAN FEEDBACK is first-class in the ledger: when a task can only proceed with the human's input \u2014 a QUESTION to answer OR an ACTION only the human can perform (create an account, approve a purchase, provide credentials/screenshots, test on their device) \u2014 set its status to "blocked" and append the concrete ask to the card's "humanQA" array (push {"q":"...","askedAt":"<iso>"}; phrase actions as clear to-dos; keep every past entry \u2014 the history documents the card's decisions). WRITE THE ASK SHORT AND IN MARKDOWN. The human reads it on a CARD, not in a terminal, so an ask longer than a short paragraph plus its options (roughly 700 characters) is a report, not a question \u2014 cut the narrative, keep the decision. Open with ONE **bold** sentence saying exactly what you need from them; put paths, commands, values and identifiers in \`backticks\`; give each option or step its own "-" bullet or "1." number; leave a blank line between paragraphs (a single newline is a line break, so each option stays on its own line). When the ask originates in another agent's report, REWRITE it into that shape \u2014 never paste the report body in as the question, and never make the human read the investigation to find the decision. The harness surfaces open questions on the office floor's ASK ME board; the human's answer lands in the same entry ("a") AND arrives as an inbox message to you \u2014 read it, act on it, and unblock the card so work continues. Do NOT park human questions in separate files (no HumanQuestion.md) and never sit waiting on the human in your own session. Steward the token budget.` : meta.isAssistant ? `You are ${godNameForPrompt}'s PREP ASSISTANT. You will be handed short, possibly vague instructions (each begins with "ENRICH TASK:"). For each one: (1) figure out which project it concerns and cd into the most relevant repo \u2014 you start in ${godNameForPrompt}'s home directory; (2) gather concrete context READ-ONLY (exact file paths, current state, relevant code, conventions, active branch, gotchas) \u2014 NEVER modify, create, or delete files; (3) rewrite the instruction into ONE clear, self-contained prompt that ${godNameForPrompt} can execute autonomously, preserving the user's original intent without inventing scope. Then deliver it: write ONE message JSON into your outbox with "to":"god", "act":"request", a short subject, and the finished prompt as the body. Do NOT perform the task yourself \u2014 your only output is the improved prompt sent to ${godNameForPrompt}.` : 'For anything ambiguous, cross-cutting, or needing sign-off, address a message to "god".';
    const guardrailsLine = 'Guardrails: a circuit breaker watches the floor \u2014 a "Circuit breaker: steer/constrain" message means you are looping or overspending, so STOP repeating, summarize what you tried, and follow it. Be token-frugal (a floor-wide or per-agent token budget can pause you). The shared plan has two parts: board.md (freeform; god is the sole scribe) and tasks.json (structured kanban \u2014 todo/doing/blocked/done).';
    const slackLine = meta.isGod ? 'SLACK REPLIES: When composing a Slack reply (or writing the `result` field of a Slack-origin kanban card), you MUST: (1) directly address what the user asked \u2014 never a bare "done"; (2) include the relevant specifics, outcome, and details; (3) format for Slack mrkdwn \u2014 open with a short *bold* headline, use bullet points for multiple items, wrap code/paths in `backtick` blocks, keep it concise (no walls of text). When finishing a Slack-origin task, always write a complete, user-facing, well-formatted `result` on the kanban card \u2014 the system posts it verbatim to Slack as the done reply.' : `SLACK REPLIES: If god dispatches you a task that came from Slack, it will include an exact \`"${hiveNode}" "<helper>" --channel \u2026 --thread \u2026 --text "\u2026"\` reply command \u2014 when you finish, run it VERBATIM to post your result back to that thread yourself. The reply must be SUBSTANTIVE Slack mrkdwn (a short *bold* headline + the actual outcome/specifics/links), NEVER a bare "done".`;
    return [
      `You are "${meta.name}" (${meta.id}), an autonomous agent in a collaborating hive of Claude agents.`,
      `Your private workspace is ${dir}. The shared hive is ${root}. Full protocol: ${inRoot("PROTOCOL.md")}.`,
      "",
      "HIVE PROTOCOL \u2014 follow it every task:",
      `1. At the START of a task, read ${inDir("memory.md")} and EVERY file in ${inDir("inbox")} (messages other agents sent you). After handling an inbox message, move its file into ${inDir("inbox", ".done")}.`,
      `2. Record durable facts, decisions, and context by appending to ${inDir("memory.md")}.`,
      `3. To ask another agent for something or share information, write ONE message JSON into ${inDir("outbox")} (schema in PROTOCOL.md). NEVER write into another agent's folder \u2014 the orchestrator delivers your outbox.`,
      "4. At the END of a task, append what you learned to memory.md so future-you remembers.",
      guardrailsLine,
      memoryLine,
      knowledgeLine,
      godLine,
      spawnQueueLine,
      runtimeLine,
      slackLine,
      ctxLine,
      `Env vars available to you: AGENT_ID, AGENT_NAME, HIVE_ROOT, AGENT_DIR.`
    ].filter(Boolean).join("\n");
  }
  // — messaging —
  /** Normalize a partial message into a full HiveMessage. */
  normalize(partial, from) {
    const act = partial.act ?? "inform";
    return {
      id: partial.id ?? `${stamp()}-${shortRand()}`,
      conversation: partial.conversation ?? `conv-${shortRand()}`,
      in_reply_to: partial.in_reply_to ?? null,
      from: partial.from ?? from,
      to: partial.to ?? "god",
      act,
      subject: partial.subject ?? "",
      body: partial.body ?? "",
      hops: typeof partial.hops === "number" ? partial.hops : 0,
      requires_reply: partial.requires_reply ?? ["request", "query", "propose"].includes(act),
      needs_human: partial.needs_human ?? false,
      created_at: partial.created_at ?? (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  /** Atomically deliver a message into a recipient agent's inbox.
   *  Returns false when the recipient has no inbox, so the caller can bounce and
   *  log the drop rather than let the message vanish. */
  deliver(msg, toId) {
    const inbox = (0, import_node_path5.join)(this.agentDir(toId), "inbox");
    if (!(0, import_node_fs5.existsSync)(inbox)) return false;
    this.atomicWriteJson((0, import_node_path5.join)(inbox, `${msg.id}.json`), msg);
    return true;
  }
  /** Inject a message directly (used by the orchestrator / UI / tests). */
  send(partial, from = "system") {
    const msg = this.normalize(partial, from);
    this.routeMessage(msg);
    this.commit(`hive: msg ${msg.from}\u2192${msg.to} (${msg.act})`);
    return msg;
  }
  routeMessage(msg) {
    if (msg.hops > HOP_CAP) {
      this.appendLog({ kind: "drop", reason: "hop-cap", from: msg.from, to: msg.to, id: msg.id });
      return;
    }
    const reg = this.registry();
    const godId = reg.godId ?? "god";
    const resolveTo = (to) => to === "human" || to === "god" ? godId : to;
    const targets = msg.to === "broadcast" ? selectBroadcastTargets(reg.agents, msg.from) : [resolveTo(msg.to)].filter((t) => t !== msg.from);
    const delivered = [];
    for (const t of targets) {
      if (reg.agents[t]?.isAssistant) {
        this.deliver({
          ...msg,
          to: godId,
          subject: `[bounced \u2014 "${t}" is the send-only prep assistant; route work to a real agent] ${msg.subject}`
        }, godId);
        continue;
      }
      if (t !== godId && !canReceiveInbox(reg.agents[t]?.provider)) {
        if (!this.emitTerminalHandoff(msg, t)) {
          this.deliver({
            ...msg,
            to: godId,
            subject: `[undeliverable \u2014 "${t}" runs ${reg.agents[t]?.provider ?? "a hookless CLI"} and the terminal handoff failed (renderer unavailable); relay this to it] ${msg.subject}`
          }, godId);
        } else delivered.push(t);
        continue;
      }
      const proxyDesc = bridgeOf(reg.agents[t]?.provider);
      if (t !== godId && proxyDesc?.kind === "proxy" && proxyDesc.inboxDelivery === "terminal") {
        if (!this.emitTerminalHandoff(msg, t)) {
          this.deliver({
            ...msg,
            to: godId,
            subject: `[undeliverable \u2014 "${t}" runs ${reg.agents[t]?.provider ?? "a proxy-tier CLI"} and the terminal handoff failed (renderer unavailable); relay this to it] ${msg.subject}`
          }, godId);
        } else delivered.push(t);
        continue;
      }
      if (this.deliver(msg, t)) {
        delivered.push(t);
        continue;
      }
      this.appendLog({ kind: "drop", reason: "no-inbox", from: msg.from, to: t, id: msg.id });
      if (t !== godId) {
        this.deliver({
          ...msg,
          to: godId,
          subject: `[undeliverable \u2014 no agent "${t}" on this floor; check the id against the roster] ${msg.subject}`
        }, godId);
      }
    }
    this.appendLog({ kind: "message", from: msg.from, to: msg.to, act: msg.act, subject: msg.subject, id: msg.id, delivered });
    this.emitMessage(msg, targets);
    try {
      this.routedObserver?.(msg, targets);
    } catch {
    }
  }
  /** Observer invoked for EVERY routed message with its resolved targets.
   *  Used by main-process features that react to hive traffic (closing time). */
  routedObserver = null;
  setRoutedObserver(cb) {
    this.routedObserver = cb;
  }
  /** Tell the renderer a message was routed, with its resolved recipients, so
   *  the floor can fly an envelope from the sender to each one. Best-effort. */
  emitMessage(msg, targets) {
    this.emit?.("hive:message", {
      id: msg.id,
      from: msg.from,
      to: msg.to,
      act: msg.act,
      subject: msg.subject,
      targets,
      // Coral-tints the floor envelope for a message the agent flagged for the
      // human (now routed to the god proxy). Cosmetic only — no queue behind it.
      needsHuman: msg.to === "human"
    });
  }
  /** Non-Claude providers cannot drain hive inbox; hand direct mail to the
   *  renderer so it can queue a terminal work order for the target PTY. */
  emitTerminalHandoff(msg, targetId) {
    const delivered = this.emit?.("hive:terminalHandoff", {
      id: msg.id,
      from: msg.from,
      to: targetId,
      act: msg.act,
      subject: msg.subject,
      body: msg.body,
      requiresReply: msg.requires_reply,
      createdAt: msg.created_at
    }) === true;
    this.appendLog({
      kind: "terminal-handoff",
      from: msg.from,
      to: targetId,
      act: msg.act,
      subject: msg.subject,
      id: msg.id,
      delivered
    });
    return delivered;
  }
  // — router: drain outboxes → inboxes —
  /** Poll-based router. Cheap and robust vs fs.watch quirks on macOS. */
  startRouter(intervalMs = 1500) {
    if (this.routerTimer || !this.enabled()) return;
    this.routerTimer = setInterval(() => {
      try {
        this.routeOnce();
      } catch {
      }
    }, intervalMs);
  }
  stopRouter() {
    if (this.routerTimer) {
      clearInterval(this.routerTimer);
      this.routerTimer = null;
    }
  }
  routeOnce() {
    const root = this.root();
    if (!root) return 0;
    const agentsDir = (0, import_node_path5.join)(root, "agents");
    if (!(0, import_node_fs5.existsSync)(agentsDir)) return 0;
    let routed = 0;
    for (const id of (0, import_node_fs5.readdirSync)(agentsDir)) {
      const outbox = (0, import_node_path5.join)(agentsDir, id, "outbox");
      if (!(0, import_node_fs5.existsSync)(outbox)) continue;
      for (const f of (0, import_node_fs5.readdirSync)(outbox)) {
        if (!f.endsWith(".json")) continue;
        const full = (0, import_node_path5.join)(outbox, f);
        try {
          const partial = JSON.parse((0, import_node_fs5.readFileSync)(full, "utf8"));
          const msg = this.normalize(partial, id);
          msg.from = id;
          this.routeMessage(msg);
          (0, import_node_fs5.renameSync)(full, (0, import_node_path5.join)(outbox, ".sent", f));
          routed++;
        } catch {
          try {
            (0, import_node_fs5.renameSync)(full, (0, import_node_path5.join)(outbox, ".sent", `bad-${f}`));
          } catch {
          }
        }
      }
    }
    if (routed > 0) this.commit(`hive: routed ${routed} message(s)`);
    return routed;
  }
  // — read helpers (for IPC / UI) —
  registry() {
    const root = this.root();
    if (!root) return { godId: null, agents: {} };
    return this.readJson((0, import_node_path5.join)(root, "registry.json"), { godId: null, agents: {} });
  }
  board() {
    const root = this.root();
    return root && (0, import_node_fs5.existsSync)((0, import_node_path5.join)(root, "board.md")) ? (0, import_node_fs5.readFileSync)((0, import_node_path5.join)(root, "board.md"), "utf8") : "";
  }
  tasks() {
    const root = this.root();
    return root ? this.readJson((0, import_node_path5.join)(root, "tasks.json"), { tasks: [] }) : { tasks: [] };
  }
  /** Persist the task ledger to hive/tasks.json and commit it. Mirrors the
   *  board/message persist pattern: write JSON, log the change, single-commit.
   *
   *  MERGES by card id instead of clobbering. Callers hold PARTIAL models of a
   *  card — the renderer's kanban parser knows nine fields, the god writes as
   *  many as the work needs (`result`, the verbatim Slack reply posted back to
   *  the user; `repo`; `scope`; `origin`; `commit`; …). A wholesale write meant
   *  one small edit through the UI deleted every unmodelled field on EVERY card
   *  on the board. Now an unmentioned field keeps its on-disk value.
   *
   *  Deleting a card still works: the incoming list IS the membership, so a card
   *  dropped from it (TasksKanban dismiss, the voice delete_task action) is
   *  gone. Merging protects fields, never card membership. */
  writeTasks(tasks) {
    const root = this.root();
    if (!root) return;
    this.ensureHive();
    const path3 = (0, import_node_path5.join)(root, "tasks.json");
    const current = this.readJson(path3, { tasks: [] });
    const merged = mergeTaskLedger(current?.tasks, tasks);
    this.writeJson(path3, { tasks: merged });
    this.appendLog({ kind: "tasks", count: merged.length });
    this.commit(`hive: tasks (${merged.length})`);
  }
  /** Append one card against the latest on-disk ledger. Renderer callers must
   *  use this instead of re-writing a collection they read before another
   *  source (webhook, Slack, god, voice) added work. Idempotent by task id. */
  addTask(task) {
    const ledger = this.tasks();
    const tasks = Array.isArray(ledger?.tasks) ? ledger.tasks : [];
    if (tasks.some((current) => current?.id === task.id)) return false;
    this.writeTasks([...tasks, task]);
    return true;
  }
  /** Patch one card against the latest on-disk ledger, preserving unrelated
   *  cards and fields (notably webhook.tokenHash and Slack thread metadata). */
  patchTask(id, patch) {
    const ledger = this.tasks();
    const tasks = Array.isArray(ledger?.tasks) ? ledger.tasks : [];
    const index = tasks.findIndex((task) => task?.id === id);
    if (index < 0) return false;
    const next = tasks.slice();
    next[index] = { ...tasks[index], ...patch, id };
    this.writeTasks(next);
    return true;
  }
  /** Delete only the named card from the latest on-disk ledger. */
  deleteTask(id) {
    const ledger = this.tasks();
    const tasks = Array.isArray(ledger?.tasks) ? ledger.tasks : [];
    const next = tasks.filter((task) => task?.id !== id);
    if (next.length === tasks.length) return false;
    this.writeTasks(next);
    return true;
  }
  memory(id) {
    const p = (0, import_node_path5.join)(this.agentDir(id), "memory.md");
    return (0, import_node_fs5.existsSync)(p) ? (0, import_node_fs5.readFileSync)(p, "utf8") : "";
  }
  /** Whether an agent has recorded NON-TRIVIAL memory — i.e. has appended real
   *  notes beyond the boilerplate header ensureAgent seeds. Lets the voice
   *  read-layer answer "what has the team remembered" and enumerate who has
   *  anything worth reading (every registered agent technically has a memory.md,
   *  but most of the floor's history lives in a handful of them). Cheap: reads a
   *  small markdown file; never throws. Works for ANY id, active OR archived. */
  hasMemory(id) {
    const p = (0, import_node_path5.join)(this.agentDir(id), "memory.md");
    if (!(0, import_node_fs5.existsSync)(p)) return false;
    try {
      return (0, import_node_fs5.readFileSync)(p, "utf8").trim().length > 200;
    } catch {
      return false;
    }
  }
  inbox(id) {
    return this.listMessages((0, import_node_path5.join)(this.agentDir(id), "inbox"));
  }
  /** Read an agent's OUTBOX (messages it has authored/sent). Symmetric with
   *  inbox(); the router drains live outbox files into recipients' inboxes and
   *  archives the original under outbox/.sent, so a sent message survives there. */
  outbox(id) {
    return this.listMessages((0, import_node_path5.join)(this.agentDir(id), "outbox"));
  }
  /**
   * Voice read-layer: recent message CONTENT (inbox + outbox bodies) for the
   * operator briefing, REDACTED main-side. This is the message-content half of
   * the voice query surface (the activity half is logTail()).
   *
   * Modes:
   *   - { id }                → the single message with that id, wherever it lives.
   *   - { agentId }           → recent messages in that agent's mailbox only.
   *   - {}                    → recent messages across the whole floor, newest first.
   * `limit` caps the list (default 12, max 40); `includeArchived` (default true)
   * also reads the handled subfolders (inbox/.done, outbox/.sent).
   *
   * SECURITY: every subject + body is passed through redactSecrets() here, in
   * main, so no secret and no raw body ever crosses IPC. Delivered messages exist
   * in both the sender's outbox/.sent and the recipient's inbox/.done; we dedup
   * by message id so each appears once.
   */
  voiceMessages(opts = {}) {
    const root = this.root();
    if (!root) return [];
    const agentsDir = (0, import_node_path5.join)(root, "agents");
    if (!(0, import_node_fs5.existsSync)(agentsDir)) return [];
    const wantId = typeof opts.id === "string" ? opts.id.trim() : "";
    const onlyAgent = typeof opts.agentId === "string" ? opts.agentId.trim() : "";
    const includeArchived = opts.includeArchived !== false;
    let owners;
    try {
      owners = onlyAgent ? [onlyAgent] : (0, import_node_fs5.readdirSync)(agentsDir).filter((id) => !id.startsWith(".") && (0, import_node_fs5.existsSync)(this.agentDir(id)));
    } catch {
      return [];
    }
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const owner of owners) {
      const base = this.agentDir(owner);
      const folders = [
        { dir: (0, import_node_path5.join)(base, "inbox"), direction: "inbox", archived: false },
        { dir: (0, import_node_path5.join)(base, "outbox"), direction: "outbox", archived: false }
      ];
      if (includeArchived) {
        folders.push({ dir: (0, import_node_path5.join)(base, "inbox", ".done"), direction: "inbox", archived: true });
        folders.push({ dir: (0, import_node_path5.join)(base, "outbox", ".sent"), direction: "outbox", archived: true });
      }
      for (const f of folders) {
        for (const m of this.listMessages(f.dir)) {
          if (!m || typeof m.id !== "string" || seen.has(m.id)) continue;
          seen.add(m.id);
          if (wantId && m.id !== wantId) continue;
          out.push({
            id: m.id,
            conversation: m.conversation,
            from: m.from,
            to: m.to,
            act: m.act,
            subject: redactSecrets(m.subject),
            body: redactSecrets(m.body),
            requires_reply: !!m.requires_reply,
            direction: f.direction,
            owner,
            archived: f.archived,
            created_at: m.created_at
          });
        }
      }
    }
    out.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    if (wantId) return out.slice(0, 1);
    const lim = typeof opts.limit === "number" && isFinite(opts.limit) ? Math.max(1, Math.min(40, Math.round(opts.limit))) : 12;
    return out.slice(0, lim);
  }
  /** Count undrained inbox messages for an agent (cheap — for the fleet snapshot). */
  inboxBacklog(id) {
    const dir = (0, import_node_path5.join)(this.agentDir(id), "inbox");
    if (!(0, import_node_fs5.existsSync)(dir)) return 0;
    try {
      return (0, import_node_fs5.readdirSync)(dir).filter((f) => f.endsWith(".json")).length;
    } catch {
      return 0;
    }
  }
  /** Install the Antigravity (`agy`) lifecycle-hook bridge: write the normalizer
   *  shim and merge a `munder-hive` hook group into agy's global hooks.json so a
   *  Gemini worker reports PreToolUse/PostToolUse/Stop/PreInvocation/PostInvocation
   *  to this HookServer (live status + guarded idle delivery), reusing the Claude pipeline.
   *
   *  Two agy-isms handled: (1) antigravity-cli#49 — agy LOADS hooks from
   *  `~/.gemini/antigravity-cli/hooks.json` but TRIGGERS from `~/.gemini/config/
   *  hooks.json`, so we write BOTH; (2) commands go to cmd.exe and agy mangles
   *  embedded quotes, so the shim path must be space-free (hive roots are).
   *  Runtime-scoped by AGENT_ID (the shim no-ops for non-hive agy sessions), so
   *  this global config never disturbs the user's own `agy` usage. Best-effort,
   *  idempotent (only our own group is overwritten). */
  installAgyHooks() {
    const root = this.root();
    if (!root) return;
    const shim = (0, import_node_path5.join)(root, "bin", "agy-hook.cjs");
    (0, import_node_fs5.mkdirSync)((0, import_node_path5.join)(root, "bin"), { recursive: true });
    (0, import_node_fs5.writeFileSync)(shim, AGY_HOOK_SHIM, "utf8");
    const tool = (event) => ({
      matcher: "*",
      hooks: [{ type: "command", command: this.nodeRunUnquoted(shim, event), timeout: 0 }]
    });
    const plain = (event) => ({
      hooks: [{ type: "command", command: this.nodeRunUnquoted(shim, event), timeout: 0 }]
    });
    const group = {
      PreToolUse: [tool("PreToolUse")],
      PostToolUse: [tool("PostToolUse")],
      PreInvocation: [plain("PreInvocation")],
      PostInvocation: [plain("PostInvocation")],
      Stop: [plain("Stop")]
    };
    const gem = (0, import_node_path5.join)((0, import_node_os3.homedir)(), ".gemini");
    for (const p of [(0, import_node_path5.join)(gem, "config", "hooks.json"), (0, import_node_path5.join)(gem, "antigravity-cli", "hooks.json")]) {
      try {
        (0, import_node_fs5.mkdirSync)((0, import_node_path5.dirname)(p), { recursive: true });
        let existing = {};
        if ((0, import_node_fs5.existsSync)(p)) {
          try {
            existing = JSON.parse((0, import_node_fs5.readFileSync)(p, "utf8"));
          } catch {
            existing = {};
          }
        }
        existing["munder-hive"] = group;
        (0, import_node_fs5.writeFileSync)(p, JSON.stringify(existing, null, 2), "utf8");
      } catch {
      }
    }
  }
  /** Official Google Gemini CLI lifecycle bridge. Gemini's hook payload is
   *  already snake_case; the shim maps event names into HookServer's common
   *  vocabulary and translates deny/steering replies back to Gemini.
   *
   *  The system settings path is per agent. Gemini merges object and array
   *  settings across layers, so auth and user settings remain in their normal
   *  GEMINI_CLI_HOME while this trusted bridge stays isolated. */
  installGeminiHooks(dir) {
    const home = (0, import_node_path5.join)(dir, ".gemini-hive");
    const settingsPath = (0, import_node_path5.join)(home, "system-settings.json");
    try {
      (0, import_node_fs5.mkdirSync)(home, { recursive: true });
      const shim = (0, import_node_path5.join)(home, "gemini-hook.cjs");
      (0, import_node_fs5.writeFileSync)(shim, GEMINI_HOOK_SHIM, "utf8");
      const hook = (name, matcher) => ({
        ...matcher ? { matcher } : {},
        sequential: true,
        hooks: [{
          name: `munder-hive-${name}`,
          type: "command",
          command: this.nodeRunUnquoted(shim),
          timeout: 3e4
        }]
      });
      const settings = {
        hooksConfig: { enabled: true, notifications: false },
        hooks: {
          SessionStart: [hook("session-start")],
          BeforeAgent: [hook("before-agent")],
          BeforeTool: [hook("before-tool", ".*")],
          AfterTool: [hook("after-tool", ".*")],
          AfterAgent: [hook("after-agent")]
        }
      };
      (0, import_node_fs5.writeFileSync)(settingsPath, JSON.stringify(settings, null, 2), "utf8");
    } catch (e) {
      console.error("[hive] installGeminiHooks failed:", e);
    }
    return settingsPath;
  }
  /** Codex lifecycle-hook bridge → full hive parity for a `codex` worker (live
   *  status + Stop→inbox-drain), the codex counterpart of installAgyHooks().
   *
   *  Codex's hook contract is already Claude-shaped: snake_case stdin
   *  (hook_event_name/tool_name/tool_input/session_id/cwd) and a matching response
   *  contract, where `Stop` honoring {decision:'block',reason} means "continue,
   *  using reason as the next prompt" — exactly what drainForStop() returns. So we
   *  reuse the Claude `cth-hook` shim VERBATIM (no translator, unlike agy) and let
   *  HookServer handle everything unchanged.
   *
   *  ISOLATION: rather than mutate the user's global Codex configuration (which
   *  also holds their login), we point this worker at a PER-AGENT CODEX_HOME
   *  (`<dir>/.codex`, alongside Claude's settings.json) holding our own config.toml
   *  with `[hooks]` tables — so the hooks fire ONLY for hive workers and a personal
   *  `codex` run is untouched. Rollout directories are linked into that isolated
   *  home from namespaced paths under the standard global scan roots. The user's
   *  ~/.codex/auth.json is linked in and their config.toml is copied + extended
   *  (login + model/provider/trust settings still apply).
   *  Returns the CODEX_HOME path for the caller to put in the worker's env. */
  installCodexHooks(dir, agentId) {
    const home = (0, import_node_path5.join)(dir, ".codex");
    try {
      (0, import_node_fs5.mkdirSync)(home, { recursive: true });
      const userHome = (0, import_node_path5.join)((0, import_node_os3.homedir)(), ".codex");
      const authSrc = (0, import_node_path5.join)(userHome, "auth.json");
      const authDest = (0, import_node_path5.join)(home, "auth.json");
      if ((0, import_node_fs5.existsSync)(authSrc) && !(0, import_node_fs5.existsSync)(authDest)) {
        try {
          (0, import_node_fs5.symlinkSync)(authSrc, authDest);
        } catch {
          try {
            (0, import_node_fs5.copyFileSync)(authSrc, authDest);
          } catch {
          }
        }
      }
      const packagesSrc = (0, import_node_path5.join)(userHome, "packages");
      const packagesDest = (0, import_node_path5.join)(home, "packages");
      if ((0, import_node_fs5.existsSync)(packagesSrc) && !(0, import_node_fs5.existsSync)(packagesDest)) {
        try {
          (0, import_node_fs5.symlinkSync)(packagesSrc, packagesDest, process.platform === "win32" ? "junction" : "dir");
        } catch {
        }
      }
      const shim = this.shimPath();
      let config = (0, import_node_fs5.existsSync)((0, import_node_path5.join)(userHome, "config.toml")) ? (0, import_node_fs5.readFileSync)((0, import_node_path5.join)(userHome, "config.toml"), "utf8") : "";
      if (shim) {
        const events = [
          "PreToolUse",
          "PostToolUse",
          "Stop",
          "SubagentStop",
          "SessionStart",
          "UserPromptSubmit",
          "PreCompact",
          "PostCompact"
        ];
        config += "\n# --- munder-hive lifecycle hooks (auto-generated; do not edit) ---\n";
        for (const ev of events) {
          config += `
[[hooks.${ev}]]
[[hooks.${ev}.hooks]]
type = "command"
command = '${this.nodeRunUnquoted(shim)}'
timeout = 30
`;
        }
      }
      (0, import_node_fs5.writeFileSync)((0, import_node_path5.join)(home, "config.toml"), config, "utf8");
      this.exposeCodexDataDirs(home, userHome, agentId);
    } catch (e) {
      console.error("[hive] installCodexHooks failed:", e);
    }
    return home;
  }
  exposeCodexDataDirs(home, userHome, agentId) {
    for (const kind of ["sessions", "archived_sessions"]) {
      try {
        this.exposeCodexDataDir(home, userHome, agentId, kind);
      } catch (e) {
        console.error(`[hive] exposeCodexDataDir(${kind}) failed:`, e);
      }
    }
  }
  moveCodexDataDir(from, to) {
    try {
      (0, import_node_fs5.renameSync)(from, to);
    } catch (e) {
      if (e.code !== "EXDEV") throw e;
      (0, import_node_fs5.cpSync)(from, to, { recursive: true, force: false, errorOnExist: true });
      (0, import_node_fs5.rmSync)(from, { recursive: true, force: true });
    }
  }
  exposeCodexDataDir(home, userHome, agentId, kind) {
    const root = this.root();
    if (!root) return;
    if (!agentId || (0, import_node_path5.basename)(agentId) !== agentId || agentId === "." || agentId === "..") {
      throw new Error(`invalid agent id: ${agentId}`);
    }
    const source = (0, import_node_path5.join)(home, kind);
    const scanRoot = (0, import_node_path5.join)(userHome, kind, "munder-difflin");
    const hiveId = (0, import_node_crypto.createHash)("sha1").update(root).digest("hex").slice(0, 12);
    const target = (0, import_node_path5.join)(scanRoot, hiveId, agentId);
    let sourceStat = null;
    try {
      sourceStat = (0, import_node_fs5.lstatSync)(source);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if (sourceStat?.isSymbolicLink()) {
      let current = null;
      try {
        current = (0, import_node_fs5.realpathSync)(source);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
        (0, import_node_fs5.unlinkSync)(source);
        sourceStat = null;
      }
      if (current) {
        const rel = (0, import_node_path5.relative)((0, import_node_fs5.realpathSync)(scanRoot), current);
        const scope = (0, import_node_path5.dirname)(rel);
        if (rel && !rel.startsWith("..") && !(0, import_node_path5.isAbsolute)(rel) && (0, import_node_path5.dirname)(scope) === "." && (0, import_node_path5.basename)(rel) === agentId) return;
        throw new Error(`${source} points outside ${scanRoot}`);
      }
    }
    if (sourceStat && !sourceStat.isDirectory()) throw new Error(`${source} is not a directory`);
    (0, import_node_fs5.mkdirSync)((0, import_node_path5.dirname)(target), { recursive: true });
    if (sourceStat) {
      if ((0, import_node_fs5.existsSync)(target)) {
        if ((0, import_node_fs5.readdirSync)(target).length > 0) throw new Error(`${source} and ${target} both contain data`);
        (0, import_node_fs5.rmSync)(target, { recursive: true, force: true });
      }
      this.moveCodexDataDir(source, target);
    } else if (!(0, import_node_fs5.existsSync)(target)) {
      (0, import_node_fs5.mkdirSync)(target, { recursive: true });
    }
    try {
      (0, import_node_fs5.symlinkSync)(target, source, process.platform === "win32" ? "junction" : "dir");
    } catch (e) {
      if (!(0, import_node_fs5.existsSync)(source) && (0, import_node_fs5.existsSync)(target)) {
        try {
          this.moveCodexDataDir(target, source);
        } catch {
        }
      }
      throw e;
    }
  }
  /** Remove rollout directories moved under the user's standard Codex scan
   *  roots before a full hive reset removes the isolated CODEX_HOME links. */
  removeExposedCodexData() {
    const root = this.root();
    if (!root) return;
    const agents = (0, import_node_path5.join)(root, "agents");
    if (!(0, import_node_fs5.existsSync)(agents)) return;
    const userHome = (0, import_node_path5.join)((0, import_node_os3.homedir)(), ".codex");
    for (const entry of (0, import_node_fs5.readdirSync)(agents, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      for (const kind of ["sessions", "archived_sessions"]) {
        const source = (0, import_node_path5.join)(agents, entry.name, ".codex", kind);
        try {
          if (!(0, import_node_fs5.lstatSync)(source).isSymbolicLink()) continue;
          const target = (0, import_node_fs5.realpathSync)(source);
          const scanRoot = (0, import_node_fs5.realpathSync)((0, import_node_path5.join)(userHome, kind, "munder-difflin"));
          const rel = (0, import_node_path5.relative)(scanRoot, target);
          const scope = (0, import_node_path5.dirname)(rel);
          if (!rel || rel.startsWith("..") || (0, import_node_path5.isAbsolute)(rel) || (0, import_node_path5.dirname)(scope) !== "." || (0, import_node_path5.basename)(rel) !== entry.name) continue;
          (0, import_node_fs5.rmSync)(target, { recursive: true, force: true });
        } catch (e) {
          if (e.code !== "ENOENT") {
            console.error("[hive] removeExposedCodexData failed:", e);
          }
        }
      }
    }
  }
  /** Pi (earendil-works) bridge. Pi has a rich `pi.on(event, …)` lifecycle but no
   *  Claude-shaped hook file; instead we drop a bundled EXTENSION into a PER-AGENT
   *  PI_CODING_AGENT_DIR (so the user's global ~/.pi is never mutated) that, when Pi
   *  loads it, posts cth-hook-shaped payloads to HIVE_SOCK on tool_call/agent_end and
   *  auto-approves tool calls when the floor is in auto mode (HIVE_AUTO_APPROVE).
   *  Emitting an `agent_end`→`Stop` keeps the harness status in step (→ idle), which
   *  lets the renderer idle inbox-wake nudge deliver mail. Returns the per-agent dir
   *  for PI_CODING_AGENT_DIR.
   *
   *  LIVE-UNVERIFIED: Pi's exact extension-discovery path + event API need BYOK keys
   *  to confirm; this is written best-effort and wrapped so a wrong guess can never
   *  break the spawn. The renderer nudge is the guaranteed drain regardless. */
  installPiHooks(dir) {
    const home = (0, import_node_path5.join)(dir, ".pi-agent");
    try {
      const extDir = (0, import_node_path5.join)(home, "extensions");
      (0, import_node_fs5.mkdirSync)(extDir, { recursive: true });
      (0, import_node_fs5.writeFileSync)((0, import_node_path5.join)(extDir, "hive-bridge.js"), PI_EXTENSION, "utf8");
      const manifest = { name: "munder-hive-bridge", version: "0.3.1", main: "extensions/hive-bridge.js", auto: true };
      (0, import_node_fs5.writeFileSync)((0, import_node_path5.join)(home, "extensions.json"), JSON.stringify(manifest, null, 2), "utf8");
    } catch (e) {
      console.error("[hive] installPiHooks failed:", e);
    }
    return home;
  }
  /** OpenCode (anomalyco/opencode) bridge — god Decision 1 (native plugin, not proxy).
   *  OpenCode has no Claude-shaped Stop hook, but its plugin API exposes a real
   *  `session.idle` lifecycle event. We drop a bundled PLUGIN into a PER-AGENT config
   *  dir's `plugin/` folder (OpenCode auto-loads `*.js` plugins from there) that posts
   *  HIVE_SOCK payloads on tool.execute.before/after + session.idle — the same
   *  Stop→drain semantics as codex's hooks, provider-agnostic, no traffic interception.
   *  Returns the config dir for OPENCODE_CONFIG_DIR (isolates from ~/.config/opencode).
   *
   *  LIVE-UNVERIFIED: plugin auto-load + session.idle firing + the inject path need
   *  BYOK keys to confirm; written best-effort, wrapped so it can't break the spawn.
   *  The renderer idle inbox-wake nudge is the guaranteed drain fallback. */
  installOpenCodePlugin(dir, theme) {
    const home = (0, import_node_path5.join)(dir, ".opencode");
    try {
      if (theme) {
        (0, import_node_fs5.mkdirSync)(home, { recursive: true });
        const choice = { theme: "system" };
        (0, import_node_fs5.writeFileSync)((0, import_node_path5.join)(home, "tui.json"), JSON.stringify({ $schema: "https://opencode.ai/tui.json", ...choice }, null, 2), "utf8");
        (0, import_node_fs5.writeFileSync)((0, import_node_path5.join)(home, "opencode.json"), JSON.stringify({ $schema: "https://opencode.ai/config.json", ...choice }, null, 2), "utf8");
      }
      for (const name of ["plugin", "plugins"]) {
        const pluginDir = (0, import_node_path5.join)(home, name);
        (0, import_node_fs5.mkdirSync)(pluginDir, { recursive: true });
        (0, import_node_fs5.writeFileSync)((0, import_node_path5.join)(pluginDir, "hive-bridge.js"), OPENCODE_PLUGIN, "utf8");
      }
    } catch (e) {
      console.error("[hive] installOpenCodePlugin failed:", e);
    }
    return home;
  }
  /** Crush (charmbracelet/crush) proxy routing. Crush has NO base-URL env override, so
   *  the generic proxy env-rewrite is a no-op for it; instead we write a per-agent
   *  CRUSH_GLOBAL_CONFIG whose standard providers' `base_url` all point at the loopback
   *  proxy (so whatever model the worker picks, its LLM traffic routes through the
   *  sidecar → synthesized Status/Stop/cost → status goes idle → the terminal
   *  work-order + renderer nudge deliver mail). A per-agent CRUSH_GLOBAL_DATA isolates
   *  session state from the user's global ~/.config/crush. Keys ride BYOK env vars
   *  (Crush reads ANTHROPIC_API_KEY/OPENAI_API_KEY/… directly), so none are written
   *  here. `api` follows the proxy's wire shape (advisory). Returns the config + data
   *  paths for the spawn env.
   *
   *  LIVE-UNVERIFIED: the single-upstream proxy serves one provider/endpoint shape at a
   *  time — for full synthesized events pick a model whose provider matches the
   *  configured upstream (or a local OpenAI-compatible endpoint). Cross-provider mixing
   *  is humanQA; the renderer nudge still delivers mail regardless. */
  installCrushConfig(dir, loopbackUrl, api, theme) {
    const config = (0, import_node_path5.join)(dir, "crush.json");
    const data = (0, import_node_path5.join)(dir, ".crush-data");
    try {
      (0, import_node_fs5.mkdirSync)(data, { recursive: true });
      const wireProvider = api === "anthropic" ? "anthropic" : "openai";
      const providers = { [wireProvider]: { base_url: loopbackUrl } };
      const options = theme ? { tui: { transparent: true } } : void 0;
      (0, import_node_fs5.writeFileSync)(config, JSON.stringify(options ? { providers, options } : { providers }, null, 2), "utf8");
    } catch (e) {
      console.error("[hive] installCrushConfig failed:", e);
    }
    return { config, data };
  }
  /** Grok lifecycle-hook bridge → live hive status, session capture, guarded
   *  inbox delivery, and operator gates for `grok` workers.
   *
   *  Grok supports the same hook events and decision vocabulary as Claude Code,
   *  but its stdin payload uses camelCase keys. A small adapter normalizes those
   *  keys to HookServer's Claude-shaped contract. The hook is installed in the
   *  user's global Grok hook directory because global hooks are trusted and
   *  Grok sessions/resume stay in the user's normal GROK_HOME. The adapter is
   *  strictly scoped by AGENT_ID, so ordinary Grok sessions exit without doing
   *  anything. Best-effort and idempotent. */
  installGrokHooks() {
    const root = this.root();
    if (!root) return;
    try {
      const shim = (0, import_node_path5.join)(root, "bin", "grok-hook.cjs");
      (0, import_node_fs5.mkdirSync)((0, import_node_path5.join)(root, "bin"), { recursive: true });
      (0, import_node_fs5.writeFileSync)(shim, GROK_HOOK_SHIM, "utf8");
      const tool = (matcher) => ({
        ...matcher ? { matcher } : {},
        // Let Grok apply its event-aware defaults (5s normally, 600s for Stop).
        // Grok is a HOOK bridge (not a proxy sidecar), so it is hit by the same
        // `node: command not found` 127 — bundled node here too.
        hooks: [{ type: "command", command: this.nodeRun(shim) }]
      });
      const hooks = {
        PreToolUse: [tool(".*")],
        PostToolUse: [tool(".*")],
        Stop: [tool()],
        SubagentStop: [tool(".*")],
        SessionStart: [tool(".*")],
        UserPromptSubmit: [tool()],
        PreCompact: [tool(".*")],
        PostCompact: [tool(".*")]
      };
      const hookDir = (0, import_node_path5.join)((0, import_node_os3.homedir)(), ".grok", "hooks");
      (0, import_node_fs5.mkdirSync)(hookDir, { recursive: true });
      (0, import_node_fs5.writeFileSync)(
        (0, import_node_path5.join)(hookDir, "munder-hive.json"),
        JSON.stringify({ hooks }, null, 2),
        "utf8"
      );
    } catch (e) {
      console.error("[hive] installGrokHooks failed:", e);
    }
  }
  /** Write the live fleet snapshot Michael reads (`fleet.json`, gitignored).
   *  Best-effort — called from a timer, must never throw. */
  writeFleetSnapshot(snapshot) {
    const root = this.root();
    if (!root) return;
    try {
      (0, import_node_fs5.writeFileSync)((0, import_node_path5.join)(root, "fleet.json"), JSON.stringify(snapshot, null, 2), "utf8");
    } catch {
    }
  }
  /** Is this agent the hive's god/orchestrator? */
  isGod(agentId) {
    try {
      const reg = this.registry();
      return reg.godId === agentId || !!reg.agents[agentId]?.isGod;
    } catch {
      return false;
    }
  }
  /**
   * A compact, one-shot LIVE ROSTER line built from `fleet.json` — injected into
   * god's context as `additionalContext` on SessionStart and every
   * UserPromptSubmit (see HookServer).
   *
   * Why: fleet.json/registry.json are always fresh on disk (8s snapshot +
   * archiveOrphanedAgents on boot + PTY-exit archiving), but god's CONTEXT is not.
   * After an app restart god resumes a session whose transcript still describes
   * the OLD floor, and it will happily message agents that no longer exist. It is
   * told to read fleet.json, but "told to" is not "always knows" — so we push the
   * truth in on every turn instead. One line, so the cost is negligible.
   *
   * `ctxOf` (optional, supplied by HookServer) lets the caller layer the LIVE
   * context-window occupancy on top of the disk snapshot — each agent gets a
   * `ctx NN%` so god can see at a glance whose context is nearly full when it
   * routes work. fleet.json only carries cumulative `tokens`, which is a spend
   * figure, not how full the CURRENT window is; the real occupancy lives in
   * HookServer.contextById (from the statusLine shim). Omitted when the callback
   * is absent or an agent has no Status tick yet.
   *
   * Returns null when there is nothing to say (no hive, no snapshot, no agents),
   * so the hook stays a no-op rather than injecting noise.
   */
  rosterContext(ctxOf) {
    const root = this.root();
    if (!root) return null;
    try {
      const raw = (0, import_node_fs5.readFileSync)((0, import_node_path5.join)(root, "fleet.json"), "utf8");
      const snap = JSON.parse(raw);
      const agents = Array.isArray(snap.agents) ? snap.agents : [];
      if (!agents.length) return null;
      const ago = (s) => typeof s !== "number" ? "unknown" : s < 90 ? `${s}s ago` : s < 5400 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
      const MAX2 = 24;
      const shown = agents.slice(0, MAX2);
      let anyCtx = false;
      let anyHold = false;
      const rows = shown.map((a) => {
        const bits = [
          a.role ?? "agent",
          typeof a.lastActiveSecAgo === "number" ? `active ${ago(a.lastActiveSecAgo)}` : "no activity yet"
        ];
        if (a.tokens) bits.push(`${Math.round(a.tokens / 1e3)}k tok`);
        if (a.usd) bits.push(`$${a.usd.toFixed(2)}`);
        if (a.inboxBacklog) bits.push(`inbox ${a.inboxBacklog}`);
        if (a.breaker && a.breaker !== "ok" && a.breaker !== "none") bits.push(`breaker ${a.breaker}`);
        if (a.isGod) bits.push("you");
        if (a.onHold) {
          bits.push("ON HOLD \u2014 1:1 with the human");
          anyHold = true;
        }
        const cw = ctxOf?.(a.id);
        if (cw && cw.limit > 0) {
          const pct = Math.max(0, Math.min(100, Math.round(cw.tokens / cw.limit * 100)));
          bits.push(`ctx ${pct}%`);
          anyCtx = true;
        }
        return `${a.id}${a.name ? ` "${a.name}"` : ""} (${bits.join(", ")})`;
      });
      const more = agents.length > shown.length ? ` +${agents.length - shown.length} more` : "";
      const age = typeof snap.ts === "number" ? ago(Math.round((Date.now() - snap.ts) / 1e3)) : "unknown";
      return `[LIVE ROSTER \u2014 auto-injected from ${(0, import_node_path5.join)(root, "fleet.json")}, snapshot ${age}] ${agents.length} ACTIVE agent(s): ${rows.join("; ")}.${more} This is the CURRENT floor and it SUPERSEDES any roster earlier in this conversation \u2014 agents you remember that are absent here have been archived or killed, so do not message them. ` + (anyCtx ? "`ctx NN%` = live window occupancy; absent = not yet reported (unknown, not empty). " : "") + (anyHold ? "An agent marked `ON HOLD \u2014 1:1 with the human` is UNAVAILABLE: the human is working with them directly. Do NOT message them, do NOT dispatch to them, and do NOT count them when picking an owner. Route to someone else, or say the work is waiting. They are still running and their terminal is alive, so this is not a reason to archive them or spawn a replacement. The human flips it off when they are done. " : "") + "Route work to someone on this list before spawning anyone new.";
    } catch {
      return null;
    }
  }
  logTail(n = 200) {
    const root = this.root();
    if (!root || !(0, import_node_fs5.existsSync)((0, import_node_path5.join)(root, "log.jsonl"))) return [];
    const lines = (0, import_node_fs5.readFileSync)((0, import_node_path5.join)(root, "log.jsonl"), "utf8").trim().split("\n").filter(Boolean);
    return lines.slice(-n).map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return { raw: l };
      }
    });
  }
  listMessages(dir) {
    if (!(0, import_node_fs5.existsSync)(dir)) return [];
    return (0, import_node_fs5.readdirSync)(dir).filter((f) => f.endsWith(".json")).sort().map((f) => {
      try {
        return JSON.parse((0, import_node_fs5.readFileSync)((0, import_node_path5.join)(dir, f), "utf8"));
      } catch {
        return null;
      }
    }).filter((m) => m !== null);
  }
  // — log —
  appendLog(event) {
    const root = this.root();
    if (!root) return;
    const line = JSON.stringify({ ts: Date.now(), ...event }) + "\n";
    try {
      (0, import_node_fs5.appendFileSync)((0, import_node_path5.join)(root, "log.jsonl"), line, "utf8");
    } catch {
    }
  }
  /**
   * Append one cost sample to the durable, append-only ledger at
   * `<root>/cost-ledger.jsonl` (Lane A #6.6d). This is the SOLE durable cost
   * store; its row is exactly the shape Kevin (#4) reserves for the cost_ledger
   * SQLite table, so migration is a mechanical INSERT…SELECT.
   *
   * 🔒 PII: persist ONLY the allowlisted AgentUsageSample — NEVER a raw OTel
   * record (those carry user.email / account / org / hashed-user-id). The sample
   * is PII-free by construction upstream (the provider's normalize step), so we
   * add no redaction here; we just must not widen what we write. The file lives
   * at the hive ROOT, so `mempalace mine` (which only scans per-agent dirs) never
   * ingests it — no palace noise, no MINE_IGNORE entry needed.
   *
   * Like appendLog: append to disk now (durable immediately), let it ride the
   * next natural commit. Best-effort — never throws into the beat.
   */
  appendCostLedger(sample) {
    const root = this.root();
    if (!root) return;
    const row = {
      agent_id: sample.agentId,
      session_id: sample.sessionId,
      ts: sample.ts,
      input: sample.input,
      output: sample.output,
      cache_read: sample.cacheRead,
      cache_creation: sample.cacheCreation,
      model: sample.model,
      usd: sample.usd
    };
    try {
      (0, import_node_fs5.appendFileSync)((0, import_node_path5.join)(root, "cost-ledger.jsonl"), JSON.stringify(row) + "\n", "utf8");
    } catch {
    }
  }
  // — json + atomic io —
  readJson(p, fallback) {
    try {
      return JSON.parse((0, import_node_fs5.readFileSync)(p, "utf8"));
    } catch {
      return fallback;
    }
  }
  writeJson(p, data) {
    (0, import_node_fs5.writeFileSync)(p, JSON.stringify(data, null, 2), "utf8");
  }
  atomicWriteJson(p, data) {
    const tmp = `${p}.tmp-${shortRand()}`;
    (0, import_node_fs5.writeFileSync)(tmp, JSON.stringify(data, null, 2), "utf8");
    (0, import_node_fs5.renameSync)(tmp, p);
  }
  // — git (single committer, retry + stale-lock recovery) —
  git(args, cwd) {
    const res = (0, import_node_child_process5.spawnSync)("git", ["-c", "commit.gpgsign=false", "-c", "user.name=Hive", "-c", "user.email=hive@local", ...args], {
      cwd,
      encoding: "utf8",
      timeout: 8e3
    });
    return { ok: res.status === 0, out: res.stdout ?? "", err: res.stderr ?? "" };
  }
  /** Has the one-time cost-ledger untrack pass run in this process yet? */
  untrackedCostLedger = false;
  /**
   * Stop versioning the cost ledger.
   *
   * `cost-ledger.jsonl` is append-only and gains a row per usage sample, so a
   * repo that tracks it stores a fresh copy of the WHOLE file on every hive
   * commit — and the hive commits constantly. A quarter-gigabyte ledger with a
   * few thousand commits behind it is several hundred gigabytes of blob that
   * git has to walk, which is what turns a routine `gc` into a multi-gigabyte
   * `pack-objects` run. The ignore line in ensureHive keeps new copies out;
   * this drops the one already in the index, because git keeps recording a
   * file it is already tracking no matter what .gitignore says — so the ignore
   * line alone reads as a fix while the repo goes on growing. The ledger stays
   * on disk, so the cost history the app reads is untouched.
   */
  untrackCostLedger(root) {
    if (this.untrackedCostLedger) return;
    this.untrackedCostLedger = true;
    const tracked = this.git(["ls-files", "--", "cost-ledger.jsonl"], root);
    if (!tracked.ok || !tracked.out.trim()) return;
    this.git(["rm", "--cached", "-q", "--ignore-unmatch", "--", "cost-ledger.jsonl"], root);
    console.warn("[hive] untracked the cost ledger from the hive repo");
  }
  /** Has the one-time Codex-home untrack pass run in this process yet? */
  untrackedCodexHomes = false;
  /**
   * Stop versioning Codex worker homes that are ALREADY in the index.
   *
   * Adding `.codex/` to each agent's .gitignore only keeps NEW paths out; git
   * happily keeps recording a file it is already tracking, so a hive that
   * predates that ignore line goes on committing every SQLite and transcript
   * revision exactly as before — the .gitignore reads as a fix while the repo
   * keeps growing. This closes that: once per process, refresh every agent's
   * ignore file (agents that are not running never pass through spawn, and the
   * mine loop only reaches them if mempalace is installed) and drop any tracked
   * `.codex` path from the index. The files stay on disk, so `codex --resume`
   * is unaffected; only their history stops.
   */
  untrackCodexHomes(root) {
    if (this.untrackedCodexHomes) return;
    this.untrackedCodexHomes = true;
    const agentsDir = (0, import_node_path5.join)(root, "agents");
    if (!(0, import_node_fs5.existsSync)(agentsDir)) return;
    try {
      for (const id of (0, import_node_fs5.readdirSync)(agentsDir)) ensureMineIgnore((0, import_node_path5.join)(agentsDir, id));
    } catch {
    }
    const tracked = this.git(["ls-files", "--", "agents/*/.codex"], root);
    if (!tracked.ok || !tracked.out.trim()) return;
    this.git(["rm", "-r", "--cached", "-q", "--ignore-unmatch", "--", "agents/*/.codex"], root);
    console.warn("[hive] untracked previously-committed Codex homes from the hive repo");
  }
  /** Commit all hive changes. No-op if there is nothing staged. */
  commit(message) {
    const root = this.root();
    if (!root || !(0, import_node_fs5.existsSync)((0, import_node_path5.join)(root, ".git"))) return;
    this.untrackCostLedger(root);
    this.untrackCodexHomes(root);
    for (let attempt = 0; attempt < 5; attempt++) {
      this.clearStaleLock(root);
      const add = this.git(["add", "-A"], root);
      const commit = this.git(["commit", "-q", "-m", message], root);
      if (commit.ok) return;
      if (/nothing to commit/i.test(commit.out + commit.err)) return;
      if (!add.ok || /index\.lock/i.test(commit.err)) {
        sleepSync(50 * (attempt + 1));
        continue;
      }
      return;
    }
  }
  clearStaleLock(root) {
    const lock = (0, import_node_path5.join)(root, ".git", "index.lock");
    try {
      if ((0, import_node_fs5.existsSync)(lock) && Date.now() - (0, import_node_fs5.statSync)(lock).mtimeMs > 1e4) (0, import_node_fs5.rmSync)(lock);
    } catch {
    }
  }
};
function renderCommandsMd() {
  const lines = [
    "# Claude Code commands",
    "",
    "Reference of the Claude Code commands available to you. Two kinds:",
    "- **slash** commands act ONLY on your own session \u2014 you CANNOT run them on another agent's terminal.",
    "- **cli** commands run in your shell (Bash) and can target the fleet, spawn, or query.",
    "",
    'To MONITOR the other agents in this hive, read `fleet.json` in the hive root (live per-agent tokens, cost, status, last tool, breaker level, inbox backlog) plus `registry.json` \u2014 `claude agents` does NOT list your hive siblings. Use `claude -p "..." --output-format json` for a one-off headless query.',
    ""
  ];
  for (const g of COMMAND_GROUPS) {
    lines.push(`## ${g.title}`, "");
    for (const it of g.items) {
      lines.push(`- \`${it.cmd.trim()}\` _(${it.kind})_ \u2014 ${it.desc}${it.usage ? ` e.g. \`${it.usage}\`` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
var COMMANDS_MD = renderCommandsMd();
var PROTOCOL_MD = `# Hive protocol

You are one of several Claude agents sharing this hive. Coordination is entirely
file-based; the harness (main process) is the only thing that runs git and the
only thing that moves messages between agents.

## Your workspace \u2014 \`agents/<your-id>/\`
- \`identity.md\`  \u2014 who you are (read-only; the harness writes it).
- \`memory.md\`    \u2014 your long-term memory. Read at the start of a task; append to it as you learn.
- \`inbox/\`       \u2014 messages addressed to you. Read them at the start of a task.
- \`inbox/.done/\` \u2014 move a message here once you've handled it.
- \`outbox/\`      \u2014 drop messages here to send them. The harness delivers them.

**Never write into another agent's folder.** Write to your own \`outbox/\`; the
orchestrator routes it. This keeps every file single-writer.

## Sending a message
Write one JSON file into \`outbox/\` (any filename ending in \`.json\`):

\`\`\`json
{
  "to": "<agent-id> | god | broadcast",
  "act": "request | inform | propose | query | agree | refuse | done",
  "subject": "one-line summary",
  "body": "the details",
  "conversation": "carry this across a thread (optional)",
  "in_reply_to": "<message id you're replying to> (optional)"
}
\`\`\`

The harness fills in \`id\`, \`from\`, \`hops\`, and timestamps.

## Rules of the road
- Only \`request\`, \`query\`, and \`propose\` expect a reply. \`inform\` and \`done\` are terminal \u2014
  don't reply to them, or two agents will loop forever.
- For anything ambiguous, cross-cutting, or needing sign-off, message \`god\` \u2014 the
  god agent clarifies answers for you so you rarely need the human directly.
- There is NO separate human-approval queue. Human-in-the-loop is native to Claude
  Code: a tool you run that needs permission prompts in your own session (the human
  can approve it remotely from their phone via \`/remote-control\`). If you genuinely
  need a human decision, raise it with \`god\` (a message \`"to": "human"\` is routed to
  the god/orchestrator, the human's proxy on the floor).
- \`board.md\` is the shared plan. Don't edit it directly \u2014 \`propose\` changes to \`god\`,
  who is its sole scribe.
- Re-reading a message you already moved to \`.done/\` is a no-op. Don't reprocess.

## The work: board.md vs tasks.json
There are two shared surfaces, both in the hive root:
- \`board.md\` \u2014 the freeform narrative plan. The god agent is its sole scribe; others \`propose\` edits.
- \`tasks.json\` \u2014 the structured task ledger (a kanban: \`todo / doing / blocked / done\`, with title,
  assignee, priority, deps). Keep the task you're working reflected in its status.

## Asking the human (the ASK ME card)
When a card can only move with the human \u2014 a question to answer, or an action only they can do
(create an account, approve a spend, hand over credentials, test on their device) \u2014 the god sets the
card \`"status": "blocked"\` and appends the ask to its \`humanQA\` array:

\`\`\`json
{ "q": "the ask, in markdown", "askedAt": "<iso timestamp>" }
\`\`\`

The harness shows the open ask on the ASK ME board and in the ASK ME tab, and the human's reply lands
in the same entry as \`"a"\` plus an inbox message to god. Every past entry stays on the card \u2014 that
trail is the decision history.

**Write the ask short, and in markdown.** The card renders it, so plain-text asterisks and backticks
show up literally, and a card is not a terminal \u2014 an ask longer than a short paragraph plus its
options (roughly 700 characters) is a report, not a question. Cut the narrative and keep the decision:
- open with ONE **bold** sentence saying exactly what you need from them;
- \`backticks\` for paths, commands, values, and identifiers;
- \`-\` bullets or \`1.\` numbering for every option or step;
- a blank line between paragraphs; a single newline is rendered as a line break, so each option
  stays on its own line.

When the ask originates in another agent's report, REWRITE it into that shape. Never paste the report
body in as the question, and never make the human read the investigation to find the decision. Do NOT park human questions in separate files (no \`HumanQuestion.md\`),
and never sit idle waiting for a reply \u2014 move on to other work and pick the answer up when it arrives.

## Guardrails: circuit breaker & token budgets
A circuit breaker watches every agent for runaway behavior (looping on the same tool, error storms,
overspending). It escalates gently: \`steer\` \u2192 \`constrain\` \u2192 \`stop\`. If a \`Circuit breaker: steer\`
or \`Circuit breaker: constrain\` message lands in your inbox, you ARE the problem it caught \u2014 stop
repeating, summarize what you've tried, and do exactly what the message says (constrain = go read-only
and get god's sign-off before more tool calls). Be **token-frugal**: the floor has a token budget and
each agent can have its own token limit; crossing it trips the breaker. Prefer references over pasted
content, and \`/compact\` your own session when context gets heavy.

## Fleet monitoring (orchestrator)
You (god) are responsible for situational awareness. To see the live state of every agent, read
\`fleet.json\` in the hive root \u2014 it is refreshed continuously with each agent's tokens, cost, status,
breaker level, last tool, last-active time, and inbox backlog. Pair it with \`registry.json\` (the roster)
and \`log.jsonl\` (the event feed). IMPORTANT: \`claude agents\` will NOT show your hive's sibling
sessions (they're spawned independently) \u2014 \`fleet.json\` is your source of truth for them. For a deeper
look at one agent, read its \`agents/<id>/memory.md\` and \`inbox/\`, or send it a \`query\`. A full
Claude Code command reference (slash = your own session only; CLI = your shell, can target the fleet)
is in \`COMMANDS.md\` in the hive root.

## Spawning a worker (orchestrator)
You can start an ephemeral worker yourself. Write ONE JSON file into \`spawn-requests/<id>.json\` in
the hive root:

\`\`\`json
{
  "objective": "what the worker must do (required)",
  "cwd": "/absolute/path/to/the/repo (required)",
  "name": "display name (optional)",
  "command": "engine CLI (optional; defaults to the configured one)",
  "provider": "claude | codex | cursor | antigravity | \u2026 (optional)",
  "model": "model override (optional)",
  "isolate": true,
  "tokenCap": 0,
  "slack": { "channel": "C\u2026", "thread_ts": "\u2026" },
  "character": "meredith",
  "accent": "coral"
}
\`\`\`

The harness polls that directory, spawns \`worker-<id>\`, and moves the request to
\`spawn-requests/.done/\` once it starts or to \`spawn-requests/.failed/\` with a reason. \`isolate\`
defaults to true, giving the worker its own git worktree. \`slack\` routes its failures back to a
thread. This is the ONLY spawn route you can complete on your own: a hire manifest under
\`research/hires/\` needs the human to confirm it in the UI.

\`character\` and \`accent\` set how the worker looks on the office floor, and both are optional.
Naming a worker after a cast member already gets you that avatar, so you only need \`character\` when
the name and the face should differ. An unrecognised value falls back rather than failing the spawn.

**It can be switched off.** The operator controls this under Settings \u2192 Autonomy & Budgets, and it is
OFF by default, because every worker you start spends tokens nobody approved. While it is off your
request is NOT failed or deleted, it waits in \`spawn-requests/\` and runs if the operator turns it on.
If a request of yours has sat there without moving, that is why, and it is a decision to raise with the
human rather than retry. Route work to an agent already on the floor first either way.

## Semantic memory (optional \u2014 when \`mempalace\` is installed)
When \`MEMPALACE_PALACE_PATH\` is set in your environment, the hive shares a
searchable MemPalace and you have the \`mempalace\` CLI:
- \`mempalace search "<query>"\` \u2014 recall relevant past knowledge across the whole
  team by meaning (not just keywords). Add \`--wing <agent-id>\` to scope to one
  agent, \`--results N\` to widen.
- \`mempalace wake-up\` \u2014 a short digest of what matters, good at the start of a task.

Your \`memory.md\` is mined into the palace automatically, so the durable facts you
write there become searchable by every agent. You don't run \`mine\` yourself.
`;
var HOOK_SHIM = `#!/usr/bin/env node
'use strict';
const net = require('net');
const isStatus = process.argv.includes('--status');
let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { data += d; });
process.stdin.on('end', () => {
  let payload = {};
  try { payload = JSON.parse(data || '{}'); } catch (_) {}
  if (!payload.agent_id) payload.agent_id = process.env.AGENT_ID || null;
  const sock = process.env.HIVE_SOCK;
  if (isStatus) {
    // Status-line mode: Claude Code pipes the session status JSON (incl.
    // context_window.total_input_tokens / .context_window_size) after every
    // response. Print the in-terminal gauge IMMEDIATELY (the TUI is waiting),
    // then forward the payload to the harness fire-and-forget so the agent
    // card's context gauge updates push-based, with the EXACT window size.
    payload.hook_event_name = 'Status';
    const cw = payload.context_window || {};
    const used = cw.total_input_tokens, size = cw.context_window_size;
    if (typeof used === 'number' && typeof size === 'number' && size > 0) {
      const pct = Math.round((used / size) * 100);
      process.stdout.write('ctx ' + Math.round(used / 1000) + 'k/' + Math.round(size / 1000) + 'k (' + pct + '%)');
    }
    if (sock) {
      try {
        const c = net.createConnection(sock, () => { c.end(JSON.stringify(payload) + '\\n'); });
        c.on('error', () => {});
        c.on('close', () => process.exit(0));
      } catch (_) { process.exit(0); }
    } else {
      process.exit(0);
    }
    setTimeout(() => process.exit(0), 1500).unref();
    return;
  }
  if (!sock) { process.exit(0); }
  let resp = '';
  const done = (code) => { if (resp) process.stdout.write(resp); process.exit(code); };
  const c = net.createConnection(sock, () => c.write(JSON.stringify(payload) + '\\n'));
  c.setEncoding('utf8');
  c.on('data', (d) => { resp += d; });
  c.on('end', () => done(0));
  c.on('error', () => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
});
`;
var AGY_HOOK_SHIM = `#!/usr/bin/env node
'use strict';
const net = require('net');
const event = process.argv[2] || 'Unknown';
const agentId = process.env.AGENT_ID || null;
let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { data += d; });
process.stdin.on('end', () => {
  const sock = process.env.HIVE_SOCK;
  if (!agentId || !sock) { process.exit(0); } // not a hive worker \u2192 ignore
  let agy = {};
  try { agy = JSON.parse(data || '{}'); } catch (_) {}
  const tc = agy.toolCall || {};
  const payload = {
    hook_event_name: event,
    agent_id: agentId,
    session_id: agy.conversationId,
    transcript_path: agy.transcriptPath,
    cwd: Array.isArray(agy.workspacePaths) ? agy.workspacePaths[0] : undefined,
    tool_name: tc.name,
    tool_input: tc.args
  };
  let resp = '';
  const done = () => {
    // Translate the HookServer's Claude-shaped reply into agy's contract. CRITICAL:
    // agy treats ANY object written to stdout as a decision and FAIL-CLOSES (an
    // empty/decision-less object = DENY). So emit JSON ONLY when there's a real
    // directive (deny/block/steer); otherwise write NOTHING \u2014 no output = allow.
    let out = null;
    try {
      const r = JSON.parse(resp || '{}');
      if (r.decision === 'block') out = { decision: 'block', reason: r.reason, stopReason: r.reason, systemMessage: r.reason };
      else if (r.hookSpecificOutput && r.hookSpecificOutput.permissionDecision === 'deny') out = { decision: 'deny', reason: r.hookSpecificOutput.permissionDecisionReason };
      else if (r.continue === false) out = { decision: 'block', stopReason: r.stopReason };
      else if (r.hookSpecificOutput && r.hookSpecificOutput.additionalContext) out = { systemMessage: r.hookSpecificOutput.additionalContext };
    } catch (_) {}
    if (out) { try { process.stdout.write(JSON.stringify(out)); } catch (_) {} }
    process.exit(0);
  };
  try {
    const c = net.createConnection(sock, () => c.write(JSON.stringify(payload) + '\\n'));
    c.setEncoding('utf8');
    c.on('data', (d) => { resp += d; });
    c.on('end', done);
    c.on('error', () => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  } catch (_) { process.exit(0); }
});
`;
var PI_EXTENSION = `'use strict';
var net = require('node:net');
var SOCK = process.env.HIVE_SOCK;
var AGENT = process.env.AGENT_ID || null;
var AUTO = process.env.HIVE_AUTO_APPROVE === '1';
function post(payload) {
  try {
    if (!SOCK) return;
    payload.agent_id = payload.agent_id || AGENT;
    var c = net.createConnection(SOCK, function () { try { c.end(JSON.stringify(payload) + '\\n'); } catch (e) {} });
    c.on('error', function () {});
  } catch (e) {}
}
function register(pi) {
  if (!pi || typeof pi.on !== 'function') return false;
  try {
    pi.on('tool_call', function (ev) {
      post({ hook_event_name: 'PreToolUse', tool_name: ev && (ev.name || (ev.tool && ev.tool.name)), tool_input: ev && (ev.args || ev.input) });
      if (AUTO) { try { if (ev && typeof ev.approve === 'function') ev.approve(); } catch (e) {} return { approve: true }; }
      return undefined;
    });
    pi.on('tool_result', function (ev) { post({ hook_event_name: 'PostToolUse', tool_name: ev && (ev.name || (ev.tool && ev.tool.name)) }); });
    pi.on('agent_end', function () { post({ hook_event_name: 'Stop' }); });
    return true;
  } catch (e) { return false; }
}
try { if (typeof globalThis !== 'undefined' && globalThis.pi) register(globalThis.pi); } catch (e) {}
module.exports = function (pi) { return register(pi); };
module.exports.activate = function (pi) { return register(pi); };
module.exports.default = module.exports;
`;
var OPENCODE_PLUGIN = `import { createConnection } from 'node:net';
const SOCK = process.env.HIVE_SOCK;
const AGENT = process.env.AGENT_ID || null;
function post(payload) {
  try {
    if (!SOCK) return;
    payload.agent_id = payload.agent_id || AGENT;
    const c = createConnection(SOCK, () => { try { c.end(JSON.stringify(payload) + '\\n'); } catch (e) {} });
    c.on('error', () => {});
  } catch (e) {}
}
export const HiveBridge = async () => {
  return {
    event: async (input) => {
      try { if (input && input.event && input.event.type === 'session.idle') post({ hook_event_name: 'Stop' }); } catch (e) {}
    },
    'tool.execute.before': async (input) => {
      try { post({ hook_event_name: 'PreToolUse', tool_name: input && (input.tool || input.name) }); } catch (e) {}
    },
    'tool.execute.after': async (input) => {
      try { post({ hook_event_name: 'PostToolUse', tool_name: input && (input.tool || input.name) }); } catch (e) {}
    }
  };
};
export default HiveBridge;
`;
var PROXY_BRIDGE_SHIM = `#!/usr/bin/env node
'use strict';
const http = require('http');
const https = require('https');
const net = require('net');
const { URL } = require('url');

const SOCK = process.env.HIVE_SOCK;
const AGENT_ID = process.env.AGENT_ID || null;
const UPSTREAM = process.env.UPSTREAM_BASE_URL || '';
const SESSION = process.env.HIVE_PROXY_SESSION || null;
const API = process.env.HIVE_PROXY_API === 'anthropic' ? 'anthropic' : 'openai';

function trimSlash(s) { while (s.length && s.charAt(s.length - 1) === '/') s = s.slice(0, -1); return s; }

// Per-model context-window size for the Status gauge; fallback 200k.
function ctxSize(model) {
  const m = String(model || '').toLowerCase();
  if (m.indexOf('[1m]') !== -1 || m.indexOf('-1m') !== -1) return 1000000;
  if (m.indexOf('claude') !== -1) return 200000;
  if (m.indexOf('gpt-4o') !== -1 || m.indexOf('gpt-4.1') !== -1 || m.indexOf('o1') !== -1 || m.indexOf('o3') !== -1) return 128000;
  if (m.indexOf('qwen') !== -1) return 262144;
  return 200000;
}

// Fire-and-forget emit of a shim-shaped payload to the hive socket. Never throws.
function emit(payload) {
  if (!SOCK) return;
  try {
    const c = net.createConnection(SOCK, function () { c.end(JSON.stringify(payload) + '\\n'); });
    c.on('error', function () {});
  } catch (e) {}
}

let stopTimer = null;
function armStop() {
  if (stopTimer) clearTimeout(stopTimer);
  stopTimer = setTimeout(function () {
    stopTimer = null;
    emit({ hook_event_name: 'Stop', agent_id: AGENT_ID, session_id: SESSION });
  }, 800);
  if (stopTimer.unref) stopTimer.unref();
}
function cancelStop() { if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; } }

function safeArgs(s) {
  if (s == null) return {};
  if (typeof s === 'object') return s;
  try { return JSON.parse(s); } catch (e) { return { _raw: String(s).slice(0, 500) }; }
}

// Parse a completed response (single JSON or an SSE stream) and synthesize events.
function parseAndEmit(bodyStr, isSse) {
  const objs = [];
  if (isSse) {
    const lines = bodyStr.split('\\n');
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const idx = ln.indexOf('data:');
      if (idx === -1) continue;
      const data = ln.slice(idx + 5).trim();
      if (!data || data === '[DONE]') continue;
      try { objs.push(JSON.parse(data)); } catch (e) {}
    }
  } else {
    try { objs.push(JSON.parse(bodyStr)); } catch (e) {}
  }
  if (!objs.length) { armStop(); return; }

  let model = null, input = 0, output = 0, cacheRead = 0, cacheCreation = 0, sawUsage = false;
  const toolCalls = [];
  const oaiTools = {}; // accumulate streaming openai tool_calls by index

  for (let i = 0; i < objs.length; i++) {
    const o = objs[i];
    if (!o || typeof o !== 'object') continue;
    if (o.model) model = o.model;
    if (API === 'anthropic') {
      if (o.type === 'message_start' && o.message) {
        if (o.message.model) model = o.message.model;
        const u = o.message.usage || {};
        input += u.input_tokens || 0;
        cacheRead += u.cache_read_input_tokens || 0;
        cacheCreation += u.cache_creation_input_tokens || 0;
        sawUsage = true;
      } else if (o.type === 'message_delta' && o.usage) {
        output += o.usage.output_tokens || 0;
        sawUsage = true;
      } else if (o.type === 'content_block_start' && o.content_block && o.content_block.type === 'tool_use') {
        toolCalls.push({ name: o.content_block.name, input: o.content_block.input || {} });
      } else if (o.usage && !o.type) {
        // non-streaming full message body
        const u = o.usage;
        input += u.input_tokens || 0;
        output += u.output_tokens || 0;
        cacheRead += u.cache_read_input_tokens || 0;
        cacheCreation += u.cache_creation_input_tokens || 0;
        sawUsage = true;
      }
      if (Array.isArray(o.content)) {
        for (let j = 0; j < o.content.length; j++) {
          const blk = o.content[j];
          if (blk && blk.type === 'tool_use') toolCalls.push({ name: blk.name, input: blk.input || {} });
        }
      }
    } else {
      if (o.usage) {
        const u = o.usage;
        input += u.prompt_tokens || 0;
        output += u.completion_tokens || 0;
        if (u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens) cacheRead += u.prompt_tokens_details.cached_tokens;
        sawUsage = true;
      }
      const choices = o.choices || [];
      for (let c = 0; c < choices.length; c++) {
        const ch = choices[c];
        if (!ch) continue;
        if (ch.message && Array.isArray(ch.message.tool_calls)) {
          for (let t = 0; t < ch.message.tool_calls.length; t++) {
            const tc = ch.message.tool_calls[t];
            if (tc && tc.function) toolCalls.push({ name: tc.function.name, input: safeArgs(tc.function.arguments) });
          }
        }
        if (ch.delta && Array.isArray(ch.delta.tool_calls)) {
          for (let t = 0; t < ch.delta.tool_calls.length; t++) {
            const tc = ch.delta.tool_calls[t];
            if (!tc) continue;
            const k = (tc.index != null ? tc.index : t);
            if (!oaiTools[k]) oaiTools[k] = { name: null, args: '' };
            if (tc.function) {
              if (tc.function.name) oaiTools[k].name = tc.function.name;
              if (tc.function.arguments) oaiTools[k].args += tc.function.arguments;
            }
          }
        }
      }
    }
  }
  const keys = Object.keys(oaiTools);
  for (let i = 0; i < keys.length; i++) {
    const t = oaiTools[keys[i]];
    if (t.name) toolCalls.push({ name: t.name, input: safeArgs(t.args) });
  }

  if (sawUsage) {
    emit({ hook_event_name: 'Status', agent_id: AGENT_ID, context_window: { total_input_tokens: input + cacheRead + cacheCreation, context_window_size: ctxSize(model) } });
    emit({ hook_event_name: 'CostSample', agent_id: AGENT_ID, session_id: SESSION, model: model, input: input, output: output, cache_read: cacheRead, cache_creation: cacheCreation });
  }
  if (toolCalls.length) {
    cancelStop(); // a tool call means the turn continues
    for (let i = 0; i < toolCalls.length; i++) {
      emit({ hook_event_name: 'PostToolUse', agent_id: AGENT_ID, session_id: SESSION, tool_name: toolCalls[i].name, tool_input: toolCalls[i].input });
    }
  } else {
    armStop();
  }
}

let upstreamUrl = null;
try { upstreamUrl = new URL(UPSTREAM); } catch (e) {}

const server = http.createServer(function (req, res) {
  cancelStop(); // a new request means the turn is still going
  if (!upstreamUrl) { res.statusCode = 502; res.end('proxy: no upstream'); return; }
  let target;
  try { target = new URL(trimSlash(UPSTREAM) + req.url); } catch (e) { res.statusCode = 502; res.end('proxy: bad url'); return; }
  const isHttps = target.protocol === 'https:';
  const lib = isHttps ? https : http;
  const headers = Object.assign({}, req.headers);
  headers.host = target.host;
  // Ask upstream for plaintext so the tee can parse SSE/JSON reliably; the client
  // gets uncompressed bytes (loopback \u2014 negligible) and no content-encoding to undo.
  delete headers['accept-encoding'];
  const opts = {
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || (isHttps ? 443 : 80),
    method: req.method,
    path: target.pathname + target.search,
    headers: headers
  };
  const upReq = lib.request(opts, function (upRes) {
    res.writeHead(upRes.statusCode || 502, upRes.headers);
    const ct = String((upRes.headers['content-type'] || ''));
    const wantParse = ct.indexOf('json') !== -1 || ct.indexOf('event-stream') !== -1;
    const isSse = ct.indexOf('event-stream') !== -1;
    const chunks = [];
    let total = 0;
    upRes.on('data', function (chunk) {
      res.write(chunk); // stream straight through to the CLI
      if (wantParse && total < 4194304) { chunks.push(chunk); total += chunk.length; }
    });
    upRes.on('end', function () {
      res.end();
      if (wantParse && chunks.length) {
        try { parseAndEmit(Buffer.concat(chunks).toString('utf8'), isSse); } catch (e) {}
      }
    });
    upRes.on('error', function () { try { res.end(); } catch (e) {} });
  });
  upReq.on('error', function () { try { res.statusCode = 502; res.end('proxy: upstream error'); } catch (e) {} });
  req.pipe(upReq);
});

server.on('error', function () {
  try { process.stdout.write(JSON.stringify({ port: 0 }) + '\\n'); } catch (e) {}
  process.exit(0);
});
server.listen(0, '127.0.0.1', function () {
  const addr = server.address();
  const port = (addr && typeof addr === 'object') ? addr.port : 0;
  try { process.stdout.write(JSON.stringify({ port: port }) + '\\n'); } catch (e) {}
});
`;
var GEMINI_HOOK_SHIM = `#!/usr/bin/env node
'use strict';
const net = require('net');
const agentId = process.env.AGENT_ID || null;
let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { data += d; });
process.stdin.on('end', () => {
  const sock = process.env.HIVE_SOCK;
  if (!agentId || !sock) { process.exit(0); }
  let gemini = {};
  try { gemini = JSON.parse(data || '{}'); } catch (_) {}
  const names = {
    SessionStart: 'SessionStart',
    BeforeAgent: 'UserPromptSubmit',
    BeforeTool: 'PreToolUse',
    AfterTool: 'PostToolUse',
    AfterAgent: 'Stop'
  };
  const payload = {
    ...gemini,
    hook_event_name: names[gemini.hook_event_name] || gemini.hook_event_name || 'Unknown',
    agent_id: agentId
  };
  let resp = '';
  const done = () => {
    let out = null;
    try {
      const r = JSON.parse(resp || '{}');
      if (r.continue === false) out = { continue: false, stopReason: r.stopReason };
      else if (r.decision === 'block') out = { decision: 'deny', reason: r.reason };
      else if (r.hookSpecificOutput && r.hookSpecificOutput.permissionDecision === 'deny') {
        out = { decision: 'deny', reason: r.hookSpecificOutput.permissionDecisionReason };
      } else if (r.hookSpecificOutput && r.hookSpecificOutput.additionalContext) {
        out = { hookSpecificOutput: { additionalContext: r.hookSpecificOutput.additionalContext } };
      }
    } catch (_) {}
    if (out) { try { process.stdout.write(JSON.stringify(out)); } catch (_) {} }
    process.exit(0);
  };
  try {
    const c = net.createConnection(sock, () => c.write(JSON.stringify(payload) + '\\n'));
    c.setEncoding('utf8');
    c.on('data', (d) => { resp += d; });
    c.on('end', done);
    c.on('error', () => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  } catch (_) { process.exit(0); }
});
`;
var GROK_HOOK_SHIM = `#!/usr/bin/env node
'use strict';
const net = require('net');
const agentId = process.env.AGENT_ID || null;
let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { data += d; });
process.stdin.on('end', () => {
  const sock = process.env.HIVE_SOCK;
  if (!agentId || !sock) { process.exit(0); }
  let grok = {};
  try { grok = JSON.parse(data || '{}'); } catch (_) {}
  const names = {
    pre_tool_use: 'PreToolUse',
    post_tool_use: 'PostToolUse',
    post_tool_use_failure: 'PostToolUseFailure',
    permission_denied: 'PermissionDenied',
    stop: 'Stop',
    stop_failure: 'StopFailure',
    session_start: 'SessionStart',
    session_end: 'SessionEnd',
    user_prompt_submit: 'UserPromptSubmit',
    notification: 'Notification',
    subagent_start: 'SubagentStart',
    subagent_stop: 'SubagentStop',
    pre_compact: 'PreCompact',
    post_compact: 'PostCompact'
  };
  const payload = {
    hook_event_name: names[grok.hookEventName] || grok.hookEventName || 'Unknown',
    agent_id: agentId,
    session_id: grok.sessionId,
    cwd: grok.cwd || grok.workspaceRoot,
    tool_name: grok.toolName,
    tool_input: grok.toolInput,
    stop_hook_active: grok.stopHookActive,
    prompt: grok.prompt,
    source: grok.source,
    notification_type: grok.notificationType,
    message: grok.message
  };
  let resp = '';
  const done = () => {
    let out = null;
    try {
      const r = JSON.parse(resp || '{}');
      if (r.continue === false) out = { continue: false, stopReason: r.stopReason };
      else if (r.decision === 'block') out = { decision: 'block', reason: r.reason };
      else if (r.hookSpecificOutput && r.hookSpecificOutput.permissionDecision === 'deny') {
        out = { decision: 'deny', reason: r.hookSpecificOutput.permissionDecisionReason };
      } else if (r.hookSpecificOutput && r.hookSpecificOutput.additionalContext) {
        out = r;
      }
    } catch (_) {}
    if (out) { try { process.stdout.write(JSON.stringify(out)); } catch (_) {} }
    process.exit(0);
  };
  try {
    const c = net.createConnection(sock, () => c.write(JSON.stringify(payload) + '\\n'));
    c.setEncoding('utf8');
    c.on('data', (d) => { resp += d; });
    c.on('end', done);
    c.on('error', () => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  } catch (_) { process.exit(0); }
});
`;

// cth/main/hooks.ts
var import_node_net = require("node:net");
var import_node_fs6 = require("node:fs");
var import_electron3 = require("electron");

// cth/main/pricing.ts
var OPUS = { inputPerM: 15, outputPerM: 75, cacheReadPerM: 1.5, cacheWritePerM: 18.75 };
var SONNET = { inputPerM: 3, outputPerM: 15, cacheReadPerM: 0.3, cacheWritePerM: 3.75 };
var HAIKU = { inputPerM: 0.8, outputPerM: 4, cacheReadPerM: 0.08, cacheWritePerM: 1 };
var DEFAULT_PRICE = SONNET;
function normalizeModel(model) {
  return (model ?? "").trim().replace(/\[[^\]]*\]\s*$/, "");
}
function priceFor(model) {
  const m = normalizeModel(model).toLowerCase();
  if (m.includes("opus")) return OPUS;
  if (m.includes("haiku")) return HAIKU;
  if (m.includes("sonnet")) return SONNET;
  return DEFAULT_PRICE;
}
function estimateCostUsd(model, tokens) {
  const p = priceFor(model);
  return tokens.inputTokens / 1e6 * p.inputPerM + tokens.outputTokens / 1e6 * p.outputPerM + tokens.cacheReadTokens / 1e6 * p.cacheReadPerM + tokens.cacheWriteTokens / 1e6 * p.cacheWritePerM;
}

// cth/shared/hookEvents.ts
var OPTIONAL_STRING_FIELDS = ["tool", "notificationType", "source", "message"];
function validateHookEvent(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value;
  if (typeof candidate.event !== "string" || candidate.event.length === 0) return false;
  if (candidate.agentId !== void 0 && (typeof candidate.agentId !== "string" || candidate.agentId.length === 0)) return false;
  for (const field of OPTIONAL_STRING_FIELDS) {
    if (candidate[field] !== void 0 && typeof candidate[field] !== "string") return false;
  }
  return candidate.blocked === void 0 || typeof candidate.blocked === "boolean";
}

// cth/main/hooks.ts
var HookServer = class {
  constructor(hive2, getWebContents, getConfig, control2, breaker2, getStandingGoal, onEvent) {
    this.hive = hive2;
    this.getWebContents = getWebContents;
    this.getConfig = getConfig;
    this.control = control2;
    this.breaker = breaker2;
    this.getStandingGoal = getStandingGoal;
    this.onEvent = onEvent;
  }
  hive;
  getWebContents;
  getConfig;
  control;
  breaker;
  getStandingGoal;
  onEvent;
  server = null;
  /** agentId → the live session's transcript file, learned from hook payloads.
   *  Lets the harness read per-agent telemetry (e.g. current context size)
   *  even when several agents share one cwd. */
  transcriptPaths = /* @__PURE__ */ new Map();
  /** agentId → the latest context-window accounting from the statusLine shim
   *  (current tokens + the REAL window size — 200k vs 1M, which nothing else
   *  exposes). The renderer already gets this pushed live on `hive:contextUpdate`;
   *  we also retain the last value here so a main-side read (the voice read-layer's
   *  get_agent_detail / list_agents) can report "how full is each agent's context"
   *  without depending on a renderer round-trip. */
  contextById = /* @__PURE__ */ new Map();
  start() {
    const sock = this.hive.sockPath();
    if (!sock || this.server) return;
    try {
      if ((0, import_node_fs6.existsSync)(sock)) (0, import_node_fs6.rmSync)(sock);
    } catch {
    }
    this.server = (0, import_node_net.createServer)((conn) => {
      let buf = "";
      conn.on("data", (d) => {
        buf += d.toString();
        const nl = buf.indexOf("\n");
        if (nl === -1) return;
        let payload = {};
        try {
          payload = JSON.parse(buf.slice(0, nl));
        } catch {
        }
        let res = {};
        try {
          res = this.handle(payload);
        } catch {
          res = {};
        }
        conn.end(JSON.stringify(res ?? {}));
      });
      conn.on("error", () => {
      });
    });
    this.server.on("error", (e) => console.error("[hive] hook server error:", e));
    this.server.listen(sock);
  }
  stop() {
    try {
      this.server?.close();
    } catch {
    }
    this.server = null;
    const sock = this.hive.sockPath();
    try {
      if (sock && (0, import_node_fs6.existsSync)(sock)) (0, import_node_fs6.rmSync)(sock);
    } catch {
    }
  }
  /** The transcript file of an agent's CURRENT session, if any hook has fired. */
  transcriptPath(agentId) {
    return this.transcriptPaths.get(agentId);
  }
  /** The latest context-window accounting for an agent (current tokens + the real
   *  window size), or undefined if no statusLine tick has fired for it yet. */
  contextFor(agentId) {
    return this.contextById.get(agentId);
  }
  handle(p) {
    const agentId = p.agent_id ?? void 0;
    const event = p.hook_event_name ?? "Unknown";
    this.onEvent?.(agentId, event, p.message);
    if (agentId && typeof p.transcript_path === "string" && p.transcript_path) {
      this.transcriptPaths.set(agentId, p.transcript_path);
    }
    if (event === "Status") {
      const cw = p.context_window;
      if (agentId && cw && typeof cw.total_input_tokens === "number" && typeof cw.context_window_size === "number" && cw.context_window_size > 0) {
        this.contextById.set(agentId, {
          tokens: cw.total_input_tokens,
          limit: cw.context_window_size,
          ts: Date.now()
        });
        this.getWebContents()?.send("hive:contextUpdate", {
          agentId,
          tokens: cw.total_input_tokens,
          limit: cw.context_window_size
        });
      }
      return {};
    }
    if (agentId && this.control?.shouldHalt(agentId)) {
      this.emit(agentId, event, p);
      return { continue: false, stopReason: "Halted by the operator from the floor." };
    }
    if (agentId && p.session_id) this.hive.recordSession(agentId, p.session_id);
    if (event === "CostSample") {
      if (agentId && p.session_id) {
        const input = p.input ?? 0;
        const output = p.output ?? 0;
        const cacheRead = p.cache_read ?? 0;
        const cacheCreation = p.cache_creation ?? 0;
        this.hive.appendCostLedger({
          agentId,
          sessionId: p.session_id,
          ts: Date.now(),
          input,
          output,
          cacheRead,
          cacheCreation,
          model: p.model ?? "",
          usd: estimateCostUsd(p.model, {
            inputTokens: input,
            outputTokens: output,
            cacheReadTokens: cacheRead,
            cacheWriteTokens: cacheCreation
          })
        });
      }
      return {};
    }
    if (event === "PostToolUse" && agentId) {
      this.breaker?.recordToolUse(agentId, p.tool_name, p.tool_input);
    }
    if (event === "PreCompact" && agentId) this.breaker?.recordCompactStart(agentId);
    if ((event === "PostCompact" || event === "SessionStart") && agentId) {
      this.breaker?.recordCompactEnd(agentId);
    }
    if ((event === "Stop" || event === "SubagentStop") && agentId) {
      if (p.stop_hook_active) {
        this.emit(agentId, event, p);
        return {};
      }
      this.notify(agentId ?? "Agent", "finished \u2014 idle");
      this.emit(agentId, event, p);
      return {};
    }
    if (event === "PreToolUse" && agentId && this.control) {
      const d = this.control.toolDecision(agentId, p.tool_name ?? "");
      if (d.deny) {
        this.emitControl(agentId, p.tool_name, d.reason);
        this.emit(agentId, event, p);
        return {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: d.reason ?? "Denied by operator."
          }
        };
      }
    }
    let steer = null;
    if ((event === "UserPromptSubmit" || event === "PostToolUse") && agentId && this.control) {
      steer = this.control.takeSteer(agentId) ?? null;
    }
    const wantsRoster = (event === "SessionStart" || event === "UserPromptSubmit") && !!agentId && this.hive.isGod(agentId);
    const roster2 = wantsRoster ? this.hive.rosterContext((id) => this.contextFor(id)) : null;
    const wantsGoal = (event === "SessionStart" || event === "UserPromptSubmit") && !!agentId;
    const goalRaw = wantsGoal ? this.getStandingGoal?.(agentId) ?? null : null;
    const goal = goalRaw ? `<goal>
${goalRaw}
</goal>` : null;
    if (steer || roster2 || goal) {
      this.emit(agentId, event, p);
      return {
        hookSpecificOutput: {
          hookEventName: event,
          additionalContext: [roster2, goal, steer].filter(Boolean).join("\n\n")
        }
      };
    }
    if (event === "Notification" && (p.notification_type === "idle" || (p.message ?? "").toLowerCase().includes("waiting for your input"))) {
      this.notify(agentId ?? "Agent", p.message ?? "needs your attention");
    }
    this.emit(agentId, event, p);
    return {};
  }
  /** Fire a native desktop notification — gated on the user's `notifications`
   *  setting. Only the OS toast is gated; the hive:hookEvent emit is always sent
   *  so avatars/UI stay live regardless. Best-effort: never throw into the hook. */
  notify(title, body) {
    if (!this.getConfig().notifications) return;
    try {
      if (!import_electron3.Notification.isSupported()) return;
      new import_electron3.Notification({ title, body }).show();
    } catch {
    }
  }
  /** Tell the renderer a tool call was gated/denied (#7C.1) so it can surface it
   *  (toast / control strip) — distinct from the avatar hook stream. */
  emitControl(agentId, tool, reason) {
    this.getWebContents()?.send("control:approvalRequest", { agentId, tool, reason });
  }
  emit(agentId, event, p, blocked = false) {
    const payload = {
      agentId,
      event,
      tool: p.tool_name,
      notificationType: p.notification_type,
      source: p.source,
      message: p.message,
      blocked
    };
    if (!validateHookEvent(payload)) {
      console.warn("[hive] rejected invalid hook event:", event);
      return;
    }
    this.getWebContents()?.send("hive:hookEvent", payload);
  }
};

// cth/main/breaker.ts
var LEVELS = ["healthy", "steering", "constrained", "stopped"];
var rank2 = (l) => LEVELS.indexOf(l);
var actionFor = (l) => l === "steering" ? "steer" : l === "constrained" ? "constrain" : l === "stopped" ? "stop" : "none";
var tokensOf = (s) => s ? s.input + s.output + s.cacheRead + s.cacheCreation : 0;
var DEFAULTS2 = {
  enabled: true,
  hardStop: false,
  repeatedToolLimit: 8,
  errorStormLimit: 5,
  tokenVelocityPerMin: 6e4
  // output tokens/min — coarse backstop, deliberately high
};
var COMPACT_GRACE_MS = 5 * 6e4;
var POST_COMPACT_GRACE_MS = 9e4;
var PROGRESS_TOOL_WINDOW_MS = 3e5;
var NO_PROGRESS_BEATS = 2;
var CircuitBreaker = class {
  constructor(getConfig) {
    this.getConfig = getConfig;
  }
  getConfig;
  agents = /* @__PURE__ */ new Map();
  cfg() {
    const c = this.getConfig() ?? {};
    return {
      enabled: c.enabled ?? DEFAULTS2.enabled,
      hardStop: c.hardStop ?? DEFAULTS2.hardStop,
      repeatedToolLimit: c.repeatedToolLimit ?? DEFAULTS2.repeatedToolLimit,
      errorStormLimit: c.errorStormLimit ?? DEFAULTS2.errorStormLimit,
      tokenVelocityPerMin: c.tokenVelocityPerMin ?? DEFAULTS2.tokenVelocityPerMin,
      costCapUsd: c.costCapUsd,
      costCapTokens: c.costCapTokens,
      agentTokenCaps: c.agentTokenCaps
    };
  }
  get(agentId) {
    let s = this.agents.get(agentId);
    if (!s) {
      s = {
        level: "healthy",
        reason: "",
        lastSample: null,
        repeatKey: null,
        repeatCount: 0,
        errorCount: 0,
        compactingUntil: 0,
        lastDistinctToolAt: 0,
        noProgressBeats: 0
      };
      this.agents.set(agentId, s);
    }
    return s;
  }
  /** Drop all state for an agent (call on archive/kill so it can't leak/zombie). */
  forget(agentId) {
    this.agents.delete(agentId);
  }
  /** Current breaker level for an agent (for the live fleet snapshot). */
  levelFor(agentId) {
    return this.agents.get(agentId)?.level ?? "healthy";
  }
  // ── event-driven inputs (fed by HookServer) ──────────────────────────────
  /** A tool call ran. A NEW (name+input) key counts as forward progress (resets
   *  the repeat + error counters and stamps the distinct-tool clock the
   *  no-progress arm reads); the SAME key in a row is the loop signal. */
  recordToolUse(agentId, toolName, toolInput, now = Date.now()) {
    const s = this.get(agentId);
    const key = this.toolKey(toolName, toolInput);
    if (key === s.repeatKey) {
      s.repeatCount += 1;
    } else {
      s.repeatKey = key;
      s.repeatCount = 1;
      s.errorCount = 0;
      s.lastDistinctToolAt = now;
    }
  }
  /** An api_error / retry occurred (no forward progress). */
  recordError(agentId) {
    this.get(agentId).errorCount += 1;
  }
  /** Compaction started (PreCompact hook). Exempt the Δoutput-based trips —
   *  compaction burns output tokens while touching no coordination file, which
   *  is exactly the false-positive shape of upstream issue #109 (the harness's
   *  own auto-compact mission tripping its own breaker on idle agents). */
  recordCompactStart(agentId, now = Date.now()) {
    this.get(agentId).compactingUntil = now + COMPACT_GRACE_MS;
  }
  /** Compaction finished (PostCompact, or any SessionStart). Shortens the
   *  exemption to a trailing grace — the burst still lands in the next beat's
   *  cumulative diff. A no-op when no compaction is in flight, so a plain
   *  session start never grants an exemption. */
  recordCompactEnd(agentId, now = Date.now()) {
    const s = this.get(agentId);
    if (s.compactingUntil > now) s.compactingUntil = now + POST_COMPACT_GRACE_MS;
  }
  toolKey(toolName, toolInput) {
    let inp = "";
    try {
      inp = JSON.stringify(toolInput, (_k, v) => typeof v === "string" && v.length > 250 ? v.slice(0, 250) : v) ?? "";
    } catch {
      inp = String(toolInput);
    }
    return `${toolName ?? "?"}:${inp.slice(0, 200)}`;
  }
  // ── periodic evaluation (called by the heartbeat beat) ────────────────────
  /** Evaluate every agent for this beat and return a decision per agent. The
   *  caller emits each state (keeps the dashboard live) and enforces `action`
   *  when present. */
  tick(inputs, nowMs) {
    const cfg = this.cfg();
    const decisions = [];
    if (!cfg.enabled) {
      for (const { agentId } of inputs) {
        const s = this.get(agentId);
        const changed = s.level !== "healthy";
        s.level = "healthy";
        s.reason = "";
        decisions.push({ state: { agentId, level: "healthy", reason: "", ts: nowMs }, action: "none", changed });
      }
      return decisions;
    }
    let topSpender = null;
    if (typeof cfg.costCapUsd === "number" && cfg.costCapUsd > 0) {
      let total = 0;
      let max = -1;
      for (const i of inputs) {
        const usd = i.sample?.usd ?? 0;
        total += usd;
        if (usd > max) {
          max = usd;
          topSpender = i.agentId;
        }
      }
      if (total <= cfg.costCapUsd) topSpender = null;
    }
    let topTokenSpender = null;
    if (typeof cfg.costCapTokens === "number" && cfg.costCapTokens > 0) {
      let total = 0;
      let max = -1;
      for (const i of inputs) {
        const tok = tokensOf(i.sample);
        total += tok;
        if (tok > max) {
          max = tok;
          topTokenSpender = i.agentId;
        }
      }
      if (total <= cfg.costCapTokens) topTokenSpender = null;
    }
    for (const input of inputs) {
      const s = this.get(input.agentId);
      const trip = this.evaluate(
        input,
        s,
        cfg,
        nowMs,
        input.agentId === topSpender,
        cfg.costCapUsd,
        input.agentId === topTokenSpender,
        cfg.costCapTokens
      );
      if (input.sample) s.lastSample = input.sample;
      const ceiling = cfg.hardStop ? "stopped" : "constrained";
      let target = s.level;
      if (trip.tripping) {
        target = LEVELS[Math.min(rank2(s.level) + 1, rank2(ceiling))];
      } else {
        target = LEVELS[Math.max(rank2(s.level) - 1, 0)];
      }
      const changed = target !== s.level;
      const escalated = rank2(target) > rank2(s.level);
      s.level = target;
      s.reason = trip.tripping ? trip.reason : changed ? "recovering \u2014 signals cleared" : s.reason;
      decisions.push({
        state: { agentId: input.agentId, level: target, reason: s.reason, ts: nowMs },
        action: escalated ? actionFor(target) : "none",
        changed
      });
    }
    return decisions;
  }
  /** Pure trip evaluation for one agent given its signals + remembered baseline. */
  evaluate(input, s, cfg, nowMs, isTopSpender, costCapUsd, isTopTokenSpender, costCapTokens) {
    if (s.repeatCount >= cfg.repeatedToolLimit) {
      return { tripping: true, reason: `looping: ${s.repeatCount}\xD7 identical tool call (${s.repeatKey?.split(":")[0] ?? "?"})` };
    }
    if (s.errorCount >= cfg.errorStormLimit) {
      return { tripping: true, reason: `error storm: ${s.errorCount} consecutive api errors/retries` };
    }
    const perAgentCap = cfg.agentTokenCaps?.[input.agentId];
    if (typeof perAgentCap === "number" && perAgentCap > 0 && tokensOf(input.sample) > perAgentCap) {
      return { tripping: true, reason: `token limit: ${tokensOf(input.sample).toLocaleString()} over the agent cap of ${perAgentCap.toLocaleString()}` };
    }
    if (isTopSpender && typeof costCapUsd === "number") {
      return { tripping: true, reason: `cost cap: floor total over $${costCapUsd} (top spender $${(input.sample?.usd ?? 0).toFixed(2)})` };
    }
    if (isTopTokenSpender && typeof costCapTokens === "number") {
      return { tripping: true, reason: `token cap: floor total over ${costCapTokens.toLocaleString()} tokens (top spender ${tokensOf(input.sample).toLocaleString()})` };
    }
    if (input.sample && s.lastSample && nowMs >= s.compactingUntil) {
      const dOut = input.sample.output - s.lastSample.output;
      const dMin = (input.sample.ts - s.lastSample.ts) / 6e4;
      if (dOut > 0 && dMin > 0) {
        const velocity = dOut / dMin;
        if (velocity > cfg.tokenVelocityPerMin) {
          return { tripping: true, reason: `token velocity ${Math.round(velocity)}/min > ${cfg.tokenVelocityPerMin}/min` };
        }
        const toolActive = nowMs - s.lastDistinctToolAt < PROGRESS_TOOL_WINDOW_MS;
        if (!input.progressing && !toolActive) {
          s.noProgressBeats += 1;
          if (s.noProgressBeats >= NO_PROGRESS_BEATS) {
            return { tripping: true, reason: "no-progress: generating tokens without coordinating (stale log/files)" };
          }
        } else {
          s.noProgressBeats = 0;
        }
      }
    }
    return { tripping: false, reason: "" };
  }
};

// cth/main/memory.ts
var import_node_fs7 = require("node:fs");
var import_node_path6 = require("node:path");
var import_node_child_process6 = require("node:child_process");

// cth/main/palaceReap.ts
var QUARANTINE = /\.(?:drift|corrupt)-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/;
function quarantineStampMs(name) {
  const m = QUARANTINE.exec(name);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const t = new Date(+y, +mo - 1, +d, +h, +mi, +s).getTime();
  return Number.isNaN(t) ? null : t;
}
var DEFAULTS3 = { keep: 2, minAgeMs: 10 * 6e4 };
function quarantineDirsToReap(entries, nowMs, opts = {}) {
  const keep = opts.keep ?? DEFAULTS3.keep;
  const minAgeMs = opts.minAgeMs ?? DEFAULTS3.minAgeMs;
  const stamped = [];
  for (const e of entries) {
    const ts = quarantineStampMs(e.name);
    if (ts !== null) stamped.push({ name: e.name, ts });
  }
  stamped.sort((a, b) => b.ts - a.ts || b.name.localeCompare(a.name));
  return stamped.slice(Math.max(0, keep)).filter((q) => nowMs - q.ts >= minAgeMs).map((q) => q.name);
}
function nextMineDelayMs(currentMs, baseMs, maxMs, quarantinedThisPass) {
  if (!quarantinedThisPass) return baseMs;
  return Math.min(Math.max(currentMs, baseMs) * 2, maxMs);
}

// cth/main/memory.ts
var MINE_IGNORE_LINES2 = ["settings.json", "cursor.json", "inbox/", "outbox/", ".codex/"];
function ensureMineIgnore2(agentDir) {
  const path3 = (0, import_node_path6.join)(agentDir, ".gitignore");
  let existing = "";
  try {
    if ((0, import_node_fs7.existsSync)(path3)) existing = (0, import_node_fs7.readFileSync)(path3, "utf8");
  } catch {
    return;
  }
  const have = new Set(existing.split("\n").map((l) => l.trim()));
  const missing = MINE_IGNORE_LINES2.filter((l) => !have.has(l));
  if (missing.length === 0) return;
  const prefix = existing && !existing.endsWith("\n") ? existing + "\n" : existing;
  try {
    (0, import_node_fs7.writeFileSync)(path3, prefix + missing.join("\n") + "\n", "utf8");
  } catch {
  }
}
var MINE_INTERVAL_MS = 6e5;
var MINE_BACKOFF_MAX_MS = 18e5;
var MINE_TIMEOUT_MS = 10 * 6e4;
function mempalaceDevice(platform, envOverride) {
  if (envOverride) return void 0;
  return platform === "darwin" ? "cpu" : void 0;
}
var MEMPALACE_DEVICE = mempalaceDevice(process.platform, process.env.MEMPALACE_EMBEDDING_DEVICE);
var MemoryManager = class {
  constructor(getHome, getSettings) {
    this.getHome = getHome;
    this.getSettings = getSettings;
  }
  getHome;
  getSettings;
  binCache;
  mineTimer = null;
  mineStopped = false;
  /** Current gap between mine passes. Widens while the palace is quarantining. */
  mineDelayMs = MINE_INTERVAL_MS;
  /** Newest quarantine stamp seen so far, so a LATER one means the palace
   *  quarantined again. A count would be useless: the reaper deletes them. */
  lastQuarantineTs = 0;
  initStarted = false;
  /** True while a mineNow() pass is in flight — serializes palace writers. */
  mining = false;
  /** agentId → memory.md mtimeMs at last successful mine (skip unchanged). */
  lastMined = /* @__PURE__ */ new Map();
  palacePath() {
    const h = this.getHome();
    return h ? (0, import_node_path6.join)(h, "palace") : null;
  }
  /** Resolve the mempalace CLI against the user's PATH + common uv/pip spots. */
  bin() {
    if (this.binCache !== void 0) return this.binCache;
    let found = null;
    const isWin = process.platform === "win32";
    try {
      if (isWin) {
        const res = (0, import_node_child_process6.spawnSync)("where", ["mempalace"], { encoding: "utf8", timeout: 3e3 });
        const p = res.stdout.trim().split(/\r?\n/)[0]?.trim();
        if (p && (0, import_node_fs7.existsSync)(p)) found = p;
      } else {
        const res = (0, import_node_child_process6.spawnSync)(process.env.SHELL ?? "/bin/zsh", ["-ilc", "which mempalace"], {
          encoding: "utf8",
          timeout: 3e3
        });
        const p = res.stdout.trim().split("\n").pop();
        if (p && (0, import_node_fs7.existsSync)(p)) found = p;
      }
    } catch {
    }
    if (!found) {
      const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
      const candidates = isWin ? [
        (0, import_node_path6.join)(home, ".local", "bin", "mempalace.exe"),
        (0, import_node_path6.join)(process.env.LOCALAPPDATA ?? "", "Programs", "Python", "Scripts", "mempalace.exe")
      ] : [
        `${home}/.local/bin/mempalace`,
        "/opt/homebrew/bin/mempalace",
        "/usr/local/bin/mempalace"
      ];
      for (const c of candidates) if (c && (0, import_node_fs7.existsSync)(c)) {
        found = c;
        break;
      }
    }
    this.binCache = found;
    return found;
  }
  /** Force re-resolution (e.g. after the user installs mempalace). */
  resetBinCache() {
    this.binCache = void 0;
  }
  available() {
    return this.bin() !== null;
  }
  enabled() {
    return this.getSettings().enabled;
  }
  active() {
    return this.available() && this.enabled() && this.getHome() !== null;
  }
  model() {
    return this.getSettings().model === "embeddinggemma" ? "embeddinggemma" : "minilm";
  }
  status() {
    const palace = this.palacePath();
    return {
      available: this.available(),
      enabled: this.enabled(),
      active: this.active(),
      initialized: !!palace && (0, import_node_fs7.existsSync)(palace),
      palacePath: palace,
      model: this.model(),
      bin: this.bin()
    };
  }
  /** Env merged into each agent's spawn so its `mempalace` CLI hits the shared palace. */
  env() {
    const palace = this.palacePath();
    if (!this.active() || !palace) return {};
    return {
      MEMPALACE_PALACE_PATH: palace,
      MEMPALACE_EMBEDDING_MODEL: this.model(),
      ...MEMPALACE_DEVICE ? { MEMPALACE_EMBEDDING_DEVICE: MEMPALACE_DEVICE } : {}
    };
  }
  childEnv() {
    return {
      ...process.env,
      MEMPALACE_PALACE_PATH: this.palacePath() ?? "",
      MEMPALACE_EMBEDDING_MODEL: this.model(),
      ...MEMPALACE_DEVICE ? { MEMPALACE_EMBEDDING_DEVICE: MEMPALACE_DEVICE } : {}
    };
  }
  // — lifecycle —
  /** Start the mine loop. `mempalace mine` auto-creates the palace on first run
   *  (lazily downloading the embedding model, one-time). We deliberately do NOT
   *  run `mempalace init`: it ends in an interactive "Mine now? [Y/n]" prompt
   *  that --yes doesn't cover, so a spawned child would hang forever. */
  start() {
    if (!this.active() || this.initStarted) return;
    if (!this.bin() || !this.getHome() || !this.palacePath()) return;
    this.initStarted = true;
    this.reapPalace();
    this.startMineLoop();
  }
  stop() {
    this.mineStopped = true;
    if (this.mineTimer) {
      clearTimeout(this.mineTimer);
      this.mineTimer = null;
    }
  }
  /**
   * Re-resolve the CLI, arm the mine loop if it is only now possible, and report.
   *
   * `start()` runs once at boot and bails when mempalace isn't on PATH yet. If the
   * user installs it AFTER that — the common case, since the settings panel is
   * where they find out they need it — nothing re-invoked `start()`, so the mine
   * loop never ran. The palace is created by the first `mempalace mine`, so it
   * never appeared either, and `initialized` (existsSync(palace)) stayed false
   * while `available` flipped true: the status pill read "On — getting ready…"
   * forever and only an app restart cleared it.
   *
   * The status poll is the one thing that reliably notices the install, so it is
   * where the re-arm belongs. `start()` is idempotent (initStarted), so repeated
   * polls never start a second loop — and it still deliberately does NOT run
   * `mempalace init`, which ends in an interactive "Mine now? [Y/n]" that `--yes`
   * doesn't cover and that hangs a spawned child.
   */
  refresh() {
    this.resetBinCache();
    this.start();
    return this.status();
  }
  /** Self-scheduling rather than `setInterval`, so the gap can widen when the
   *  palace is quarantining and snap back the moment it stops. */
  startMineLoop() {
    if (this.mineTimer) return;
    const tick = () => {
      void this.mineNow().finally(() => {
        if (this.mineStopped) return;
        this.mineTimer = setTimeout(tick, this.mineDelayMs);
        this.mineTimer.unref?.();
      });
    };
    this.mineTimer = setTimeout(tick, 0);
    this.mineTimer.unref?.();
  }
  // — mining (store) —
  /** Mine every agent whose memory changed since last time, one at a time.
   *  The palace permits a single writer, so mines MUST be serialized — firing
   *  them concurrently makes all but one fail with "held by another writer".
   *  `mining` guards against a slow pass overlapping the next interval tick. */
  async mineNow() {
    const home = this.getHome();
    const bin = this.bin();
    if (!this.active() || !home || !bin) return;
    if (this.mining) return;
    const agentsDir = (0, import_node_path6.join)(home, "hive", "agents");
    if (!(0, import_node_fs7.existsSync)(agentsDir)) return;
    let ids;
    try {
      ids = (0, import_node_fs7.readdirSync)(agentsDir);
    } catch {
      return;
    }
    this.mining = true;
    try {
      for (const id of ids) {
        const agentDir = (0, import_node_path6.join)(agentsDir, id);
        const mem = (0, import_node_path6.join)(agentDir, "memory.md");
        if (!(0, import_node_fs7.existsSync)(mem)) continue;
        let mtime = 0;
        try {
          mtime = (0, import_node_fs7.statSync)(mem).mtimeMs;
        } catch {
          continue;
        }
        if (this.lastMined.get(id) === mtime) continue;
        this.lastMined.set(id, mtime);
        await this.mineAgent(agentDir, id);
      }
    } finally {
      this.mining = false;
    }
    const quarantined = this.reapPalace();
    this.mineDelayMs = nextMineDelayMs(
      this.mineDelayMs,
      MINE_INTERVAL_MS,
      MINE_BACKOFF_MAX_MS,
      quarantined
    );
  }
  /**
   * Delete quarantined segment copies MemPalace renamed aside and never removed.
   *
   * Safe to delete: the rename is precisely what takes them OUT of the palace's
   * live set, and Chroma has already rebuilt by the time we see one. They are
   * diagnostic residue. `quarantineDirsToReap` keeps the newest couple so there
   * is still something to look at, and refuses to touch anything recent enough
   * to still be mid-recovery.
   *
   * Best-effort throughout. A palace we cannot read, or a directory we cannot
   * remove, must never take down the mine loop — this is disk hygiene, not a
   * correctness path.
   */
  reapPalace() {
    const palace = this.palacePath();
    if (!palace || !(0, import_node_fs7.existsSync)(palace)) return false;
    let names;
    try {
      names = (0, import_node_fs7.readdirSync)(palace);
    } catch {
      return false;
    }
    let newest = 0;
    for (const name of names) {
      const ts = quarantineStampMs(name);
      if (ts !== null && ts > newest) newest = ts;
    }
    const fresh = this.lastQuarantineTs > 0 && newest > this.lastQuarantineTs;
    if (newest > this.lastQuarantineTs) this.lastQuarantineTs = newest;
    const doomed = quarantineDirsToReap(names.map((name) => ({ name })), Date.now());
    if (!doomed.length) return fresh;
    let removed = 0;
    for (const name of doomed) {
      try {
        (0, import_node_fs7.rmSync)((0, import_node_path6.join)(palace, name), { recursive: true, force: true });
        removed += 1;
      } catch {
      }
    }
    if (removed) console.log(`[memory] reaped ${removed} quarantined palace segment(s)`);
    return fresh;
  }
  mineAgent(agentDir, id) {
    return new Promise((resolve4) => {
      const bin = this.bin();
      if (!bin) {
        resolve4();
        return;
      }
      ensureMineIgnore2(agentDir);
      const proc = (0, import_node_child_process6.spawn)(bin, ["mine", agentDir, "--wing", id, "--agent", id], {
        env: this.childEnv(),
        stdio: ["ignore", "ignore", "pipe"]
      });
      let err = "";
      proc.stderr?.on("data", (d) => {
        err += d.toString();
      });
      const timer = setTimeout(() => {
        console.error(`[memory] mine ${id} timed out after ${MINE_TIMEOUT_MS / 6e4}min \u2014 killing`);
        try {
          proc.kill("SIGTERM");
        } catch {
        }
        ensureKilled(proc.pid);
      }, MINE_TIMEOUT_MS);
      timer.unref?.();
      proc.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          console.error(`[memory] mine ${id} exited ${code}: ${err.slice(-300)}`);
          this.lastMined.delete(id);
        }
        resolve4();
      });
      proc.on("error", () => {
        clearTimeout(timer);
        this.lastMined.delete(id);
        resolve4();
      });
    });
  }
  // — recall (read) —
  /** Run one mempalace read command asynchronously. These used to be spawnSync
   *  with a 120s timeout — on a cold model load that BLOCKED the Electron main
   *  process (renderer IPC, timers, every window) for up to two minutes. Same
   *  contract, but the event loop keeps breathing and a wedged CLI is swept. */
  runCli(args, label) {
    return new Promise((resolve4) => {
      const bin = this.bin();
      if (!this.active() || !bin) {
        resolve4({ ok: false, output: "", error: "semantic memory not active" });
        return;
      }
      let proc;
      try {
        proc = (0, import_node_child_process6.spawn)(bin, args, { env: this.childEnv(), stdio: ["ignore", "pipe", "pipe"] });
      } catch (e) {
        resolve4({ ok: false, output: "", error: e instanceof Error ? e.message : String(e) });
        return;
      }
      let out = "", err = "";
      let settled = false;
      const settle = (r) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve4(r);
        }
      };
      proc.stdout?.setEncoding("utf8");
      proc.stderr?.setEncoding("utf8");
      proc.stdout?.on("data", (d) => {
        out += d;
      });
      proc.stderr?.on("data", (d) => {
        err += d;
      });
      const timer = setTimeout(() => {
        try {
          proc.kill("SIGTERM");
        } catch {
        }
        ensureKilled(proc.pid);
        settle({ ok: false, output: out, error: `${label} timed out` });
      }, 12e4);
      timer.unref?.();
      proc.on("close", (code) => {
        if (code !== 0) settle({ ok: false, output: out, error: (err || `${label} failed`).trim() });
        else settle({ ok: true, output: out });
      });
      proc.on("error", (e) => settle({ ok: false, output: "", error: e.message }));
    });
  }
  /** Semantic search across the shared palace. Returns the CLI's text output. */
  search(query, opts = {}) {
    const args = ["search", query, "--results", String(opts.results ?? 5)];
    if (opts.wing) args.push("--wing", opts.wing);
    return this.runCli(args, "search");
  }
  /** Session-start digest (~600-900 tokens). */
  wakeUp(wing) {
    const args = ["wake-up"];
    if (wing) args.push("--wing", wing);
    return this.runCli(args, "wake-up");
  }
};

// cth/main/knowledge.ts
var import_electron4 = require("electron");
var import_node_fs8 = require("node:fs");
var import_node_path7 = require("node:path");
var core = require_kg_core();
var KnowledgeManager = class {
  /** Whether the feature flag is on. */
  active() {
    return readConfig().knowledgeGraph?.enabled === true;
  }
  /** The store directory (config override or <userData>/knowledge). */
  root() {
    const override = readConfig().knowledgeGraph?.rootPath;
    if (override && override.trim()) return override;
    return (0, import_node_path7.join)(import_electron4.app.getPath("userData"), "knowledge");
  }
  /** Absolute path to the agent CLI (dev: repo resources/; packaged: resourcesPath). */
  cliPath() {
    return import_electron4.app.isPackaged ? (0, import_node_path7.join)(process.resourcesPath, "kg.cjs") : (0, import_node_path7.join)(import_electron4.app.getAppPath(), "resources", "kg.cjs");
  }
  /** Absolute path to the pure-JS core for the out-of-process CLI to require. */
  corePath() {
    return import_electron4.app.isPackaged ? (0, import_node_path7.join)(process.resourcesPath, "kg-core.cjs") : (0, import_node_path7.join)(import_electron4.app.getAppPath(), "src", "main", "kg-core.cjs");
  }
  /** Env merged into each agent's spawn so its `kg` CLI hits this store. Empty
   *  when off — so a default install injects nothing (zero behaviour change). */
  env() {
    if (!this.active()) return {};
    return { KG_ROOT: this.root(), KG_CLI: this.cliPath(), KG_CORE: this.corePath() };
  }
  status() {
    const enabled = this.active();
    const root = this.root();
    const s = enabled && (0, import_node_fs8.existsSync)(root) ? core.stats(root) : { docCount: 0, chunkCount: 0, byModality: {} };
    return { enabled, root, docCount: s.docCount, chunkCount: s.chunkCount, byModality: s.byModality };
  }
  /** Ingest a file from disk. No-op-safe when off (callers gate on status). */
  ingestFile(srcPath, opts = {}) {
    return core.ingest(this.root(), { srcPath, ...opts });
  }
  /** Ingest inline text (e.g. pasted content). */
  ingestText(text, opts = {}) {
    return core.ingest(this.root(), { text, ...opts });
  }
  search(query, limit) {
    if (!(0, import_node_fs8.existsSync)(this.root())) return [];
    return core.search(this.root(), query, { limit });
  }
  list() {
    if (!(0, import_node_fs8.existsSync)(this.root())) return [];
    return core.list(this.root());
  }
  get(docId) {
    return core.getDoc(this.root(), docId);
  }
  remove(docId) {
    return core.removeDoc(this.root(), docId);
  }
};

// cth/main/reflect.ts
var import_node_fs11 = require("node:fs");
var import_node_path10 = require("node:path");

// cth/main/hiddenClaude.ts
var pty2 = __toESM(require("node-pty"));
var import_node_fs10 = require("node:fs");
var import_node_path9 = __toESM(require("node:path"));

// cth/main/transcript.ts
var import_node_fs9 = require("node:fs");
var import_node_os4 = __toESM(require("node:os"));
var import_node_path8 = __toESM(require("node:path"));
function projectKey(cwd) {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}
function legacyProjectKey(cwd) {
  return process.platform === "win32" ? projectKey(cwd) : cwd.replace(/^\//, "").replaceAll("/", "-");
}
function projectDir(cwd) {
  const root = import_node_path8.default.join(import_node_os4.default.homedir(), ".claude/projects");
  const current = import_node_path8.default.join(root, projectKey(cwd));
  if ((0, import_node_fs9.existsSync)(current)) return current;
  const legacyKey = legacyProjectKey(cwd);
  if (!legacyKey) return current;
  const legacy = import_node_path8.default.join(root, legacyKey);
  return (0, import_node_fs9.existsSync)(legacy) ? legacy : current;
}
var VALID_SESSION_ID = /^[A-Za-z0-9_-]+$/;
function seedSessionTranscript(cwd, sessionId) {
  try {
    if (!sessionId || !VALID_SESSION_ID.test(sessionId)) return false;
    const target = import_node_path8.default.join(projectDir(cwd), `${sessionId}.jsonl`);
    if ((0, import_node_fs9.existsSync)(target)) return true;
    const projectsRoot = import_node_path8.default.join(import_node_os4.default.homedir(), ".claude/projects");
    if (!(0, import_node_fs9.existsSync)(projectsRoot)) return false;
    for (const dir of (0, import_node_fs9.readdirSync)(projectsRoot)) {
      const candidate = import_node_path8.default.join(projectsRoot, dir, `${sessionId}.jsonl`);
      if ((0, import_node_fs9.existsSync)(candidate)) {
        (0, import_node_fs9.mkdirSync)(import_node_path8.default.dirname(target), { recursive: true });
        (0, import_node_fs9.cpSync)(candidate, target);
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
function resolveSessionCwd(sessionId) {
  try {
    if (!sessionId || !VALID_SESSION_ID.test(sessionId)) return null;
    const projectsRoot = import_node_path8.default.join(import_node_os4.default.homedir(), ".claude/projects");
    if (!(0, import_node_fs9.existsSync)(projectsRoot)) return null;
    let best = null;
    for (const dir of (0, import_node_fs9.readdirSync)(projectsRoot)) {
      const candidate = import_node_path8.default.join(projectsRoot, dir, `${sessionId}.jsonl`);
      try {
        const st = (0, import_node_fs9.statSync)(candidate);
        if (!best || st.mtimeMs > best.mtime) best = { file: candidate, mtime: st.mtimeMs };
      } catch {
      }
    }
    if (!best) return null;
    const text = (0, import_node_fs9.readFileSync)(best.file, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const rec = JSON.parse(trimmed);
        if (typeof rec.cwd === "string" && rec.cwd) return rec.cwd;
      } catch {
      }
    }
    return null;
  } catch {
    return null;
  }
}
function zero() {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, estimatedCostUsd: 0 };
}
var usageCache = /* @__PURE__ */ new Map();
var USAGE_CACHE_MAX = 2048;
function parseUsageLines(text, sessionId, acc) {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let rec;
    try {
      rec = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (rec.type !== "assistant") continue;
    if (sessionId && rec.sessionId !== sessionId) continue;
    const u = rec.message?.usage;
    if (!u) continue;
    const model = typeof rec.message?.model === "string" ? normalizeModel(rec.message.model) : void 0;
    if (model) acc.model = model;
    const rIn = num(u.input_tokens);
    const rOut = num(u.output_tokens);
    const rCacheWrite = num(u.cache_creation_input_tokens);
    const rCacheRead = num(u.cache_read_input_tokens);
    acc.inputTokens += rIn;
    acc.outputTokens += rOut;
    acc.cacheWriteTokens += rCacheWrite;
    acc.cacheReadTokens += rCacheRead;
    acc.estimatedCostUsd += estimateCostUsd(model, {
      inputTokens: rIn,
      outputTokens: rOut,
      cacheReadTokens: rCacheRead,
      cacheWriteTokens: rCacheWrite
    });
  }
}
function readFileUsage(dir, file, sessionId) {
  const key = `${dir}|${file}|${sessionId ?? "*"}`;
  const full = import_node_path8.default.join(dir, file);
  let st;
  try {
    st = (0, import_node_fs9.statSync)(full);
  } catch {
    usageCache.delete(key);
    return null;
  }
  const cached = usageCache.get(key);
  if (cached && cached.size === st.size && cached.mtimeMs === st.mtimeMs) return cached;
  const fromScratch = !cached || st.size < cached.offset;
  const entry = fromScratch ? { size: st.size, mtimeMs: st.mtimeMs, offset: 0, totals: zero() } : { size: st.size, mtimeMs: st.mtimeMs, offset: cached.offset, totals: { ...cached.totals } };
  try {
    const fd = (0, import_node_fs9.openSync)(full, "r");
    try {
      const len = st.size - entry.offset;
      if (len > 0) {
        const buf = Buffer.alloc(len);
        const read = (0, import_node_fs9.readSync)(fd, buf, 0, len, entry.offset);
        const text = buf.subarray(0, read).toString("utf8");
        const lastNl = text.lastIndexOf("\n");
        if (lastNl !== -1) {
          const complete = text.slice(0, lastNl + 1);
          parseUsageLines(complete, sessionId, entry.totals);
          entry.offset += Buffer.byteLength(complete, "utf8");
        }
      }
    } finally {
      (0, import_node_fs9.closeSync)(fd);
    }
  } catch {
  }
  usageCache.set(key, entry);
  if (usageCache.size > USAGE_CACHE_MAX) {
    let drop = usageCache.size - USAGE_CACHE_MAX / 2;
    for (const k of usageCache.keys()) {
      if (drop-- <= 0) break;
      usageCache.delete(k);
    }
  }
  return entry;
}
function readAgentUsage(cwd, opts = {}) {
  const usage = zero();
  try {
    const dir = projectDir(cwd);
    if (!(0, import_node_fs9.existsSync)(dir)) return usage;
    const files = (0, import_node_fs9.readdirSync)(dir).filter((f) => f.endsWith(".jsonl"));
    let lastModel;
    for (const file of files) {
      const entry = readFileUsage(dir, file, opts.sessionId);
      if (!entry) continue;
      usage.inputTokens += entry.totals.inputTokens;
      usage.outputTokens += entry.totals.outputTokens;
      usage.cacheWriteTokens += entry.totals.cacheWriteTokens;
      usage.cacheReadTokens += entry.totals.cacheReadTokens;
      usage.estimatedCostUsd += entry.totals.estimatedCostUsd;
      if (entry.totals.model) lastModel = entry.totals.model;
    }
    if (lastModel) usage.model = lastModel;
    return usage;
  } catch {
    return zero();
  }
}
function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
var CONTEXT_TAIL_BYTES = 256 * 1024;
function readContextTokens(transcriptPath) {
  try {
    if (!(0, import_node_fs9.existsSync)(transcriptPath)) return null;
    const fd = (0, import_node_fs9.openSync)(transcriptPath, "r");
    try {
      const size = (0, import_node_fs9.fstatSync)(fd).size;
      const len = Math.min(size, CONTEXT_TAIL_BYTES);
      if (len === 0) return null;
      const buf = Buffer.alloc(len);
      (0, import_node_fs9.readSync)(fd, buf, 0, len, size - len);
      const lines = buf.toString("utf8").split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        const trimmed = lines[i].trim();
        if (!trimmed) continue;
        let rec;
        try {
          rec = JSON.parse(trimmed);
        } catch {
          continue;
        }
        if (rec.type !== "assistant") continue;
        const u = rec.message?.usage;
        if (!u) continue;
        return num(u.input_tokens) + num(u.output_tokens) + num(u.cache_creation_input_tokens) + num(u.cache_read_input_tokens);
      }
      return null;
    } finally {
      (0, import_node_fs9.closeSync)(fd);
    }
  } catch {
    return null;
  }
}

// cth/main/hiddenClaude.ts
var BOOT_QUIET_MS = 1500;
function extractLastAssistantText(cwd, spawnedAt) {
  try {
    const dir = projectDir(cwd);
    if (!(0, import_node_fs10.existsSync)(dir)) return null;
    const candidates = [];
    for (const f of (0, import_node_fs10.readdirSync)(dir)) {
      if (!f.endsWith(".jsonl")) continue;
      try {
        const mtime = (0, import_node_fs10.statSync)(import_node_path9.default.join(dir, f)).mtimeMs;
        if (mtime >= spawnedAt - 5e3) candidates.push({ f, mtime });
      } catch {
      }
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.mtime - a.mtime);
    const lines = (0, import_node_fs10.readFileSync)(import_node_path9.default.join(dir, candidates[0].f), "utf8").split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (!trimmed) continue;
      let rec;
      try {
        rec = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (rec.type !== "assistant") continue;
      const content = rec.message?.content;
      if (!Array.isArray(content)) continue;
      for (let j = content.length - 1; j >= 0; j--) {
        const block = content[j];
        if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
          return block.text.trim();
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}
function runHiddenClaude(prompt, opts) {
  return new Promise((resolve4) => {
    if (!prompt.trim()) {
      resolve4({ ok: false, error: "empty prompt" });
      return;
    }
    const cwd = opts.cwd ? expandTilde(opts.cwd) : opts.cwd;
    if (!cwd || !(0, import_node_fs10.existsSync)(cwd)) {
      resolve4({ ok: false, error: `cwd does not exist: ${opts.cwd}` });
      return;
    }
    opts = { ...opts, cwd };
    const binary = (opts.command || "claude").trim().split(/\s+/)[0] || "claude";
    const exe = resolveCommand(binary);
    const disallowed = opts.disallowedTools ?? ["Edit", "Write", "NotebookEdit"];
    const addDirs = (opts.addDirs ?? []).filter((d) => d && (0, import_node_fs10.existsSync)(d));
    const args = [
      "--model",
      opts.model,
      "--permission-mode",
      "bypassPermissions",
      "--disallowedTools",
      ...disallowed
    ];
    for (const d of addDirs) {
      args.push("--add-dir", d);
    }
    const bootCapMs = opts.bootCapMs ?? 7e3;
    const idleMs = opts.idleMs ?? 3500;
    const timeoutMs = opts.timeoutMs ?? 18e4;
    const spawnedAt = Date.now();
    const winWrap = process.platform === "win32" && !/\.(exe|com)$/i.test(exe);
    const spawnFile = winWrap ? process.env.ComSpec || "cmd.exe" : exe;
    const spawnArgs = winWrap ? ["/c", exe, ...args] : args;
    let ptyProc;
    try {
      ptyProc = pty2.spawn(spawnFile, spawnArgs, {
        name: "xterm-color",
        cols: 220,
        rows: 50,
        cwd: opts.cwd,
        env: {
          ...process.env,
          PATH: userShellPath(),
          ...opts.env ?? {}
        }
      });
    } catch (e) {
      resolve4({ ok: false, error: e instanceof Error ? e.message : String(e) });
      return;
    }
    let settled = false;
    let promptSent = false;
    let bootTimer = null;
    let idleTimer = null;
    let bootMaxTimer;
    let globalTimer;
    const kill = () => {
      const pid = ptyProc.pid;
      try {
        ptyProc.kill();
      } catch {
      }
      ensureKilled(pid);
    };
    const finish2 = (r) => {
      if (settled) return;
      settled = true;
      if (bootTimer) {
        clearTimeout(bootTimer);
        bootTimer = null;
      }
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      clearTimeout(bootMaxTimer);
      clearTimeout(globalTimer);
      kill();
      resolve4(r);
    };
    const captureAndFinish = () => {
      const text = extractLastAssistantText(opts.cwd, spawnedAt);
      finish2(text ? { ok: true, text } : { ok: false, error: "no assistant response found in transcript" });
    };
    const sendPrompt = () => {
      if (settled || promptSent) return;
      promptSent = true;
      if (bootTimer) {
        clearTimeout(bootTimer);
        bootTimer = null;
      }
      ptyProc.write(`\x1B[200~${prompt}\x1B[201~`);
      setTimeout(() => {
        if (!settled) ptyProc.write("\r");
      }, 140);
    };
    bootMaxTimer = setTimeout(sendPrompt, bootCapMs);
    globalTimer = setTimeout(
      () => finish2({ ok: false, error: "hidden session timed out" }),
      timeoutMs
    );
    ptyProc.onData(() => {
      if (!promptSent) {
        if (bootTimer) clearTimeout(bootTimer);
        bootTimer = setTimeout(sendPrompt, BOOT_QUIET_MS);
      } else {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(captureAndFinish, idleMs);
      }
    });
    ptyProc.onExit(() => {
      if (!settled) captureAndFinish();
    });
  });
}

// cth/main/reflect.ts
var BUDGET_BYTES = 131072;
var CONDENSE_MODEL = "claude-haiku-4-5";
var DEFAULT_TIMEOUT_MS = 18e4;
var PINNED_HEADING = "## \u{1F4CC} Durable facts (pinned \u2014 never condensed)";
var CONDENSED_HEADING = "## \u{1F5DC} Condensed history";
var RECENT_HEADING = "## Recent";
var CONDENSE_SYSTEM = [
  "You are compacting one AI agent's long-term memory file. You will receive:",
  "(A) the current CONDENSED summary, (B) older RECENT sections being evicted,",
  "(C) the PINNED durable-facts block (for context only \u2014 do not rewrite it).",
  'Produce STRICT JSON: {"condensed": "<text>", "hoist": ["<line>", ...]}.',
  "RULES:",
  '- "condensed" = a single bounded summary of (A)+(B). Re-summarize (A) together',
  "  with (B) so the result does not grow unbounded. Target <= 1500 words. Preserve",
  "  every decision, root cause, protocol, file path, commit SHA, and numeric result.",
  "  Drop routine standup chatter, resolved blockers, and superseded plans.",
  '- "hoist" = any NEW high-importance durable fact found in (B) that belongs in the',
  "  pinned block and is not already in (C). Lines only; may be empty.",
  "- Output ONLY the JSON object. No prose, no code fence."
].join("\n");
var MemoryReflector = class {
  /**
   * @param getHome      Lazily resolve harnessHome so reflection follows config.
   * @param getCommand   The base `claude` command (only its binary name is used).
   * @param getMemoryEnv Extra env (the shared MemPalace path) merged into the call.
   * @param getSettings  Reflect tunables (interval + thresholds), read each tick.
   * @param appendLog    Sink for `condense`/`condense-abort` events (hive log.jsonl).
   */
  constructor(getHome, getCommand, getMemoryEnv, getSettings, appendLog) {
    this.getHome = getHome;
    this.getCommand = getCommand;
    this.getMemoryEnv = getMemoryEnv;
    this.getSettings = getSettings;
    this.appendLog = appendLog;
  }
  getHome;
  getCommand;
  getMemoryEnv;
  getSettings;
  appendLog;
  timer = null;
  started = false;
  /** True while a reflectNow() pass is in flight — serializes the loop (a slow
   *  LLM pass must not overlap the next interval tick), mirroring MemoryManager. */
  reflecting = false;
  // — lifecycle (mirrors MemoryManager) —
  start() {
    if (this.started) return;
    if (!this.getSettings().enabled) return;
    if (!this.getHome()) return;
    this.started = true;
    const ms = Math.max(6e4, this.getSettings().intervalMs);
    this.timer = setInterval(() => {
      void this.reflectNow();
    }, ms);
  }
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.started = false;
  }
  // — scan —
  /** Reflect every agent whose memory crossed a threshold (or just `onlyId`),
   *  one at a time. Serialized via `reflecting` so a slow pass can't overlap the
   *  next tick. Returns the per-agent outcomes (used by the manual IPC + tests). */
  async reflectNow(onlyId) {
    const home = this.getHome();
    if (!home) return [];
    if (this.reflecting) return [];
    const agentsDir = (0, import_node_path10.join)(home, "hive", "agents");
    if (!(0, import_node_fs11.existsSync)(agentsDir)) return [];
    const settings = this.getSettings();
    let ids;
    try {
      ids = (0, import_node_fs11.readdirSync)(agentsDir);
    } catch {
      return [];
    }
    if (onlyId) ids = ids.filter((id) => id === onlyId);
    this.reflecting = true;
    const results = [];
    try {
      for (const id of ids) {
        const mem = (0, import_node_path10.join)(agentsDir, id, "memory.md");
        if (!(0, import_node_fs11.existsSync)(mem)) continue;
        let bytes = 0;
        let text = "";
        try {
          bytes = (0, import_node_fs11.statSync)(mem).size;
          if (!onlyId && !this.shouldCondense(bytes, mem, settings)) continue;
          text = (0, import_node_fs11.readFileSync)(mem, "utf8");
        } catch {
          continue;
        }
        results.push(await this.condense(home, id, mem, text, settings));
      }
    } finally {
      this.reflecting = false;
    }
    return results;
  }
  /** The dual trigger (DECIDED): bytes > pct% of budget, OR many-section sprawl
   *  above the byte floor. The floor doubles as the "never burn an LLM call on a
   *  tiny file" guard, so it gates BOTH paths. */
  shouldCondense(bytes, mem, s) {
    if (bytes < s.minBytes) return false;
    if (bytes > BUDGET_BYTES * s.byteTriggerPct / 100) return true;
    let sections = 0;
    try {
      sections = countSections((0, import_node_fs11.readFileSync)(mem, "utf8"));
    } catch {
      return false;
    }
    return sections > s.sectionTrigger;
  }
  // — condense one file —
  async condense(home, id, mem, text, s) {
    const oldBytes = Buffer.byteLength(text, "utf8");
    const parsed = parseMemory(text);
    const keepCount = Math.max(1, s.recentKeep);
    const keep = parsed.recent.slice(-keepCount);
    const evict = parsed.recent.slice(0, Math.max(0, parsed.recent.length - keepCount));
    if (evict.length === 0) {
      return { id, condensed: false, reason: "nothing-to-evict", oldBytes };
    }
    const stamp2 = utcStamp();
    const backup = (0, import_node_path10.join)(home, "hive", "backups", stamp2, id, "memory.md");
    try {
      (0, import_node_fs11.mkdirSync)((0, import_node_path10.dirname)(backup), { recursive: true });
      (0, import_node_fs11.copyFileSync)(mem, backup);
    } catch (e) {
      this.logAbort(id, "backup-failed", String(e));
      return { id, condensed: false, reason: "backup-failed", oldBytes };
    }
    let summary;
    try {
      summary = await this.summarize(home, parsed.condensed, evict, parsed.pinned);
    } catch (e) {
      this.logAbort(id, "summarize-failed", String(e));
      return { id, condensed: false, reason: "summarize-failed", oldBytes };
    }
    const oldPinnedLines = pinnedLines(parsed.pinned);
    const mergedPinned = mergePinned(oldPinnedLines, summary.hoist);
    const rebuilt = rebuild(parsed.header, mergedPinned, summary.condensed, keep);
    const newBytes = Buffer.byteLength(rebuilt, "utf8");
    const verdict = verify({
      rebuilt,
      newBytes,
      oldBytes,
      oldPinnedLines,
      mergedPinned,
      condensed: summary.condensed,
      keep
    });
    if (!verdict.ok) {
      this.logAbort(id, verdict.reason, void 0, { oldBytes, newBytes });
      return { id, condensed: false, reason: verdict.reason, oldBytes, newBytes };
    }
    try {
      atomicWrite(mem, rebuilt);
    } catch (e) {
      this.logAbort(id, "swap-failed", String(e), { oldBytes, newBytes });
      return { id, condensed: false, reason: "swap-failed", oldBytes, newBytes };
    }
    try {
      this.appendLog({
        kind: "condense",
        agentId: id,
        oldBytes,
        newBytes,
        evicted: evict.length,
        kept: keep.length,
        hoisted: summary.hoist.length,
        backup
      });
    } catch {
    }
    return { id, condensed: true, reason: "condensed", oldBytes, newBytes };
  }
  logAbort(id, reason, detail, extra) {
    try {
      this.appendLog({ kind: "condense-abort", agentId: id, reason, ...detail ? { detail } : {}, ...extra });
    } catch {
    }
  }
  // — the headless LLM call (the only non-deterministic step) —
  async summarize(home, condensed, evict, pinned) {
    const evictText = evict.map((s) => `${s.heading}
${s.body}`).join("\n\n").trim();
    const prompt = [
      CONDENSE_SYSTEM,
      "",
      "--- INPUT ---",
      "(A) CURRENT CONDENSED SUMMARY:",
      condensed?.trim() || "(none yet)",
      "",
      "(B) OLDER SECTIONS BEING EVICTED:",
      evictText || "(none)",
      "",
      "(C) PINNED DURABLE FACTS (context only \u2014 do not rewrite):",
      pinned?.trim() || "(none)"
    ].join("\n");
    const result = await runHiddenClaude(prompt, {
      model: CONDENSE_MODEL,
      cwd: home,
      command: this.getCommand(),
      // Pure text transform — must never touch the repo or shell out.
      disallowedTools: ["Edit", "Write", "NotebookEdit", "Bash"],
      env: this.getMemoryEnv(),
      timeoutMs: DEFAULT_TIMEOUT_MS
    });
    if (!result.ok || !result.text) {
      throw new Error(result.error ?? "condense: hidden session returned no text");
    }
    const parsed = parseSummary(result.text);
    if (!parsed) throw new Error("condense: response contained no parseable JSON");
    return parsed;
  }
};
function countSections(text) {
  return (text.match(/^##\s/gm) ?? []).length;
}
function parseMemory(text) {
  const lines = text.split("\n");
  let firstSection = lines.findIndex((l) => /^##\s/.test(l));
  if (firstSection === -1) firstSection = lines.length;
  const header = lines.slice(0, firstSection).join("\n").replace(/\s+$/, "");
  const sections = [];
  let cur = null;
  for (let i = firstSection; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s/.test(line)) {
      if (cur) sections.push(cur);
      cur = { heading: line, body: "" };
    } else if (cur) {
      cur.body += (cur.body ? "\n" : "") + line;
    }
  }
  if (cur) sections.push(cur);
  let pinned = null;
  let condensed = null;
  const recent = [];
  for (const s of sections) {
    const h = s.heading.trim();
    if (h.startsWith("## \u{1F4CC}")) pinned = s.body.replace(/\s+$/, "");
    else if (h.startsWith("## \u{1F5DC}")) condensed = s.body.replace(/\s+$/, "");
    else if (h === RECENT_HEADING) {
    } else recent.push(s);
  }
  return { header, pinned, condensed, recent };
}
function pinnedLines(pinned) {
  if (!pinned) return [];
  return pinned.split("\n").map((l) => l.trim()).filter(Boolean);
}
function mergePinned(oldLines, hoist) {
  const have = new Set(oldLines);
  const out = [...oldLines];
  for (const raw of hoist) {
    const line = (raw ?? "").trim();
    if (line && !have.has(line)) {
      have.add(line);
      out.push(line);
    }
  }
  return out;
}
function rebuild(header, pinned, condensed, keep) {
  const parts = [];
  if (header.trim()) parts.push(header.trim());
  parts.push(PINNED_HEADING);
  parts.push(pinned.length ? pinned.join("\n") : "_(none yet)_");
  parts.push(CONDENSED_HEADING);
  parts.push(condensed.trim());
  parts.push(RECENT_HEADING);
  for (const s of keep) parts.push(`${s.heading}
${s.body}`.replace(/\s+$/, ""));
  return parts.join("\n\n") + "\n";
}
function verify(args) {
  const { rebuilt, newBytes, oldBytes, oldPinnedLines, mergedPinned, condensed, keep } = args;
  const re = parseMemory(rebuilt);
  if (re.pinned === null || re.condensed === null) return { ok: false, reason: "structure-missing-region" };
  if (newBytes <= 200) return { ok: false, reason: "too-small" };
  if (!condensed.trim()) return { ok: false, reason: "empty-condensed" };
  if (!(newBytes < oldBytes * 0.95)) return { ok: false, reason: "not-smaller" };
  const newPinned = new Set(pinnedLines(re.pinned));
  for (const line of oldPinnedLines) if (!newPinned.has(line)) return { ok: false, reason: "pinned-line-dropped" };
  for (const line of mergedPinned) if (!newPinned.has(line)) return { ok: false, reason: "pinned-merge-mismatch" };
  if (re.recent.length !== keep.length) return { ok: false, reason: "recent-count-mismatch" };
  for (let i = 0; i < keep.length; i++) {
    const a = `${keep[i].heading}
${keep[i].body}`.replace(/\s+$/, "");
    const b = `${re.recent[i].heading}
${re.recent[i].body}`.replace(/\s+$/, "");
    if (a !== b) return { ok: false, reason: "recent-section-altered" };
  }
  return { ok: true };
}
function parseSummary(stdout) {
  const raw = stdout.trim();
  if (!raw) return null;
  let inner = raw;
  try {
    const env = JSON.parse(raw);
    if (typeof env.result === "string") inner = env.result;
    else if (typeof env.text === "string") inner = env.text;
  } catch {
  }
  inner = inner.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    const obj = JSON.parse(inner);
    if (typeof obj.condensed !== "string" || !obj.condensed.trim()) return null;
    const hoist = Array.isArray(obj.hoist) ? obj.hoist.filter((x) => typeof x === "string") : [];
    return { condensed: obj.condensed, hoist };
  } catch {
    return null;
  }
}
function utcStamp() {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
function atomicWrite(path3, text) {
  const tmp = `${path3}.tmp-${Math.random().toString(36).slice(2, 10)}`;
  (0, import_node_fs11.writeFileSync)(tmp, text, "utf8");
  try {
    const fd = (0, import_node_fs11.openSync)(tmp, "r+");
    try {
      (0, import_node_fs11.fsyncSync)(fd);
    } finally {
      (0, import_node_fs11.closeSync)(fd);
    }
  } catch {
  }
  (0, import_node_fs11.renameSync)(tmp, path3);
}

// cth/main/db.ts
var import_better_sqlite3 = __toESM(require("better-sqlite3"));
var import_electron5 = require("electron");
var import_node_path11 = require("node:path");
function electronNativeBinding() {
  if (!process.versions.electron) return void 0;
  const packageJson = require.resolve("better-sqlite3/package.json");
  return (0, import_node_path11.join)((0, import_node_path11.dirname)(packageJson), "build", "Release", "better_sqlite3.node");
}
var MIGRATIONS = [
  // → user_version 1 (Phase A): scalar kv + net-new command history.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS kv (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,     -- JSON-encoded
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS command_history (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        cwd      TEXT,
        text     TEXT NOT NULL,
        ts       INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ch_agent_ts ON command_history(agent_id, ts DESC);
    `);
  }
];
var PersistStore = class {
  /** @param dbPath  Override the DB location (tests). Defaults to userData/harness.db. */
  constructor(dbPath) {
    this.dbPath = dbPath;
  }
  dbPath;
  db = null;
  /** Open (creating if needed) and migrate the DB. Idempotent — a second call is
   *  a no-op. Throws if the native module fails to load or the file is unusable;
   *  callers should guard so a DB failure can't crash app startup. */
  open() {
    if (this.db) return;
    const path3 = this.dbPath ?? (0, import_node_path11.join)(import_electron5.app.getPath("userData"), "harness.db");
    const nativeBinding = electronNativeBinding();
    const db = nativeBinding ? new import_better_sqlite3.default(path3, { nativeBinding }) : new import_better_sqlite3.default(path3);
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.pragma("busy_timeout = 5000");
    db.pragma("foreign_keys = ON");
    this.migrate(db);
    this.db = db;
  }
  migrate(db) {
    const version = db.pragma("user_version", { simple: true });
    for (let i = version; i < MIGRATIONS.length; i++) {
      const run = db.transaction(() => {
        MIGRATIONS[i](db);
        db.pragma(`user_version = ${i + 1}`);
      });
      run();
    }
  }
  /** Close the handle (checkpoints WAL). Safe to call when already closed. */
  close() {
    try {
      this.db?.close();
    } catch {
    }
    this.db = null;
  }
  get isOpen() {
    return this.db !== null;
  }
  // ─── kv (scalar app state) ─────────────────────────────────────────────────
  /** Read a JSON-decoded scalar, or undefined if absent/unparseable. */
  getKv(key) {
    if (!this.db) return void 0;
    const row = this.db.prepare("SELECT value FROM kv WHERE key = ?").get(key);
    if (!row) return void 0;
    try {
      return JSON.parse(row.value);
    } catch {
      return void 0;
    }
  }
  /** Upsert a JSON-encoded scalar. */
  setKv(key, value) {
    if (!this.db) return;
    this.db.prepare(
      `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(key, JSON.stringify(value), Date.now());
  }
  // ─── command history (net-new) ─────────────────────────────────────────────
  /** Record one submitted prompt. Empty text or missing agent id are ignored. */
  addHistory(entry) {
    if (!this.db) return;
    const text = (entry.text ?? "").trim();
    if (!text || !entry.agentId) return;
    this.db.prepare("INSERT INTO command_history (agent_id, cwd, text, ts) VALUES (?, ?, ?, ?)").run(entry.agentId, entry.cwd ?? null, text, Date.now());
  }
  /** Most-recent-first history, optionally scoped to one agent. */
  listHistory(agentId, limit = 100) {
    if (!this.db) return [];
    const lim = clampLimit(limit, 100);
    const rows = agentId ? this.db.prepare(
      "SELECT id, agent_id AS agentId, cwd, text, ts FROM command_history WHERE agent_id = ? ORDER BY ts DESC, id DESC LIMIT ?"
    ).all(agentId, lim) : this.db.prepare(
      "SELECT id, agent_id AS agentId, cwd, text, ts FROM command_history ORDER BY ts DESC, id DESC LIMIT ?"
    ).all(lim);
    return rows;
  }
  /** Substring search over prompt text, most-recent-first. */
  searchHistory(query, limit = 50) {
    if (!this.db) return [];
    const q = (query ?? "").trim();
    if (!q) return [];
    const lim = clampLimit(limit, 50);
    const needle = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    return this.db.prepare(
      "SELECT id, agent_id AS agentId, cwd, text, ts FROM command_history WHERE text LIKE ? ESCAPE '\\' ORDER BY ts DESC, id DESC LIMIT ?"
    ).all(needle, lim);
  }
};
function clampLimit(n, fallback) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.min(1e3, v);
}

// cth/main/github.ts
var import_node_child_process7 = require("node:child_process");
function listIssues(cwd) {
  return new Promise((resolve4) => {
    const proc = (0, import_node_child_process7.spawn)(
      "gh",
      ["issue", "list", "--json", "number,title,body,assignees,labels,url,state", "--limit", "30"],
      { cwd }
    );
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", (e) => resolve4({ ok: false, error: e.message }));
    proc.on("close", (code) => {
      if (code !== 0) {
        resolve4({ ok: false, error: stderr.trim() || `gh exited ${code}` });
        return;
      }
      try {
        const raw = JSON.parse(stdout);
        const issues = (Array.isArray(raw) ? raw : []).map((i) => ({
          number: i.number ?? 0,
          title: i.title ?? "",
          body: i.body ?? "",
          url: i.url ?? "",
          labels: (i.labels ?? []).map((l) => l.name ?? "").filter(Boolean),
          assignees: (i.assignees ?? []).map((a) => a.login ?? "").filter(Boolean)
        }));
        resolve4({ ok: true, issues });
      } catch (e) {
        resolve4({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    });
  });
}
function listCIRuns(cwd) {
  return new Promise((resolve4) => {
    const proc = (0, import_node_child_process7.spawn)(
      "gh",
      ["run", "list", "--limit", "5", "--json", "name,status,conclusion,url,databaseId"],
      { cwd }
    );
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", (e) => resolve4({ ok: false, error: e.message }));
    proc.on("close", (code) => {
      if (code !== 0) {
        resolve4({ ok: false, error: stderr.trim() || `gh exited ${code}` });
        return;
      }
      try {
        const raw = JSON.parse(stdout);
        const runs = (Array.isArray(raw) ? raw : []).map((r) => ({
          name: r.name ?? "",
          status: r.status ?? "",
          conclusion: r.conclusion ?? null,
          url: r.url ?? ""
        }));
        resolve4({ ok: true, runs });
      } catch (e) {
        resolve4({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    });
  });
}

// cth/main/slack.ts
var import_node_http = require("node:http");
var import_node_https2 = require("node:https");
var import_node_crypto2 = require("node:crypto");
var {
  shouldTrigger: _shouldTrigger,
  ActivatedThreads: _ActivatedThreads,
  SeenEvents: _SeenEvents,
  dedupKey: _dedupKey
} = require_slack_trigger();
var MAX_BODY_BYTES = 1024 * 1024;
var REPLAY_WINDOW_SECONDS = 60 * 5;
var TUNNEL_START_TIMEOUT_MS = 1e4;
var SlackWebhookServer = class {
  server = null;
  tunnelUrl = null;
  port;
  signingSecret;
  channelId;
  onMessage;
  /** Bot's own Slack user id — learned from `authorizations[].user_id` on the
   *  first event_callback. Used to detect <@BOTID> text mentions. */
  botUserId = null;
  /** Thread roots where the bot was @-mentioned; subsequent replies in these
   *  threads also trigger onMessage. Bounded FIFO to prevent unbounded growth. */
  activatedThreads = new _ActivatedThreads();
  /** Idempotency cache of recently-forwarded message identities (channel:ts).
   *  Stops a single message from firing onMessage — and thus the ack reply —
   *  twice when the app subscribes to both `app_mention` and `message.*` (Slack
   *  sends both for one @-mention), and absorbs Slack's retry of un-acked events. */
  seenEvents = new _SeenEvents();
  constructor(opts) {
    this.port = opts.port;
    this.signingSecret = opts.signingSecret;
    this.channelId = opts.channelId?.trim() || void 0;
    this.onMessage = opts.onMessage;
  }
  /**
   * Bind the local HTTP server, then open a public tunnel to it. The HTTP
   * handler (the security boundary) is live the instant `listen` resolves; the
   * tunnel is opened afterwards and is non-fatal — if it can't be established
   * (offline, loca.lt down, timed out) the server keeps running and we report
   * the tunnel error without a URL.
   */
  async start() {
    if (this.server) return { ok: false, error: "already running" };
    if (!this.signingSecret) return { ok: false, error: "missing signing secret" };
    try {
      await this.listen();
    } catch (e) {
      this.stop();
      return { ok: false, error: `failed to bind port ${this.port}: ${errMsg(e)}` };
    }
    try {
      const url = await this.openTunnel();
      if (!url) throw new Error("tunnelmole returned empty URL");
      this.tunnelUrl = url;
      return { ok: true, url };
    } catch (e) {
      return { ok: false, error: `tunnel unavailable: ${errMsg(e)}` };
    }
  }
  /** Close the HTTP server. Idempotent and best-effort.
   *  Note: tunnelmole has no documented close handle; teardown is best-effort. */
  stop() {
    this.tunnelUrl = null;
    try {
      this.server?.close();
    } catch {
    }
    this.server = null;
  }
  listen() {
    return new Promise((resolve4, reject) => {
      const server = (0, import_node_http.createServer)((req, res) => this.handleRequest(req, res));
      const onError = (e) => reject(e);
      server.once("error", onError);
      server.listen(this.port, () => {
        server.off("error", onError);
        this.server = server;
        resolve4();
      });
    });
  }
  async openTunnel() {
    const { tunnelmole } = await import("tunnelmole");
    return new Promise((resolve4, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out")), TUNNEL_START_TIMEOUT_MS);
      tunnelmole({ port: this.port }).then((url) => {
        clearTimeout(timer);
        resolve4(url);
      }).catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
  }
  /** Buffer the raw body (needed verbatim for the HMAC) under a size cap, then
   *  verify + dispatch. Only POST is accepted. */
  handleRequest(req, res) {
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return;
    }
    const chunks = [];
    let size = 0;
    let aborted = false;
    req.on("data", (c) => {
      if (aborted) return;
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        aborted = true;
        res.writeHead(413);
        res.end();
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (aborted) return;
      this.handleBody(req, res, Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", () => {
      if (aborted) return;
      try {
        res.writeHead(400);
        res.end();
      } catch {
      }
    });
  }
  handleBody(req, res, rawBody) {
    if (!this.verify(req, rawBody)) {
      res.writeHead(403);
      res.end();
      return;
    }
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    if (payload.type === "url_verification" && typeof payload.challenge === "string") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ challenge: payload.challenge }));
      return;
    }
    if (payload.type === "event_callback" && payload.event) {
      const authUserId = payload.authorizations?.[0]?.user_id;
      if (authUserId && !this.botUserId) this.botUserId = authUserId;
      const ev = payload.event;
      const { trigger, text: rawText, files: rawFiles } = _shouldTrigger(
        ev,
        this.botUserId,
        this.channelId,
        this.activatedThreads
      );
      if (trigger) {
        const text = stripLeadingMention(rawText);
        const channel = typeof ev.channel === "string" ? ev.channel : "";
        const ts = typeof ev.ts === "string" ? ev.ts : "";
        const thread_ts = typeof ev.thread_ts === "string" && ev.thread_ts || ts;
        if ((text || rawFiles.length > 0) && channel && ts) {
          const dupKey = _dedupKey(ev);
          const isDuplicate = dupKey ? this.seenEvents.seen(dupKey) : false;
          if (!isDuplicate) {
            const msg = { text, channel, ts, thread_ts };
            if (rawFiles.length > 0) msg._rawFiles = rawFiles;
            try {
              void this.onMessage(msg);
            } catch {
            }
          }
        }
      }
    }
    res.writeHead(200);
    res.end();
  }
  /**
   * Verify a request is genuinely from Slack: HMAC-SHA256 of `v0:<ts>:<rawBody>`
   * with the signing secret must equal the `X-Slack-Signature` header (compared
   * in constant time), AND the timestamp must be within the replay window.
   */
  verify(req, rawBody) {
    const sig = req.headers["x-slack-signature"];
    const ts = req.headers["x-slack-request-timestamp"];
    if (typeof sig !== "string" || typeof ts !== "string") return false;
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum)) return false;
    if (Math.abs(Date.now() / 1e3 - tsNum) > REPLAY_WINDOW_SECONDS) return false;
    const expected = "v0=" + (0, import_node_crypto2.createHmac)("sha256", this.signingSecret).update(`v0:${ts}:${rawBody}`).digest("hex");
    const provided = Buffer.from(sig);
    const computed = Buffer.from(expected);
    if (provided.length !== computed.length) return false;
    return (0, import_node_crypto2.timingSafeEqual)(provided, computed);
  }
};
function stripLeadingMention(text) {
  return text.replace(/^\s*<@[A-Z0-9]+>\s*/i, "").trim();
}
function errMsg(e) {
  return e instanceof Error ? e.message : String(e);
}
function postSlackReply(opts) {
  return new Promise((resolve4) => {
    if (!opts.botToken) {
      resolve4({ ok: false, error: "missing bot token" });
      return;
    }
    if (!opts.channel?.trim() || !opts.thread_ts?.trim()) {
      resolve4({ ok: false, error: "missing explicit channel or thread_ts" });
      return;
    }
    const body = JSON.stringify({ channel: opts.channel, thread_ts: opts.thread_ts, text: opts.text });
    const req = (0, import_node_https2.request)({
      method: "POST",
      hostname: "slack.com",
      path: "/api/chat.postMessage",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-length": Buffer.byteLength(body),
        authorization: `Bearer ${opts.botToken}`
      }
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          const json2 = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          resolve4({ ok: json2.ok === true, error: json2.error });
        } catch {
          resolve4({ ok: false, error: "bad response from Slack" });
        }
      });
    });
    req.on("error", (e) => resolve4({ ok: false, error: errMsg(e) }));
    req.write(body);
    req.end();
  });
}
var SlackReplyServer = class {
  server = null;
  token;
  getBotToken;
  onReplied;
  constructor(opts) {
    this.token = opts.token;
    this.getBotToken = opts.getBotToken;
    this.onReplied = opts.onReplied;
  }
  /** Bind a loopback port (0 ⇒ OS-assigned). Resolves the actual bound port. */
  start(preferredPort = 0) {
    return new Promise((resolve4) => {
      if (this.server) {
        resolve4({ ok: false, error: "already running" });
        return;
      }
      const server = (0, import_node_http.createServer)((req, res) => this.handle(req, res));
      const onError = (e) => {
        server.off("listening", onListening);
        resolve4({ ok: false, error: errMsg(e) });
      };
      const onListening = () => {
        server.off("error", onError);
        this.server = server;
        const addr = server.address();
        resolve4({ ok: true, port: addr && typeof addr === "object" ? addr.port : preferredPort });
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(preferredPort, "127.0.0.1");
    });
  }
  /** Close the endpoint. Idempotent and best-effort. */
  stop() {
    try {
      this.server?.close();
    } catch {
    }
    this.server = null;
  }
  handle(req, res) {
    if (!isLoopback(req.socket.remoteAddress ?? "")) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (req.method !== "POST" || (req.url ?? "").split("?")[0] !== "/reply") {
      res.writeHead(404);
      res.end();
      return;
    }
    if (!this.checkToken(req.headers["x-md-reply-token"])) {
      res.writeHead(401);
      res.end();
      return;
    }
    const chunks = [];
    let size = 0;
    let aborted = false;
    req.on("data", (c) => {
      if (aborted) return;
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        aborted = true;
        res.writeHead(413);
        res.end();
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (aborted) return;
      let parsed;
      try {
        parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: "bad json" }));
        return;
      }
      const botToken = this.getBotToken();
      if (!botToken) {
        res.writeHead(503);
        res.end(JSON.stringify({ ok: false, error: "no bot token" }));
        return;
      }
      if (!parsed.channel || !parsed.thread_ts || !parsed.text) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: "channel, thread, text required" }));
        return;
      }
      const thread_ts = parsed.thread_ts;
      postSlackReply({ botToken, channel: parsed.channel, thread_ts, text: parsed.text }).then((r) => {
        if (r.ok) {
          try {
            this.onReplied?.(thread_ts);
          } catch {
          }
        }
        res.writeHead(r.ok ? 200 : 502, { "content-type": "application/json" });
        res.end(JSON.stringify(r));
      }).catch((e) => {
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: errMsg(e) }));
      });
    });
    req.on("error", () => {
      if (!aborted) {
        try {
          res.writeHead(400);
          res.end();
        } catch {
        }
      }
    });
  }
  /** Constant-time match of the request's reply token against the session token. */
  checkToken(provided) {
    if (typeof provided !== "string") return false;
    const a = Buffer.from(provided);
    const b = Buffer.from(this.token);
    if (a.length !== b.length) return false;
    return (0, import_node_crypto2.timingSafeEqual)(a, b);
  }
};
function isLoopback(addr) {
  const a = addr.replace(/^::ffff:/, "");
  return a === "::1" || a.startsWith("127.");
}

// cth/main/webhook.ts
var import_node_http2 = require("node:http");
var import_node_crypto3 = require("node:crypto");
var MAX_BODY_BYTES2 = 1024 * 1024;
var TUNNEL_START_TIMEOUT_MS2 = 1e4;
var RATE_LIMIT = 120;
var PER_ENDPOINT_RATE_LIMIT = 60;
var RATE_WINDOW_MS = 6e4;
var LEGACY_ENDPOINT_ID = "legacy";
var UNKNOWN_BUCKET = ":unknown";
var WebhookServer = class {
  server = null;
  tunnelUrl = null;
  port;
  endpoints = /* @__PURE__ */ new Map();
  onMessage;
  lookupStatus;
  /** Compared against when the requested id doesn't exist, purely so the failure
   *  path does the same work as a wrong-secret failure. Random per process and
   *  never exported, so it cannot be matched even by accident. */
  decoySecret = (0, import_node_crypto3.randomBytes)(32).toString("hex");
  // Fixed-window rate limiters keyed by bucket ('' = global, else the endpoint id).
  // The remote IP is the tunnel's, so per-IP would be meaningless behind tunnelmole.
  windows = /* @__PURE__ */ new Map();
  constructor(opts) {
    this.port = opts.port;
    this.onMessage = opts.onMessage;
    this.lookupStatus = opts.lookupStatus;
    this.setEndpoints(opts.endpoints);
  }
  /**
   * Swap the served endpoint list WITHOUT restarting the server or the tunnel —
   * the operator adds, edits and revokes webhooks from the UI, and a restart would
   * mint a fresh (ephemeral) tunnel URL, silently breaking every caller of every
   * OTHER endpoint. The map is rebuilt wholesale so a removed id stops resolving
   * on the very next request.
   */
  setEndpoints(list) {
    const next = /* @__PURE__ */ new Map();
    for (const e of list) {
      if (!e || typeof e.id !== "string" || !e.id || typeof e.secret !== "string" || !e.secret) continue;
      next.set(e.id, e);
    }
    this.endpoints = next;
    for (const key of [...this.windows.keys()]) {
      if (key === "" || key === UNKNOWN_BUCKET) continue;
      if (!next.has(key)) this.windows.delete(key);
    }
  }
  /** Ids currently served, for the settings surface that shows per-endpoint URLs. */
  endpointIds() {
    return [...this.endpoints.keys()];
  }
  /** The public tunnel URL, or null when no tunnel is up. */
  publicUrl() {
    return this.tunnelUrl;
  }
  /** Is the local HTTP server bound? `start()` reports ok:false for a tunnel
   *  failure too, and in THAT case the security boundary is still live — the
   *  caller must keep the instance (or the listener leaks, unstoppable). */
  listening() {
    return this.server != null;
  }
  /**
   * Bind the local HTTP server, then open a public tunnel to it. The HTTP handler
   * (the security boundary) is live the instant `listen` resolves; the tunnel is
   * opened afterwards and is non-fatal — if it can't be established the server
   * keeps running and we report the tunnel error without a URL.
   */
  async start() {
    if (this.server) return { ok: false, error: "already running" };
    if (this.endpoints.size === 0) return { ok: false, error: "no enabled webhook endpoints" };
    try {
      await this.listen();
    } catch (e) {
      this.stop();
      return { ok: false, error: `failed to bind port ${this.port}: ${errMsg2(e)}` };
    }
    try {
      const url = await this.openTunnel();
      if (!url) throw new Error("tunnelmole returned empty URL");
      this.tunnelUrl = url;
      return { ok: true, url };
    } catch (e) {
      return { ok: false, error: `tunnel unavailable: ${errMsg2(e)}` };
    }
  }
  /** Close the HTTP server. Idempotent and best-effort.
   *  Note: tunnelmole has no documented close handle; teardown is best-effort. */
  stop() {
    this.tunnelUrl = null;
    try {
      this.server?.close();
    } catch {
    }
    this.server = null;
  }
  listen() {
    return new Promise((resolve4, reject) => {
      const server = (0, import_node_http2.createServer)((req, res) => this.handleRequest(req, res));
      const onError = (e) => reject(e);
      server.once("error", onError);
      server.listen(this.port, () => {
        server.off("error", onError);
        this.server = server;
        resolve4();
      });
    });
  }
  async openTunnel() {
    const { tunnelmole } = await import("tunnelmole");
    return new Promise((resolve4, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out")), TUNNEL_START_TIMEOUT_MS2);
      tunnelmole({ port: this.port }).then((url) => {
        clearTimeout(timer);
        resolve4(url);
      }).catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
  }
  /** Fixed-window limiter — bounds total work before any parse/crypto runs. */
  allowRequest(bucket, limit) {
    const now = Date.now();
    const w = this.windows.get(bucket);
    if (!w || now - w.start > RATE_WINDOW_MS) {
      this.windows.set(bucket, { start: now, count: 1 });
      return true;
    }
    w.count += 1;
    return w.count <= limit;
  }
  handleRequest(req, res) {
    if (!this.allowRequest("", RATE_LIMIT)) {
      json(res, 429, { ok: false, error: "rate limited" });
      return;
    }
    const id = readEndpointId(req);
    const endpoint = id !== null ? this.endpoints.get(id) ?? null : null;
    if (!this.allowRequest(endpoint ? endpoint.id : UNKNOWN_BUCKET, PER_ENDPOINT_RATE_LIMIT)) {
      json(res, 429, { ok: false, error: "rate limited" });
      return;
    }
    const method = req.method ?? "";
    if (method === "GET") {
      this.handleStatus(req, res, endpoint);
      return;
    }
    if (method === "POST") {
      this.handleCreate(req, res, endpoint);
      return;
    }
    res.writeHead(405);
    res.end();
  }
  /**
   * GET — return the status of the token's task (token only; never a listing).
   *
   * The lookup runs even when the id is unknown, and the answer is then the same
   * 404 the unknown-token case gives. Skipping the lookup would make "no such
   * webhook" measurably cheaper than "no such token", which is exactly the signal
   * an id-enumeration probe is looking for.
   */
  handleStatus(req, res, endpoint) {
    const token = readToken(req);
    if (!token) {
      json(res, 401, { ok: false, error: "token required" });
      return;
    }
    let status = null;
    try {
      status = this.lookupStatus(token);
    } catch {
      json(res, 500, { ok: false, error: "lookup failed" });
      return;
    }
    if (!status || !endpoint) {
      json(res, 404, { ok: false, error: "not found" });
      return;
    }
    json(res, 200, { ok: true, status: status.status, title: status.title, result: status.result ?? null });
  }
  /** POST — verify this endpoint's secret, then buffer + validate + dispatch. */
  handleCreate(req, res, endpoint) {
    if (!this.verifySecret(req, endpoint) || !endpoint) {
      json(res, 401, { ok: false, error: "unauthorized" });
      return;
    }
    const chunks = [];
    let size = 0;
    let aborted = false;
    req.on("data", (c) => {
      if (aborted) return;
      size += c.length;
      if (size > MAX_BODY_BYTES2) {
        aborted = true;
        json(res, 413, { ok: false, error: "too large" });
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (aborted) return;
      let parsed;
      try {
        parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        json(res, 400, { ok: false, error: "bad json" });
        return;
      }
      const check = validateAgainstSchema(parsed, parseSchema(endpoint.schema));
      if (!check.ok) {
        json(res, 400, { ok: false, error: check.error });
        return;
      }
      const body = parsed ?? {};
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!message) {
        json(res, 400, { ok: false, error: "message required" });
        return;
      }
      const inbound = { message };
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (title) inbound.title = title;
      if (body.kind === "directive" || body.kind === "communication") inbound.kind = body.kind;
      const from = typeof body.from === "string" ? body.from.trim() : "";
      if (from) inbound.from = from;
      let out = null;
      try {
        out = this.onMessage(inbound, { id: endpoint.id, name: endpoint.name });
      } catch {
        json(res, 500, { ok: false, error: "could not create task" });
        return;
      }
      if (!out) {
        json(res, 500, { ok: false, error: "could not create task" });
        return;
      }
      if (out.pending) {
        json(res, 202, {
          ok: true,
          pending: true,
          status: "awaiting-approval",
          token: out.token,
          detail: "accepted \u2014 waiting for the operator to approve it before the hive sees it"
        });
        return;
      }
      json(res, 200, { ok: true, token: out.token, taskId: out.taskId });
    });
    req.on("error", () => {
      if (!aborted) {
        try {
          res.writeHead(400);
          res.end();
        } catch {
        }
      }
    });
  }
  /**
   * Constant-time check that `x-md-webhook-secret` equals THIS endpoint's secret.
   * A length mismatch is itself a failure and short-circuits before the compare
   * (timingSafeEqual throws on unequal lengths).
   *
   * A null endpoint (unknown id) still runs the comparison, against a decoy no
   * caller can hold, and then fails unconditionally — so "no such webhook" costs
   * the same as "wrong secret" and answers with the same 401.
   */
  verifySecret(req, endpoint) {
    const provided = req.headers["x-md-webhook-secret"];
    if (typeof provided !== "string") return false;
    const a = Buffer.from(provided);
    const b = Buffer.from(endpoint ? endpoint.secret : this.decoySecret);
    if (a.length !== b.length) return false;
    const equal = (0, import_node_crypto3.timingSafeEqual)(a, b);
    return endpoint ? equal : false;
  }
};
function readEndpointId(req) {
  let pathname;
  try {
    pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  } catch {
    return null;
  }
  const segments = pathname.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) return LEGACY_ENDPOINT_ID;
  if (segments.length > 1) return null;
  try {
    return decodeURIComponent(segments[0]);
  } catch {
    return segments[0];
  }
}
function parseSchema(schema) {
  if (typeof schema !== "string" || !schema.trim()) return void 0;
  try {
    return JSON.parse(schema);
  } catch {
    return void 0;
  }
}
function readToken(req) {
  const h = req.headers["x-md-webhook-token"];
  if (typeof h === "string" && h.trim()) return h.trim();
  try {
    const url = new URL(req.url ?? "", "http://localhost");
    const q = url.searchParams.get("token");
    if (q && q.trim()) return q.trim();
  } catch {
  }
  return "";
}
function json(res, status, body) {
  try {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  } catch {
  }
}
function errMsg2(e) {
  return e instanceof Error ? e.message : String(e);
}

// cth/main/triggerHistory.ts
var import_electron6 = require("electron");
var import_node_fs12 = require("node:fs");
var import_node_path12 = require("node:path");
var import_node_crypto4 = require("node:crypto");
function historyPath() {
  return (0, import_node_path12.join)(import_electron6.app.getPath("userData"), "trigger-history.json");
}
function readAll() {
  const p = historyPath();
  if (!(0, import_node_fs12.existsSync)(p)) return [];
  try {
    const parsed = JSON.parse((0, import_node_fs12.readFileSync)(p, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry);
  } catch {
    return [];
  }
}
function writeAll(entries) {
  try {
    const p = historyPath();
    (0, import_node_fs12.mkdirSync)((0, import_node_path12.dirname)(p), { recursive: true });
    (0, import_node_fs12.writeFileSync)(p, JSON.stringify(entries, null, 2), "utf8");
  } catch {
  }
}
function isEntry(v) {
  if (!v || typeof v !== "object") return false;
  const e = v;
  return typeof e.id === "string" && (e.source === "webhook" || e.source === "org") && (e.direction === "inbound" || e.direction === "outbound") && typeof e.body === "string" && typeof e.at === "number";
}
function normaliseKind(kind) {
  return kind === "communication" ? "communication" : "directive";
}
function appendTriggerHistory(input) {
  const entry = {
    id: input.id ?? (0, import_node_crypto4.randomBytes)(8).toString("hex"),
    source: input.source,
    sourceId: input.sourceId,
    sourceName: input.sourceName,
    direction: input.direction,
    peer: input.peer,
    title: input.title,
    body: input.body,
    kind: normaliseKind(input.kind),
    decision: input.decision,
    correlationId: input.correlationId,
    taskId: input.taskId,
    at: input.at ?? Date.now()
  };
  writeAll([entry, ...readAll()].slice(0, TRIGGER_HISTORY_LIMIT));
  return entry;
}
function listTriggerHistory() {
  return readAll();
}
function updateTriggerHistory(id, patch) {
  const all = readAll();
  const i = all.findIndex((e) => e.id === id);
  if (i < 0) return null;
  const next = { ...all[i] };
  if (patch.decision !== void 0) next.decision = patch.decision;
  if (patch.taskId !== void 0) next.taskId = patch.taskId;
  if (patch.correlationId !== void 0) next.correlationId = patch.correlationId;
  if (patch.title !== void 0) next.title = patch.title;
  all[i] = next;
  writeAll(all);
  return next;
}
function clearTriggerHistory(source) {
  if (!source) {
    try {
      (0, import_node_fs12.rmSync)(historyPath(), { force: true });
    } catch {
    }
    return;
  }
  writeAll(readAll().filter((e) => e.source !== source));
}

// cth/main/freeflow.ts
var GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
var DEFAULT_GROQ_MODEL = "whisper-large-v3-turbo";
var MAX_AUDIO_BYTES = 25 * 1024 * 1024;
var REQUEST_TIMEOUT_MS = 6e4;
async function transcribeWithGroq(opts) {
  if (!opts.apiKey) return { ok: false, error: "missing Groq API key" };
  const bytes = toUint8Array(opts.audio);
  if (bytes.byteLength === 0) return { ok: false, error: "empty audio" };
  if (bytes.byteLength > MAX_AUDIO_BYTES) {
    return { ok: false, error: "audio too large (Groq free-tier cap is 25 MB)" };
  }
  const mimeType = opts.mimeType || "audio/webm";
  const filename = opts.filename || "dictation.webm";
  const model = opts.model || DEFAULT_GROQ_MODEL;
  const form = new FormData();
  form.append("model", model);
  form.append("response_format", "json");
  if (opts.language) form.append("language", opts.language);
  form.append("file", new Blob([toArrayBuffer(bytes)], { type: mimeType }), filename);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(GROQ_TRANSCRIBE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.apiKey}` },
      body: form,
      signal: controller.signal
    });
    const raw = await res.text();
    if (!res.ok) {
      return { ok: false, error: `Groq ${res.status}: ${extractError(raw) || res.statusText}` };
    }
    let text = "";
    try {
      const json2 = JSON.parse(raw);
      text = typeof json2.text === "string" ? json2.text.trim() : "";
    } catch {
      text = raw.trim();
    }
    if (!text) return { ok: false, error: "no speech detected" };
    return { ok: true, text };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return { ok: false, error: aborted ? "transcription timed out" : errMsg3(e) };
  } finally {
    clearTimeout(timer);
  }
}
function extractError(raw) {
  try {
    const j = JSON.parse(raw);
    if (typeof j.error === "string") return j.error;
    if (j.error && typeof j.error.message === "string") return j.error.message;
  } catch {
  }
  return "";
}
function toUint8Array(audio) {
  if (audio instanceof Uint8Array) return audio;
  return new Uint8Array(audio);
}
function toArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
function errMsg3(e) {
  return e instanceof Error ? e.message : String(e);
}

// cth/main/realtime.ts
var import_electron8 = require("electron");

// cth/main/integrations.ts
var import_electron7 = require("electron");
var import_node_fs13 = require("node:fs");
var import_node_path13 = require("node:path");

// cth/shared/integrations.ts
var INTEGRATION_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
var HEADER_NAME_RE = /^[A-Za-z0-9-]{1,64}$/;
var ALL_AUTH_TYPES = ["none", "bearer", "header", "github"];
var ALL_KINDS = ["github", "custom-rest"];
function secretRefFor(id) {
  return `int:${id}`;
}
function authTypeNeedsSecret(t) {
  return t !== "none";
}
function validateIntegrationRecord(rec) {
  if (!rec || typeof rec !== "object") return { ok: false, error: "record must be an object" };
  const r = rec;
  const id = typeof r.id === "string" ? r.id.trim() : "";
  if (!INTEGRATION_SLUG_RE.test(id)) {
    return { ok: false, error: "id must be a lowercase slug (2\u201340 chars, a\u2013z 0\u20139 -, no leading/trailing hyphen)" };
  }
  const label = typeof r.label === "string" ? r.label.trim() : "";
  if (!label || label.length > 60) return { ok: false, error: "label is required and must be <= 60 chars" };
  const kind = r.kind;
  if (!ALL_KINDS.includes(kind)) return { ok: false, error: `kind must be one of ${ALL_KINDS.join(", ")}` };
  const authType = r.authType;
  if (!ALL_AUTH_TYPES.includes(authType)) {
    return { ok: false, error: `authType must be one of ${ALL_AUTH_TYPES.join(", ")}` };
  }
  const baseUrl = typeof r.baseUrl === "string" ? r.baseUrl.trim() : "";
  const urlCheck = validateBaseUrl(baseUrl);
  if (!urlCheck.ok) return { ok: false, error: urlCheck.error };
  let authHeader;
  if (authType === "header") {
    authHeader = typeof r.authHeader === "string" ? r.authHeader.trim() : "";
    if (!authHeader || !HEADER_NAME_RE.test(authHeader)) {
      return { ok: false, error: "authType 'header' requires authHeader matching [A-Za-z0-9-]{1,64}" };
    }
  } else if (r.authHeader != null && String(r.authHeader).trim() !== "") {
    return { ok: false, error: "authHeader is only valid when authType === 'header'" };
  }
  const needsSecret = authTypeNeedsSecret(authType);
  const secretRef = needsSecret ? secretRefFor(id) : void 0;
  const enabled = r.enabled === true;
  return { ok: true, value: { id, label, kind, baseUrl, authType, authHeader, secretRef, enabled } };
}
function validateBaseUrl(baseUrl) {
  if (!baseUrl) return { ok: false, error: "baseUrl is required" };
  let u;
  try {
    u = new URL(baseUrl);
  } catch {
    return { ok: false, error: "baseUrl must be a valid URL" };
  }
  if (u.username || u.password) return { ok: false, error: "baseUrl must not contain userinfo" };
  if (u.search || u.hash) return { ok: false, error: "baseUrl must not contain a query or fragment" };
  if (baseUrl.includes("..")) return { ok: false, error: 'baseUrl must not contain ".."' };
  const isLoopbackHost = u.hostname === "127.0.0.1" || u.hostname === "::1" || u.hostname === "[::1]" || u.hostname === "localhost";
  if (u.protocol === "https:") return { ok: true, url: u };
  if (u.protocol === "http:" && isLoopbackHost) return { ok: true, url: u };
  return { ok: false, error: "baseUrl must be https (http allowed only for 127.0.0.1/localhost)" };
}
function buildAuthHeaders(authType, authHeader, secret) {
  switch (authType) {
    case "none":
      return {};
    case "bearer":
      return secret ? { authorization: `Bearer ${secret}` } : {};
    case "header":
      return secret && authHeader ? { [authHeader.toLowerCase()]: secret } : {};
    case "github":
      return {
        ...secret ? { authorization: `Bearer ${secret}` } : {},
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28"
      };
    default:
      return {};
  }
}
function resolveUpstreamUrl(baseUrl, pathAndQuery) {
  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    return null;
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(pathAndQuery)) return null;
  if (pathAndQuery.startsWith("//")) return null;
  const pathOnly = pathAndQuery.split(/[?#]/)[0];
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathOnly);
  } catch {
    return null;
  }
  if (decodedPath.split("/").some((seg) => seg === "..")) return null;
  const basePath = base.pathname.endsWith("/") ? base.pathname : base.pathname + "/";
  const rel = pathAndQuery.replace(/^\/+/, "");
  let resolved;
  try {
    resolved = new URL(basePath + rel, base.origin);
  } catch {
    return null;
  }
  if (resolved.origin !== base.origin) return null;
  const confinePrefix = base.pathname.endsWith("/") ? base.pathname : base.pathname + "/";
  if (confinePrefix !== "/" && !(resolved.pathname + "/").startsWith(confinePrefix) && resolved.pathname !== base.pathname) {
    return null;
  }
  return resolved;
}
var INTEGRATION_TEMPLATES = [
  {
    kind: "github",
    label: "GitHub",
    baseUrl: "https://api.github.com",
    authType: "github",
    secretLabel: "GitHub personal access token",
    secretHelp: "Create a fine-grained or classic PAT at github.com/settings/tokens with the scopes your workers need.",
    docsUrl: "https://docs.github.com/rest",
    idSuggestion: "github"
  },
  {
    kind: "custom-rest",
    label: "Custom REST API",
    baseUrl: "",
    authType: "bearer",
    secretLabel: "API key / token",
    secretHelp: "Point baseUrl at any REST API. Choose how its credential is sent: Bearer token, a custom header, or none.",
    idSuggestion: "my-api"
  },
  // ─── First-wave YC tools (Dwight, P2) ───────────────────────────────────────
  // Per-tool auth model + high-value endpoint catalog: hive/docs/integration-templates.md.
  // Gmail / Google Calendar / Salesforce are intentionally NOT registered yet: they
  // authenticate via OAuth, and IntegrationAuthType has no `oauth2` (OAuth refresh is a
  // v1 non-goal — spec §8). They are documented under "Pending: OAuth broker".
  {
    kind: "custom-rest",
    label: "Linear",
    baseUrl: "https://api.linear.app/graphql",
    authType: "header",
    authHeader: "Authorization",
    secretLabel: "Linear API key",
    secretHelp: 'Linear \u2192 Settings \u2192 Security & access \u2192 Personal API keys. Sent verbatim in Authorization (no "Bearer"). Every call POSTs to /graphql.',
    docsUrl: "https://developers.linear.app/docs/graphql/working-with-the-graphql-api",
    idSuggestion: "linear"
  },
  {
    kind: "custom-rest",
    label: "Jira",
    baseUrl: "https://your-domain.atlassian.net/rest/api/3",
    authType: "header",
    authHeader: "Authorization",
    secretLabel: "Authorization header (Basic \u2026)",
    secretHelp: 'Basic auth: paste "Basic " + base64("<email>:<api-token>"). Token at id.atlassian.com \u2192 Security \u2192 API tokens. Replace your-domain with your Atlassian site.',
    docsUrl: "https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/",
    idSuggestion: "jira"
  },
  {
    kind: "custom-rest",
    label: "Notion",
    baseUrl: "https://api.notion.com/v1",
    authType: "bearer",
    secretLabel: "Notion internal integration token",
    secretHelp: 'notion.so/my-integrations \u2192 Internal Integration Secret; share target pages/DBs with it. Every request also needs header "Notion-Version: 2022-06-28" (worker sends it per request).',
    docsUrl: "https://developers.notion.com/reference/intro",
    idSuggestion: "notion"
  },
  {
    kind: "custom-rest",
    label: "Stripe",
    baseUrl: "https://api.stripe.com/v1",
    authType: "bearer",
    secretLabel: "Stripe secret key",
    secretHelp: "dashboard.stripe.com \u2192 Developers \u2192 API keys \u2192 Secret key (sk_live_/sk_test_). Restricted keys recommended. Bodies are form-encoded, not JSON.",
    docsUrl: "https://stripe.com/docs/api",
    idSuggestion: "stripe"
  },
  {
    kind: "custom-rest",
    label: "Confluence",
    baseUrl: "https://your-domain.atlassian.net/wiki/api/v2",
    authType: "header",
    authHeader: "Authorization",
    secretLabel: "Authorization header (Basic \u2026)",
    secretHelp: 'Basic auth: paste "Basic " + base64("<email>:<api-token>") (same Atlassian token as Jira). Replace your-domain with your site.',
    docsUrl: "https://developer.atlassian.com/cloud/confluence/rest/v2/intro/",
    idSuggestion: "confluence"
  },
  {
    kind: "custom-rest",
    label: "Sentry",
    baseUrl: "https://sentry.io/api/0",
    authType: "bearer",
    secretLabel: "Sentry auth token",
    secretHelp: "sentry.io \u2192 Settings \u2192 Auth Tokens. Org-scoped routes carry your org slug in the path, e.g. /organizations/<org>/issues/.",
    docsUrl: "https://docs.sentry.io/api/",
    idSuggestion: "sentry"
  },
  {
    kind: "custom-rest",
    label: "HubSpot",
    baseUrl: "https://api.hubapi.com",
    authType: "bearer",
    secretLabel: "HubSpot private app token",
    secretHelp: "HubSpot \u2192 Settings \u2192 Integrations \u2192 Private Apps \u2192 create app \u2192 Access token (scopes crm.objects.*).",
    docsUrl: "https://developers.hubspot.com/docs/api/crm/understanding-the-crm",
    idSuggestion: "hubspot"
  }
];

// cth/main/integrations.ts
function listRecords() {
  return readConfig().integrations ?? [];
}
function getRecord(id) {
  return listRecords().find((r) => r.id === id);
}
function enabledIds() {
  return listRecords().filter((r) => r.enabled && (!authTypeNeedsSecret(r.authType) || hasSecret(r.secretRef))).map((r) => r.id);
}
function upsertRecord(input) {
  const v = validateIntegrationRecord(input);
  if (!v.ok) return v;
  const now = Date.now();
  const existing = getRecord(v.value.id);
  const record = {
    ...v.value,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  const next = listRecords().filter((r) => r.id !== record.id);
  next.push(record);
  writeConfig({ integrations: next });
  return { ok: true, record };
}
function removeRecord(id) {
  const next = listRecords().filter((r) => r.id !== id);
  writeConfig({ integrations: next });
  deleteSecret(secretRefFor(id));
  return { ok: true };
}
function listRecordsRedacted() {
  return listRecords().map(({ secretRef, ...rest }) => ({ ...rest, hasSecret: !!secretRef && hasSecret(secretRef) }));
}
function secretsPath() {
  return (0, import_node_path13.join)(import_electron7.app.getPath("userData"), "integration-secrets.json");
}
function readSecretBlob() {
  const p = secretsPath();
  if (!(0, import_node_fs13.existsSync)(p)) return {};
  try {
    const parsed = JSON.parse((0, import_node_fs13.readFileSync)(p, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function writeSecretBlob(blob) {
  const p = secretsPath();
  (0, import_node_fs13.mkdirSync)((0, import_node_path13.dirname)(p), { recursive: true });
  (0, import_node_fs13.writeFileSync)(p, JSON.stringify(blob, null, 2), { encoding: "utf8", mode: 384 });
}
function setSecret(secretRef, plaintext) {
  if (!secretRef) return { ok: false, error: "secretRef required" };
  if (typeof plaintext !== "string" || plaintext === "") return { ok: false, error: "secret required" };
  try {
    if (!import_electron7.safeStorage.isEncryptionAvailable()) {
      return { ok: false, error: "OS secret encryption is unavailable; refusing to store a secret in plaintext" };
    }
    const cipher = import_electron7.safeStorage.encryptString(plaintext).toString("base64");
    const blob = readSecretBlob();
    blob[secretRef] = cipher;
    writeSecretBlob(blob);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
function getSecret(secretRef) {
  if (!secretRef) return void 0;
  const cipher = readSecretBlob()[secretRef];
  if (!cipher) return void 0;
  try {
    if (!import_electron7.safeStorage.isEncryptionAvailable()) return void 0;
    return import_electron7.safeStorage.decryptString(Buffer.from(cipher, "base64"));
  } catch {
    return void 0;
  }
}
function hasSecret(secretRef) {
  if (!secretRef) return false;
  return !!readSecretBlob()[secretRef];
}
function deleteSecret(secretRef) {
  if (!secretRef) return;
  const blob = readSecretBlob();
  if (secretRef in blob) {
    delete blob[secretRef];
    if (Object.keys(blob).length === 0) {
      try {
        (0, import_node_fs13.rmSync)(secretsPath(), { force: true });
      } catch {
      }
    } else {
      writeSecretBlob(blob);
    }
  }
}

// cth/shared/realtimePricing.ts
var REALTIME_MODEL = "gpt-realtime-2.1";

// cth/main/realtime.ts
var OPENAI_KEY_REF = "apikey:openai";
var CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";
var LEGACY_SESSIONS_URL = "https://api.openai.com/v1/realtime/sessions";
var MINT_TIMEOUT_MS = 15e3;
function hasOpenAiKey() {
  return hasSecret(OPENAI_KEY_REF);
}
async function mintRealtimeToken(model = REALTIME_MODEL) {
  const key = getSecret(OPENAI_KEY_REF);
  if (!key) {
    return { ok: false, error: "no OpenAI API key set \u2014 add one in Settings \u2192 Voice", code: "no_key" };
  }
  const post = async (url, body) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), MINT_TIMEOUT_MS);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ac.signal
      });
      const text = await r.text();
      let json2;
      try {
        json2 = text ? JSON.parse(text) : void 0;
      } catch {
      }
      return { status: r.status, ok: r.ok, json: json2, text };
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    let res = await post(CLIENT_SECRETS_URL, { session: { type: "realtime", model } });
    if (res.status === 404) res = await post(LEGACY_SESSIONS_URL, { model });
    if (!res.ok) {
      const errObj = res.json?.error;
      const msg = typeof errObj?.message === "string" && errObj.message || (res.text ? res.text.slice(0, 200) : `HTTP ${res.status}`);
      return { ok: false, error: `token mint failed (${res.status}): ${msg}`, code: "mint_failed" };
    }
    const clientSecret = res.json?.client_secret;
    const token = typeof res.json?.value === "string" && res.json.value || typeof clientSecret?.value === "string" && clientSecret.value || "";
    if (!token) return { ok: false, error: "mint returned no ephemeral token", code: "no_token" };
    const expRaw = res.json?.expires_at ?? clientSecret?.expires_at;
    const expiresAt = typeof expRaw === "number" ? expRaw : null;
    return { ok: true, token, expiresAt, sessionConfig: { model } };
  } catch (e) {
    const err = e instanceof Error ? e.name === "AbortError" ? "token mint timed out" : e.message : String(e);
    return { ok: false, error: err, code: "network" };
  }
}
function registerRealtimeIpc() {
  import_electron8.ipcMain.handle("realtime:hasKey", () => hasOpenAiKey());
  import_electron8.ipcMain.handle("realtime:mintToken", async (_evt, payload) => {
    const p = payload ?? {};
    const model = typeof p.model === "string" && p.model.trim() ? p.model.trim() : REALTIME_MODEL;
    return mintRealtimeToken(model);
  });
}

// cth/main/realtimeActions.ts
var import_electron9 = require("electron");

// cth/shared/providerAutomation.ts
var NO_CONTEXT_COMMANDS = {
  compact: null,
  clear: null,
  compactTakesFocus: false
};
var CONTEXT_COMMANDS = {
  // claudeCommands.ts:34,37 (this repo's own catalog): `/compact` takes a focus
  // ("usage: /compact keep the auth decisions"), `/clear` starts a fresh
  // conversation and reclaims the window.
  claude: { compact: "/compact", clear: "/clear", compactTakesFocus: true },
  // Codex 0.137.0 binary, TUI slash-command description table:
  //   "summarize conversation to prevent hitting the context limit"  → /compact
  //   "clear the terminal and start a new chat"                      → /clear
  // NOTE this contradicts codexCommands.ts, which lists /clear but NOT /compact.
  // The binary is right and that catalog is incomplete (see report).
  // compactTakesFocus stays FALSE: codex's own `Usage: /…` strings spell out an
  // argument for every command that takes one (/goal, /raw, /mcp, /keymap,
  // /ide, /sandbox-add-read-dir) and /compact has none.
  codex: { compact: "/compact", clear: "/clear", compactTakesFocus: false },
  // Grok binary ships its own docs inline (04-slash-commands.md):
  //   "/compact [context] — Compress conversation history… Optionally specify
  //    what to preserve", example `/compact keep the auth implementation details`
  //   "/new — Start a new session, clearing the current conversation.
  //    Aliases: /clear"
  // `/new` is the documented spelling (and what grokCommands.ts:13 already
  // records), so prefer it over the alias.
  grok: { compact: "/compact", clear: "/new", compactTakesFocus: true },
  // Moonshot kimi-cli slash-command reference: `/compact` accepts appended
  // custom instructions ("/compact preserve database-related discussions");
  // `/clear` (alias /reset) "Clear the current session's context and start a
  // new conversation". NB `/new` there forks a session rather than discarding.
  kimi: { compact: "/compact", clear: "/clear", compactTakesFocus: true },
  // antigravity.google/docs/cli/reference (Google's own command table):
  //   "/clear  (/new)  — Clear the terminal and reset active conversation
  //    contexts."     ← a REAL context reset, and
  //   "Ctrl+L  cli.clear_screen — Refreshes and clears the visual terminal
  //    buffer."       ← the screen-only one. The two are different things, so
  // the "agy /clear only clears the screen" worry does not hold.
  // That reference lists NO compaction verb at all (zero hits for compact /
  // compress / summarize), and the shipped `agy` binary has no such literal
  // either — agy compacts AUTOMATICALLY when the window fills ("# Resuming from
  // a compaction"). Nothing to type, so: null.
  antigravity: { compact: null, clear: "/clear", compactTakesFocus: false },
  // Google Gemini CLI's command reference documents `/compress` as replacing
  // the chat context with a summary and `/clear` as starting a clean context.
  // `/compress` has no focus-argument contract, so never append user prose.
  gemini: { compact: "/compress", clear: "/clear", compactTakesFocus: false },
  // qwen-code's bundled cli.js, verbatim:
  //   compressCommand = { name:"compress", altNames:["summarize"],
  //     description "Compresses the context by replacing it with a summary." }
  //   and its action reads `context.invocation?.args` as `customInstructions`
  //   (capped at 2000 chars) → it genuinely takes a focus.
  //   clearCommand    = { name:"clear", altNames:["reset","new"],
  //     description "Clear conversation history and free up context." }
  // It is `/compress`, NOT `/compact`: qwen dropped upstream gemini-cli's
  // `compact` altName, so `/compact` would land as plain text here.
  qwen: { compact: "/compress", clear: "/clear", compactTakesFocus: true },
  // opencode binary's command registry, verbatim:
  //   { title:"Compact session", value:"session.compact",
  //     slash:{ name:"compact", aliases:["summarize"] }, run: … }
  // and its own tip text "Run /compact to summarize long sessions near context
  // limits". That `run()` calls session.summarize({sessionID,model}) and never
  // looks at the invocation args → the focus would be silently dropped, so
  // compactTakesFocus is false.
  // `/clear` does NOT exist in the binary (zero literals); the fresh-session
  // verb is `/new` — matched exactly (`t.trim().toLowerCase()==="/new"`).
  opencode: { compact: "/compact", clear: "/new", compactTakesFocus: false },
  // Crush has NO typed slash commands at all. Its own binary strings show
  // "Summarize Session" / "New Session" as ctrl+p COMMAND-PALETTE rows, and the
  // hint "/ or ctrl+p" means a leading `/` OPENS that palette rather than
  // submitting a command. Typing "/compact" would filter a modal and leave it
  // open, swallowing everything queued behind it. Nothing safe to type: null.
  // (Crush's compact/clear are reachable only over its HTTP API.)
  crush: NO_CONTEXT_COMMANDS,
  // pi's dist/core/slash-commands.js, verbatim:
  //   { name:"compact", description:"Manually compact the session context" }
  //   { name:"new",     description:"Start a new session" }
  // and docs/compaction.md: "trigger manually with `/compact [instructions]`,
  // where optional instructions focus the summary". There is no `/clear`.
  pi: { compact: "/compact", clear: "/new", compactTakesFocus: true },
  // Copilot's INTERACTIVE mode does have `/compact [FOCUS-INSTRUCTIONS]` and
  // `/clear` — but this app never runs it interactively. The preset spawns it in
  // print mode (`initialPromptFlag: '-p'`, `canReceiveInbox: false`), which runs
  // one prompt and EXITS. There is no prompt left alive to type a slash command
  // into, so both are null by construction rather than by ignorance.
  copilot: NO_CONTEXT_COMMANDS,
  // Cursor Agent CLI (`agent`) is interactive in this preset, but its slash /
  // command surface is not yet verified against a frozen binary catalog in-repo.
  // Prefer null over guessing — wrong slashes into a live TUI are worse than no
  // auto-compact. Revisit when a shipped command table is transcribed.
  cursor: NO_CONTEXT_COMMANDS,
  // An arbitrary user binary. We cannot know its command surface, and guessing
  // means typing slashes into someone's unknown REPL.
  custom: NO_CONTEXT_COMMANDS
};
function contextCommandsForProvider(provider) {
  return CONTEXT_COMMANDS[provider] ?? NO_CONTEXT_COMMANDS;
}
var COMPACT_VERBS = new Set(
  Object.values(CONTEXT_COMMANDS).map((c) => c.compact).filter((c) => typeof c === "string" && c.length > 0)
);
function clearCommandForProvider(provider, message = "") {
  const override = message.trim();
  if (override) return override;
  return contextCommandsForProvider(provider).clear;
}

// cth/main/realtimeActions.ts
var VOICE_ACTOR = "michael-voice";
var VERBS = {
  ping: { tier: "soft", confirmWord: "ping", agentTargeted: true },
  create_task: { tier: "soft", confirmWord: "create", agentTargeted: false },
  assign_task: { tier: "soft", confirmWord: "assign", agentTargeted: false },
  update_task: { tier: "soft", confirmWord: "update", agentTargeted: false },
  dispatch: { tier: "soft", confirmWord: "dispatch", agentTargeted: true },
  steer: { tier: "soft", confirmWord: "steer", agentTargeted: true },
  spawn: { tier: "destructive", confirmWord: "spawn", agentTargeted: false },
  kill: { tier: "destructive", confirmWord: "kill", agentTargeted: true },
  pause: { tier: "destructive", confirmWord: "pause", agentTargeted: true },
  halt: { tier: "destructive", confirmWord: "halt", agentTargeted: true },
  edit_schedule: { tier: "destructive", confirmWord: "schedule", agentTargeted: false },
  // ── v0.3.4 full-control extensions ──
  resume: { tier: "soft", confirmWord: "resume", agentTargeted: true },
  auto_delivery: { tier: "soft", confirmWord: "delivery", agentTargeted: true },
  gate_tool: { tier: "soft", confirmWord: "gate", agentTargeted: true },
  delete_task: { tier: "soft", confirmWord: "delete", agentTargeted: false },
  unarchive: { tier: "soft", confirmWord: "unarchive", agentTargeted: true },
  clear_context: { tier: "destructive", confirmWord: "clear", agentTargeted: true },
  archive: { tier: "destructive", confirmWord: "archive", agentTargeted: true },
  create_schedule: { tier: "destructive", confirmWord: "schedule", agentTargeted: false },
  update_setting: { tier: "destructive", confirmWord: "setting", agentTargeted: false }
};
var SETTING_POLICY = {
  // soft: cosmetic / low-blast, instantly reversible
  notifications: { tier: "soft", type: "boolean" },
  tvShowOffices: { tier: "soft", type: "boolean" },
  officeTheme: { tier: "soft", type: "string", values: ["office", "friends", "brooklyn99", "siliconvalley", "got", "hogwarts"] },
  terminalTheme: { tier: "soft", type: "string", values: ["light", "dark"] },
  freeflowEnabled: { tier: "soft", type: "boolean" },
  strongKeepalive: { tier: "soft", type: "boolean" },
  autoUpdate: { tier: "soft", type: "boolean" },
  realtimeIdleDisconnectMs: { tier: "soft", type: "number", min: 3e4, max: 36e5 },
  // confirm: behavior-changing — echo old→new + distinct token
  autoMode: { tier: "confirm", type: "boolean" },
  defaultModel: { tier: "confirm", type: "string" },
  godProvider: { tier: "confirm", type: "string" },
  godModel: { tier: "confirm", type: "string" },
  maxConcurrentWorkers: { tier: "confirm", type: "number", min: 1, max: 16 },
  costCapTokens: { tier: "confirm", type: "number", min: 0, max: 1e9 },
  maxTurns: { tier: "confirm", type: "number", min: 1, max: 1e3 },
  slackEnabled: { tier: "confirm", type: "boolean" },
  webhookEnabled: { tier: "confirm", type: "boolean" },
  semanticMemory: { tier: "confirm", type: "boolean" },
  multiWindow: { tier: "confirm", type: "boolean" }
};
var PENDING_TTL_MS = 12e4;
var PROVIDER_COMMAND = {
  claude: "claude",
  codex: "codex",
  antigravity: "antigravity",
  gemini: "gemini",
  opencode: "opencode",
  crush: "crush",
  pi: "pi",
  qwen: "qwen",
  copilot: "copilot",
  cursor: "cursor-agent"
};
var BARE_AFFIRMATIONS = /* @__PURE__ */ new Set([
  "yes",
  "yeah",
  "yep",
  "yup",
  "ya",
  "ok",
  "okay",
  "k",
  "sure",
  "go",
  "go ahead",
  "do it",
  "please",
  "fine",
  "affirmative",
  "uh huh",
  "mhm",
  "mm hmm",
  "right",
  "correct"
]);
var str = (x) => typeof x === "string" ? x : "";
var norm = (s) => s.toLowerCase().replace(/[.!?,;:'"]/g, " ").replace(/\s+/g, " ").trim();
var escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function shortId() {
  return Math.random().toString(36).slice(2, 8);
}
function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "agent";
}
function isMassTarget(target) {
  const t = norm(target);
  if (!t) return false;
  if (/\b(all|every|everyone|everybody)\b/.test(t)) return true;
  if (t === "*" || t === "agents" || t === "the team" || t === "team" || t === "fleet" || t === "everything")
    return true;
  if (/,| and /.test(t)) return true;
  return false;
}
function resolveAgent(target, reg) {
  const t = norm(target);
  if (!t) return { error: "no agent was named" };
  const entries = Object.entries(reg.agents ?? {});
  const mk = (id, m) => ({
    id,
    name: m.name || id,
    isGod: !!m.isGod || id === reg.godId
  });
  const byId = entries.find(([id]) => id.toLowerCase() === t);
  if (byId) return mk(byId[0], byId[1]);
  if ((t === "god" || t === "michael" || t === "the god") && reg.godId)
    return mk(reg.godId, reg.agents[reg.godId] ?? {});
  const byName = entries.filter(([, m]) => (m.name || "").toLowerCase() === t);
  const liveName = byName.filter(([, m]) => !m.archived);
  const namePick = liveName.length ? liveName : byName;
  if (namePick.length === 1) return mk(namePick[0][0], namePick[0][1]);
  if (namePick.length > 1)
    return { error: `${namePick.length} agents are named ${target} \u2014 say the exact agent id` };
  const partial = entries.filter(
    ([id, m]) => !m.archived && (id.toLowerCase().includes(t) || (m.name || "").toLowerCase().includes(t))
  );
  if (partial.length === 1) return mk(partial[0][0], partial[0][1]);
  if (partial.length > 1) return { error: `several agents match "${target}" \u2014 be more specific or say an id` };
  return { error: `I don't see an agent matching "${target}"` };
}
function confirmAccepted(phrase, confirmWord) {
  const p = norm(phrase);
  if (!p) return false;
  if (BARE_AFFIRMATIONS.has(p)) return false;
  if (/\bconfirm(ed|s)?\b/.test(p)) return true;
  if (new RegExp(`\\b${escapeRegExp(confirmWord)}\\b`).test(p)) return true;
  return false;
}
var pending = null;
function pendingFresh() {
  if (pending && Date.now() - pending.createdAt > PENDING_TTL_MS) pending = null;
  return pending;
}
function attribute(deps, verb, target, extra = {}) {
  try {
    deps.hiveLog({ kind: "voice_action", actor: VOICE_ACTOR, verb, target, ...extra });
  } catch {
  }
  try {
    const detail = typeof extra.objective === "string" ? `: ${extra.objective}` : typeof extra.text === "string" ? `: ${extra.text}` : typeof extra.title === "string" ? `: ${extra.title}` : typeof extra.status === "string" ? ` \u2192 ${extra.status}` : typeof extra.action === "string" ? ` (${extra.action})` : "";
    const reg = deps.hiveRegistry();
    const godName = resolveGodName(reg.agents[reg.godId ?? "god"]?.name);
    deps.hiveSend(
      {
        to: "god",
        act: "inform",
        subject: `voice action: ${verb} ${target}`,
        body: `${godName} (voice orchestrator, ${VOICE_ACTOR}) just did: ${verb} on ${target}${detail}. Heads-up so we don't duplicate \u2014 the board is the single source of truth.`
      },
      VOICE_ACTOR
    );
  } catch {
  }
}
function findTasks(deps) {
  const data = deps.hiveTasks();
  return Array.isArray(data?.tasks) ? data.tasks : [];
}
function execPing(deps, a) {
  const reg = deps.hiveRegistry();
  const r = resolveAgent(str(a.agentId) || str(a.target) || str(a.name), reg);
  if ("error" in r) return { ok: false, spoken: r.error };
  const message = str(a.message) || str(a.text) || "Checking in.";
  deps.hiveSend({ to: r.id, act: "inform", subject: `Voice ping from ${resolveGodName(reg.agents[reg.godId ?? "god"]?.name)}`, body: message }, VOICE_ACTOR);
  attribute(deps, "ping", r.id);
  return { ok: true, spoken: `Pinged ${r.name}.` };
}
function execDispatch(deps, a) {
  const reg = deps.hiveRegistry();
  const r = resolveAgent(str(a.agentId) || str(a.target) || str(a.name), reg);
  if ("error" in r) return { ok: false, spoken: r.error };
  const objective = str(a.objective) || str(a.task) || str(a.message);
  if (!objective) return { ok: false, spoken: "What should I dispatch? I need an objective." };
  const body = `OBJECTIVE: ${objective}
CONTEXT: ${str(a.context) || "(none given)"}
CONSTRAINTS: ${str(a.constraints) || "(use your judgement; respect the guardrails)"}
DONE WHEN: ${str(a.doneWhen) || str(a.done) || "you report the outcome back to god"}`;
  const msg = deps.hiveSend(
    { to: r.id, act: "request", subject: `Voice dispatch: ${objective.slice(0, 60)}`, body, requires_reply: true },
    VOICE_ACTOR
  );
  attribute(deps, "dispatch", r.id, { objective: objective.slice(0, 120) });
  deps.trackDispatch?.({ correlationId: msg.id, targetAgentId: r.id, objective, dispatchedAt: Date.now(), dispatchMessageId: msg.id });
  return { ok: true, spoken: `Dispatched to ${r.name}: ${objective.slice(0, 80)}.` };
}
function execSteer(deps, a) {
  const reg = deps.hiveRegistry();
  const r = resolveAgent(str(a.agentId) || str(a.target) || str(a.name), reg);
  if ("error" in r) return { ok: false, spoken: r.error };
  const text = str(a.text) || str(a.message) || str(a.steer);
  if (!text) return { ok: false, spoken: "What guidance should I steer them with?" };
  deps.controlSteer(r.id, `[${VOICE_ACTOR}] ${text}`);
  attribute(deps, "steer", r.id, { text: text.slice(0, 120) });
  return { ok: true, spoken: `Steering ${r.name}: ${text.slice(0, 80)}.` };
}
function execCreateTask(deps, a) {
  const title = str(a.title) || str(a.task) || str(a.name);
  if (!title) return { ok: false, spoken: "What should the task be titled?" };
  const tasks = findTasks(deps);
  const id = `${slug(title)}-${shortId()}`;
  const card = {
    id,
    title,
    description: str(a.description) || void 0,
    assignee: str(a.assignee) || void 0,
    status: "todo",
    dependsOn: [],
    priority: typeof a.priority === "number" ? a.priority : 5,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  deps.hiveWriteTasks([...tasks, card]);
  attribute(deps, "create_task", id, { title: title.slice(0, 120), assignee: card.assignee });
  return { ok: true, spoken: `Created task "${title}"${card.assignee ? `, assigned to ${card.assignee}` : ""}.` };
}
var normMatch = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
var toksMatch = (s) => normMatch(s).split(" ").filter(Boolean);
var AMBIGUOUS_MARGIN = 0.08;
function scoreCard(refNorm, refToks, c) {
  if (!refNorm) return 0;
  const titleN = normMatch(c.title);
  const idN = normMatch(c.id);
  if (idN === refNorm || titleN === refNorm) return 1;
  if (titleN && (titleN.startsWith(refNorm) || refNorm.startsWith(titleN))) return 0.92;
  if (idN && idN.startsWith(refNorm)) return 0.9;
  const hay = new Set(toksMatch(c.title).concat(toksMatch(c.id)));
  const coverage = refToks.length ? refToks.filter((w) => hay.has(w)).length / refToks.length : 0;
  const hayArr = [...hay];
  const prefixCov = refToks.length ? refToks.filter((w) => hayArr.some((h) => h.startsWith(w) || w.startsWith(h))).length / refToks.length : 0;
  if (coverage === 1) return 0.85;
  if (titleN.includes(refNorm) || idN.includes(refNorm)) return Math.max(0.7, coverage);
  if (prefixCov === 1) return 0.78;
  return Math.max(coverage, prefixCov) * 0.7;
}
function findCard(deps, ref) {
  const tasks = findTasks(deps);
  const refNorm = normMatch(ref);
  const refToks = toksMatch(ref);
  const scored = tasks.map((c) => ({ c, s: scoreCard(refNorm, refToks, c) })).filter((x) => x.s >= 0.45).sort((a, b) => b.s - a.s);
  if (!scored.length) return { tasks, card: null };
  const top = scored[0];
  const close = scored.filter((x) => x.s >= top.s - AMBIGUOUS_MARGIN);
  if (close.length > 1) return { tasks, card: null, ambiguous: close.slice(0, 3).map((x) => x.c) };
  return { tasks, card: top.c };
}
function execAssignTask(deps, a) {
  const ref = str(a.taskId) || str(a.task) || str(a.title);
  const assignee = str(a.assignee) || str(a.to) || str(a.agentId);
  if (!ref || !assignee) return { ok: false, spoken: "I need both a task and who to assign it to." };
  const { tasks, card, ambiguous } = findCard(deps, ref);
  if (ambiguous) {
    return { ok: false, spoken: `Which one \u2014 ${ambiguous.map((c) => `"${c.title}"`).join(", or ")}?` };
  }
  if (!card) return { ok: false, spoken: `I couldn't find a task matching "${ref}".` };
  card.assignee = assignee;
  deps.hiveWriteTasks(tasks);
  attribute(deps, "assign_task", card.id, { assignee });
  return { ok: true, spoken: `Assigned "${card.title}" to ${assignee}.` };
}
function execUpdateTask(deps, a) {
  const ref = str(a.taskId) || str(a.task) || str(a.title);
  if (!ref) return { ok: false, spoken: "Which task should I update?" };
  const { tasks, card, ambiguous } = findCard(deps, ref);
  if (ambiguous) {
    return { ok: false, spoken: `Which one \u2014 ${ambiguous.map((c) => `"${c.title}"`).join(", or ")}?` };
  }
  if (!card) return { ok: false, spoken: `I couldn't find a task matching "${ref}".` };
  const status = str(a.status);
  const valid = ["todo", "doing", "blocked", "done"];
  if (status && !valid.includes(status)) return { ok: false, spoken: `"${status}" isn't a valid status.` };
  if (status) card.status = status;
  if (str(a.result)) card.result = str(a.result);
  if (str(a.assignee)) card.assignee = str(a.assignee);
  deps.hiveWriteTasks(tasks);
  attribute(deps, "update_task", card.id, { status: card.status });
  return { ok: true, spoken: `Updated "${card.title}"${status ? ` to ${status}` : ""}.` };
}
function execResume(deps, a) {
  const r = resolveAgent(str(a.agentId) || str(a.target) || str(a.name), deps.hiveRegistry());
  if ("error" in r) return { ok: false, spoken: r.error };
  deps.controlResume(r.id);
  attribute(deps, "resume", r.id);
  return { ok: true, spoken: `Resumed ${r.name} \u2014 tools flow again.` };
}
function execAutoDelivery(deps, a) {
  const r = resolveAgent(str(a.agentId) || str(a.target) || str(a.name), deps.hiveRegistry());
  if ("error" in r) return { ok: false, spoken: r.error };
  const raw = norm(str(a.state) || str(a.action) || (a.paused === true ? "pause" : a.paused === false ? "resume" : ""));
  if (!raw) return { ok: false, spoken: "Should I pause or resume message delivery?" };
  const paused = /pause|off|hold|stop/.test(raw);
  deps.controlAutoDelivery(r.id, paused);
  attribute(deps, "auto_delivery", r.id, { action: paused ? "paused" : "resumed" });
  return {
    ok: true,
    spoken: paused ? `Paused automatic delivery to ${r.name} \u2014 queued messages will wait.` : `Resumed automatic delivery to ${r.name}.`
  };
}
function execGateTool(deps, a) {
  const r = resolveAgent(str(a.agentId) || str(a.target) || str(a.name), deps.hiveRegistry());
  if ("error" in r) return { ok: false, spoken: r.error };
  const toolName = str(a.tool) || str(a.toolName);
  if (!toolName || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(toolName)) {
    return { ok: false, spoken: "Which tool should I gate? Give me its exact name, like Bash or WebFetch." };
  }
  const raw = norm(str(a.state) || str(a.action));
  const on = !/off|allow|ungate|unblock|enable/.test(raw);
  deps.controlGateTool(r.id, toolName, on);
  attribute(deps, "gate_tool", r.id, { action: `${on ? "gated" : "ungated"} ${toolName}` });
  return { ok: true, spoken: `${on ? "Gated" : "Un-gated"} the ${toolName} tool for ${r.name}.` };
}
function execDeleteTask(deps, a) {
  const ref = str(a.taskId) || str(a.task) || str(a.title);
  if (!ref) return { ok: false, spoken: "Which task should I delete?" };
  const { tasks, card, ambiguous } = findCard(deps, ref);
  if (ambiguous) return { ok: false, spoken: `Which one \u2014 ${ambiguous.map((c) => `"${c.title}"`).join(", or ")}?` };
  if (!card) return { ok: false, spoken: `I couldn't find a task matching "${ref}".` };
  deps.hiveWriteTasks(tasks.filter((t) => t.id !== card.id));
  attribute(deps, "delete_task", card.id, { title: card.title.slice(0, 120) });
  return { ok: true, spoken: `Deleted the task "${card.title}". Recreate it any time if that was wrong.` };
}
function execUnarchive(deps, a) {
  const r = resolveAgent(str(a.agentId) || str(a.target) || str(a.name), deps.hiveRegistry());
  if ("error" in r) return { ok: false, spoken: r.error };
  const res = deps.setArchived(r.id, false);
  attribute(deps, "unarchive", r.id);
  return res.ok ? { ok: true, spoken: `Brought ${r.name} back from the archive.` } : { ok: false, spoken: `Couldn't unarchive ${r.name}: ${res.error || "unknown error"}.` };
}
function buildKill(deps, r) {
  return async () => {
    const res = deps.killAgent(r.id);
    attribute(deps, "kill", r.id);
    return res.ok ? `Killed ${r.name}.` : `Couldn't kill ${r.name}: ${res.error || "unknown error"}.`;
  };
}
function buildPause(deps, r) {
  return async () => {
    deps.controlPause(r.id, true);
    attribute(deps, "pause", r.id);
    return `Paused ${r.name}.`;
  };
}
function buildHalt(deps, r) {
  return async () => {
    deps.controlHalt(r.id);
    attribute(deps, "halt", r.id);
    return `Halted ${r.name}.`;
  };
}
function buildSpawn(deps, spec, label) {
  return async () => {
    const res = await deps.spawnAgent(spec);
    attribute(deps, "spawn", spec.id, { provider: spec.provider, role: spec.hive?.role });
    return res.ok ? `Hired ${label}.` : `Couldn't hire ${label}: ${res.error || "unknown error"}.`;
  };
}
function buildClearContext(deps, r) {
  return async () => {
    const provider = inferAgentProvider(void 0, deps.hiveRegistry().agents?.[r.id]?.provider);
    const command = clearCommandForProvider(provider);
    if (!command) {
      return `${r.name} runs on ${provider}, which has no context-clear command I can type. Clear it from their terminal.`;
    }
    deps.enqueueToAgent(r.id, command);
    attribute(deps, "clear_context", r.id);
    return `Queued a context clear for ${r.name} \u2014 it lands the moment they're idle.`;
  };
}
function buildArchive(deps, r) {
  return async () => {
    const res = deps.setArchived(r.id, true);
    attribute(deps, "archive", r.id);
    return res.ok ? `Archived ${r.name} \u2014 off the floor, history kept. Say unarchive to bring them back.` : `Couldn't archive ${r.name}: ${res.error || "unknown error"}.`;
  };
}
function buildEditSchedule(deps, mission, action) {
  return async () => {
    const all = deps.listMissions();
    let next;
    if (action === "delete") next = all.filter((m) => m.id !== mission.id);
    else next = all.map((m) => m.id === mission.id ? { ...m, enabled: action === "enable" } : m);
    deps.saveMissions(next);
    attribute(deps, "edit_schedule", mission.id, { action });
    return `${action === "delete" ? "Deleted" : action === "enable" ? "Enabled" : "Disabled"} the "${mission.label}" schedule.`;
  };
}
function proposeDestructive(deps, verb, a) {
  const spec = VERBS[verb];
  const reg = deps.hiveRegistry();
  if (spec.agentTargeted) {
    const rawTarget = str(a.agentId) || str(a.target) || str(a.name);
    if (isMassTarget(rawTarget))
      return { ok: false, spoken: `${verb} on all agents at once is voice-forbidden. Do it agent by agent, or use the UI.` };
    const r = resolveAgent(rawTarget, reg);
    if ("error" in r) return { ok: false, spoken: r.error };
    if (r.isGod && verb !== "clear_context")
      return { ok: false, spoken: `${verb} on the god orchestrator is voice-forbidden. That has to be done in the UI.` };
    const commit = verb === "kill" ? buildKill(deps, r) : verb === "pause" ? buildPause(deps, r) : verb === "halt" ? buildHalt(deps, r) : verb === "clear_context" ? buildClearContext(deps, r) : buildArchive(deps, r);
    const breaker2 = deps.controlSnapshot(r.id);
    const note = breaker2?.halted ? " (note: already halted)" : breaker2?.paused ? " (note: already paused)" : "";
    pending = { verb, confirmWord: spec.confirmWord, targetLabel: r.name, createdAt: Date.now(), commit };
    const consequence = verb === "clear_context" ? `That wipes ${r.name}'s working memory of the current conversation.` : verb === "archive" ? `That takes ${r.name} off the floor (history kept).` : `That's destructive.`;
    return {
      ok: true,
      needsConfirm: true,
      spoken: `You asked me to ${verb.replace("_", " ")} ${r.name}${note}. ${consequence} To go ahead, say "confirm" or "${spec.confirmWord}". Say "cancel" to stop.`
    };
  }
  if (verb === "spawn") {
    const provider = (str(a.provider) || "claude").toLowerCase();
    const role = str(a.role) || str(a.job);
    const name = str(a.name) || (role ? role.replace(/\b\w/g, (c) => c.toUpperCase()) : provider) || "Worker";
    const godCwd = reg.godId ? reg.agents[reg.godId]?.cwd : void 0;
    const cwd = str(a.cwd) || godCwd || Object.values(reg.agents).find((m) => m.cwd)?.cwd || "";
    if (!cwd) return { ok: false, spoken: "I need a working directory to hire into \u2014 none is configured." };
    const command = str(a.command) || PROVIDER_COMMAND[provider] || "claude";
    const id = `${slug(name)}-${shortId()}`;
    const spec2 = { id, cwd, command, provider, hive: { id, name, provider, role: role || void 0, cwd } };
    pending = { verb, confirmWord: "spawn", targetLabel: name, createdAt: Date.now(), commit: buildSpawn(deps, spec2, `${name} on ${provider}`) };
    return {
      ok: true,
      needsConfirm: true,
      // Spawn/hire is gated behind a verbal echo-back confirm. No cost is quoted —
      // the orchestrator persona does not surface money to the user.
      spoken: `You want to hire a new ${provider} agent${role ? ` as ${role}` : ""}, named ${name}. To hire, say "confirm" or "spawn". Say "cancel" to stop.`
    };
  }
  if (verb === "edit_schedule") {
    const missions = deps.listMissions();
    if (!missions.length) return { ok: false, spoken: "There are no scheduled missions to edit." };
    const ref = norm(str(a.missionId) || str(a.schedule) || str(a.label) || str(a.target));
    const m = missions.find((x) => x.id.toLowerCase() === ref) || missions.find((x) => (x.label || "").toLowerCase() === ref) || missions.find((x) => (x.label || "").toLowerCase().includes(ref) || x.id.toLowerCase().includes(ref));
    if (!m) return { ok: false, spoken: ref ? `I couldn't find a schedule matching "${str(a.label) || ref}".` : "Which schedule should I edit?" };
    const raw = norm(str(a.action) || str(a.op));
    const action = raw.includes("delete") || raw.includes("remove") ? "delete" : raw.includes("disable") || raw.includes("off") || raw.includes("pause") ? "disable" : "enable";
    pending = {
      verb,
      confirmWord: "schedule",
      targetLabel: m.label,
      createdAt: Date.now(),
      commit: buildEditSchedule(deps, m, action)
    };
    return {
      ok: true,
      needsConfirm: true,
      spoken: `You want to ${action} the "${m.label}" schedule. To go ahead, say "confirm" or "schedule". Say "cancel" to stop.`
    };
  }
  if (verb === "create_schedule") {
    const label = str(a.label) || str(a.name) || str(a.title);
    const body = str(a.prompt) || str(a.body) || str(a.message);
    if (!label || !body) return { ok: false, spoken: "I need a name for the schedule and what it should tell the agent." };
    const minutes = typeof a.intervalMinutes === "number" && isFinite(a.intervalMinutes) ? Math.min(7 * 24 * 60, Math.max(5, Math.round(a.intervalMinutes))) : 60;
    const to = str(a.to) || str(a.agentId) || "god";
    const target = resolveAgent(to, reg);
    const targetId = "error" in target ? "god" : target.id;
    const mission = {
      id: `voice-${slug(label)}-${shortId()}`,
      label,
      intervalMs: minutes * 6e4,
      to: targetId,
      body,
      enabled: true
    };
    pending = {
      verb,
      confirmWord: "schedule",
      targetLabel: label,
      createdAt: Date.now(),
      commit: async () => {
        deps.saveMissions([...deps.listMissions(), mission]);
        attribute(deps, "create_schedule", mission.id, { title: label.slice(0, 120) });
        return `Created the "${label}" schedule \u2014 every ${minutes} minutes to ${targetId}.`;
      }
    };
    return {
      ok: true,
      needsConfirm: true,
      spoken: `You want a new schedule "${label}", every ${minutes} minutes, messaging ${targetId}. To create it, say "confirm" or "schedule". Say "cancel" to stop.`
    };
  }
  if (verb === "update_setting") {
    const key = str(a.key) || str(a.setting) || str(a.name);
    const policy = SETTING_POLICY[key];
    if (!key) return { ok: false, spoken: "Which setting should I change?" };
    if (!policy) {
      return { ok: false, spoken: `The "${key}" setting can't be changed by voice \u2014 use the Settings screen for that one.` };
    }
    let value = a.value;
    if (policy.type === "boolean") {
      if (typeof value === "string") value = /^(true|on|yes|enable|enabled|1)$/i.test(value.trim());
      if (typeof value !== "boolean") return { ok: false, spoken: `Should ${key} be on or off?` };
    } else if (policy.type === "number") {
      if (typeof value === "string") value = parseFloat(value);
      if (typeof value !== "number" || !isFinite(value)) return { ok: false, spoken: `What number should ${key} be?` };
      if (policy.min !== void 0 && value < policy.min) return { ok: false, spoken: `${key} can't go below ${policy.min}.` };
      if (policy.max !== void 0 && value > policy.max) return { ok: false, spoken: `${key} can't go above ${policy.max}.` };
      value = Math.round(value);
    } else {
      if (typeof value !== "string" || !value.trim() || value.length > 200) {
        return { ok: false, spoken: `What should ${key} be set to?` };
      }
      value = value.trim();
      if (policy.values && !policy.values.includes(value)) {
        return { ok: false, spoken: `${key} must be one of: ${policy.values.join(", ")}.` };
      }
    }
    const oldValue = deps.getConfigValue(key);
    const describe = (v) => typeof v === "boolean" ? v ? "on" : "off" : String(v ?? "unset");
    if (describe(oldValue) === describe(value)) {
      return { ok: true, spoken: `${key} is already ${describe(value)} \u2014 nothing to change.` };
    }
    const applyNow = () => {
      deps.patchConfig({ [key]: value });
      attribute(deps, "update_setting", key, { action: `${describe(oldValue)} \u2192 ${describe(value)}` });
      return `Done \u2014 ${key} is now ${describe(value)} (was ${describe(oldValue)}).`;
    };
    if (policy.tier === "soft") {
      return { ok: true, spoken: applyNow() };
    }
    pending = { verb, confirmWord: "setting", targetLabel: key, createdAt: Date.now(), commit: async () => applyNow() };
    return {
      ok: true,
      needsConfirm: true,
      spoken: `${key} is ${describe(oldValue)}; you want it ${describe(value)}. To change it, say "confirm" or "setting". Say "cancel" to stop.`
    };
  }
  return { ok: false, spoken: `I don't know how to ${verb}.` };
}
function runAction(deps, verb, a) {
  if (!deps.hiveEnabled()) return { ok: false, spoken: "The hive is not configured, so I can't take that action." };
  const spec = VERBS[verb];
  if (!spec) return { ok: false, spoken: `I don't have an action called "${verb}".` };
  pending = null;
  if (spec.tier === "soft") {
    switch (verb) {
      case "ping":
        return execPing(deps, a);
      case "dispatch":
        return execDispatch(deps, a);
      case "steer":
        return execSteer(deps, a);
      case "create_task":
        return execCreateTask(deps, a);
      case "assign_task":
        return execAssignTask(deps, a);
      case "update_task":
        return execUpdateTask(deps, a);
      case "resume":
        return execResume(deps, a);
      case "auto_delivery":
        return execAutoDelivery(deps, a);
      case "gate_tool":
        return execGateTool(deps, a);
      case "delete_task":
        return execDeleteTask(deps, a);
      case "unarchive":
        return execUnarchive(deps, a);
      default:
        return { ok: false, spoken: `I don't know how to ${verb}.` };
    }
  }
  return proposeDestructive(deps, verb, a);
}
function logActionFailure(deps, channel, verb, e) {
  const err = e instanceof Error ? e : new Error(String(e));
  console.error(`[realtime-action] ${channel} verb=${verb} FAILED:`, err.stack || err.message);
  try {
    deps.hiveLog({
      kind: "voice_action_error",
      actor: VOICE_ACTOR,
      channel,
      verb,
      error: err.message,
      stack: (err.stack || "").slice(0, 800)
    });
  } catch {
  }
}
function registerRealtimeActionIpc(deps) {
  import_electron9.ipcMain.handle("realtime:action", async (_evt, payload) => {
    const p = payload ?? {};
    const verb = norm(str(p.verb)).replace(/\s+/g, "_");
    try {
      const res = runAction(deps, verb, p);
      if (!res.ok) console.warn(`[realtime-action] verb=${verb} rejected: ${res.spoken}`);
      return res;
    } catch (e) {
      logActionFailure(deps, "realtime:action", verb, e);
      const msg = e instanceof Error ? e.message : "unknown error";
      return { ok: false, spoken: `That action failed: ${msg}.` };
    }
  });
  import_electron9.ipcMain.handle("realtime:action:confirm", async (_evt, payload) => {
    const p = payload ?? {};
    const cur = pendingFresh();
    if (!cur) return { ok: false, spoken: "There's nothing waiting to confirm." };
    const phrase = str(p.phrase) || str(p.confirm) || str(p.text);
    if (!confirmAccepted(phrase, cur.confirmWord)) {
      return {
        ok: false,
        spoken: `I won't ${cur.verb} ${cur.targetLabel} on that \u2014 for safety I need you to say "confirm" or "${cur.confirmWord}", not just yes. Say it clearly, or say cancel.`
      };
    }
    const commit = cur.commit;
    const verb = cur.verb;
    pending = null;
    try {
      const spoken = await commit();
      return { ok: true, spoken };
    } catch (e) {
      logActionFailure(deps, "realtime:action:confirm", verb, e);
      const msg = e instanceof Error ? e.message : "unknown error";
      return { ok: false, spoken: `That action failed: ${msg}.` };
    }
  });
  import_electron9.ipcMain.handle("realtime:action:cancel", async () => {
    const had = pendingFresh();
    pending = null;
    return { ok: true, spoken: had ? `Cancelled the ${had.verb}.` : "Nothing to cancel." };
  });
}

// cth/main/realtimeCompletionWatcher.ts
var DEFAULT_POLL_MS = 4e3;
var MAX_PENDING = 200;
var PENDING_TTL_MS2 = 24 * 60 * 60 * 1e3;
var MAX_QUEUED = 50;
var INJECTION_PATTERNS = [
  /\b(?:ignore|disregard|forget|override)\b[^.!?\n]*\b(?:previous|above|prior|instruction|system|prompt)\b[^.!?\n]*/gi,
  /\b(?:system|assistant|developer|user)\s*:/gi,
  /\byou are (?:now )?[^.!?\n]*/gi,
  /\bnew instructions?\b[^.!?\n]*/gi
];
function neutralizeForVoice(text) {
  let out = text.replace(/[\u0000-\u001f\u007f]+/g, " ");
  for (const p of INJECTION_PATTERNS) out = out.replace(p, "[omitted]");
  return out.replace(/\s+/g, " ").trim().slice(0, 100);
}
function isDoneStatus(status) {
  return (status ?? "").trim().toLowerCase() === "done";
}
function parseTs(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}
function isSystemSender(from) {
  const f = (from ?? "").toLowerCase();
  return f === "breaker" || f === "scheduler" || f === "system" || f === "";
}
function speakableName(agentId) {
  const head = agentId.split("-")[0] ?? agentId;
  return head ? head.charAt(0).toUpperCase() + head.slice(1) : agentId;
}
function summarize(pending2, via) {
  const who = speakableName(pending2.targetAgentId);
  const obj = pending2.objective ? neutralizeForVoice(pending2.objective) : "";
  const what = obj ? ` on "${obj}"` : "";
  const tail = via === "card-done" ? " (card marked done)" : "";
  return `${who} finished${what}.${tail}`.replace(" .", ".");
}
function detectCompletion(pending2, ctx) {
  if (pending2.taskId) {
    const card = ctx.tasks.find((t) => t.id === pending2.taskId);
    if (card && isDoneStatus(card.status)) {
      return { done: true, via: "card-done", at: pending2.dispatchedAt, summary: summarize(pending2, "card-done") };
    }
  }
  let best = null;
  for (const m of ctx.inbox) {
    if (m.from !== pending2.targetAgentId) continue;
    if (isSystemSender(m.from)) continue;
    const replyMatch = !!pending2.dispatchMessageId && m.in_reply_to === pending2.dispatchMessageId;
    const at = parseTs(m.created_at);
    const postDates = at === null ? false : at >= pending2.dispatchedAt;
    if (replyMatch || postDates) {
      const effAt = at ?? pending2.dispatchedAt;
      if (!best || effAt >= best.at) best = { msg: m, at: effAt };
      if (replyMatch) break;
    }
  }
  if (best) {
    return {
      done: true,
      via: "inbox-reply",
      at: best.at,
      messageId: best.msg.id,
      summary: summarize(pending2, "inbox-reply")
    };
  }
  return { done: false };
}
var RealtimeCompletionWatcher = class {
  deps;
  now;
  pollMs;
  pending = /* @__PURE__ */ new Map();
  listeners = /* @__PURE__ */ new Set();
  waiters = /* @__PURE__ */ new Set();
  /** Completions detected while no session was live — drained at warm-start. */
  queued = [];
  sessionLive = false;
  timer = null;
  constructor(deps) {
    this.deps = deps;
    this.now = deps.now ?? (() => Date.now());
    this.pollMs = deps.pollIntervalMs ?? DEFAULT_POLL_MS;
  }
  /** Begin watching a dispatched unit of work. Idempotent per correlationId. */
  track(record) {
    this.pending.set(record.correlationId, record);
    this.prunePending();
  }
  /** Stop watching a dispatch (e.g. it was cancelled). */
  untrack(correlationId) {
    this.pending.delete(correlationId);
  }
  /** Subscribe to completion events. Returns an unsubscribe fn. */
  onCompletion(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  /**
   * Await a specific task's completion (the `wait_for(taskId)` tool path). Resolves with the
   * completion event, or with a timeout sentinel after `timeoutMs`. If the task is already
   * tracked we use full detection; an untracked taskId still resolves on a card→done signal.
   */
  waitFor(taskId, timeoutMs) {
    const immediate = this.checkOne(this.pendingForTask(taskId) ?? this.syntheticPending(taskId));
    if (immediate) return Promise.resolve(immediate);
    return new Promise((resolve4) => {
      const waiter = { taskId, resolve: (e) => resolve4(e) };
      this.waiters.add(waiter);
      const timer = setTimeout(() => {
        this.waiters.delete(waiter);
        resolve4({ timedOut: true, taskId });
      }, Math.max(0, timeoutMs));
      if (typeof timer === "object" && timer && "unref" in timer) timer.unref();
    });
  }
  /** Tell the watcher whether a realtime session is currently live (emit vs queue). */
  setSessionLive(live) {
    this.sessionLive = live;
  }
  /** Return + clear completions that queued while no session was live (warm-start use). */
  drainQueuedCompletions() {
    const out = this.queued;
    this.queued = [];
    return out;
  }
  /** Number of dispatches still being watched (diagnostics). */
  get pendingCount() {
    return this.pending.size;
  }
  /** Start the poll loop. Safe to call repeatedly. */
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.poll(), this.pollMs);
    if (this.timer && typeof this.timer === "object" && "unref" in this.timer) {
      this.timer.unref();
    }
  }
  /** Stop the poll loop. */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  /** Run detection across all pending dispatches once. Exposed for tests / manual ticks. */
  poll() {
    if (this.pending.size === 0 && this.waiters.size === 0) return;
    this.prunePending();
    for (const record of [...this.pending.values()]) {
      const event = this.checkOne(record);
      if (event) {
        this.pending.delete(record.correlationId);
        this.route(event);
      }
    }
  }
  /**
   * N2: bound the pending map so a long session can't leak. Drop abandoned dispatches
   * (older than the TTL — we'll never see a completion for them), then, if still over the
   * cap, evict the oldest by dispatch time.
   */
  prunePending() {
    const cutoff = this.now() - PENDING_TTL_MS2;
    for (const [id, rec] of this.pending) {
      if (rec.dispatchedAt > 0 && rec.dispatchedAt < cutoff) this.pending.delete(id);
    }
    if (this.pending.size > MAX_PENDING) {
      const oldestFirst = [...this.pending.entries()].sort(
        (a, b) => a[1].dispatchedAt - b[1].dispatchedAt
      );
      const overflow = this.pending.size - MAX_PENDING;
      for (let i = 0; i < overflow; i++) this.pending.delete(oldestFirst[i][0]);
    }
  }
  // --- internals ---
  snapshot() {
    return { tasks: safeRead(this.deps.readTasks), inbox: safeRead(this.deps.readInbox) };
  }
  checkOne(record) {
    const res = detectCompletion(record, this.snapshot());
    if (!res.done) return null;
    return {
      correlationId: record.correlationId,
      kind: record.kind,
      targetAgentId: record.targetAgentId,
      taskId: record.taskId,
      objective: record.objective,
      via: res.via ?? "inbox-reply",
      completedAt: res.at ?? this.now(),
      summary: res.summary ?? summarize(record, res.via),
      messageId: res.messageId
    };
  }
  /** Resolve any waiters for this task, then emit (live) or queue (closed). */
  route(event) {
    for (const w of [...this.waiters]) {
      if (event.taskId && w.taskId === event.taskId) {
        this.waiters.delete(w);
        w.resolve(event);
      }
    }
    if (this.sessionLive) {
      for (const l of this.listeners) {
        try {
          l(event);
        } catch {
        }
      }
    } else {
      this.queued.push(event);
      if (this.queued.length > MAX_QUEUED) this.queued = this.queued.slice(-MAX_QUEUED);
      try {
        this.deps.onNotify?.(event);
      } catch {
      }
    }
  }
  pendingForTask(taskId) {
    for (const r of this.pending.values()) if (r.taskId === taskId) return r;
    return void 0;
  }
  /** Minimal pending record for an untracked wait_for(taskId) — card→done only. */
  syntheticPending(taskId) {
    return { correlationId: `wait:${taskId}`, kind: "task", targetAgentId: "", taskId, dispatchedAt: 0 };
  }
};
function safeRead(reader) {
  try {
    const v = reader();
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
var _instance = null;
function initCompletionWatcher(deps) {
  if (!_instance) _instance = new RealtimeCompletionWatcher(deps);
  return _instance;
}

// cth/main/telemetry.ts
var import_node_http3 = require("node:http");
var MAX_BODY_BYTES3 = 8 * 1024 * 1024;
var SPAN_RING_CAP = 200;
var TelemetryCollector = class {
  server = null;
  boundPort = null;
  host;
  port;
  emit;
  resolveCwd;
  resolveSessionId;
  /** sessionId → running accumulation. */
  sessions = /* @__PURE__ */ new Map();
  /** agentId → its sessionIds (lets getAgentUsage aggregate across --resume). */
  agentSessions = /* @__PURE__ */ new Map();
  /** agentId → ring buffer of recent tool spans. */
  spans = /* @__PURE__ */ new Map();
  /** Push subscribers (Lane A breaker + dashboard). */
  usageSubs = /* @__PURE__ */ new Set();
  /** api_error subscribers — feeds Lane A's breaker error-storm trip (#6), which
   *  has no input source of its own (hook payloads don't expose api errors). */
  apiErrorSubs = /* @__PURE__ */ new Set();
  constructor(opts = {}) {
    this.host = opts.host ?? "127.0.0.1";
    this.port = opts.port ?? 0;
    this.emit = opts.emit;
    this.resolveCwd = opts.resolveCwd;
    this.resolveSessionId = opts.resolveSessionId;
  }
  /** Bind the loopback OTLP listener. The handler is live the instant this
   *  resolves; `endpoint()` then returns the URL to inject into agent env. */
  async start() {
    if (this.server) return { ok: true, endpoint: this.endpoint() ?? void 0 };
    try {
      await this.listen();
      return { ok: true, endpoint: this.endpoint() ?? void 0 };
    } catch (e) {
      this.stop();
      return { ok: false, error: errMsg4(e) };
    }
  }
  /** Close the listener. Idempotent and best-effort. Accumulated state is kept
   *  (it's ephemeral anyway) so a restart doesn't lose live agents' totals. */
  stop() {
    try {
      this.server?.close();
    } catch {
    }
    this.server = null;
    this.boundPort = null;
  }
  /** The bound loopback URL agents export to, or null until started. */
  endpoint() {
    return this.boundPort ? `http://${this.host}:${this.boundPort}` : null;
  }
  // ─── The locked provider seam ──────────────────────────────────────────────
  /** Pull (contract primary). OTel-live aggregate preferred; transcript fallback
   *  when an agent has no live telemetry yet (e.g. spawned before the feature, or
   *  telemetry off). Returns null only when neither source has anything. */
  getAgentUsage(agentId) {
    const live = this.aggregateLive(agentId);
    if (live) return live;
    return this.transcriptFallback(agentId);
  }
  /** Push (additive, OTel-only). Fires the agent's fresh aggregate whenever new
   *  telemetry lands. Returns an unsubscribe fn. */
  onAgentUsage(cb) {
    this.usageSubs.add(cb);
    return () => this.usageSubs.delete(cb);
  }
  /** In-process api_error feed for Lane A's breaker (#6). At integration:
   *  `telemetry.onApiError((agentId) => breaker.recordError(agentId))`. Returns
   *  an unsubscribe fn. */
  onApiError(cb) {
    this.apiErrorSubs.add(cb);
    return () => this.apiErrorSubs.delete(cb);
  }
  /** Drop an agent's live usage so a respawn starts with a fresh counter.
   *  Clears the in-memory accumulation only — the on-disk cost ledger and the
   *  transcript fallback are untouched, so lifetime spending still reports. The
   *  span ring goes too: it is keyed by agent id, so a replacement would
   *  otherwise inherit the dead agent's tool waterfall.
   *
   *  Known edge: metrics are delivered asynchronously, so a batch already in
   *  flight when the PTY dies can land after this call and recreate the dead
   *  session's entries. The window is milliseconds and the next teardown
   *  clears it, so it is left unguarded rather than carrying a tombstone. */
  forgetAgent(agentId) {
    const sessionIds = this.agentSessions.get(agentId);
    if (sessionIds) {
      for (const sessionId of sessionIds) this.sessions.delete(sessionId);
    }
    this.agentSessions.delete(agentId);
    this.spans.delete(agentId);
  }
  /** Recent tool spans for the per-agent waterfall (#7B.2), oldest→newest. */
  getSpans(agentId) {
    return this.spans.get(agentId)?.slice() ?? [];
  }
  /** Everything the renderer needs on cold start (it missed the live pushes). */
  snapshot() {
    const usage = [];
    for (const agentId of this.agentSessions.keys()) {
      const s = this.aggregateLive(agentId);
      if (s) usage.push(s);
    }
    const spans = {};
    for (const [agentId, ring] of this.spans) spans[agentId] = ring.slice();
    return { usage, spans };
  }
  // ─── HTTP plumbing (mirrors slack.ts) ──────────────────────────────────────
  listen() {
    return new Promise((resolve4, reject) => {
      const server = (0, import_node_http3.createServer)((req, res) => this.handleRequest(req, res));
      const onError = (e) => reject(e);
      server.once("error", onError);
      server.listen(this.port, this.host, () => {
        server.off("error", onError);
        const addr = server.address();
        this.boundPort = addr && typeof addr === "object" ? addr.port : null;
        this.server = server;
        resolve4();
      });
    });
  }
  handleRequest(req, res) {
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return;
    }
    const chunks = [];
    let size = 0;
    let aborted = false;
    req.on("data", (c) => {
      if (aborted) return;
      size += c.length;
      if (size > MAX_BODY_BYTES3) {
        aborted = true;
        res.writeHead(413);
        res.end();
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (aborted) return;
      const url = req.url ?? "";
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (url.includes("/v1/metrics")) this.ingestMetrics(body);
        else if (url.includes("/v1/logs")) this.ingestLogs(body);
      } catch {
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
    req.on("error", () => {
      if (aborted) return;
      try {
        res.writeHead(400);
        res.end();
      } catch {
      }
    });
  }
  // ─── OTLP decode → normalize → accumulate ──────────────────────────────────
  ingestMetrics(body) {
    const root = body;
    if (!Array.isArray(root?.resourceMetrics)) return;
    const touched = /* @__PURE__ */ new Set();
    for (const rm of root.resourceMetrics) {
      const resAttrs = flattenAttrs(rm.resource?.attributes);
      for (const sm of rm.scopeMetrics ?? []) {
        for (const metric of sm.metrics ?? []) {
          const points = metric.sum?.dataPoints ?? metric.gauge?.dataPoints ?? [];
          for (const dp of points) {
            const attrs = flattenAttrs(dp.attributes);
            const agentId = str2(attrs["agent.id"]) || str2(resAttrs["agent.id"]);
            const sessionId = str2(attrs["session.id"]);
            if (!agentId || !sessionId) continue;
            const accum = this.session(agentId, sessionId);
            const model = normalizeModel(str2(attrs["model"]));
            if (model) accum.model = model;
            accum.ts = Date.now();
            const value = pointValue(dp);
            if (metric.name === "claude_code.token.usage") {
              switch (str2(attrs["type"])) {
                case "input":
                  accum.input += value;
                  break;
                case "output":
                  accum.output += value;
                  break;
                case "cacheRead":
                  accum.cacheRead += value;
                  break;
                case "cacheCreation":
                  accum.cacheCreation += value;
                  break;
              }
              touched.add(agentId);
            } else if (metric.name === "claude_code.cost.usage") {
              accum.usd += value;
              touched.add(agentId);
            }
          }
        }
      }
    }
    for (const agentId of touched) this.publishUsage(agentId);
  }
  ingestLogs(body) {
    const root = body;
    if (!Array.isArray(root?.resourceLogs)) return;
    for (const rl of root.resourceLogs) {
      const resAttrs = flattenAttrs(rl.resource?.attributes);
      for (const sl of rl.scopeLogs ?? []) {
        for (const lr of sl.logRecords ?? []) {
          const attrs = flattenAttrs(lr.attributes);
          const name = str2(attrs["event.name"]) || str2(lr.body?.stringValue);
          const agentId = str2(attrs["agent.id"]) || str2(resAttrs["agent.id"]);
          const sessionId = str2(attrs["session.id"]);
          if (!agentId) continue;
          if (name === "tool_result") {
            const span = {
              agentId,
              sessionId,
              ts: Date.now(),
              tool: str2(attrs["tool_name"]) || "tool",
              success: truthy(attrs["success"]),
              durationMs: numAttr(attrs["duration_ms"]),
              decision: void 0
            };
            this.pushSpan(span);
            this.emit?.("telemetry:event", { kind: "tool_result", span });
          } else if (name === "tool_decision") {
            const decision = str2(attrs["decision"]) === "reject" ? "reject" : "accept";
            const ring = this.spans.get(agentId);
            if (ring?.length) ring[ring.length - 1].decision = decision;
          } else if (name === "api_error" || name && name.includes("error")) {
            const error = str2(attrs["error"]) || str2(attrs["message"]) || name;
            for (const cb of this.apiErrorSubs) {
              try {
                cb(agentId);
              } catch {
              }
            }
            this.emit?.("telemetry:event", { kind: "api_error", agentId, sessionId, ts: Date.now(), error });
          }
        }
      }
    }
  }
  // ─── Accumulation helpers ──────────────────────────────────────────────────
  session(agentId, sessionId) {
    let accum = this.sessions.get(sessionId);
    if (!accum) {
      accum = { agentId, model: "", ts: Date.now(), input: 0, output: 0, cacheRead: 0, cacheCreation: 0, usd: 0 };
      this.sessions.set(sessionId, accum);
    }
    let set = this.agentSessions.get(agentId);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.agentSessions.set(agentId, set);
    }
    set.add(sessionId);
    return accum;
  }
  pushSpan(span) {
    let ring = this.spans.get(span.agentId);
    if (!ring) {
      ring = [];
      this.spans.set(span.agentId, ring);
    }
    ring.push(span);
    if (ring.length > SPAN_RING_CAP) ring.splice(0, ring.length - SPAN_RING_CAP);
  }
  /** Sum an agent's live sessions into one cumulative sample (sessionId/model =
   *  the most recently active session). Null if the agent has no live data. */
  aggregateLive(agentId) {
    const set = this.agentSessions.get(agentId);
    if (!set || set.size === 0) return null;
    const out = {
      agentId,
      sessionId: "",
      ts: 0,
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheCreation: 0,
      model: "",
      usd: 0
    };
    for (const sid of set) {
      const a = this.sessions.get(sid);
      if (!a) continue;
      out.input += a.input;
      out.output += a.output;
      out.cacheRead += a.cacheRead;
      out.cacheCreation += a.cacheCreation;
      out.usd += a.usd;
      if (a.ts >= out.ts) {
        out.ts = a.ts;
        out.sessionId = sid;
        out.model = a.model;
      }
    }
    return out;
  }
  /** D11: a cwd is routinely SHARED — every hive worker spawned against the same
   *  repo (isolation is best-effort and several call sites deliberately skip it)
   *  lands in the same `~/.claude/projects/<key>/` directory as every other
   *  agent that ever ran there, this app-run or a past one. Without a session
   *  filter, `readAgentUsage` sums ALL of it — confirmed live: a probe worker
   *  with zero LLM calls was reaped citing 143,369,766 tokens, which was in fact
   *  the shared project directory's entire history across other agents'
   *  sessions, not its own. So this fallback now filters to the agent's OWN
   *  current session id and, when that id isn't known yet (nothing has hooked
   *  in for this agent this run — the true zero-usage case for a just-spawned
   *  agent), reports "no data" rather than someone else's history. `sessionId`
   *  stays '' on the returned sample regardless — deliberately, so it keeps
   *  reading as "no live session" to the #56 cost-ledger dedup gate in
   *  index.ts (`if (sample?.sessionId) appendCostLedger(...)`); the resolved id
   *  is used only to filter the read, never surfaced as if it were live OTel. */
  transcriptFallback(agentId) {
    const cwd = this.resolveCwd?.(agentId);
    if (!cwd) return null;
    const sessionId = this.resolveSessionId?.(agentId);
    if (!sessionId) return null;
    const u = readAgentUsage(cwd, { sessionId });
    if (!u.inputTokens && !u.outputTokens && !u.cacheReadTokens && !u.cacheWriteTokens) return null;
    return {
      agentId,
      sessionId: "",
      ts: Date.now(),
      input: u.inputTokens,
      output: u.outputTokens,
      cacheRead: u.cacheReadTokens,
      cacheCreation: u.cacheWriteTokens,
      model: u.model ?? "",
      usd: u.estimatedCostUsd
    };
  }
  publishUsage(agentId) {
    const sample = this.aggregateLive(agentId);
    if (!sample) return;
    for (const cb of this.usageSubs) {
      try {
        cb(sample);
      } catch {
      }
    }
    this.emit?.("telemetry:event", { kind: "usage", sample });
  }
};
var ATTR_ALLOWLIST = /* @__PURE__ */ new Set([
  "agent.id",
  "agent.name",
  "session.id",
  "model",
  "type",
  "tool_name",
  "success",
  "duration_ms",
  "decision",
  "event.name",
  "error",
  "message"
]);
function flattenAttrs(attrs) {
  const out = {};
  if (!Array.isArray(attrs)) return out;
  for (const kv of attrs) {
    if (!kv?.key || !ATTR_ALLOWLIST.has(kv.key)) continue;
    const v = kv.value;
    if (!v) continue;
    if (typeof v.stringValue === "string") out[kv.key] = v.stringValue;
    else if (v.intValue !== void 0) out[kv.key] = Number(v.intValue);
    else if (typeof v.doubleValue === "number") out[kv.key] = v.doubleValue;
    else if (typeof v.boolValue === "boolean") out[kv.key] = v.boolValue;
  }
  return out;
}
function pointValue(dp) {
  if (dp.asInt !== void 0) return Number(dp.asInt) || 0;
  if (typeof dp.asDouble === "number") return dp.asDouble;
  return 0;
}
function str2(v) {
  return typeof v === "string" ? v : v === void 0 || v === null ? "" : String(v);
}
function numAttr(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function truthy(v) {
  return v === true || v === "true" || v === 1 || v === "1";
}
function errMsg4(e) {
  return e instanceof Error ? e.message : String(e);
}

// cth/main/costLifetime.ts
var import_fs6 = require("fs");
var EPS = 1e-9;
var MAX_BYTES_PER_PASS = 8 * 1024 * 1024;
var CostLedgerTotals = class {
  /** Bytes of the ledger already folded. */
  offset = 0;
  /** Trailing partial line, kept as BYTES so a multi-byte character split
   *  across a read boundary is never decoded in half. */
  tail = Buffer.alloc(0);
  /** `agentId \t sessionId` → fold state. */
  seg = /* @__PURE__ */ new Map();
  /** agentId → lifetime usd. Recomputed after each pass. */
  totals = /* @__PURE__ */ new Map();
  /** One pass at a time; a timer must never stack folds on itself. */
  folding = false;
  /** True once a full pass has completed, so callers can tell "no spend" from
   *  "not read yet" instead of reporting a confident $0. */
  warm = false;
  /** Lifetime usd for one agent, or null when the ledger has not been folded
   *  yet. Null rather than 0 so a caller never publishes a cold zero as fact. */
  usdFor(agentId) {
    if (!this.warm) return null;
    return this.totals.get(agentId) ?? 0;
  }
  /** Every agent's lifetime usd. Empty until the first pass completes. */
  all() {
    return new Map(this.totals);
  }
  /** Has at least one full pass completed? */
  get ready() {
    return this.warm;
  }
  /** True lifetime spend across every agent in the ledger. */
  floorTotal() {
    let t = 0;
    for (const v of this.totals.values()) t += v;
    return t;
  }
  /**
   * Fold whatever has been appended since the last pass. Returns immediately;
   * the work happens off the caller's stack. Safe to call from a timer and
   * never throws (a ledger we cannot read just leaves the last good totals in
   * place, same contract as the other best-effort writers here).
   */
  refresh(ledgerPath) {
    if (this.folding) return Promise.resolve();
    this.folding = true;
    return this.fold(ledgerPath).catch(() => {
    }).finally(() => {
      this.folding = false;
    });
  }
  /** Fold repeatedly until caught up to EOF. Convenience for callers that want
   *  the number now rather than over the next few timer ticks. */
  async refreshFully(ledgerPath) {
    for (let i = 0; i < 4096; i++) {
      await this.refresh(ledgerPath);
      if (this.warm) return;
    }
  }
  async fold(ledgerPath) {
    let size;
    try {
      size = (0, import_fs6.statSync)(ledgerPath).size;
    } catch {
      return;
    }
    if (size < this.offset) this.reset();
    if (size === this.offset) {
      this.warm = true;
      return;
    }
    const end = Math.min(size, this.offset + MAX_BYTES_PER_PASS) - 1;
    const from = this.offset;
    await new Promise((resolve4, reject) => {
      const stream = (0, import_fs6.createReadStream)(ledgerPath, { start: from, end });
      stream.on("data", (chunk) => {
        const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        this.consume(buf);
      });
      stream.on("error", reject);
      stream.on("end", () => resolve4());
    });
    this.offset = end + 1;
    this.recompute();
    if (this.offset >= size) this.warm = true;
  }
  /** Fold one buffer, holding back any incomplete trailing line. */
  consume(chunk) {
    const buf = this.tail.length ? Buffer.concat([this.tail, chunk]) : chunk;
    const cut = buf.lastIndexOf(10);
    if (cut === -1) {
      this.tail = buf;
      return;
    }
    this.tail = buf.subarray(cut + 1);
    for (const line of buf.subarray(0, cut).toString("utf8").split("\n")) {
      if (line) this.foldLine(line);
    }
  }
  foldLine(line) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      return;
    }
    if (!row || typeof row.agent_id !== "string") return;
    const usd = typeof row.usd === "number" && Number.isFinite(row.usd) ? row.usd : 0;
    const key = `${row.agent_id}	${row.session_id ?? ""}`;
    let s = this.seg.get(key);
    if (!s) {
      s = { committed: 0, peak: 0 };
      this.seg.set(key, s);
    }
    if (usd < s.peak - EPS) {
      s.committed += s.peak;
      s.peak = usd;
    } else if (usd > s.peak) {
      s.peak = usd;
    }
  }
  recompute() {
    const next = /* @__PURE__ */ new Map();
    for (const [key, s] of this.seg) {
      const agentId = key.slice(0, key.indexOf("	"));
      next.set(agentId, (next.get(agentId) ?? 0) + s.committed + s.peak);
    }
    this.totals = next;
  }
  reset() {
    this.offset = 0;
    this.tail = Buffer.alloc(0);
    this.seg.clear();
    this.totals = /* @__PURE__ */ new Map();
    this.warm = false;
  }
};

// cth/main/analytics.ts
var import_node_fs14 = require("node:fs");
var import_node_path14 = require("node:path");
var import_node_crypto5 = require("node:crypto");
var import_posthog_node = require("posthog-node");
var EVENTS = {
  /** Once per install, when the install id is first minted. */
  first_run: /* @__PURE__ */ new Set(),
  /** Every app start. The DAU/retention backbone. */
  app_launched: /* @__PURE__ */ new Set(),
  /** Once per version change, on the first run after the version moved. Both
   *  values are version strings of the same shape as the `app_version` every
   *  event already carries; `from_version` is `unknown` for an install that
   *  predates version stamping (i.e. anything upgrading INTO the first release
   *  that ships this event). `via` is a fixed three-value enum saying whether
   *  OUR updater moved the version or something else did. */
  update_applied: /* @__PURE__ */ new Set(["from_version", "to_version", "via"]),
  /** An agent PTY spawned. `provider` is the CLI engine name only. */
  agent_spawned: /* @__PURE__ */ new Set(["provider"]),
  /** ── The activation funnel (v0.4.6): app_launched → onboarding_completed →
   *  agent_spawn_attempted → {agent_spawned | agent_spawn_failed |
   *  agent_install_started → agent_install_finished}. Every added property is a
   *  closed enum or a closed CLI name — nothing free-form, same allowlist rule. */
  /** Onboarding wizard finished (the install crossed onboardingComplete
   *  false→true). `provider` is the engine chosen, a closed CLI name. The top of
   *  the funnel: what share of installs finish setup, and which engine they pick. */
  onboarding_completed: /* @__PURE__ */ new Set(["provider"]),
  /** A spawn was REQUESTED — every path through spawnAgentCore. Mirrors
   *  agent_spawned; (attempted − spawned) is the activation fallout. */
  agent_spawn_attempted: /* @__PURE__ */ new Set(["provider"]),
  /** A spawn did NOT produce a running agent. `reason` is a fixed enum (see
   *  SpawnFailReason): `cli_missing` (engine absent and no auto-installer, manual
   *  only), `cwd_missing`, `already_running`, `spawn_error`. */
  agent_spawn_failed: /* @__PURE__ */ new Set(["provider", "reason"]),
  /** The engine CLI was absent, so the auto-installer PTY started. `rung` is a
   *  fixed enum (see InstallRung): `npm`, `node-then-npm`, `native`. */
  agent_install_started: /* @__PURE__ */ new Set(["provider", "rung"]),
  /** The auto-installer PTY exited. `outcome` is a fixed enum (see
   *  InstallOutcome): `agent_launched` (clean exit, the agent is relaunching) or
   *  `install_failed` (non-zero exit — e.g. an installer that cannot complete
   *  unattended). This is the signal that a first agent never actually started. */
  agent_install_finished: /* @__PURE__ */ new Set(["provider", "rung", "outcome"]),
  /** ── The end of the activation funnel (v0.4.6): a HUMAN sent a message to an
   *  agent. Counted at the SUBMIT boundary, never per keystroke — see
   *  MESSAGE_SURFACES for the four places a person can send one. Carries a COUNT
   *  and nothing else: no text, no length, no hash. `surface` is a closed enum. */
  message_sent: /* @__PURE__ */ new Set(["surface"]),
  /** Coarse feature adoption; `feature` is a fixed enum (see FEATURES), fired
   *  at most once per feature per app session. */
  feature_used: /* @__PURE__ */ new Set(["feature"]),
  /** Fired on quit. `duration_bucket` is a coarse label, never raw ms. */
  session_ended: /* @__PURE__ */ new Set(["duration_bucket"])
};
var MESSAGE_SURFACES = ["terminal", "composer", "steer", "hive"];
var RENDERER_MESSAGE_SURFACES = /* @__PURE__ */ new Set(["terminal", "composer"]);
function isRendererMessageSurface(v) {
  return typeof v === "string" && RENDERER_MESSAGE_SURFACES.has(v);
}
function dntSet() {
  const v = process.env.DO_NOT_TRACK;
  return v !== void 0 && v !== "" && v !== "0";
}
var Analytics = class {
  client = null;
  distinctId = "";
  enabled = false;
  firstRun = false;
  /** False when the state dir was unwritable and loadOrMintInstallId fell back
   *  to an ephemeral id. Such an install cannot be recognised across boots, so
   *  it must never report a version transition — it would report one on EVERY
   *  boot and inflate the exact number update_applied exists to produce. */
  idPersisted = false;
  startedAt = 0;
  sessionEnded = false;
  /** Session-scoped dedup for feature_used. */
  featuresSeen = /* @__PURE__ */ new Set();
  common = {};
  /** Boot the client (no-op without a build-time key / with DNT set). Returns
   *  whether this boot minted a fresh install id (first run ever). */
  init(opts) {
    this.enabled = opts.enabled;
    this.startedAt = Date.now();
    this.common = {
      app_version: opts.appVersion,
      os: process.platform,
      arch: process.arch
    };
    if (true) return;
    try {
      this.distinctId = this.loadOrMintInstallId(opts.stateDir);
      this.client = new import_posthog_node.PostHog("", {
        host: "https://us.i.posthog.com",
        // Events are rare (a handful per session) — send immediately so quit
        // loses at most the final session_ended, never a whole batch.
        flushAt: 1,
        flushInterval: 1e4,
        // GeoIP stays OFF (posthog-node default). It was explicitly re-enabled
        // here for country-level numbers, but nothing in this codebase ever read
        // a country, and enabling it made PostHog derive city, postal code and
        // lat/long as well — far past the country TELEMETRY.md describes.
        disableGeoip: true
      });
    } catch (e) {
      console.error("[analytics] init failed (telemetry disabled):", e);
      this.client = null;
      return;
    }
    let transition = null;
    if (this.idPersisted) {
      const previous = readVersionStamp(opts.stateDir);
      transition = updateTransition(previous, opts.appVersion, this.firstRun);
      if (previous !== opts.appVersion) writeVersionStamp(opts.stateDir, opts.appVersion);
    }
    if (this.firstRun) this.track("first_run");
    if (transition) {
      const via = updateVia(readUpdaterLogTail(opts.stateDir), transition.to_version);
      this.track("update_applied", { ...transition, via });
    }
    this.track("app_launched");
  }
  /** Live opt-in/out from Settings. Turning off stops sends instantly; nothing
   *  needs recreating to turn back on. */
  setEnabled(on) {
    this.enabled = on;
  }
  /** Capture one allowlisted event. Silently drops anything not in EVENTS. */
  track(event, props = {}) {
    if (!this.client || !this.enabled || dntSet() || this.sessionEnded) return;
    const allowed = EVENTS[event];
    if (!allowed) return;
    const properties = {
      ...this.common,
      $process_person_profile: false,
      // anonymous event — no person profile
      // PostHog fills $ip from the connection ONLY when the event does not
      // carry one, so sending it explicitly as null is the one client-side way
      // to stop the IP being stored. Belt and braces with the project-level
      // discard setting: this alone protects every event we send from here.
      $ip: null
    };
    for (const [k, v] of Object.entries(props)) {
      if (allowed.has(k) && typeof v === "string") properties[k] = v;
    }
    try {
      this.client.capture({ distinctId: this.distinctId, event, properties });
    } catch (e) {
      console.error("[analytics] capture failed:", e);
    }
  }
  /** One human-sent message. NOT deduped — unlike trackFeature this IS a usage
   *  meter, and the count is the whole point. Re-checks the enum at runtime
   *  because the `terminal`/`composer` surfaces originate in the renderer. */
  trackMessageSent(surface) {
    if (!MESSAGE_SURFACES.includes(surface)) return;
    this.track("message_sent", { surface });
  }
  /** feature_used with per-session dedup (adoption signal, not a usage meter). */
  trackFeature(feature) {
    if (this.featuresSeen.has(feature)) return;
    this.featuresSeen.add(feature);
    this.track("feature_used", { feature });
  }
  /** Fire session_ended and flush. Bounded by the caller (will-quit races this
   *  against a timeout) — never assume it completes. Idempotent. */
  async endSession() {
    if (!this.client || this.sessionEnded) return;
    this.track("session_ended", { duration_bucket: durationBucket(Date.now() - this.startedAt) });
    this.sessionEnded = true;
    try {
      await this.client.shutdown();
    } catch (e) {
      console.error("[analytics] shutdown flush failed:", e);
    }
    this.client = null;
  }
  loadOrMintInstallId(stateDir) {
    const file = (0, import_node_path14.join)(stateDir, "telemetry-install-id");
    try {
      if ((0, import_node_fs14.existsSync)(file)) {
        const id2 = (0, import_node_fs14.readFileSync)(file, "utf8").trim();
        if (id2) {
          this.idPersisted = true;
          return id2;
        }
      }
      const id = (0, import_node_crypto5.randomUUID)();
      (0, import_node_fs14.mkdirSync)(stateDir, { recursive: true });
      (0, import_node_fs14.writeFileSync)(file, id + "\n", "utf8");
      this.firstRun = true;
      this.idPersisted = true;
      return id;
    } catch (e) {
      console.error("[analytics] install-id persist failed (ephemeral id):", e);
      return (0, import_node_crypto5.randomUUID)();
    }
  }
};
var VERSION_STAMP_FILE = "telemetry-last-version";
var VERSION_RE = /^[0-9]{1,6}\.[0-9]{1,6}\.[0-9]{1,6}(?:-[0-9A-Za-z.]{1,32})?$/;
function updateTransition(previous, current, firstRun) {
  if (firstRun) return null;
  if (!VERSION_RE.test(current)) return null;
  if (previous === current) return null;
  return {
    from_version: previous && VERSION_RE.test(previous) ? previous : "unknown",
    to_version: current
  };
}
function readVersionStamp(stateDir) {
  try {
    const file = (0, import_node_path14.join)(stateDir, VERSION_STAMP_FILE);
    if (!(0, import_node_fs14.existsSync)(file)) return null;
    return (0, import_node_fs14.readFileSync)(file, "utf8").trim() || null;
  } catch {
    return null;
  }
}
function writeVersionStamp(stateDir, version) {
  try {
    (0, import_node_fs14.mkdirSync)(stateDir, { recursive: true });
    (0, import_node_fs14.writeFileSync)((0, import_node_path14.join)(stateDir, VERSION_STAMP_FILE), version + "\n", "utf8");
  } catch (e) {
    console.error("[analytics] version stamp persist failed:", e);
  }
}
var LOG_FILE = "updater.log";
var LOG_DOWNLOADED = "update downloaded: ";
var LOG_QUIT_REQUESTED = "quitAndInstall requested by the user";
var LOG_QUIT_FAILED = "quitAndInstall failed:";
var LOG_READY = /native updater ready \(current v([^)\s]+)\)/;
var LOG_QUIT_CANCELLED = "quitAndInstall cancelled by the user at the quit warning";
var LOG_TAIL_BYTES = 128 * 1024;
function updateVia(logText, toVersion) {
  if (logText === null) return "unknown";
  const lines = logText.split("\n");
  const downloaded = new RegExp(
    `${LOG_DOWNLOADED}${toVersion.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}(?![0-9.\\-])`
  );
  let i = -1;
  for (let n = 0; n < lines.length; n++) if (downloaded.test(lines[n])) i = n;
  if (i < 0) return "manual";
  let j = -1;
  for (let n = i + 1; n < lines.length; n++) if (lines[n].includes(LOG_QUIT_REQUESTED)) j = n;
  if (j < 0) return "manual";
  if (lines[j + 1]?.includes(LOG_QUIT_FAILED)) return "manual";
  for (let n = j + 1; n < lines.length; n++) {
    if (lines[n].includes(LOG_QUIT_CANCELLED)) return "manual";
    const launched = LOG_READY.exec(lines[n]);
    if (launched && launched[1] !== toVersion) return "manual";
  }
  return "auto";
}
function readUpdaterLogTail(stateDir) {
  let fd = null;
  try {
    const file = (0, import_node_path14.join)(stateDir, LOG_FILE);
    if (!(0, import_node_fs14.existsSync)(file)) return null;
    fd = (0, import_node_fs14.openSync)(file, "r");
    const size = (0, import_node_fs14.fstatSync)(fd).size;
    if (size === 0) return null;
    const length = Math.min(size, LOG_TAIL_BYTES);
    const buf = Buffer.allocUnsafe(length);
    (0, import_node_fs14.readSync)(fd, buf, 0, length, size - length);
    return buf.toString("utf8");
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try {
        (0, import_node_fs14.closeSync)(fd);
      } catch {
      }
    }
  }
}
function durationBucket(ms) {
  const m = ms / 6e4;
  if (m < 5) return "<5m";
  if (m < 30) return "5-30m";
  if (m < 120) return "30m-2h";
  if (m < 480) return "2-8h";
  return "8h+";
}
var analytics = new Analytics();

// cth/main/integrationBroker.ts
var import_node_http4 = require("node:http");
var import_node_crypto6 = require("node:crypto");
var import_node_stream = require("node:stream");
var MAX_BODY_BYTES4 = 10 * 1024 * 1024;
var UPSTREAM_TIMEOUT_MS = 3e4;
var DEFAULT_USER_AGENT = "munder-difflin-broker/1";
var HOP_BY_HOP = /* @__PURE__ */ new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);
var STRIP_REQUEST = /* @__PURE__ */ new Set([
  "authorization",
  "x-md-broker-token",
  "host",
  "cookie",
  "content-length",
  ...HOP_BY_HOP
]);
var STRIP_RESPONSE = /* @__PURE__ */ new Set([
  "content-encoding",
  "content-length",
  "set-cookie",
  ...HOP_BY_HOP
]);
function isLoopback2(addr) {
  const a = addr.replace(/^::ffff:/, "");
  return a === "::1" || a.startsWith("127.");
}
var IntegrationBroker = class _IntegrationBroker {
  server = null;
  port = 0;
  deps;
  /** token -> capability. In-memory only; NEVER persisted. */
  byToken = /* @__PURE__ */ new Map();
  /** workerId -> token, for revoke. */
  byWorker = /* @__PURE__ */ new Map();
  constructor(deps) {
    this.deps = deps;
  }
  /** Bind a loopback port (0 ⇒ OS-assigned). Resolves the bound port. */
  start(preferredPort = 0) {
    return new Promise((resolve4) => {
      if (this.server) {
        resolve4({ ok: true, port: this.port });
        return;
      }
      const server = (0, import_node_http4.createServer)((req, res) => this.handle(req, res));
      const onError = (e) => {
        server.off("listening", onListening);
        resolve4({ ok: false, error: e.message });
      };
      const onListening = () => {
        server.off("error", onError);
        this.server = server;
        const addr = server.address();
        this.port = addr && typeof addr === "object" ? addr.port : preferredPort;
        resolve4({ ok: true, port: this.port });
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(preferredPort, "127.0.0.1");
    });
  }
  /** Close the broker. Idempotent and best-effort. Clears all capabilities. */
  stop() {
    try {
      this.server?.close();
    } catch {
    }
    this.server = null;
    this.port = 0;
    this.byToken.clear();
    this.byWorker.clear();
  }
  /** Whether the broker is bound and serving. */
  running() {
    return !!this.server && this.port > 0;
  }
  /** The base URL workers use (only valid while running). */
  url() {
    return `http://127.0.0.1:${this.port}`;
  }
  /** Mint a per-worker capability token granting access to `allowedIds`. Any prior
   *  token for this worker is revoked first. The token is a random handle — never a
   *  secret, never persisted. */
  grant(workerId, allowedIds) {
    this.revoke(workerId);
    const token = (0, import_node_crypto6.randomBytes)(32).toString("base64url");
    this.byToken.set(token, { workerId, allowedIds: new Set(allowedIds), grantedAt: Date.now() });
    this.byWorker.set(workerId, token);
    return token;
  }
  /** Revoke a worker's capability (called on teardown). Idempotent. */
  revoke(workerId) {
    const token = this.byWorker.get(workerId);
    if (token) {
      this.byToken.delete(token);
      this.byWorker.delete(workerId);
    }
  }
  /** Constant-time-ish lookup of a presented token against live capabilities. */
  resolveCapability(provided) {
    if (!provided) return void 0;
    const a = Buffer.from(provided);
    for (const [token, cap] of this.byToken) {
      const b = Buffer.from(token);
      if (a.length === b.length && (0, import_node_crypto6.timingSafeEqual)(a, b)) return cap;
    }
    return void 0;
  }
  static sendError(res, status, code, message) {
    if (res.headersSent) {
      try {
        res.end();
      } catch {
      }
      return;
    }
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: message, code }));
  }
  /** Extract the bearer/x-md-broker-token from the request. */
  static tokenFrom(req) {
    const x = req.headers["x-md-broker-token"];
    if (typeof x === "string" && x) return x;
    const auth = req.headers["authorization"];
    if (typeof auth === "string") {
      const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
      if (m) return m[1].trim();
    }
    return void 0;
  }
  handle(req, res) {
    if (!isLoopback2(req.socket.remoteAddress ?? "")) {
      return _IntegrationBroker.sendError(res, 403, "forbidden", "loopback callers only");
    }
    const cap = this.resolveCapability(_IntegrationBroker.tokenFrom(req));
    if (!cap) return _IntegrationBroker.sendError(res, 401, "unauthorized", "missing or invalid capability token");
    const rawUrl = req.url ?? "";
    const m = /^\/i\/([^/?#]+)(?:\/([^?#]*))?(\?[^#]*)?$/.exec(rawUrl);
    if (!m) return _IntegrationBroker.sendError(res, 404, "not_found", "expected /i/<integrationId>/<path>");
    const integrationId = decodeURIComponent(m[1]);
    const path3 = m[2] ?? "";
    const query = m[3] ?? "";
    if (!cap.allowedIds.has(integrationId)) {
      return _IntegrationBroker.sendError(res, 403, "forbidden", "integration not in this worker capability");
    }
    const rec = this.deps.getRecord(integrationId);
    if (!rec) return _IntegrationBroker.sendError(res, 404, "not_found", "unknown integration");
    if (!rec.enabled) return _IntegrationBroker.sendError(res, 403, "forbidden", "integration is disabled");
    const upstream = resolveUpstreamUrl(rec.baseUrl, path3 + query);
    if (!upstream) return _IntegrationBroker.sendError(res, 400, "bad_request", "invalid or out-of-bounds path");
    let secret;
    if (authTypeNeedsSecret(rec.authType)) {
      secret = this.deps.getSecret(rec.secretRef);
      if (!secret) return _IntegrationBroker.sendError(res, 503, "no_secret", "no secret configured for this integration");
    }
    void this.forward(req, res, rec, upstream, secret);
  }
  async forward(req, res, rec, upstream, secret) {
    const method = (req.method ?? "GET").toUpperCase();
    const hasBody = method !== "GET" && method !== "HEAD";
    let body;
    if (hasBody) {
      try {
        body = await readBodyCapped(req);
      } catch (e) {
        if (e.message === "too_large") {
          return _IntegrationBroker.sendError(res, 413, "payload_too_large", "request body too large");
        }
        return _IntegrationBroker.sendError(res, 400, "bad_request", "could not read request body");
      }
    }
    const outHeaders = {};
    for (const [k, v] of Object.entries(req.headers)) {
      const key = k.toLowerCase();
      if (STRIP_REQUEST.has(key)) continue;
      if (Array.isArray(v)) outHeaders[key] = v.join(", ");
      else if (typeof v === "string") outHeaders[key] = v;
    }
    if (!outHeaders["user-agent"]) outHeaders["user-agent"] = DEFAULT_USER_AGENT;
    const injected = buildAuthHeaders(rec.authType, rec.authHeader, secret);
    for (const [k, v] of Object.entries(injected)) {
      delete outHeaders[k];
      outHeaders[k] = v;
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), UPSTREAM_TIMEOUT_MS);
    let upstreamRes;
    try {
      upstreamRes = await fetch(upstream, {
        method,
        headers: outHeaders,
        body,
        redirect: "manual",
        signal: ac.signal
      });
    } catch (e) {
      clearTimeout(timer);
      return _IntegrationBroker.sendError(res, 502, "bad_gateway", `upstream request failed: ${e.message}`);
    }
    const respHeaders = {};
    upstreamRes.headers.forEach((value, key) => {
      if (!STRIP_RESPONSE.has(key.toLowerCase())) respHeaders[key] = value;
    });
    res.writeHead(upstreamRes.status, respHeaders);
    try {
      if (upstreamRes.body) {
        await pipeWebStream(upstreamRes.body, res);
      } else {
        res.end();
      }
    } catch {
      try {
        res.end();
      } catch {
      }
    } finally {
      clearTimeout(timer);
    }
  }
};
function readBodyCapped(req) {
  return new Promise((resolve4, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES4) {
        reject(new Error("too_large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve4(Buffer.concat(chunks)));
    req.on("error", (e) => reject(e));
  });
}
function pipeWebStream(web, res) {
  return new Promise((resolve4, reject) => {
    const node = import_node_stream.Readable.fromWeb(web);
    node.on("error", reject);
    res.on("error", reject);
    res.on("finish", resolve4);
    node.pipe(res);
  });
}

// cth/main/roster.ts
var import_node_fs15 = require("node:fs");
var import_node_path15 = require("node:path");
function rosterPath(home) {
  return (0, import_node_path15.join)(home, "roster.json");
}
function rosterBackupDir(home) {
  return (0, import_node_path15.join)(home, "roster-backups");
}
function isSnapshot(v) {
  if (!v || typeof v !== "object") return false;
  const s = v;
  return Array.isArray(s.agents) && Array.isArray(s.archived) && Array.isArray(s.restorable);
}
function entryCount(s) {
  return s.agents.length + s.archived.length + s.restorable.length;
}
var RosterStore = class {
  constructor(getHome) {
    this.getHome = getHome;
  }
  getHome;
  /** Set once this store has written successfully. The empty-guard applies only
   *  before that: see `write`. */
  wrote = false;
  /** Disambiguates backups made inside the same millisecond. Two writes in one
   *  tick used to produce the same filename, and the second silently replaced
   *  the first — a backup folder that quietly loses backups is worse than none. */
  backupSeq = 0;
  home() {
    try {
      return this.getHome();
    } catch {
      return null;
    }
  }
  /** The stored roster, or null when there isn't one (or it can't be parsed).
   *  Null means "no opinion" — the renderer then keeps using localStorage, so a
   *  corrupt file degrades to the old behaviour instead of to an empty floor. */
  read() {
    const home = this.home();
    if (!home) return null;
    try {
      const p = rosterPath(home);
      if (!(0, import_node_fs15.existsSync)(p)) return null;
      const parsed = JSON.parse((0, import_node_fs15.readFileSync)(p, "utf8"));
      return isSnapshot(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  /**
   * Write the roster, keeping the previous contents as a backup.
   *
   * THE EMPTY-GUARD. The dangerous sequence is: open the packaged build for the
   * first time, its localStorage is empty (different origin), the store boots
   * with zero agents, and the first mirror write flattens a file that holds a
   * real roster. So an empty write is refused until this run has landed a
   * NON-empty write — only then has the renderer proven it actually holds a
   * roster, and a later empty write means the user really removed their agents
   * (refusing those would make deletion impossible). The guard must survive a
   * refusal: a renderer reload used to re-send the same empty snapshot, and
   * because the first refusal disarmed the guard, the second empty write went
   * through and flattened the file (seen live 2026-08-16 20:40:03). The previous
   * file is backed up either way, so even a wrong call here is recoverable.
   */
  write(snap) {
    const home = this.home();
    if (!home) return { ok: false, error: "no harnessHome" };
    if (!isSnapshot(snap)) return { ok: false, error: "invalid snapshot" };
    const p = rosterPath(home);
    try {
      (0, import_node_fs15.mkdirSync)(home, { recursive: true });
      const existing = this.read();
      if (!this.wrote && existing && entryCount(existing) > 0 && entryCount(snap) === 0) {
        this.backup(home, p, "declined");
        console.warn("[roster] refused to overwrite a non-empty roster with an empty one");
        return { ok: false, skipped: "empty-first-write" };
      }
      this.backup(home, p, this.wrote ? "write" : "run-start");
      const body = {
        version: 1,
        savedAt: (/* @__PURE__ */ new Date()).toISOString(),
        agents: snap.agents,
        archived: snap.archived,
        restorable: snap.restorable,
        queues: snap.queues && typeof snap.queues === "object" ? snap.queues : {},
        selectedId: typeof snap.selectedId === "string" ? snap.selectedId : null
      };
      const tmp = `${p}.tmp`;
      (0, import_node_fs15.writeFileSync)(tmp, JSON.stringify(body, null, 2), "utf8");
      (0, import_node_fs15.renameSync)(tmp, p);
      this.wrote = true;
      return { ok: true };
    } catch (e) {
      try {
        (0, import_node_fs15.rmSync)(`${p}.tmp`, { force: true });
      } catch {
      }
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  /**
   * Retire the active roster during a full reset: copied into `roster-backups/`
   * first, then the live file is removed.
   *
   * Reset wipes the hive, and the roster must not be left behind as the one
   * survivor — pointing the home folder back here afterwards would show a floor
   * full of agents whose sessions, memory and inboxes no longer exist. Archived
   * rather than deleted, because a roster is never destroyed, only superseded.
   */
  archive() {
    const home = this.home();
    if (!home) return;
    const p = rosterPath(home);
    try {
      if (!(0, import_node_fs15.existsSync)(p)) return;
      this.backup(home, p, "reset");
      (0, import_node_fs15.rmSync)(p, { force: true });
    } catch {
    }
  }
  /** Copy the current roster into the append-only backup folder. Never prunes:
   *  these files are the last line of defence, and a few KB per write is a price
   *  worth paying for that. */
  backup(home, p, reason) {
    try {
      if (!(0, import_node_fs15.existsSync)(p)) return;
      const dir = rosterBackupDir(home);
      (0, import_node_fs15.mkdirSync)(dir, { recursive: true });
      const stamp2 = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
      this.backupSeq += 1;
      (0, import_node_fs15.copyFileSync)(p, (0, import_node_path15.join)(dir, `roster-${stamp2}-${this.backupSeq}-${reason}.json`));
    } catch {
    }
  }
};

// cth/shared/commandLine.ts
function tokenizeCommand(command) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(command)) !== null) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

// cth/main/workerLaunch.ts
function buildWorkerLaunch(opts) {
  let command = typeof opts.requestCommand === "string" && opts.requestCommand.trim() ? opts.requestCommand.trim() : opts.defaultCommand ?? "claude";
  const provider = inferAgentProvider(command, opts.requestProvider);
  const autoFlag = opts.autoMode ? autoModeFlagForProvider(provider) : "";
  if (autoFlag && !hasAutoModeStance(tokenizeCommand(command), provider)) {
    command += ` ${autoFlag}`;
  }
  const tokens = tokenizeCommand(command);
  const bin = tokens[0] || command;
  const flags = tokens.slice(1);
  const model = typeof opts.requestModel === "string" && opts.requestModel.trim() ? opts.requestModel.trim() : "";
  const args = [...flags, ...model && !flags.includes("--model") ? ["--model", model] : []];
  return { bin, args, command };
}

// cth/main/control.ts
var MAX_PENDING_STEERS = 20;
var ControlRegistry = class {
  map = /* @__PURE__ */ new Map();
  ensure(id) {
    let c = this.map.get(id);
    if (!c) {
      c = {
        paused: false,
        halted: false,
        autoDeliveryPaused: false,
        gatedTools: /* @__PURE__ */ new Set(),
        steerQueue: []
      };
      this.map.set(id, c);
    }
    return c;
  }
  // ─── Operator actions (wired to IPC) ───────────────────────────────────────
  pause(id, on) {
    this.ensure(id).paused = on;
  }
  pauseAutoDelivery(id, on) {
    this.ensure(id).autoDeliveryPaused = on;
  }
  replaceAutoDeliveryPauses(ids) {
    const paused = new Set(ids);
    for (const [id, control2] of this.map) {
      control2.autoDeliveryPaused = paused.has(id);
    }
    for (const id of paused) this.ensure(id).autoDeliveryPaused = true;
  }
  gateTool(id, tool, on) {
    const c = this.ensure(id);
    if (on) c.gatedTools.add(tool);
    else c.gatedTools.delete(tool);
  }
  steer(id, text) {
    const t = text.trim();
    if (!t) return;
    const q = this.ensure(id).steerQueue;
    if (q.length >= MAX_PENDING_STEERS) {
      console.warn(`[control] ${id}: steer queue full (${MAX_PENDING_STEERS}) \u2014 dropping oldest note`);
      q.shift();
    }
    q.push(t.slice(0, 1e4));
  }
  /** Request a graceful stop at the next hook boundary. */
  halt(id) {
    this.ensure(id).halted = true;
  }
  /** Drop all queued-but-undelivered steer notes (e.g. closing time cancelled
   *  before a busy agent's next hook boundary consumed the instruction). */
  clearSteers(id) {
    const c = this.map.get(id);
    if (c) c.steerQueue.length = 0;
  }
  /** Clear pause + halt (lets a paused/halted agent run again). Keeps gates. */
  resume(id) {
    const c = this.ensure(id);
    c.paused = false;
    c.halted = false;
  }
  // ─── Reads (used by HookServer) ────────────────────────────────────────────
  shouldHalt(id) {
    return this.map.get(id)?.halted ?? false;
  }
  isAutoDeliveryPaused(id) {
    return this.map.get(id)?.autoDeliveryPaused ?? false;
  }
  /** Whether a tool call should be denied (paused agent, or this tool gated). */
  toolDecision(id, tool) {
    const c = this.map.get(id);
    if (!c) return { deny: false };
    if (c.paused) return { deny: true, reason: "Paused by operator \u2014 resume from the floor to continue." };
    if (tool && c.gatedTools.has(tool)) return { deny: true, reason: `Tool ${tool} is gated by the operator.` };
    return { deny: false };
  }
  /** Dequeue one pending steer note for delivery, or undefined. */
  takeSteer(id) {
    return this.map.get(id)?.steerQueue.shift();
  }
  snapshot(id) {
    const c = this.map.get(id);
    return {
      paused: c?.paused ?? false,
      halted: c?.halted ?? false,
      autoDeliveryPaused: c?.autoDeliveryPaused ?? false,
      gatedTools: c ? Array.from(c.gatedTools) : [],
      pendingSteers: c?.steerQueue.length ?? 0
    };
  }
};

// cth/main/workerWake.ts
var WORKER_WAKE_IDLE_MS = 12e3;
var WORKER_WAKE_BOOT_GRACE_MS = 35e3;
var WORKER_WAKE_COOLDOWN_MS = 6e4;
var WORKER_WAKE_HITL_REARM_MS = 5 * 6e4;
function classifyHook(event, message) {
  if (event === "Notification") {
    const msg = (message ?? "").toLowerCase();
    const idleWaiting = !msg || msg.includes("waiting for your input") || msg.includes("is idle") || msg.includes("waiting for input");
    const needsHuman = msg.includes("permission") || msg.includes("approve") || msg.includes("confirm") || msg.includes("needs your");
    if (needsHuman && !idleWaiting) return "needsHuman";
    return "idle";
  }
  return null;
}
var WorkerWakeWatchdog = class {
  /** ptyId → spawn timestamp (boot grace). */
  spawnedAt = /* @__PURE__ */ new Map();
  /** agentId → last nudge timestamp (cooldown). */
  lastNudgeAt = /* @__PURE__ */ new Map();
  /** agentId → timestamp of the last needsHuman hook notification. */
  lastHumanNeedsAt = /* @__PURE__ */ new Map();
  /** Record a PTY spawn so its boot sequence is left alone. */
  noteSpawn(ptyId, at = Date.now()) {
    this.spawnedAt.set(ptyId, at);
  }
  /** Feed hook events (from HookServer) so a HITL prompt blocks nudges. */
  noteHook(agentId, event, message, at = Date.now()) {
    if (!agentId) return;
    if (classifyHook(event, message) === "needsHuman") this.lastHumanNeedsAt.set(agentId, at);
  }
  /** Forget per-agent state (e.g. the agent's PTY was closed). */
  forget(agentId, ptyId) {
    this.lastNudgeAt.delete(agentId);
    this.lastHumanNeedsAt.delete(agentId);
    if (ptyId) this.spawnedAt.delete(ptyId);
  }
  /** The worker ids that should be nudged right now, in stable registry order.
   *  Pure decision — the caller types the nudge. */
  decide(facts, now = Date.now()) {
    const out = [];
    for (const f of facts) {
      if (f.isGod || f.inboxCount <= 0 || !f.ptyId) continue;
      if (f.autoDeliveryPaused || f.paused || f.halted) continue;
      if (f.lastOutputAt <= 0) continue;
      if (now - f.lastOutputAt < WORKER_WAKE_IDLE_MS) continue;
      const spawned = this.spawnedAt.get(f.ptyId) ?? 0;
      if (spawned > 0 && now - spawned < WORKER_WAKE_BOOT_GRACE_MS) continue;
      const lastHuman = this.lastHumanNeedsAt.get(f.agentId) ?? 0;
      if (lastHuman > 0 && now - lastHuman < WORKER_WAKE_HITL_REARM_MS) continue;
      const lastNudge = this.lastNudgeAt.get(f.agentId) ?? 0;
      if (lastNudge > 0 && now - lastNudge < WORKER_WAKE_COOLDOWN_MS) continue;
      this.lastNudgeAt.set(f.agentId, now);
      out.push(f.agentId);
    }
    return out;
  }
  /** Last time this worker was nudged (0 = never) — useful for diagnostics. */
  lastNudge(agentId) {
    return this.lastNudgeAt.get(agentId) ?? 0;
  }
};

// cth/shared/hiveNudge.ts
var NUDGE_HEAD = "You have new hive inbox message(s)";
function inboxNudgeText(ids) {
  const named = ids.length ? ` \u2014 at least: ${ids.join(", ")}` : "";
  return `${NUDGE_HEAD}${named}. Read your inbox, act on what is pending there, and move handled ones to inbox/.done/. Your inbox directory is authoritative: work everything still pending in it, and if a named id is already in inbox/.done/ you handled it on an earlier turn and can ignore that one. Act autonomously; only message god if you genuinely need a decision.`;
}

// cth/main/hire.ts
var import_node_fs16 = require("node:fs");
var import_promises3 = require("node:dns/promises");
var import_node_net2 = require("node:net");
var import_node_path16 = require("node:path");

// cth/shared/hire.ts
var HIRE_SPEC_V1 = "munder-difflin/hire@1";
var BUNDLED_SKILL_IDS = /* @__PURE__ */ new Set([
  "md-hive-sync",
  "md-fetch-summarize",
  "md-audit"
]);
var PROVIDERS = ["claude", "antigravity", "codex", "cursor"];
var MAX_BYTES = 64 * 1024;
var FLAG_RE = /^[A-Za-z0-9._\/=:,@+-]{1,100}$/;
var MODEL_RE = /^[A-Za-z0-9 ._()[\]\/:@+-]{1,80}$/;
var SAFE_FLAG_NAMES = /* @__PURE__ */ new Set([
  "--model",
  "--max-turns",
  "--output-format",
  "--verbose"
]);
function isSafeFlag(token) {
  if (!token.startsWith("-")) return false;
  const name = token.split("=", 1)[0].toLowerCase();
  return SAFE_FLAG_NAMES.has(name);
}
function str3(v) {
  return typeof v === "string";
}
function capped(v, max, field, errors, required = false) {
  if (v === void 0 || v === null) {
    if (required) errors.push(`"${field}" is required`);
    return void 0;
  }
  if (!str3(v)) {
    errors.push(`"${field}" must be a string`);
    return void 0;
  }
  const t = v.trim();
  if (required && !t) {
    errors.push(`"${field}" must not be empty`);
    return void 0;
  }
  if (t.length > max) {
    errors.push(`"${field}" exceeds ${max} chars`);
    return void 0;
  }
  return t || void 0;
}
function validateHireManifest(raw) {
  const errors = [];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ["manifest must be a JSON object"] };
  }
  const o = raw;
  if (o.spec !== HIRE_SPEC_V1) {
    return { ok: false, errors: [`unsupported spec "${String(o.spec)}" (expected "${HIRE_SPEC_V1}")`] };
  }
  const name = capped(o.name, 40, "name", errors, true);
  const description = capped(o.description, 200, "description", errors);
  const goal = capped(o.goal, 4e3, "goal", errors);
  const character = capped(o.character, 24, "character", errors)?.toLowerCase();
  const accent = capped(o.accent, 24, "accent", errors)?.toLowerCase();
  const model = capped(o.model, 80, "model", errors);
  if (model !== void 0 && !MODEL_RE.test(model)) {
    errors.push('"model" contains disallowed characters (it goes onto the spawn command line; letters, digits, spaces and . _ - ( ) [ ] / : @ + only)');
  }
  const author = capped(o.author, 80, "author", errors);
  const homepage = capped(o.homepage, 300, "homepage", errors);
  let provider;
  if (o.provider !== void 0) {
    const p = str3(o.provider) ? o.provider === "agy" ? "antigravity" : o.provider : o.provider;
    if (str3(p) && PROVIDERS.includes(p)) provider = p;
    else errors.push(`"provider" must be one of ${PROVIDERS.join(", ")} (or "agy")`);
  }
  let commandFlags;
  if (o.commandFlags !== void 0) {
    if (!Array.isArray(o.commandFlags) || o.commandFlags.length > 16) {
      errors.push('"commandFlags" must be an array of at most 16 items');
    } else {
      commandFlags = [];
      let valueAllowed = false;
      for (let i = 0; i < o.commandFlags.length; i++) {
        const f = o.commandFlags[i];
        if (!str3(f) || !FLAG_RE.test(f)) {
          errors.push(`commandFlags entry ${JSON.stringify(f)} is not a safe flag token`);
          valueAllowed = false;
          continue;
        }
        if (i === 0 && !f.startsWith("-")) {
          errors.push('"commandFlags" must start with a flag (e.g. "--model")');
          valueAllowed = false;
          continue;
        }
        if (f.startsWith("-")) {
          if (!isSafeFlag(f)) {
            errors.push(`commandFlags entry ${JSON.stringify(f)} is not in the shared-hire safe-flag list \u2014 for safety a shared hire may only embed known-harmless flags (${[...SAFE_FLAG_NAMES].join(", ")}). If you need this flag, add it by hand in the command field after importing.`);
            valueAllowed = false;
            continue;
          }
          commandFlags.push(f);
          valueAllowed = !f.includes("=");
        } else {
          if (!valueAllowed) {
            errors.push(`commandFlags entry ${JSON.stringify(f)} is not allowed here (a value may only follow an allowed flag such as "--model")`);
            continue;
          }
          commandFlags.push(f);
          valueAllowed = false;
        }
      }
      if (commandFlags.length === 0) commandFlags = void 0;
    }
  }
  let capabilities;
  if (o.capabilities !== void 0) {
    if (!Array.isArray(o.capabilities) || o.capabilities.length > 12) {
      errors.push('"capabilities" must be an array of at most 12 items');
    } else {
      capabilities = o.capabilities.filter(str3).map((c) => c.trim().slice(0, 40)).filter(Boolean);
      if (capabilities.length === 0) capabilities = void 0;
    }
  }
  let isolate;
  if (o.isolate !== void 0) {
    if (typeof o.isolate === "boolean") isolate = o.isolate;
    else errors.push('"isolate" must be a boolean');
  }
  let tokenCap;
  if (o.tokenCap !== void 0) {
    if (typeof o.tokenCap === "number" && Number.isInteger(o.tokenCap) && o.tokenCap > 0 && o.tokenCap <= MAX_AGENT_TOKEN_CAP) tokenCap = o.tokenCap;
    else errors.push('"tokenCap" must be a positive integer (max 1e10)');
  }
  let skills;
  if (o.skills !== void 0) {
    if (!Array.isArray(o.skills) || o.skills.length > 8) {
      errors.push('"skills" must be an array of at most 8 items');
    } else {
      skills = [];
      for (const s of o.skills) {
        if (!str3(s) || !s.trim()) {
          errors.push('"skills" entries must be non-empty strings');
          continue;
        }
        const id = s.trim();
        if (!BUNDLED_SKILL_IDS.has(id)) {
          errors.push(`"skills" entry ${JSON.stringify(id)} is not a bundled skill id \u2014 a hire may only reference the built-in safe skills (${[...BUNDLED_SKILL_IDS].join(", ")})`);
        } else {
          skills.push(id);
        }
      }
      if (skills.length === 0) skills = void 0;
    }
  }
  let mcpServers;
  const consentRequired = [];
  if (o.mcpServers !== void 0) {
    if (!Array.isArray(o.mcpServers) || o.mcpServers.length > 8) {
      errors.push('"mcpServers" must be an array of at most 8 items');
    } else {
      mcpServers = [];
      for (const s of o.mcpServers) {
        if (!str3(s) || !s.trim()) {
          errors.push('"mcpServers" entries must be non-empty strings');
          continue;
        }
        const id = s.trim();
        const entry = mcpCatalogEntry(id);
        if (!entry) {
          errors.push(`"mcpServers" entry ${JSON.stringify(id)} is not a known catalog id \u2014 a hire may only reference built-in MCP servers`);
        } else {
          mcpServers.push(id);
          if (entry.tier !== "safe-readonly") consentRequired.push(id);
        }
      }
      if (mcpServers.length === 0) mcpServers = void 0;
    }
  }
  if (homepage && !homepage.startsWith("https://")) errors.push('"homepage" must be https');
  if (errors.length > 0 || !name) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    consentRequired: consentRequired.length > 0 ? consentRequired : void 0,
    manifest: { spec: HIRE_SPEC_V1, name, description, goal, character, accent, provider, model, commandFlags, capabilities, isolate, tokenCap, author, homepage, skills, mcpServers }
  };
}
function parseHireDeepLink(link) {
  let u;
  try {
    u = new URL(link);
  } catch {
    return null;
  }
  if (u.protocol !== "munderdifflin:") return null;
  const action = (u.host || u.pathname.replace(/^\/+/, "")).toLowerCase();
  if (action !== "hire") return null;
  const src = u.searchParams.get("src");
  if (!src) return null;
  let s;
  try {
    s = new URL(src);
  } catch {
    return null;
  }
  if (!isAllowedManifestUrl(s)) return null;
  return s.toString();
}
function isAllowedManifestUrl(u) {
  if (u.protocol === "https:") return true;
  if (u.protocol !== "http:") return false;
  return u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
}
var HIRE_MAX_BYTES = MAX_BYTES;

// cth/main/hire.ts
function finish(v) {
  if (v.ok && v.manifest) return { ok: true, manifest: v.manifest };
  return { ok: false, error: `invalid hire manifest: ${v.errors.join("; ")}` };
}
var SSRF_BLOCK = new import_node_net2.BlockList();
SSRF_BLOCK.addSubnet("0.0.0.0", 8, "ipv4");
SSRF_BLOCK.addSubnet("10.0.0.0", 8, "ipv4");
SSRF_BLOCK.addSubnet("100.64.0.0", 10, "ipv4");
SSRF_BLOCK.addSubnet("127.0.0.0", 8, "ipv4");
SSRF_BLOCK.addSubnet("169.254.0.0", 16, "ipv4");
SSRF_BLOCK.addSubnet("172.16.0.0", 12, "ipv4");
SSRF_BLOCK.addSubnet("192.168.0.0", 16, "ipv4");
SSRF_BLOCK.addSubnet("224.0.0.0", 3, "ipv4");
SSRF_BLOCK.addAddress("::1", "ipv6");
SSRF_BLOCK.addAddress("::", "ipv6");
SSRF_BLOCK.addSubnet("fc00::", 7, "ipv6");
SSRF_BLOCK.addSubnet("fe80::", 10, "ipv6");
SSRF_BLOCK.addSubnet("fec0::", 10, "ipv6");
SSRF_BLOCK.addSubnet("ff00::", 8, "ipv6");
function v6Groups(v6) {
  let s = v6;
  const pct = s.indexOf("%");
  if (pct >= 0) s = s.slice(0, pct);
  const lastColon = s.lastIndexOf(":");
  const tail = s.slice(lastColon + 1);
  if (tail.includes(".")) {
    const o = tail.split(".").map(Number);
    if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    const hi = (o[0] << 8 | o[1]).toString(16);
    const lo = (o[2] << 8 | o[3]).toString(16);
    s = s.slice(0, lastColon + 1) + hi + ":" + lo;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const back = halves.length === 2 ? halves[1] ? halves[1].split(":") : [] : null;
  let groups;
  if (back === null) {
    groups = head;
  } else {
    const missing = 8 - head.length - back.length;
    if (missing < 0) return null;
    groups = [...head, ...Array(missing).fill("0"), ...back];
  }
  if (groups.length !== 8) return null;
  const nums = groups.map((g) => /^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN);
  return nums.some((n) => Number.isNaN(n)) ? null : nums;
}
function embeddedV4(v6) {
  const g = v6Groups(v6);
  if (!g) return null;
  const v4 = (hi, lo) => `${hi >> 8 & 255}.${hi & 255}.${lo >> 8 & 255}.${lo & 255}`;
  const top6zero = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0;
  if (top6zero && g[5] === 65535) return v4(g[6], g[7]);
  if (top6zero && g[5] === 0 && (g[6] !== 0 || g[7] !== 0)) return v4(g[6], g[7]);
  if (g[0] === 100 && g[1] === 65435 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0) return v4(g[6], g[7]);
  if (g[0] === 8194) return v4(g[1], g[2]);
  return null;
}
function isBlockedIp(ip) {
  const addr = ip.trim().toLowerCase();
  const kind = (0, import_node_net2.isIP)(addr);
  if (kind === 4) return SSRF_BLOCK.check(addr, "ipv4");
  if (kind === 6) {
    const v4 = embeddedV4(addr);
    if (v4 && (0, import_node_net2.isIP)(v4) === 4) return SSRF_BLOCK.check(v4, "ipv4");
    return SSRF_BLOCK.check(addr, "ipv6");
  }
  return true;
}
async function isInternalHost(hostname) {
  const host = hostname.replace("[", "").replace("]", "");
  if ((0, import_node_net2.isIP)(host)) return isBlockedIp(host);
  try {
    const addrs = await (0, import_promises3.lookup)(host, { all: true });
    return addrs.length === 0 || addrs.some((a) => isBlockedIp(a.address));
  } catch {
    return true;
  }
}
async function assertPublicTarget(u) {
  const devLoopbackHttp = u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]");
  if (devLoopbackHttp) return null;
  if (await isInternalHost(u.hostname)) {
    return "manifest URL resolves to a private/loopback/link-local address (SSRF blocked)";
  }
  return null;
}
async function fetchHireManifest(src) {
  let url;
  try {
    url = new URL(src);
  } catch {
    return { ok: false, error: "not a valid URL" };
  }
  if (!isAllowedManifestUrl(url)) return { ok: false, error: "manifest URL must be https (http allowed for localhost only)" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1e4);
  try {
    const ssrf0 = await assertPublicTarget(url);
    if (ssrf0) return { ok: false, error: ssrf0 };
    let current = url;
    let res = null;
    for (let hop = 0; hop < 5; hop++) {
      res = await fetch(current, {
        signal: ctrl.signal,
        redirect: "manual",
        headers: { accept: "application/json" }
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return { ok: false, error: "redirect without a location" };
        let next;
        try {
          next = new URL(loc, current);
        } catch {
          return { ok: false, error: "invalid redirect target" };
        }
        if (next.protocol !== "https:") return { ok: false, error: "redirect target must be https (a manifest may not redirect into http/loopback)" };
        const ssrfN = await assertPublicTarget(next);
        if (ssrfN) return { ok: false, error: ssrfN };
        current = next;
        continue;
      }
      break;
    }
    if (!res) return { ok: false, error: "fetch failed" };
    if (res.status >= 300 && res.status < 400) return { ok: false, error: "too many redirects" };
    if (!res.ok) return { ok: false, error: `fetch failed: HTTP ${res.status}` };
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > HIRE_MAX_BYTES) return { ok: false, error: "manifest too large" };
    const text = await readBounded(res, HIRE_MAX_BYTES);
    if (text === null) return { ok: false, error: "manifest too large" };
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: "manifest is not valid JSON" };
    }
    return finish(validateHireManifest(parsed));
  } catch (e) {
    const msg = e instanceof Error && e.name === "AbortError" ? "fetch timed out" : String(e);
    return { ok: false, error: `fetch failed: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}
async function readBounded(res, maxBytes) {
  const body = res.body;
  if (!body) {
    const t = await res.text();
    return Buffer.byteLength(t, "utf8") > maxBytes ? null : t;
  }
  const reader = body.getReader();
  const chunks = [];
  let total = 0;
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
        }
        return null;
      }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks).toString("utf8");
}
function readHireManifestFile(path3) {
  try {
    if ((0, import_node_fs16.statSync)(path3).size > HIRE_MAX_BYTES) return { ok: false, error: "manifest too large" };
    const parsed = JSON.parse((0, import_node_fs16.readFileSync)(path3, "utf8"));
    return finish(validateHireManifest(parsed));
  } catch (e) {
    return { ok: false, error: `could not read manifest: ${String(e)}` };
  }
}
function readHireManifestFiles(paths) {
  const manifests = [];
  const errors = [];
  for (const path3 of paths) {
    const result = readHireManifestFile(path3);
    if (result.ok) manifests.push(result.manifest);
    else {
      const name = (0, import_node_path16.basename)(path3);
      errors.push(`${name}: ${result.error.split(path3).join(name)}`);
    }
  }
  return { manifests, errors };
}

// cth/main/closingTime.ts
var ACK_RE = /CLOSING[-_\s]*TIME[-_\s]*ACK/i;
var COMPLETE_RE = /CLOSING[-_\s]*TIME[-_\s]*COMPLETE/i;
var TIMEOUT_MS = 6 * 6e4;
var TEARDOWN_GRACE_MS = 2500;
var ClosingTimeController = class {
  constructor(hive2, getLiveAgentIds, getWebContents, onConcluded, control2) {
    this.hive = hive2;
    this.getLiveAgentIds = getLiveAgentIds;
    this.getWebContents = getWebContents;
    this.onConcluded = onConcluded;
    this.control = control2;
  }
  hive;
  getLiveAgentIds;
  getWebContents;
  onConcluded;
  control;
  active = false;
  godId = "god";
  workers = /* @__PURE__ */ new Set();
  acked = /* @__PURE__ */ new Set();
  timeoutTimer = null;
  teardownTimer = null;
  isActive() {
    return this.active;
  }
  /** Kick off the protocol. Returns an error string when the floor cannot run
   *  it (no live god agent) so the UI can fall back to the hard quit. */
  start() {
    if (this.active) {
      this.armTimeout();
      this.emitState("progress");
      return { ok: true };
    }
    const reg = this.hive.registry();
    this.godId = reg.godId ?? "god";
    const live = new Set(this.getLiveAgentIds());
    if (!reg.agents[this.godId] || !live.has(this.godId)) {
      return { ok: false, error: "No orchestrator is running \u2014 closing time needs the god agent to collect the reports." };
    }
    this.workers = new Set(
      [...live].filter((id) => {
        const a = reg.agents[id];
        return id !== this.godId && !!a && !a.isGod;
      })
    );
    this.acked = /* @__PURE__ */ new Set();
    this.active = true;
    const names = [...this.workers].map((id) => `${reg.agents[id]?.name ?? id} (${id})`).join(", ") || "(none \u2014 the floor is just you)";
    this.hive.send({
      to: "god",
      act: "request",
      subject: "CLOSING TIME \u2014 run the shutdown protocol now",
      body: [
        'The human pressed "closing time": the harness will close as soon as you confirm the floor is safe. Run this protocol now, before anything else:',
        "",
        `1. BROADCAST closing time to the team (message with "to":"broadcast"). Current workers: ${names}.`,
        '   Tell each worker to immediately: park or commit any work-in-progress safely, append its current state + concrete next steps to its memory.md, and then reply to you with a message whose subject is exactly "CLOSING-TIME-ACK".',
        "2. WAIT and keep draining your inbox until EVERY worker above has sent its CLOSING-TIME-ACK. Nudge stragglers once if needed.",
        "3. Save your own state: update board.md and append your shift summary to your memory.md.",
        `4. CONCLUDE by sending a message with "to":"human" and the subject exactly "CLOSING-TIME-COMPLETE" \u2014 the harness watches for it and closes the app. Do not send it before every worker has acked: the harness independently verifies the ACKs and will reject a premature conclusion.`,
        "",
        this.workers.size === 0 ? "There are no workers on the floor right now \u2014 do steps 3 and 4 immediately." : "The prep assistant saves its own memory separately \u2014 do NOT wait for it and do not message it.",
        "This is a shutdown: do not start new work and do not accept new tasks."
      ].join("\n")
    }, "human");
    this.control?.steer(
      this.godId,
      "CLOSING TIME was pressed by the human: pause your current work at the next sensible point and drain your inbox NOW \u2014 a shutdown brief is waiting there. Coordinate the floor shutdown before anything else."
    );
    for (const id of this.workers) {
      this.control?.steer(
        id,
        'CLOSING TIME \u2014 the office is shutting down. Finish your current step but do NOT start new work. Park or commit your work-in-progress safely, append your current state + concrete next steps to your memory.md, then reply to god with a message whose subject is exactly "CLOSING-TIME-ACK".'
      );
    }
    this.armTimeout();
    this.emitState("started");
    return { ok: true };
  }
  /** Human changed their mind — stand the floor back up. */
  cancel() {
    if (!this.active) return;
    this.cleanup();
    this.control?.clearSteers(this.godId);
    for (const id of this.workers) this.control?.clearSteers(id);
    this.emitState("cancelled");
    try {
      this.hive.send({
        to: "god",
        act: "inform",
        subject: "CLOSING TIME CANCELLED",
        body: "The human cancelled the shutdown \u2014 disregard the closing-time protocol and resume normal operation. Any memory saves already done are a bonus, not a problem."
      }, "human");
    } catch {
    }
  }
  /** Router observer — called by the hive for every routed message. */
  onRouted(msg, targets) {
    if (!this.active) return;
    if (ACK_RE.test(msg.subject) && this.workers.has(msg.from) && targets.includes(this.godId)) {
      if (!this.acked.has(msg.from)) {
        this.acked.add(msg.from);
        this.emitState("progress");
      }
      return;
    }
    if (COMPLETE_RE.test(msg.subject) && msg.from === this.godId) {
      const reg = this.hive.registry();
      const liveNow = new Set(this.getLiveAgentIds());
      const pending2 = [...this.workers].filter(
        (id) => !this.acked.has(id) && liveNow.has(id) && !reg.agents[id]?.archived
      );
      if (pending2.length > 0) {
        const names = pending2.map((id) => `${reg.agents[id]?.name ?? id} (${id})`).join(", ");
        this.hive.send({
          to: "god",
          act: "refuse",
          subject: "CLOSING TIME \u2014 conclusion rejected, workers still missing",
          body: [
            `The harness is still missing a CLOSING-TIME-ACK from: ${names}.`,
            "The app stays open until every worker has confirmed its memory is saved.",
            "Chase the stragglers (re-send the closing-time instruction to each), wait for their ACKs, then send CLOSING-TIME-COMPLETE again."
          ].join("\n")
        }, "human");
        this.emitState("progress");
        return;
      }
      this.cleanup();
      this.active = true;
      this.emitState("complete");
      this.teardownTimer = setTimeout(() => {
        this.active = false;
        this.onConcluded();
      }, TEARDOWN_GRACE_MS);
    }
  }
  armTimeout() {
    if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
    this.timeoutTimer = setTimeout(() => {
      if (this.active) this.emitState("timeout");
    }, TIMEOUT_MS);
  }
  cleanup() {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    if (this.teardownTimer) {
      clearTimeout(this.teardownTimer);
      this.teardownTimer = null;
    }
    this.active = false;
  }
  emitState(phase) {
    const ev = { phase, acked: this.acked.size, total: this.workers.size };
    try {
      this.getWebContents()?.send("app:closingTime", ev);
    } catch {
    }
  }
};

// cth/main/nodeInstall.ts
var NODE_FLOOR_MAJOR = 20;
var DIST = "https://nodejs.org/dist";
function nodeMajor(version) {
  const m = /^v?(\d+)\./.exec((version ?? "").trim());
  return m ? Number(m[1]) : null;
}
function nodeIsUsable(version) {
  const major = nodeMajor(version);
  return major !== null && major >= NODE_FLOOR_MAJOR;
}
var execNodeVersion = (nodePath) => (
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("node:child_process").execFileSync(nodePath, ["--version"], { encoding: "utf8", timeout: 5e3, stdio: ["ignore", "pipe", "ignore"] })
);
function detectNodeVersion(nodePath, probe = execNodeVersion) {
  if (!nodePath) return null;
  try {
    const out = (probe(nodePath) || "").trim();
    return /^v?\d+\./.test(out) ? out : null;
  } catch {
    return null;
  }
}
function pickLatestLts(index) {
  return index.find((e) => e && e.lts) ?? null;
}
function nodeArtifactFor(version, platform, arch) {
  if (platform === "darwin") return { file: `node-${version}.pkg`, kind: "pkg" };
  if (platform === "win32") {
    const a = arch === "arm64" ? "arm64" : "x64";
    return { file: `node-${version}-${a}.msi`, kind: "msi" };
  }
  if (platform === "linux") {
    const a = arch === "arm64" ? "arm64" : arch === "x64" ? "x64" : null;
    if (!a) return null;
    return { file: `node-${version}-linux-${a}.tar.xz`, kind: "tar" };
  }
  return null;
}
function shaFor(shasums, file) {
  for (const line of shasums.split("\n")) {
    const m = /^([0-9a-f]{64})\s+(\S+)\s*$/.exec(line.trim());
    if (m && m[2] === file) return m[1];
  }
  return null;
}
var distUrl = (version, file) => `${DIST}/${version}/${file}`;
var timedFetch = (url) => fetch(url, { signal: AbortSignal.timeout(6e3) });
async function resolveNodeInstaller(platform = process.platform, arch = process.arch, fetchImpl = timedFetch) {
  try {
    const indexRes = await fetchImpl(`${DIST}/index.json`);
    if (!indexRes.ok) return null;
    const index = JSON.parse(await indexRes.text());
    const lts = pickLatestLts(index);
    if (!lts) return null;
    const artifact = nodeArtifactFor(lts.version, platform, arch);
    if (!artifact) return null;
    const shaRes = await fetchImpl(`${DIST}/${lts.version}/SHASUMS256.txt`);
    if (!shaRes.ok) return null;
    const sha256 = shaFor(await shaRes.text(), artifact.file);
    if (!sha256) return null;
    return {
      version: lts.version,
      npmVersion: lts.npm,
      file: artifact.file,
      url: distUrl(lts.version, artifact.file),
      sha256,
      kind: artifact.kind
    };
  } catch {
    return null;
  }
}
function buildNodeInstallScript(installer, platform) {
  const { version, url, sha256, file } = installer;
  if (platform === "win32") {
    const f = `%TEMP%\\${file}`;
    return [
      `echo   Downloading Node.js ${version} ^(official installer^)...`,
      `curl -fSL ${url} -o ${f}`,
      `if errorlevel 1 exit /b 1`,
      `echo   Verifying checksum...`,
      `certutil -hashfile ${f} SHA256 | findstr /i /c:${sha256} >nul`,
      `if errorlevel 1 (echo   [x] CHECKSUM MISMATCH - refusing to install ^& exit /b 1)`,
      `echo   Installing - approve the Windows prompt if it appears...`,
      `msiexec /i ${f} /passive /norestart`,
      `if errorlevel 1 exit /b 1`,
      `set PATH=%ProgramFiles%\\nodejs;%PATH%`
    ];
  }
  const verify2 = platform === "darwin" ? `echo "${sha256}  $__f" | shasum -a 256 -c - >/dev/null` : `echo "${sha256}  $__f" | sha256sum -c - >/dev/null`;
  const install = platform === "darwin" ? `sudo installer -pkg "$__f" -target /` : `sudo tar -xJf "$__f" -C /usr/local --strip-components=1`;
  return [
    `echo '  Downloading Node.js ${version} (official installer)...'`,
    `__tmp=$(mktemp -d)`,
    `__f=$__tmp/${file}`,
    `curl -fSL --progress-bar ${url} -o "$__f" || { echo '  [x] Download failed.'; exit 1; }`,
    `echo '  Verifying checksum...'`,
    `${verify2} || { echo '  [x] CHECKSUM MISMATCH - refusing to install.'; rm -rf "$__tmp"; exit 1; }`,
    `echo ''`,
    `echo '  Installing Node.js. Enter your password if prompted -'`,
    `echo '  the official installer writes outside your home directory.'`,
    `echo ''`,
    `${install} || { echo '  [x] Node install failed.'; rm -rf "$__tmp"; exit 1; }`,
    `rm -rf "$__tmp"`,
    // The shell that is running this script captured PATH before node existed.
    `PATH=/usr/local/bin:$PATH`,
    `export PATH`
  ];
}

// cth/main/cliInstall.ts
function chooseInstallRung(info, npmAvailable, nodeInstaller) {
  if (info.command && npmAvailable) return { command: info.command, kind: "npm", nodeMissing: false };
  if (info.command && nodeInstaller) return { command: info.command, kind: "node-then-npm", nodeMissing: true };
  if (info.nativeCommand) return { command: info.nativeCommand, kind: "native", nodeMissing: !npmAvailable };
  return { kind: "manual", nodeMissing: !npmAvailable };
}
function buildMissingCliScript(bin, provider, npmAvailable, platform = process.platform, nodeInstaller) {
  const info = installInfoForProvider(provider, platform);
  const safeBin = (bin || provider).replace(/[^A-Za-z0-9._-]/g, "") || provider;
  const rung = chooseInstallRung(info, npmAvailable, nodeInstaller);
  const nodeSteps = rung.kind === "node-then-npm" && nodeInstaller ? buildNodeInstallScript(nodeInstaller, platform) : null;
  const cmd = rung.command;
  const label = info.label;
  const docs = info.docsUrl;
  const rule = "------------------------------------------------------------";
  if (platform === "win32") {
    const parts = ["echo.", `echo ${rule}`, `echo   Engine CLI not found:  ${safeBin}`, "echo."];
    if (nodeSteps && nodeInstaller) {
      parts.push(
        "echo   Node.js is not installed on this machine, so the usual npm",
        `echo   installer cannot run yet. Installing Node ${nodeInstaller.version} ^(+ npm^) first,`,
        "echo   straight from nodejs.org, checksum-verified.",
        "echo.",
        ...nodeSteps,
        "echo."
      );
    } else if (rung.nodeMissing) {
      parts.push("echo   Node.js is not installed on this machine, so the usual", "echo   npm installer cannot run here.", "echo.");
    }
    if (cmd) {
      if (rung.kind === "native") parts.push(`echo   Using the self-contained ${label} installer instead ^(no Node needed^):`);
      else parts.push(`echo   Installing the ${label} CLI now so you can watch:`);
      parts.push(
        "echo.",
        `echo     ${cmd}`,
        `echo ${rule}`,
        "echo.",
        cmd,
        "echo.",
        "echo   [done] If it succeeded, the agent launches automatically.",
        "echo   If it failed, run the command above manually, then restart the agent."
      );
    } else {
      if (rung.nodeMissing) {
        parts.push(
          `echo   Install Node.js ^(nodejs.org^), then the ${label} CLI:`,
          `echo     ${info.command ?? ""}`,
          "echo   \u2026or install the CLI by whatever method its docs recommend."
        );
      } else {
        parts.push(
          `echo   No bundled installer for the ${label} provider.`,
          "echo   Install it manually, then restart the agent to launch it."
        );
      }
      if (docs) parts.push(`echo   Docs: ${docs}`);
      parts.push(`echo ${rule}`);
    }
    return parts.join(" & ");
  }
  const lines = [
    `echo ''`,
    `echo '${rule}'`,
    `echo '  Engine CLI not found:  ${safeBin}'`,
    `echo ''`
  ];
  if (nodeSteps && nodeInstaller) {
    lines.push(
      `echo '  Node.js is not installed on this machine, so the usual npm'`,
      `echo '  installer cannot run yet. Installing Node ${nodeInstaller.version} (+ npm) first,'`,
      `echo '  straight from nodejs.org, checksum-verified.'`,
      `echo ''`,
      ...nodeSteps,
      `echo ''`
    );
  } else if (rung.nodeMissing) {
    lines.push(
      `echo '  Node.js is not installed on this machine, so the usual npm'`,
      `echo '  installer cannot run here.'`,
      `echo ''`
    );
  }
  if (cmd) {
    lines.push(
      ...rung.kind === "native" ? [
        `echo '  Using the self-contained ${label} installer instead (no Node needed) \u2014'`,
        `echo '  finish any sign-in it prompts for, then come back to this terminal.'`
      ] : [
        `echo '  Installing the ${label} CLI now so you can watch \u2014 finish any'`,
        `echo '  sign-in it prompts for, then come back to this terminal.'`
      ],
      `echo ''`,
      `echo '    ${cmd}'`,
      `echo '${rule}'`,
      `echo ''`,
      cmd,
      `__clirc=$?`,
      `echo ''`,
      `if [ $__clirc -eq 0 ]; then`,
      `  echo '  [done] Installed \u2014 launching the agent\u2026'`,
      `else`,
      `  echo "  [x] Install exited with code $__clirc \u2014 finish it manually:"`,
      `  echo '    ${cmd}'`,
      ...docs ? [`  echo '    Docs: ${docs}'`] : [],
      `  echo '  Then restart the agent to launch it.'`,
      `fi`
    );
  } else if (rung.nodeMissing) {
    lines.push(
      `echo '  Install Node.js (nodejs.org), then the ${label} CLI:'`,
      ...info.command ? [`echo '    ${info.command}'`] : [],
      `echo '  \u2026or install the CLI by whatever method its docs recommend.'`,
      ...docs ? [`echo '  Docs: ${docs}'`] : [],
      `echo '${rule}'`
    );
  } else {
    lines.push(
      `echo '  No bundled installer for the ${label} provider.'`,
      `echo '  Install it manually, then restart the agent to launch it.'`,
      ...docs ? [`echo '  Docs: ${docs}'`] : [],
      `echo '${rule}'`
    );
  }
  return lines.join(String.fromCharCode(10));
}

// cth/shared/toolCatalog.ts
var BASE_TOOLS = [
  {
    id: "uv",
    bin: "uv",
    label: "uv",
    kind: "prerequisite",
    why: "Installs and runs mempalace. A self-contained Python toolchain \u2014 it does not touch any Python you already have.",
    essential: true,
    install: {
      posix: "curl -LsSf https://astral.sh/uv/install.sh | sh",
      // PowerShell, not cmd.exe: astral ships install.ps1 for Windows and there
      // is no .bat equivalent. Quoted so it survives being pasted into either.
      win32: 'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"'
    },
    docsUrl: "https://docs.astral.sh/uv/"
  },
  {
    id: "mempalace",
    bin: null,
    // presence comes from MemoryStatus.available, not a PATH probe
    label: "MemPalace \u2014 semantic memory",
    kind: "memory",
    why: "Meaning-based recall across everything your agents have learned. Without it they still keep plain markdown notes, but cannot search them by meaning.",
    essential: true,
    install: {
      posix: "uv tool install mempalace",
      win32: "uv tool install mempalace"
    },
    note: "Needs uv first."
  },
  {
    id: "git",
    bin: "git",
    label: "git",
    kind: "prerequisite",
    why: "Worktrees let agents work in parallel without fighting over one checkout, and the hive keeps its own history in git.",
    essential: true,
    install: {
      posix: "xcode-select --install   # macOS \xB7 or: sudo apt install git",
      win32: "winget install --id Git.Git -e"
    },
    docsUrl: "https://git-scm.com/downloads"
  },
  {
    id: "node",
    bin: "node",
    label: "Node.js",
    kind: "prerequisite",
    why: "Runs the npm-installed agent engines (OpenCode, and Claude Code on machines without the native build).",
    essential: false,
    // Deliberately no scripted command: the app already ships a checksum-verified
    // Node installer (nodeInstall.ts) that runs automatically when an engine needs
    // one. Printing a rival curl|sh here would compete with it.
    install: { posix: "", win32: "" },
    note: "The app installs this for you when an engine needs it \u2014 nothing to do by hand.",
    docsUrl: "https://nodejs.org"
  }
];
function toolCatalog() {
  const engines = AGENT_PROVIDER_PRESETS.filter((p) => p.id !== "custom" && !!p.defaultCommand).map((p) => ({
    id: `engine:${p.id}`,
    bin: p.defaultCommand,
    label: p.label,
    kind: "engine",
    why: `Agent engine \u2014 ${p.defaultCommand}.`,
    // Claude Code is the recommended engine and the only one the floor assumes
    // by default, so it is the one engine "set up everything" will install.
    essential: p.id === "claude",
    install: {
      posix: p.installCommand ?? p.nativeInstallCommand?.posix ?? "",
      win32: p.installCommand ?? p.nativeInstallCommand?.win32 ?? ""
    },
    docsUrl: p.docsUrl
  }));
  return [...BASE_TOOLS, ...engines];
}

// cth/main/skills.ts
var import_node_fs17 = require("node:fs");
var import_node_path17 = require("node:path");
var import_node_os5 = require("node:os");

// cth/main/fetchText.ts
var import_node_https3 = require("node:https");
function getText(url, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 12e3;
  return new Promise((resolve4, reject) => {
    const req = (0, import_node_https3.request)(url, { method: "GET", headers: { "user-agent": "munder-difflin" } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        getText(res.headers.location, opts).then(resolve4, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => {
        body += c;
      });
      res.on("end", () => resolve4(body));
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error("timed out")));
    req.end();
  });
}

// cth/main/skills.ts
function parseSkillFrontmatter(md) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md);
  if (!m) return {};
  const body = m[1];
  const out = {};
  const nameM = /^name:\s*(.+)$/m.exec(body);
  if (nameM) out.name = nameM[1].trim().replace(/^["']|["']$/g, "");
  const blockM = /^description:\s*[|>]-?[ \t]*\r?\n((?:[ \t]+.*(?:\r?\n|$))+)/m.exec(body);
  if (blockM) {
    out.description = blockM[1].split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(" ").trim();
  } else {
    const inlineM = /^description:\s*(.+)$/m.exec(body);
    if (inlineM) out.description = inlineM[1].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}
function scanSkillDir(dir, provider, scope) {
  const out = [];
  try {
    if (!(0, import_node_fs17.existsSync)(dir) || !(0, import_node_fs17.statSync)(dir).isDirectory()) return out;
    for (const entry of (0, import_node_fs17.readdirSync)(dir)) {
      const skillDir = (0, import_node_path17.join)(dir, entry);
      const md = (0, import_node_path17.join)(skillDir, "SKILL.md");
      try {
        if (!(0, import_node_fs17.statSync)(skillDir).isDirectory() || !(0, import_node_fs17.existsSync)(md)) continue;
        const fm = parseSkillFrontmatter((0, import_node_fs17.readFileSync)(md, "utf8"));
        out.push({
          id: `${scope}:${entry}`,
          name: fm.name || entry,
          description: fm.description || "",
          provider,
          scope,
          path: skillDir
        });
      } catch {
      }
    }
  } catch {
  }
  return out;
}
function scanPluginDir(dir, provider, scope) {
  const out = [];
  try {
    if (!(0, import_node_fs17.existsSync)(dir) || !(0, import_node_fs17.statSync)(dir).isDirectory()) return out;
    for (const entry of (0, import_node_fs17.readdirSync)(dir)) {
      if (entry.startsWith(".")) continue;
      out.push({
        id: `${scope}:${provider}:${entry}`,
        name: entry.replace(/\.(m|c)?js$/i, ""),
        description: `Plugin in ${(0, import_node_path17.basename)((0, import_node_path17.dirname)(dir))}/${(0, import_node_path17.basename)(dir)}`,
        provider,
        scope,
        path: (0, import_node_path17.join)(dir, entry)
      });
    }
  } catch {
  }
  return out;
}
function listLocalSkills(opts) {
  const home = (0, import_node_os5.homedir)();
  const found = [
    ...opts.bundledDir ? scanSkillDir(opts.bundledDir, "claude", "bundled") : [],
    ...scanSkillDir((0, import_node_path17.join)(home, ".claude", "skills"), "claude", "user"),
    ...scanPluginDir((0, import_node_path17.join)(home, ".config", "opencode", "plugin"), "opencode", "user"),
    ...scanPluginDir((0, import_node_path17.join)(home, ".codex", "plugins"), "codex", "user")
  ];
  for (const cwd of opts.cwds) {
    if (!cwd) continue;
    found.push(...scanSkillDir((0, import_node_path17.join)(cwd, ".claude", "skills"), "claude", "project"));
    found.push(...scanPluginDir((0, import_node_path17.join)(cwd, ".opencode", "plugin"), "opencode", "project"));
  }
  const rank3 = { project: 3, user: 2, bundled: 1 };
  const best = /* @__PURE__ */ new Map();
  for (const s of found) {
    const key = `${s.provider}:${s.name.toLowerCase()}`;
    const prev = best.get(key);
    if (!prev || rank3[s.scope] > rank3[prev.scope]) best.set(key, s);
  }
  return [...best.values()].sort((a, b) => a.name.localeCompare(b.name));
}
var CATALOG_URL = "https://raw.githubusercontent.com/abubakarsiddik31/claude-skills-collection/main/README.md";
var CATALOG_TTL_MS = 24 * 60 * 60 * 1e3;
function parseCatalogMarkdown(md) {
  const out = [];
  let category = "Skills";
  const seen = /* @__PURE__ */ new Set();
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    const h = /^#{2,3}\s+(.+?)\s*$/.exec(line);
    if (h) {
      category = h[1].replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "").replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, "").trim() || category;
      continue;
    }
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 3) continue;
    if (/^-{3,}$/.test(cells[0].replace(/:/g, ""))) continue;
    const name = cells[0].replace(/[*`]/g, "").trim();
    const description = cells[1].replace(/[*`]/g, "").trim();
    const linkM = /\((https?:\/\/[^)]+)\)/.exec(cells[2]) || /(https?:\/\/\S+)/.exec(cells[2]);
    if (!name || !linkM) continue;
    const url = linkM[1].trim();
    const key = `${name}|${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const ghOwner = /^https:\/\/github\.com\/([^/]+)/i.exec(url);
    out.push({
      name,
      description,
      url,
      category,
      owner: ghOwner ? ghOwner[1].toLowerCase() : "other"
    });
  }
  return out;
}
async function loadCatalog(cachePath, opts = {}) {
  let cached = null;
  try {
    if ((0, import_node_fs17.existsSync)(cachePath)) cached = JSON.parse((0, import_node_fs17.readFileSync)(cachePath, "utf8"));
  } catch {
    cached = null;
  }
  const fresh = cached && Date.now() - cached.fetchedAt < CATALOG_TTL_MS;
  if (fresh && !opts.force) return { skills: cached.skills, fetchedAt: cached.fetchedAt, stale: false };
  try {
    const md = await getText(CATALOG_URL);
    const skills = parseCatalogMarkdown(md);
    if (skills.length === 0 && cached) {
      return { skills: cached.skills, fetchedAt: cached.fetchedAt, stale: true, error: "catalog format changed" };
    }
    const payload = { skills, fetchedAt: Date.now() };
    try {
      (0, import_node_fs17.mkdirSync)((0, import_node_path17.dirname)(cachePath), { recursive: true });
      (0, import_node_fs17.writeFileSync)(cachePath, JSON.stringify(payload));
    } catch {
    }
    return { ...payload, stale: false };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    if (cached) return { skills: cached.skills, fetchedAt: cached.fetchedAt, stale: true, error };
    return { skills: [], fetchedAt: 0, stale: true, error };
  }
}
var MAX_FILES = 60;
var MAX_TOTAL_BYTES = 2 * 1024 * 1024;
var MAX_DEPTH = 5;
function parseGitHubSourceUrl(url) {
  const clean = url.trim().replace(/[#?].*$/, "").replace(/\/+$/, "");
  const tree = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/?(.*)$/.exec(clean);
  if (tree) {
    const [, owner, repo, ref, path3] = tree;
    if (!owner || !repo || !ref) return null;
    return { owner, repo, ref, path: path3.replace(/\/+$/, "") };
  }
  const root = /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/.exec(clean);
  if (root) {
    const [, owner, repo] = root;
    if (["orgs", "topics", "collections", "sponsors", "features"].includes(owner.toLowerCase())) return null;
    return { owner, repo: repo.replace(/\.git$/i, ""), ref: "", path: "" };
  }
  return null;
}
function safeSkillDirName(raw) {
  const base = raw.trim().split("/").pop() ?? "";
  if (!base || base === "." || base === "..") return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(base)) return null;
  if (base.includes("..")) return null;
  return base;
}
function getJson(url) {
  return getText(url).then((t) => JSON.parse(t));
}
async function resolveSourceUrl(url) {
  if (parseGitHubSourceUrl(url)) return url;
  if (!/^https:\/\/(www\.)?officialskills\.sh\//i.test(url)) return null;
  try {
    const html = await getText(url);
    const m = /https:\/\/github\.com\/[^/"'\s]+\/[^/"'\s]+\/tree\/[^"'\s<>)]+/.exec(html);
    return m ? m[0].replace(/[.,)]+$/, "") : null;
  } catch {
    return null;
  }
}
async function installSkill(entryUrl, entryName) {
  const source = await resolveSourceUrl(entryUrl);
  if (!source) {
    return { ok: false, unsupported: true, error: "No downloadable source \u2014 open Learn more to install it by hand." };
  }
  const gh = parseGitHubSourceUrl(source);
  if (!gh) return { ok: false, unsupported: true, error: "Source is not a GitHub folder." };
  const dirName = safeSkillDirName(gh.path || entryName);
  if (!dirName) return { ok: false, error: "That skill has a name this app will not create a folder for." };
  const root = (0, import_node_path17.join)((0, import_node_os5.homedir)(), ".claude", "skills");
  const dest = (0, import_node_path17.join)(root, dirName);
  if ((0, import_node_fs17.existsSync)(dest)) return { ok: false, error: `Already installed at ${dest}` };
  const api = (p) => `https://api.github.com/repos/${gh.owner}/${gh.repo}/contents/${p ? encodeURI(p) : ""}` + (gh.ref ? `?ref=${encodeURIComponent(gh.ref)}` : "");
  const files = [];
  let total = 0;
  const walk = async (path3, depth) => {
    if (depth > MAX_DEPTH) return "the folder nests deeper than this installer will follow";
    let listing;
    try {
      const res = await getJson(api(path3));
      listing = Array.isArray(res) ? res : [res];
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
    for (const it of listing) {
      if (files.length >= MAX_FILES) return "that skill has more files than this installer will fetch";
      if (it.type === "dir") {
        const err = await walk(it.path, depth + 1);
        if (err) return err;
        continue;
      }
      if (it.type !== "file" || !it.download_url) continue;
      const size = it.size ?? 0;
      total += size;
      if (total > MAX_TOTAL_BYTES) return "that skill is larger than this installer will fetch";
      const rel = gh.path ? it.path.slice(gh.path.length).replace(/^\/+/, "") : it.path;
      files.push({ path: rel, url: it.download_url, size });
    }
    return null;
  };
  const walkErr = await walk(gh.path, 0);
  if (walkErr) return { ok: false, error: walkErr };
  if (files.length === 0) return { ok: false, error: "No files found at that source." };
  const written = [];
  try {
    for (const f of files) {
      const target = (0, import_node_path17.resolve)(dest, f.path);
      if (target !== dest && !target.startsWith(dest + import_node_path17.sep)) {
        throw new Error(`refusing to write outside the skill folder: ${f.path}`);
      }
      const body = await getText(f.url);
      (0, import_node_fs17.mkdirSync)((0, import_node_path17.dirname)(target), { recursive: true });
      (0, import_node_fs17.writeFileSync)(target, body);
      written.push(target);
    }
  } catch (e) {
    try {
      (0, import_node_fs17.rmSync)(dest, { recursive: true, force: true });
    } catch {
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  return { ok: true, path: dest };
}
function uninstallSkill(skillPath, opts) {
  if (typeof skillPath !== "string" || !skillPath.trim()) return { ok: false, error: "no path given" };
  let target;
  try {
    target = (0, import_node_path17.resolve)(skillPath);
  } catch {
    return { ok: false, error: "unreadable path" };
  }
  const roots = [
    (0, import_node_path17.join)((0, import_node_os5.homedir)(), ".claude", "skills"),
    (0, import_node_path17.join)((0, import_node_os5.homedir)(), ".config", "opencode", "plugin"),
    (0, import_node_path17.join)((0, import_node_os5.homedir)(), ".codex", "plugins"),
    ...opts.cwds.filter(Boolean).flatMap((c) => [
      (0, import_node_path17.join)(c, ".claude", "skills"),
      (0, import_node_path17.join)(c, ".opencode", "plugin")
    ])
  ].map((r) => (0, import_node_path17.resolve)(r));
  const root = roots.find((r) => target.startsWith(r + import_node_path17.sep));
  if (!root) return { ok: false, error: "That folder is not inside a skills directory this app manages." };
  if (target === root) return { ok: false, error: "refusing to delete the skills directory itself" };
  if (!(0, import_node_fs17.existsSync)(target)) return { ok: false, error: "Already gone." };
  try {
    const st = (0, import_node_fs17.statSync)(target);
    if (st.isDirectory()) {
      if (!(0, import_node_fs17.existsSync)((0, import_node_path17.join)(target, "SKILL.md"))) {
        return { ok: false, error: "That folder has no SKILL.md \u2014 refusing to delete it." };
      }
    } else if (!st.isFile()) {
      return { ok: false, error: "Not a file or folder this app will remove." };
    }
  } catch {
    return { ok: false, error: "could not inspect that path" };
  }
  try {
    (0, import_node_fs17.rmSync)(target, { recursive: true, force: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// cth/main/hero.ts
var import_node_fs18 = require("node:fs");
var import_node_path18 = require("node:path");

// cth/shared/heroPayload.ts
var DEFAULT_HERO = {
  plan: {
    label: "Local",
    blurb: "Every agent runs on your machine, in your folders, under your own keys. No seat limit, nothing metered."
  },
  sponsor: null,
  notice: null
};
var MAX = { label: 24, blurb: 240, name: 48, notice: 160, url: 300 };
function str4(v, cap) {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > cap ? `${t.slice(0, cap - 1)}\u2026` : t;
}
function httpsUrl(v) {
  const s = str4(v, MAX.url);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}
function parseHeroPayload(raw) {
  if (!raw || typeof raw !== "object") return DEFAULT_HERO;
  const o = raw;
  const planIn = o.plan && typeof o.plan === "object" ? o.plan : {};
  const plan = {
    label: str4(planIn.label, MAX.label) ?? DEFAULT_HERO.plan.label,
    blurb: str4(planIn.blurb, MAX.blurb) ?? DEFAULT_HERO.plan.blurb
  };
  const upIn = planIn.upgrade && typeof planIn.upgrade === "object" ? planIn.upgrade : null;
  if (upIn) {
    const label = str4(upIn.label, MAX.label);
    const url = httpsUrl(upIn.url);
    if (label && url) plan.upgrade = { label, url };
  }
  let sponsor = null;
  const spIn = o.sponsor && typeof o.sponsor === "object" ? o.sponsor : null;
  if (spIn) {
    const name = str4(spIn.name, MAX.name);
    const url = httpsUrl(spIn.url);
    if (name && url) {
      sponsor = { name, blurb: str4(spIn.blurb, MAX.blurb) ?? "", url };
    }
  }
  return { plan, sponsor, notice: str4(o.notice, MAX.notice) };
}

// cth/main/hero.ts
var HERO_URL = "https://raw.githubusercontent.com/chaitanyagiri/munder-difflin/main/docs/hero.json";
var TTL_MS = 6 * 60 * 60 * 1e3;
async function loadHero(cachePath, opts = {}) {
  let cached = null;
  try {
    if ((0, import_node_fs18.existsSync)(cachePath)) cached = JSON.parse((0, import_node_fs18.readFileSync)(cachePath, "utf8"));
  } catch {
    cached = null;
  }
  if (cached && !opts.force && Date.now() - cached.fetchedAt < TTL_MS) {
    return { hero: cached.hero, fetchedAt: cached.fetchedAt, stale: false };
  }
  try {
    const body = await getText(HERO_URL, { timeoutMs: 8e3 });
    const hero = parseHeroPayload(JSON.parse(body));
    const payload = { hero, fetchedAt: Date.now() };
    try {
      (0, import_node_fs18.mkdirSync)((0, import_node_path18.dirname)(cachePath), { recursive: true });
      (0, import_node_fs18.writeFileSync)(cachePath, JSON.stringify(payload));
    } catch {
    }
    return { ...payload, stale: false };
  } catch {
    if (cached) return { hero: cached.hero, fetchedAt: cached.fetchedAt, stale: true };
    return { hero: DEFAULT_HERO, fetchedAt: 0, stale: true };
  }
}

// cth/shared/codexRemote.ts
var import_node_crypto7 = require("node:crypto");
var import_node_path19 = require("node:path");
var CODEX_REMOTE_SOCKET_RELATIVE = "app-server-control/app-server-control.sock";
var CODEX_REMOTE_ALIAS_ROOT = "/tmp/mdc";
var CODEX_REMOTE_SOCKET_MAX = 104;
function codexRemoteAliasPath(realHome, agentId, tempRoot = CODEX_REMOTE_ALIAS_ROOT) {
  const digest = (0, import_node_crypto7.createHash)("sha256").update(`${realHome}\0${agentId}`).digest("hex").slice(0, 8);
  return (0, import_node_path19.join)(tempRoot, digest);
}
function codexRemoteSocketFits(shortHome) {
  return (0, import_node_path19.join)(shortHome, CODEX_REMOTE_SOCKET_RELATIVE).length < CODEX_REMOTE_SOCKET_MAX;
}
function codexRemoteEndpoint(shortHome) {
  return `unix://${(0, import_node_path19.join)(shortHome, CODEX_REMOTE_SOCKET_RELATIVE)}`;
}
function withCodexRemoteArgs(args, endpoint) {
  if (args.includes("--remote")) return args;
  return ["--remote", endpoint, ...args];
}

// cth/main/index.ts
var { resolveConsoleAsset, startupDiagnosticHtml } = require_console_assets();
var isDev = !!process.env.ELECTRON_RENDERER_URL;
var isPackagedRuntime = import_electron10.app.isPackaged && !process.defaultApp;
var bundledConsoleProtocolInstalled = false;
var petWindow = null;
var tray = null;
async function installBundledConsoleProtocol() {
  if (!isPackagedRuntime || bundledConsoleProtocolInstalled) return;
  const consoleRoot = (0, import_node_path20.resolve)(process.resourcesPath, "console");
  await import_electron10.protocol.handle("radas-console", (request) => {
    const asset = resolveConsoleAsset(consoleRoot, request.url);
    if (!asset.filePath) {
      return new Response(asset.status === 403 ? "Forbidden" : "Not found", {
        status: asset.status
      });
    }
    return import_electron10.net.fetch((0, import_node_url.pathToFileURL)(asset.filePath).toString());
  });
  bundledConsoleProtocolInstalled = true;
}
function showMainWindow(route) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.show();
  mainWindow.focus();
  if (route) {
    const target = process.env.CONSOLE_URL?.replace(/\/+$/, "") || (isPackagedRuntime ? "radas-console://app" : "http://localhost:8080");
    void mainWindow.loadURL(`${target}${route.startsWith("/") ? route : `/${route}`}`);
  }
}
function createTray() {
  if (tray) return;
  const iconPath = (0, import_node_path20.join)(import_electron10.app.getAppPath(), "tray_favicon.png");
  const icon = import_electron10.nativeImage.createFromPath(iconPath);
  if (process.platform === "darwin") icon.setTemplateImage(true);
  tray = new import_electron10.Tray(icon);
  tray.setToolTip("RADAS Desktop Companion");
  tray.setContextMenu(import_electron10.Menu.buildFromTemplate([
    { label: "RADAS Desktop Companion", enabled: false },
    { type: "separator" },
    { label: "Show Pet Avatar", click: () => {
      petWindow?.show();
      petWindow?.focus();
    } },
    { label: "Open RADAS Console", click: () => showMainWindow("/office") },
    { type: "separator" },
    { label: "Quit RADAS", click: () => {
      allowQuit = true;
      import_electron10.app.quit();
    } }
  ]));
}
function registerPetBridge() {
  import_electron10.ipcMain.handle("get-screen-work-area", () => import_electron10.screen.getPrimaryDisplay());
  import_electron10.ipcMain.handle("get-pet-position", () => petWindow?.getPosition() ?? [0, 0]);
  import_electron10.ipcMain.on("set-pet-position", (_event, position) => {
    if (!petWindow || typeof position?.x !== "number" || typeof position?.y !== "number") return;
    petWindow.setPosition(Math.round(position.x), Math.round(position.y), false);
  });
  import_electron10.ipcMain.on("move-pet-window", (_event, delta) => {
    if (!petWindow) return;
    const [x, y] = petWindow.getPosition();
    petWindow.setPosition(x + Math.round(delta?.deltaX ?? 0), y + Math.round(delta?.deltaY ?? 0));
  });
  import_electron10.ipcMain.on("toggle-console", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else showMainWindow("/office");
  });
  import_electron10.ipcMain.on("open-console-at", (_event, payload) => showMainWindow(payload?.route || "/office"));
  import_electron10.ipcMain.handle("get-device-status", () => {
    const processorList = (0, import_node_os6.cpus)();
    const memoryTotal = (0, import_node_os6.totalmem)();
    const memoryFree = (0, import_node_os6.freemem)();
    return {
      platform: process.platform,
      arch: process.arch,
      cpuModel: processorList[0]?.model || "RADAS CPU",
      cpuCores: processorList.length,
      cpuUsagePct: 0,
      memUsagePct: Math.round((1 - memoryFree / memoryTotal) * 100),
      memFreeGB: +(memoryFree / 1024 ** 3).toFixed(1),
      memTotalGB: +(memoryTotal / 1024 ** 3).toFixed(1),
      loadAvg1m: +((0, import_node_os6.loadavg)()[0] || 0).toFixed(2),
      uptimeHours: Math.floor((0, import_node_os6.uptime)() / 3600),
      idleSeconds: import_electron10.powerMonitor.getSystemIdleTime(),
      currentHour: (/* @__PURE__ */ new Date()).getHours(),
      currentDay: (/* @__PURE__ */ new Date()).getDay()
    };
  });
  import_electron10.ipcMain.handle("get-radas-status", () => {
    const agents = Object.values(hive.registry().agents);
    const online = agents.filter((agent) => !agent.archived && agent.status !== "offline").length;
    return {
      authenticated: Boolean(readConfig().harnessHome),
      status: { workers: { total: agents.length, online }, approvals: { pending: 0 } },
      alerts: []
    };
  });
  import_electron10.ipcMain.handle("get-auth-status", () => ({ authenticated: Boolean(readConfig().harnessHome), username: null }));
}
function createPetWindow() {
  if (petWindow && !petWindow.isDestroyed()) return;
  const iconPath = (0, import_node_path20.join)(import_electron10.app.getAppPath(), "app_icon.png");
  petWindow = new import_electron10.BrowserWindow({
    width: 180,
    height: 160,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    show: false,
    title: "RADAS Pet",
    icon: iconPath,
    webPreferences: {
      preload: (0, import_node_path20.join)(import_electron10.app.getAppPath(), "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  petWindow.setAlwaysOnTop(true, "floating", 1);
  if (petWindow.setVisibleOnAllWorkspaces) petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.once("ready-to-show", () => petWindow?.show());
  petWindow.on("closed", () => {
    petWindow = null;
  });
  if (isPackagedRuntime) {
    void petWindow.loadFile((0, import_node_path20.join)(import_electron10.app.getAppPath(), "dist", "index.html"));
  } else {
    void petWindow.loadURL("http://localhost:20130").catch(() => {
      void petWindow?.loadFile((0, import_node_path20.join)(import_electron10.app.getAppPath(), "dist", "index.html"));
    });
  }
}
process.on("uncaughtException", (err) => {
  console.error("[main] uncaughtException (kept alive):", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[main] unhandledRejection (kept alive):", reason);
});
var ptyManager = new PtyManager();
function runCodexDaemonCommand(executable, args, env, timeoutMs = 2e4) {
  return new Promise((resolveResult) => {
    let settled = false;
    let stderr = "";
    let child;
    try {
      child = (0, import_node_child_process8.spawn)(executable, args, {
        env,
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true
      });
    } catch (e) {
      resolveResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
      return;
    }
    let timer;
    const finish2 = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult(result);
    };
    child.stderr?.on("data", (chunk) => {
      if (stderr.length < 8e3) stderr += String(chunk);
    });
    child.once("error", (e) => finish2({ ok: false, error: e.message }));
    child.once("exit", (code) => {
      finish2(code === 0 ? { ok: true } : { ok: false, error: stderr.trim() || `Codex exited with code ${code ?? "unknown"}` });
    });
    timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
      }
      finish2({ ok: false, error: `Codex daemon command timed out after ${timeoutMs}ms` });
    }, timeoutMs);
  });
}
async function enableCodexRemoteForSpawn(opts, agentId) {
  if (process.platform === "win32") return false;
  const realHome = opts.env?.CODEX_HOME;
  if (!realHome) return false;
  try {
    const alias = codexRemoteAliasPath(realHome, agentId);
    if (!codexRemoteSocketFits(alias)) {
      console.warn("[codex-remote] socket path exceeds sun_path; starting local TUI:", alias);
      return false;
    }
    const aliasRoot = (0, import_node_path20.dirname)(alias);
    (0, import_node_fs19.mkdirSync)(aliasRoot, { recursive: true });
    if ((0, import_node_fs19.existsSync)(alias)) {
      const st = (0, import_node_fs19.lstatSync)(alias);
      if (!st.isSymbolicLink() || (0, import_node_path20.resolve)((0, import_node_path20.dirname)(alias), (0, import_node_fs19.readlinkSync)(alias)) !== (0, import_node_path20.resolve)(realHome)) {
        console.warn("[codex-remote] short home alias is occupied; starting local TUI:", alias);
        return false;
      }
    } else {
      (0, import_node_fs19.symlinkSync)(realHome, alias, "dir");
    }
    const socket = (0, import_node_path20.join)(alias, CODEX_REMOTE_SOCKET_RELATIVE);
    const env = {
      ...process.env,
      ...opts.env ?? {},
      CODEX_HOME: alias
    };
    const executable = resolveCommand(opts.command);
    const started2 = await runCodexDaemonCommand(
      executable,
      ["app-server", "daemon", "start"],
      env
    );
    if (!started2.ok) {
      console.warn("[codex-remote] daemon start failed; starting local TUI:", started2.error);
      return false;
    }
    const enabled = await runCodexDaemonCommand(
      executable,
      ["app-server", "daemon", "enable-remote-control"],
      env
    );
    if (!enabled.ok) {
      console.warn("[codex-remote] enable failed; starting local TUI:", enabled.error);
      return false;
    }
    if (!(0, import_node_fs19.existsSync)(socket)) {
      console.warn("[codex-remote] daemon returned without a control socket; starting local TUI");
      return false;
    }
    opts.env = { ...opts.env ?? {}, CODEX_HOME: alias };
    opts.args = withCodexRemoteArgs(opts.args ?? [], codexRemoteEndpoint(alias));
    return true;
  } catch (e) {
    console.warn(
      "[codex-remote] setup failed; starting local TUI:",
      e instanceof Error ? e.message : e
    );
    return false;
  }
}
var ptyToAgent = /* @__PURE__ */ new Map();
var pendingInstallRelaunch = /* @__PURE__ */ new Map();
var hive = new HiveManager(
  () => readConfig().harnessHome,
  (channel, payload) => {
    const wc = liveWebContents();
    if (!wc) return false;
    try {
      wc.send(channel, payload);
      return true;
    } catch {
      return false;
    }
  }
);
var control = new ControlRegistry();
var telemetry = new TelemetryCollector({
  emit: (channel, payload) => {
    try {
      liveWebContents()?.send(channel, payload);
    } catch {
    }
  },
  resolveCwd: (agentId) => hive.registry().agents[agentId]?.cwd ?? null,
  // D11: scopes the transcript fallback to this agent's own session instead of
  // summing every transcript in a (routinely shared) cwd.
  resolveSessionId: (agentId) => hive.lastSession(agentId)
});
var usageProvider = telemetry;
var breaker = new CircuitBreaker(() => {
  const c = readConfig();
  return { ...c.circuitBreaker ?? {}, costCapUsd: c.costCapUsd, costCapTokens: c.costCapTokens, agentTokenCaps: c.agentTokenCaps };
});
var fleetTimer = null;
var breakerBeatTimer = null;
telemetry.onApiError((agentId) => breaker.recordError(agentId));
var roster = new RosterStore(() => readConfig().harnessHome);
function standingGoalFromRoster(agentId) {
  const snap = roster.read();
  if (!snap || !Array.isArray(snap.agents)) return null;
  for (const entry of snap.agents) {
    if (!entry || typeof entry !== "object") continue;
    const a = entry;
    if (a.id !== agentId) continue;
    return typeof a.goal === "string" && a.goal.trim() ? a.goal.trim() : null;
  }
  return null;
}
var workerWake = new WorkerWakeWatchdog();
var hookServer = new HookServer(
  hive,
  () => liveWebContents(),
  () => readConfig(),
  control,
  breaker,
  standingGoalFromRoster,
  (agentId, event, message) => workerWake.noteHook(agentId, event, message)
);
var memory = new MemoryManager(
  () => readConfig().harnessHome,
  () => {
    const c = readConfig();
    return { enabled: c.semanticMemory !== false, model: c.embeddingModel ?? "minilm" };
  }
);
var knowledge = new KnowledgeManager();
function reflectSettings() {
  const c = readConfig();
  return {
    enabled: c.reflectEnabled !== false,
    intervalMs: c.reflectIntervalMs ?? 18e5,
    byteTriggerPct: c.reflectByteTriggerPct ?? 50,
    sectionTrigger: c.reflectSectionTrigger ?? 50,
    recentKeep: c.reflectRecentKeep ?? 12,
    minBytes: c.reflectMinBytes ?? 16384
  };
}
var reflector = new MemoryReflector(
  () => readConfig().harnessHome,
  () => readConfig().defaultCommand ?? "claude",
  () => memory.env(),
  reflectSettings,
  (event) => {
    try {
      hive.appendLog(event);
    } catch {
    }
  }
);
var persist = new PersistStore();
var mainWindow = null;
var allWindows = /* @__PURE__ */ new Set();
var floorSeq = 0;
var allowQuit = false;
var worktreePaths = /* @__PURE__ */ new Map();
var worktreeOrigins = /* @__PURE__ */ new Map();
var liveWorkers = /* @__PURE__ */ new Map();
var integrationBroker = new IntegrationBroker({
  getRecord,
  getSecret
});
var BACKEND_KEY_ENV = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  groq: "GROQ_API_KEY"
};
var providerKeyRef = (backend) => `apikey:${backend}`;
var preservedWorktrees = /* @__PURE__ */ new Map();
function teardownPty(id) {
  const wasWorker = liveWorkers.has(id);
  try {
    integrationBroker.revoke(id);
  } catch {
  }
  const agentId = ptyToAgent.get(id);
  if (agentId) {
    ptyToAgent.delete(id);
    try {
      workerWake.forget(agentId, id);
    } catch {
    }
    try {
      breaker.forget(agentId);
    } catch {
    }
    try {
      telemetry.forgetAgent(agentId);
    } catch {
    }
    try {
      hive.stopProxyBridge(agentId);
    } catch (e) {
      console.error("[hive] stopProxyBridge failed:", e);
    }
    if (hive.enabled()) {
      try {
        hive.setArchived(agentId, true);
      } catch (e) {
        console.error("[hive] setArchived failed:", e);
      }
    }
  }
  const wtPath = worktreePaths.get(id);
  if (wtPath) {
    const origCwd = worktreeOrigins.get(id) ?? wtPath;
    worktreePaths.delete(id);
    worktreeOrigins.delete(id);
    const worker = liveWorkers.get(id);
    if (worker) {
      liveWorkers.delete(id);
      void finalizeWorkerWorktree(wtPath, origCwd, worker);
    } else {
      void removeWorktree(origCwd, wtPath).then((r) => {
        if (!r.ok) console.error("[worktree] removeWorktree failed:", r.error);
      }).catch((e) => console.error("[worktree] removeWorktree threw:", e));
    }
  }
  if (liveWorkers.has(id)) liveWorkers.delete(id);
  if (wasWorker) {
    try {
      liveWebContents()?.send("hive:agentArchived", { id });
    } catch {
    }
  }
  syncKeepAwake();
}
function informGod(subject, body, slack) {
  try {
    const slackLine = slack ? `

[SLACK] Close the loop \u2014 post a reply to channel ${slack.channel} thread ${slack.thread_ts} via:
  "${hive.nodeCommand()}" "${slackReplyScriptPath()}" --channel ${slack.channel} --thread ${slack.thread_ts} --text "<your message>"` : "";
    hive.send({ to: "god", act: "inform", subject, body: body + slackLine }, "ephemeral-worker");
  } catch (e) {
    console.error("[worker] informGod failed:", e);
  }
}
async function finalizeWorkerWorktree(wtPath, origCwd, worker) {
  try {
    const work = await worktreeHasUnintegratedWork(wtPath, worker.baseBranch);
    if (work.keep) {
      console.warn(`[worker] PRESERVING worktree with unintegrated work: ${wtPath} (${work.detail})`);
      preservedWorktrees.set(wtPath, {
        workerId: worker.workerId,
        wtPath,
        origCwd,
        baseBranch: worker.baseBranch,
        scratchDir: workerScratchDir(worker.workerId),
        slack: worker.slack,
        preservedAt: Date.now()
      });
      informGod(
        `[worker worktree preserved] ${worker.workerId}`,
        `Ephemeral worker ${worker.workerId} ended but its worktree holds unintegrated work, so it was NOT auto-removed (you are the sole integrator).
Worktree: ${wtPath}
Branch: ${work.branch}
State: ${work.detail}
Review/merge it \u2014 it will be auto-reclaimed once its work lands in ${worker.baseBranch}, or remove it now with: git -C "${origCwd}" worktree remove "${wtPath}"`,
        worker.slack
      );
      return;
    }
    const r = await removeWorktree(origCwd, wtPath);
    if (!r.ok) {
      console.error("[worker] removeWorktree failed:", r.error);
      return;
    }
    preservedWorktrees.set(wtPath, {
      workerId: worker.workerId,
      wtPath,
      origCwd,
      baseBranch: worker.baseBranch,
      scratchDir: workerScratchDir(worker.workerId),
      slack: worker.slack,
      preservedAt: Date.now()
    });
  } catch (e) {
    console.error("[worker] finalizeWorkerWorktree threw (worktree left in place):", e);
  }
}
function workerScratchDir(workerId) {
  const root = hive.root();
  return root ? (0, import_node_path20.join)(root, "agents", workerId) : null;
}
function removeWorkerScratch(workerId) {
  if (liveWorkers.has(workerId)) return;
  const dir = workerScratchDir(workerId);
  const root = hive.root();
  if (!dir || !root) return;
  const agentsRoot = (0, import_node_path20.join)(root, "agents");
  if ((0, import_node_path20.resolve)(dir) !== (0, import_node_path20.join)((0, import_node_path20.resolve)(agentsRoot), (0, import_node_path20.basename)(dir)) || (0, import_node_path20.basename)(dir) !== workerId) return;
  try {
    (0, import_node_fs19.rmSync)(dir, { recursive: true, force: true });
  } catch (e) {
    console.error("[worker] removeWorkerScratch failed:", e);
  }
}
ptyManager.setExitHandler((id, exitCode) => {
  const pending2 = pendingInstallRelaunch.get(id);
  if (pending2) {
    pendingInstallRelaunch.delete(id);
    const provider = pending2.opts.provider ?? inferAgentProvider(pending2.opts.command, void 0);
    if (exitCode === 0) {
      analytics.track("agent_install_finished", { provider, rung: pending2.rung, outcome: "agent_launched" });
      const wc = pending2.owner && !pending2.owner.isDestroyed() ? pending2.owner : liveWebContents();
      try {
        wc?.send(`pty:relaunch:${id}`);
      } catch {
      }
      void spawnAgentCore({ ...pending2.opts, noAutoInstall: true }, pending2.owner);
      return;
    }
    analytics.track("agent_install_finished", { provider, rung: pending2.rung, outcome: "install_failed" });
  }
  teardownPty(id);
});
var keepAwakeId = null;
var keepAwakeMode = null;
function syncKeepAwake() {
  const live = ptyManager.list().length > 0;
  const desired = live ? readConfig().strongKeepalive ? "prevent-display-sleep" : "prevent-app-suspension" : null;
  if (desired === keepAwakeMode) return;
  if (keepAwakeId !== null) {
    try {
      if (import_electron10.powerSaveBlocker.isStarted(keepAwakeId)) import_electron10.powerSaveBlocker.stop(keepAwakeId);
    } catch {
    }
    keepAwakeId = null;
  }
  keepAwakeMode = desired;
  if (desired) {
    keepAwakeId = import_electron10.powerSaveBlocker.start(desired);
    console.log(`[power] keep-awake ON (${desired}) \u2014 agents running`);
  } else {
    console.log("[power] keep-awake off \u2014 no agents");
  }
}
var missionTimers = /* @__PURE__ */ new Map();
function clearMissionTimers() {
  for (const t of missionTimers.values()) {
    if (t.timeout) clearTimeout(t.timeout);
    if (t.interval) clearInterval(t.interval);
  }
  missionTimers.clear();
}
function syncMissions() {
  clearMissionTimers();
  const missions = readConfig().missions ?? [];
  for (const m of missions) {
    if (!m.enabled) continue;
    const weekly = m.kind === "heartbeat" ? null : normalizeWeekly(m.weekly);
    if (!weekly && !(m.intervalMs > 0)) continue;
    if (m.kind === "heartbeat") {
      armHeartbeat(m);
      continue;
    }
    const fire = () => {
      try {
        if (m.kind !== "compact" && hive.enabled()) {
          hive.send({ to: m.to, act: "request", subject: m.label, body: m.body }, "scheduler");
        }
        if (m.autoCompact || m.kind === "compact") {
          emitContextTrigger("compact", contextRule("compact"));
        }
        const current = readConfig().missions ?? [];
        const next = current.map(
          (x) => x.id === m.id ? { ...x, lastFiredAt: Date.now() } : x
        );
        writeConfig({ missions: next });
        try {
          liveWebContents()?.send("missions:updated");
        } catch {
        }
      } catch (e) {
        console.error("[scheduler] mission", m.id, e);
      }
    };
    const entry = {};
    if (weekly) {
      const rearm = (justFired) => {
        const now = Date.now();
        const persisted = (readConfig().missions ?? []).find((x) => x.id === m.id)?.lastFiredAt ?? 0;
        const delay = weeklyDelayMs(weekly, now, justFired ? Math.max(persisted, now) : persisted);
        if (delay === null) return;
        entry.timeout = setTimeout(() => {
          fire();
          rearm(true);
        }, delay);
      };
      rearm(false);
      missionTimers.set(m.id, entry);
      continue;
    }
    const remaining = Math.max(0, m.intervalMs - (Date.now() - (m.lastFiredAt ?? 0)));
    entry.timeout = setTimeout(() => {
      fire();
      entry.interval = setInterval(fire, m.intervalMs);
    }, remaining);
    missionTimers.set(m.id, entry);
  }
}
var contextTimers = /* @__PURE__ */ new Map();
var CONTEXT_LAST_RUN_KV_KEY = "triggers.context.lastRun";
var contextLastRun = null;
function contextRunMap() {
  if (!contextLastRun) {
    try {
      contextLastRun = persist.getKv(CONTEXT_LAST_RUN_KV_KEY) ?? {};
    } catch {
      contextLastRun = {};
    }
  }
  return contextLastRun;
}
function contextLastRunAt(action) {
  const map = contextRunMap();
  const v = map[action];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return stampContextRun(action);
}
function stampContextRun(action) {
  const map = contextRunMap();
  const at = Date.now();
  map[action] = at;
  try {
    persist.setKv(CONTEXT_LAST_RUN_KV_KEY, map);
  } catch {
  }
  return at;
}
function contextRule(action) {
  return readConfig().contextTrigger?.[action] ?? DEFAULT_CONTEXT_TRIGGER[action];
}
function clearContextTimers() {
  for (const t of contextTimers.values()) {
    if (t.timeout) clearTimeout(t.timeout);
    if (t.interval) clearInterval(t.interval);
  }
  contextTimers.clear();
}
function emitContextTrigger(action, rule) {
  try {
    liveWebContents()?.send("trigger:context", { action, rule });
  } catch {
  }
  if (action === "compact") {
    try {
      liveWebContents()?.send("mission:autoCompact");
    } catch {
    }
  }
}
function syncContextTriggers() {
  clearContextTimers();
  for (const action of ["compact", "clear"]) {
    const rule = contextRule(action);
    if (!rule.enabled || !(rule.everyMs > 0)) continue;
    const fire = () => {
      try {
        stampContextRun(action);
        emitContextTrigger(action, contextRule(action));
      } catch (e) {
        console.error("[triggers] context", action, e);
      }
    };
    const remaining = Math.max(0, rule.everyMs - (Date.now() - contextLastRunAt(action)));
    const entry = {};
    entry.timeout = setTimeout(() => {
      fire();
      entry.interval = setInterval(fire, rule.everyMs);
    }, remaining);
    contextTimers.set(action, entry);
  }
}
function archiveOrphanedAgents() {
  if (!hive.enabled()) return;
  try {
    const reg = hive.registry();
    for (const [id, a] of Object.entries(reg.agents)) {
      if (a.archived) continue;
      if (id === reg.godId) continue;
      if (ptyForAgent(id)) continue;
      hive.setArchived(id, true);
      console.log("[migration] archived orphaned agent (no live PTY):", id);
    }
  } catch (e) {
    console.error("[migration] archiveOrphanedAgents failed:", e);
  }
}
function ensureDefaultMissions() {
  const cfg = readConfig();
  if (!cfg.opsStandupSeeded) {
    const missions = cfg.missions ?? [];
    const has = missions.some((m) => m.id === OPS_STANDUP_MISSION.id);
    writeConfig({
      missions: has ? missions : [...missions, { ...OPS_STANDUP_MISSION, lastFiredAt: Date.now() }],
      opsStandupSeeded: true
    });
  }
  const cfg2 = readConfig();
  if (!cfg2.heartbeatSeeded) {
    const missions = cfg2.missions ?? [];
    const has = missions.some((m) => m.id === HEARTBEAT_MISSION.id);
    writeConfig({
      missions: has ? missions : [...missions, { ...HEARTBEAT_MISSION, lastFiredAt: Date.now() }],
      heartbeatSeeded: true
    });
  }
  const cfg3 = readConfig();
  const missions3 = cfg3.missions ?? [];
  const retiring = missions3.find((m) => m.id === COMPACT_MAINTENANCE_MISSION.id);
  if (retiring) {
    const current = cfg3.contextTrigger ?? DEFAULT_CONTEXT_TRIGGER;
    writeConfig({
      missions: missions3.filter((m) => m.id !== COMPACT_MAINTENANCE_MISSION.id),
      contextTrigger: {
        ...current,
        compact: {
          ...current.compact,
          enabled: retiring.enabled,
          // A hand-tuned interval is a decision; only a missing/absurd one falls
          // back to whatever the trigger already carries.
          everyMs: retiring.intervalMs > 0 ? retiring.intervalMs : current.compact.everyMs
        }
      },
      compactMaintenanceSeeded: true
    });
    if (typeof retiring.lastFiredAt === "number" && retiring.lastFiredAt > 0) {
      const map = contextRunMap();
      map.compact = retiring.lastFiredAt;
      try {
        persist.setKv(CONTEXT_LAST_RUN_KV_KEY, map);
      } catch {
      }
    }
    console.log(
      "[triggers] retired the compact-maintenance mission into contextTrigger.compact",
      `(enabled: ${retiring.enabled}, everyMs: ${retiring.intervalMs})`
    );
  }
  const cfg4 = readConfig();
  const missions4 = cfg4.missions ?? [];
  if (missions4.some((m) => m.autoCompact)) {
    writeConfig({
      missions: missions4.map(({ autoCompact, ...rest }) => {
        void autoCompact;
        return rest;
      })
    });
    console.log(
      "[triggers] dropped the legacy per-mission autoCompact flag \u2014",
      "contextTrigger.compact is now the only schedule that compacts"
    );
  }
}
function isFloorQuiet(thresholdMs) {
  const root = hive.root();
  if (!root) return false;
  const times = [];
  const pushMtime = (p) => {
    try {
      times.push((0, import_node_fs19.statSync)(p).mtimeMs);
    } catch {
    }
  };
  pushMtime((0, import_node_path20.join)(root, "log.jsonl"));
  const agentsDir = (0, import_node_path20.join)(root, "agents");
  if ((0, import_node_fs19.existsSync)(agentsDir)) {
    for (const id of (0, import_node_fs19.readdirSync)(agentsDir)) {
      pushMtime((0, import_node_path20.join)(agentsDir, id, "inbox"));
      pushMtime((0, import_node_path20.join)(agentsDir, id, "outbox", ".sent"));
    }
  }
  for (const t of ptyManager.list()) times.push(t.lastOutputAt);
  if (times.length === 0) return false;
  return Date.now() - Math.max(...times) > thresholdMs;
}
function lastCoordinationAt(agentId) {
  const root = hive.root();
  if (!root) return 0;
  const times = [0];
  const pushMtime = (p) => {
    try {
      times.push((0, import_node_fs19.statSync)(p).mtimeMs);
    } catch {
    }
  };
  const dir = (0, import_node_path20.join)(root, "agents", agentId);
  pushMtime((0, import_node_path20.join)(dir, "inbox"));
  pushMtime((0, import_node_path20.join)(dir, "inbox", ".done"));
  pushMtime((0, import_node_path20.join)(dir, "outbox"));
  pushMtime((0, import_node_path20.join)(dir, "outbox", ".sent"));
  pushMtime((0, import_node_path20.join)(dir, "memory.md"));
  return Math.max(...times);
}
function ptyForAgent(agentId) {
  for (const [ptyId, a] of ptyToAgent) if (a === agentId) return ptyId;
  return void 0;
}
function looksStuck(windowMs) {
  const reg = hive.registry();
  const now = Date.now();
  for (const [id, a] of Object.entries(reg.agents)) {
    if (a.archived || id === reg.godId) continue;
    const ptyId = ptyForAgent(id);
    if (!ptyId) continue;
    const idle = ptyManager.idleFor(ptyId) ?? Infinity;
    if (idle < 15e3 && now - lastCoordinationAt(id) > windowMs) return true;
  }
  return false;
}
function buildHeartbeatDigest(quietMs, actionable = 0) {
  const reg = hive.registry();
  const active = Object.entries(reg.agents).filter(([id, a]) => !a.archived && id !== reg.godId);
  const names = active.map(([, a]) => a.name).join(", ") || "\u2014";
  const boardHead = hive.board().split("\n").slice(0, 10).join("\n").trim();
  const log = hive.logTail(8).map((e) => {
    try {
      return JSON.stringify(e);
    } catch {
      return "";
    }
  }).filter(Boolean).join("\n");
  const withInbox = active.filter(([id]) => hive.inbox(id).length > 0).map(([, a]) => a.name);
  const header = actionable > 0 ? `Floor heartbeat \u2014 ${actionable} actionable inbox message(s) awaiting you (worker/human mail). Drain your inbox NOW and act on them.` : `Floor heartbeat \u2014 quiet ~${Math.round(quietMs / 6e4)}m.`;
  return [
    header,
    `Active agents (${active.length}): ${names}.`,
    withInbox.length ? `Undrained inbox: ${withInbox.join(", ")}.` : "No undrained inboxes.",
    "",
    "Board (head):",
    boardHead || "(empty)",
    "",
    "Recent log:",
    log || "(none)",
    "",
    "Re-engage anyone stalled or blocked and keep the board accurate \u2014 or rest if the work is genuinely done."
  ].join("\n");
}
var SYSTEM_SENDERS = /* @__PURE__ */ new Set(["heartbeat", "scheduler", "breaker", "system"]);
function godActionableInboxCount() {
  try {
    const godId = hive.registry().godId;
    if (!godId) return 0;
    return hive.inbox(godId).filter((m) => !SYSTEM_SENDERS.has(m.from)).length;
  } catch {
    return 0;
  }
}
function reengageGod(digest) {
  if (!hive.enabled()) return;
  hive.send({ to: "god", act: "request", subject: "Heartbeat", body: digest }, "heartbeat");
}
function breakerToast(title, body) {
  if (!readConfig().notifications) return;
  try {
    if (import_electron10.Notification.isSupported()) new import_electron10.Notification({ title, body }).show();
  } catch {
  }
}
function runBreakerBeat(progressWindowMs) {
  if (!hive.enabled()) return;
  const reg = hive.registry();
  const now = Date.now();
  const inputs = [];
  for (const [id, a] of Object.entries(reg.agents)) {
    if (a.archived) continue;
    if (a.isAssistant) continue;
    if (id !== reg.godId && !ptyForAgent(id)) continue;
    const sample = usageProvider.getAgentUsage(id);
    if (sample?.sessionId) hive.appendCostLedger(sample);
    if (sample?.sessionId) hive.recordSession(id, sample.sessionId);
    if (id === reg.godId) continue;
    const spans = telemetry.getSpans(id);
    const lastSpanAt = spans.length ? spans[spans.length - 1].ts : 0;
    inputs.push({
      agentId: id,
      sample,
      progressing: now - lastCoordinationAt(id) < progressWindowMs || now - lastSpanAt < progressWindowMs
    });
  }
  for (const d of breaker.tick(inputs, now)) {
    try {
      liveWebContents()?.send("control:breakerState", d.state);
    } catch {
    }
    if (d.action === "none") continue;
    const name = reg.agents[d.state.agentId]?.name ?? d.state.agentId;
    const reason = d.state.reason;
    if (d.action === "steer") {
      hive.send({
        to: d.state.agentId,
        act: "request",
        subject: "Circuit breaker: steer",
        body: `Automated guardrail: ${reason}. Re-check your approach \u2014 if you're looping or stuck, STOP repeating, summarize what you've tried, and ask god for direction.`
      }, "breaker");
    } else if (d.action === "constrain") {
      hive.send({
        to: d.state.agentId,
        act: "request",
        subject: "Circuit breaker: constrain",
        body: `Automated guardrail escalated: ${reason}. Stop active work now: switch to read-only/plan, write a short plan of your next step, and send it to god for sign-off BEFORE running more tools.`
      }, "breaker");
      breakerToast(`${name} constrained`, reason);
    } else if (d.action === "stop") {
      const ptyId = ptyForAgent(d.state.agentId);
      if (ptyId) {
        try {
          ptyManager.kill(ptyId);
        } catch {
        }
        teardownPty(ptyId);
      }
      breakerToast(`${name} stopped by circuit breaker`, reason);
    }
  }
}
var costTotals = new CostLedgerTotals();
function writeFleetSnapshot() {
  if (!hive.enabled()) return;
  try {
    const reg = hive.registry();
    const snap = telemetry.snapshot();
    const usageById = new Map(snap.usage.map((u) => [u.agentId, u]));
    const now = Date.now();
    const hiveRoot = hive.root();
    if (hiveRoot) void costTotals.refresh((0, import_node_path20.join)(hiveRoot, "cost-ledger.jsonl"));
    const agents = Object.entries(reg.agents).filter(([, a]) => !a.archived).map(([id, a]) => {
      const u = usageById.get(id);
      const spans = snap.spans[id] ?? [];
      const tokens = u ? u.input + u.output + u.cacheRead + u.cacheCreation : 0;
      const lifetime = costTotals.usdFor(id);
      const sessionUsd = u ? Number(u.usd.toFixed(4)) : 0;
      return {
        id,
        name: a.name,
        role: a.role ?? (a.isGod ? "orchestrator" : "agent"),
        cwd: a.cwd,
        isGod: !!a.isGod,
        breaker: breaker.levelFor(id),
        tokens,
        usd: lifetime === null ? sessionUsd : Number(lifetime.toFixed(4)),
        sessionUsd,
        lastTool: spans.length ? spans[spans.length - 1].tool : null,
        lastActiveSecAgo: u ? Math.round((now - u.ts) / 1e3) : null,
        inboxBacklog: hive.inboxBacklog(id),
        onHold: !!a.onHold
      };
    });
    hive.writeFleetSnapshot({ ts: now, agents });
  } catch (e) {
    console.error("[fleet] snapshot failed:", e);
  }
}
function armHeartbeat(m) {
  const base = m.intervalMs;
  const quiet = m.quietThresholdMs ?? 3e5;
  const beat = () => {
    let next = base;
    try {
      const actionable = godActionableInboxCount();
      if (isFloorQuiet(quiet) || actionable > 0) {
        reengageGod(buildHeartbeatDigest(quiet, actionable));
        next = Math.round(base * 2.5);
      } else if (looksStuck(quiet)) {
        next = Math.max(3e4, Math.round(base / 4));
      }
      const cur = readConfig().missions ?? [];
      writeConfig({ missions: cur.map((x) => x.id === m.id ? { ...x, lastFiredAt: Date.now() } : x) });
      try {
        liveWebContents()?.send("missions:updated");
      } catch {
      }
    } catch (e) {
      console.error("[heartbeat]", e);
    }
    const entry = missionTimers.get(m.id) ?? {};
    entry.timeout = setTimeout(beat, next);
    missionTimers.set(m.id, entry);
  };
  const remaining = Math.max(0, base - (Date.now() - (m.lastFiredAt ?? 0)));
  missionTimers.set(m.id, { timeout: setTimeout(beat, remaining) });
}
function liveWebContents() {
  const wc = mainWindow?.webContents;
  if (wc && !wc.isDestroyed()) return wc;
  for (const w of allWindows) {
    if (!w.isDestroyed() && !w.webContents.isDestroyed()) return w.webContents;
  }
  return null;
}
var slackServer = null;
var slackReplyServer = null;
var lastSlackUrl;
function buildAutonomousRequestProtocol(channel, threadTs, helperPath) {
  return `[AUTONOMOUS REQUEST PROTOCOL \u2014 this request arrived via Slack; no interactive human is watching] Handle it under this protocol:
1. ROUTE FAST \u2014 triage and hand this to the single most-relevant agent right away. CHECK THE LIVE ROSTER FIRST (active agents in registry.json + their state in fleet.json) and prefer an EXISTING agent that fits \u2014 especially when the request names one ("ask Pam\u2026", "have Jim\u2026"): route to that agent and only spawn a new one if none is a sensible fit. Decompose only if it genuinely needs several. Don't sit on it.
2. DELEGATE WITH THE REPLY HANDLE \u2014 tell that agent to do the work autonomously AND to post its result back to THIS Slack thread itself when done, using exactly: "${hive.nodeCommand()}" "${helperPath}" --channel ${channel} --thread ${threadTs} --text "<substantive result>" (that first path is the harness's bundled Node, already resolved for this machine \u2014 pass it verbatim; bare "node" is not on the hook/agent PATH on many machines.)
3. AUTONOMOUS EXECUTION \u2014 no interactive questions. PAUSE/ask ONLY for high-severity actions: pushing to main or any remote; buying or spawning infrastructure or paid services; deleting an existing repo, file, or folder it did not create. Stay READ-ONLY at critical infrastructure and git-push-type changes unless explicitly approved.
4. DIRECT, SUBSTANTIVE REPLY \u2014 the agent posts a real Slack-mrkdwn answer (short *bold* headline + the actual outcome/specifics/links), NEVER a bare "done"/":white_check_mark:".
5. REPORT TO GOD \u2014 the agent then tells you (Michael) what it did.
6. ASYNC QUESTIONS \u2014 if a decision is genuinely needed, don't block: post the question + numbered OPTIONS to the thread via that reply command, and record {q, options, askedAt (ISO + day & time), thread_ts ${threadTs}} so the threaded human reply correlates back and resumes.
The user's message starts now: `;
}
var slackDoneTimer = null;
var slackDonePolling = false;
var slackDoneNotified = null;
var slackDoneBaseline = null;
var directlyRepliedThreads = /* @__PURE__ */ new Set();
function slackReplyScriptPath() {
  return import_electron10.app.isPackaged ? (0, import_node_path20.join)(process.resourcesPath, "md-slack-reply.cjs") : (0, import_node_path20.join)(import_electron10.app.getAppPath(), "resources", "md-slack-reply.cjs");
}
function skillsResourceDir() {
  return import_electron10.app.isPackaged ? (0, import_node_path20.join)(process.resourcesPath, "skills") : (0, import_node_path20.join)(import_electron10.app.getAppPath(), "resources", "skills");
}
function slackReplyConfigPath() {
  return (0, import_node_path20.join)(import_electron10.app.getPath("userData"), "slack-reply.json");
}
function slackDoneNotifiedPath() {
  return (0, import_node_path20.join)(import_electron10.app.getPath("userData"), "slack-done-notified.json");
}
function slackFilesDir() {
  return (0, import_node_path20.join)(import_electron10.app.getPath("userData"), "slack-files");
}
var SLACK_FILE_MAX_BYTES = 10 * 1024 * 1024;
function sanitizeSlackFilename(name, tag) {
  const safe = typeof name === "string" && name ? (0, import_node_path20.basename)(name).replace(/[^\w.\-]/g, "_").replace(/^\.+/, "_").slice(0, 200) || "file" : "file";
  return `${tag}-${safe}`;
}
function downloadSlackFile(file, botToken, destDir) {
  return new Promise((resolve4) => {
    const tag = (0, import_node_crypto8.randomBytes)(4).toString("hex");
    const filename = sanitizeSlackFilename(file.name, tag);
    const destPath = (0, import_node_path20.join)(destDir, filename);
    const name = file.name ?? filename;
    const mimetype = file.mimetype ?? "application/octet-stream";
    try {
      (0, import_node_fs19.mkdirSync)(destDir, { recursive: true });
    } catch {
      resolve4(null);
      return;
    }
    let urlObj;
    try {
      urlObj = new URL(file.url_private);
    } catch {
      resolve4(null);
      return;
    }
    if (urlObj.protocol !== "https:") {
      resolve4(null);
      return;
    }
    const req = (0, import_node_https4.request)(
      {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: "GET",
        headers: { authorization: `Bearer ${botToken}` }
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          res.resume();
          resolve4(null);
          return;
        }
        let written = 0;
        let aborted = false;
        const stream = (0, import_node_fs19.createWriteStream)(destPath);
        res.on("data", (chunk) => {
          if (aborted) return;
          written += chunk.length;
          if (written > SLACK_FILE_MAX_BYTES) {
            aborted = true;
            stream.destroy();
            try {
              (0, import_node_fs19.unlinkSync)(destPath);
            } catch {
            }
            res.destroy();
            resolve4(null);
            return;
          }
          stream.write(chunk);
        });
        res.on("end", () => {
          if (aborted) return;
          stream.end(() => resolve4({ path: destPath, name, mimetype }));
        });
        res.on("error", () => {
          stream.destroy();
          resolve4(null);
        });
        stream.on("error", () => {
          res.destroy();
          resolve4(null);
        });
      }
    );
    req.on("error", () => resolve4(null));
    req.end();
  });
}
async function downloadSlackFiles(rawFiles, botToken) {
  if (!rawFiles.length || !botToken) return [];
  const destDir = slackFilesDir();
  const results = await Promise.all(
    rawFiles.map((f) => downloadSlackFile(f, botToken, destDir))
  );
  return results.filter((r) => r !== null);
}
function loadSlackDoneNotified() {
  try {
    const arr = JSON.parse((0, import_node_fs19.readFileSync)(slackDoneNotifiedPath(), "utf8"));
    if (Array.isArray(arr)) return new Set(arr.filter((x) => typeof x === "string"));
  } catch {
  }
  return /* @__PURE__ */ new Set();
}
function persistSlackDoneNotified(set) {
  try {
    (0, import_node_fs19.writeFileSync)(slackDoneNotifiedPath(), JSON.stringify([...set]));
  } catch (e) {
    console.error("[slack] could not persist done-notify ledger:", e);
  }
}
var TERMINAL_SLACK_ERRORS = /* @__PURE__ */ new Set([
  "missing_scope",
  "invalid_auth",
  "not_authed",
  "account_inactive",
  "token_revoked",
  "token_expired",
  "no_permission",
  "channel_not_found",
  "not_in_channel",
  "is_archived",
  "restricted_action",
  "org_login_required"
]);
function slackDoneSummary(task) {
  const body = (task.result ?? task.description ?? "").trim();
  const head = `:white_check_mark: *${task.title}*`;
  const text = body ? `${head}

${body}` : head;
  return text.length > 2800 ? `${text.slice(0, 2799)}\u2026` : text;
}
async function pollSlackDoneTasks() {
  if (slackDonePolling) return;
  const botToken = readConfig().slackBotToken;
  if (!botToken) return;
  let tasks;
  try {
    const ledger = hive.tasks();
    tasks = Array.isArray(ledger?.tasks) ? ledger.tasks : [];
  } catch {
    return;
  }
  const notified = slackDoneNotified ?? (slackDoneNotified = loadSlackDoneNotified());
  if (slackDoneBaseline === null) {
    slackDoneBaseline = new Set(tasks.filter((t) => t.status === "done").map((t) => t.id));
    return;
  }
  const baseline = slackDoneBaseline;
  slackDonePolling = true;
  try {
    for (const t of tasks) {
      if (t.status !== "done") continue;
      if (baseline.has(t.id) || notified.has(t.id)) continue;
      const slack = t.slack;
      if (!slack || !slack.channel || !slack.thread_ts) continue;
      if (directlyRepliedThreads.has(slack.thread_ts)) {
        notified.add(t.id);
        persistSlackDoneNotified(notified);
        continue;
      }
      if (!(t.result ?? t.description ?? "").trim()) {
        notified.add(t.id);
        persistSlackDoneNotified(notified);
        continue;
      }
      const res = await postSlackReply({
        botToken,
        channel: slack.channel,
        thread_ts: slack.thread_ts,
        text: slackDoneSummary(t)
      });
      if (res.ok) {
        notified.add(t.id);
        persistSlackDoneNotified(notified);
      } else if (res.error && TERMINAL_SLACK_ERRORS.has(res.error)) {
        notified.add(t.id);
        persistSlackDoneNotified(notified);
        console.error(
          "[slack] done-summary post for task",
          t.id,
          "\u2014 giving up (terminal error:",
          res.error + "). Fix the Slack bot scope/permissions; later tasks post once resolved."
        );
      } else {
        console.error("[slack] done-summary post failed for task", t.id, "-", res.error, "(will retry)");
      }
    }
  } finally {
    slackDonePolling = false;
  }
}
function startSlackDoneObserver() {
  if (slackDoneTimer) return;
  slackDoneNotified = loadSlackDoneNotified();
  slackDoneBaseline = null;
  slackDoneTimer = setInterval(() => {
    void pollSlackDoneTasks();
  }, 5e3);
}
function stopSlackDoneObserver() {
  if (slackDoneTimer) {
    clearInterval(slackDoneTimer);
    slackDoneTimer = null;
  }
  slackDoneBaseline = null;
}
async function startSlackServer() {
  const cfg = readConfig();
  if (!cfg.slackEnabled || !cfg.slackSigningSecret) {
    return { ok: false, error: "slack disabled or missing signing secret" };
  }
  slackServer?.stop();
  slackServer = new SlackWebhookServer({
    port: cfg.slackPort && cfg.slackPort > 0 ? cfg.slackPort : 3847,
    signingSecret: cfg.slackSigningSecret,
    channelId: cfg.slackChannelId,
    // Fires from the HTTP server's event loop (not the IPC thread); route through
    // liveWebContents() so a message arriving during window teardown can't throw.
    // Downloads any file attachments (bot token stays in main; local paths go to IPC).
    onMessage: async (m) => {
      const localFiles = await downloadSlackFiles(
        m._rawFiles ?? [],
        readConfig().slackBotToken
      );
      const ipcMsg = {
        text: m.text,
        channel: m.channel,
        ts: m.ts,
        thread_ts: m.thread_ts,
        autonomyPreamble: buildAutonomousRequestProtocol(m.channel, m.thread_ts, slackReplyScriptPath())
      };
      if (localFiles.length > 0) ipcMsg.files = localFiles;
      try {
        liveWebContents()?.send("slack:incomingMessage", ipcMsg);
      } catch {
      }
    }
  });
  const res = await slackServer.start();
  if (!res.ok) {
    slackServer = null;
    return res;
  }
  if (res.url) lastSlackUrl = res.url;
  await startSlackReplyServer();
  startSlackDoneObserver();
  analytics.trackFeature("slack_trigger");
  return res;
}
async function startSlackReplyServer() {
  slackReplyServer?.stop();
  const token = (0, import_node_crypto8.randomBytes)(24).toString("hex");
  slackReplyServer = new SlackReplyServer({
    token,
    getBotToken: () => readConfig().slackBotToken,
    // An agent posted a DIRECT substantive reply into this thread → record it so the
    // done-summary poller skips it (the poller is a fallback, not a duplicator).
    onReplied: (thread_ts) => {
      directlyRepliedThreads.add(thread_ts);
    }
  });
  const r = await slackReplyServer.start();
  if (!r.ok || r.port === void 0) {
    console.error("[slack] reply endpoint failed to start:", r.error);
    slackReplyServer = null;
    return;
  }
  try {
    (0, import_node_fs19.writeFileSync)(slackReplyConfigPath(), JSON.stringify({ port: r.port, token }), { mode: 384 });
  } catch (e) {
    console.error("[slack] could not write reply config:", e);
  }
}
function stopSlackServer() {
  try {
    slackServer?.stop();
  } catch (e) {
    console.error("[slack] stop failed:", e);
  }
  slackServer = null;
  try {
    slackReplyServer?.stop();
  } catch (e) {
    console.error("[slack] reply stop failed:", e);
  }
  slackReplyServer = null;
  stopSlackDoneObserver();
  try {
    if ((0, import_node_fs19.existsSync)(slackReplyConfigPath())) (0, import_node_fs19.unlinkSync)(slackReplyConfigPath());
  } catch {
  }
}
var webhookServer = null;
var lastWebhookUrl;
var WEBHOOK_DEFAULT_PORT = 3849;
function enabledWebhookEndpoints() {
  return (readConfig().webhookTriggers ?? []).filter((t) => t.enabled && !!t.secret);
}
function hashWebhookToken(token) {
  return (0, import_node_crypto8.createHash)("sha256").update(token).digest("hex");
}
var heldWebhookTokens = null;
var HELD_TOKENS_KV_KEY = "triggers.webhook.heldTokens";
function heldTokens() {
  if (heldWebhookTokens) return heldWebhookTokens;
  let stored;
  try {
    stored = persist.getKv(HELD_TOKENS_KV_KEY);
  } catch {
    stored = void 0;
  }
  const entries = stored && typeof stored === "object" ? Object.entries(stored) : [];
  heldWebhookTokens = new Map(entries.filter((e) => typeof e[1] === "string"));
  return heldWebhookTokens;
}
function persistHeldTokens() {
  try {
    persist.setKv(HELD_TOKENS_KV_KEY, Object.fromEntries(heldTokens()));
  } catch (e) {
    console.error("[webhook] could not persist held-token map:", e);
  }
}
function pruneHeldTokens() {
  const map = heldTokens();
  if (map.size === 0) return;
  const live = new Set(listTriggerHistory().map((e) => e.id));
  let changed = false;
  for (const [hash, entryId] of [...map]) {
    if (!live.has(entryId)) {
      map.delete(hash);
      changed = true;
    }
  }
  if (changed) persistHeldTokens();
}
function heldTokenHashFor(entryId) {
  for (const [hash, id] of heldTokens()) if (id === entryId) return hash;
  return void 0;
}
function notifyTriggerHistoryUpdated() {
  try {
    liveWebContents()?.send("triggerHistory:updated");
  } catch {
  }
}
function dispatchWebhookWork(arg) {
  try {
    const card = {
      id: arg.taskId,
      title: arg.title,
      description: arg.message,
      status: "todo",
      dependsOn: [],
      priority: 1,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      ...arg.tokenHash ? { webhook: { tokenHash: arg.tokenHash } } : {}
    };
    hive.addTask(card);
  } catch (e) {
    console.error("[webhook] could not create task card:", e instanceof Error ? e.message : e);
    return false;
  }
  try {
    hive.send({
      to: "god",
      act: "request",
      subject: `[${arg.origin}] ${arg.title}`,
      body: `${arg.message}

(Inbound via the generic ${arg.origin} API, tracked as kanban card ${arg.taskId}. When this work is finished, set that card's status to 'done' and fill its 'result' so the caller's status check reflects the outcome.)`,
      requires_reply: false
    }, "webhook");
  } catch (e) {
    console.error("[webhook] could not route to god:", e instanceof Error ? e.message : e);
  }
  return true;
}
function handleWebhookMessage(msg, endpoint) {
  const token = (0, import_node_crypto8.randomBytes)(24).toString("hex");
  const tokenHash = hashWebhookToken(token);
  const full = msg.title ?? msg.message;
  const title = full.length > 80 ? `${full.slice(0, 79)}\u2026` : full;
  const trigger = (readConfig().webhookTriggers ?? []).find((t) => t.id === endpoint.id);
  const mode = trigger?.mode ?? DEFAULT_TRIGGER_MODE;
  const kind = msg.kind ?? classifyInboundKind(msg.message);
  const peer = msg.from?.trim() || endpoint.name || endpoint.id;
  const correlationId = (0, import_node_crypto8.randomBytes)(8).toString("hex");
  const base = {
    source: "webhook",
    sourceId: endpoint.id,
    sourceName: endpoint.name,
    direction: "inbound",
    peer,
    title,
    body: msg.message,
    kind,
    correlationId
  };
  if (!isAutoAllowed(mode, kind)) {
    const entry = appendTriggerHistory({ ...base, decision: "pending" });
    heldTokens().set(tokenHash, entry.id);
    persistHeldTokens();
    notifyTriggerHistoryUpdated();
    return { token, pending: true };
  }
  const taskId = `webhook-${(0, import_node_crypto8.randomBytes)(8).toString("hex")}`;
  if (!dispatchWebhookWork({ taskId, title, message: msg.message, tokenHash, origin: "webhook" })) return null;
  appendTriggerHistory({ ...base, decision: "auto-allowed", taskId });
  notifyTriggerHistoryUpdated();
  return { token, taskId, pending: false };
}
function lookupWebhookStatus(token) {
  const hash = hashWebhookToken(token);
  const heldEntryId = heldTokens().get(hash);
  if (heldEntryId) {
    const entry = listTriggerHistory().find((e) => e.id === heldEntryId);
    if (!entry) {
      heldTokens().delete(hash);
      persistHeldTokens();
      return null;
    }
    if (entry.decision === "pending") {
      return { status: "awaiting-approval", title: entry.title ?? "" };
    }
    if (entry.decision === "rejected") {
      return { status: "rejected", title: entry.title ?? "" };
    }
  }
  const wanted = Buffer.from(hash);
  let tasks;
  try {
    const ledger = hive.tasks();
    tasks = Array.isArray(ledger?.tasks) ? ledger.tasks : [];
  } catch {
    return null;
  }
  for (const t of tasks) {
    const h = t.webhook?.tokenHash;
    if (!h) continue;
    const have = Buffer.from(h);
    if (have.length === wanted.length && (0, import_node_crypto8.timingSafeEqual)(have, wanted)) {
      return { status: t.status, title: t.title, result: t.result };
    }
  }
  return null;
}
var webhookDoneTimer = null;
var webhookOutboundRecorded = null;
function seedWebhookOutbound() {
  const seen = /* @__PURE__ */ new Set();
  try {
    for (const e of listTriggerHistory()) {
      if (e.direction === "outbound" && e.taskId) seen.add(e.taskId);
    }
  } catch {
  }
  return seen;
}
function pollWebhookDoneTasks() {
  let tasks;
  try {
    const ledger = hive.tasks();
    tasks = Array.isArray(ledger?.tasks) ? ledger.tasks : [];
  } catch {
    return;
  }
  const done = tasks.filter((t) => t.status === "done" && (t.webhook != null || t.id.startsWith("webhook-")));
  if (done.length === 0) return;
  const recorded = webhookOutboundRecorded ?? (webhookOutboundRecorded = seedWebhookOutbound());
  const fresh = done.filter((t) => !recorded.has(t.id));
  if (fresh.length === 0) return;
  const history = listTriggerHistory();
  let wrote = false;
  for (const t of fresh) {
    const inbound = history.find((e) => e.direction === "inbound" && e.taskId === t.id);
    if (!inbound) {
      recorded.add(t.id);
      continue;
    }
    appendTriggerHistory({
      source: inbound.source,
      sourceId: inbound.sourceId,
      sourceName: inbound.sourceName,
      direction: "outbound",
      peer: inbound.peer,
      title: t.title,
      body: (t.result ?? "").trim() || "(finished with no result recorded)",
      kind: inbound.kind,
      correlationId: inbound.correlationId,
      taskId: t.id
    });
    recorded.add(t.id);
    wrote = true;
  }
  if (wrote) notifyTriggerHistoryUpdated();
}
function startWebhookDoneObserver() {
  if (webhookDoneTimer) return;
  webhookOutboundRecorded = seedWebhookOutbound();
  webhookDoneTimer = setInterval(() => {
    try {
      pollWebhookDoneTasks();
    } catch (e) {
      console.error("[webhook] done-observer:", e);
    }
  }, 5e3);
}
function stopWebhookDoneObserver() {
  if (webhookDoneTimer) {
    clearInterval(webhookDoneTimer);
    webhookDoneTimer = null;
  }
  webhookOutboundRecorded = null;
}
async function startWebhookServer() {
  const endpoints = enabledWebhookEndpoints();
  if (endpoints.length === 0) return { ok: false, error: "no enabled webhook endpoints" };
  if (webhookServer) {
    webhookServer.setEndpoints(endpoints);
    return { ok: true, url: webhookServer.publicUrl() ?? lastWebhookUrl };
  }
  pruneHeldTokens();
  const cfg = readConfig();
  const server = new WebhookServer({
    port: cfg.webhookPort && cfg.webhookPort > 0 ? cfg.webhookPort : WEBHOOK_DEFAULT_PORT,
    endpoints,
    onMessage: handleWebhookMessage,
    lookupStatus: lookupWebhookStatus
  });
  webhookServer = server;
  const res = await server.start();
  if (!res.ok && !server.listening()) {
    webhookServer = null;
    return res;
  }
  analytics.trackFeature("webhook_trigger");
  if (res.url) lastWebhookUrl = res.url;
  startWebhookDoneObserver();
  return res;
}
function reconcileWebhookServer() {
  const endpoints = enabledWebhookEndpoints();
  if (endpoints.length === 0) {
    stopWebhookServer();
    return;
  }
  if (webhookServer) {
    webhookServer.setEndpoints(endpoints);
    return;
  }
  void startWebhookServer().then((r) => {
    if (!r.ok) console.error("[webhook] start failed:", r.error);
    else console.log("[webhook] listening", r.url ? `(tunnel: ${r.url})` : "(no tunnel)");
  });
}
function webhookEndpointUrls() {
  const base = (webhookServer?.publicUrl() ?? lastWebhookUrl ?? "").replace(/\/+$/, "");
  return (readConfig().webhookTriggers ?? []).map((t) => ({
    id: t.id,
    url: base ? `${base}/${encodeURIComponent(t.id)}` : ""
  }));
}
function stopWebhookServer() {
  try {
    webhookServer?.stop();
  } catch (e) {
    console.error("[webhook] stop failed:", e);
  }
  webhookServer = null;
}
var DEFAULT_WIN = { width: 1440, height: 900 };
var MIN_WIN = { width: 1280, height: 800 };
function clampBounds(b) {
  if (!b || typeof b !== "object") return null;
  const r = b;
  if (typeof r.width !== "number" || typeof r.height !== "number") return null;
  const width = Math.max(MIN_WIN.width, Math.round(r.width));
  const height = Math.max(MIN_WIN.height, Math.round(r.height));
  if (typeof r.x !== "number" || typeof r.y !== "number") return { width, height };
  const x = Math.round(r.x), y = Math.round(r.y);
  const onScreen = import_electron10.screen.getAllDisplays().some((d) => {
    const wa = d.workArea;
    return x < wa.x + wa.width && x + width > wa.x && y < wa.y + wa.height && y + height > wa.y;
  });
  return onScreen ? { x, y, width, height } : { width, height };
}
function debounce(fn, ms) {
  let t = null;
  return () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn();
    }, ms);
  };
}
function floorCascade() {
  const base = mainWindow && !mainWindow.isDestroyed() ? mainWindow : [...allWindows].find((w) => !w.isDestroyed());
  if (!base) return null;
  const b = base.getBounds();
  const OFFSET = 36;
  return clampBounds({ x: b.x + OFFSET, y: b.y + OFFSET, width: b.width, height: b.height });
}
var pendingHires = [];
var rendererReadyForHires = false;
function deliverHire(manifest) {
  if (rendererReadyForHires && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send("hire:import", manifest);
  } else {
    pendingHires.push(manifest);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  }
}
async function handleHireLink(link) {
  const src = parseHireDeepLink(link);
  if (!src) {
    console.warn("[hire] ignoring malformed deep link");
    return;
  }
  const res = await fetchHireManifest(src);
  if (!res.ok) {
    console.error("[hire] deep link rejected:", res.error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("hire:error", { error: res.error });
    }
    return;
  }
  deliverHire(res.manifest);
  analytics.trackFeature("hire_install");
}
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    import_electron10.app.setAsDefaultProtocolClient("munderdifflin", process.execPath, [(0, import_node_path20.resolve)(process.argv[1])]);
  }
} else {
  import_electron10.app.setAsDefaultProtocolClient("munderdifflin");
}
var gotInstanceLock = import_electron10.app.requestSingleInstanceLock();
if (!gotInstanceLock) {
  allowQuit = true;
  import_electron10.app.quit();
} else {
  import_electron10.app.on("second-instance", (_evt, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    const link = argv.find((a) => a.startsWith("munderdifflin://"));
    if (link) void handleHireLink(link);
  });
}
import_electron10.app.on("open-url", (evt, url) => {
  evt.preventDefault();
  void handleHireLink(url);
});
import_electron10.ipcMain.handle("hire:drainPending", () => {
  rendererReadyForHires = true;
  const out = pendingHires.splice(0, pendingHires.length);
  return out;
});
import_electron10.ipcMain.handle("hire:openFile", async () => {
  const res = await import_electron10.dialog.showOpenDialog({
    title: "Import hire manifests",
    filters: [{ name: "Hire manifest", extensions: ["json"] }],
    properties: ["openFile", "multiSelections"]
  });
  if (res.canceled || res.filePaths.length === 0) {
    return { ok: false, manifests: [], errors: [], error: "cancelled" };
  }
  const batch = readHireManifestFiles(res.filePaths);
  return {
    ok: batch.manifests.length > 0,
    ...batch,
    error: batch.manifests.length === 0 ? "no valid hire manifests selected" : void 0
  };
});
function createWindow(opts = {}) {
  const isFloor = opts.floor === true;
  let saved = null;
  if (!isFloor) {
    try {
      saved = clampBounds(persist.getKv("window.bounds"));
    } catch {
      saved = null;
    }
  }
  const cascade = isFloor ? floorCascade() : null;
  const geom = cascade ?? saved;
  const win = new import_electron10.BrowserWindow({
    width: geom?.width ?? DEFAULT_WIN.width,
    height: geom?.height ?? DEFAULT_WIN.height,
    ...geom && geom.x !== void 0 && geom.y !== void 0 ? { x: geom.x, y: geom.y } : {},
    minWidth: MIN_WIN.width,
    minHeight: MIN_WIN.height,
    title: isFloor ? "RADAS \u2014 Floor" : "RADAS",
    backgroundColor: "#FFF8E7",
    titleBarStyle: "hiddenInset",
    show: false,
    webPreferences: {
      preload: (0, import_node_path20.join)(__dirname, "..", "preload.js"),
      // Keep Chromium's OS renderer sandbox active; privileged work stays behind
      // the narrow contextBridge/IPC surface owned by the main process.
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      // The renderer runs the hive's heartbeat loops (inbox nudge, message
      // flush, telemetry polls). Chromium throttles timers in occluded windows
      // — incl. behind the LOCK SCREEN — which silently stalls the hive while
      // the user is away. Don't.
      backgroundThrottling: false,
      // Each floor gets its OWN persistent session partition → isolated
      // localStorage so floors never share or stomp each other's office state.
      // The primary keeps the DEFAULT session so existing persisted state loads.
      ...isFloor ? { partition: `persist:floor-${++floorSeq}` } : {}
    }
  });
  const wc = win.webContents;
  allWindows.add(win);
  win.on("focus", () => {
    mainWindow = win;
  });
  if (!isFloor) mainWindow = win;
  const micFeatureLive = () => {
    const cfg = readConfig();
    return cfg.freeflowEnabled === true || cfg.realtimeVoiceEnabled === true;
  };
  const ses = win.webContents.session;
  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    if (permission === "media") {
      const mediaTypes = details && "mediaTypes" in details ? details.mediaTypes : void 0;
      const wantsAudio = !mediaTypes || mediaTypes.includes("audio");
      callback(micFeatureLive() && wantsAudio);
      return;
    }
    callback(true);
  });
  ses.setPermissionCheckHandler((_wc, permission) => {
    if (permission === "media") return micFeatureLive();
    return true;
  });
  if (!isFloor) {
    const saveBounds = debounce(() => {
      if (win.isDestroyed() || win.isMinimized() || win.isMaximized()) return;
      try {
        persist.setKv("window.bounds", win.getBounds());
      } catch {
      }
    }, 400);
    win.on("resized", saveBounds);
    win.on("moved", saveBounds);
    win.on("close", () => {
      if (win.isDestroyed() || win.isMinimized() || win.isMaximized()) return;
      try {
        persist.setKv("window.bounds", win.getBounds());
      } catch {
      }
    });
  }
  const showWindow = () => {
    if (!win.isDestroyed() && !win.isVisible()) win.show();
  };
  let rendererProbe = null;
  let showingStartupDiagnostics = false;
  const showStartupDiagnostics = async () => {
    if (win.isDestroyed() || showingStartupDiagnostics) return;
    showingStartupDiagnostics = true;
    if (rendererProbe) clearTimeout(rendererProbe);
    console.error("[window] console failed to mount; showing startup diagnostics");
    try {
      const html = startupDiagnosticHtml(isPackagedRuntime);
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    } catch {
    }
    showWindow();
  };
  const verifyRendererMounted = () => {
    if (rendererProbe) clearTimeout(rendererProbe);
    rendererProbe = setTimeout(async () => {
      if (win.isDestroyed() || showingStartupDiagnostics) return;
      let mounted = false;
      try {
        mounted = await wc.executeJavaScript(
          "Boolean(document.getElementById('root')?.childElementCount)"
        );
      } catch {
      }
      if (!mounted) await showStartupDiagnostics();
    }, 8e3);
  };
  win.once("ready-to-show", showWindow);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) import_electron10.shell.openExternal(url);
    return { action: "deny" };
  });
  win.on("close", (e) => {
    if (allowQuit) return;
    if (isFloor) {
      const owned = ptyManager.countByOwner(wc);
      if (owned > 0) {
        const choice = import_electron10.dialog.showMessageBoxSync(win, {
          type: "warning",
          buttons: ["Close floor", "Cancel"],
          defaultId: 1,
          cancelId: 1,
          message: `Close this floor? ${owned} running terminal${owned === 1 ? "" : "s"} on it will be stopped.`,
          detail: "Other floors keep running."
        });
        if (choice === 1) e.preventDefault();
      }
      return;
    }
    const count = ptyManager.list().length;
    if (count === 0) return;
    e.preventDefault();
    win.focus();
    wc.send("app:closeRequested", { ptyCount: count });
  });
  if (!isFloor) ptyManager.attachWebContents(wc);
  win.webContents.on("did-start-navigation", (details) => {
    if (details.isMainFrame) rendererReadyForHires = false;
  });
  const configuredConsole = process.env.CONSOLE_URL?.replace(/\/+$/, "");
  const consoleUrl = configuredConsole ? `${configuredConsole}/office` : isPackagedRuntime ? "radas-console://app/office" : "http://localhost:8080/office";
  void win.loadURL(consoleUrl).then(() => {
    showWindow();
    verifyRendererMounted();
  }).catch(showStartupDiagnostics);
  win.on("closed", () => {
    if (rendererProbe) clearTimeout(rendererProbe);
    allWindows.delete(win);
    if (isFloor) {
      try {
        ptyManager.killByOwner(wc);
      } catch {
      }
    }
    if (mainWindow === win) {
      mainWindow = null;
      for (const w of allWindows) {
        if (!w.isDestroyed()) {
          mainWindow = w;
          break;
        }
      }
    }
    syncKeepAwake();
  });
  return win;
}
function openFloor() {
  if (!readConfig().multiWindow) return null;
  return createWindow({ floor: true });
}
function installAppMenu() {
  const isMac = process.platform === "darwin";
  const newFloorItem = {
    label: "New Floor",
    accelerator: "CmdOrCtrl+Shift+N",
    click: () => {
      openFloor();
    }
  };
  const template = [
    ...isMac ? [{ role: "appMenu" }] : [],
    {
      label: "File",
      submenu: isMac ? [newFloorItem, { type: "separator" }, { role: "close" }] : [newFloorItem, { type: "separator" }, { role: "quit" }]
    },
    // The Edit menu is spelled out rather than `{ role: 'editMenu' }` for one
    // reason: `registerAccelerator: false` on the clipboard items.
    //
    // A registered accelerator is claimed by the MENU, which then replays the
    // action through `webContents.paste()` — an async hop that runs a beat after
    // the keystroke. Dictation tools (Muesli, Wispr Flow, …) insert text by
    // stashing the clipboard, writing the transcript, sending the paste key, and
    // restoring the old clipboard immediately; the menu's late paste therefore
    // read the RESTORED clipboard and typed the user's previous copy instead of
    // what they had just said. It hit the terminal and the composer alike,
    // because both were downstream of the same replay.
    //
    // With registerAccelerator false the item still shows its shortcut, but the
    // key is left for the focused element to handle inline — xterm's own paste
    // handler and the textarea's native paste event both read the clipboard
    // synchronously, inside the keystroke, before any restore can land.
    {
      label: "Edit",
      submenu: [
        { role: "undo", registerAccelerator: false },
        { role: "redo", registerAccelerator: false },
        { type: "separator" },
        { role: "cut", registerAccelerator: false },
        { role: "copy", registerAccelerator: false },
        { role: "paste", registerAccelerator: false },
        { role: "selectAll", registerAccelerator: false }
      ]
    },
    { role: "viewMenu" },
    { role: "windowMenu" }
  ];
  import_electron10.Menu.setApplicationMenu(import_electron10.Menu.buildFromTemplate(template));
}
function findCodexHomeForSession(sessionId, siblingsRoot) {
  try {
    if (!sessionId || !/^[0-9a-fA-F][0-9a-fA-F-]{15,}$/.test(sessionId)) return null;
    let fallbackHome = null;
    let agents;
    try {
      agents = (0, import_node_fs19.readdirSync)(siblingsRoot, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const a of agents) {
      if (!a.isDirectory()) continue;
      const home = (0, import_node_path20.join)(siblingsRoot, a.name, ".codex");
      const sessions = (0, import_node_path20.join)(home, "sessions");
      if (!(0, import_node_fs19.existsSync)(sessions)) continue;
      const stack = [sessions];
      let hasRollout = false;
      while (stack.length && !hasRollout) {
        const d = stack.pop();
        let ents;
        try {
          ents = (0, import_node_fs19.readdirSync)(d, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const e of ents) {
          const pth = (0, import_node_path20.join)(d, e.name);
          if (e.isDirectory()) stack.push(pth);
          else if (e.isFile() && e.name.endsWith(".jsonl") && e.name.includes(sessionId)) {
            hasRollout = true;
            break;
          }
        }
      }
      if (!hasRollout) continue;
      const idBuf = Buffer.from(sessionId);
      let indexed = false;
      for (const db of ["state_5.sqlite", "state_5.sqlite-wal"]) {
        try {
          if ((0, import_node_fs19.readFileSync)((0, import_node_path20.join)(home, db)).includes(idBuf)) {
            indexed = true;
            break;
          }
        } catch {
        }
      }
      if (indexed) return home;
      if (!fallbackHome) fallbackHome = home;
    }
    return fallbackHome;
  } catch (e) {
    console.error("[resume] findCodexHomeForSession failed:", e);
    return null;
  }
}
function spawnFailReason(error) {
  if (error?.startsWith("cwd does not exist")) return "cwd_missing";
  if (error?.includes("already exists")) return "already_running";
  return "spawn_error";
}
import_electron10.ipcMain.handle("pty:spawn", async (evt, opts) => {
  if (!opts || typeof opts.id !== "string" || typeof opts.cwd !== "string" || typeof opts.command !== "string") {
    return { ok: false, error: "invalid SpawnOptions" };
  }
  const owner = import_electron10.BrowserWindow.fromWebContents(evt.sender)?.webContents ?? null;
  return spawnAgentCore(opts, owner);
});
async function spawnAgentCore(opts, owner) {
  opts.cwd = expandTilde(opts.cwd);
  if (opts.hive) opts.hive = { ...opts.hive, cwd: expandTilde(opts.hive.cwd) };
  const provider = inferAgentProvider(opts.command, opts.provider ?? opts.hive?.provider);
  const claudeProvider = isClaudeProvider(provider);
  opts.provider = provider;
  if (opts.hive) opts.hive = { ...opts.hive, provider };
  if (!opts.noAutoInstall) analytics.track("agent_spawn_attempted", { provider });
  {
    const bin = opts.command.trim().split(/\s+/)[0] || opts.command;
    if (bin && !opts.noAutoInstall && !ptyManager.isCommandAvailable(bin)) {
      const npmAvailable = ptyManager.isCommandAvailable("npm") && nodeIsUsable(detectNodeVersion(ptyManager.commandPath("node")));
      const nodeInstaller = npmAvailable ? null : await resolveNodeInstaller();
      const rung = chooseInstallRung(installInfoForProvider(provider), npmAvailable, nodeInstaller);
      const res2 = ptyManager.spawn(
        {
          id: opts.id,
          cwd: opts.cwd,
          command: bin,
          cols: opts.cols,
          rows: opts.rows,
          shellScript: buildMissingCliScript(bin, provider, npmAvailable, process.platform, nodeInstaller)
        },
        owner
      );
      if (res2.ok && rung.command) {
        pendingInstallRelaunch.set(opts.id, { opts, owner, bin, rung: rung.kind });
        analytics.track("agent_install_started", { provider, rung: rung.kind });
      } else if (res2.ok) {
        analytics.track("agent_spawn_failed", { provider, reason: "cli_missing" });
      } else {
        analytics.track("agent_spawn_failed", { provider, reason: spawnFailReason(res2.error) });
      }
      syncKeepAwake();
      return res2;
    }
  }
  if (opts.isolate === true && await isRepo(opts.cwd)) {
    try {
      const origCwd = opts.cwd;
      const wtRoot = (0, import_node_path20.join)(readConfig().harnessHome ?? origCwd, "worktrees");
      const seg = (opts.hive?.id ?? opts.id).replace(/[^A-Za-z0-9._-]/g, "-");
      const wtPath = (0, import_node_path20.join)(wtRoot, seg);
      if (!(0, import_node_path20.resolve)(wtPath).startsWith((0, import_node_path20.resolve)(wtRoot) + import_node_path20.sep)) {
        console.error("[worktree] refusing unsafe worktree path for id:", opts.hive?.id ?? opts.id);
      } else {
        const br = await getBranch(origCwd);
        const baseBranch = "current" in br && br.current ? br.current : "main";
        const wt = await addWorktree(origCwd, wtPath, baseBranch);
        if (wt.ok) {
          opts.cwd = wtPath;
          worktreePaths.set(opts.id, wtPath);
          worktreeOrigins.set(opts.id, origCwd);
        } else {
          console.error("[worktree] addWorktree failed:", wt.error);
        }
      }
    } catch (e) {
      console.error("[worktree] isolation failed:", e);
    }
  }
  if (opts.hive && (provider === "crush" || provider === "qwen")) {
    const bridge = providerPreset(provider).bridge;
    const baseUrl = readConfig().providerBaseUrls?.[provider];
    if (bridge && bridge.kind === "proxy" && baseUrl) process.env[bridge.baseUrlEnv] = baseUrl;
  }
  let seedPrompt;
  if (opts.hive && hive.enabled()) {
    try {
      const inj = await hive.ensureAgent(
        { ...opts.hive, cwd: opts.cwd, provider },
        {
          semanticMemory: memory.active(),
          knowledgeGraph: knowledge.active(),
          // Bake the ABSOLUTE KG CLI path into the agent's prompt. The prompt used
          // to spell it `$KG_CLI`, which is POSIX-only: under cmd.exe/PowerShell it
          // expands to nothing, so every knowledge-graph instruction was dead on a
          // Windows floor. Empty when the KG is off (the line isn't emitted then).
          kgCliPath: knowledge.env().KG_CLI,
          theme: readConfig().terminalTheme ?? "light",
          // W3 — default-MCP consent state + the bundled skills source dir.
          mcpDefaults: readConfig().mcpDefaults,
          skillsDir: skillsResourceDir(),
          // The shared palace is mutated by the agent's own `mempalace` calls, so
          // the OS sandbox must let it through (empty when memory is off).
          extraWritableDirs: [memory.env().MEMPALACE_PALACE_PATH].filter((p) => !!p)
        }
      );
      opts.args = [...opts.args ?? [], ...inj.args];
      seedPrompt = inj.seedPrompt;
      if (inj.degraded) breakerToast("Agent running degraded", inj.degraded);
      opts.env = { ...opts.env ?? {}, ...inj.env, ...memory.env(), ...knowledge.env() };
    } catch (e) {
      console.error("[hive] ensureAgent failed:", e);
    }
  }
  let resumeNotFound = false;
  let didResume = false;
  if (opts.hive && claudeProvider) {
    const cfg = readConfig();
    const args = argsWithAutoModeFlag(opts.args ?? [], cfg.autoMode, provider);
    if (!args.includes("--model")) {
      const m = opts.hive.isGod ? modelForRole(opts.hive, cfg) : cfg.defaultModel ?? modelForRole(opts.hive, cfg);
      if (m) args.push("--model", m);
    }
    if (!args.includes("--remote-control-session-name-prefix")) {
      const label = (opts.hive.name || opts.hive.id || "").trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
      if (label) args.push("--remote-control-session-name-prefix", label);
    }
    if (typeof cfg.maxTurns === "number" && cfg.maxTurns > 0 && !args.includes("--max-turns")) {
      args.push("--max-turns", String(cfg.maxTurns));
    }
    const explicitSid = typeof opts.resumeSessionId === "string" ? opts.resumeSessionId.trim() : "";
    const sid = explicitSid || (opts.resume === true ? hive.lastSession(opts.hive.id) : void 0);
    if (sid && !args.includes("--resume")) {
      if (seedSessionTranscript(opts.cwd, sid)) {
        args.push("--resume", sid);
        didResume = true;
      } else if (explicitSid) {
        console.warn(`[resume] session "${explicitSid}" not found in any Claude project dir \u2014 starting a fresh session`);
        resumeNotFound = true;
      }
    }
    opts.args = args;
  }
  if (opts.hive && !claudeProvider) {
    const preset = providerPreset(provider);
    const rf = preset.resumeFlag;
    const rsub = preset.resumeSubcommand;
    const typedSid = typeof opts.resumeSessionId === "string" ? opts.resumeSessionId.trim() : "";
    const sid = typedSid || (opts.resume === true ? hive.lastSession(opts.hive.id) : void 0);
    if (sid && rf) {
      const args = opts.args ?? [];
      if (!args.includes(rf)) {
        args.push(rf, sid);
        opts.args = args;
        didResume = true;
      }
    } else if (sid && rsub) {
      const myHome = (opts.env ?? {}).CODEX_HOME;
      const agentsRoot = myHome ? (0, import_node_path20.dirname)((0, import_node_path20.dirname)(myHome)) : "";
      const ownerHome = agentsRoot ? findCodexHomeForSession(sid, agentsRoot) : null;
      if (!ownerHome) {
        console.warn(`[resume] codex session "${sid}" not found in any agent CODEX_HOME - starting fresh`);
        if (typedSid) resumeNotFound = true;
      } else {
        if (ownerHome !== myHome) opts.env = { ...opts.env ?? {}, CODEX_HOME: ownerHome };
        const args = opts.args ?? [];
        if (args[0] !== rsub) {
          opts.args = [rsub, sid, ...args];
          didResume = true;
        }
        console.log("[resume] codex resume", sid, "in", ownerHome);
      }
    }
  }
  if (opts.requireResume === true && !didResume) {
    return {
      ok: false,
      error: "Existing session could not be resumed; no replacement process was started.",
      ...resumeNotFound ? { resumeNotFound: true } : {}
    };
  }
  if (opts.hive?.id) {
    ptyToAgent.set(opts.id, opts.hive.id);
    workerWake.noteSpawn(opts.id);
  }
  if (claudeProvider) {
    try {
      ensureClaudePermissionsAccepted(opts.cwd);
    } catch {
    }
  }
  const nonInteractiveEnv = nonInteractiveEnvForProvider(provider);
  if (Object.keys(nonInteractiveEnv).length > 0) {
    opts.env = { ...opts.env ?? {}, ...nonInteractiveEnv };
  }
  if (opts.hive && (provider === "opencode" || provider === "crush" || provider === "pi" || provider === "qwen")) {
    const cfg = readConfig();
    const extra = {};
    const modelIdx = (opts.args ?? []).indexOf("--model");
    const modelSlug = modelIdx >= 0 ? opts.args?.[modelIdx + 1] ?? "" : "";
    const prefix = modelSlug.includes("/") ? modelSlug.split("/")[0].toLowerCase() : "";
    const PREFIX_BACKEND = {
      anthropic: "anthropic",
      openai: "openai",
      google: "google",
      gemini: "google",
      groq: "groq",
      openrouter: "openrouter"
    };
    const scoped = PREFIX_BACKEND[prefix];
    const backends = scoped ? [scoped] : Object.keys(BACKEND_KEY_ENV);
    for (const backend of backends) {
      const key = getSecret(providerKeyRef(backend));
      if (!key) continue;
      extra[BACKEND_KEY_ENV[backend]] = key;
      if (backend === "google") extra.GOOGLE_GENERATIVE_AI_API_KEY = key;
    }
    extra.HIVE_AUTO_APPROVE = cfg.autoMode ? "1" : "0";
    if (provider === "opencode") {
      const oc = { autoupdate: false };
      if (cfg.autoMode) oc.permission = { edit: "allow", bash: "allow", webfetch: "allow" };
      const baseUrl = cfg.providerBaseUrls?.opencode;
      if (baseUrl) {
        const localModel = prefix === "local" && modelSlug.slice(6) || "local";
        oc.provider = {
          local: { npm: "@ai-sdk/openai-compatible", name: "Local (self-hosted)", options: { baseURL: baseUrl }, models: { [localModel]: { name: localModel } } }
        };
      }
      extra.OPENCODE_CONFIG_CONTENT = JSON.stringify(oc);
    }
    opts.env = { ...opts.env ?? {}, ...extra };
  }
  if (provider === "codex" && opts.hive?.id) {
    await enableCodexRemoteForSpawn(opts, opts.hive.id);
  }
  const res = ptyManager.spawn(opts, owner);
  if (res.ok) analytics.track("agent_spawned", { provider });
  else analytics.track("agent_spawn_failed", { provider, reason: spawnFailReason(res.error) });
  syncKeepAwake();
  const worktreePath = worktreePaths.get(opts.id);
  return { ...res, cwd: opts.cwd, ...worktreePath ? { worktreePath } : {}, ...resumeNotFound ? { resumeNotFound: true } : {}, ...didResume ? { resumed: true } : {}, ...seedPrompt ? { seedPrompt } : {} };
}
import_electron10.ipcMain.handle("pty:write", (_evt, id, data) => {
  if (typeof id !== "string" || typeof data !== "string") return { ok: false, error: "invalid args" };
  return ptyManager.write(id, data);
});
import_electron10.ipcMain.handle("pty:resize", (_evt, id, cols, rows) => {
  if (typeof id !== "string" || typeof cols !== "number" || typeof rows !== "number") return { ok: false, error: "invalid args" };
  return ptyManager.resize(id, cols, rows);
});
import_electron10.ipcMain.handle("pty:redraw", (_evt, id) => {
  if (typeof id !== "string") return { ok: false, error: "invalid id" };
  return ptyManager.redraw(id);
});
import_electron10.ipcMain.handle("pty:kill", (_evt, id) => {
  if (typeof id !== "string") return { ok: false, error: "invalid id" };
  const res = ptyManager.kill(id);
  teardownPty(id);
  return res;
});
import_electron10.ipcMain.handle("pty:list", () => ptyManager.list());
import_electron10.ipcMain.handle("analytics:messageSent", (_evt, surface) => {
  if (!isRendererMessageSurface(surface)) return { ok: false };
  analytics.trackMessageSent(surface);
  return { ok: true };
});
import_electron10.ipcMain.handle("session:resolveCwd", (_evt, sessionId) => typeof sessionId === "string" ? resolveSessionCwd(sessionId) : null);
import_electron10.ipcMain.handle("app:copyToClipboard", (_evt, text) => {
  if (typeof text !== "string") return { ok: false, error: "invalid text" };
  try {
    import_electron10.clipboard.writeText(text);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});
import_electron10.ipcMain.handle("app:readClipboard", () => {
  try {
    return import_electron10.clipboard.readText();
  } catch {
    return "";
  }
});
import_electron10.ipcMain.on("app:readClipboardSync", (evt) => {
  try {
    evt.returnValue = import_electron10.clipboard.readText();
  } catch {
    evt.returnValue = "";
  }
});
import_electron10.ipcMain.handle("dialog:chooseFolder", async (evt) => {
  const win = import_electron10.BrowserWindow.fromWebContents(evt.sender);
  if (!win) return { ok: false, error: "no window" };
  const res = await import_electron10.dialog.showOpenDialog(win, {
    properties: ["openDirectory", "createDirectory"],
    title: "Pick a folder"
  });
  if (res.canceled || res.filePaths.length === 0) return { ok: false, error: "cancelled" };
  return { ok: true, path: res.filePaths[0] };
});
import_electron10.ipcMain.handle("terminal:openAtFolder", async (_evt, cwd) => {
  if (typeof cwd !== "string" || cwd.length === 0) return { ok: false, error: "invalid cwd" };
  return new Promise((resolve4) => {
    const p = (0, import_node_child_process8.spawn)("open", ["-a", "Terminal", cwd]);
    let err = "";
    p.stderr.on("data", (d) => {
      err += d.toString();
    });
    p.on("error", (e) => resolve4({ ok: false, error: e.message }));
    p.on("close", (code) => {
      if (code === 0) resolve4({ ok: true });
      else resolve4({ ok: false, error: err.trim() || `open exited ${code}` });
    });
  });
});
import_electron10.ipcMain.handle("integrations:list", () => listRecordsRedacted());
import_electron10.ipcMain.handle("integrations:templates", () => INTEGRATION_TEMPLATES);
import_electron10.ipcMain.handle("integrations:upsert", (_evt, record) => upsertRecord(record));
import_electron10.ipcMain.handle("integrations:setSecret", (_evt, payload) => {
  const p = payload ?? {};
  if (typeof p.id !== "string" || !p.id) return { ok: false, error: "id required" };
  if (typeof p.secret !== "string" || !p.secret) return { ok: false, error: "secret required" };
  return setSecret(secretRefFor(p.id), p.secret);
});
import_electron10.ipcMain.handle("integrations:remove", (_evt, payload) => {
  const p = payload ?? {};
  if (typeof p.id !== "string" || !p.id) return { ok: false, error: "id required" };
  return removeRecord(p.id);
});
import_electron10.ipcMain.handle("providerKey:set", (_evt, payload) => {
  const p = payload ?? {};
  if (typeof p.backend !== "string" || !(p.backend in BACKEND_KEY_ENV)) return { ok: false, error: "unknown backend" };
  if (typeof p.key !== "string" || !p.key) return { ok: false, error: "key required" };
  return setSecret(providerKeyRef(p.backend), p.key);
});
import_electron10.ipcMain.handle("providerKey:has", (_evt, backend) => typeof backend === "string" ? hasSecret(providerKeyRef(backend)) : false);
import_electron10.ipcMain.handle("providerKey:clear", (_evt, backend) => {
  if (typeof backend !== "string" || !(backend in BACKEND_KEY_ENV)) return { ok: false, error: "unknown backend" };
  try {
    deleteSecret(providerKeyRef(backend));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});
import_electron10.ipcMain.handle("integrations:test", async (_evt, payload) => {
  const p = payload ?? {};
  if (typeof p.id !== "string" || !p.id) return { ok: false, error: "id required" };
  const rec = getRecord(p.id);
  if (!rec) return { ok: false, error: "unknown integration" };
  const probe = validateBaseUrl(rec.baseUrl);
  if (!probe.ok) return { ok: false, error: probe.error };
  const target = resolveUpstreamUrl(rec.baseUrl, typeof p.path === "string" ? p.path : "");
  if (!target) return { ok: false, error: "path escapes the integration baseUrl", code: "bad_request" };
  const secret = getSecret(rec.secretRef);
  const headers = buildAuthHeaders(rec.authType, rec.authHeader, secret);
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 15e3);
    const r = await fetch(target, { method: "GET", headers, redirect: "manual", signal: ac.signal });
    clearTimeout(timer);
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});
import_electron10.ipcMain.handle("config:get", () => readConfig());
import_electron10.ipcMain.handle("config:update", (_evt, patch) => {
  const hiveWasEnabled = hive.enabled();
  const wasOnboarded = readConfig().onboardingComplete;
  const next = writeConfig(patch);
  if (typeof patch?.telemetryEnabled === "boolean") analytics.setEnabled(patch.telemetryEnabled);
  if (!wasOnboarded && next.onboardingComplete) {
    analytics.track("onboarding_completed", { provider: next.godProvider ?? "claude" });
  }
  if (typeof patch?.orchestratorMaySpawn === "boolean") hive.setOrchestratorMaySpawn(patch.orchestratorMaySpawn);
  if (!hiveWasEnabled && hive.enabled()) {
    console.log("[hive] harnessHome configured \u2014 bootstrapping hive services");
    try {
      bootstrapHiveServices();
    } catch (e) {
      console.error("[hive] bootstrap after onboarding:", e);
    }
  }
  return next;
});
import_electron10.ipcMain.handle(
  "config:setAgentTokenCap",
  (_evt, agentId, tokenCap) => setAgentTokenCap(agentId, tokenCap)
);
import_electron10.ipcMain.handle("config:ensureHome", (_evt, path3) => {
  if (typeof path3 !== "string" || path3.length === 0) return { ok: false, error: "invalid path" };
  return ensureHarnessHome(path3);
});
import_electron10.ipcMain.handle("config:changeHome", async (_evt, payload) => {
  const p = payload ?? {};
  if (typeof p.newHome !== "string" || !p.newHome) return { ok: false, error: "invalid newHome" };
  const mode = p.mode === "fresh" ? "fresh" : "move";
  const newHome = (0, import_node_path20.resolve)(expandTilde(p.newHome));
  const oldRaw = readConfig().harnessHome;
  const oldHome = oldRaw ? (0, import_node_path20.resolve)(oldRaw) : null;
  if (oldHome) {
    if (newHome === oldHome) return { ok: false, error: "That is already the current home folder." };
    const a = newHome + import_node_path20.sep, b = oldHome + import_node_path20.sep;
    if (a.startsWith(b) || b.startsWith(a)) {
      return { ok: false, error: "Pick a folder that is not inside (or a parent of) the current home." };
    }
  }
  const ensured = ensureHarnessHome(newHome);
  if (!ensured.ok) return ensured;
  try {
    clearMissionTimers();
  } catch (e) {
    console.error("[changeHome] clearMissionTimers:", e);
  }
  try {
    clearContextTimers();
  } catch (e) {
    console.error("[changeHome] clearContextTimers:", e);
  }
  try {
    stopWebhookDoneObserver();
  } catch (e) {
    console.error("[changeHome] stopWebhookDoneObserver:", e);
  }
  try {
    stopEphemeralWorkerWatcher();
  } catch (e) {
    console.error("[changeHome] stopWorkerWatcher:", e);
  }
  try {
    integrationBroker.stop();
  } catch (e) {
    console.error("[changeHome] broker.stop:", e);
  }
  try {
    hive.stopRouter();
  } catch (e) {
    console.error("[changeHome] stopRouter:", e);
  }
  try {
    hookServer.stop();
  } catch (e) {
    console.error("[changeHome] hookServer.stop:", e);
  }
  try {
    stopSlackServer();
  } catch (e) {
    console.error("[changeHome] slack.stop:", e);
  }
  try {
    stopWebhookServer();
  } catch (e) {
    console.error("[changeHome] webhook.stop:", e);
  }
  try {
    memory.stop();
  } catch (e) {
    console.error("[changeHome] memory.stop:", e);
  }
  try {
    reflector.stop();
  } catch (e) {
    console.error("[changeHome] reflector.stop:", e);
  }
  if (mode === "move" && oldHome) {
    try {
      for (const sub of ["hive", "palace", "roster.json", "roster-backups"]) {
        const src = (0, import_node_path20.join)(oldHome, sub);
        if (!(0, import_node_fs19.existsSync)(src)) continue;
        (0, import_node_fs19.cpSync)(src, (0, import_node_path20.join)(newHome, sub), { recursive: true, force: true, dereference: false });
      }
    } catch (e) {
      bootstrapHiveServices();
      const cfg = readConfig();
      if (cfg.slackEnabled && cfg.slackSigningSecret) void startSlackServer();
      reconcileWebhookServer();
      return { ok: false, error: `Could not copy data: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  allowQuit = true;
  writeConfig({ harnessHome: newHome });
  try {
    ptyManager.killAll();
  } catch (e) {
    console.error("[changeHome] killAll:", e);
  }
  import_electron10.app.relaunch();
  import_electron10.app.exit(0);
  return { ok: true };
});
import_electron10.ipcMain.handle("fs:listDir", (_evt, root, rel) => {
  if (typeof root !== "string" || typeof rel !== "string") return { ok: false, error: "invalid args" };
  return listDir(root, rel);
});
import_electron10.ipcMain.handle("fs:readFile", (_evt, root, rel) => {
  if (typeof root !== "string" || typeof rel !== "string") return { ok: false, error: "invalid args" };
  return readFileText(root, rel);
});
import_electron10.ipcMain.handle("fs:readBinary", (_evt, root, rel) => {
  if (typeof root !== "string" || typeof rel !== "string") return { ok: false, error: "invalid args" };
  return readFileBinary(root, rel);
});
import_electron10.ipcMain.handle("fs:writeFile", (_evt, root, rel, content) => {
  if (typeof root !== "string" || typeof rel !== "string" || typeof content !== "string") {
    return { ok: false, error: "invalid args" };
  }
  return writeFileText(root, rel, content);
});
import_electron10.ipcMain.handle("fs:statAbs", (_evt, p) => {
  if (typeof p !== "string" || p.length > 4096 || p.includes("\0")) {
    return { exists: false, isFile: false, path: "" };
  }
  return statAbs(p);
});
import_electron10.ipcMain.handle("fs:revealPath", async (_evt, p) => {
  if (typeof p !== "string" || !p.length || p.length > 4096 || p.includes("\0")) {
    return { ok: false, error: "bad request" };
  }
  const st = await statAbs(p);
  if (!st.exists) return { ok: false, error: "not found" };
  if (st.isFile) {
    import_electron10.shell.showItemInFolder(st.path);
    return { ok: true };
  }
  const err = await import_electron10.shell.openPath(st.path);
  return err ? { ok: false, error: err } : { ok: true };
});
import_electron10.ipcMain.handle("git:isRepo", (_evt, cwd) => {
  if (typeof cwd !== "string") return false;
  return isRepo(cwd);
});
import_electron10.ipcMain.handle("git:mainRepo", (_evt, cwd) => {
  if (typeof cwd !== "string" || !cwd) return null;
  return mainRepoRoot(cwd);
});
import_electron10.ipcMain.handle("git:branch", (_evt, cwd) => {
  if (typeof cwd !== "string") return { error: "invalid cwd" };
  return getBranch(cwd);
});
import_electron10.ipcMain.handle("git:status", (_evt, cwd) => {
  if (typeof cwd !== "string") return { error: "invalid cwd" };
  return getStatus(cwd);
});
import_electron10.ipcMain.handle("git:log", (_evt, cwd, n) => {
  if (typeof cwd !== "string") return { error: "invalid cwd" };
  const count = typeof n === "number" ? Math.min(500, Math.max(1, n)) : 50;
  return getLog(cwd, count);
});
import_electron10.ipcMain.handle("git:branches", (_evt, cwd) => {
  if (typeof cwd !== "string") return { error: "invalid cwd" };
  return getBranches(cwd);
});
import_electron10.ipcMain.handle("git:aheadBehind", (_evt, cwd) => {
  if (typeof cwd !== "string") return { error: "invalid cwd" };
  return getAheadBehind(cwd);
});
import_electron10.ipcMain.handle("git:diff", (_evt, cwd, relPath) => {
  if (typeof cwd !== "string" || typeof relPath !== "string") {
    return { ok: false, error: "invalid args" };
  }
  return getDiff(cwd, relPath);
});
import_electron10.ipcMain.handle("git:logGraph", (_evt, cwd, n, skip) => {
  if (typeof cwd !== "string") return { error: "invalid args" };
  const count = Math.min(500, Math.max(1, typeof n === "number" ? n : 200));
  const off = Math.max(0, typeof skip === "number" ? skip : 0);
  return getLogGraph(cwd, count, off);
});
import_electron10.ipcMain.handle("git:commitFiles", (_evt, cwd, sha) => {
  if (typeof cwd !== "string" || typeof sha !== "string") return { error: "invalid args" };
  return getCommitFiles(cwd, sha);
});
import_electron10.ipcMain.handle("git:showFile", (_evt, cwd, rev, relPath) => {
  if (typeof cwd !== "string" || typeof rev !== "string" || typeof relPath !== "string") {
    return { ok: false, error: "invalid args" };
  }
  return getFileAtRev(cwd, rev, relPath);
});
import_electron10.ipcMain.handle("git:compareRefs", (_evt, cwd, base, head, mode) => {
  if (typeof cwd !== "string" || typeof base !== "string" || typeof head !== "string") {
    return { error: "invalid args" };
  }
  return compareRefs(cwd, base, head, mode === "two" ? "two" : "three");
});
import_electron10.ipcMain.handle("git:worktrees", (_evt, cwd) => {
  if (typeof cwd !== "string") return { error: "invalid args" };
  return listWorktrees(cwd);
});
import_electron10.ipcMain.handle("git:checkout", async (_evt, cwd, ref, detach) => {
  if (typeof cwd !== "string" || typeof ref !== "string") return { ok: false, error: "invalid args" };
  const busy = ptyManager.list().find(
    (p) => (p.cwd === cwd || p.cwd.startsWith(cwd.endsWith("/") ? cwd : `${cwd}/`)) && Date.now() - p.lastOutputAt < 1e4
  );
  if (busy) {
    return { ok: false, error: `an agent is actively working in this repo (${busy.id}) \u2014 try again when it goes quiet` };
  }
  return checkoutRef(cwd, ref, detach === true);
});
import_electron10.ipcMain.on("roster:readSync", (evt) => {
  evt.returnValue = roster.read();
});
import_electron10.ipcMain.on("config:homeSync", (evt) => {
  evt.returnValue = readConfig().harnessHome ?? null;
});
import_electron10.ipcMain.handle("roster:read", () => roster.read());
import_electron10.ipcMain.handle("roster:write", (_evt, snap) => roster.write(snap));
import_electron10.ipcMain.handle("hive:registry", () => hive.registry());
import_electron10.ipcMain.handle("hive:renameAgent", (_evt, id, name) => {
  if (typeof id !== "string" || typeof name !== "string") {
    return { ok: false, error: "Invalid rename request" };
  }
  return hive.renameAgent(id, name);
});
import_electron10.ipcMain.handle("hive:setAgentHold", (_evt, id, hold) => {
  if (typeof id !== "string" || typeof hold !== "boolean") {
    return { ok: false, error: "Invalid hold request" };
  }
  return hive.setAgentHold(id, hold);
});
import_electron10.ipcMain.handle("hive:board", () => hive.board());
import_electron10.ipcMain.handle("hive:tasks", () => hive.tasks());
import_electron10.ipcMain.handle("hive:log", (_evt, n) => hive.logTail(typeof n === "number" ? n : 200));
import_electron10.ipcMain.handle("hive:memory", (_evt, id) => typeof id === "string" ? hive.memory(id) : "");
import_electron10.ipcMain.handle("hive:inbox", (_evt, id) => typeof id === "string" ? hive.inbox(id) : []);
import_electron10.ipcMain.handle(
  "hive:messages",
  (_evt, opts) => hive.voiceMessages(opts && typeof opts === "object" ? opts : {})
);
import_electron10.ipcMain.handle("hive:send", (_evt, partial, from) => {
  if (!hive.enabled()) return { ok: false, error: "hive disabled (no harnessHome)" };
  const sender = typeof from === "string" ? from : "system";
  const msg = hive.send(partial ?? {}, sender);
  if (sender === "human") analytics.trackMessageSent("hive");
  return { ok: true, message: msg };
});
import_electron10.ipcMain.handle("hive:addTask", (_evt, task) => {
  if (!task || typeof task !== "object" || Array.isArray(task) || typeof task.id !== "string") {
    return { ok: false, error: "invalid task" };
  }
  if (!hive.enabled()) return { ok: false, error: "hive disabled (no harnessHome)" };
  return { ok: hive.addTask(task) };
});
import_electron10.ipcMain.handle("hive:patchTask", (_evt, id, patch) => {
  if (typeof id !== "string" || !id || !patch || typeof patch !== "object" || Array.isArray(patch)) {
    return { ok: false, error: "invalid task patch" };
  }
  if (!hive.enabled()) return { ok: false, error: "hive disabled (no harnessHome)" };
  return { ok: hive.patchTask(id, patch) };
});
import_electron10.ipcMain.handle("hive:deleteTask", (_evt, id) => {
  if (typeof id !== "string" || !id) return { ok: false, error: "invalid task id" };
  if (!hive.enabled()) return { ok: false, error: "hive disabled (no harnessHome)" };
  return { ok: hive.deleteTask(id) };
});
import_electron10.ipcMain.handle("hive:setArchived", (_evt, id, archived) => {
  if (typeof id !== "string") return { ok: false, error: "invalid id" };
  if (!hive.enabled()) return { ok: false, error: "hive disabled (no harnessHome)" };
  hive.setArchived(id, archived === true);
  return { ok: true };
});
import_electron10.ipcMain.handle("hive:patchAgentRole", (_evt, id, role) => {
  if (typeof id !== "string") return { ok: false, error: "invalid id" };
  if (typeof role !== "string") return { ok: false, error: "invalid role" };
  if (!hive.enabled()) return { ok: false, error: "hive disabled (no harnessHome)" };
  return hive.patchAgentRole(id, role);
});
import_electron10.ipcMain.handle("hero:payload", async (_evt, force) => loadHero((0, import_node_path20.join)(import_electron10.app.getPath("userData"), "hero.json"), { force: force === true }));
import_electron10.ipcMain.handle("skills:local", (_evt, cwd) => {
  const cfg = readConfig();
  const cwds = [
    ...typeof cwd === "string" && cwd ? [cwd] : [],
    ...cfg.registeredRepos ?? []
  ];
  try {
    return listLocalSkills({ cwds, bundledDir: skillsResourceDir() });
  } catch (e) {
    console.error("[skills] local scan failed:", e);
    return [];
  }
});
import_electron10.ipcMain.handle("skills:catalog", async (_evt, force) => {
  const cachePath = (0, import_node_path20.join)(import_electron10.app.getPath("userData"), "skill-catalog.json");
  return loadCatalog(cachePath, { force: force === true });
});
import_electron10.ipcMain.handle("skills:install", async (_evt, url, name) => {
  if (typeof url !== "string" || typeof name !== "string") {
    return { ok: false, error: "bad request" };
  }
  return installSkill(url, name);
});
import_electron10.ipcMain.handle("skills:uninstall", (_evt, path3) => {
  if (typeof path3 !== "string") return { ok: false, error: "bad request" };
  const cfg = readConfig();
  return uninstallSkill(path3, { cwds: cfg.registeredRepos ?? [] });
});
import_electron10.ipcMain.handle("skills:reveal", (_evt, path3) => {
  if (typeof path3 !== "string" || !path3.trim()) return { ok: false, error: "bad request" };
  const skillRoots = [(0, import_node_path20.join)((0, import_node_os6.homedir)(), ".claude", "skills"), (0, import_node_path20.join)((0, import_node_os6.homedir)(), ".config", "opencode")];
  const target = (0, import_node_path20.resolve)(path3);
  const inRoot = skillRoots.some((r) => target.startsWith((0, import_node_path20.resolve)(r) + import_node_path20.sep)) || (readConfig().registeredRepos ?? []).some((c) => target.startsWith((0, import_node_path20.resolve)(c) + import_node_path20.sep));
  if (!inRoot) return { ok: false, error: "outside a managed skills directory" };
  import_electron10.shell.showItemInFolder(target);
  return { ok: true };
});
import_electron10.ipcMain.handle("tools:status", () => {
  const win = process.platform === "win32";
  const mem = (() => {
    try {
      memory.resetBinCache();
      return memory.status();
    } catch {
      return null;
    }
  })();
  return toolCatalog().map((spec) => {
    const installCommand = win ? spec.install.win32 : spec.install.posix;
    if (spec.id === "mempalace") {
      return {
        ...spec,
        installCommand,
        found: !!mem?.available,
        path: mem?.bin ?? null,
        detail: mem?.available ? mem.initialized ? "palace initialised" : "installed \u2014 palace not built yet" : void 0
      };
    }
    if (!spec.bin) return { ...spec, installCommand, found: false, path: null };
    let path3 = null;
    try {
      const resolved = resolveCommand(spec.bin);
      if (resolved !== spec.bin && (0, import_node_fs19.existsSync)(resolved)) path3 = resolved;
    } catch {
    }
    return { ...spec, installCommand, found: !!path3, path: path3 };
  });
});
import_electron10.ipcMain.handle("hive:memoryStatus", () => memory.refresh());
import_electron10.ipcMain.handle("hive:searchMemory", (_evt, query, wing) => {
  if (typeof query !== "string" || !query.trim()) return { ok: false, output: "", error: "empty query" };
  return memory.search(query, { wing: typeof wing === "string" ? wing : void 0 });
});
import_electron10.ipcMain.handle("hive:memoryWakeUp", (_evt, wing) => memory.wakeUp(typeof wing === "string" ? wing : void 0));
import_electron10.ipcMain.handle("hive:mineNow", () => {
  memory.mineNow();
  return { ok: true };
});
import_electron10.ipcMain.handle("memory:reflectNow", (_evt, id) => reflector.reflectNow(typeof id === "string" && id ? id : void 0));
import_electron10.ipcMain.handle("kg:status", () => knowledge.status());
import_electron10.ipcMain.handle("kg:list", () => knowledge.list());
import_electron10.ipcMain.handle("kg:search", (_evt, query, limit) => {
  if (typeof query !== "string" || !query.trim()) return [];
  return knowledge.search(query, typeof limit === "number" ? limit : void 0);
});
import_electron10.ipcMain.handle("kg:get", (_evt, id) => typeof id === "string" && id ? knowledge.get(id) : null);
import_electron10.ipcMain.handle("kg:remove", (_evt, id) => ({ ok: typeof id === "string" && id ? knowledge.remove(id) : false }));
import_electron10.ipcMain.handle("kg:ingestFiles", (_evt, payload) => {
  const p = payload ?? {};
  const paths = Array.isArray(p.paths) ? p.paths.filter((x) => typeof x === "string") : [];
  const tags = Array.isArray(p.tags) ? p.tags.filter((x) => typeof x === "string") : void 0;
  const results = paths.map((srcPath) => {
    try {
      const r = knowledge.ingestFile(srcPath, { tags });
      return { ok: true, srcPath, docId: r.docId, chunkCount: r.chunkCount };
    } catch (e) {
      return { ok: false, srcPath, error: e instanceof Error ? e.message : String(e) };
    }
  });
  return { results };
});
import_electron10.ipcMain.handle("kg:addFiles", async (evt) => {
  const win = import_electron10.BrowserWindow.fromWebContents(evt.sender);
  if (!win) return { ok: false, error: "no window" };
  const res = await import_electron10.dialog.showOpenDialog(win, {
    properties: ["openFile", "multiSelections"],
    title: "Add documents to the Knowledge Graph"
  });
  if (res.canceled || res.filePaths.length === 0) return { ok: false, error: "cancelled" };
  const results = res.filePaths.map((srcPath) => {
    try {
      const r = knowledge.ingestFile(srcPath);
      return { ok: true, srcPath, docId: r.docId, chunkCount: r.chunkCount };
    } catch (e) {
      return { ok: false, srcPath, error: e instanceof Error ? e.message : String(e) };
    }
  });
  return { ok: true, results };
});
import_electron10.ipcMain.handle("dialog:attachFiles", async (evt) => {
  const win = import_electron10.BrowserWindow.fromWebContents(evt.sender);
  if (!win) return { ok: false, error: "no window" };
  const res = await import_electron10.dialog.showOpenDialog(win, {
    properties: ["openFile", "multiSelections"],
    title: "Attach images or files",
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "heic", "tiff", "avif"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });
  if (res.canceled || res.filePaths.length === 0) return { ok: false, error: "cancelled" };
  return { ok: true, files: res.filePaths.map((p) => ({ path: p, name: (0, import_node_path20.basename)(p) })) };
});
import_electron10.ipcMain.handle("clipboard:saveImage", async () => {
  try {
    const img = import_electron10.clipboard.readImage();
    if (img.isEmpty()) return { ok: false, error: "no image in clipboard" };
    const dir = (0, import_node_path20.join)(import_electron10.app.getPath("temp"), "cth-pastes");
    (0, import_node_fs19.mkdirSync)(dir, { recursive: true });
    const name = `paste-${Date.now()}.png`;
    const dest = (0, import_node_path20.join)(dir, name);
    (0, import_node_fs19.writeFileSync)(dest, img.toPNG());
    return { ok: true, file: { path: dest, name } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});
import_electron10.ipcMain.handle("history:add", (_evt, payload) => {
  const p = payload ?? {};
  if (typeof p.agentId !== "string" || typeof p.text !== "string") return { ok: false, error: "invalid args" };
  try {
    persist.addHistory({ agentId: p.agentId, cwd: typeof p.cwd === "string" ? p.cwd : null, text: p.text });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});
import_electron10.ipcMain.handle("history:list", (_evt, agentId, limit) => persist.listHistory(
  typeof agentId === "string" && agentId ? agentId : void 0,
  typeof limit === "number" ? limit : void 0
));
import_electron10.ipcMain.handle("history:search", (_evt, query, limit) => persist.searchHistory(typeof query === "string" ? query : "", typeof limit === "number" ? limit : void 0));
function teardownAndQuit() {
  allowQuit = true;
  try {
    clearMissionTimers();
  } catch (e) {
    console.error("[quit] clearMissionTimers:", e);
  }
  try {
    clearContextTimers();
  } catch (e) {
    console.error("[quit] clearContextTimers:", e);
  }
  try {
    stopWebhookDoneObserver();
  } catch (e) {
    console.error("[quit] stopWebhookDoneObserver:", e);
  }
  try {
    stopEphemeralWorkerWatcher();
  } catch (e) {
    console.error("[quit] stopWorkerWatcher:", e);
  }
  try {
    integrationBroker.stop();
  } catch (e) {
    console.error("[quit] broker.stop:", e);
  }
  try {
    hive.stopRouter();
  } catch (e) {
    console.error("[quit] stopRouter:", e);
  }
  try {
    hookServer.stop();
  } catch (e) {
    console.error("[quit] hookServer.stop:", e);
  }
  try {
    telemetry.stop();
  } catch (e) {
    console.error("[quit] telemetry.stop:", e);
  }
  try {
    stopSlackServer();
  } catch (e) {
    console.error("[quit] slack.stop:", e);
  }
  try {
    stopWebhookServer();
  } catch (e) {
    console.error("[quit] webhook.stop:", e);
  }
  try {
    memory.stop();
  } catch (e) {
    console.error("[quit] memory.stop:", e);
  }
  try {
    reflector.stop();
  } catch (e) {
    console.error("[quit] reflector.stop:", e);
  }
  try {
    persist.close();
  } catch (e) {
    console.error("[quit] persist.close:", e);
  }
  try {
    hive.stopAllProxyBridges();
  } catch (e) {
    console.error("[quit] stopAllProxyBridges:", e);
  }
  try {
    ptyManager.killAll();
  } catch (e) {
    console.error("[quit] killAll:", e);
  }
  import_electron10.app.quit();
}
import_electron10.ipcMain.handle("app:confirmClose", () => {
  closingTime.cancel();
  teardownAndQuit();
});
import_electron10.ipcMain.handle("app:cancelClose", () => {
  abortPendingRestart();
});
import_electron10.ipcMain.handle("window:newFloor", () => {
  const win = openFloor();
  return { ok: win != null };
});
var closingTime = new ClosingTimeController(
  hive,
  // Roster source: agents with a live PTY right now (ptyToAgent is pruned on
  // every teardown). The registry alone would include ghost workers from
  // sessions that ended with a hard quit — never archived, never able to ACK.
  () => [...new Set(ptyToAgent.values())],
  () => liveWebContents(),
  () => teardownAndQuit(),
  // #7C.2 steering — the graceful interrupt that reaches deeply busy agents
  // at their next hook boundary instead of waiting for a Stop.
  control
);
hive.setRoutedObserver((msg, targets) => closingTime.onRouted(msg, targets));
import_electron10.ipcMain.handle("app:startClosingTime", () => closingTime.start());
import_electron10.ipcMain.handle("app:cancelClosingTime", () => closingTime.cancel());
import_electron10.ipcMain.handle("app:resetAll", () => {
  allowQuit = true;
  try {
    clearMissionTimers();
  } catch (e) {
    console.error("[reset] clearMissionTimers:", e);
  }
  try {
    clearContextTimers();
  } catch (e) {
    console.error("[reset] clearContextTimers:", e);
  }
  try {
    stopWebhookDoneObserver();
  } catch (e) {
    console.error("[reset] stopWebhookDoneObserver:", e);
  }
  try {
    stopEphemeralWorkerWatcher();
  } catch (e) {
    console.error("[reset] stopWorkerWatcher:", e);
  }
  try {
    integrationBroker.stop();
  } catch (e) {
    console.error("[reset] broker.stop:", e);
  }
  try {
    hive.stopRouter();
  } catch (e) {
    console.error("[reset] stopRouter:", e);
  }
  try {
    hookServer.stop();
  } catch (e) {
    console.error("[reset] hookServer.stop:", e);
  }
  try {
    telemetry.stop();
  } catch (e) {
    console.error("[reset] telemetry.stop:", e);
  }
  try {
    stopSlackServer();
  } catch (e) {
    console.error("[reset] slack.stop:", e);
  }
  try {
    memory.stop();
  } catch (e) {
    console.error("[reset] memory.stop:", e);
  }
  try {
    reflector.stop();
  } catch (e) {
    console.error("[reset] reflector.stop:", e);
  }
  try {
    persist.close();
  } catch (e) {
    console.error("[reset] persist.close:", e);
  }
  try {
    ptyManager.killAll();
  } catch (e) {
    console.error("[reset] killAll:", e);
  }
  try {
    hive.removeExposedCodexData();
  } catch (e) {
    console.error("[reset] removeExposedCodexData:", e);
  }
  for (const dir of [hive.root(), memory.palacePath()]) {
    if (!dir) continue;
    try {
      (0, import_node_fs19.rmSync)(dir, { recursive: true, force: true });
    } catch (e) {
      console.error("[reset] rm", dir, e);
    }
  }
  try {
    roster.archive();
  } catch (e) {
    console.error("[reset] roster.archive:", e);
  }
  resetConfig();
  import_electron10.app.relaunch();
  import_electron10.app.exit(0);
});
import_electron10.ipcMain.handle("hive:agentUsage", (_evt, cwd) => typeof cwd === "string" ? readAgentUsage(cwd) : null);
import_electron10.ipcMain.handle("hive:agentContext", (_evt, agentId) => {
  if (typeof agentId !== "string") return null;
  const tp = hookServer.transcriptPath(agentId);
  if (!tp) return null;
  return readContextTokens(tp) ?? 0;
});
import_electron10.ipcMain.handle("hive:agentDirectory", () => {
  if (!hive.enabled()) return { godId: null, agents: [] };
  const reg = hive.registry();
  const snap = telemetry.snapshot();
  const usageById = new Map(snap.usage.map((u) => [u.agentId, u]));
  const now = Date.now();
  const agents = Object.entries(reg.agents).map(([id, a]) => {
    const u = usageById.get(id);
    const spans = snap.spans[id] ?? [];
    const tokens = u ? u.input + u.output + u.cacheRead + u.cacheCreation : 0;
    const ctx = hookServer.contextFor(id);
    return {
      id,
      name: a.name,
      role: a.role ?? (a.isGod ? "orchestrator" : "agent"),
      provider: a.provider ?? "claude",
      model: u?.model ?? null,
      status: a.status ?? "idle",
      cwd: a.cwd ?? null,
      cwdValid: a.cwdValid ?? null,
      archived: !!a.archived,
      isGod: !!a.isGod,
      isAssistant: !!a.isAssistant,
      sessionId: a.sessionId ?? null,
      hasMemory: hive.hasMemory(id),
      inboxBacklog: hive.inboxBacklog(id),
      breaker: breaker.levelFor(id),
      tokens,
      usd: u ? Number(u.usd.toFixed(4)) : 0,
      lastTool: spans.length ? spans[spans.length - 1].tool : null,
      lastActiveSecAgo: u ? Math.round((now - u.ts) / 1e3) : null,
      contextTokens: ctx?.tokens ?? null,
      contextLimit: ctx?.limit ?? null,
      contextPct: ctx && ctx.limit > 0 ? Math.round(ctx.tokens / ctx.limit * 100) : null
    };
  });
  return { godId: reg.godId, agents };
});
import_electron10.ipcMain.handle("telemetry:usage", (_evt, agentId) => typeof agentId === "string" ? telemetry.getAgentUsage(agentId) : null);
import_electron10.ipcMain.handle("telemetry:spans", (_evt, agentId) => typeof agentId === "string" ? telemetry.getSpans(agentId) : []);
import_electron10.ipcMain.handle("telemetry:snapshot", () => telemetry.snapshot());
import_electron10.ipcMain.handle("control:setBreakerState", (_evt, state) => {
  try {
    liveWebContents()?.send("control:breakerState", state);
  } catch {
  }
  return { ok: true };
});
import_electron10.ipcMain.handle("control:pause", (_evt, agentId, on) => {
  if (typeof agentId !== "string") return null;
  control.pause(agentId, on === true);
  return control.snapshot(agentId);
});
import_electron10.ipcMain.handle("control:autoDelivery", (_evt, agentId, paused) => {
  if (typeof agentId !== "string") return null;
  const on = paused === true;
  control.pauseAutoDelivery(agentId, on);
  const current = new Set(readConfig().autoDeliveryPausedAgents ?? []);
  if (on) current.add(agentId);
  else current.delete(agentId);
  writeConfig({ autoDeliveryPausedAgents: Array.from(current).sort() });
  return control.snapshot(agentId);
});
import_electron10.ipcMain.handle("control:resume", (_evt, agentId) => {
  if (typeof agentId !== "string") return null;
  control.resume(agentId);
  return control.snapshot(agentId);
});
import_electron10.ipcMain.handle("control:gateTool", (_evt, agentId, tool, on) => {
  if (typeof agentId !== "string" || typeof tool !== "string") return null;
  control.gateTool(agentId, tool, on === true);
  return control.snapshot(agentId);
});
import_electron10.ipcMain.handle("control:steer", (_evt, agentId, text) => {
  if (typeof agentId !== "string" || typeof text !== "string") return null;
  control.steer(agentId, text);
  analytics.trackMessageSent("steer");
  return control.snapshot(agentId);
});
import_electron10.ipcMain.handle("control:halt", (_evt, agentId) => {
  if (typeof agentId !== "string") return null;
  control.halt(agentId);
  return control.snapshot(agentId);
});
import_electron10.ipcMain.handle("control:snapshot", (_evt, agentId) => typeof agentId === "string" ? control.snapshot(agentId) : null);
import_electron10.ipcMain.handle("missions:list", () => readConfig().missions ?? []);
import_electron10.ipcMain.handle("missions:save", (_evt, missions) => {
  const incoming = Array.isArray(missions) ? missions : [];
  const persistedById = new Map(
    (readConfig().missions ?? []).map((m) => [m.id, m])
  );
  const merged = incoming.map((m) => {
    const prevLastFired = persistedById.get(m.id)?.lastFiredAt ?? 0;
    const lastFiredAt = Math.max(m.lastFiredAt ?? 0, prevLastFired) || void 0;
    return { ...m, lastFiredAt };
  });
  writeConfig({ missions: merged });
  syncMissions();
  return { ok: true };
});
import_electron10.ipcMain.handle("hive:textSearch", (_evt, query) => {
  if (typeof query !== "string" || !query.trim()) return { ok: false, results: [] };
  const root = hive.root();
  if (!root) return { ok: false, results: [] };
  const q = query.toLowerCase();
  const results = [];
  const targets = [
    { path: (0, import_node_path20.join)(root, "board.md"), source: "board.md" },
    { path: (0, import_node_path20.join)(root, "tasks.json"), source: "tasks.json" }
  ];
  const agentsDir = (0, import_node_path20.join)(root, "agents");
  if ((0, import_node_fs19.existsSync)(agentsDir)) {
    for (const id of (0, import_node_fs19.readdirSync)(agentsDir)) {
      targets.push({ path: (0, import_node_path20.join)(agentsDir, id, "memory.md"), source: `${id}/memory.md` });
    }
  }
  for (const { path: path3, source } of targets) {
    if (!(0, import_node_fs19.existsSync)(path3)) continue;
    let hits = 0;
    for (const line of (0, import_node_fs19.readFileSync)(path3, "utf8").split("\n")) {
      if (hits >= 3) break;
      const idx = line.toLowerCase().indexOf(q);
      if (idx === -1) continue;
      const excerpt = line.slice(Math.max(0, idx - 40), idx + q.length + 40).trim();
      results.push({ source, excerpt });
      hits++;
    }
  }
  return { ok: true, results };
});
import_electron10.ipcMain.handle(
  "github:issues",
  (_evt, cwd) => typeof cwd === "string" ? listIssues(cwd) : { ok: false, error: "no cwd" }
);
import_electron10.ipcMain.handle(
  "github:ciRuns",
  (_evt, cwd) => typeof cwd === "string" ? listCIRuns(cwd) : { ok: false, error: "no cwd" }
);
import_electron10.ipcMain.handle("app:setNotifications", (_evt, val) => writeConfig({ notifications: val === true }));
import_electron10.ipcMain.handle("app:openExternal", async (_evt, url) => {
  if (typeof url !== "string" || !/^(x-apple\.systempreferences:|https:\/\/)/.test(url)) {
    return { ok: false, error: "blocked url" };
  }
  await import_electron10.shell.openExternal(url);
  return { ok: true };
});
import_electron10.ipcMain.handle("app:setLoginItem", (_evt, enabled) => {
  import_electron10.app.setLoginItemSettings({ openAtLogin: enabled === true });
  return import_electron10.app.getLoginItemSettings().openAtLogin;
});
import_electron10.ipcMain.handle("slack:start", () => startSlackServer());
import_electron10.ipcMain.handle("slack:stop", () => {
  stopSlackServer();
  return { ok: true };
});
import_electron10.ipcMain.handle("slack:status", () => ({ running: slackServer != null, url: lastSlackUrl }));
import_electron10.ipcMain.handle("slack:replyScriptPath", () => slackReplyScriptPath());
import_electron10.ipcMain.handle("slack:reply", (_evt, arg) => {
  const p = arg ?? {};
  const cfg = readConfig();
  if (!cfg.slackProactivePosting) return { ok: false, error: "app-initiated Slack posting disabled (enable in Settings \u2192 Slack)" };
  const botToken = cfg.slackBotToken;
  if (!botToken) return { ok: false, error: "no bot token" };
  if (typeof p.channel !== "string" || typeof p.thread_ts !== "string" || typeof p.text !== "string") {
    return { ok: false, error: "channel, thread_ts, text required" };
  }
  if (!p.channel.trim() || !p.thread_ts.trim()) {
    return { ok: false, error: "explicit channel + thread_ts required" };
  }
  return postSlackReply({ botToken, channel: p.channel, thread_ts: p.thread_ts, text: p.text });
});
import_electron10.ipcMain.handle("slack:setConfig", (_evt, patch) => {
  const p = patch ?? {};
  const next = {};
  if (typeof p.signingSecret === "string") next.slackSigningSecret = p.signingSecret.trim() || void 0;
  if (typeof p.botToken === "string") next.slackBotToken = p.botToken.trim() || void 0;
  if (typeof p.channelId === "string") next.slackChannelId = p.channelId.trim() || void 0;
  if (typeof p.port === "number" && Number.isFinite(p.port)) next.slackPort = p.port;
  if (typeof p.enabled === "boolean") next.slackEnabled = p.enabled;
  if (typeof p.proactivePosting === "boolean") next.slackProactivePosting = p.proactivePosting;
  writeConfig(next);
  const cfg = readConfig();
  if (!cfg.slackEnabled || !cfg.slackSigningSecret) stopSlackServer();
  return { ok: true };
});
import_electron10.ipcMain.handle("triggers:getContext", () => readConfig().contextTrigger ?? DEFAULT_CONTEXT_TRIGGER);
import_electron10.ipcMain.handle("triggers:setContext", (_evt, arg) => {
  const current = readConfig().contextTrigger ?? DEFAULT_CONTEXT_TRIGGER;
  const p = arg ?? {};
  const next = {
    compact: sanitizeContextRule(p.compact, current.compact),
    clear: sanitizeContextRule(p.clear, current.clear)
  };
  writeConfig({ contextTrigger: next });
  syncContextTriggers();
  return next;
});
function sanitizeContextRule(patch, current) {
  const p = patch ?? {};
  const num2 = (v, fallback, min, max) => typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  return {
    enabled: typeof p.enabled === "boolean" ? p.enabled : current.enabled,
    everyMs: num2(p.everyMs, current.everyMs, 6e4, 864e5),
    minContextPct: num2(p.minContextPct, current.minContextPct, 0, 100),
    minContextPctLargeWindow: num2(p.minContextPctLargeWindow, current.minContextPctLargeWindow, 0, 100),
    message: typeof p.message === "string" ? p.message : current.message
  };
}
import_electron10.ipcMain.handle("webhooks:list", () => readConfig().webhookTriggers ?? []);
import_electron10.ipcMain.handle("webhooks:save", (_evt, arg) => {
  const incoming = Array.isArray(arg) ? arg : [];
  const existing = readConfig().webhookTriggers ?? [];
  const list = [];
  const seen = /* @__PURE__ */ new Set();
  for (const raw of incoming) {
    const t = sanitizeWebhookTrigger(raw, existing);
    if (!t || seen.has(t.id)) continue;
    seen.add(t.id);
    list.push(t);
  }
  writeConfig({ webhookTriggers: list });
  reconcileWebhookServer();
  return list;
});
import_electron10.ipcMain.handle("webhooks:delete", (_evt, arg) => {
  const id = typeof arg === "string" ? arg : "";
  const list = (readConfig().webhookTriggers ?? []).filter((t) => t.id !== id);
  writeConfig({ webhookTriggers: list });
  reconcileWebhookServer();
  return list;
});
import_electron10.ipcMain.handle("webhooks:generateSecret", () => (0, import_node_crypto8.randomBytes)(32).toString("hex"));
import_electron10.ipcMain.handle("webhooks:status", () => ({
  running: webhookServer != null,
  url: lastWebhookUrl,
  endpoints: webhookEndpointUrls()
}));
function sanitizeWebhookTrigger(raw, existing) {
  if (!raw || typeof raw !== "object") return null;
  const r = raw;
  const id = typeof r.id === "string" ? r.id.trim() : "";
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(id)) return null;
  const prior = existing.find((t) => t.id === id);
  const secret = typeof r.secret === "string" && r.secret.trim() ? r.secret.trim() : prior?.secret ?? "";
  const mode = isTriggerMode(r.mode) ? r.mode : prior?.mode ?? DEFAULT_TRIGGER_MODE;
  return {
    id,
    name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : prior?.name ?? id,
    secret,
    // A secretless endpoint can never be enabled — it would be an open door.
    enabled: secret ? typeof r.enabled === "boolean" ? r.enabled : prior?.enabled ?? false : false,
    mode,
    schema: typeof r.schema === "string" && r.schema.trim() ? r.schema : prior?.schema ?? DEFAULT_WEBHOOK_SCHEMA,
    createdAt: typeof r.createdAt === "number" && r.createdAt > 0 ? r.createdAt : prior?.createdAt ?? Date.now()
  };
}
function isTriggerMode(v) {
  return v === "strict" || v === "allow-all" || v === "communication-only";
}
import_electron10.ipcMain.handle("org:getTrigger", () => readConfig().orgTrigger ?? DEFAULT_ORG_TRIGGER);
import_electron10.ipcMain.handle("org:setTrigger", (_evt, arg) => {
  const current = readConfig().orgTrigger ?? DEFAULT_ORG_TRIGGER;
  const p = arg ?? {};
  const next = {
    apiKey: typeof p.apiKey === "string" ? p.apiKey.trim() : current.apiKey,
    enabled: typeof p.enabled === "boolean" ? p.enabled : current.enabled,
    mode: isTriggerMode(p.mode) ? p.mode : current.mode
  };
  writeConfig({ orgTrigger: next });
  return next;
});
import_electron10.ipcMain.handle("triggerHistory:list", () => listTriggerHistory());
import_electron10.ipcMain.handle("triggerHistory:clear", (_evt, arg) => {
  const source = arg === "webhook" || arg === "org" ? arg : void 0;
  clearTriggerHistory(source);
  pruneHeldTokens();
  notifyTriggerHistoryUpdated();
  return { ok: true };
});
import_electron10.ipcMain.handle("triggerHistory:decide", (_evt, arg) => {
  const p = arg ?? {};
  const id = typeof p.id === "string" ? p.id : "";
  const decision = p.decision === "approved" ? "approved" : p.decision === "rejected" ? "rejected" : null;
  if (!id || !decision) return null;
  const entry = listTriggerHistory().find((e) => e.id === id);
  if (!entry) return null;
  if (entry.decision !== "pending") return entry;
  if (decision === "rejected") {
    const next2 = updateTriggerHistory(id, { decision: "rejected" });
    notifyTriggerHistoryUpdated();
    return next2;
  }
  const taskId = `webhook-${(0, import_node_crypto8.randomBytes)(8).toString("hex")}`;
  const tokenHash = heldTokenHashFor(id);
  const title = entry.title ?? (entry.body.length > 80 ? `${entry.body.slice(0, 79)}\u2026` : entry.body);
  if (!dispatchWebhookWork({ taskId, title, message: entry.body, tokenHash, origin: entry.source })) {
    return entry;
  }
  if (tokenHash) {
    heldTokens().delete(tokenHash);
    persistHeldTokens();
  }
  const next = updateTriggerHistory(id, { decision: "approved", taskId });
  pruneHeldTokens();
  notifyTriggerHistoryUpdated();
  return next;
});
import_electron10.ipcMain.handle("webhook:start", () => startWebhookServer());
import_electron10.ipcMain.handle("webhook:stop", () => {
  stopWebhookServer();
  return { ok: true };
});
import_electron10.ipcMain.handle("webhook:status", () => ({ running: webhookServer != null, url: lastWebhookUrl }));
import_electron10.ipcMain.handle("webhook:generateSecret", () => {
  const secret = (0, import_node_crypto8.randomBytes)(32).toString("hex");
  writeConfig({ webhookSecret: secret });
  upsertLegacyWebhookTrigger({ secret });
  return { ok: true, secret };
});
import_electron10.ipcMain.handle("webhook:setConfig", (_evt, patch) => {
  const p = patch ?? {};
  const next = {};
  if (typeof p.secret === "string") next.webhookSecret = p.secret.trim() || void 0;
  if (typeof p.port === "number" && Number.isFinite(p.port)) next.webhookPort = p.port;
  if (typeof p.enabled === "boolean") next.webhookEnabled = p.enabled;
  writeConfig(next);
  upsertLegacyWebhookTrigger({
    secret: typeof p.secret === "string" ? p.secret.trim() : void 0,
    enabled: typeof p.enabled === "boolean" ? p.enabled : void 0
  });
  reconcileWebhookServer();
  return { ok: true };
});
function upsertLegacyWebhookTrigger(patch) {
  const list = readConfig().webhookTriggers ?? [];
  const prior = list.find((t) => t.id === "legacy");
  const secret = patch.secret !== void 0 ? patch.secret : prior?.secret ?? "";
  if (!secret) return;
  const row = {
    id: "legacy",
    name: prior?.name ?? "Default webhook",
    secret,
    enabled: patch.enabled !== void 0 ? patch.enabled : prior?.enabled ?? false,
    mode: prior?.mode ?? DEFAULT_TRIGGER_MODE,
    schema: prior?.schema ?? DEFAULT_WEBHOOK_SCHEMA,
    createdAt: prior?.createdAt ?? Date.now()
  };
  writeConfig({
    webhookTriggers: prior ? list.map((t) => t.id === "legacy" ? row : t) : [...list, row]
  });
}
import_electron10.ipcMain.handle("freeflow:setConfig", (_evt, patch) => {
  const p = patch ?? {};
  const next = {};
  if (typeof p.enabled === "boolean") next.freeflowEnabled = p.enabled;
  if (typeof p.apiKey === "string") next.groqApiKey = p.apiKey.trim() || void 0;
  if (typeof p.model === "string") next.freeflowModel = p.model.trim() || DEFAULT_GROQ_MODEL;
  writeConfig(next);
  return { ok: true };
});
import_electron10.ipcMain.handle("freeflow:transcribe", async (_evt, arg) => {
  const cfg = readConfig();
  if (!cfg.freeflowEnabled) return { ok: false, error: "Free Flow is disabled" };
  if (!cfg.groqApiKey) return { ok: false, error: "no Groq API key set" };
  const a = arg ?? {};
  if (!(a.audio instanceof ArrayBuffer) && !(a.audio instanceof Uint8Array)) {
    return { ok: false, error: "no audio" };
  }
  const out = await transcribeWithGroq({
    apiKey: cfg.groqApiKey,
    audio: a.audio,
    mimeType: typeof a.mimeType === "string" ? a.mimeType : void 0,
    filename: typeof a.filename === "string" ? a.filename : void 0,
    model: cfg.freeflowModel || DEFAULT_GROQ_MODEL,
    language: typeof a.language === "string" && a.language ? a.language : void 0
  });
  if (out.ok) analytics.trackFeature("voice_dictation");
  return out;
});
registerRealtimeIpc();
var completionWatcher = initCompletionWatcher({
  readTasks: () => {
    const t = hive.tasks();
    return Array.isArray(t?.tasks) ? t.tasks : [];
  },
  // Voice dispatches go out as from:michael-voice, so assignee done-replies land here.
  readInbox: () => {
    try {
      const mv = hive.inbox("michael-voice");
      const godId = hive.registry().godId;
      const god = godId ? hive.inbox(godId) : [];
      const seen = /* @__PURE__ */ new Set();
      return [...mv, ...god].filter((m) => !!m?.id && !seen.has(m.id) && seen.add(m.id) !== void 0);
    } catch {
      return [];
    }
  },
  onNotify: (evt) => {
    try {
      if (!import_electron10.Notification.isSupported()) return;
      const reg = hive.registry();
      const title = resolveGodName(reg.agents[reg.godId ?? "god"]?.name);
      new import_electron10.Notification({ title, body: evt.summary }).show();
    } catch {
    }
  }
});
registerRealtimeActionIpc({
  hiveEnabled: () => hive.enabled(),
  hiveSend: (partial, from) => hive.send(partial, from),
  hiveTasks: () => hive.tasks(),
  hiveWriteTasks: (tasks) => hive.writeTasks(tasks),
  hiveRegistry: () => hive.registry(),
  hiveLog: (event) => hive.appendLog(event),
  controlPause: (id, on) => control.pause(id, on),
  controlSteer: (id, text) => control.steer(id, text),
  controlHalt: (id) => control.halt(id),
  controlSnapshot: (id) => control.snapshot(id),
  killAgent: (id) => {
    const r = ptyManager.kill(id);
    teardownPty(id);
    try {
      liveWebContents()?.send("hive:agentArchived", { id });
    } catch {
    }
    return r;
  },
  spawnAgent: async (opts) => {
    const o = opts;
    const res = await spawnAgentCore(o, null);
    if (res.ok) {
      try {
        liveWebContents()?.send("hive:agentSpawned", {
          id: o.id,
          name: o.hive?.name ?? o.id,
          provider: o.provider ?? o.hive?.provider ?? "claude",
          cwd: res.worktreePath ?? o.cwd,
          command: o.command,
          role: o.hive?.role,
          worktreePath: res.worktreePath
        });
      } catch {
      }
    }
    return res;
  },
  listMissions: () => readConfig().missions ?? [],
  // The spec carries lastFiredAt through from listMissions(), so a wholesale write
  // preserves the scheduler's stamps; edit_schedule is deliberate + rare.
  saveMissions: (missions) => {
    writeConfig({ missions });
  },
  // rt-12: register each voice dispatch so the watcher can detect its completion.
  trackDispatch: (d) => {
    try {
      completionWatcher.track({ ...d, kind: "dispatch" });
    } catch {
    }
  },
  // ── v0.3.4 full-control extensions ──
  controlResume: (id) => control.resume(id),
  controlAutoDelivery: (id, paused) => control.pauseAutoDelivery(id, paused),
  controlGateTool: (id, toolName, on) => control.gateTool(id, toolName, on),
  setArchived: (id, archived) => {
    if (!hive.enabled()) return { ok: false, error: "hive disabled" };
    hive.setArchived(id, archived);
    try {
      liveWebContents()?.send(archived ? "hive:agentArchived" : "hive:agentSpawned", { id });
    } catch {
    }
    return { ok: true };
  },
  // clear_context: hand the text to the renderer's queue so delivery rides every
  // existing gate (idle-only, boot grace, draft/picker safety).
  enqueueToAgent: (id, text) => {
    try {
      liveWebContents()?.send("realtime:enqueue", { agentId: id, text });
    } catch {
    }
  },
  getConfigValue: (key) => readConfig()[key],
  patchConfig: (patch) => {
    writeConfig(patch);
  }
});
completionWatcher.onCompletion((evt) => {
  try {
    liveWebContents()?.send("realtime:completion", evt);
  } catch {
  }
});
var floorWatcher = new RealtimeFloorWatcher({
  enabled: () => hive.enabled(),
  registry: () => hive.registry(),
  tasks: () => hive.tasks(),
  ptys: () => ptyManager.list().map((p) => ({ id: p.id, lastOutputAt: p.lastOutputAt })),
  push: (text) => {
    try {
      liveWebContents()?.send("realtime:floorDelta", { text });
    } catch {
    }
  }
});
floorWatcher.start();
import_electron10.ipcMain.handle("realtime:setSessionLive", (_e, live) => {
  completionWatcher.setSessionLive(live === true);
  floorWatcher.setSessionLive(live === true);
  return { ok: true };
});
import_electron10.ipcMain.handle("app:info", () => {
  let changelog = "";
  for (const p of [(0, import_node_path20.join)(import_electron10.app.getAppPath(), "CHANGELOG.md"), (0, import_node_path20.join)(process.cwd(), "CHANGELOG.md")]) {
    try {
      changelog = (0, import_node_fs19.readFileSync)(p, "utf8");
      if (changelog) break;
    } catch {
    }
  }
  const top = changelog ? changelog.split(/\n## /).slice(1, 3).map((s) => `## ${s}`).join("\n").slice(0, 8e3) : "";
  return { version: import_electron10.app.getVersion(), changelog: top };
});
import_electron10.ipcMain.handle("realtime:drainCompletions", () => completionWatcher.drainQueuedCompletions());
import_electron10.ipcMain.handle("realtime:waitFor", (_e, taskId, timeoutMs) => typeof taskId === "string" ? completionWatcher.waitFor(taskId, typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : 12e4) : Promise.resolve({ timedOut: true, taskId: "" }));
completionWatcher.start();
var WORKER_TICK_MS = 1500;
var workerWatchTimer = null;
var workerTickRunning = false;
function spawnRequestsDir() {
  const root = hive.root();
  return root ? (0, import_node_path20.join)(root, "spawn-requests") : null;
}
function archiveRequest(filePath, sub) {
  const queue = spawnRequestsDir();
  try {
    if (!queue) throw new Error("no hive root");
    const dir = (0, import_node_path20.join)(queue, sub);
    (0, import_node_fs19.mkdirSync)(dir, { recursive: true });
    (0, import_node_fs19.renameSync)(filePath, (0, import_node_path20.join)(dir, (0, import_node_path20.basename)(filePath)));
  } catch (e) {
    try {
      (0, import_node_fs19.unlinkSync)(filePath);
    } catch {
    }
    console.error("[worker] archiveRequest failed:", e);
  }
}
function workerSignaledDone(workerId, spawnedAt) {
  const root = hive.root();
  if (!root) return false;
  const base = (0, import_node_path20.join)(root, "agents", workerId, "outbox");
  for (const dir of [base, (0, import_node_path20.join)(base, ".sent")]) {
    if (!(0, import_node_fs19.existsSync)(dir)) continue;
    let files;
    try {
      files = (0, import_node_fs19.readdirSync)(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const fp = (0, import_node_path20.join)(dir, f);
      try {
        const msg = JSON.parse((0, import_node_fs19.readFileSync)(fp, "utf8"));
        if (msg.act !== "done") continue;
        let ts = Date.parse(msg.created_at ?? "");
        if (!Number.isFinite(ts)) {
          try {
            ts = (0, import_node_fs19.statSync)(fp).mtimeMs;
          } catch {
            ts = NaN;
          }
        }
        if (Number.isFinite(ts) && ts > spawnedAt) return true;
      } catch {
      }
    }
  }
  return false;
}
async function processSpawnRequest(filePath) {
  let raw;
  try {
    raw = JSON.parse((0, import_node_fs19.readFileSync)(filePath, "utf8"));
  } catch (e) {
    console.error("[worker] unparseable spawn-request:", filePath, e);
    informGod("[worker spawn rejected] unparseable request", `Could not parse spawn-request ${(0, import_node_path20.basename)(filePath)} \u2014 ${String(e)}`);
    archiveRequest(filePath, ".failed");
    return;
  }
  const slack = raw.slack && typeof raw.slack.channel === "string" && typeof raw.slack.thread_ts === "string" ? { channel: raw.slack.channel, thread_ts: raw.slack.thread_ts } : void 0;
  const fail = (reason) => {
    informGod(`[worker spawn rejected] ${reason}`, `Spawn-request ${(0, import_node_path20.basename)(filePath)} rejected: ${reason}.`, slack);
    archiveRequest(filePath, ".failed");
  };
  const objective = typeof raw.objective === "string" ? raw.objective.trim() : "";
  if (!objective) {
    fail('missing "objective"');
    return;
  }
  const reqId = (typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : (0, import_node_path20.basename)(filePath).replace(/\.json$/i, "")).replace(/[^A-Za-z0-9._-]/g, "-");
  const workerId = `worker-${reqId}`;
  if (liveWorkers.has(workerId)) {
    fail(`worker "${workerId}" already running`);
    return;
  }
  const cwd = typeof raw.cwd === "string" && raw.cwd.trim() ? expandTilde(raw.cwd) : "";
  if (!cwd || !(0, import_node_fs19.existsSync)(cwd)) {
    fail(`"cwd" missing or not found (${cwd || "unset"})`);
    return;
  }
  const cfgSpawn = readConfig();
  const launch = buildWorkerLaunch({
    requestCommand: raw.command,
    requestProvider: raw.provider,
    requestModel: raw.model,
    defaultCommand: cfgSpawn.defaultCommand,
    autoMode: !!cfgSpawn.autoMode
  });
  const bin = launch.bin;
  if (!isSafeCommandName(bin) && !(0, import_node_path20.isAbsolute)(bin)) {
    fail(`refusing spawn: engine command "${bin}" is not a plain command name or an absolute path`);
    return;
  }
  if (!ptyManager.isCommandAvailable(bin)) {
    fail(`engine CLI "${bin}" is not installed`);
    return;
  }
  const isolate = raw.isolate !== false;
  let baseBranch = "main";
  try {
    const br = await getBranch(cwd);
    if ("current" in br && br.current) baseBranch = br.current;
  } catch {
  }
  const meta = {
    id: workerId,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : `Worker ${reqId.slice(0, 12)}`,
    provider: raw.provider,
    role: "worker",
    cwd
  };
  const brokerEnv = {};
  if (integrationBroker.running()) {
    const token = integrationBroker.grant(workerId, enabledIds());
    brokerEnv.MD_BROKER_URL = integrationBroker.url();
    brokerEnv.MD_BROKER_TOKEN = token;
  }
  const spawnOpts = {
    id: workerId,
    cwd,
    command: bin,
    cols: 120,
    rows: 32,
    args: launch.args,
    hive: meta,
    isolate,
    provider: raw.provider,
    env: brokerEnv
  };
  let res;
  try {
    res = await spawnAgentCore(spawnOpts, liveWebContents());
  } catch (e) {
    res = { ok: false, error: String(e) };
  }
  if (!res.ok) {
    integrationBroker.revoke(workerId);
    fail(`spawn failed \u2014 ${res.error ?? "unknown error"}`);
    return;
  }
  try {
    liveWebContents()?.send("hive:agentSpawned", {
      id: workerId,
      name: meta.name,
      provider: raw.provider ?? "claude",
      cwd: res.worktreePath ?? cwd,
      command: launch.command,
      role: meta.role,
      worktreePath: res.worktreePath,
      character: typeof raw.character === "string" ? raw.character : void 0,
      accent: typeof raw.accent === "string" ? raw.accent : void 0
    });
  } catch {
  }
  const tokenCap = typeof raw.tokenCap === "number" && Number.isFinite(raw.tokenCap) && raw.tokenCap > 0 ? raw.tokenCap : void 0;
  liveWorkers.set(workerId, { workerId, reqId, name: meta.name, slack, baseBranch, spawnedAt: Date.now(), tokenCap });
  try {
    const prefix = slack ? buildAutonomousRequestProtocol(slack.channel, slack.thread_ts, slackReplyScriptPath()) : "[AUTONOMOUS WORKER TASK \u2014 no interactive human is watching. Work autonomously; do not ask interactive questions.] The task starts now: ";
    const suffix = `

[CAPABILITIES] Before you start, consult your capability catalog \u2014 run the \`/capabilities\` skill (or read \`$AGENT_DIR/.claude/skills/capabilities/SKILL.md\`). It lists your temporal date-range skills (\`/today\`, \`/last30Days\`, \`/lastQuarter\`, \u2026) and the integrations available to you (reached via the loopback broker) and how to call each. For any time-scoped work, resolve the dates with those skills instead of computing them by hand.

[WORKER COMPLETION] When finished, signal done by sending ONE outbox message to god with "act":"done" and a short result summary \u2014 that releases this ephemeral worker (terminal closed; your branch is handed to god). Do NOT push to any remote; god is the sole integrator.`;
    hive.send({ to: workerId, conversation: `worker-${reqId}`, act: "request", subject: meta.name, body: `${prefix}${objective}${suffix}` }, "god");
  } catch (e) {
    console.error("[worker] dispatch send failed:", e);
  }
  console.log(`[worker] spawned ${workerId} (cwd=${cwd}, base=${baseBranch}${slack ? ", slack" : ""})`);
  archiveRequest(filePath, ".done");
}
function workerTokensUsed(workerId) {
  const s = usageProvider.getAgentUsage(workerId);
  return s ? s.input + s.output + s.cacheRead + s.cacheCreation : 0;
}
var GC_SWEEP_MS = 6e4;
var lastGcSweepAt = 0;
var gcSweepRunning = false;
async function gcPreservedWorktrees() {
  if (gcSweepRunning || preservedWorktrees.size === 0) return;
  gcSweepRunning = true;
  try {
    for (const [key, e] of [...preservedWorktrees]) {
      if (liveWorkers.has(e.workerId)) continue;
      if (!(0, import_node_fs19.existsSync)(e.wtPath)) {
        removeWorkerScratch(e.workerId);
        preservedWorktrees.delete(key);
        console.log(`[worker gc] ${e.workerId}: worktree already gone \u2014 reclaimed scratch`);
        continue;
      }
      let safe;
      try {
        safe = await worktreeIsGcSafe(e.wtPath, e.baseBranch);
      } catch (err) {
        console.error("[worker gc] gc-safe check threw (keeping):", err);
        continue;
      }
      if (!safe.gc) continue;
      const r = await removeWorktree(e.origCwd, e.wtPath);
      if (!r.ok) {
        console.error(`[worker gc] removeWorktree failed (keeping ${e.workerId}):`, r.error);
        continue;
      }
      removeWorkerScratch(e.workerId);
      preservedWorktrees.delete(key);
      console.log(`[worker gc] reclaimed ${e.workerId} (${safe.detail})`);
      informGod(
        `[worker worktree reclaimed] ${e.workerId}`,
        `The preserved worktree for ${e.workerId} is now integrated (${safe.detail}), so it and its scratch dir were garbage-collected.
Worktree: ${e.wtPath}`,
        e.slack
      );
    }
  } finally {
    gcSweepRunning = false;
  }
}
async function ephemeralWorkerTick() {
  if (workerTickRunning) return;
  workerTickRunning = true;
  try {
    const cfg = readConfig();
    const maxWorkers = Math.max(1, cfg.maxConcurrentWorkers ?? 4);
    const idleTimeoutMs = Math.max(1, cfg.workerIdleTimeoutMinutes ?? 20) * 6e4;
    const defaultTokenCap = typeof cfg.defaultWorkerTokenCap === "number" && cfg.defaultWorkerTokenCap > 0 ? cfg.defaultWorkerTokenCap : 0;
    for (const [workerId, rec] of [...liveWorkers]) {
      if (rec.releasing) continue;
      if (workerSignaledDone(workerId, rec.spawnedAt)) {
        rec.releasing = true;
        console.log(`[worker] ${workerId} signaled done \u2014 releasing`);
        ptyManager.kill(workerId);
        teardownPty(workerId);
        continue;
      }
      const tokenCap = rec.tokenCap && rec.tokenCap > 0 ? rec.tokenCap : defaultTokenCap;
      if (tokenCap > 0) {
        const used = workerTokensUsed(workerId);
        if (used > tokenCap) {
          rec.releasing = true;
          console.warn(`[worker] reaping ${workerId} \u2014 token cap (${used.toLocaleString()} > ${tokenCap.toLocaleString()})`);
          informGod(
            `[worker reaped \u2014 token cap] ${workerId}`,
            `Worker ${workerId} used ${used.toLocaleString()} tokens (> its cap of ${tokenCap.toLocaleString()}) and was reaped. Any committed work on its branch is preserved for you.`,
            rec.slack
          );
          ptyManager.kill(workerId);
          teardownPty(workerId);
          continue;
        }
      }
      const idleMs = ptyManager.idleFor(workerId);
      if (idleMs === void 0) continue;
      if (idleMs > idleTimeoutMs) {
        rec.releasing = true;
        console.warn(`[worker] reaping idle ${workerId} (${Math.round(idleMs / 6e4)}min idle)`);
        informGod(
          `[worker reaped \u2014 idle] ${workerId}`,
          `Worker ${workerId} produced no output for ${Math.round(idleMs / 6e4)} min (> the ${Math.round(idleTimeoutMs / 6e4)} min cap) and never signaled done, so it was reaped. Any committed work on its branch is preserved for you.`,
          rec.slack
        );
        ptyManager.kill(workerId);
        teardownPty(workerId);
      }
    }
    const dir = readConfig().orchestratorMaySpawn ? spawnRequestsDir() : null;
    if (dir && (0, import_node_fs19.existsSync)(dir)) {
      let files = [];
      try {
        files = (0, import_node_fs19.readdirSync)(dir).filter((f) => f.endsWith(".json")).sort();
      } catch {
      }
      for (const f of files) {
        if (liveWorkers.size >= maxWorkers) break;
        await processSpawnRequest((0, import_node_path20.join)(dir, f));
      }
    }
    const now = Date.now();
    if (preservedWorktrees.size > 0 && now - lastGcSweepAt >= GC_SWEEP_MS) {
      lastGcSweepAt = now;
      await gcPreservedWorktrees();
    }
  } catch (e) {
    console.error("[worker] tick error:", e);
  } finally {
    workerTickRunning = false;
  }
}
function startEphemeralWorkerWatcher() {
  if (workerWatchTimer || !hive.enabled()) return;
  const dir = spawnRequestsDir();
  if (dir) {
    try {
      (0, import_node_fs19.mkdirSync)(dir, { recursive: true });
    } catch {
    }
  }
  workerWatchTimer = setInterval(() => {
    void ephemeralWorkerTick();
  }, WORKER_TICK_MS);
}
function stopEphemeralWorkerWatcher() {
  if (workerWatchTimer) {
    clearInterval(workerWatchTimer);
    workerWatchTimer = null;
  }
}
import_electron10.ipcMain.handle("workers:list", () => {
  const cfg = readConfig();
  const defaultCap = typeof cfg.defaultWorkerTokenCap === "number" && cfg.defaultWorkerTokenCap > 0 ? cfg.defaultWorkerTokenCap : 0;
  const now = Date.now();
  const live = [...liveWorkers.values()].map((rec) => {
    const idle = ptyManager.idleFor(rec.workerId);
    const effCap = rec.tokenCap && rec.tokenCap > 0 ? rec.tokenCap : defaultCap > 0 ? defaultCap : 0;
    return {
      workerId: rec.workerId,
      reqId: rec.reqId,
      name: rec.name ?? rec.workerId,
      baseBranch: rec.baseBranch,
      spawnedAt: rec.spawnedAt,
      ageMs: Math.max(0, now - rec.spawnedAt),
      idleMs: idle === void 0 ? null : idle,
      tokensUsed: workerTokensUsed(rec.workerId),
      tokenCap: effCap > 0 ? effCap : null,
      hasSlack: !!rec.slack,
      releasing: !!rec.releasing,
      status: rec.releasing ? "releasing" : "working"
    };
  });
  const preserved = [...preservedWorktrees.values()].map((e) => ({
    workerId: e.workerId,
    wtPath: e.wtPath,
    baseBranch: e.baseBranch,
    preservedAt: e.preservedAt
  }));
  return { live, preserved, maxWorkers: Math.max(1, cfg.maxConcurrentWorkers ?? 4) };
});
import_electron10.ipcMain.handle("workers:stop", (_evt, workerId) => {
  if (typeof workerId !== "string" || !workerId) return { ok: false, error: "invalid worker id" };
  const rec = liveWorkers.get(workerId);
  if (!rec) return { ok: false, error: "no such live worker" };
  if (rec.releasing) return { ok: true };
  rec.releasing = true;
  console.log(`[worker] manual stop requested for ${workerId}`);
  try {
    ptyManager.kill(workerId);
  } catch (e) {
    return { ok: false, error: String(e) };
  }
  teardownPty(workerId);
  return { ok: true };
});
function bootstrapHiveServices() {
  if (!hive.enabled()) return;
  hive.ensureHive();
  hive.setRuntimeInfo({ version: import_electron10.app.getVersion(), packaged: import_electron10.app.isPackaged, appPath: import_electron10.app.getAppPath() });
  hive.setOrchestratorMaySpawn(readConfig().orchestratorMaySpawn === true);
  hive.appendLog({
    kind: "app-start",
    version: import_electron10.app.getVersion(),
    packaged: import_electron10.app.isPackaged,
    // WHICH bundle, not just which version. Version plus packaged is not enough
    // to tell two builds apart: a stale copy in /Applications and a fresh one in
    // dist/ can report the same version and both be packaged, and picking the
    // wrong one by habit looks exactly like the new build being broken. Cost us
    // twice before this line existed.
    appPath: import_electron10.app.getAppPath(),
    exePath: process.execPath,
    electron: process.versions.electron,
    platform: process.platform
  });
  control.replaceAutoDeliveryPauses(readConfig().autoDeliveryPausedAgents ?? []);
  archiveOrphanedAgents();
  hive.startRouter();
  startEphemeralWorkerWatcher();
  void integrationBroker.start().then((r) => {
    if (r.ok) console.log("[broker] integration broker listening on", integrationBroker.url());
    else console.error("[broker] failed to start:", r.error);
  });
  ensureDefaultMissions();
  syncMissions();
  syncContextTriggers();
  if ((readConfig().webhookTriggers ?? []).length > 0) startWebhookDoneObserver();
  hookServer.start();
  void telemetry.start().then((r) => {
    if (r.ok && r.endpoint) {
      hive.setOtelEndpoint(r.endpoint);
      console.log("[telemetry] collector listening", r.endpoint);
    } else console.error("[telemetry] collector failed to start:", r.error);
  });
  memory.start();
  reflector.start();
  armAlwaysOnBeats();
}
var WORKER_WAKE_POLL_MS = 15e3;
var workerWakeTimer = null;
function nudgeWorker(ptyId, ids = []) {
  const wrote = ptyManager.write(ptyId, inboxNudgeText(ids));
  if (!wrote.ok) {
    console.warn(`[worker-wake] write failed for ${ptyId}: ${wrote.error}`);
    return;
  }
  setTimeout(() => {
    try {
      const submitted = ptyManager.write(ptyId, "\r");
      if (!submitted.ok) console.warn(`[worker-wake] submit failed for ${ptyId}: ${submitted.error}`);
    } catch (e) {
      console.error("[worker-wake] submit threw:", e);
    }
  }, 140);
}
function runWorkerWakeBeat() {
  if (!hive.enabled()) return;
  const reg = hive.registry();
  if (!reg?.agents || !reg.godId) return;
  const now = Date.now();
  const facts = [];
  for (const [agentId, a] of Object.entries(reg.agents)) {
    if (agentId === reg.godId || a?.archived) continue;
    const ptyId = ptyForAgent(agentId);
    if (!ptyId) continue;
    const snap = control.snapshot(agentId);
    facts.push({
      agentId,
      isGod: agentId === reg.godId,
      ptyId,
      lastOutputAt: ptyManager.lastOutputAt(ptyId) ?? 0,
      inboxCount: hive.inbox(agentId).length,
      autoDeliveryPaused: snap.autoDeliveryPaused,
      paused: snap.paused,
      halted: snap.halted
    });
  }
  for (const agentId of workerWake.decide(facts, now)) {
    const ptyId = ptyForAgent(agentId);
    if (!ptyId) continue;
    const ids = hive.inbox(agentId).map((m) => m.id).filter(Boolean);
    if (!ids.length) {
      console.log(`[worker-wake] ${agentId} drained before delivery, skipping`);
      continue;
    }
    console.log(`[worker-wake] nudging ${agentId} on ${ptyId} (${ids.length} pending)`);
    nudgeWorker(ptyId, ids);
  }
}
function armAlwaysOnBeats() {
  if (fleetTimer) clearInterval(fleetTimer);
  writeFleetSnapshot();
  fleetTimer = setInterval(writeFleetSnapshot, 8e3);
  if (breakerBeatTimer) clearInterval(breakerBeatTimer);
  breakerBeatTimer = setInterval(() => {
    try {
      runBreakerBeat(3e5);
    } catch (e) {
      console.error("[breaker beat]", e);
    }
  }, 3e4);
  if (workerWakeTimer) clearInterval(workerWakeTimer);
  workerWakeTimer = setInterval(() => {
    try {
      runWorkerWakeBeat();
    } catch (e) {
      console.error("[worker-wake beat]", e);
    }
  }, WORKER_WAKE_POLL_MS);
  runWorkerWakeBeat();
}
var lastSuspendAt = null;
var resumeHealthTimer = null;
function healthCheckPtys(reason, awayMs) {
  const ptys = ptyManager.list();
  const dead = [];
  for (const p of ptys) {
    if (typeof p.pid === "number" && p.pid > 0) {
      try {
        process.kill(p.pid, 0);
      } catch {
        dead.push(p.id);
      }
    }
  }
  const away = awayMs != null ? ` (away ~${Math.round(awayMs / 1e3)}s)` : "";
  if (dead.length) {
    console.warn(`[power] ${reason}${away}: ${dead.length}/${ptys.length} PTY(s) look wedged (process gone):`, dead.join(", "));
    breakerToast("Agents need a restart", `${dead.length} agent terminal(s) didn't survive sleep \u2014 re-open them to resume.`);
  } else {
    console.log(`[power] ${reason}${away}: ${ptys.length} PTY(s) healthy`);
  }
  try {
    liveWebContents()?.send("power:resume", { reason, awayMs, dead, total: ptys.length });
  } catch {
  }
}
function onSystemResume(reason) {
  console.log(`[power] ${reason} \u2014 re-arming scheduler, beats, router, keep-awake`);
  try {
    syncMissions();
  } catch (e) {
    console.error("[power] syncMissions on resume", e);
  }
  try {
    syncContextTriggers();
  } catch (e) {
    console.error("[power] syncContextTriggers on resume", e);
  }
  try {
    armAlwaysOnBeats();
  } catch (e) {
    console.error("[power] armAlwaysOnBeats on resume", e);
  }
  try {
    hive.stopRouter();
    hive.startRouter();
    const drained = hive.routeOnce();
    if (drained > 0) console.log(`[power] ${reason} \u2014 flushed ${drained} queued hive message(s)`);
  } catch (e) {
    console.error("[power] router re-arm on resume", e);
  }
  try {
    syncKeepAwake();
  } catch (e) {
    console.error("[power] syncKeepAwake on resume", e);
  }
  const awayMs = lastSuspendAt != null ? Date.now() - lastSuspendAt : null;
  if (resumeHealthTimer) clearTimeout(resumeHealthTimer);
  resumeHealthTimer = setTimeout(() => {
    resumeHealthTimer = null;
    healthCheckPtys(reason, awayMs);
  }, 15e3);
}
import_electron10.app.whenReady().then(async () => {
  try {
    await installBundledConsoleProtocol();
  } catch {
    console.error("[window] bundled console protocol failed to initialize");
  }
  if (readConfig().realtimeVoiceEnabled) writeConfig({ realtimeVoiceEnabled: false });
  analytics.init({
    stateDir: import_electron10.app.getPath("userData"),
    appVersion: import_electron10.app.getVersion(),
    enabled: readConfig().telemetryEnabled !== false
  });
  const startupHireLink = process.argv.find((a) => a.startsWith("munderdifflin://"));
  if (startupHireLink) void handleHireLink(startupHireLink);
  process.env.MD_SLACK_REPLY_CONFIG = slackReplyConfigPath();
  try {
    persist.open();
  } catch (e) {
    console.error("[db] open failed:", e);
  }
  initAutoUpdater(() => liveWebContents());
  bootstrapHiveServices();
  import_electron10.powerMonitor.on("resume", () => onSystemResume("resume"));
  import_electron10.powerMonitor.on("unlock-screen", () => onSystemResume("unlock-screen"));
  import_electron10.powerMonitor.on("suspend", () => {
    lastSuspendAt = Date.now();
    console.log("[power] suspend \u2014 system sleeping");
  });
  import_electron10.powerMonitor.on("lock-screen", () => {
    lastSuspendAt = Date.now();
    console.log("[power] lock-screen");
  });
  if (readConfig().multiWindow) installAppMenu();
  registerPetBridge();
  createTray();
  createWindow();
  createPetWindow();
  const slackCfg = readConfig();
  if (slackCfg.slackEnabled && slackCfg.slackSigningSecret) {
    void startSlackServer().then((r) => {
      if (!r.ok) console.error("[slack] auto-start failed:", r.error);
      else console.log("[slack] webhook listening", r.url ? `(tunnel: ${r.url})` : "(no tunnel)");
    });
  }
  if (enabledWebhookEndpoints().length > 0) {
    void startWebhookServer().then((r) => {
      if (!r.ok) console.error("[webhook] auto-start failed:", r.error);
      else console.log("[webhook] listening", r.url ? `(tunnel: ${r.url})` : "(no tunnel)");
    });
  }
  import_electron10.app.on("activate", () => {
    if (import_electron10.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
import_electron10.app.on("before-quit", (e) => {
  if (allowQuit) return;
  const count = ptyManager.list().length;
  if (count === 0) return;
  e.preventDefault();
  if (mainWindow) {
    mainWindow.focus();
    mainWindow.webContents.send("app:closeRequested", { ptyCount: count });
  }
});
onConfigWritten((config) => {
  for (const w of allWindows) {
    if (w.isDestroyed() || w.webContents.isDestroyed()) continue;
    w.webContents.send("config:changed", config);
  }
});
import_electron10.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    teardownAndQuit();
  }
});
var analyticsFlushed = false;
import_electron10.app.on("will-quit", (e) => {
  if (analyticsFlushed) return;
  analyticsFlushed = true;
  e.preventDefault();
  const finish2 = () => import_electron10.app.exit(0);
  Promise.race([
    analytics.endSession(),
    new Promise((r) => setTimeout(r, 1200))
  ]).then(finish2, finish2);
});
