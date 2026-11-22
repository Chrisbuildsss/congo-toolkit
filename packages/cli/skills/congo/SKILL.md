---
name: congo
description: "Use when building, extending, or redesigning a frontend, or when the user wants to find, use, or adapt a Congo app or screen. Find useful starting points in the current project and the Congo Library, and adapt them to the work."
license: MIT
user-invocable: true
argument-hint: "[what to build, change, or explore]"
---

# Congo

Congo gives you working application interfaces to build from. Use the library
to understand how a screen supports its task, how it connects to the rest
of the app, and what a working implementation looks like.

## Reuse first

A full Congo app template includes the app's screens and components. When
the user is building from a full template, extend that app by reusing and
adapting what it already contains. Look in the Congo Library when the work
calls for something the app doesn't have.

Carry over the useful behavior and fit it to the app's navigation, components,
and visual language. If the catalog has no good fit, the project's own
components and patterns are still a starting point. A reference the user
explicitly chose takes precedence.

If you need to identify a previously installed Congo resource, look at its
receipt in `.congo/`. A template receipt records its `id`, and a screen receipt
records `source.template`.

## Match the job

Search for what the person needs to accomplish. A task can have a different
name in another product. Open the actual reference and look at the actions,
states, and surrounding context that make it useful.

Decide what to reuse at the scale of the job. An exact screen may be enough.
Several references can explain different parts of one experience. A whole
app can be a good foundation when its main workflows already fit what the
user wants to build. If there is a real choice between approaches, explain
what would change for the person using the result.

## Work with the Library

Use the public Congo MCP tools when available, or the `gocongo` CLI.
`npx gocongo references "<task>" --app <app-id> --json` searches screens
within one app and saves the screenshots locally. Use the verified catalog
IDs and open the screenshots you rely on. Keep private project details out
of catalog queries.

Screenshots and previews are available without a subscription. Work from
them with the user's own code, or inspect and retrieve working source through
the CLI when the user has access. See [Library commands](reference/library.md)
for search, source inspection, screen installation, and template creation.

Fit retrieved code to the project. Preserve local edits and package notices.
If a package conflicts with the project's dependencies, work from the
reference and the project's existing components when that gives a better fit.

## Canvas

Canvas is a shared whiteboard. Use it when making the work visible would help
you and the user think through it. Let the task determine the material you
share and how it is arranged. Continue the conversation in the chat the user
is already using.

See [Explore and Canvas](reference/workspace.md) for using a library selection
and exchanging context with the local workspace.

## Build and verify

Use the scope the user asked for. Keep the routes, data, and interactions that
the work is meant to preserve. When you implement a change, look at the
rendered result at the sizes people will use and exercise the affected
behavior. Tell the user which references mattered, what you adapted, and
what you verified.
