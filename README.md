# AI Factory Desktop for Windows

A Windows desktop wrapper that launches **Fusion** and **Paperclip** together in native Electron windows. Built for people who want the "office" (Fusion) and the "agent team" (Paperclip) running side by side without separate terminal windows or browser tabs.

## Why this exists

- **Fusion** (Runfusion/Fusion) is an AI-orchestrated development task board. Its official Windows desktop installer currently has a bundling bug that prevents it from launching on Windows (reported as [Runfusion/Fusion #1828](https://github.com/Runfusion/Fusion/issues/1828)).
- **Paperclip** is an open-source platform for running AI agents, but its native desktop app is macOS-only. The Windows experience is CLI-based.
- This wrapper solves both problems: it quietly starts the Fusion and Paperclip engines in the background and opens each dashboard in its own native window with a system tray.

## What it does

1. **Checks for updates** on launch and asks before installing them.
2. **Starts the Fusion engine** (`fn dashboard --no-auth`) on `http://localhost:4040`.
3. **Starts the Paperclip engine** (`paperclipai run --data-dir ~/.paperclip-factory`) on `http://localhost:3100`.
4. **Opens two Electron windows** — one for Fusion, one for Paperclip.
5. **Minimizes to tray** instead of closing.
6. **Detects already-running engines** and connects to them instead of failing.

## Who should use this

Windows users who want:
- A single launcher for both Fusion and Paperclip
- A native desktop feel (windows, tray, icons) instead of browser tabs
- The engines to stay alive and reachable without keeping a terminal open

## Prerequisites

- Windows 10/11
- [Node.js](https://nodejs.org/) (v20+)
- Fusion CLI installed: `npm install -g @runfusion/fusion`
- Paperclip CLI installed: `npm install -g paperclipai`
- Both CLIs on your PATH

## Installation

Download the latest portable executable from the [Releases](https://github.com/Automata-intelligentsia/fusion-desktop-windows/releases) page and run it. No install required.

Or build from source:

```bash
cd ai-factory-desktop
npm install
npm run build:portable
```

The portable executable will be in `dist/AI-Factory-Desktop-2.0.0-portable.exe`.

## First run

On first launch, the app will ask you to pick a Fusion project directory. This should be a Git repository. The choice is saved to `~/.ai-factory-desktop/config.json` and reused on future launches. You can change it later from the tray menu.

## Configuration

- `~/.ai-factory-desktop/config.json` — stores the selected Fusion project root
- `~/.ai-factory-desktop/wrapper.log` — runtime logs from both engines
- `~/.paperclip-factory/` — isolated Paperclip data directory used by the wrapper

## Update behavior

When the app starts, it checks the npm registry for newer versions of `@runfusion/fusion` and `paperclipai`. If a newer version is available, it shows a dialog asking whether to update. Updates are never automatic.

## Development

```bash
npm install
npm run dev
```

## Differences from the original Fusion-only wrapper

This repo evolved from a standalone Fusion desktop wrapper. The current version is a combined "AI Factory" launcher that also includes Paperclip support.

## Disclaimer

This is an unofficial community wrapper. It is not affiliated with Runfusion or Paperclip. Use at your own risk. No personal data, API keys, or project files are included in the repository.

## License

MIT
