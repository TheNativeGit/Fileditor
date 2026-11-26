# Third-Party Open Source Notices

**Fileditor** is licensed under the [MIT License](./LICENSE) (`Copyright (c) 2026 NativeProduction`).

Fileditor incorporates and builds upon open-source software and fonts created by the community. We gratefully acknowledge the authors and maintainers of the following packages and crates.

---

## 1. Direct Dependencies & Bundled Fonts

| Component / Package | Purpose | License | Copyright / Project URL |
| :--- | :--- | :--- | :--- |
| **Tauri** (`tauri`, `tauri-build`, `@tauri-apps/api`, `@tauri-apps/cli`) | Desktop application framework | MIT OR Apache-2.0 | Copyright (c) 2019–present Tauri Programme within The Commons Conservancy ([tauri.app](https://tauri.app)) |
| **Tauri Plugins** (`tauri-plugin-log`, `tauri-plugin-single-instance`, `tauri-plugin-updater`, `tauri-plugin-process`) | Logging, single-instance IPC, cryptographic updater & relaunch | MIT OR Apache-2.0 | Copyright (c) Tauri Programme within The Commons Conservancy ([github.com/tauri-apps/plugins-workspace](https://github.com/tauri-apps/plugins-workspace)) |
| **React & React DOM** (`react`, `react-dom`) | User interface library | MIT | Copyright (c) Meta Platforms, Inc. and affiliates ([react.dev](https://react.dev)) |
| **Monaco Editor** (`monaco-editor`, `@monaco-editor/react`) | Code editor engine & React wrapper | MIT | Copyright (c) Microsoft Corporation / Suren Atoyan ([microsoft.github.io/monaco-editor](https://microsoft.github.io/monaco-editor/)) |
| **Ant Design** (`antd`, `@ant-design/icons`) | UI component library | MIT | Copyright (c) 2015–present Ant UED ([ant.design](https://ant.design)) |
| **Ajv** (`ajv`) | JSON Schema & JTD validator | MIT | Copyright (c) 2015–2021 Evgeny Poberezkin ([ajv.js.org](https://ajv.js.org)) |
| **DOMPurify** (`dompurify`) | HTML & XSS sanitizer | MPL-2.0 OR Apache-2.0 | Copyright (c) 2015 Mario Heiderich, Cure53 ([github.com/cure53/DOMPurify](https://github.com/cure53/DOMPurify)) |
| **Zustand** (`zustand`) | State management | MIT | Copyright (c) 2019 Paul Henschel ([github.com/pmndrs/zustand](https://github.com/pmndrs/zustand)) |
| **Lucide** (`lucide-react`) | Icon set | ISC | Copyright (c) Cole Bemis & Lucide Contributors ([lucide.dev](https://lucide.dev)) |
| **Tailwind CSS** (`tailwindcss`, `postcss`, `autoprefixer`) | Utility-first CSS framework | MIT | Copyright (c) Tailwind Labs, Inc. ([tailwindcss.com](https://tailwindcss.com)) |
| **uppsala** | Rust XML 1.0, XSD & XPath engine | BSD-2-Clause | Copyright (c) Kushal Das and contributors ([github.com/kushaldas/uppsala](https://github.com/kushaldas/uppsala)) |
| **rfd** | Native Rust file dialogs | MIT | Copyright (c) PolyMeilex ([github.com/PolyMeilex/rfd](https://github.com/PolyMeilex/rfd)) |
| **serde & serde_json** | Rust serialization framework | MIT OR Apache-2.0 | Copyright (c) Erick Tryzelaar, David Tolnay ([serde.rs](https://serde.rs)) |
| **chrono** | Rust date and time library | MIT OR Apache-2.0 | Copyright (c) Kang Seonghoon and contributors ([github.com/chronotope/chrono](https://github.com/chronotope/chrono)) |
| **log** | Rust logging facade | MIT OR Apache-2.0 | Copyright (c) The Rust Project Developers ([github.com/rust-lang/log](https://github.com/rust-lang/log)) |
| **windows-sys** | Rust bindings for Windows APIs | MIT OR Apache-2.0 | Copyright (c) Microsoft Corporation ([github.com/microsoft/windows-rs](https://github.com/microsoft/windows-rs)) |
| **Plus Jakarta Sans** (`@fontsource/plus-jakarta-sans`) | Bundled UI typeface | SIL OFL-1.1 | Copyright (c) 2020 Tokotype ([github.com/tokotype/PlusJakartaSans](https://github.com/tokotype/PlusJakartaSans)) |
| **JetBrains Mono** (`@fontsource/jetbrains-mono`) | Bundled monospace editor typeface | SIL OFL-1.1 | Copyright (c) 2020 JetBrains s.r.o. ([github.com/JetBrains/JetBrainsMono](https://github.com/JetBrains/JetBrainsMono)) |
| **Vite & TypeScript** (`vite`, `@vitejs/plugin-react`, `typescript`) | Build & compiler toolchain | MIT / Apache-2.0 | Evan You & Vite Contributors / Microsoft Corporation |

---

## 2. Third-Party License Texts & Required Notices

### 2.1 MIT License
*(Applies to MIT-licensed packages and dual-licensed `MIT OR Apache-2.0` packages elected under MIT)*

```text
Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

---

### 2.2 Apache License 2.0 & Dual-Licensed MPL-2.0 / Apache-2.0 Notice (`DOMPurify`)
`DOMPurify` (Copyright 2015 Mario Heiderich, Cure53) is dual-licensed under the **Apache License, Version 2.0** or the **Mozilla Public License Version 2.0 (MPL-2.0)** and is used in Fileditor under the **Apache License 2.0** (unmodified source code is also publicly available at `https://github.com/cure53/DOMPurify`).

```text
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

---

### 2.3 BSD 2-Clause License (`uppsala`)

```text
Copyright (c) Kushal Das and contributors. All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

---

### 2.4 BSD 3-Clause License *(Transitive Rust / JavaScript Components)*

```text
Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software without
   specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

---

### 2.5 ISC License (`lucide-react`)

```text
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of
Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors
2022.

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
```

---

### 2.6 SIL Open Font License 1.1 (`Plus Jakarta Sans` & `JetBrains Mono`)

- **Plus Jakarta Sans** — Copyright (c) 2020 Tokotype (`https://github.com/tokotype/PlusJakartaSans`), with Reserved Font Name "Plus Jakarta Sans".
- **JetBrains Mono** — Copyright (c) 2020 JetBrains s.r.o. (`https://github.com/JetBrains/JetBrainsMono`).

Both font families are bundled unmodified under the **SIL Open Font License, Version 1.1**. The full text of the SIL Open Font License 1.1 is available at `https://openfontlicense.org/open-font-license-official-text/`.
