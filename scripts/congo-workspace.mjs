// The local Congo library browser lets a user pick apps and screens as references. Their AI can resolve the
// current selection with `gocongo workspace context`. Older clients still use the request queue. The workspace
// reads Congo's public catalog and saves published screenshots. Source retrieval uses the CLI's existing rules.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const self = fileURLToPath(import.meta.url);
export const PROTOCOL = 2;
const PORTS = Array.from({length: 20}, (_, i) => 4880 + i);
const TTL_MS = 10 * 60 * 1000;
const STALE_MS = 30 * 60 * 1000;
export const MAX_REFERENCES = 24;
const APP_REFERENCES = 12;
export const REFERENCE_INDEX = 'congo-references.json';
const SCREENSHOT = /^\/api\/catalog\/screenshots\/([a-f0-9]{64})\.(png|jpg|webp)$/;
const ITEM_KINDS = ['template', 'app', 'screen'];
const ITEM_ID = /^[a-z0-9][a-z0-9-]{0,99}$/;
const MAX_ITEMS = 24;
const CANVAS_ID = /^[a-f0-9]{16}$/;
const MAX_CANVASES = 20;

export const WORKSPACE_USAGE = `Usage: gocongo workspace [open|canvas|context|connect|poll|reply|status|stop] [options]

  open                 Open the workspace in your browser (the default)
  canvas FILE          Show ideas, references, proposals or comparisons from a local JSON file
  context              Get the selected apps, screens and local reference images
  context --canvas ID  Get recorded decisions and their supporting context
  connect              For your AI: open or reuse the workspace and connect to it
  poll                 For your AI: wait for the next request from the workspace
  reply ID "LINE"      For your AI: answer a request with one short line (--error if it failed)
  status | stop        Show or stop the running workspace

  --project PATH       The project your AI works in (connect defaults to this folder)
  --no-browser         Print the address instead of opening your browser
  --timeout SECONDS    How long poll waits (default 1800)
  --json               JSON output

Browsing and reference screenshots are free. Downloading source uses your Congo Library subscription ($30/month).`;

// ---------------------------------------------------------------- paths and small helpers

export function workspaceHome(env = process.env) {
  if (env.CONGO_WORKSPACE_HOME) return path.resolve(env.CONGO_WORKSPACE_HOME);
  if (process.platform === 'win32') return path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Congo', 'gocongo-workspace');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'Congo', 'gocongo-workspace');
  return path.join(env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'congo', 'gocongo-workspace');
}
const files = home => ({home, server: path.join(home, 'server.json'), state: path.join(home, 'state.json'), log: path.join(home, 'workspace.log'), references: path.join(home, 'references')});

export function workspaceUi(env = process.env) {
  for (const dir of [env.CONGO_WORKSPACE_UI, path.join(here, 'workspace-ui'), path.join(here, '..', 'packages', 'cli', 'dist', 'workspace-ui')]) {
    if (dir && fs.existsSync(path.join(dir, 'index.html'))) return path.resolve(dir);
  }
  return null;
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, file);
}
const trimmed = (value, max) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
const httpsUrl = value => typeof value === 'string' && /^https:\/\//.test(value) ? value.slice(0, 1000) : null;
const fileSafe = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'screen';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

export function registryOrigin(env = process.env) {
  const url = new URL(env.CONGO_REGISTRY || 'https://gocongo.ai');
  if (url.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('CONGO_REGISTRY must be https');
  return url.origin;
}

/** A Library app or screen the person picked: its catalog identity, what the card showed and their note. Never source. */
export function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object' || !ITEM_KINDS.includes(raw.kind) || typeof raw.id !== 'string' || !ITEM_ID.test(raw.id)) return null;
  const app = raw.app && typeof raw.app === 'object'
    ? {id: trimmed(raw.app.id, 100), slug: trimmed(raw.app.slug, 100), name: trimmed(raw.app.name, 120)}
    : typeof raw.app === 'string' ? {id: null, slug: trimmed(raw.app, 100), name: null} : null;
  const source = typeof raw.sourceId === 'string' && ITEM_ID.test(raw.sourceId) ? {sourceId: raw.sourceId} : {};
  return {kind: raw.kind, id: raw.id, ...source, version: trimmed(raw.version, 200), app, title: trimmed(raw.title, 200) ?? raw.id, route: trimmed(raw.route, 300),
    image: httpsUrl(raw.image) ?? (typeof raw.image === 'string' && /^http:\/\/(127\.0\.0\.1|localhost):\d+\//.test(raw.image) ? raw.image : null),
    preview: httpsUrl(raw.preview), url: httpsUrl(raw.url), note: trimmed(raw.note, 1000) ?? ''};
}
export function normalizeTray(raw) {
  const list = Array.isArray(raw?.items) ? raw.items : [];
  if (list.length > MAX_ITEMS) throw Object.assign(new Error(`Select at most ${MAX_ITEMS} items at a time`), {status: 400});
  const items = [];
  for (const entry of list) {
    const item = normalizeItem(entry);
    if (!item) throw Object.assign(new Error('Unknown library item'), {status: 400});
    if (!items.some(existing => existing.kind === item.kind && existing.id === item.id)) items.push(item);
  }
  return {items, note: trimmed(raw?.note, 4000) ?? ''};
}

// ---------------------------------------------------------------- Congo's public catalog

export function createCatalog({origin, cacheDir, fetchImpl = fetch} = {}) {
  const memory = new Map();
  const absolute = src => {
    if (typeof src !== 'string' || !src) return null;
    try { const url = new URL(src, origin); return url.protocol === 'https:' || url.origin === origin ? url.href : null; } catch { return null; }
  };
  async function get(route, {persist = false} = {}) {
    const hit = memory.get(route);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
    const file = persist && cacheDir ? path.join(cacheDir, `${route.replace(/[^a-z0-9]+/gi, '-')}.json`) : null;
    try {
      const response = await fetchImpl(origin + route, {headers: {Accept: 'application/json', 'User-Agent': 'gocongo-workspace'}, signal: AbortSignal.timeout(15000)});
      if (!response.ok) throw Object.assign(new Error(`Congo library unavailable (${response.status})`), {status: 502});
      const value = await response.json();
      memory.set(route, {at: Date.now(), value});
      if (file) writeJson(file, value);
      return value;
    } catch (error) {
      const stale = hit?.value ?? (file ? readJson(file, null) : null);
      if (stale) return stale;
      throw Object.assign(new Error('Could not reach the Congo library. Check your connection.'), {status: 502, cause: error});
    }
  }
  const app = listing => ({
    id: listing.id, slug: listing.slug, name: listing.name, summary: listing.summary ?? '', category: listing.category ?? null, pageCount: listing.pageCount ?? null,
    access: listing.access ?? 'subscription', logo: absolute(listing.logo?.src), screenshot: absolute(listing.screenshot?.src),
    screenshots: (listing.screenshots ?? []).map(s => absolute(s?.src)).filter(Boolean),
    preview: listing.preview?.status === 'available' ? absolute(listing.preview.url) : null,
    inspiredBy: listing.inspiredBy?.name ?? null, inspiredByUrl: listing.inspiredBy?.url ?? null,
    url: `${origin}/websites/${encodeURIComponent(listing.slug)}`, release: listing.release?.id ?? null,
  });
  const screen = item => {
    const shot = item.screenshot ?? {};
    return {id: item.id, title: item.title, route: item.route ?? null, app: item.app ? {id: item.app.id, slug: item.app.slug, name: item.app.name} : null,
      categories: item.screenCategories ?? [], screenshot: absolute(shot.src), format: shot.width && shot.height && shot.height > shot.width * 1.2 ? 'mobile' : 'desktop',
      preview: absolute(item.preview), url: absolute(item.url), version: item.version ?? null,
      source: item.source ? {kind: item.source.kind, id: item.source.id, version: item.source.version} : null};
  };
  const clamp = (value, min, max, fallback) => { const n = Number.parseInt(value, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };
  const catalog = {
    origin,
    async apps() {
      const value = await get('/api/catalog', {persist: true});
      return {apps: (value.listings ?? []).filter(l => l.kind === 'app').map(app), categories: (value.categories ?? []).map(c => ({id: c.slug ?? c.id, title: c.title}))};
    },
    async screens(query = {}) {
      const params = new URLSearchParams();
      if (query.q) params.set('q', String(query.q).slice(0, 120));
      if (query.app) params.set('app', String(query.app).slice(0, 120));
      if (query.category) params.set('category', String(query.category).slice(0, 80));
      params.set('offset', String(clamp(query.offset, 0, 100000, 0)));
      params.set('limit', String(clamp(query.limit, 1, 60, 24)));
      const value = await get(`/api/screens?${params}`);
      return {items: (value.items ?? []).map(screen), total: value.total ?? 0, offset: value.offset ?? 0};
    },
    async canvasScreen(app, id) {
      let offset = 0;
      for (;;) {
        const {items, total} = await catalog.screens({app: app.slug, offset, limit: 60});
        const found = items.find(item => item.id === id && item.app?.id === app.id);
        if (found) return found;
        offset += items.length;
        if (!items.length || offset >= total) return null;
      }
    },
    async categories() {
      const value = await get('/api/screen-categories', {persist: true});
      return {categories: (value.categories ?? []).map(c => ({id: c.id, title: c.title, group: c.group ?? null}))};
    },
    /** Saves the pictures of Explore items (a screen, or an app's first screens) into dir with an index. Free; never source. */
    async references(items, dir) {
      const {apps} = await catalog.apps();
      const appOf = ref => apps.find(a => ref && (a.id === ref.id || a.slug === ref.slug || a.id === ref || a.slug === ref)) ?? null;
      const wanted = [];
      const screens = items.filter(item => item.kind === 'screen');
      const selectedApps = items.filter(item => item.kind !== 'screen');
      const perApp = Math.min(APP_REFERENCES, Math.floor((MAX_REFERENCES - screens.length) / Math.max(1, selectedApps.length)));
      for (const item of [...screens, ...selectedApps]) {
        if (item.kind === 'screen') {
          const owner = appOf(item.app);
          const id = item.sourceId ?? item.id;
          wanted.push({id, title: item.title, route: item.route, image: item.image, url: item.url ?? (owner ? `${origin}/websites/${owner.slug}?gallery=screens&item=${encodeURIComponent(item.id)}` : null), app: owner, wholeApp: Boolean(owner && id === owner.id)});
          continue;
        }
        const owner = appOf({id: item.id, slug: item.app?.slug ?? item.id});
        if (!owner) continue;
        const page = await catalog.screens({app: owner.slug, limit: perApp});
        for (const s of page.items) wanted.push({id: s.source?.id ?? s.id, title: s.title, route: s.route, image: s.screenshot, url: s.url, app: owner, wholeApp: s.source?.kind === 'app'});
      }
      const seen = new Set();
      const unique = wanted.filter(w => w.image && !seen.has(w.image) && seen.add(w.image)).slice(0, MAX_REFERENCES);
      fs.mkdirSync(dir, {recursive: true});
      const saved = [], skipped = [];
      for (const w of unique) {
        let url = null;
        try { url = new URL(w.image, origin); } catch {}
        // Pictures come only from the registry's published screenshot address, checked against their SHA-256.
        const match = url && url.origin === origin ? SCREENSHOT.exec(url.pathname) : null;
        if (!match) { skipped.push(w.title); continue; }
        const file = path.join(dir, fileSafe(w.app?.slug ?? 'congo'), `${fileSafe(w.title)}-${match[1].slice(0, 8)}.${match[2]}`);
        const held = fs.existsSync(file) ? fs.readFileSync(file) : null;
        if (!held || sha(held) !== match[1]) {
          try {
            const response = await fetchImpl(origin + url.pathname, {headers: {'User-Agent': 'gocongo-workspace'}, signal: AbortSignal.timeout(30000)});
            if (!response.ok) throw new Error(String(response.status));
            const bytes = Buffer.from(await response.arrayBuffer());
            if (sha(bytes) !== match[1]) throw new Error('checksum');
            fs.mkdirSync(path.dirname(file), {recursive: true});
            fs.writeFileSync(file, bytes);
          } catch { skipped.push(w.title); continue; }
        }
        saved.push({title: w.title, app: w.app ? {id: w.app.id, name: w.app.name} : null, inspiredBy: w.app?.inspiredBy ? {name: w.app.inspiredBy, url: w.app.inspiredByUrl} : null,
          route: w.route ?? null, file, image: origin + url.pathname, galleryUrl: w.url ?? null,
          code: {url: w.url ?? null, install: w.wholeApp ? `npx gocongo create ${w.app?.id ?? w.id}` : `npx gocongo add ${w.id}`, access: 'Congo Library subscription ($30 USD/month)'}});
      }
      const indexFile = path.join(dir, REFERENCE_INDEX), index = readJson(indexFile, null);
      const kept = (Array.isArray(index?.screens) ? index.screens : []).filter(s => !saved.some(n => n.file === s?.file));
      writeJson(indexFile, {about: `Screenshots of Congo clone apps, saved as free reference pictures for your AI. Each screen names its app and the product that inspired it. Its working code is linked under code; the code needs a Congo Library subscription (${origin}/pricing).`, registry: origin, updatedAt: new Date().toISOString(), screens: [...kept, ...saved]});
      return {saved, skipped, index: indexFile};
    },
  };
  return catalog;
}

// ---------------------------------------------------------------- what the person's AI is asked

export function instructions(request) {
  const reply = `When done, run: npx gocongo workspace reply ${request.id} "<one short line for the user>" (add --error if it failed). Then poll again.`;
  const where = request.project ? ` The user's project is ${request.project.path}.` : ' No project is attached; ask which project when it matters.';
  if (request.type === 'reference') return `Use as reference: the user picked ${request.references.length} Congo screen picture${request.references.length === 1 ? '' : 's'} as visual reference. Each is an image file under references (with its app, what inspired it and where its code is). Tell the user in your chat what arrived, open and look at each picture, and keep them in mind for what they are working on. Build or change nothing unless they ask; the code needs their Congo Library subscription.${where} ${reply}`;
  if (request.type === 'code') return `Get the code: the user wants these Congo items in their project. Each item's install command is in items[].install: a screen installs with npx gocongo add into a project connected with npx gocongo init, an app with npx gocongo create into a new empty folder. Both show what they will write first; install dependencies with install scripts off (npm install --ignore-scripts) and name any package that wants one before turning it on. Source needs their Congo Library subscription: if a command says sign-in is required, or npx gocongo whoami --json shows no active subscription, tell them (npx gocongo login, or https://gocongo.ai/pricing), offer to build from the screenshots instead, and reply normally (not --error) saying so.${where} Tell the user in your chat what arrived before you change their code. ${reply}`;
  return `The user sent these Congo items from the workspace, with their notes. Do what they ask: use the items as reference, pull their code into the project (npx gocongo add / create, which needs their Congo Library subscription), or both.${where} Tell the user in your chat what arrived first. ${reply}`;
}

// ---------------------------------------------------------------- the server

const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8'};
const UI_CSP = ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: https:", "font-src 'self' data:",
  "connect-src 'self'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'"].join('; ');

function send(res, status, body, headers = {}) {
  const raw = typeof body === 'string' || Buffer.isBuffer(body);
  res.writeHead(status, {'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', ...(raw ? {} : {'Content-Type': 'application/json; charset=utf-8'}), ...headers});
  res.end(raw ? body : JSON.stringify(body));
}
function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => { size += chunk.length; if (size > limit) { reject(Object.assign(new Error('Request too large'), {status: 413})); req.destroy(); return; } chunks.push(chunk); });
    req.on('end', () => { if (!chunks.length) return resolve({}); try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(Object.assign(new Error('Invalid JSON'), {status: 400})); } });
    req.on('error', reject);
  });
}
function listen(server, ports) {
  return new Promise((resolve, reject) => {
    const [first, ...rest] = ports;
    if (first === undefined) return reject(new Error('No free local port for the workspace'));
    const onError = error => { server.off('listening', onListening); if (['EADDRINUSE', 'EACCES'].includes(error.code)) resolve(listen(server, rest)); else reject(error); };
    const onListening = () => { server.off('error', onError); resolve(server.address().port); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(first, '127.0.0.1');
  });
}
function projectRef(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const dir = path.resolve(value);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw Object.assign(new Error(`No folder at ${dir}`), {status: 400});
  let name = path.basename(dir);
  try { const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); if (typeof pkg.name === 'string' && pkg.name) name = pkg.name; } catch {}
  return {name, path: dir};
}

export async function startWorkspaceServer({home = workspaceHome(), uiDir = workspaceUi(), port, token = crypto.randomBytes(24).toString('hex'), env = process.env, fetchImpl = fetch, saved, log = () => {}, version = 'dev'} = {}) {
  const paths = files(home);
  fs.mkdirSync(home, {recursive: true});
  const origin = registryOrigin(env);
  const catalog = createCatalog({origin, cacheDir: path.join(home, 'cache'), fetchImpl});
  const csp = origin.startsWith('http:') ? UI_CSP.replace("img-src 'self' data: https:", `img-src 'self' data: https: ${origin}`) : UI_CSP;
  const state = readJson(paths.state, {});
  state.settings = {theme: ['system', 'light', 'dark'].includes(state.settings?.theme) ? state.settings.theme : 'system'};
  state.tray = (() => { try { return normalizeTray(state.tray); } catch { return {items: [], note: ''}; } })();
  state.requests = Array.isArray(state.requests) ? state.requests.slice(0, 100) : [];
  state.project = state.project ?? null;
  state.canvases = Array.isArray(state.canvases) ? state.canvases.slice(0, MAX_CANVASES).map(canvas => {
    if (Array.isArray(canvas.sections)) return canvas;
    const cards = (canvas.options ?? []).map(({id, title, note, item}) => ({id, title, note, references: [item], approvable: true}));
    return {id: canvas.id, title: canvas.title, project: canvas.project, sections: [{id: 1, kind: 'review', title: null, cards, decisions: []}]};
  }) : [];
  const save = () => writeJson(paths.state, state);
  const ai = {lastPollAt: 0, waiting: new Set()};
  const wake = () => { for (const resolve of ai.waiting) resolve(); ai.waiting.clear(); };
  const connected = () => ai.waiting.size > 0 || Date.now() - ai.lastPollAt < 90000;
  const expire = () => { for (const r of state.requests) if (['sent', 'delivered'].includes(r.status) && Date.now() - Date.parse(r.createdAt) > STALE_MS) { r.status = 'error'; r.message = 'No answer from your AI'; r.doneAt = new Date().toISOString(); } };
  const publicRequest = r => ({id: r.id, type: r.type, status: r.status, createdAt: r.createdAt, summary: r.summary, message: r.message ?? null, doneAt: r.doneAt ?? null,
    ...(r.type === 'reference' ? {saved: r.payload.references.length, folder: paths.references} : {})});
  const publicState = () => { expire(); return {settings: state.settings, tray: state.tray, project: state.project, referencesDir: paths.references, requests: state.requests.slice(0, 50).map(publicRequest)}; };
  const status = () => ({protocol: PROTOCOL, version, registry: origin, ai: {connected: connected(), listening: ai.waiting.size > 0, pending: state.requests.filter(r => r.status === 'sent').length}, project: state.project});
  const listSaved = saved ?? (async () => {
    const cli = await import(pathToFileURL(path.join(here, 'congo.mjs')).href);
    return cli.listSaved(origin, {query: '', offset: 0, limit: 100, all: true});
  });

  const publicCanvas = ({id, title, sections}) => ({id, title, sections});
  const invalidCanvas = message => Object.assign(new Error(message), {status: 400});

  async function createCanvas(body) {
    const title = trimmed(body?.title, 160);
    const project = projectRef(body?.project);
    // Older local previews can still open their file as standalone proposals.
    const input = body?.sections ?? (Array.isArray(body?.options) ? [{
      kind: 'review',
      cards: body.options.map(option => ({title: option?.title, note: option?.note, approvable: true, references: [{app: option?.app, screen: option?.screen}]})),
    }] : null);
    if (!title || !project || !Array.isArray(input) || !input.length) throw invalidCanvas('Use a Canvas title and at least one section');

    let nextId = 1;
    const sections = input.map((group, index) => {
      const kind = group?.kind;
      const title = trimmed(group?.title, 160);
      if (!['review', 'compare'].includes(kind) || !Array.isArray(group.cards) || !group.cards.length) {
        throw invalidCanvas('Each Canvas section needs a kind and at least one card');
      }
      if (kind === 'compare' && (!title || group.cards.length < 2)) {
        throw invalidCanvas('A comparison needs one decision and at least two alternatives');
      }
      const cards = group.cards.map(card => {
        const title = trimmed(card?.title, 120), note = trimmed(card?.note, 1800);
        const references = card?.references ?? [];
        if (!title || !note || !Array.isArray(references) || references.some(ref =>
          typeof ref?.app !== 'string' || !ITEM_ID.test(ref.app) || typeof ref.screen !== 'string' || !ITEM_ID.test(ref.screen))) {
          throw invalidCanvas('Each card needs a title and note. References need catalog app and screen IDs');
        }
        return {id: nextId++, title, note, approvable: kind === 'review' && card.approvable === true, references};
      });
      return {id: index + 1, kind, title, cards, decisions: []};
    });

    const resolved = new Map();
    let apps;
    for (const section of sections) for (const card of section.cards) {
      const references = [];
      for (const ref of card.references) {
        const key = ref.app + '/' + ref.screen;
        if (!resolved.has(key)) {
          apps ??= (await catalog.apps()).apps;
          const app = apps.find(app => app.id === ref.app || app.slug === ref.app);
          const screen = app && await catalog.canvasScreen(app, ref.screen);
          const image = screen?.screenshot && new URL(screen.screenshot, origin);
          if (!image || image.origin !== origin || !SCREENSHOT.test(image.pathname)) {
            throw invalidCanvas(`No published screenshot for ${ref.app} / ${ref.screen}`);
          }
          const item = normalizeItem({kind: 'screen', id: screen.id, sourceId: screen.source?.id, version: screen.source?.version ?? screen.version,
            app: screen.app, title: screen.title, image: origin + image.pathname, route: screen.route, url: screen.url, preview: screen.preview});
          if (!item) throw invalidCanvas('Invalid screen metadata in the catalog');
          resolved.set(key, item);
        }
        const item = resolved.get(key);
        if (!references.includes(item)) references.push(item);
      }
      card.references = references;
    }
    const canvas = {id: crypto.randomBytes(8).toString('hex'), title, sections, project: project.path};
    state.canvases.unshift(canvas);
    state.canvases.length = Math.min(state.canvases.length, MAX_CANVASES);
    save();
    return publicCanvas(canvas);
  }

  async function createRequest(body) {
    const type = body.type;
    if (!['reference', 'code', 'send'].includes(type)) throw Object.assign(new Error('Unknown request'), {status: 400});
    const {items, note} = normalizeTray({items: body.items, note: body.note});
    if (!items.length && !(type === 'send' && note)) throw Object.assign(new Error('Pick a screen or app first'), {status: 400});
    const id = crypto.randomBytes(4).toString('hex');
    // Each item says how its code is installed, so the AI needs no extra search (owner rule: source still needs the subscription).
    const withInstall = items.map(item => ({...item, install: item.kind === 'screen' && item.id !== item.app?.id ? `npx gocongo add ${item.id} --destination <path>` : `npx gocongo create ${item.app?.id ?? item.id} --project <new empty folder>`}));
    const payload = {id, type, createdAt: new Date().toISOString(), project: state.project, note: note || null, items: withInstall, references: []};
    if (type === 'reference') {
      const got = await catalog.references(items, paths.references);
      if (!got.saved.length) throw Object.assign(new Error('Could not get those pictures from Congo. Check your connection.'), {status: 502});
      payload.references = got.saved;
      payload.index = got.index;
    }
    const titles = items.slice(0, 3).map(i => i.title).join(', ') + (items.length > 3 ? ` and ${items.length - 3} more` : '');
    const summary = (type === 'reference' ? 'Use as reference: ' : type === 'code' ? 'Get the code: ' : '') + (titles || note).slice(0, 300);
    const request = {id, type, status: 'sent', createdAt: payload.createdAt, summary, message: null, doneAt: null, payload};
    state.requests.unshift(request);
    state.requests = state.requests.slice(0, 100);
    save();
    wake();
    return request;
  }

  async function nextRequest(waitMs) {
    ai.lastPollAt = Date.now();
    const take = () => {
      const request = [...state.requests].reverse().find(r => r.status === 'sent');
      if (!request) return null;
      request.status = 'delivered';
      request.deliveredAt = new Date().toISOString();
      save();
      return {...request.payload, instructions: instructions(request.payload)};
    };
    let found = take();
    if (found || waitMs <= 0) return found;
    let resolver;
    const woken = new Promise(resolve => { resolver = resolve; ai.waiting.add(resolve); });
    await Promise.race([woken, new Promise(resolve => setTimeout(resolve, waitMs))]);
    ai.waiting.delete(resolver);
    ai.lastPollAt = Date.now();
    return take();
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const host = String(req.headers.host ?? '');
      // Only this computer's own address, never another name pointing at it (DNS rebinding).
      if (!new Set([`127.0.0.1:${server.address().port}`, `localhost:${server.address().port}`]).has(host)) return send(res, 403, {error: 'Forbidden'});
      if (url.pathname === '/api/ping') return send(res, 200, {ok: true, protocol: PROTOCOL});
      if (url.pathname.startsWith('/api/')) {
        if (!safeEqual(String(req.headers.authorization ?? '').replace(/^Bearer /, ''), token)) return send(res, 401, {error: 'Open the workspace with npx gocongo workspace'});
        const method = req.method ?? 'GET';
        const body = method === 'POST' ? await readBody(req) : {};
        const route = `${method} ${url.pathname}`;
        if (route === 'GET /api/status') return send(res, 200, status());
        if (route === 'GET /api/state') return send(res, 200, publicState());
        if (route === 'POST /api/settings') {
          if (!['system', 'light', 'dark'].includes(body.theme)) return send(res, 400, {error: 'Unknown theme'});
          state.settings.theme = body.theme;
          save();
          return send(res, 200, publicState());
        }
        if (route === 'GET /api/canvases') {
          const boards = state.canvases.map(({id, title, project}) => ({
            id, title, project: typeof project === 'string' ? path.basename(project) || null : null,
          }));
          return send(res, 200, {boards});
        }
        if (route === 'POST /api/canvas') return send(res, 200, await createCanvas(body));
        const [, canvasId, action] = /^\/api\/canvas\/([a-f0-9]{16})(?:\/(selection|context))?$/.exec(url.pathname) ?? [];
        if (canvasId) {
          const canvas = state.canvases.find(entry => entry.id === canvasId);
          if (!canvas) return send(res, 404, {error: 'This Canvas is no longer available. Ask your AI to show the directions again.'});
          if (method === 'GET' && !action) return send(res, 200, publicCanvas(canvas));
          if (method === 'POST' && action === 'selection') {
            const id = body?.selected;
            const section = canvas.sections.find(entry => entry.cards.some(card => card.id === id));
            const card = section?.cards.find(card => card.id === id);
            if (!card || (section.kind === 'review' && !card.approvable)) return send(res, 400, {error: 'This card has no decision to record'});
            const active = body.active !== false;
            const others = section.decisions.filter(decision => decision !== id);
            section.decisions = active ? (section.kind === 'compare' ? [id] : [...others, id]) : others;
            save();
            return send(res, 200, publicCanvas(canvas));
          }
          if (method === 'POST' && action === 'context') {
            if (projectRef(body?.project)?.path !== canvas.project) return send(res, 403, {error: 'Open this Canvas from the project that created it'});
            const cards = canvas.sections.flatMap(section => section.cards
              .filter(card => section.decisions.includes(card.id))
              .map(card => ({...card, decision: section.kind === 'compare' ? 'chosen' : 'approved', question: section.title})));
            const supportingCards = canvas.sections.filter(section => section.kind === 'review')
              .flatMap(section => section.cards.filter(card => !card.approvable)
                .map(card => ({...card, section: section.title})));
            const items = [...cards, ...supportingCards].flatMap(card => card.references);
            const images = items.length ? await catalog.references(items, paths.references) : {saved: [], skipped: [], index: null};
            return send(res, 200, {id: canvasId, cards, supportingCards, references: images.saved, skipped: images.skipped, index: images.index});
          }
        }
        if (route === 'POST /api/tray') { state.tray = normalizeTray(body); save(); return send(res, 200, {tray: state.tray}); }
        if (route === 'POST /api/selection') {
          let items = [];
          if (body.clear !== true) {
            const item = normalizeItem(body.item);
            if (!item || typeof body.selected !== 'boolean') return send(res, 400, {error: 'Unknown library selection'});
            items = state.tray.items.filter(entry => entry.kind !== item.kind || entry.id !== item.id);
            if (body.selected) items.push(item);
          }
          state.tray = normalizeTray({...state.tray, items});
          save();
          return send(res, 200, {tray: state.tray});
        }
        if (route === 'POST /api/selection/context') {
          const {items} = state.tray;
          if (!items.length) return send(res, 200, {items, references: [], skipped: [], index: null});
          const {saved: references, skipped, index} = await catalog.references(items, paths.references);
          return send(res, 200, {items, references, skipped, index});
        }
        if (route === 'POST /api/requests') { const request = await createRequest(body); return send(res, 200, {request: publicRequest(request), state: publicState()}); }
        if (route === 'POST /api/connect') {
          if (body.project !== undefined) state.project = projectRef(body.project);
          ai.lastPollAt = Date.now();
          save();
          return send(res, 200, {project: state.project});
        }
        if (route === 'GET /api/ai/next') {
          const wait = Math.min(Math.max(Number(url.searchParams.get('wait') ?? 25), 0), 50) * 1000;
          return send(res, 200, {request: await nextRequest(wait)});
        }
        if (route === 'POST /api/ai/reply') {
          const request = state.requests.find(r => r.id === body.id);
          if (!request) return send(res, 404, {error: 'No such request'});
          request.status = body.error ? 'error' : 'done';
          request.message = trimmed(body.message, 2000) ?? (body.error ? 'No reason given' : 'Done.');
          request.doneAt = new Date().toISOString();
          ai.lastPollAt = Date.now();
          save();
          return send(res, 200, {request: publicRequest(request)});
        }
        if (route === 'GET /api/library/apps') return send(res, 200, await catalog.apps());
        if (route === 'GET /api/library/categories') return send(res, 200, await catalog.categories());
        if (route === 'GET /api/library/screens') return send(res, 200, await catalog.screens(Object.fromEntries(url.searchParams)));
        if (route === 'GET /api/library/saved') {
          try {
            const result = await listSaved();
            return send(res, 200, {available: true, signedIn: true, ids: result.items.map(i => i.id), slugs: result.items.map(i => i.slug), reason: null});
          } catch (error) {
            const signedOut = /sign in|login/i.test(error.message);
            return send(res, 200, {available: true, signedIn: signedOut ? false : null, ids: [], slugs: [], reason: signedOut ? 'Sign in with npx gocongo login to see your Saved apps.' : error.message});
          }
        }
        if (route === 'POST /api/stop') { send(res, 200, {stopped: true}); setTimeout(() => stop(), 50); return; }
        return send(res, 404, {error: 'Not found'});
      }
      if (!uiDir) return send(res, 500, 'The workspace interface is missing. Reinstall gocongo.', {'Content-Type': 'text/plain; charset=utf-8'});
      // The interface: its assets, and its page for every route.
      const relative = path.posix.normalize(decodeURIComponent(url.pathname)).replace(/^\/+/, '');
      const asset = relative.startsWith('assets/') ? path.resolve(uiDir, relative) : null;
      if (asset && asset.startsWith(path.join(uiDir, 'assets') + path.sep) && fs.existsSync(asset) && fs.statSync(asset).isFile()) {
        return send(res, 200, fs.readFileSync(asset), {'Content-Type': MIME[path.extname(asset)] ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable'});
      }
      if (path.extname(relative)) return send(res, 404, 'Not found', {'Content-Type': 'text/plain; charset=utf-8'});
      return send(res, 200, fs.readFileSync(path.join(uiDir, 'index.html')), {'Content-Type': MIME['.html'], 'Content-Security-Policy': csp});
    } catch (error) {
      log(`error: ${error.stack ?? error}`);
      if (!res.headersSent) send(res, error.status ?? 500, {error: error.status ? error.message : 'Workspace error'});
    }
  });
  const actual = await listen(server, port === 0 ? [0] : port ? [port] : PORTS);
  const record = {protocol: PROTOCOL, pid: process.pid, port: actual, token, version, startedAt: new Date().toISOString()};
  writeJson(paths.server, record);
  let done;
  const stopped = new Promise(resolve => { done = resolve; });
  function stop() {
    wake();
    server.closeAllConnections?.();
    server.close(() => {
      const current = readJson(paths.server, null);
      if (current?.pid === process.pid && current?.port === actual) fs.rmSync(paths.server, {force: true});
      done();
    });
  }
  return {record, stop, stopped, url: `http://127.0.0.1:${actual}`};
}

// ---------------------------------------------------------------- the commands

function parse(argv) {
  const out = {_: []};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    if (['json', 'no-browser', 'browser', 'error', 'help'].includes(key)) out[key] = true;
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) out[key] = argv[++i];
    else out[key] = true;
  }
  return out;
}
async function call(record, route, body, timeout = 8000) {
  const response = await fetch(`http://127.0.0.1:${record.port}${route}`, {
    method: body ? 'POST' : 'GET', headers: {Authorization: `Bearer ${record.token}`, ...(body ? {'Content-Type': 'application/json'} : {})},
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.error || `Workspace request failed (${response.status})`);
  return value;
}
async function alive(paths) {
  const record = readJson(paths.server, null);
  if (!record?.port || !record?.token) return null;
  try { return (await call(record, '/api/status', undefined, 3000)).protocol === PROTOCOL ? record : null; } catch { return null; }
}
async function ensure(paths, env) {
  const running = await alive(paths);
  if (running) return running;
  if (!workspaceUi(env)) throw new Error('The workspace interface is missing from this gocongo install. Reinstall it with npm install --global gocongo.');
  fs.mkdirSync(paths.home, {recursive: true});
  const out = fs.openSync(paths.log, 'a');
  // Started from its own folder, so it never holds the project folder open (Windows cannot delete or rename a folder in use).
  const child = spawn(process.execPath, [self, 'serve'], {cwd: paths.home, detached: true, stdio: ['ignore', out, out], windowsHide: true, env: {...env, CONGO_WORKSPACE_HOME: paths.home}});
  child.unref();
  fs.closeSync(out);
  const until = Date.now() + 15000;
  while (Date.now() < until) {
    await new Promise(resolve => setTimeout(resolve, 150));
    const record = await alive(paths);
    if (record && record.pid === child.pid) return record;
  }
  throw new Error(`The workspace did not start. See ${paths.log}`);
}
function openBrowser(url) {
  const options = {detached: true, stdio: 'ignore', windowsHide: true};
  const child = process.platform === 'win32'
    ? spawn(path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'rundll32.exe'), ['url.dll,FileProtocolHandler', url], options)
    : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], options);
  child.on('error', () => {});
  child.unref();
}
const print = (args, value, human) => console.log(args.json || !process.stdout.isTTY ? JSON.stringify(value, null, 2) : human);

export async function launchWorkspace(argv, env = process.env) {
  const args = parse(argv);
  if (args.help || args._[0] === 'help') { console.log(WORKSPACE_USAGE); return; }
  const command = args._[0] ?? 'open';
  const paths = files(workspaceHome(env));
  if (command === 'serve') {
    const {CLI_VERSION} = await import(pathToFileURL(path.join(here, 'congo.mjs')).href).catch(() => ({CLI_VERSION: 'dev'}));
    const log = line => fs.appendFileSync(paths.log, `${new Date().toISOString()} ${line}\n`);
    const server = await startWorkspaceServer({home: paths.home, port: Number(args.port) || undefined, env, log, version: CLI_VERSION});
    log(`serving on ${server.record.port}`);
    process.on('SIGINT', server.stop);
    process.on('SIGTERM', server.stop);
    await server.stopped;
    return;
  }
  if (command === 'status') {
    const record = await alive(paths);
    const value = record ? {running: true, url: `http://127.0.0.1:${record.port}/explore#t=${record.token}`, ...(await call(record, '/api/status'))} : {running: false};
    return print(args, value, record ? `Congo workspace is running: ${value.url}\nYour AI: ${value.ai.connected ? 'connected' : 'not connected'}` : 'Congo workspace is not running.');
  }
  if (command === 'stop') {
    const record = await alive(paths);
    if (record) await call(record, '/api/stop', {});
    return print(args, {stopped: Boolean(record)}, record ? 'Congo workspace stopped.' : 'Congo workspace was not running.');
  }
  if (command === 'canvas') {
    if (args._.length !== 2) throw new Error('Use: gocongo workspace canvas FILE');
    const file = args._[1];
    if (!fs.statSync(file).isFile() || fs.statSync(file).size > 32 * 1024) throw new Error('Use a Canvas JSON file up to 32 KB');
    let input;
    try { input = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
    catch { throw new Error('Use a valid Canvas JSON file'); }
    const record = await ensure(paths, env);
    const {id} = await call(record, '/api/canvas', {...input, project: args.project ?? process.cwd()}, 120000);
    const url = `http://127.0.0.1:${record.port}/canvas/${id}#t=${record.token}`;
    if (!args['no-browser']) openBrowser(url);
    return print(args, {id, url}, `Congo Canvas: ${url}\nReview in Canvas and continue in your AI chat.`);
  }
  if (command === 'context') {
    const record = await alive(paths);
    if (!record) throw new Error('Open the Congo workspace and select an app or screen first.');
    if (args.canvas !== undefined) {
      if (typeof args.canvas !== 'string' || !CANVAS_ID.test(args.canvas)) throw new Error('Use: gocongo workspace context --canvas ID');
      const value = await call(record, `/api/canvas/${args.canvas}/context`, {project: args.project ?? process.cwd()}, 120000);
      const lines = value.cards.length ? value.cards.map(card => card.title) : ['No Canvas proposal approved or direction chosen.'];
      if (value.supportingCards?.length) lines.push('Supporting context', ...value.supportingCards.map(card => card.title));
      return print(args, value, [...lines, ...value.references.map(image => image.file)].join('\n'));
    }
    const value = await call(record, '/api/selection/context', {}, 120000);
    const summary = value.items.length ? `${value.items.length} selected · ${value.references.length} reference images` : 'No Congo apps or screens selected.';
    return print(args, value, [summary, ...value.references.map(image => image.file)].join('\n'));
  }
  if (command === 'poll') {
    const record = await alive(paths);
    if (!record) throw new Error('The workspace is not running. Run npx gocongo workspace connect first.');
    const until = Date.now() + Math.max(Number(args.timeout ?? 1800), 1) * 1000;
    for (;;) {
      const left = Math.min(25, Math.ceil((until - Date.now()) / 1000));
      const {request} = await call(record, `/api/ai/next?wait=${Math.max(left, 0)}`, undefined, (left + 15) * 1000);
      if (request || Date.now() >= until) {
        console.log(JSON.stringify(request ? {request} : {request: null, next: 'No request yet. Run npx gocongo workspace poll again.'}, null, 2));
        return;
      }
    }
  }
  if (command === 'reply') {
    const [, id, ...words] = args._;
    if (!id || !/^[a-f0-9]{8}$/.test(id)) throw new Error('Use: npx gocongo workspace reply <request id> "<one short line>" [--error]');
    const record = await alive(paths);
    if (!record) throw new Error('The workspace is not running.');
    const value = await call(record, '/api/ai/reply', {id, message: words.join(' '), error: Boolean(args.error)});
    return print(args, value, `Replied to ${id}.`);
  }
  if (command !== 'open' && command !== 'connect') throw new Error(WORKSPACE_USAGE);
  const record = await ensure(paths, env);
  // connect is for the person's AI: the folder it works in is the project, unless that is the home folder.
  const projectPath = typeof args.project === 'string' ? args.project : command === 'connect' && path.resolve(process.cwd()) !== path.resolve(os.homedir()) ? process.cwd() : undefined;
  const connected = command === 'connect' || projectPath ? await call(record, '/api/connect', projectPath ? {project: projectPath} : {}) : null;
  const url = `http://127.0.0.1:${record.port}/explore#t=${record.token}`;
  if (command === 'open' ? !args['no-browser'] : args.browser) openBrowser(url);
  if (command === 'open') return print(args, {url, port: record.port}, `Congo workspace: ${url}`);
  const next = 'Run `npx gocongo workspace poll` in the background. It prints the next request from the workspace as JSON with its instructions; do what it asks, answer with `npx gocongo workspace reply <id> "<one short line>"`, then poll again.';
  return print(args, {url, project: connected?.project ?? null, next}, `Congo workspace: ${url}\nProject: ${connected?.project?.path ?? 'none'}\nNext: ${next}`);
}

if (process.argv[1] && self === path.resolve(process.argv[1])) await launchWorkspace(process.argv.slice(2)).catch(error => { console.error(`workspace: ${error.message}`); process.exitCode = 1; });
