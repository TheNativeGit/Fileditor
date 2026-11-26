# Contributing to Fileditor

Thank you for your interest in **Fileditor**!

Fileditor is a personal open-source hobby project maintained in spare time. While the `main` branch is read-only and curated by the maintainer, bug reports, feature suggestions, and well-scoped pull requests are welcome.

---

## Ways to Contribute

### 1. Reporting Bugs & Suggesting Features
- Open an issue using our **[Issue Templates](https://github.com/TheNativeGit/Fileditor/issues/new/choose)**.
- Include your Fileditor version, Windows version, exact steps to reproduce, and minimal sample data if applicable.

### 2. Submitting Pull Requests
For larger changes or new features, please **open an issue first** to discuss whether the change fits the scope of Fileditor before spending time on an implementation.

1. Fork the repository and create a feature branch.
2. Install dependencies and verify your changes locally:
   ```bash
   npm install
   npm run build
   cd src-tauri && cargo test
   ```
3. Keep pull requests focused, small, and dependency-light:
   - Do **not** add external runtime CDN calls, telemetry, or analytics.
   - Maintain translations across `src/i18n/locales/en.json`, `de.json`, and `es.json` for any new UI text.
   - Ensure all Markdown/HTML rendering passes through `DOMPurify` and respects the strict CSP in `src-tauri/tauri.conf.json`.

---

## License of Contributions

By submitting a pull request or patch to this repository, you agree that your contribution will be licensed under the project's **[MIT License](./LICENSE)**.
