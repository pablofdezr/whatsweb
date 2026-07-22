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
npm run docs           # build the Docusaurus docs site (website/ → website/build)
npm run docs:dev       # run the docs site locally with hot reload
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
- **`docs.yml`** — builds the hand-made landing page (`web/index.html`) plus the
  Docusaurus docs site (`website/`, which generates the API reference from the
  source via `docusaurus-plugin-typedoc`) and deploys them to **GitHub Pages** on
  every push to `main`. Served at `https://pablofdezr.github.io/whatsweb/`
  (landing) and `/docs/` (documentation). Pages must be enabled with the
  "GitHub Actions" source (this repo already is).

The docs site lives in `website/` with its **own** `package.json`/lockfile, so
Docusaurus's heavy dependencies never touch the SDK package.

## Releasing

The package is published as `@whatsweb/core` (the `@whatsweb` npm org). Releases
are automated by tags — you don't publish from your machine:

1. Update `CHANGELOG.md`.
2. Bump the version and tag it:

   ```bash
   npm version <patch|minor|major>   # updates package.json + creates a git tag
   git push --follow-tags
   ```

3. Pushing the `v*` tag triggers `.github/workflows/publish.yml`, which runs the
   tests, builds, `npm publish --provenance --access public` (auth via the
   `NPM_TOKEN` repo secret, already configured), and creates a GitHub Release
   with auto-generated notes.

Preview the tarball contents with `npm pack --dry-run` (only `dist/`, `README`,
`CHANGELOG` and `LICENSE` are published).
