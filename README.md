# Fusion Desktop for Windows

A working Windows desktop wrapper for [Fusion](https://github.com/Runfusion/Fusion) (Runfusion/Fusion) that launches the web dashboard in a native Electron shell, with the Fusion engine running quietly in the background.

## Why this exists

The official Fusion Desktop Windows installer (versions 0.49.0 and 0.50.0) has a critical bundling bug that prevents the app from starting on Windows:

- `Dynamic require of "fs" is not supported`
- `ERR_IMPORT_ATTRIBUTE_MISSING` for JSON imports
- `Local runtime did not become ready in time`

These errors come from the official Electron build's bundler misconfiguration (ESM output with CJS `require()` dependencies). The Fusion CLI's `fusion dashboard` command works fine on Windows, but the packaged desktop app does not.

This wrapper was created to give Windows users a working desktop experience **today**, without waiting for an upstream fix. It sidesteps the broken installer by using the stable `fusion dashboard` CLI command and embedding it in a lightweight Electron window.

## Who should use this

Use this wrapper if:

- You want to run Fusion on Windows with a native desktop window (not a browser tab)
- The official Fusion Desktop installer crashes or shows the errors listed above
- You already have the Fusion CLI installed and working
- You are comfortable running an unofficial community wrapper while waiting for an official fix

**Do not use this** if you expect official Runfusion support, code signing, or auto-updates. For the official experience, follow [Runfusion/Fusion issue #1828](https://github.com/Runfusion/Fusion/issues/1828) and use the official build once it is fixed.

## Features

- ✅ Native Windows desktop window (not a browser tab)
- ✅ Starts the Fusion engine silently in the background
- ✅ Splash screen while the engine boots
- ✅ Project directory picker on first launch
- ✅ Remembers your project directory
- ✅ System tray icon with show/hide/quit menu
- ✅ Clean shutdown — kills the Fusion engine on quit
- ✅ External links open in your default browser

## Requirements

- Windows 10 or 11
- [Fusion CLI](https://github.com/Runfusion/Fusion) installed globally (`npm install -g @runfusion/fusion`)
- A Git repository to use as your Fusion project directory

## Download

Grab the latest portable executable or installer from the [Releases](https://github.com/Automata-intelligentsia/fusion-desktop-windows/releases) page.

## Usage

1. Run `Fusion-Desktop-Wrapper-<version>-portable.exe`
2. Select your Fusion project directory (a Git repo)
3. Wait for the splash screen
4. Fusion dashboard opens in a native window

To change the project directory later, right-click the system tray icon and select **Change Project Directory**.

## Building from source

```bash
npm install
npm run build        # Build installer + portable
npm run build:portable  # Build portable only
```

## How it works

The wrapper spawns `fusion dashboard --no-auth` with a hidden console window, waits for `http://127.0.0.1:4040` to become reachable, then loads that URL in an Electron `BrowserWindow`.

## Disclaimer

This is an unofficial community wrapper. It is not affiliated with or endorsed by Runfusion. All Fusion functionality, trademarks, and intellectual property belong to Runfusion.

## License

MIT
