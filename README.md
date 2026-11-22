<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/congo-logo-white.svg">
    <img src="./assets/congo-logo-black.svg" alt="Congo" width="208">
  </picture>
</p>

# Congo Toolkit

**Make your AI build smarter with Congo.**

Open-source skills for Claude Code, Codex, and Cursor that help your coding agent intelligently use Congo’s library of app clones, UI templates, and design references to build, extend, and explore software.

Congo gives your AI more than a collection of resources. It teaches your agent how to make use of them.

If you’re building from a Congo template, your AI understands what you already have and looks for ways to reuse it. If your project needs something new, it can search the rest of the library for a suitable starting point. If you’re exploring an idea, it can use existing app clones to help you figure out what to build.

The goal isn’t to make your AI follow a rigid process. It’s to give it the context and tools to make better decisions while doing the work you’ve asked for.

Your AI does the building. Congo helps it make better use of what’s available.

## What can you do with Congo?

### Build with Congo

Create new applications, pages, and features using Congo’s app clones, UI templates, and design references.

Your coding agent can search for relevant resources, inspect their screenshots, and use their patterns to guide implementation. With source access, it can retrieve and adapt the actual code.

For example:

> Build me a property management platform. Use Congo to find a good starting point.

Your agent can explore suitable templates and screens, choose an approach, and adapt it to the product you’re building.

### Extend your existing applications

Already building from a Congo template? Your AI should know what it has to work with.

For example:

> Add a skills management page to my existing app.

Instead of immediately creating something from scratch, your agent examines the current project and its existing screens and components.

If the project started from a Congo template, it can look for other suitable screens from that same template first.

If those aren’t a good fit, it can search other Congo apps for a screen or component that serves the same purpose.

The selected implementation is then adapted to your app’s existing design, navigation, and functionality.

**Use what you have. Find what you need. Adapt it to your project.**

### Explore ideas visually with Canvas

Not every request needs to turn into code immediately.

For example:

> Show me a few different approaches for adding a marketplace to my app.

Your agent can find suitable Congo references and bring them into Canvas, a local visual whiteboard for exploring ideas.

Compare UI templates, review proposed adaptations, and choose the direction you prefer.

You can also browse the library yourself in Explore and select references for your agent to use.

When you’re ready, continue building in your existing AI conversation.

### Discover what to build with Congo Compete

Congo can also help you explore business and product opportunities based on the apps in its library.

For example:

> Look through Congo and find some opportunities to build specialized versions of these apps.

Or:

> Explore what I could build from the Shopify-inspired template.

Your agent can examine the available app clones, research their markets, and identify opportunities to adapt their functionality for different industries, audiences, or use cases.

Explore competing products, brainstorm differentiated ideas, and identify which Congo resources could help you build them.

---

## The skills

Congo Toolkit includes two skills designed to work with your existing coding agent.

### Congo

**Build, extend, and adapt with Congo’s library.**

The main Congo skill helps your AI understand and use the resources available to it.

It guides your agent to:

- Recognize and reuse existing screens, components, and patterns in your project.
- Prioritize the original template’s resources when extending a Congo-based application.
- Search the broader library when the current project needs something it doesn’t have.
- Inspect app clones and UI references to find suitable starting points.
- Adapt screens, components, and source code to fit your application’s requirements.
- Combine references from different applications when useful.
- Preserve the project’s existing design language and functionality.
- Use Canvas to present references, ideas, or alternatives when that helps the task.

The skill can be useful for new applications, feature development, redesigns, and everyday frontend work.

[View the Congo skill](packages/cli/skills/congo/SKILL.md)

### Congo Compete

**Turn existing app clones into new product opportunities.**

Congo Compete helps your AI explore what’s possible to build from the applications in the Congo library.

It can:

- Explore the catalog for potential business ideas.
- Research existing products, competitors, and customer problems.
- Identify underserved markets and specialized use cases.
- Brainstorm alternative products based on existing templates.
- Use Canvas to compare concepts and supporting references.
- Connect an idea to the Congo templates and screens that could help build it.

When you’re ready to start building, Congo Compete works alongside the main Congo skill to carry the selected concept into implementation.

[View Congo Compete](packages/cli/skills/congo-compete/SKILL.md)

## Getting started

Congo works with Claude Code, Codex, and Cursor.

Requires Node.js 22.20.0 or newer.

Install the skills:

```sh
npx gocongo@latest skills
```

You can use `--claude`, `--codex`, or `--cursor` to install for a specific coding agent, or `--all` for all three.

Start a new conversation in your coding agent after installation.

Try asking:

> Build me a CRM dashboard using Congo.

> Add a new page that matches the template I’m already using.

> Show me some Congo references for a skills marketplace.

> Find business opportunities using the app clones in Congo.

The skills are designed to be recognized for relevant requests by compatible coding agents, although automatic activation depends on the agent. You can also invoke them directly.

## Explore and Canvas

Congo Toolkit includes a local workspace for browsing the library and reviewing ideas visually.

Open it with:

```sh
npx gocongo@latest workspace
```

Explore provides access to Congo’s catalog of app clones, screens, screenshots, and previews.

Browse the library, select resources, and let your agent know when you want to use them.

Canvas is a visual workspace where your agent can organize references, explain potential adaptations, and present different approaches for comparison.

You can review the options and choose what to build without first generating multiple implementations.

Your AI conversation stays in Claude Code, Codex, or Cursor.

## Free to use. Source when you need it.

Congo Toolkit’s skills and local workspace are open source.

Searching the library, browsing app clones, and using screenshot references are free.

Your coding agent can use those references with your existing project and its own coding capabilities.

If you want to use the actual source code from Congo’s UI templates and app clones, the Congo Library subscription provides authorized access to available source packages and templates.

**Congo Library: $30/month.**

[Explore Congo](https://gocongo.ai/websites) · [View pricing](https://gocongo.ai/pricing)

## Development

Clone this repository and run:

```sh
npm ci
npm run typecheck
npm run build
npm run skills -- --codex
npm run workspace
```

The skills are located in `packages/cli/skills/`.

The local workspace interface is in `packages/cli/workspace-ui/`, with CLI and workspace server code in `scripts/`.

See the [CLI guide](packages/cli/README.md) for additional commands and development details.

## License

Congo Toolkit is available under the [MIT License](LICENSE).

Bundled dependencies and fonts retain their respective [notices](packages/cli/workspace-ui/notices). The hosted Congo catalog, screenshots, and downloadable app source remain subject to their applicable terms.
