# Remote Overleaf command guide

Use a quoted project name or its 24-character project ID. IDs avoid ambiguity.
Omit the project only when the current directory has a valid `.olcli.json`.

## Prefer the live session

If the project has a persistent `olcli live` session, do the work through it
(see [Persistent real-time session](#persistent-real-time-session)). It reads
and writes without downloading whole files, and it knows whether the text you
last read is still current. The one-shot commands below are the fallback for
when no session covers the project, or when you genuinely need bytes on local
disk. In particular, do not `download` a document to read it while a session is
running: use `{"op":"read",...}`.

## Editing rules

Always edit against the live remote content. Do not download a file, modify a
local copy, and upload it back, and do not reuse content fetched earlier in the
session or in an earlier run. The direct commands read the document immediately
before writing for exactly this reason: Overleaf projects are edited
concurrently, so a base that was not just read may already be superseded by
someone else's text.

Whole-document replacement is allowed only into an empty document. `edit`,
`write`, and `upload --to` refuse to overwrite a non-empty text document. Send
any change to existing text as `replace`, `insert`, `append`, or `prepend`.
Delete and recreate a file only when a full rewrite was explicitly requested.

## Inspect and create projects

```bash
olcli list
olcli list --json
olcli info "My Paper"
olcli create "Experiment Paper"
```

Creating a project changes the account; obtain authorization first.

## Read a document

Through a live session, the text comes from the session's joined copy and a full
read is captured under `~/.olcli/live/<projectId>/`:

```json
{"op":"ls"}
{"op":"read","path":"sections/02-results_main.tex"}
{"op":"read","path":"sections/02-results_main.tex","offset":1,"limit":40}
{"op":"stat"}
{"op":"mirror","intervalMs":1000}
```

Without a session, or when you need the bytes on local disk (a ZIP, a binary,
compile output):

```bash
olcli download main.tex "My Paper" --output /tmp/main.tex
olcli zip "My Paper" --output /tmp/my-paper.zip
olcli info "My Paper" --json
```

## Fill an empty text document

`edit` writes content into a document that is still empty. It refuses a
non-empty document, because replacing a whole document discards whatever a
collaborator wrote since that content was last read. Use "Precise editing" below
to change text that already exists, or `write` to create a document that does
not exist yet.

Exactly one content source is required:

```bash
olcli edit chapters/placeholder.tex "My Paper" --content '\section{Replacement}'
olcli edit chapters/placeholder.tex "My Paper" --from /tmp/replacement.tex
printf '%s' '\section{Replacement}' | olcli edit chapters/placeholder.tex "My Paper" --stdin
```

`edit` requires an existing, empty remote document, sends a versioned OT update,
and verifies the saved result. Runs of whitespace count as empty; any real text
does not.

## Precise editing

```bash
olcli replace main.tex 'old sentence' 'new sentence' "My Paper"
olcli replace main.tex '\todo{}' '' "My Paper" --all
olcli insert main.tex '\section{Method}' $'\nNew paragraph.' "My Paper"
olcli insert main.tex '\end{document}' $'\section{Appendix}\nText.\n' "My Paper" --before
olcli insert main.tex '\item' ' inserted text' "My Paper" --occurrence 3
olcli append notes.tex $'\nOne more note.' "My Paper"
olcli prepend notes.tex $'% generated remotely\n' "My Paper"
```

`replace` requires exactly one match unless `--all` is explicit. Make the
search more specific instead of using `--all` when only one location should
change. `insert` uses the first anchor unless `--occurrence` is supplied.

These one-shot commands reply with status and size only. When the change should
be reviewable as a diff, use the live session instead: see
[Reviewing what an edit changed](#reviewing-what-an-edit-changed).

PowerShell multiline input:

```powershell
$Text = @'
\section{Method}
New paragraph.
'@
$Text | olcli write chapters/method.tex 'My Paper' --stdin
```

## Create folders and text files

```bash
olcli mkdir figures/generated "My Paper"
olcli mkdir chapters/appendix "My Paper"
olcli write chapters/related-work.tex "My Paper" --content '\section{Related Work}'
olcli write data/notes.txt "My Paper" --from /tmp/notes.txt
printf '%s' '@article{key,...}' | olcli write references/new.bib "My Paper" --stdin
```

`write` creates missing parent folders, creates a document, or fills an existing
empty one, and verifies the result. It refuses to overwrite a non-empty document
as a whole, and refuses to replace an existing binary file. To change text that
is already there, use `replace`, `insert`, `append`, or `prepend`.

## Upload images and other files

```bash
olcli upload plot.png "My Paper" --to figures/generated/plot.png
olcli upload supplement.pdf "My Paper" --to supplements/supplement.pdf
olcli upload references.bib "My Paper" --to bibliography/references.bib
```

`--to` is the complete remote path. Missing parent folders are created. An upload
that would land on an existing non-empty text document is refused; new paths and
binary targets such as images and PDFs are unaffected.

Verify important binaries on macOS/Linux:

```bash
olcli download figures/generated/plot.png "My Paper" --output /tmp/plot.verify.png
cmp plot.png /tmp/plot.verify.png
```

Verify on Windows PowerShell:

```powershell
olcli download figures/generated/plot.png 'My Paper' --output "$env:TEMP\plot.verify.png"
if ((Get-FileHash .\plot.png).Hash -ne (Get-FileHash "$env:TEMP\plot.verify.png").Hash) {
  throw 'Uploaded file verification failed'
}
```

## Rename and delete

```bash
olcli rename chapters/draft.tex final.tex "My Paper"
olcli delete chapters/obsolete.tex "My Paper"
```

Resolve targets with `olcli info` and require explicit deletion authorization.

## Compile and retrieve output

```bash
olcli compile "My Paper"
olcli pdf "My Paper" --output /tmp/my-paper.pdf
olcli output --list --project "My Paper"
olcli output log --project "My Paper" --output /tmp/output.log
olcli output bbl --project "My Paper" --output /tmp/output.bbl
```

A successful upload does not guarantee valid LaTeX. Inspect the log when
compilation fails.

## Pull, push, and sync

Use these only when the user explicitly wants a local checkout:

```bash
olcli pull "My Paper" ./my-paper
olcli push ./my-paper
olcli sync ./my-paper
```

`sync` can propagate local deletions. Inspect local state and consider
`--no-delete` when the checkout may be stale.

## Persistent real-time session

Start one authenticated process:

```bash
olcli live "My Paper"
```

The default `auto` transport opens Overleaf's collaboration WebSocket and uses
versioned OT changes. It does not download the project ZIP. Use
`--transport ot` to require this path, or `--transport http` for an older
self-hosted deployment.

It prints a `{"status":"ready",...}` line, then accepts one JSON object per
line. Keep the process open and send operations through the same standard input:

```json
{"op":"ping"}
{"op":"ls"}
{"op":"read","path":"main.tex"}
{"op":"read","path":"main.tex","offset":1,"limit":40}
{"op":"read","path":"main.tex","force":true}
{"op":"stat"}
{"op":"stat","path":"main.tex"}
{"op":"mirror","intervalMs":1000}
{"op":"mirror","stop":true}
{"op":"replace","path":"main.tex","search":"old","replacement":"new"}
{"op":"replace","path":"main.tex","search":"TODO","replacement":"","all":true}
{"op":"insert","path":"main.tex","anchor":"\\end{document}","text":"Appendix text\n","before":true}
{"op":"insert","path":"main.tex","anchor":"\\item","text":" inserted","occurrence":2}
{"op":"append","path":"notes.tex","text":"\nNew note."}
{"op":"prepend","path":"notes.tex","text":"% generated\n"}
{"op":"write","path":"chapters/new.tex","content":"\\section{New}"}
{"op":"mkdir","path":"figures/generated"}
{"op":"upload","localPath":"/tmp/plot.png","path":"figures/generated/plot.png"}
{"op":"compile"}
{"op":"refresh"}
{"op":"quit"}
```

Responses include `status`, `transport`, `verified`, and `elapsedMs`. Existing
documents are joined lazily; later edits send only a compact insert/delete
delta and wait for Overleaf's versioned apply acknowledgement. Collaborator
updates are applied in order, and a concurrent-write race forces an
authoritative rejoin. `--verify` performs an extra rejoin and exact comparison.
`refresh` marks joined documents stale so the next access reloads them.
Operations are processed sequentially, so wait for each JSON response before
sending the next command.

A long-lived session is the safest way to edit a document that other people are
also writing to, because the connection follows their updates as they arrive
instead of re-reading the document for every change. The session still enforces
the editing rules above: `write` into a non-empty document and `upload` over a
non-empty text document are rejected, and `replace`/`insert`/`append`/`prepend`
remain the way to change existing text.

### Reading documents from a live session

A live session already holds the text of every document it has joined, so it can
read them back without a download:

- `{"op":"ls"}` lists every document and binary file path in the project.
- `{"op":"read","path":P}` writes the current text to
  `~/.olcli/live/<projectId>/<path>` and answers with the local `file`, its
  `bytes`, the document `version`, and a short content `hash`.
- `{"op":"read","path":P,"offset":N,"limit":M}` returns a bounded slice of text
  inline instead of a file, for spot checks. Inline replies are capped at 64 KB
  and set `truncated` if they hit the cap.
- `force:true` rejoins the document first, when the cached copy must not be
  trusted.

**The local copy is a read-only mirror.** It is overwritten whenever the remote
moves; never edit these files by hand, and never upload them back. Change
content through `replace`/`insert`/`append` as usual.

### Knowing whether someone else changed a document

`read` and `stat` report two independent flags, because "my copy is stale" and
"someone else is editing" are different questions:

- `changedSinceLastRead` - the version moved since your last `read`. This
  includes your own edits.
- `remoteChanged` - another connection edited it since your last `read`. The
  server tags edits by socket, so your own browser tab, or a second `olcli live`
  session on the same project, counts as remote.

Both are driven by the version and by a counter of remote edits that survives a
rejoin or a reconnect. `stale:true` means the session's copy can no longer be
trusted; the next read rejoins. Note the low-latency path is best-effort: a
half-open socket can report `stale:false` with an out-of-date copy, so
`force:true` is the correctness escape hatch.

### Keeping a local mirror in sync

`{"op":"mirror","intervalMs":1000}` reconciles tracked documents on a timer:
for each one it compares the remote content hash against the local file and
pulls the remote down when they differ. A collaborator's edit also triggers an
immediate reconcile, so the local copy follows within a fraction of a second;
the interval is the safety net. `{"op":"mirror","stop":true}` stops it, and
`{"op":"stat"}` reports `inSync`, `remoteEdits`, `pulls`, and the last pull time
per document. Each actual pull logs a `{"status":"event",...}` line. The mirror
requires the realtime transport and is one-way: remote to local.

### Keeping a session alive with tmux (macOS/Linux)

Starting `olcli live` costs about three seconds of connection setup, so a
sequence of edits should reuse one session rather than open a new one per
change. The skill ships two scripts for that: `scripts/run-live.sh` keeps the
session running and restarts it if it exits, and `scripts/olcli-live` drives it.

```bash
SKILL=~/.codex/skills/overleaf-remote           # wherever this skill lives
ln -s "$SKILL/scripts/olcli-live" ~/.local/bin/ # optional, to call it by name

tmux new-session -d -s olcli -n paper "$SKILL/scripts/run-live.sh 'My Paper'"

olcli-live ls
olcli-live send paper '{"op":"replace","path":"main.tex","search":"old","replacement":"new"}'
olcli-live files paper
olcli-live cat paper main.tex
olcli-live status paper
olcli-live read paper
olcli-live attach paper
```

`olcli-live cat` reads a document and prints the local mirror path (or the text,
for a ranged read), `files` lists the project, `status` shows reconciliation
state, and `mirror` / `mirror-stop` drive the auto-pull mirror. `read` is the
odd one out: it shows the tail of the tmux pane, not a document.

### Reviewing what an edit changed

An edit reply reports the document's new size, not the text that changed, and
the mirror overwrites its copy on the next read, so neither can tell you
afterwards what the edit did. `olcli-live send` closes that gap: when the op is
a text edit it snapshots the document, applies the op, reads it again, and
prints a unified diff.

```bash
olcli-live send paper '{"op":"replace","path":"main.tex","search":"old","replacement":"new"}'
olcli-live send paper '{"op":"insert","path":"sections/02.tex","anchor":"\\end{itemize}","text":"\n\\item Added.","before":true}'
olcli-live send paper '{"op":"write","path":"chapters/new.tex","content":"\\section{New}"}'
```

An edit prints a one-line summary plus the diff, for example
`[edit] replace main.tex: ok (transport=ot, 1 hunks, +1 -1, 21 bytes)`. This
applies to `replace`, `insert`, `append`, `prepend`, and `write`. Other
operations (`read`, `stat`, `mirror`, `compile`, `upload`) still print their raw
JSON reply; `upload` has no diff because a binary has none.

- The baseline is the session's own copy, the text the op was applied to, so the
  diff covers exactly this edit. If another connection edits in between, the
  after-read sets `remoteChanged` and the helper warns that the diff may mix in
  their text.
- A `write` to a path that does not exist yet is labelled `(new file)` and shows
  the document as wholly added. A baseline read that fails for any other reason
  is labelled `(baseline unavailable)` with a warning.
- Each document's last before/after pair is cached under
  `~/.cache/olcli-live/<window>/`. `olcli-live diff <window>` lists the cached
  edits for that window; `olcli-live diff <window> <path>` reprints one.
- `OLCLI_DIFF_CONTEXT` sets the unified context (default 3) and
  `OLCLI_DIFF_MAX_LINES` caps the printed output (default 400); truncation is
  reported rather than silent.

Two paths still bypass the helper and print no diff: typing raw `{"op":...}`
lines straight into an `olcli live` process, and the one-shot commands below,
which have no session to snapshot against.

On macOS and Linux, `install_olcli.sh` creates that `olcli-live` symlink for you,
next to whichever `olcli` is on your PATH. **Windows is out of scope for this
section**: both helpers are bash scripts with no PowerShell twin, and the
installer deliberately does not link them there. On Windows, start `olcli live`
per request and use the one-shot commands for single edits.

`run-live.sh` wraps `olcli live` in a restart loop, because tmux has no
restart-on-crash of its own; running it that way also leaves each crash's exit
code and timestamp in the pane's scrollback. Use one window per project. A tmux
server is a single per-user process, so every terminal on the machine, and
every agent session, shares the same connection and can drive the same window.

`olcli-live send` writes one operation and waits for its reply, printing it, so
operations can be issued one at a time without reading the pane by hand. Keep to
one writer per window: concurrent senders interleave their replies, and there is
then no way to tell which reply belongs to which operation.

Both scripts are thin tmux wrappers. Doing it by hand is
`tmux send-keys -t olcli:paper -l '<json>'` followed by
`tmux send-keys -t olcli:paper Enter`, read back with
`tmux capture-pane -pJ -t olcli:paper -S -`. The `-J` matters: without it, the
display wrapping of a narrow pane splits long JSON across rows.

A dropped connection (laptop sleep, network change, an Overleaf deploy) needs no
manual intervention: the client reconnects lazily at the start of the next
operation, re-joins the documents it was using, and carries on. The reconnect is
deliberately withheld from an operation that was already in flight when the
socket died, because the server may or may not have applied it; that operation
reports an error rather than being retried silently. Note that `ping` is answered
locally and does not prove the connection is alive; a `replace` whose search
string cannot match does, and it cannot have written anything.
