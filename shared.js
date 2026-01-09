// shared.js
"use strict";

// === BACKEND CONFIG ===
const BACKEND_URL = "https://erd-schema-backend.onrender.com";

// ---- localStorage keys (shared across pages) ----
const LS_KEYS = {
  ERD_CURRENT: "erd_current",
  ERD_GENERATED_SQL: "erd_generated_sql",
  ERD_GENERATED_MERMAID: "erd_generated_mermaid",
};

// Deep clone helper
function cloneErd(obj) {
  return JSON.parse(JSON.stringify(obj));
}




// --- Hot ERD Time Machine (5-min snapshots, last 60 min) ---
const SNAPSHOT_KEY = "erd_snapshots_v1";
const SNAPSHOT_INTERVAL_MIN = 5;
const SNAPSHOT_MAX = 12; // 12 * 5min = 60 minutes

function loadSnapshots() {
  try {
    return JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveSnapshots(arr) {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(arr));
  } catch (e) {
    console.warn("Could not save snapshots:", e);
  }
}

// Save a snapshot of the current ERD with timestamp
function pushSnapshot(erdObj) {
  const now = Date.now();
  const snapshots = loadSnapshots();

  // avoid duplicates if called twice quickly
  const last = snapshots[snapshots.length - 1];
  if (last && (now - last.ts) < 30_000) return; // 30s guard

  snapshots.push({
    ts: now,
    erd: cloneErd(erdObj)
  });

  // keep only the latest SNAPSHOT_MAX
  while (snapshots.length > SNAPSHOT_MAX) snapshots.shift();

  saveSnapshots(snapshots);
  refreshTimeMachineDropdown();
}

function refreshTimeMachineDropdown() {
  const sel = document.getElementById("erdTimeMachineSelect");
  if (!sel) return;

  const snapshots = loadSnapshots();
  sel.innerHTML = "";

  if (!snapshots.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(no snapshots yet)";
    sel.appendChild(opt);
    return;
  }

  // newest first in the dropdown
  const now = Date.now();
  const newestFirst = [...snapshots].reverse();

  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "Select a restore point…";
  sel.appendChild(opt0);

  newestFirst.forEach((s, idx) => {
    const minutesAgo = Math.round((now - s.ts) / 60000);
    const opt = document.createElement("option");
    // store index in ORIGINAL array: easiest is store timestamp as identifier
    opt.value = String(s.ts);
	if (mins === 0) {
	  opt.textContent = "Just now (autosave)";
	} else {
	  opt.textContent = `-${mins} min (autosave)`;
	}
    sel.appendChild(opt);
  });
}

function restoreSnapshotByTs(tsStr) {
  const ts = Number(tsStr);
  if (!ts) return;

  const snapshots = loadSnapshots();
  const snap = snapshots.find(s => s.ts === ts);
  if (!snap) return;

  // Restore
  erd = cloneErd(snap.erd);

  // Persist current state so page switches keep it
  saveCurrentErdState(erd);
  render();
}

function exportErd() {
  const dataStr = JSON.stringify(erd, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `erd-${new Date().toISOString().slice(0,19)}.json`;
  a.click();

  URL.revokeObjectURL(url);
}

function importErd() {
  const input = document.getElementById("erdFileInput");
  if (input) input.click();
}


function handleErdFile(files) {
  if (!files || !files.length) return;

  const file = files[0];
  const reader = new FileReader();

  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);

      if (!parsed.entities || !parsed.relationships) {
        alert("Invalid ERD file.");
        return;
      }

      erd = parsed;
      saveCurrentErd(erd);   // optional: persist immediately
      render();
    } catch (err) {
      alert("Could not load ERD file.");
    }
  };

  reader.readAsText(file);
}


// Save/load "current ERD" so schema.html can work on erd.html output
function saveCurrentErd(erdObj) {
  try {
    localStorage.setItem(LS_KEYS.ERD_CURRENT, JSON.stringify(erdObj || null));
  } catch (e) {
    console.warn("Could not save ERD to localStorage:", e);
  }
}

function loadCurrentErd() {
  try {
    const raw = localStorage.getItem(LS_KEYS.ERD_CURRENT);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    // basic shape check
    if (!obj || !Array.isArray(obj.entities) || !Array.isArray(obj.relationships)) return null;
    return obj;
  } catch (e) {
    console.warn("Could not load ERD from localStorage:", e);
    return null;
  }
}



// Save/load the latest generated SQL/Mermaid so sandbox can import it
function saveGeneratedArtifacts({ sql, mermaid }) {
  try {
    if (typeof sql === "string") localStorage.setItem(LS_KEYS.ERD_GENERATED_SQL, sql);
    if (typeof mermaid === "string") localStorage.setItem(LS_KEYS.ERD_GENERATED_MERMAID, mermaid);
  } catch (e) {
    console.warn("Could not save generated artifacts:", e);
  }
}

function loadGeneratedSql() {
  return localStorage.getItem(LS_KEYS.ERD_GENERATED_SQL) || "";
}
function loadGeneratedMermaid() {
  return localStorage.getItem(LS_KEYS.ERD_GENERATED_MERMAID) || "";
}