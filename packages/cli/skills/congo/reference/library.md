# The Congo Library through the gocongo CLI

## Is Congo available

Check once per session, the first time Congo would help: `node --version` and `npx gocongo --version`.

- **Node older than 22.20:** tell the user in one plain sentence ("Congo needs Node 22.20 or later and this machine has 20.11, so I'm continuing without it.") and carry on without Congo.
- **No network, or any other failure:** one sentence, then carry on with your own tools. Never block, retry in a loop, or keep reminding the user about it.
- **Congo's MCP server connected** (tools named `congo_reference_screens`, `congo_screens_search`, `congo_resources_search`, `congo_resources_get`, `congo_resources_files`, `congo_resources_read`): use those in place of the CLI commands below, with the same rules.
- `npx gocongo` uses an installed project version when available or resolves the package through npm. If the user installed it globally (`npm install --global gocongo`), `gocongo` and `congo` work too.

## Commands

Piped output is JSON; pass `--json` anyway. Search and references work anywhere without signing in.

- `npx gocongo references "<words>"` saves reference screenshots into `references/` with an index file; `--app`, `--category`, `--limit`, `--all` and `--out` narrow or widen it. Free.
- `npx gocongo search --kind screen --query "<words>" --json` finds screens. Filter with `--category <id>` (ids from `npx gocongo categories --json`, such as `billing` or `settings-preferences`) and `--source <app-id>`; page with `--limit` and `--offset`. Each item has `id`, `title`, `app.name`, `route`, `screenCategories`, `screenshot.src`, `preview` (the live screen), `url` (its Congo page) and `next`. Only an item whose `next` starts with `add` installs on its own. An item marked "Not yet installable on its own" is preview only: never run `add` on its id, because that delivers the whole app instead of the screen.
- `npx gocongo templates --json` lists full editable apps. Start one in an empty folder with `npx gocongo create <id> --project <folder>`; `add` refuses templates.
- Before writing, `add` and `create` print what is coming: the files, the new packages and any package that runs an install script. Nothing runs during them. Pass `--yes` in a non-interactive run, and tell the user about any package with an install script.
- `npx gocongo inspect <id> --json` lists a screen's or app's files, and `npx gocongo inspect <id> <path>` prints one, without adding anything to the project. It needs the user's subscription. Use it to read code before pulling it in, or to take one piece out of a screen.
- `npx gocongo handbooks --json` lists Congo's published design handbooks and the user's own. A published handbook installs like a screen, as one Markdown file per section; `npx gocongo handbook <hb_id>` prints one of the user's own.
- `npx gocongo login` signs the user in through their own browser, where they approve Congo CLI. Offer it when a command says sign-in is required, and let the user finish it. `npx gocongo whoami --json` shows whether their subscription is active; when they are signed out it prints "Sign in required" instead of JSON.
- `npx gocongo init` connects an existing React/Vite project (run it at the project root; it writes `congo.json` and `CONGO.md`). Then `npx gocongo add <id> --destination <path>` copies verified source into that project-relative path, adds the package's pinned dependencies to `package.json`, and writes the receipt `.congo/<id>.json`. Install the new dependencies with the project's own package manager, with install scripts off (`npm install --ignore-scripts`); turn a package's script on only when the person agrees after you name it. `npx gocongo update <id>` later brings a newer version and keeps local edits.
- To read a screen without installing it into the project (one piece of it, or a comparison), install it into a scratch folder outside the project: `npx gocongo init --new --project <scratch>`, then `npx gocongo add <id> --destination congo --project <scratch>`. Delete the scratch folder when you are done. Use the same route for a project that is not React/Vite, which `init` refuses.

A screen package holds `<app>/screens/<id>.tsx` (the entry: import its default export and render `<Screen />`), `<app>/guides/<id>.md` (read it first: routes, `initialPath`, `onNavigate`, styles), `<app>/styles.css` scoped to the receipt's `styleScope`, the source under `<app>/source/`, and its license and notice files.

When a command fails, show its message as written and act on it:

- "Sign in required. Run `congo login`.": offer `npx gocongo login`.
- "Source needs an active Congo subscription ($30/month): https://gocongo.ai/pricing": show it verbatim. The reference pictures and previews stay usable; build without the source.
- Terms or phone verification: show the link; the user completes it on the website, then you retry.
- "Too many free reference requests": wait a minute, then retry once.

## Where Congo helps

**A new product or a whole new surface:** start from the Congo app that does the closest job. A real, finished app adapted to the user's product beats an invented design.

1. Pick the closest app. `npx gocongo templates --json` lists every app with its description and categories. Match on what the product does (its job, its users, its core objects and workflows), never on words in screen titles; look at its screens with `npx gocongo references --app <app-id>` when you need to.
2. Say what you are about to do, in one line: the app and why it fits, and that installing it uses the user's Congo subscription. Without a subscription, build from the app's reference pictures instead and say so.
3. Install it and adapt it (below). One result by default; several directions only when the user asks.

**Adding a screen to an existing project:** check the project and its identified base app first. Search the broader catalog when those have no suitable fit. Open the actual pictures that inform your choice.

**One element a Congo screen already does well:** take that piece from a scratch install and rebuild it in the project's code and tokens rather than writing it from nothing.

**Critique:** when a finding would land harder with a working counterpart, cite how a Congo screen handles the same job, with its app and screen name.

## After installing

Installed screens and apps are now the user's code, in another product's world. Adapt what is there before building anything new.

1. Read the guide, the entry and the receipt. Mount the screen on the route the user asked for, install its dependencies, and build once as delivered, so later failures are yours to trace. Package source imports files with their `.ts` and `.tsx` extensions; a TypeScript project needs `allowImportingTsExtensions` (with `noEmit`) in its tsconfig.
2. Make it this product. Map colors, type, radii, spacing and shadows to the project's own tokens, editing the package's `styles.css` and source in place. Replace the source app's name, logo, navigation and sample content with this product's. Keep the structure, states and interactions that serve the task, and remove what the product has no use for. When the project already has its own app frame, keep that frame and mount the screen's page content inside it; never ship two navigations.
3. Check it: build once and open the main routes at desktop and phone widths. Report what came from Congo and what changed.
