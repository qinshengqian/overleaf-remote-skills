---
name: overleaf-remote
description: Install and use the bundled olcli to read, inspect, create, edit, precisely patch, organize, upload to, download from, and compile Overleaf projects without maintaining a local pull/push checkout. Prefer the persistent live session for reading and editing remote documents. Use for Overleaf CLI setup, session-cookie authentication, direct remote file operations, or diagnosing olcli access and synchronization problems.
---

# Overleaf Remote

## Start here: is a live session running?

`olcli live` is the default interface to a project, for reading as much as for
editing. **Before anything else, check whether a session already covers the
project** (`olcli-live ls` on macOS/Linux, or `tmux ls`):

- **If one is running, use it for everything.** `{"op":"ls"}` lists the project,
  `{"op":"read","path":...}` reads a document, and the edit operations below
  change it.
- **If none is running, start one** before reaching for one-shot commands:
  `olcli live "My Paper"`, or a tmux window via `scripts/run-live.sh` so it
  outlives the terminal. It costs a few seconds and is reused for every later
  step.

Reach for `olcli download` only when you need the bytes on local disk: a ZIP, a
binary, or compile output.

The session holds each joined document's current text and version, so it answers
a read without a download and can tell you whether what you last read is still
current. `{"op":"stat"}` reports whether the local copy is stale, and
`remoteChanged` flags an edit from another connection. A full read is mirrored
under `~/.olcli/live/<projectId>/`, and `{"op":"mirror","intervalMs":1000}` keeps
it current. The mirror is read-only: never edit those files, and never upload
them back; change content only through `replace`/`insert`/`append`.

## How edits work

Use the bundled olcli build for direct Overleaf operations. Prefer precise
remote commands (`replace`, `insert`, `append`, `prepend`, `write`, `mkdir`,
and `upload --to`) over a bidirectional pull/push checkout. The live mirror is
not that: it is one-way and read-only. `edit` is not a general editor: it only
fills an empty document, and `write` only creates a document or fills an empty
one. Whole-document replacement is refused everywhere else, so plan every change
as a targeted operation against the document's live content.

`olcli live` keeps one Overleaf collaboration WebSocket open, joins text
documents lazily, and sends small versioned OT insert/delete operations instead
of downloading and re-uploading whole files. It tracks collaborator updates and
safely rejoins a document after a race. `auto` mode falls back to verified HTTP
replacement only when the failure happened before an OT write was sent;
uncertain writes are never retried blindly. Use `--transport ot` to require OT
or `--transport http` to diagnose compatibility with older self-hosted
instances.

## Hosting the session

On macOS or Linux with `tmux`, keep the session alive rather than starting a new
`olcli live` for every request: one tmux window per project, started with
`scripts/run-live.sh` (it restarts the session if it exits, since tmux has no
restart-on-crash of its own) and driven with `scripts/olcli-live send`, which
waits for each reply. A tmux server is a single per-user process, so several
terminals and several agent sessions share one connection. Never drive one
window from two writers at once; the replies interleave and you can no longer
tell which reply belongs to which operation.

Windows is out of scope for this: both helpers are bash scripts with no
PowerShell twin, and the installer deliberately does not place them on PATH. On
Windows, start `olcli live` per request and use the one-shot commands for single
edits.

## Route the task

- For anything on a project, start from the live session (see *Start here*); its
  operations are in
  [references/commands.md](references/commands.md#persistent-real-time-session).
- For first-time installation, authentication, or instructions for obtaining
  the Overleaf cookie on macOS or Windows, read
  [references/setup-and-cookie.md](references/setup-and-cookie.md) completely.
- For project, file, editing, upload, compile, and verification commands, read
  [references/commands.md](references/commands.md) completely.
- When authentication, PATH, folder resolution, upload, compilation, or content
  verification fails, read
  [references/troubleshooting.md](references/troubleshooting.md) completely.

## Operating rules

1. Treat `overleaf_session2` as a password. Never echo it, quote it in a report,
   commit it, place it in the Skill, or expose it in process listings when a
   hidden prompt is available.
2. Authentication permits access; it does not by itself authorize creating,
   editing, deleting, renaming, or compiling a project. Confirm that the user's
   request covers the intended remote mutation.
3. Default to the live session, for reads as well as writes (see *Start here*).
   Do not read a document with `olcli download` while a session is running: it
   wastes a round trip and throws away the session's record of whether that
   content is current.
4. Never edit from a stale copy. Compute every change against the document's
   current remote content. Do not download a file, edit it locally, and upload
   it back; do not reuse content read earlier in this conversation, in a
   previous session, or from a local checkout. Re-read first. `olcli live`
   follows collaborator updates as they arrive, and the one-shot commands
   re-read immediately before writing. A base that was not freshly read may
   already be superseded by someone else's text.
5. Never replace a whole document unless it is empty. `edit`, `write`, and
   `upload --to` refuse to overwrite a non-empty text document, because a
   wholesale write silently discards everything a collaborator added since that
   content was read. Express the change as targeted operations (`replace`,
   `insert`, `append`, `prepend`) instead. Delete and recreate a file only when
   the user has explicitly asked for a full rewrite.
6. Resolve the exact project and remote path before mutation. Prefer a project
   ID when names are ambiguous.
7. Use `replace` for an exact, unique change. It refuses multiple matches unless
   `--all` is explicit. Use `insert` with a stable anchor and
   `--occurrence <n>` when the anchor repeats.
8. Use `write` to create a text document or fill an empty one, `mkdir` for
   folders, and `upload --to` for images, PDFs, bibliographies, archives, or
   other new files.
9. Preserve the built-in versioned OT acknowledgement or HTTP read-after-write
   verification. For binary uploads, download to a temporary file and compare
   hashes or bytes when correctness matters.
10. Do not start a pull/push daemon unless the user explicitly asks for ongoing
    synchronization. The direct commands are designed to avoid that workflow.
11. After repeated authentication failures, ask the user to refresh the cookie;
    do not keep retrying a possibly expired credential.

## Bundled implementation

The modified olcli source and compiled JavaScript live in `assets/olcli/`.
Install it with the platform script in `scripts/`; do not silently substitute
the public npm release because it may not contain this Skill's direct-edit
commands.

- macOS/Linux: `bash scripts/install_olcli.sh`
- Windows PowerShell: `powershell -ExecutionPolicy Bypass -File scripts/install_olcli.ps1`
- Verify macOS/Linux: `bash scripts/check_olcli.sh`
- Verify Windows: `powershell -ExecutionPolicy Bypass -File scripts/check_olcli.ps1`

When changing the bundled implementation, update both `assets/olcli/src/` and
`assets/olcli/dist/`, run the TypeScript build, and validate this Skill before
delivery.
