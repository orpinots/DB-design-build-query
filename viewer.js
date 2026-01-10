let db = null;

const sqlText = (loadGeneratedSql() || "").trim();

const statusDiv = document.getElementById("viewer-status");
const tableSelect = document.getElementById("viewer-table-list");
const tableWrap = document.getElementById("viewer-table-wrap");

function setStatus(msg, isError=false) {
  statusDiv.className = "message-box " + (isError ? "error" : "success");
  statusDiv.textContent = msg;
}

function renderTable(columns, rows) {
  let html = '<table><thead><tr>';
  columns.forEach(c => html += `<th>${c}</th>`);
  html += '</tr></thead><tbody>';
  rows.forEach(r => {
    html += '<tr>';
    r.forEach(cell => html += `<td>${cell === null ? 'NULL' : cell}</td>`);
    html += '</tr>';
  });
  html += '</tbody></table>';
  return html;
}

async function initViewerDb() {
  const sqlText = (localStorage.getItem(LAST_DB_SQL_KEY) || "").trim();
  if (!sqlText) {
    setStatus("No database found yet. Go to SQL Sandbox and click “Run Schema”.", true);
    return;
  }

  try {
    setStatus("⏳ Loading database…");
    const SQL = await initSqlJs({ locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${f}` });
    db = new SQL.Database();
    db.run(sqlText);

    // list tables
    const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';");
    const names = (res.length ? res[0].values.map(v => v[0]) : []);

    tableSelect.innerHTML = '<option value="">-- Select Table --</option>';
    names.forEach(name => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      tableSelect.appendChild(opt);
    });

    setStatus(`✅ Loaded ${names.length} table(s).`);
  } catch (e) {
    console.error(e);
    setStatus("❌ Failed to load saved database: " + e.message, true);
  }
}

function showTable(name) {
  if (!db || !name) return;
  try {
    const res = db.exec(`SELECT * FROM ${name};`);
    const cols = res.length ? res[0].columns : [];
    const rows = res.length ? res[0].values : [];
    tableWrap.innerHTML = renderTable(cols, rows);
    setStatus(`✅ Showing "${name}" (${rows.length} row(s)).`);
  } catch (e) {
    console.error(e);
    setStatus("❌ Failed to load table: " + e.message, true);
  }
}

tableSelect.addEventListener("change", () => showTable(tableSelect.value));

initViewerDb();