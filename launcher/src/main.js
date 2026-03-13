const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const https = require("https");
const http = require("http");

const API_BASE = "https://augurms.com";
const MANIFEST_URL = `${API_BASE}/api/launcher/manifest`;
const NEWS_URL = `${API_BASE}/api/launcher/news`;
const STATUS_URL = `${API_BASE}/api/server`;

let mainWindow;
let gamePath = "";

// Default game paths to check
const DEFAULT_PATHS = [
  "C:\\AugurMS",
  "C:\\Nexon\\MapleStory",
  "C:\\MapleStory",
  path.join(app.getPath("home"), "AugurMS"),
];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 620,
    resizable: false,
    frame: false,
    transparent: false,
    backgroundColor: "#0a0a0f",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  // Dev tools in dev mode
  if (process.argv.includes("--dev")) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());

// ── IPC Handlers ──

ipcMain.handle("window:minimize", () => mainWindow.minimize());
ipcMain.handle("window:close", () => mainWindow.close());

ipcMain.handle("shell:openExternal", (_, url) => shell.openExternal(url));

ipcMain.handle("game:findPath", () => {
  // Check saved path first
  const configPath = path.join(app.getPath("userData"), "config.json");
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    if (config.gamePath && fs.existsSync(config.gamePath)) {
      gamePath = config.gamePath;
      return { found: true, path: gamePath };
    }
  } catch {}

  // Check default paths
  for (const p of DEFAULT_PATHS) {
    const exePath = path.join(p, "AugurMS.exe");
    if (fs.existsSync(exePath)) {
      gamePath = p;
      saveConfig({ gamePath });
      return { found: true, path: gamePath };
    }
  }

  return { found: false, path: null };
});

ipcMain.handle("game:setPath", (_, newPath) => {
  gamePath = newPath;
  saveConfig({ gamePath });
  return { success: true };
});

ipcMain.handle("game:selectFolder", async () => {
  const { dialog } = require("electron");
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Select AugurMS Installation Folder",
  });
  if (result.canceled || !result.filePaths.length) return null;
  const selected = result.filePaths[0];
  gamePath = selected;
  saveConfig({ gamePath });
  return selected;
});

ipcMain.handle("game:launch", () => {
  if (!gamePath) return { success: false, error: "Game path not set" };
  const exePath = path.join(gamePath, "AugurMS.exe");
  if (!fs.existsSync(exePath))
    return { success: false, error: "AugurMS.exe not found" };

  const { execFile } = require("child_process");
  execFile(exePath, { cwd: gamePath }, (err) => {
    if (err) console.error("Launch error:", err);
  });

  return { success: true };
});

ipcMain.handle("server:status", async () => {
  try {
    const data = await fetchJSON(STATUS_URL);
    return {
      online: data?.docker?.maplestory === "running",
      players: data?.players || 0,
    };
  } catch {
    return { online: false, players: 0 };
  }
});

ipcMain.handle("launcher:news", async () => {
  try {
    return await fetchJSON(NEWS_URL);
  } catch {
    return { news: [] };
  }
});

ipcMain.handle("launcher:checkUpdates", async () => {
  if (!gamePath) return { status: "no_path" };

  try {
    const manifest = await fetchJSON(MANIFEST_URL);
    if (!manifest || !manifest.files) return { status: "error", error: "Invalid manifest" };

    const updates = [];
    for (const file of manifest.files) {
      const localPath = path.join(gamePath, file.name);
      if (!fs.existsSync(localPath)) {
        updates.push({ ...file, reason: "missing" });
        continue;
      }

      // Check file size first (fast)
      const stats = fs.statSync(localPath);
      if (stats.size !== file.size) {
        updates.push({ ...file, reason: "size_mismatch" });
        continue;
      }

      // Check hash if sizes match (slower but accurate)
      if (file.hash) {
        const localHash = await hashFile(localPath);
        if (localHash !== file.hash) {
          updates.push({ ...file, reason: "hash_mismatch" });
        }
      }
    }

    return {
      status: updates.length > 0 ? "updates_available" : "up_to_date",
      version: manifest.version,
      updates,
      totalSize: updates.reduce((s, f) => s + f.size, 0),
    };
  } catch (err) {
    return { status: "error", error: err.message };
  }
});

ipcMain.handle("launcher:downloadUpdates", async (_, updates) => {
  if (!gamePath || !updates?.length) return { success: false };

  for (let i = 0; i < updates.length; i++) {
    const file = updates[i];
    const destPath = path.join(gamePath, file.name);

    mainWindow.webContents.send("download:progress", {
      file: file.name,
      index: i,
      total: updates.length,
      percent: 0,
    });

    try {
      await downloadFile(file.url, destPath, (percent) => {
        mainWindow.webContents.send("download:progress", {
          file: file.name,
          index: i,
          total: updates.length,
          percent,
        });
      });
    } catch (err) {
      return { success: false, error: `Failed to download ${file.name}: ${err.message}` };
    }
  }

  return { success: true };
});

// ── Helpers ──

function saveConfig(config) {
  const configPath = path.join(app.getPath("userData"), "config.json");
  try {
    let existing = {};
    try { existing = JSON.parse(fs.readFileSync(configPath, "utf-8")); } catch {}
    fs.writeFileSync(configPath, JSON.stringify({ ...existing, ...config }, null, 2));
  } catch {}
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    mod.get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJSON(res.headers.location).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error("Invalid JSON")); }
      });
    }).on("error", reject);
  });
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (d) => hash.update(d));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    mod.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, dest, onProgress).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      const totalSize = parseInt(res.headers["content-length"], 10) || 0;
      let downloaded = 0;

      // Ensure parent directory exists
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const fileStream = fs.createWriteStream(dest);

      res.on("data", (chunk) => {
        downloaded += chunk.length;
        if (totalSize > 0) onProgress(Math.round((downloaded / totalSize) * 100));
      });

      res.pipe(fileStream);
      fileStream.on("finish", () => { fileStream.close(); resolve(); });
      fileStream.on("error", reject);
    }).on("error", reject);
  });
}
