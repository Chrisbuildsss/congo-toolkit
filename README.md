# Congo Toolkit

Give your coding agent screenshots from working apps. Explore the Congo Library, collect references in Canvas, and keep working in your existing chat.

- [**Congo**](packages/cli/skills/congo/SKILL.md) finds references for building or redesigning a frontend.
- [**Congo Compete**](packages/cli/skills/congo-compete/SKILL.md) researches a product opportunity grounded in working apps.

## Quickstart

With Node.js 22.20.0 or newer, run:

```sh
npx gocongo@latest skills
npx gocongo@latest workspace
```

Use `--codex`, `--claude`, or `--cursor` to target an agent, or `--all` to install for all three. Start a new chat after installing the skills.

In **Explore**, select an app or a screen and say “Use my Congo selection.” Your agent can put screenshots and notes that support the same idea together on a **Canvas** board. When there’s a real design decision, it can present alternatives under one question. Open **Canvas** in the sidebar to return to recent boards.

Browsing and reference screenshots are free. Editable source uses the Congo Library subscription. Run `npx gocongo@latest login` when you need source. [CLI guide](packages/cli/README.md)

## Development

Clone the repository and run:

```sh
npm ci
npm run typecheck
npm run build
npm run skills -- --codex
npm run workspace
```

The workspace UI lives in `packages/cli/workspace-ui`. The CLI and local server live in `scripts`. Run `npm run build` after edits to rebuild the CLI and workspace. To test your build in another project, run `npm run pack:cli`, then install the resulting tarball there with `npm install --no-save /path/to/gocongo-0.6.0.tgz`.

## License

The toolkit is available under the [MIT License](LICENSE). Bundled dependencies and fonts retain their [notices](packages/cli/workspace-ui/notices). The hosted catalog, screenshots and downloadable app source retain their respective terms.
