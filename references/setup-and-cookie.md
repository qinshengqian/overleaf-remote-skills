# Installation and Overleaf cookie setup

## 1. Security warning

`overleaf_session2` is a live login credential. Anyone who has it may be able
to access the Overleaf account and its projects until the session expires.

- Never paste it into source code, Markdown, screenshots, tickets, commits, or
  shared chat messages.
- Copy only the Value field, not `overleaf_session2=` or the whole cookie row.
- Avoid typing the value directly into a command because shells save history.
- If exposed, sign out of Overleaf sessions and sign back in for a new cookie.
- The bundled Skill contains no user cookie.

## 2. Install Node.js 18.17 or newer

Check first with `node --version` and `npm --version`. The Node major version
must be 18.17 or greater.

### macOS

Official installer:

1. Open `https://nodejs.org/` and download the current LTS macOS `.pkg`.
2. Open it, select **Continue**, accept the license, select **Install**, and
   enter the Mac password or use Touch ID if requested.
3. Quit and reopen Terminal, then check `node --version` and `npm --version`.

If Homebrew is already installed, `brew install node` is also supported. Do not
install Homebrew solely for this Skill unless the user wants it.

### Windows 10/11

Official installer:

1. Open `https://nodejs.org/` and download the current LTS Windows `.msi`.
2. Open it, select **Next**, accept the license, keep **Add to PATH** enabled,
   and select **Install**.
3. Approve User Account Control if asked.
4. Close and reopen PowerShell, then check `node --version` and `npm --version`.

Alternatively run `winget install OpenJS.NodeJS.LTS`, then reopen PowerShell.

## 3. Install the bundled olcli

### macOS/Linux

1. Open Terminal.
2. Type `cd ` including the trailing space.
3. Drag this Skill folder from Finder into Terminal and press **Return**.
4. Run:

```bash
bash scripts/install_olcli.sh
bash scripts/check_olcli.sh
```

The installer backs up a previous bundled installation. If `npm link` reports
permissions errors, use the official Node installer or a user-level Node
version manager rather than `sudo npm`.

### Windows PowerShell

1. Open this Skill folder in File Explorer.
2. Click the address bar, type `powershell`, and press **Enter**.
3. Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install_olcli.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\check_olcli.ps1
```

If `olcli` is not found, close every PowerShell window, open a new one, and run
`olcli --version` again.

## 4. Obtain the cookie on macOS

Sign in at `https://www.overleaf.com/` and leave the tab open.

### Chrome

1. Press **Command–Option–I** (`⌘⌥I`), or use **View → Developer → Developer
   Tools**.
2. Select **Application**. If hidden, click `»`, then **Application**.
3. Expand **Storage → Cookies** and select `https://www.overleaf.com`.
4. Filter for `overleaf_session2`.
5. Select it, double-click **Value**, and press **Command–C** (`⌘C`).
6. Copy only the value. Close tools with **Command–Option–I** if desired.

### Microsoft Edge

Press **Command–Option–I**, then use **Application → Storage → Cookies →
https://www.overleaf.com → overleaf_session2 → Value**.

### Firefox

1. Press **Command–Option–I**, or use **Tools → Browser Tools → Web Developer
   Tools**.
2. Select **Storage** from the `»` menu if necessary.
3. Expand **Cookies**, select `https://www.overleaf.com`, search for
   `overleaf_session2`, and copy its Value with **Command–C**.

### Safari

Safari uses **Command–Option–I** (`⌘⌥I`), the same shortcut as Chrome on Mac.
If it does not open Web Inspector, enable the developer features first:

1. Open **Safari → Settings** (older macOS: **Preferences**) → **Advanced**.
2. Enable **Show features for web developers** or **Show Develop menu in menu
   bar**, depending on the Safari version.
3. Return to Overleaf and press **Command–Option–I** (`⌘⌥I`), or use **Develop → Show
   Web Inspector**.
4. Select the **Storage** tab, expand **Cookies** in the left sidebar, and
   select `www.overleaf.com`.
5. Locate `overleaf_session2` and copy its Value with **Command–C**.

## 5. Obtain the cookie on Windows

Sign in at `https://www.overleaf.com/` first.

### Chrome

1. Press **F12**; laptops may require **Fn–F12**. Alternatively press
   **Ctrl–Shift–I**.
2. Select **Application** from the `»` menu if hidden.
3. Expand **Storage → Cookies** and select `https://www.overleaf.com`.
4. Filter for `overleaf_session2`, double-click Value, and press **Ctrl–C**.

### Microsoft Edge

Press **F12** or **Ctrl–Shift–I**, approve **Open DevTools** if asked, then use
**Application → Storage → Cookies → https://www.overleaf.com**. Filter for
`overleaf_session2` and copy the Value. Do not bypass a managed computer's
administrator policy if DevTools is disabled.

### Firefox

Press **F12** or **Ctrl–Shift–I**, select **Storage** from `»` if hidden, expand
**Cookies**, select Overleaf, search for `overleaf_session2`, and press
**Ctrl–C** on its Value.

## 6. Authenticate without shell-history exposure

### macOS/Linux Terminal

```bash
read -s "OVERLEAF_COOKIE?Paste Overleaf cookie, then press Return: "
echo
printf '%s' "$OVERLEAF_COOKIE" | olcli auth --stdin
unset OVERLEAF_COOKIE
```

Paste with **Command–V** on macOS and press **Return**. No characters appear
while the secret is entered.

### Windows PowerShell

```powershell
$SecureCookie = Read-Host 'Paste Overleaf cookie, then press Enter' -AsSecureString
$OverleafCookie = [Net.NetworkCredential]::new('', $SecureCookie).Password
$OverleafCookie | olcli auth --stdin
$OverleafCookie = $null
$SecureCookie = $null
```

Paste with **Ctrl–V** and press **Enter**. PowerShell hides the secret.

`olcli auth` stores the credential in user configuration. Run `olcli logout` to
clear it. Avoid `--save-local` unless a project-specific `.olauth` is explicitly
wanted and excluded from version control.

## 7. Confirm access

Run `olcli whoami` and `olcli list --limit 5`. Do not perform remote mutations
if these checks fail.
