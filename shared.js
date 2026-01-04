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
    return JSON.parse(raw);
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