# Remote Overleaf command guide

Use a quoted project name or its 24-character project ID. IDs avoid ambiguity.
Omit the project only when the current directory has a valid `.olcli.json`.

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

## Read and download

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
olcli-live read paper
olcli-live attach paper
```

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
