const { app, BrowserWindow, Tray, Menu, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Configuration
const FUSION_PORT = 4040;
const FUSION_HOST = '127.0.0.1';
const FUSION_URL = `http://${FUSION_HOST}:${FUSION_PORT}`;
const STARTUP_TIMEOUT_MS = 120000; // 2 minutes
const HEALTH_CHECK_INTERVAL_MS = 2000;

const WRAPPER_DIR = path.join(os.homedir(), '.fusion-desktop-wrapper');
const CONFIG_FILE = path.join(WRAPPER_DIR, 'config.json');
const LOG_FILE = path.join(WRAPPER_DIR, 'wrapper.log');

let mainWindow = null;
let tray = null;
let splashWindow = null;
let fusionProcess = null;
let healthCheckTimer = null;
let startupTimer = null;
let isQuitting = false;

function ensureWrapperDir() {
  if (!fs.existsSync(WRAPPER_DIR)) {
    fs.mkdirSync(WRAPPER_DIR, { recursive: true });
  }
}

function log(message) {
  ensureWrapperDir();
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, line);
  console.log(line.trim());
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (err) {
    log(`Failed to load config: ${err.message}`);
  }
  return {};
}

function saveConfig(config) {
  try {
    ensureWrapperDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (err) {
    log(`Failed to save config: ${err.message}`);
  }
}

function getProjectRoot() {
  const config = loadConfig();
  if (config.projectRoot && fs.existsSync(config.projectRoot)) {
    return config.projectRoot;
  }
  return null;
}

async function selectProjectDirectory() {
  const result = await dialog.showOpenDialog(splashWindow || mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Fusion Project Directory',
    message: 'Choose a Git repository directory for Fusion to work in',
    defaultPath: os.homedir()
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const selectedPath = result.filePaths[0];
    const config = loadConfig();
    config.projectRoot = selectedPath;
    saveConfig(config);
    return selectedPath;
  }
  return null;
}

function isGitRepository(dir) {
  return fs.existsSync(path.join(dir, '.git'));
}

function findFusionCli() {
  const candidates = [
    path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'fusion.cmd'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'fn.cmd'),
    'fusion',
    'fn'
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return 'fusion';
}

function startFusionEngine(projectRoot) {
  return new Promise((resolve, reject) => {
    const fusionCli = findFusionCli();
    log(`Starting Fusion engine using: ${fusionCli} in ${projectRoot}`);

    const env = { ...process.env };
    env.BROWSER = 'none';
    env.FUSION_SKIP_ONBOARDING = '1';

    const isCmd = fusionCli.endsWith('.cmd');
    const spawnCmd = isCmd ? 'cmd.exe' : fusionCli;
    const spawnArgs = isCmd ? ['/c', fusionCli, 'dashboard', '--no-auth'] : ['dashboard', '--no-auth'];

    fusionProcess = spawn(spawnCmd, spawnArgs, {
      env,
      windowsHide: true,
      cwd: projectRoot
    });

    fusionProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      log(`[Fusion stdout] ${chunk.trim()}`);
    });

    fusionProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      log(`[Fusion stderr] ${chunk.trim()}`);
    });

    fusionProcess.on('error', (err) => {
      log(`Fusion process error: ${err.message}`);
      reject(err);
    });

    fusionProcess.on('exit', (code, signal) => {
      log(`Fusion process exited with code ${code}, signal ${signal}`);
      if (!isQuitting && code !== 0) {
        dialog.showErrorBox('Fusion Engine Stopped', `The Fusion engine stopped unexpectedly (code ${code}). Check the log at ${LOG_FILE}`);
      }
    });

    const startTime = Date.now();
    healthCheckTimer = setInterval(() => {
      checkFusionReady()
        .then(() => {
          clearInterval(healthCheckTimer);
          clearTimeout(startupTimer);
          log('Fusion engine is ready');
          resolve();
        })
        .catch((err) => {
          if (Date.now() - startTime > STARTUP_TIMEOUT_MS) {
            clearInterval(healthCheckTimer);
            clearTimeout(startupTimer);
            reject(new Error(`Fusion engine did not become ready in time. Last error: ${err.message}`));
          }
        });
    }, HEALTH_CHECK_INTERVAL_MS);

    startupTimer = setTimeout(() => {
      clearInterval(healthCheckTimer);
      reject(new Error('Fusion engine startup timed out'));
    }, STARTUP_TIMEOUT_MS);
  });
}

function checkFusionReady() {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const req = http.get(`${FUSION_URL}/api/health`, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve();
      } else if (res.statusCode === 404) {
        resolve();
      } else {
        reject(new Error(`HTTP ${res.statusCode}`));
      }
    });
    req.on('error', reject);
    req.setTimeout(3000, () => {
      req.destroy();
      reject(new Error('Connection timeout'));
    });
  });
}

function createSplashWindow(message = 'Starting Fusion...') {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    resizable: false,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  splashWindow.loadURL(`data:text/html;charset=utf-8,
    <html>
      <head>
        <style>
          body {
            margin: 0;
            width: 400px;
            height: 300px;
            background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            color: white;
            border-radius: 12px;
            overflow: hidden;
          }
          .spinner {
            width: 48px;
            height: 48px;
            border: 4px solid rgba(255,255,255,0.3);
            border-top-color: white;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 24px;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
          h1 { margin: 0 0 12px 0; font-size: 28px; font-weight: 600; }
          p { margin: 0; font-size: 14px; opacity: 0.9; }
        </style>
      </head>
      <body>
        <div class="spinner"></div>
        <h1>Fusion</h1>
        <p id="message">${message}</p>
      </body>
    </html>`);

  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

function updateSplashMessage(message) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.executeJavaScript(`document.getElementById('message').textContent = ${JSON.stringify(message)}`);
  }
}

function closeSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 700,
    title: 'Fusion',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    },
    show: false,
    titleBarStyle: 'default'
  });

  mainWindow.loadURL(FUSION_URL);

  mainWindow.once('ready-to-show', () => {
    closeSplashWindow();
    mainWindow.show();
    if (process.argv.includes('--dev')) {
      mainWindow.webContents.openDevTools();
    }
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(FUSION_URL)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'tray-icon.png');
  tray = new Tray(iconPath);
  tray.setToolTip('Fusion');
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Show Fusion',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Change Project Directory',
      click: async () => {
        const newDir = await selectProjectDirectory();
        if (newDir) {
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Restart Required',
            message: 'Project directory changed. Please restart Fusion Desktop to apply.',
            buttons: ['Restart Now', 'Later']
          }).then(({ response }) => {
            if (response === 0) {
              isQuitting = false;
              app.relaunch();
              app.quit();
            }
          });
        }
      }
    },
    {
      label: 'Open DevTools',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.openDevTools();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit Fusion',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function stopFusionEngine() {
  return new Promise((resolve) => {
    if (!fusionProcess) {
      resolve();
      return;
    }

    log('Stopping Fusion engine...');
    isQuitting = true;

    fusionProcess.kill('SIGTERM');

    const forceKillTimer = setTimeout(() => {
      if (fusionProcess && !fusionProcess.killed) {
        log('Force killing Fusion engine');
        fusionProcess.kill('SIGKILL');
      }
    }, 10000);

    fusionProcess.on('exit', () => {
      clearTimeout(forceKillTimer);
      resolve();
    });
  });
}

app.whenReady().then(async () => {
  try {
    log('Fusion Desktop Wrapper starting...');

    createSplashWindow();

    let projectRoot = getProjectRoot();

    if (!projectRoot) {
      updateSplashMessage('Please select a project directory...');
      projectRoot = await selectProjectDirectory();
      if (!projectRoot) {
        dialog.showErrorBox('No Project Selected', 'Fusion Desktop requires a project directory to run.');
        app.quit();
        return;
      }
    }

    if (!isGitRepository(projectRoot)) {
      const { response } = await dialog.showMessageBox(splashWindow, {
        type: 'warning',
        title: 'Not a Git Repository',
        message: `The selected directory is not a Git repository:\n${projectRoot}\n\nFusion task execution requires a Git repository.`,
        buttons: ['Select Different Directory', 'Continue Anyway', 'Cancel'],
        defaultId: 0
      });

      if (response === 0) {
        projectRoot = await selectProjectDirectory();
        if (!projectRoot) {
          app.quit();
          return;
        }
      } else if (response === 2) {
        app.quit();
        return;
      }
    }

    updateSplashMessage('Starting Fusion engine...');
    await startFusionEngine(projectRoot);

    updateSplashMessage('Loading dashboard...');
    createWindow();
    createTray();
  } catch (err) {
    log(`Failed to start: ${err.message}`);
    closeSplashWindow();
    dialog.showErrorBox('Failed to Start Fusion', err.message);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // Keep running in tray
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
  }
});

app.on('before-quit', async (event) => {
  if (fusionProcess) {
    event.preventDefault();
    await stopFusionEngine();
    app.quit();
  }
});

app.on('quit', () => {
  log('Fusion Desktop Wrapper quitting');
});
