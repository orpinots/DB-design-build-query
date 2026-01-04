// schema.js
"use strict";

// local copy loaded from ERD builder storage
let erd = loadCurrentErd() || { entities: [], relationships: [] };

// Pre-fill textareas if we already generated output earlier
const sqlOut = document.getElementById("sqlOut");
const mermaidOut = document.getElementById("mermaidOut");

sqlOut.value = loadGeneratedSql() || "-- Click 'Build Schema from ERD'…";
mermaidOut.value = loadGeneratedMermaid() || "erDiagram\n  %% Click 'Build Schema from ERD'…";

async function buildSchema() {
  sqlOut.value = "-- Building schema remotely…";
  mermaidOut.value = "erDiagram\n  %% Building schema remotely…";

  // always use latest ERD from storage (in case erd.html changed it)
  erd = loadCurrentErd() || erd;

  try {
    const resp = await fetch(BACKEND_URL + "/build-schema", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(erd)
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`HTTP ${resp.status} – ${text}`);
    }

    const data = await resp.json();
    const sql = data.sql || "";
    const mermaid = data.mermaid || "";

    sqlOut.value = sql;
    mermaidOut.value = mermaid;

    // share with other pages
    saveGeneratedArtifacts({ sql, mermaid });
  } catch (err) {
    sqlOut.value = `-- Error building schema: ${err.message}`;
    mermaidOut.value = "erDiagram\n  %% Error building schema on server.";
  }
}

async function loadMermaidToErd() {
  const raw = (mermaidOut.value || "").trim();
  if (!raw) {
    alert("Paste Mermaid code first.");
    return;
  }

  sqlOut.value = "-- Sending Mermaid to backend for parsing...\n-- Please wait...";

  try {
    const resp = await fetch(BACKEND_URL + "/mermaid-to-erd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mermaid: raw })
    });

    if (!resp.ok) throw new Error("Server returned " + resp.status);

    const data = await resp.json(); // { erd }
    erd = data.erd;

    // Save it so erd.html picks it up
    saveCurrentErd(erd);

    sqlOut.value =
      "-- ERD successfully reconstructed from Mermaid.\n" +
      "-- Go back to ERD Builder to edit it.";
  } catch (err) {
    sqlOut.value = "-- ERROR loading Mermaid remotely: " + err.message;
  }
}

function openMermaidPreview() {
  const code = (mermaidOut.value || "").trim();
  if (!code) {
    alert("No Mermaid ERD text found. Click 'Build Schema from ERD' first.");
    return;
  }

  const escaped = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const w = window.open("", "_blank");
  w.document.write(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Mermaid ERD Preview</title>
      <script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"><\/script>
      <style>
        body { font-family: system-ui, sans-serif; margin:20px; }
        h2 { margin-top:0; }
        .mermaid { border:1px dashed #007bff; padding:10px; border-radius:6px; }
      </style>
    </head>
    <body>
      <h2>ERD Diagram (Mermaid)</h2>
      <div class="mermaid">
${escaped}
      </div>
      <script>mermaid.initialize({startOnLoad:true});<\/script>
    </body>
    </html>
  `);
  w.document.close();
}

// Convenience: stash latest SQL so sandbox.html can pull it
function pushSqlToSandbox() {
  const sql = (sqlOut.value || "").trim();
  if (!sql) {
    alert("No SQL found to send.");
    return;
  }
  saveGeneratedArtifacts({ sql, mermaid: mermaidOut.value || "" });
  alert("Saved generated SQL to localStorage. Open SQL Sandbox and click “Use ERD SQL”.");
}

// expose to buttons
window.buildSchema = buildSchema;
window.loadMermaidToErd = loadMermaidToErd;
window.openMermaidPreview = openMermaidPreview;
window.pushSqlToSandbox = pushSqlToSandbox;