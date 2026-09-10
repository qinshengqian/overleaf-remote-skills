# Overleaf Remote Skill

A portable Codex Skill plus a bundled enhanced `olcli` for managing Overleaf
projects directly—without maintaining a continuous local pull/push checkout.

## Highlights

- Create and inspect Overleaf projects
- Replace complete remote text documents
- Precisely replace, insert, append, or prepend text
- Create nested folders and text files
- Upload images, PDFs, bibliographies, and other assets to remote paths
- Compile projects and download PDFs, logs, and BBL files
- Verify saved text and important binary uploads
- Keep a persistent low-latency `olcli live` session open for repeated edits
- Detailed macOS and Windows setup and Cookie instructions

In real Overleaf tests, persistent edits completed in roughly 1.8 seconds per
write, compared with about 12 seconds for the original full read/write/verify
path. Actual latency depends on network and Overleaf service conditions.

## Repository layout

```text
SKILL.md                       Main Codex Skill entry point
agents/openai.yaml             Codex UI metadata
references/setup-and-cookie.md Detailed installation and authentication guide
references/commands.md         Complete remote-operation command guide
references/troubleshooting.md  Troubleshooting guide
scripts/                       macOS/Linux and Windows installers/checkers
assets/olcli/                  Bundled enhanced olcli source and build
```

## Install the bundled olcli

Node.js 18 or newer is required.

macOS/Linux:

```bash
bash scripts/install_olcli.sh
bash scripts/check_olcli.sh
```

Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install_olcli.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\check_olcli.ps1
```

For browser-specific instructions—including the exact macOS and Windows keys
used to locate `overleaf_session2`—read
[`references/setup-and-cookie.md`](references/setup-and-cookie.md).

> **Safari on Mac:** Use **Command–Option–I** (`⌘⌥I`), the same shortcut as
> Chrome. First enable **Safari → Settings → Advanced → Show features for web
> developers**. Then open **Storage → Cookies** in Web Inspector. See the
> [Safari cookie steps](references/setup-and-cookie.md#safari) for details.

## Quick examples

```bash
olcli create "My Paper"
olcli mkdir chapters/experiments "My Paper"
olcli write chapters/method.tex "My Paper" --content '\section{Method}'
olcli replace main.tex 'old sentence' 'new sentence' "My Paper"
olcli upload plot.png "My Paper" --to figures/plot.png
olcli compile "My Paper"
```

Persistent mode accepts one JSON object per line:

```bash
olcli live "My Paper"
```

```json
{"op":"replace","path":"main.tex","search":"old","replacement":"new"}
{"op":"insert","path":"main.tex","anchor":"\\end{document}","text":"Appendix\n","before":true}
{"op":"compile"}
{"op":"quit"}
```

See [`references/commands.md`](references/commands.md) for the full protocol.

## Security

`overleaf_session2` is equivalent to a password. Never commit it, paste it into
issues, include it in screenshots, or store it in this Skill. If exposed, sign
out of Overleaf sessions and authenticate again with a fresh Cookie.

This repository contains no user session Cookie.

## Attribution and license

The bundled CLI is based on the MIT-licensed
[`aloth/olcli`](https://github.com/aloth/olcli) project and includes its license
and attribution. Enhancements in this repository add direct remote editing,
precise text operations, nested file management, verification, and persistent
low-latency operation.

Released under the MIT License. See [LICENSE](LICENSE).
