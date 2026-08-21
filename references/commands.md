# Remote Overleaf command guide

Use a quoted project name or its 24-character project ID. IDs avoid ambiguity.
Omit the project only when the current directory has a valid `.olcli.json`.

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

## Replace an entire existing text document

Exactly one content source is required:

```bash
olcli edit main.tex "My Paper" --content '\section{Replacement}'
olcli edit main.tex "My Paper" --from /tmp/replacement.tex
printf '%s' '\section{Replacement}' | olcli edit main.tex "My Paper" --stdin
```

`edit` requires an existing remote document and verifies the saved result.

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
$Text | olcli edit main.tex 'My Paper' --stdin
```

## Create folders and text files

```bash
olcli mkdir figures/generated "My Paper"
olcli mkdir chapters/appendix "My Paper"
olcli write chapters/related-work.tex "My Paper" --content '\section{Related Work}'
olcli write data/notes.txt "My Paper" --from /tmp/notes.txt
printf '%s' '@article{key,...}' | olcli write references/new.bib "My Paper" --stdin
```

`write` creates missing parent folders, creates or replaces text, and verifies
the result. It refuses to replace an existing binary file.

## Upload images and other files

```bash
olcli upload plot.png "My Paper" --to figures/generated/plot.png
olcli upload supplement.pdf "My Paper" --to supplements/supplement.pdf
olcli upload references.bib "My Paper" --to bibliography/references.bib
```

`--to` is the complete remote path. Missing parent folders are created.

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

Responses include `status` and `elapsedMs`. Default live writes update the
in-memory snapshot after one upload request and do not redownload the project.
Start with `olcli live "My Paper" --verify` for a full download comparison after
every text write; expect it to be slower. Send `refresh` before the next edit if
another collaborator changed files while the session was open. Operations are
processed sequentially, so do not send a second command until the previous JSON
response arrives.
