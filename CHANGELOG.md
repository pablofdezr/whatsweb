# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-11-10

### Added

- **Authorization** (`authorize` option): decides who may use the bot before
  anything else runs. Rejected messages never reach handlers, `ask()`,
  transcription or the history, and emit `unauthorized`. The returned user is
  available as `ctx.principal`, typed through the `Register` interface. If the
  check throws, the message is rejected. `client.resolveIdentity()` and
  `getPhoneForLid()` resolve the sender's phone number from the LID.
- **Files for AI models**: `message.media` / `ctx.media` describe a received
  file (kind, MIME type, name, size, duration, voice note). `downloadAttachment()`
  returns it with its bytes, and `toModelPart()` converts it into an AI SDK
  image or file part.
- **Your own message store**: `message.toRecord()` returns plain data to store
  in your database (sender phone and LID, text, transcript, file details,
  quoted message, mentions). `serializeMessage()` and `client.restoreMessage()`
  keep and rebuild the full message. `toModelMessages()` builds the model
  context from your rows, with images and PDFs as files and sender names in
  groups. `message_create` now also fires for the messages you send.
- **Voice notes**: the `transcribe` option turns authorized voice notes and
  audio into text before handlers run (`ctx.text`, `message.transcript`).
  `sendVoice` converts any audio to OGG/Opus with ffmpeg (`toOggOpus`,
  `ffmpegPath` option).
- **One message at a time per chat** (`concurrency: 'per-chat'`, the default):
  quick messages from the same chat are handled in order instead of all at
  once. `whenIdle()` waits for in-flight handlers before shutting down.
- `KeyValueAuth`: keeps the WhatsApp session in any key/value store, such as a
  Postgres table.
- MIME detection from file content and names: `detectMime`, `mimeFromBuffer`,
  `mimeFromName`.

- `message_edit` and `message_delete` events. Edits replace the message in the
  history and deletes remove it, so `conversation.toMessages()` matches what
  the chat shows.
- `logged_out` event and `clearSessionOnLogout` option (defaults to `true`).

### Fixed

- Edits, deletes, reactions, poll votes and pins reached handlers as if they
  were new messages (empty, or with the reaction emoji as text) and were added
  to the history. They are now kept out of the router; reactions keep arriving
  through the `reaction` event.
- When WhatsApp ended the session (device unlinked from the phone), the stale
  credentials stayed on disk and every later `start()` failed until they were
  deleted by hand. They are now deleted automatically.

- **Disappearing and view-once messages**: their text, type and media were not
  read because Baileys keeps them inside a wrapper. `ctx.text`, commands,
  `hasMedia` and `downloadMedia()` now work in chats with disappearing messages.
- `ctx.args` included the command name when there was a space after the prefix
  (`! sum 2 3` gave `['sum', '2', '3']`).
- The sender of your own messages was reported as the other person in private
  chats (and as empty in groups). It is now your own account.
- Calling `start()` twice, or an old socket closing late, could open a second
  connection on the same session. Events from replaced sockets are now ignored.
- `waitUntilReady()` resolved immediately while the client was reconnecting.
- `waitForMessage()`, `ask()` and `confirm()` hung forever when given an
  already-aborted signal.
- `sendFromLink()` could hang on a link whose server never answered the
  `HEAD` request; detection now times out after 10 seconds.
- `confirm()` didn't accept answers with Spanish opening punctuation (`¡Sí!`).
- Audio, images, videos and documents were sent with a generic or wrong MIME
  type (an MP3 declared as OGG/Opus, a PDF as `application/octet-stream`). The
  real type is now detected from the content or the file name.
- `state.all()` returned the store's internal object, so mutating it changed
  the stored state without calling `set()`.

### Changed

- Incoming messages are handled one at a time per chat by default (see above).
  Async `message` listeners are awaited as part of that. Pass
  `concurrency: 'parallel'` for the previous behavior.
- A message taken as the answer to `ask()` / `waitForMessage()` is no longer
  handled again by the router and `message` listeners.
- `conversation.toMessages()` now describes files (`[image]`) instead of
  skipping them, and prefixes sender names in groups.
- Updated Baileys to `7.0.0-rc14` and refreshed dependencies, fixing the
  security advisories reported for `sharp` and `music-metadata`.

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
