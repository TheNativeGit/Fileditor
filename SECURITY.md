# Security Policy

## Supported Versions

Only the latest published release of **Fileditor** receives security updates.

| Version | Supported |
| :--- | :--- |
| Latest (`>= 1.0.0`) | :white_check_mark: Yes |
| Older versions | :x: No |

---

## Reporting a Vulnerability

Please **do not** report security vulnerabilities through public GitHub issues.

Instead, please use **GitHub Private Vulnerability Reporting**:
- Navigate to **[Security -> Report a vulnerability](https://github.com/TheNativeGit/Fileditor/security/advisories/new)** on this repository and submit the details privately.

Please include:
1. Affected version of Fileditor and Windows version.
2. A clear description of the vulnerability and potential impact.
3. Minimal reproduction steps or a sample input file (`.md`, `.json`, `.xml`, `.todo`).

Because Fileditor is maintained as a solo spare-time open-source project, reports are reviewed on a best-effort basis, with priority given to any issue involving arbitrary code execution, XSS, or path traversal.

---

## Security Architecture Highlights

- **Offline-First & Zero Telemetry**: Fonts and Monaco Editor workers are bundled locally; no user content or analytics are sent to external servers.
- **Strict Content Security Policy (CSP)**: External script execution is blocked, and `withGlobalTauri` is disabled in favor of explicit `@tauri-apps/api` IPC bindings.
- **Markdown Sanitization**: All rendered Markdown preview and print HTML is sanitized via `DOMPurify`.
- **Safe OS Launching**: External links are strictly restricted to `http://` and `https://` via Win32 `ShellExecuteW` (never `cmd.exe`), and direct execution of local executable/script extensions from document links is blocked.
- **Signed Updates**: In-app updates via `tauri-plugin-updater` verify cryptographic Ed25519/Minisign signatures before installation.
