# Explore and Canvas

The workspace is local. The user's coding agent continues in its existing chat.

## Explore

- Run `npx gocongo workspace` to open Explore. Use Apps, Screens and Saved to browse, open previews, and select apps or individual screens.
- When the user says “Use my Congo selection,” run `npx gocongo workspace context --json`. Use `items` for the exact selection and open `references[].file` to see the screenshots. Mention any failed pictures from `skipped`. If the selection is empty, ask what the user wanted to use.
- Selection stays available. Interpret “use as a reference” as design context. An instruction to build or retrieve authorized source comes from the chat.

## Canvas

Use Canvas as a whiteboard alongside the chat. Give each card a purpose in the discussion. Keep references that support the same idea together on its card. Use a comparison when the user has a decision to make and each alternative answers the same question.

Save a JSON file with a board `title` and a `sections` array. Each section has a `kind` and a `cards` array.

- A `review` section groups cards that can stand together. The section title is optional. Set `approvable: true` on a card when the user should be able to approve it independently.
- A `compare` section uses its `title` for the decision and has at least two alternative cards. The user can choose one in that section.
- A card has a `title` and a `note`. Its optional `references` array can contain multiple published screens. Each entry uses `app` and `screen` with the exact app and screen IDs from the catalog. Leave the array out for a text-only card.

From the project root, run `npx gocongo workspace canvas <file> --json`. Share the returned local `url` and keep the board `id` in the chat. Use `--no-browser` when you only need the URL. The user can reopen boards from Canvas in the sidebar. If Canvas is unavailable, share the material in chat.

When the user asks you to use or build from a board, run `npx gocongo workspace context --canvas <id> --json` from the same project.

- Read `cards` for recorded approvals and choices. A chosen card gives you its comparison `question` and `decision: "chosen"`.
- Read `supportingCards` for informational review cards and their section titles. Their notes and references support the work, even when no decision is recorded.
- Open the local images in `references[].file`. This list includes screenshots from both sets of cards, with each image saved once. Check `skipped` for missing images.

Use decisions the user gave directly in chat as well. Follow [Congo's Library commands](library.md) when you need source.

## Older workspaces

Older workspaces used an AI request tray. Existing `workspace connect`, `poll` and `reply` commands still work for those clients. A polled request carries its project, items, note and instructions. Use its local `references[].file` for a reference request. For a code request, verify screen versus template identity before using the normal authorized CLI. Reply with `workspace reply <request-id> "message"` once and use `--error` if the request failed.
