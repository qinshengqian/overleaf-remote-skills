/**
 * olcli ignore subsystem
 *
 * Layered defense against syncing local LaTeX build artifacts (and other
 * unwanted files) up to Overleaf:
 *
 *   1. Built-in ignore list  — always on, opt out with --no-default-ignore
 *   2. .olignore             — project-level, gitignore-style syntax
 *   3. .olignore.local       — machine-specific, never synced (gitignore'd)
 *
 * Special PDF rule: ignore `X.pdf` only if a same-named `X.tex` (or `.ltx`)
 * exists in the same folder. This kills `thesis.pdf` next to `thesis.tex`
 * but preserves a hand-uploaded `figures/diagram.pdf`.
 *
 * Escape hatches:
 *   --no-default-ignore  → only .olignore + .olignore.local apply
 *   --no-ignore          → no filtering at all
 *
 * See issue #19 for design rationale.
 */
import { Ignore } from 'ignore';
/**
 * Default ignore patterns, applied unless --no-default-ignore is set.
 *
 * Covers LaTeX build artifacts (pdflatex / xelatex / lualatex / latexmk /
 * biber / makeindex / glossaries / minted), common editor noise, and
 * conventional build directories.
 *
 * Note: `*.pdf` is NOT in this list — see shouldIgnore() for the special
 * sibling-`.tex` rule.
 */
export declare const DEFAULT_IGNORE_PATTERNS: readonly string[];
/**
 * Resolved ignore configuration for a project directory.
 */
export interface IgnoreContext {
    /** All effective patterns in priority order (later overrides earlier). */
    patterns: string[];
    /** Sources contributing to `patterns`, for `olcli ignored` output. */
    sources: Array<{
        label: string;
        patterns: string[];
    }>;
    /** True when defaults are enabled. */
    defaultsEnabled: boolean;
    /** True when ignore filtering is enabled at all. */
    enabled: boolean;
    /** Compiled matcher; null when `enabled === false`. */
    matcher: Ignore | null;
}
export interface LoadIgnoreOptions {
    /** Disable the built-in DEFAULT_IGNORE_PATTERNS list. */
    noDefaults?: boolean;
    /** Disable all ignore filtering entirely (overrides everything else). */
    disableAll?: boolean;
}
/**
 * Build an IgnoreContext for the given project root.
 *
 * Layering (lowest → highest precedence; `ignore` semantics: later wins):
 *   1. DEFAULT_IGNORE_PATTERNS   (unless noDefaults)
 *   2. <root>/.olignore          (project, version-controlled)
 *   3. <root>/.olignore.local    (machine-only, gitignore'd)
 */
export declare function loadIgnore(root: string, opts?: LoadIgnoreOptions): IgnoreContext;
/**
 * Decide whether a given relative path should be ignored.
 *
 * @param relativePath  Path relative to the project root, forward-slash.
 *                      For directories, callers may pass `dir/` (trailing
 *                      slash) to engage gitignore directory matching.
 * @param ctx           From `loadIgnore`.
 * @param siblingTexBaseNames  Set of file basenames (without extension) in
 *                      the same folder as `relativePath` that have a `.tex`
 *                      or `.ltx` source. Used for the PDF special rule.
 *                      Pass `undefined` to skip the PDF rule.
 */
export declare function shouldIgnore(relativePath: string, ctx: IgnoreContext, siblingTexBaseNames?: Set<string>): boolean;
/**
 * Convenience: build a per-folder set of basenames that have a `.tex` or
 * `.ltx` companion. Caller passes the list of files in that folder (just
 * basenames, not full paths).
 */
export declare function buildTexSiblingSet(folderFileNames: Iterable<string>): Set<string>;
//# sourceMappingURL=ignore.d.ts.map