# Troubleshooting

## `olcli` is not found

Close and reopen Terminal or PowerShell. Check `node --version`, `npm --version`,
and `npm prefix -g`, rerun the platform installer, then run `check_olcli`.
Do not default to `sudo npm`; prefer the official Node installer or a user-level
version manager.

## Authentication failed

- Confirm the cookie name is `overleaf_session2` for overleaf.com.
- Copy only Value, without quotes or `overleaf_session2=`.
- Confirm the browser is signed in and the cookie domain is overleaf.com.
- Run `olcli logout`, obtain a fresh cookie, authenticate again, and run
  `olcli whoami`.
- For older self-hosted instances, configure `overleaf.sid` and the correct URL.

Stop after repeated failures and ask the user to refresh the browser session.

## Developer Tools do not open

- macOS Chrome/Edge/Firefox: **Command–Option–I**.
- Windows Chrome/Edge/Firefox: **F12**, **Fn–F12**, or **Ctrl–Shift–I**.
- Safari: in **Safari → Settings → Advanced**, enable **Show features for web
  developers** (older versions: **Show Develop menu in menu bar**), then press
  **Command–Option–I** (`⌘⌥I`). See the
  [Safari cookie steps](setup-and-cookie.md#safari).
- Do not bypass policy on a managed device where DevTools is disabled.

## Project or path not found

Run `olcli list` and `olcli info "PROJECT" --json`. Use a project ID when names
collide. Remote paths are project-relative, not local absolute paths.

## Search or anchor failed

Download the latest remote document. Whitespace, line endings, capitalization,
and LaTeX escaping must match exactly. Prefer a longer stable anchor over
`--all`. Multiple matches are a safety failure; use more context or an explicit
`--occurrence` for insertion.

## `folder_not_found`

Run `olcli info` to refresh the tree and retry once. If it persists, confirm edit
permission. Do not repeatedly create folders without inspecting remote state.

## Verify uploaded content

Text commands require a versioned OT acknowledgement, or perform HTTP
read-after-write verification when OT is unavailable. For binary files, download
to a temporary path and compare with `cmp` on macOS/Linux or `Get-FileHash` on
Windows.

## Realtime transport is unavailable

`olcli live` reports its selected `transport` in the ready response. `auto`
falls back to HTTP for handshake, document-type, or size failures that occur
before sending an update. Use `--transport ot` to expose the underlying error.
An error after an update was sent is intentionally not retried because the
server outcome may be uncertain; issue `refresh`, inspect the document, and
then decide whether to repeat the edit.

## Compile failed

Run:

```text
olcli output log --project "PROJECT" --output output.log
```

Inspect the first meaningful LaTeX error, missing files, root document, and
case-sensitive path mismatches. Compile failure does not imply upload failure.

## Cookie expired or was exposed

Run `olcli logout`, sign out of Overleaf, sign back in, obtain a new cookie, and
authenticate again. Never preserve an exposed value in diagnostic output.

## Self-hosted Overleaf

```text
olcli config set-url https://overleaf.example.edu
olcli config set-cookie-name overleaf.sid
olcli check
```

Confirm settings with the administrator rather than guessing.
