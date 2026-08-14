# DeepSeek Harness TUI npm 发行版

[English](README.md) | 中文

本目录负责该 fork 的非 scoped npm 发行版。生成的包会以 `tui` 模式运行真实构建产物 `@deepseek-ai/dsh` CLI；用户无需克隆本仓库或构建原生依赖。

## 安装并运行

需要 Node.js `^22.19` 或 `>=24`。

```sh
npx --yes deepseek-harness-tui@latest
npx --yes deepseek-harness-tui@latest --theme sakura
```

为保持兼容，也接受一个可选的前导 `tui`：

```sh
npx --yes deepseek-harness-tui@latest tui --resume <session-id>
```

全局安装方式如下：

```sh
npm install --global deepseek-harness-tui@latest
dsh-tui --theme sakura
deepseek-harness-tui --resume <session-id>
```

两个 bin 会启动同一程序并转发全部参数。

## 包布局

`deepseek-harness-tui` 是一个小型 meta 包，通过精确版本的 optional dependencies 依赖当前平台对应的原生包：

| 宿主 | 包 |
|---|---|
| macOS arm64 | `deepseek-harness-tui-darwin-arm64` |
| macOS x64 | `deepseek-harness-tui-darwin-x64` |
| Linux arm64 | `deepseek-harness-tui-linux-arm64` |
| Linux x64 | `deepseek-harness-tui-linux-x64` |
| Windows x64 | `deepseek-harness-tui-win32-x64` |

每个平台包都包含在对应 OS 与架构上生成的生产 `pnpm deploy` 闭包。launcher 使用 `process.execPath` 执行暂存的 JavaScript CLI；安装过程不下载、不编译，也不解压 SEA。

## 构建并验证

签入的 [manifest](manifest.json)负责公开包名、版本、engines、描述、许可证和仓库元数据。生成的包目录与 tarball 保存在 `.artifacts/` 下，不作为 workspace 成员。

```sh
pnpm run pack:npm-tui
pnpm run pack:npm-tui -- --platform linux --arch x64 --platform-only
pnpm run pack:npm-tui -- --meta-only
pnpm run verify:npm-tui-packed-install
```

宿主默认构建与本机匹配的平台 tarball 和 meta tarball。packed-install 冒烟测试依赖这些构建产物：它会把两个 tarball 安装进隔离项目，通过 PTY 启动 `dsh-tui --theme sakura`，等待 Sakura composer 出现，再通过 `/quit` 干净退出。
