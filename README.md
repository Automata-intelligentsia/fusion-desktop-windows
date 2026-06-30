# Fusion Desktop for Windows

A working Windows desktop wrapper for [Fusion](https://github.com/Runfusion/Fusion) (Runfusion/Fusion) that launches the web dashboard in a native Electron shell, with the Fusion engine running quietly in the background.

## Why this exists

The official Fusion Desktop Windows installer (versions 0.49.0 and 0.50.0) has a critical bundling bug that prevents the app from starting:

- `Dynamic require of "fs" is not supported`
- `ERR_IMPORT_ATTRIBUTE_MISSING` for JSON imports
- `Local runtime did not become ready in time`

This wrapper sidesteps those issues by using the stable `fusion dashboard` CLI command and embedding it in a lightweight Electron window.

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
