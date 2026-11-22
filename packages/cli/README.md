# Congo CLI

Find an app, sign in in your browser and start from its editable source.
Congo offers app screens and full templates. Browsing and search are free;
source needs a $30 USD/month subscription and current source terms.

Requires Node.js 22.20.0 or later. No runtime dependencies or install scripts.

Earlier versions were published as `@buildwithcongo/cli` (through 0.2.7) and
`@gocongo/cli` (0.2.8). Both still work; new versions are published here as
`gocongo`. Without installing, `npx gocongo` runs the same command.

## Start a project

Run these commands in a terminal. Search works before you have a project.
Choose an empty destination; do not initialize it first.

```sh
npm install --global gocongo@latest
congo --version
congo search --kind template --query dashboard
congo login
congo templates
congo create ghosted-template --project my-crm
cd my-crm
npm ci
npm run build
npm run dev
```

Sign in yourself in the browser and approve **Congo CLI**. If the browser does
not open, open the URL printed in your terminal. No pasted key or npm account
is needed. Complete any phone verification, subscription or Terms steps on
the website, then retry. `create` prints the template's own setup commands;
follow those if they differ from the npm example above. Stop the dev server
with Ctrl+C before running more commands.

## Use Congo with your AI

Run `npx gocongo skills` for Claude Code, Codex or Cursor and start a new chat.
Ask naturally. “Add a Handbooks page to my Minus app” uses **Congo** to inspect
the project and find a fitting screen. “What could I build from the Congo
catalog?” uses **Congo Brainstorm** to research ideas grounded in working apps.

Run `npx gocongo workspace` to browse Explore. Select an app or a screen and
say “Use my Congo selection.” When you ask for design options, your AI can show
them in Canvas with the original Congo references and what it would adapt.
Choose a direction, then ask your AI to build it. Screenshots are free.
Editable source uses the existing Library subscription.

## Your account

```sh
congo whoami
congo logout
```

Sign-in is stored per registry outside your projects, in `%APPDATA%\congo` on
Windows or `~/.config/congo` elsewhere (`XDG_CONFIG_HOME` is respected). Files
are restricted to your account. Access tokens refresh automatically. `logout`
revokes the saved connection and removes the saved sign-in; if the network is
offline, it still removes it and explains how to revoke it on the website.
Never share sign-in files or commit them. `congo saved` lists the apps you
saved on the website; it needs sign-in but no subscription.

## Screens and existing projects

Use `init` to connect an existing React/Vite project, or `init --new` for a
minimal scaffold named after its folder. `search --kind screen --query contacts`
works anywhere. For a packaged screen, use `add ID --destination PATH` in a
connected project, then read its installed guide for imports, styles and
providers. A screen without its own package yet is marked `not yet installable
on its own`; preview it on the website. Full-app source is the separate
template product (`create APP_ID`).

`add` and `update` verify file hashes and preserve local edits. A resource's
receipt is in `.congo/ID.json`. `update ID` keeps the recorded destination.
Older component and flow IDs remain compatible for existing customers.
`create` without an ID lists templates. `templates` is an alias for template
search. It lists every app in the Congo library, the same apps as the website.
General search also covers every app's screens and pages, in one request to
the registry. Use `--all` to retrieve every page of results. `categories`
lists the screen categories that `--category` accepts.
`handbooks` works anywhere; `handbook ID` prints a personal handbook
as Markdown. `handbook save --title NAME --file PATH` saves your Markdown.

## Output and connections

A terminal gets short readable results. Piped output and `--json` keep the
existing JSON responses; reading a handbook still prints Markdown. Use
`--help` for commands, paging and flags. `create --install` and `add --install`
optionally install dependencies with scripts disabled. Review the downloaded
package scripts before running them.

The default connection is **https://gocongo.ai** (from 0.2.7; the earlier
**https://buildwithcongo.com** keeps working). Existing project
connections in `congo.json` stay in place. `--registry URL` overrides the
connection for a command, including login. Outside a connected project,
`CONGO_REGISTRY` can choose a trusted registry for automation. HTTPS is
required except HTTP on localhost/127.0.0.1. Credentials are sent only to the
chosen origin; redirects are refused. Sign in separately to each registry.

## CI and automation

Existing `CONGO_LIBRARY_TOKEN` integrations keep working. Supply that variable
through your CI secret manager. It takes precedence over browser sign-in and
is never saved by the CLI. Do not paste keys into chat, command arguments,
project files, npm configuration or Git. `logout` does not clear a variable
managed by your shell or CI.

## Windows troubleshooting

Windows PowerShell 5.1 is supported. If execution policy blocks `congo.ps1`,
use the `congo.cmd` launcher (and `npm.cmd` for npm). You can also use the npm
exec/npx launchers ending in `.cmd`. Alternatively, review and set your user's
execution policy to RemoteSigned; no machine-wide policy change is needed.
Browser login avoids PowerShell-version-specific key prompts.

Network errors name the host and underlying cause. A connect timeout retries
once with Node's alternate address-family selection disabled. Check your
connection or proxy if that retry also fails.

The two-file installer at `/guides/downloads/congo.mjs` and
`/guides/downloads/congo-version-range.mjs` remains supported. npm packages the
same implementation. No catalog source or credentials are included here.
The MIT license applies to the installer; downloaded resources retain their
own terms and notices. Documentation: https://gocongo.ai/guides
