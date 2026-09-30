# SensitiveScanner

企业本地敏感信息扫描工具第二阶段完整版。项目使用 Electron + Vue 3 + TypeScript + TailwindCSS + Vite + electron-builder，支持 Windows/macOS 双平台打包，内置 OCR、Office/PDF 解析与 TXT/HTML 报告输出。

## 功能概览

- 普通用户安装后即可使用，不需要 Node.js、Python、rg/rga、Tesseract、Homebrew、scoop/choco。
- 扫描桌面常用目录，也支持用户自选目录。
- 支持 `txt/md/markdown/html/htm/csv/tsv/json/yaml/yml/env/log/xml/ini/conf/sql/js/ts/vue/css/docx/xlsx/pptx/pdf/png/jpg/jpeg` 等常见文本、Office、PDF 和图片文件。
- 支持文件名检测；即使文件内容类型暂不解析，只要文件名命中敏感词，也会进入报告。
- 支持无扩展名 UTF-8 文本文件嗅探，例如 macOS 下名为 `敏感测试` 的纯文本文件。
- 纯本地 OCR，默认支持中英文。
- 风险等级分为高危、中危、低危。
- 自动生成 `reports/*.txt` 与 `reports/*.html`，并在扫描完成后自动打开 HTML 报告与 `reports/` 目录。

## 项目结构

```text
project/
├── binaries/                 # 运行时二进制由使用者按目标平台准备
│   ├── mac/
│   └── win/
├── electron/
├── scanner/
├── src/
├── shared/
├── rules/
├── reports/
├── public/
├── package.json
├── electron-builder.json
└── README.md
```

## 开发者准备事项

你只需要安装 Node.js 与 pnpm 来进行开发构建；普通最终用户不需要任何环境。

本公开源码副本不包含 `rg`、Tesseract 和 OCR 语言包等平台二进制文件。首次运行需要按下方说明自行放入对应目录；这些文件因体积和平台许可因素不随源码发布。

### Windows

下载并放入：

- `binaries/win/rg.exe`
  - 来源: [ripgrep releases](https://github.com/BurntSushi/ripgrep/releases)
- `binaries/win/tesseract.exe`
  - 来源: [UB Mannheim Tesseract](https://github.com/UB-Mannheim/tesseract/wiki)
- `binaries/win/tessdata/eng.traineddata`
- `binaries/win/tessdata/chi_sim.traineddata`

### macOS

下载并放入：

- `binaries/mac/rg`
  - 来源: [ripgrep releases](https://github.com/BurntSushi/ripgrep/releases)
- `binaries/mac/tesseract`
  - 可先通过 `brew install tesseract` 获取，再把 `which tesseract` 对应文件复制到 `binaries/mac/`
- `binaries/mac/tessdata/eng.traineddata`
- `binaries/mac/tessdata/chi_sim.traineddata`

### OCR 语言包

将以下文件放入各平台对应的 `tessdata/` 目录：

- `eng.traineddata`
- `chi_sim.traineddata`

## 安装与构建

```bash
pnpm install
pnpm run build
```

也可以使用 npm：

```bash
npm install
npm run build
```

构建完成后会在 `release/` 目录看到：

- Windows: `SensitiveScanner Setup.exe`
- macOS: `SensitiveScanner.dmg`
- macOS App Bundle: `SensitiveScanner.app`

## 开发运行

```bash
pnpm install
pnpm run dev:electron
```

## 扫描实现说明

- 文本文件: 优先使用内置 `rg` 快速读取，再用 Node.js 做关键词命中与上下文截取。
- 文件名: 对所有被枚举到的文件执行关键词检测，并在报告中标记为 `文件名`。首页可切换为“仅按文件名查找”，该模式不会打开文件内容，适合大型目录或 NAS 路径的快速排查。
- 目录枚举: 扫描引擎边发现边处理文件，不再等待完整目录树枚举结束；遇到 15 秒无响应的目录或文件系统信息读取会跳过并继续后续路径。
- 命中位置: 文本、PDF、Office、OCR 解析出的文本会在报告中标记内容行号；文件名命中会单独标记为文件名问题。
- `docx`: `mammoth`
- `xlsx`: `exceljs`
- `pptx`: `pptxjs`，并带有兜底文本读取逻辑
- `pdf`: `pdf-parse`
- 图片 OCR: `node-tesseract-ocr` + 内置 `tesseract` + `tessdata`

## 风险规则

默认关键词位于 [rules/keywords.txt](rules/keywords.txt)。

如果开发者要永久调整默认规则，请直接编辑 `rules/keywords.txt`，每行一个关键词，然后重新执行 `pnpm run build` 打包。软件首页的“扫描参数”区域也提供“自定义关键词”输入框，普通用户可以每行输入一个词，或用逗号/分号分隔；这些词只对本次扫描生效，并会与默认关键词合并去重。

高危关键词包括：

- `password`
- `secret_key`
- `token`
- `apikey`
- `AKIA`

中危关键词包括：

- `合同`
- `客户`
- `报价`
- `投标`
- `数据库`

低危关键词包括：

- `内部`
- `保密`

## 说明与建议

- 首次构建前请确认二进制文件具有执行权限，尤其是 macOS 下的 `binaries/mac/rg` 与 `binaries/mac/tesseract`。
- 如果你计划发布签名包，可继续在 `electron-builder.json` 中补充签名与 notarization 配置。
- 本项目已满足 `contextIsolation: true`、`nodeIntegration: false`，并通过 `preload.ts + contextBridge + ipcMain/ipcRenderer` 进行桥接。
