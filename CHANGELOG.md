# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] - 2026-07-23

### Fixed

- **Pairing by phone number**: entering the pairing code on the phone failed
  with "Couldn't link device". WhatsApp rejects companion registrations whose
  browser name isn't a recognized browser, so the client now presents
  `Chrome (Ubuntu)` during pairing-code login. The custom `deviceName` still
  applies to the QR flow (a protocol limitation, not a whatsweb one).

### Added

- New `examples/ai-bot.ts`: an AI chatbot built with the Vercel AI SDK that
  feeds `conversation.toMessages()` to Claude as chat context.

## [0.2.0] - 2026-07-22

### Added

- **Per-user conversations**: `ctx.conversation` / `client.conversation(jid)` with
  persistent per-chat state (pluggable `StateStore`, in-memory by default),
  bounded in-memory message history, `ask`/`askText`, `confirm` (yes/no with
  configurable accepted answers), and `ctx.replyWithTyping`.
- **Bring your own agent**: `conversation.toMessages()` builds a neutral
  `{ role, content }` transcript to feed your own LLM/agent (e.g. the Vercel AI
  SDK). The SDK stays unopinionated about models.

### Changed

- npm `homepage` now points to the documentation site.

## [0.1.0] - 2026-07-22

### Added

- **Client** built on Baileys 7 (ESM, no browser): `createClient`/`Client`,
  QR and pairing-code login, `start`/`waitUntilReady`, typed events, and a
  low-level `socket` escape hatch.
- **Command router**: `use` middleware, `command`, `hears`, and a rich
  `Context` (text/command/args, `reply`/`send`/`react`, media replies, typing,
  `downloadMedia`).
- **Async/await API**: `messages()`, `stream(event)`, `next(event)` async
  iterators as an alternative to callbacks.
- **Sending**: `sendText`, `sendImage`, `sendVideo`, `sendAudio`, `sendVoice`,
  `sendDocument`, `sendLocation`, and `sendFromLink` with automatic media-kind
  detection. Media sources accept a local path, http(s)/S3 URL, Buffer or
  Node stream.
- **Rich messages**: `sendPoll`, `sendSticker`, `sendContact` (vCard),
  mentions on text/captions, and `editMessage`/`deleteMessage`/`forwardMessage`.
- **Groups**: fluent `group(id)` handle plus client methods for metadata,
  participants (add/remove/promote/demote), subject/description, invite links,
  and create/join/leave.
- **Presence & profile**: `setPresence`, `subscribeToPresence` + `presence`
  event, `getProfilePictureUrl`, `setProfilePicture`/`removeProfilePicture`,
  `setName`, `setStatus`, `getStatus`, `blockUser`/`unblockUser`,
  `getBlocklist`.
- **Conversation flows**: `waitForMessage` and `ctx.awaitReply` for
  question→answer bots.
- **Robustness**: exponential-backoff reconnection with a max-attempts cap, and
  crash-safe error emission (routes to the logger when no `error` listener).
- **Rate limiting**: optional `rateLimitMs` option that serializes and spaces
  outgoing messages.
- **LID awareness**: `Sender` with LID/PN resolution, `getLid`, and alternate
  JID fields on messages.
- **Auth**: `LocalAuth` (multi-file) and a pluggable `AuthStrategy` interface.
- **Tooling**: unit tests (node:test), ESLint + Prettier, TypeDoc API docs, and
  GitHub Actions for CI, npm publish on tag, and docs deployment.
