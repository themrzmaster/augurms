// ── AugurMS Launcher ──

const $ = (id) => document.getElementById(id);

let currentUpdates = null;
let isUpdating = false;

// ── Init ──
async function init() {
  setupControls();
  await Promise.all([checkServerStatus(), findGamePath(), loadNews()]);
  await checkForUpdates();
}

// ── Window Controls ──
function setupControls() {
  $("btn-minimize").onclick = () => window.augur.minimize();
  $("btn-close").onclick = () => window.augur.close();
  $("btn-browse").onclick = browseFolder;
  $("btn-play").onclick = handlePlay;

  $("link-register").onclick = () => window.augur.openExternal("https://augurms.com/register");
  $("link-website").onclick = () => window.augur.openExternal("https://augurms.com");
  $("link-discord").onclick = () => window.augur.openExternal("https://discord.gg/aEE3zpFY");

  // Listen for download progress
  window.augur.onDownloadProgress((data) => {
    const overall = ((data.index + data.percent / 100) / data.total) * 100;
    $("progress-bar").style.width = overall + "%";
    $("progress-text").textContent = `${data.file} (${data.percent}%)`;
    $("btn-play-text").textContent = `UPDATING ${Math.round(overall)}%`;
  });
}

// ── Server Status ──
async function checkServerStatus() {
  const dot = $("status-dot");
  const text = $("status-text");
  dot.className = "status-dot checking";

  try {
    const status = await window.augur.getStatus();
    if (status.online) {
      dot.className = "status-dot online";
      text.textContent = status.players > 0
        ? `Online - ${status.players} player${status.players !== 1 ? "s" : ""}`
        : "Online";
    } else {
      dot.className = "status-dot offline";
      text.textContent = "Offline";
    }
  } catch {
    dot.className = "status-dot offline";
    text.textContent = "Cannot reach server";
  }

  // Also fetch rates from config (raw YAML structure: worlds[0].exp_rate etc.)
  try {
    const res = await fetch("https://augurms.com/api/config");
    if (res.ok) {
      const data = await res.json();
      const world = data?.worlds?.[0];
      if (world) {
        $("rate-exp").textContent = (world.exp_rate || "?") + "x";
        $("rate-drop").textContent = (world.drop_rate || "?") + "x";
        $("rate-meso").textContent = (world.meso_rate || "?") + "x";
      }
    }
  } catch {}

  // Refresh every 30s
  setTimeout(checkServerStatus, 30000);
}

// ── Game Path ──
async function findGamePath() {
  const result = await window.augur.findGamePath();
  if (result.found) {
    $("path-display").textContent = result.path;
    $("path-display").title = result.path;
  } else {
    $("path-display").textContent = "Not found - click browse to set";
    $("path-display").style.color = "var(--orange)";
  }
}

async function browseFolder() {
  const path = await window.augur.selectFolder();
  if (path) {
    $("path-display").textContent = path;
    $("path-display").title = path;
    $("path-display").style.color = "";
    await checkForUpdates();
  }
}

// ── Updates ──
async function checkForUpdates() {
  const status = $("update-status");
  const text = $("update-text");
  const icon = $("update-icon") || status.querySelector(".update-icon");

  status.className = "update-status";
  icon.textContent = "\uD83D\uDD0D";
  text.textContent = "Checking for updates...";

  const result = await window.augur.checkUpdates();

  switch (result.status) {
    case "up_to_date":
      status.className = "update-status up-to-date";
      icon.textContent = "\u2705";
      text.textContent = `Up to date (v${result.version || "1.0"})`;
      enablePlay();
      break;

    case "updates_available":
      status.className = "update-status needs-update";
      icon.textContent = "\u26A0\uFE0F";
      const sizeMB = (result.totalSize / 1024 / 1024).toFixed(0);
      text.textContent = `${result.updates.length} file${result.updates.length > 1 ? "s" : ""} to update (${sizeMB} MB)`;
      currentUpdates = result.updates;
      enableUpdate();
      break;

    case "no_path":
      status.className = "update-status error";
      icon.textContent = "\uD83D\uDCC1";
      text.textContent = "Set game folder to check for updates";
      disablePlay();
      break;

    case "error":
      status.className = "update-status error";
      icon.textContent = "\u274C";
      text.textContent = result.error || "Failed to check updates";
      // Still allow play if game exists locally
      enablePlay();
      break;
  }
}

async function handlePlay() {
  if (isUpdating) return;

  // If updates available, download first
  if (currentUpdates && currentUpdates.length > 0) {
    isUpdating = true;
    const btn = $("btn-play");
    btn.className = "btn-play updating";
    $("btn-play-text").textContent = "UPDATING 0%";
    $("progress-container").style.display = "block";

    const result = await window.augur.downloadUpdates(currentUpdates);

    $("progress-container").style.display = "none";
    isUpdating = false;

    if (result.success) {
      currentUpdates = null;
      btn.className = "btn-play";
      $("btn-play-text").textContent = "PLAY";
      $("update-status").className = "update-status up-to-date";
      $("update-text").textContent = "Updated successfully!";
      // Launch after update
      launchGame();
    } else {
      btn.className = "btn-play";
      $("btn-play-text").textContent = "RETRY UPDATE";
      $("update-text").textContent = result.error || "Update failed";
      $("update-status").className = "update-status error";
    }
    return;
  }

  launchGame();
}

async function launchGame() {
  const result = await window.augur.launch();
  if (result.success) {
    $("btn-play-text").textContent = "LAUNCHING...";
    setTimeout(() => {
      $("btn-play-text").textContent = "PLAY";
    }, 3000);
  } else {
    $("btn-play-text").textContent = "PLAY";
    $("update-text").textContent = result.error || "Failed to launch";
    $("update-status").className = "update-status error";
  }
}

function enablePlay() {
  const btn = $("btn-play");
  btn.disabled = false;
  btn.className = "btn-play";
  $("btn-play-text").textContent = "PLAY";
}

function enableUpdate() {
  const btn = $("btn-play");
  btn.disabled = false;
  btn.className = "btn-play updating";
  $("btn-play-text").textContent = "UPDATE & PLAY";
}

function disablePlay() {
  const btn = $("btn-play");
  btn.disabled = true;
  $("btn-play-text").textContent = "SET GAME FOLDER";
}

// ── News ──
async function loadNews() {
  const list = $("news-list");

  try {
    const data = await window.augur.getNews();
    const news = data?.news || [];

    if (news.length === 0) {
      list.innerHTML = `<div class="news-item news-loading">No recent activity</div>`;
      return;
    }

    list.innerHTML = news.map((item) => {
      const typeClass = {
        rates: "news-type-rates",
        event: "news-type-event",
        drops: "news-type-drops",
        update: "news-type-update",
      }[item.type] || "news-type-update";

      const date = new Date(item.date);
      const ago = timeAgo(date);

      return `
        <div class="news-item">
          <div class="news-item-header">
            <span class="news-item-type ${typeClass}">${item.type || "update"}</span>
            <span class="news-item-date">${ago}</span>
          </div>
          <div class="news-item-text">${item.text}</div>
        </div>
      `;
    }).join("");
  } catch {
    list.innerHTML = `<div class="news-item news-loading">Could not load news</div>`;
  }
}

function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return Math.floor(seconds / 60) + "m ago";
  if (seconds < 86400) return Math.floor(seconds / 3600) + "h ago";
  return Math.floor(seconds / 86400) + "d ago";
}

// ── Start ──
init();
