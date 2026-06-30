const { app, BrowserWindow, Tray, Menu, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');
const net = require('net');

// Configuration
const FUSION_PORT = 4040;
const PAPERCLIP_PORT = 3100;
const HOST = '127.0.0.1';
const FUSION_URL = `http://${HOST}:${FUSION_PORT}`;
const PAPERCLIP_URL = `http://${HOST}:${PAPERCLIP_PORT}`;
const STARTUP_TIMEOUT_MS = 180000; // 3 minutes

const WRAPPER_DIR = path.join(os.homedir(), '.ai-factory-desktop');
const CONFIG_FILE = path.join(WRAPPER_DIR, 'config.json');
const LOG_FILE = path.join(WRAPPER_DIR, 'wrapper.log');

// Isolated Paperclip data dir to avoid conflicts with other Paperclip instances
const PAPERCLIP_DATA_DIR = path.join(os.homedir(), '.paperclip-factory');

let fusionWindow = null;
let paperclipWindow = null;
let tray = null;
let splashWindow = null;
let fusionProcess = null;
let paperclipProcess = null;
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

function getDefaultProjectPath() {
  // Prefer the wrapper's own repo as a safe default
  const wrapperDir = __dirname;
  if (fs.existsSync(path.join(wrapperDir, '.git'))) {
    return wrapperDir;
  }
  return os.homedir();
}

async function ensureProjectRoot() {
  let projectRoot = getProjectRoot();
  if (projectRoot) {
    log(`Using configured project root: ${projectRoot}`);
    return projectRoot;
  }

  const defaultPath = getDefaultProjectPath();
  log(`No project root configured. Prompting with default: ${defaultPath}`);
  updateSplashMessage('Select a Fusion project directory...');

  const result = await dialog.showOpenDialog(splashWindow, {
    properties: ['openDirectory'],
    title: 'Select Fusion Project Directory',
    message: 'Choose a Git repository directory for Fusion to work in',
    defaultPath
  });

  if (!result.canceled && result.filePaths.length > 0) {
    projectRoot = result.filePaths[0];
    const config = loadConfig();
    config.projectRoot = projectRoot;
    saveConfig(config);
    log(`Project root set to: ${projectRoot}`);
    return projectRoot;
  }

  return null;
}

async function changeProjectDirectory() {
  const defaultPath = getProjectRoot() || getDefaultProjectPath();
  const result = await dialog.showOpenDialog(splashWindow || fusionWindow, {
    properties: ['openDirectory'],
    title: 'Change Fusion Project Directory',
    message: 'Choose a Git repository directory for Fusion to work in',
    defaultPath
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const newDir = result.filePaths[0];
    const config = loadConfig();
    config.projectRoot = newDir;
    saveConfig(config);

    dialog.showMessageBox(fusionWindow || paperclipWindow, {
      type: 'info',
      title: 'Restart Required',
      message: 'Project directory changed. Please restart AI Factory to apply.',
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

function isGitRepository(dir) {
  return fs.existsSync(path.join(dir, '.git'));
}

function updateSplashMessage(message) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.executeJavaScript(
      `document.getElementById('message').textContent = ${JSON.stringify(message)}`
    );
  }
}

function closeSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
}

function createSplashWindow(message = 'Starting AI Factory...') {
  splashWindow = new BrowserWindow({
    width: 500,
    height: 320,
    frame: true,
    alwaysOnTop: false,
    transparent: false,
    resizable: false,
    movable: true,
    minimizable: true,
    title: 'AI Factory Desktop',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const html = `<html>
    <head>
      <style>
        body {
          margin: 0;
          width: 500px;
          height: 320px;
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
        .apps { margin-top: 16px; font-size: 12px; opacity: 0.7; }
      </style>
    </head>
    <body>
      <div class="spinner"></div>
      <h1>AI Factory</h1>
      <p id="message">${message}</p>
      <div class="apps">Fusion + Paperclip</div>
    </body>
  </html>`;

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Port / process checks
// ─────────────────────────────────────────────────────────────────────────────

function isPortReachable(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(3000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      resolve(false);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, HOST);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Update checking
// ─────────────────────────────────────────────────────────────────────────────

function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const isCmd = cmd.endsWith('.cmd');
    const spawnCmd = isCmd ? 'cmd.exe' : cmd;
    const spawnArgs = isCmd ? ['/c', cmd, ...args] : args;

    log(`Running: ${cmd} ${args.join(' ')}`);
    const child = spawn(spawnCmd, spawnArgs, {
      windowsHide: true,
      env: { ...process.env },
      ...options
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      log(`[${path.basename(cmd)} stdout] ${data.toString().trim()}`);
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
      log(`[${path.basename(cmd)} stderr] ${data.toString().trim()}`);
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0 && !options.ignoreError) {
        reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
      } else {
        resolve({ code, stdout, stderr });
      }
    });
  });
}

function findCommand(name) {
  const candidates = [
    path.join(os.homedir(), 'AppData', 'Roaming', 'npm', `${name}.cmd`),
    path.join(os.homedir(), 'AppData', 'Roaming', 'npm', `${name}.exe`),
    name
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return name;
}

function getLatestNpmVersion(packageName) {
  return new Promise((resolve, reject) => {
    const url = `https://registry.npmjs.org/${packageName}/latest`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.version);
        } catch (err) {
          reject(new Error(`Failed to parse npm registry response: ${err.message}`));
        }
      });
    }).on('error', reject).setTimeout(10000, () => reject(new Error('npm registry timeout')));
  });
}

async function getFusionLocalVersion() {
  try {
    const result = await runCommand(findCommand('fn'), ['--version'], { ignoreError: true });
    return result.stdout.trim();
  } catch (err) {
    log(`Failed to get Fusion version: ${err.message}`);
    return null;
  }
}

async function getPaperclipLocalVersion() {
  try {
    const result = await runCommand(findCommand('paperclipai'), ['--version'], { ignoreError: true });
    return result.stdout.trim();
  } catch (err) {
    log(`Failed to get Paperclip version: ${err.message}`);
    return null;
  }
}

async function promptUpdate(toolName, localVersion, latestVersion) {
  const result = await dialog.showMessageBox(splashWindow, {
    type: 'question',
    title: `${toolName} Update Available`,
    message: `A new version of ${toolName} is available.\n\nCurrent: ${localVersion}\nLatest: ${latestVersion}\n\nUpdate now?`,
    buttons: ['Update', 'Skip'],
    defaultId: 0,
    cancelId: 1
  });
  return result.response === 0;
}

async function checkAndUpdateFusion() {
  const local = await getFusionLocalVersion();
  if (!local) {
    log('Fusion not installed; skipping update check');
    return { updated: false, local: null, latest: null };
  }

  log(`Fusion local version: ${local}`);
  updateSplashMessage(`Checking Fusion updates... (v${local})`);

  try {
    const latest = await getLatestNpmVersion('@runfusion/fusion');
    log(`Fusion latest version: ${latest}`);

    if (local !== latest) {
      const shouldUpdate = await promptUpdate('Fusion', local, latest);
      if (shouldUpdate) {
        updateSplashMessage(`Updating Fusion ${local} -> ${latest}...`);
        await runCommand(findCommand('fn'), ['update'], { timeout: 120000 });
        log('Fusion update completed');
        return { updated: true, local, latest };
      } else {
        log('Fusion update skipped by user');
      }
    } else {
      log('Fusion is up to date');
    }

    return { updated: false, local, latest };
  } catch (err) {
    log(`Fusion update check failed: ${err.message}`);
    return { updated: false, local, latest: null, error: err.message };
  }
}

async function checkAndUpdatePaperclip() {
  const local = await getPaperclipLocalVersion();
  if (!local) {
    log('Paperclip not installed; skipping update check');
    return { updated: false, local: null, latest: null };
  }

  log(`Paperclip local version: ${local}`);
  updateSplashMessage(`Checking Paperclip updates... (v${local})`);

  try {
    const latest = await getLatestNpmVersion('paperclipai');
    log(`Paperclip latest version: ${latest}`);

    if (local !== latest) {
      const shouldUpdate = await promptUpdate('Paperclip', local, latest);
      if (shouldUpdate) {
        updateSplashMessage(`Updating Paperclip ${local} -> ${latest}...`);
        await runCommand(findCommand('npm'), ['install', '-g', 'paperclipai@latest'], { timeout: 180000 });
        log('Paperclip update completed');
        return { updated: true, local, latest };
      } else {
        log('Paperclip update skipped by user');
      }
    } else {
      log('Paperclip is up to date');
    }

    return { updated: false, local, latest };
  } catch (err) {
    log(`Paperclip update check failed: ${err.message}`);
    return { updated: false, local, latest: null, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine management
// ─────────────────────────────────────────────────────────────────────────────

function waitForPort(port, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const tryConnect = () => {
      const req = http.get(`http://${HOST}:${port}/`, () => {
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Port ${port} did not become ready in time`));
        } else {
          setTimeout(tryConnect, 2000);
        }
      });
      req.setTimeout(3000, () => {
        req.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Port ${port} connection timed out`));
        } else {
          setTimeout(tryConnect, 2000);
        }
      });
    };

    tryConnect();
  });
}

async function startFusionEngine(projectRoot) {
  const alreadyRunning = await isPortReachable(FUSION_PORT);
  if (alreadyRunning) {
    log('Fusion engine already running on port 4040');
    return;
  }

  return new Promise((resolve, reject) => {
    const fusionCli = findCommand('fusion');
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
      log(`[Fusion stdout] ${data.toString().trim()}`);
    });

    fusionProcess.stderr.on('data', (data) => {
      log(`[Fusion stderr] ${data.toString().trim()}`);
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

    waitForPort(FUSION_PORT, STARTUP_TIMEOUT_MS)
      .then(() => {
        log('Fusion engine is ready');
        resolve();
      })
      .catch(reject);
  });
}

async function startPaperclipEngine() {
  const alreadyRunning = await isPortReachable(PAPERCLIP_PORT);
  if (alreadyRunning) {
    log('Paperclip engine already running on port 3100');
    return;
  }

  return new Promise((resolve, reject) => {
    const paperclipCli = findCommand('paperclipai');
    log(`Starting Paperclip engine using: ${paperclipCli}`);

    const env = { ...process.env };
    env.BROWSER = 'none';

    if (!fs.existsSync(PAPERCLIP_DATA_DIR)) {
      fs.mkdirSync(PAPERCLIP_DATA_DIR, { recursive: true });
    }

    const isCmd = paperclipCli.endsWith('.cmd');
    const spawnCmd = isCmd ? 'cmd.exe' : paperclipCli;
    const spawnArgs = isCmd
      ? ['/c', paperclipCli, 'run', '--data-dir', PAPERCLIP_DATA_DIR]
      : ['run', '--data-dir', PAPERCLIP_DATA_DIR];

    paperclipProcess = spawn(spawnCmd, spawnArgs, {
      env,
      windowsHide: true,
      cwd: os.homedir()
    });

    paperclipProcess.stdout.on('data', (data) => {
      log(`[Paperclip stdout] ${data.toString().trim()}`);
    });

    paperclipProcess.stderr.on('data', (data) => {
      log(`[Paperclip stderr] ${data.toString().trim()}`);
    });

    paperclipProcess.on('error', (err) => {
      log(`Paperclip process error: ${err.message}`);
      reject(err);
    });

    paperclipProcess.on('exit', (code, signal) => {
      log(`Paperclip process exited with code ${code}, signal ${signal}`);
      if (!isQuitting && code !== 0) {
        dialog.showErrorBox('Paperclip Engine Stopped', `The Paperclip engine stopped unexpectedly (code ${code}). Check the log at ${LOG_FILE}`);
      }
    });

    waitForPort(PAPERCLIP_PORT, STARTUP_TIMEOUT_MS)
      .then(() => {
        log('Paperclip engine is ready');
        resolve();
      })
      .catch(reject);
  });
}

function createFusionWindow() {
  fusionWindow = new BrowserWindow({
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
    show: false
  });

  fusionWindow.loadURL(FUSION_URL);

  fusionWindow.once('ready-to-show', () => {
    fusionWindow.show();
  });

  fusionWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      fusionWindow.hide();
    }
  });

  fusionWindow.on('closed', () => {
    fusionWindow = null;
  });

  fusionWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  fusionWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(FUSION_URL)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

function createPaperclipWindow() {
  paperclipWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 700,
    title: 'Paperclip',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    },
    show: false
  });

  paperclipWindow.loadURL(PAPERCLIP_URL);

  paperclipWindow.once('ready-to-show', () => {
    paperclipWindow.show();
    closeSplashWindow();
  });

  paperclipWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      paperclipWindow.hide();
    }
  });

  paperclipWindow.on('closed', () => {
    paperclipWindow = null;
  });

  paperclipWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  paperclipWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(PAPERCLIP_URL)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'tray-icon.png');
  tray = new Tray(iconPath);
  tray.setToolTip('AI Factory');
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Show Fusion',
      click: () => {
        if (fusionWindow) {
          fusionWindow.show();
          fusionWindow.focus();
        }
      }
    },
    {
      label: 'Show Paperclip',
      click: () => {
        if (paperclipWindow) {
          paperclipWindow.show();
          paperclipWindow.focus();
        }
      }
    },
    {
      label: 'Change Fusion Project Directory',
      click: () => changeProjectDirectory()
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));

  tray.on('double-click', () => {
    if (fusionWindow) {
      fusionWindow.show();
      fusionWindow.focus();
    }
  });
}

function stopProcess(proc, name) {
  return new Promise((resolve) => {
    if (!proc) {
      resolve();
      return;
    }

    log(`Stopping ${name} engine...`);
    proc.kill('SIGTERM');

    const forceKillTimer = setTimeout(() => {
      if (proc && !proc.killed) {
        log(`Force killing ${name} engine`);
        proc.kill('SIGKILL');
      }
    }, 10000);

    proc.on('exit', () => {
      clearTimeout(forceKillTimer);
      resolve();
    });
  });
}

function stopAllEngines() {
  return Promise.all([
    stopProcess(fusionProcess, 'Fusion'),
    stopProcess(paperclipProcess, 'Paperclip')
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// App lifecycle
// ─────────────────────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  try {
    log('AI Factory Desktop starting...');
    createSplashWindow();

    updateSplashMessage('Checking for updates...');
    await checkAndUpdateFusion();
    await checkAndUpdatePaperclip();

    const projectRoot = await ensureProjectRoot();
    if (!projectRoot) {
      dialog.showErrorBox('No Project Selected', 'AI Factory requires a Fusion project directory to run.');
      app.quit();
      return;
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
        const newRoot = await ensureProjectRoot();
        if (!newRoot) {
          app.quit();
          return;
        }
      } else if (response === 2) {
        app.quit();
        return;
      }
    }

    updateSplashMessage('Starting Fusion and Paperclip engines...');
    await Promise.all([
      startFusionEngine(projectRoot),
      startPaperclipEngine()
    ]);

    updateSplashMessage('Loading dashboards...');
    createFusionWindow();
    createPaperclipWindow();
    createTray();
  } catch (err) {
    log(`Failed to start: ${err.message}`);
    closeSplashWindow();
    dialog.showErrorBox('Failed to Start AI Factory', err.message);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // Keep running in tray
});

app.on('activate', () => {
  if (fusionWindow) fusionWindow.show();
  if (paperclipWindow) paperclipWindow.show();
});

app.on('before-quit', async (event) => {
  if (fusionProcess || paperclipProcess) {
    event.preventDefault();
    await stopAllEngines();
    app.quit();
  }
});

app.on('quit', () => {
  log('AI Factory Desktop quitting');
});
