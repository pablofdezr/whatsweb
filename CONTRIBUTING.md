# Contributing

## Requirements

- Node ≥ 20 (or Bun)
- Any of npm, pnpm or Bun

## Setup

```bash
npm install     # or: pnpm install   /   bun install
```

`package-lock.json` (npm) is the committed, canonical lockfile; pnpm/bun
lockfiles are gitignored so the repo keeps a single source of truth.

## Scripts

Run any script with your package manager (`npm run <x>`, `pnpm <x>`, `bun run <x>`):

```bash
npm run build          # compile to dist/ (ESM + .d.ts)
npm run typecheck      # tsc --noEmit
npm test               # unit tests (node:test)
npm run lint           # ESLint
npm run format         # Prettier --write
npm run format:check   # Prettier --check
npm run docs           # generate API docs (TypeDoc) into docs/
npm run example:bot                    # demo bot, callback style (scan the QR)
npm run example:async                  # same bot, async/await style
npm run example:multi                  # manage multiple accounts
npm run example:pair -- 34600112233    # pairing by code
```

Bun can also run the TypeScript examples **directly**, no `tsx` needed:

```bash
bun examples/ping-bot.ts
bun examples/multi-account.ts
```

> Bun prints two harmless `ws.WebSocket 'upgrade'/'unexpected-response' event is
> not implemented` warnings; the connection still works.

## Project structure

```
src/
  client/       Client, options, send-option types
  router/       Context + middleware types
  structures/   Message, Chat, Group, Sender
  media/        media resolution + kind detection
  auth/         LocalAuth + AuthStrategy
  util/         jid, content, logger, eventStream, queue, vcard
examples/       runnable examples
test/           unit tests (node:test)
```

`whatsweb` is a thin, ergonomic layer over
[Baileys 7](https://github.com/WhiskeySockets/Baileys); it does not reimplement
the cryptography (Noise handshake, Signal, protobuf, media encryption).

## Continuous integration

- **`ci.yml`** — lint, format check, typecheck, build and tests on Node 20 & 22,
  plus a `compat` job that installs, builds and tests with **pnpm** and **Bun**.
- **`publish.yml`** — publishes to npm on `v*` tags (needs an `NPM_TOKEN` repo
  secret).
- **`docs.yml`** — builds the landing page (`web/index.html`) plus the TypeDoc
  reference and deploys them to **GitHub Pages** on every push to `main`. The
  site is served at `https://pablofdezr.github.io/whatsweb/` (landing) and
  `/api/` (API reference). Pages must be enabled with the "GitHub Actions"
  source (this repo already is).

## Releasing

1. Set `name` in `package.json` to your npm user/org scope (the unscoped
   `whatsweb` is already taken on npm).
2. Update `CHANGELOG.md`.
3. `npm login`, then create the `NPM_TOKEN` repo secret for CI.
4. Bump the version and tag: `npm version <patch|minor|major>` then
   `git push --follow-tags`. The `publish.yml` workflow builds and publishes
   (`prepublishOnly` runs clean + typecheck + build).

Preview the tarball contents with `npm pack --dry-run` (only `dist/`, `README`,
`CHANGELOG` and `LICENSE` are published).
