---
name: overleaf-remote
description: Install and use the bundled olcli to create, inspect, edit, precisely patch, organize, upload to, download from, and compile Overleaf projects without maintaining a local pull/push checkout. Use for Overleaf CLI setup, session-cookie authentication, direct remote file operations, or diagnosing olcli access and synchronization problems.
---

# Overleaf Remote

Use the bundled olcli build for direct Overleaf operations. Prefer precise
remote commands (`replace`, `insert`, `append`, `prepend`, `write`, `mkdir`,
and `upload --to`) over maintaining a continuously synchronized local copy when
the user wants changes made directly on Overleaf.

For multiple edits in one working session, prefer `olcli live`: it keeps one
Overleaf collaboration WebSocket open, joins text documents lazily, and sends
small versioned OT insert/delete operations instead of downloading and
re-uploading whole files. It tracks collaborator updates and safely rejoins a
document after a race. `auto` mode falls back to verified HTTP replacement only
when the failure happened before an OT write was sent; uncertain writes are
never retried blindly. Use `--transport ot` to require OT or `--transport http`
to diagnose compatibility with older self-hosted instances.

## Route the task

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
3. Resolve the exact project and remote path before mutation. Prefer a project
   ID when names are ambiguous.
4. Use `replace` for an exact, unique change. It refuses multiple matches unless
   `--all` is explicit. Use `insert` with a stable anchor and
   `--occurrence <n>` when the anchor repeats.
5. Use `write` to create or replace text documents, `mkdir` for folders, and
   `upload --to` for images, PDFs, bibliographies, archives, or other files.
6. Preserve the built-in versioned OT acknowledgement or HTTP read-after-write verification. For binary uploads,
   download to a temporary file and compare hashes or bytes when correctness
   matters.
7. Do not start a pull/push daemon unless the user explicitly asks for ongoing
   synchronization. The direct commands are designed to avoid that workflow.
8. After repeated authentication failures, ask the user to refresh the cookie;
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
