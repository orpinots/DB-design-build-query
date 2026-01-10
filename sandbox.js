let db = null;
// --- Keep track of CREATE-table order (from the user's script) ---
let lastCreateOrder = [];

const MAX_SCHEMAS = 5;
const MAX_QUERIES = 10;
const SCHEMA_STORAGE_KEY = 'sql_sandbox_schemas';
const QUERY_STORAGE_KEY = 'sql_sandbox_queries';
const DEFAULT_SCHEMAS = window.DEFAULT_SCHEMAS || [];
const defaultQuery = window.INITIAL_DEFAULT_QUERY || '';

const dbScriptInput = document.getElementById('db-script');
const queryInput = document.getElementById('query-input');
const savedSchemasSelect = document.getElementById('saved-schemas');
const savedQueriesSelect = document.getElementById('saved-queries');
const tableListSelect = document.getElementById('table-list');
const erdContainer = document.getElementById('erd-container');
const queryOutputContent = document.getElementById('query-output-content');
const mermaidDiagramDiv = document.getElementById('mermaid-diagram');
const erdMessage = document.getElementById('erd-message');
const statusMessage = document.getElementById('status-message');
const resultsTableDiv = document.getElementById('results-table');
const showErdButton = document.getElementById('show-erd-button');
const showResultsButton = document.getElementById('show-results-button');

// --- Edit panel DOM ---
const editPanel = document.getElementById('edit-panel');
const editGridWrap = document.getElementById('edit-grid-wrap');
const editTableNameSpan = document.getElementById('edit-table-name');


const firstDefaultSchema = (DEFAULT_SCHEMAS && DEFAULT_SCHEMAS.length > 0)
  ? DEFAULT_SCHEMAS[0]
  : null;

if (firstDefaultSchema) {
  dbScriptInput.value = firstDefaultSchema.script;
  queryInput.value = (window.INITIAL_DEFAULT_QUERY || firstDefaultSchema.defaultQuery || '');
} else {
  dbScriptInput.value = '-- Add CREATE TABLE and INSERT statements here';
  queryInput.value = '-- SELECT * FROM your_table;';
}

loadAllSchemasList();
loadSavedQueriesList();
switchOutputView('erd');
initDb();


function useErdSql() {
  const sql = loadGeneratedSql();
  if (!sql) {
    alert("No generated SQL found. Go to Schema / Mermaid and click 'Build Schema from ERD'.");
    return;
  }
  dbScriptInput.value = sql;
  initDb();
}

// expose to HTML button
window.useErdSql = useErdSql;



/* ------ View switcher ------ */
function switchOutputView(view) {
  if (view === 'erd') {
    erdContainer.style.display = 'block';
    queryOutputContent.style.display = 'none';
    showErdButton.classList.add('active');
    showResultsButton.classList.remove('active');
  } else {
    erdContainer.style.display = 'none';
    queryOutputContent.style.display = 'block';
    showErdButton.classList.remove('active');
    showResultsButton.classList.add('active');
  }
}

/* ------ Init DB from script ------ */
async function initDb() {
  resultsTableDiv.innerHTML = '';
  switchOutputView('erd');
  tableListSelect.innerHTML = '<option value="">-- Select Table --</option>';

  try {
    statusMessage.className = 'message-box success';
    statusMessage.textContent = '⏳ Initializing database engine...';

    const SQL = await initSqlJs({ locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}` });
    db = new SQL.Database();
	const fkOn = document.getElementById('toggle-fk')?.checked;
	db.run(`PRAGMA foreign_keys = ${fkOn ? 'ON' : 'OFF'};`);
	
    const schemaScript = dbScriptInput.value.trim();
    if (!schemaScript) throw new Error("Schema script cannot be empty.");
	saveGeneratedArtifacts({ sql: dbScriptInput.value.trim() });

    const { ddl } = splitDdlAndData(schemaScript);
    const reorderedDdl = reorderDdlByForeignKeys(ddl);
    lastCreateOrder = extractCreateOrderFromDdl(reorderedDdl);

    db.run(schemaScript);

    statusMessage.className = 'message-box success';
    statusMessage.textContent = '✅ Database successfully created and populated. You can now run queries.';

    generateERD();
    populateTableList();
  } catch (err) {
    db = null;
    statusMessage.className = 'message-box error';
    statusMessage.textContent = '❌ Failed to initialize database: ' + err.message;
    console.error(err);
    erdMessage.textContent = 'ERD generation failed due to schema errors.';
    mermaidDiagramDiv.innerHTML = '';
  }
}

/* ------ Query execution ------ */
function executeQuery() {
  switchOutputView('results');

  if (!db) {
    statusMessage.className = 'message-box error';
    statusMessage.textContent = '❌ Database is not initialized. Click "Run Schema" first.';
    return;
  }

  const query = queryInput.value.trim();
  resultsTableDiv.innerHTML = '';
  if (!query) {
    statusMessage.className = 'message-box error';
    statusMessage.textContent = '❌ Please enter a query.';
    return;
  }

  try {
    const results = db.exec(query);
    const hasRows = results.length > 0 && results[0].values.length > 0;

    if (!hasRows) {
      statusMessage.className = 'message-box success';
      statusMessage.textContent = '✅ Query executed successfully. No rows returned or statement did not produce a result set.';
      resultsTableDiv.innerHTML = '';
    } else {
      statusMessage.className = 'message-box success';
      statusMessage.textContent = `✅ Query executed successfully. Returned ${results[0].values.length} row(s).`;
      resultsTableDiv.innerHTML = renderTable(results[0].columns, results[0].values);
    }

    generateERD();
    populateTableList();
  } catch (err) {
    statusMessage.className = 'message-box error';
    statusMessage.textContent = '❌ SQL Error: ' + err.message;
    console.error("SQL Error:", err);
  }
}

/* ------ Table data viewer ------ */
function populateTableList() {
  tableListSelect.innerHTML = '<option value="">-- Select Table --</option>';
  if (!db) return;

  const tableQuery = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'";
  try {
    const result = db.exec(tableQuery);
    if (result.length > 0 && result[0].values.length > 0) {
      result[0].values.forEach(row => {
        const tableName = row[0];
        const option = document.createElement('option');
        option.value = tableName;
        option.textContent = tableName;
        tableListSelect.appendChild(option);
      });
    }
  } catch (err) {
    console.error("Error fetching table list:", err);
  }
}

function showTableData() {
  const tableName = tableListSelect.value;
  if (!tableName) {
    alert("Please select a table to view its data.");
    return;
  }
  const selectAllQuery = `SELECT * FROM ${tableName};`;
  queryInput.value = selectAllQuery;
  executeQuery();
  tableListSelect.value = '';
}

/* ------ Query saving/loading ------ */
function loadSavedQueriesList() {
  const queries = JSON.parse(localStorage.getItem(QUERY_STORAGE_KEY) || '[]');
  savedQueriesSelect.innerHTML = '<option value="">-- Select a Query --</option>';
  queries.forEach((queryObj, index) => {
    const option = document.createElement('option');
    option.value = queryObj.script;
    option.textContent = `[${index + 1}] ${queryObj.name}`;
    savedQueriesSelect.appendChild(option);
  });
}
function saveQuery() {
  const script = queryInput.value.trim();
  if (!script) { alert("The query area is empty."); return; }

  let queries = JSON.parse(localStorage.getItem(QUERY_STORAGE_KEY) || '[]');
  const queryName = prompt("Enter a name for this SQL query (e.g., 'Full Join'):");
  if (!queryName) return;

  const newQuery = { name: queryName, script: script };
  if (queries.some(q => q.script === script)) {
    alert("This exact query is already saved.");
    return;
  }
  if (queries.length >= MAX_QUERIES) queries.shift();
  queries.push(newQuery);
  localStorage.setItem(QUERY_STORAGE_KEY, JSON.stringify(queries));
  loadSavedQueriesList();
  alert(`Query "${queryName}" saved successfully! (${queries.length}/${MAX_QUERIES})`);
}
function loadQuery(script) {
  if (script) {
    queryInput.value = script;
    savedQueriesSelect.value = '';
  }
}

function deleteQuery() {
  const script = savedQueriesSelect.value;
  if (!script) {
    alert("Select a saved query to delete.");
    return;
  }

  let queries = JSON.parse(localStorage.getItem(QUERY_STORAGE_KEY) || "[]");
  const idx = queries.findIndex(q => q.script === script);

  if (idx === -1) {
    alert("Could not find that saved query.");
    return;
  }

  const name = queries[idx].name;
  if (!confirm(`Delete query "${name}"? This cannot be undone.`)) {
    return;
  }

  queries.splice(idx, 1);
  localStorage.setItem(QUERY_STORAGE_KEY, JSON.stringify(queries));
  loadSavedQueriesList();
  savedQueriesSelect.value = "";
}


/* ------ Schema saving/loading ------ */
function loadAllSchemasList() {
  const savedSchemas = JSON.parse(localStorage.getItem(SCHEMA_STORAGE_KEY) || '[]');
  const allSchemas = [
    ...DEFAULT_SCHEMAS.map((s, i) => ({ ...s, valueKey: `DEFAULT-${i}`, isDefault: true })),
    ...savedSchemas.map((s, i) => ({ ...s, valueKey: `SAVED-${i}`, isDefault: false }))
  ];

  savedSchemasSelect.innerHTML = '<option value="">-- Select a Schema --</option>';
  allSchemas.forEach(schemaObj => {
    const option = document.createElement('option');
    option.value = schemaObj.script;
    let label = schemaObj.name;
    if (!schemaObj.isDefault) label = `[User Saved] ${schemaObj.name}`;
    option.textContent = label;
    savedSchemasSelect.appendChild(option);
  });

  if (firstDefaultSchema) {
    savedSchemasSelect.value = firstDefaultSchema.script;
  }
}

function saveSchema() {
  const script = dbScriptInput.value.trim();
  if (!script) {
    alert("The script area is empty.");
    return;
  }
  let schemas = JSON.parse(localStorage.getItem(SCHEMA_STORAGE_KEY) || '[]');
  const schemaName = prompt("Enter a name for this database setup (e.g., 'E-commerce Tables'):");
  if (!schemaName) return;
  const newSchema = { name: schemaName, script: script };
  if (schemas.some(s => s.script === script)) {
    alert("This exact schema script is already saved.");
    return;
  }
  if (schemas.length >= MAX_SCHEMAS) schemas.shift();
  schemas.push(newSchema);
  localStorage.setItem(SCHEMA_STORAGE_KEY, JSON.stringify(schemas));
  loadAllSchemasList();
  alert(`Schema setup "${schemaName}" saved successfully! (${schemas.length}/${MAX_SCHEMAS})`);
}

function loadSchema(script) {
  if (!script) return;
  dbScriptInput.value = script;
  savedSchemasSelect.value = script;

  const allSchemas = [
    ...DEFAULT_SCHEMAS,
    ...JSON.parse(localStorage.getItem(SCHEMA_STORAGE_KEY) || '[]')
  ];
  const selectedSchema = allSchemas.find(s => s.script === script);
  if (selectedSchema && selectedSchema.defaultQuery) {
    queryInput.value = selectedSchema.defaultQuery;
  } else {
    queryInput.value = '';
  }
  initDb();
}

function deleteSchema() {
  const script = savedSchemasSelect.value;
  if (!script) {
    alert("Select a user-saved schema to delete.");
    return;
  }

  let schemas = JSON.parse(localStorage.getItem(SCHEMA_STORAGE_KEY) || "[]");
  const idx = schemas.findIndex(s => s.script === script);

  if (idx === -1) {
    // Script not found among user-saved schemas → it’s one of the built-ins
    alert("That schema is a built-in default and cannot be deleted.");
    return;
  }

  const name = schemas[idx].name;
  if (!confirm(`Delete schema setup "${name}"? This cannot be undone.`)) {
    return;
  }

  schemas.splice(idx, 1);
  localStorage.setItem(SCHEMA_STORAGE_KEY, JSON.stringify(schemas));
  loadAllSchemasList();
  savedSchemasSelect.value = "";
}

/* ------ ERD generation from live DB ------ */
function emphasizePkColumns(svgString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const textNodes = doc.querySelectorAll('text');

  textNodes.forEach(node => {
    const txt = (node.textContent || '').trim();
    if (!/\bPK\b/.test(txt)) return;

    const existingStyle = node.getAttribute('style') || '';
    let newStyle = existingStyle;
    if (txt === 'PK') newStyle += ';fill:#d00000;';
    else if (txt === 'PK,FK' || txt === 'PK FK') newStyle += ';fill:#b00000;';
    if (!/font-weight\s*:/.test(newStyle)) newStyle += ';font-weight:bold;';

    node.setAttribute('style', newStyle);
    node.setAttribute('font-weight', 'bold');
  });

  const serializer = new XMLSerializer();
  return serializer.serializeToString(doc.documentElement);
}

async function generateERD() {
  if (!db) {
    erdMessage.textContent = 'Database not initialized.';
    mermaidDiagramDiv.innerHTML = '';
    return;
  }

  const tablesResult = db.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
  );
  if (!tablesResult.length || !tablesResult[0].values.length) {
    erdMessage.textContent = 'No tables found to generate the ERD.';
    mermaidDiagramDiv.innerHTML = '';
    return;
  }

  const tableNames = tablesResult[0].values.map(row => row[0]);
  let mermaidSyntax = 'erDiagram\n';
  const tables = {};

  tableNames.forEach(tableName => {
    tables[tableName] = { primaryKeys: [], foreignKeys: [], columns: [] };
    const foreignKeyColumns = [];

    const fk = db.exec(`PRAGMA foreign_key_list(${tableName});`);
    if (fk.length && fk[0].values.length) {
      fk[0].values.forEach(row => {
        const fkColumn = row[3];
        const refTable = row[2];
        foreignKeyColumns.push(fkColumn);
        tables[tableName].foreignKeys.push({ fkColumn, refTable });
      });
    }

    const info = db.exec(`PRAGMA table_info(${tableName});`);
    if (info.length && info[0].values.length) {
      info[0].values.forEach(col => {
        const colName = col[1];
        const colType = col[2] || 'TEXT';
        const notNull = col[3];
        const pkFlag = col[5];

        let labelType = colType;
        if (notNull) labelType += '[NN]';

        const isPk = pkFlag > 0;
        const isFk = foreignKeyColumns.includes(colName);

        tables[tableName].columns.push({
          name: colName,
          type: labelType,
          isPk,
          isFk
        });

        if (isPk) tables[tableName].primaryKeys.push(colName);
      });
    }
  });

  for (const [tableName, data] of Object.entries(tables)) {
    mermaidSyntax += `    ${refactorTableName(tableName)} {\n`;
    data.columns.forEach(col => {
      let line = `        ${col.name} ${col.type}`;
      const keyMarkers = [];
      if (col.isPk) keyMarkers.push('PK');
      if (col.isFk) keyMarkers.push('FK');
      if (keyMarkers.length > 0) line += ' ' + keyMarkers.join(',');
      mermaidSyntax += line + '\n';
    });
    mermaidSyntax += `    }\n`;

    data.foreignKeys.forEach(fk => {
      mermaidSyntax += `    ${refactorTableName(fk.refTable)} ||--o{ ${refactorTableName(tableName)} : "${fk.fkColumn}"\n`;
    });
  }

  erdMessage.textContent = 'Rendering Diagram...';
  mermaidDiagramDiv.innerHTML = '';
  try {
    const { svg } = await mermaid.render('mermaid-svg', mermaidSyntax);
    const styledSvg = emphasizePkColumns(svg);
    mermaidDiagramDiv.innerHTML = styledSvg;
    erdMessage.textContent = 'Diagram generated successfully.';
  } catch (error) {
    console.error('Mermaid ERD generation failed:', error, '\nMermaid code:\n', mermaidSyntax);
    erdMessage.textContent = '❌ Failed to generate ERD.';
    mermaidDiagramDiv.innerHTML = '';
  }
}

function refactorTableName(name) {
  return name.replace(/"/g, '').replace(/`/g, '');
}

function renderTable(columns, rows) {
  let html = '<table><thead><tr>';
  columns.forEach(col => { html += `<th>${col}</th>`; });
  html += '</tr></thead><tbody>';
  rows.forEach(row => {
    html += '<tr>';
    row.forEach(cell => { html += `<td>${cell === null ? 'NULL' : cell}</td>`; });
    html += '</tr>';
  });
  html += '</tbody></table>';
  return html;
}

function splitDdlAndData(scriptText) {
  const s = scriptText || '';
  const insertIdx = s.search(/^\s*INSERT\s+INTO\b/im);
  if (insertIdx === -1) {
    return { ddl: s.trim(), data: '' };
  }
  return {
    ddl: s.slice(0, insertIdx).trim(),
    data: s.slice(insertIdx).trim()
  };
}

function extractCreateOrder(ddlText) {
  // Handles: CREATE TABLE tableName ( ... ) ;
  // Also handles: CREATE TABLE IF NOT EXISTS tableName ...
  const order = [];
  const re = /^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(["`]?)([A-Za-z_][\w]*)\1\s*\(/gim;
  let m;
  while ((m = re.exec(ddlText)) !== null) {
    order.push(m[2]);
  }
  // Remove duplicates while preserving order
  return [...new Set(order)];
}

function sqlLiteral(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  // Strings: escape single quotes by doubling them
  return `'${String(v).replace(/'/g, "''")}'`;
}

function getTableColumns(tableName) {
  const info = db.exec(`PRAGMA table_info(${tableName});`);
  if (!info.length) return [];
  // PRAGMA table_info columns: cid, name, type, notnull, dflt_value, pk
  return info[0].values.map(row => row[1]);
}


function getTableColumnsWithTypes(tableName) {
  const info = db.exec(`PRAGMA table_info(${tableName});`);
  if (!info.length) return [];
  // row: cid, name, type, notnull, dflt_value, pk
  return info[0].values.map(row => ({
    name: row[1],
    type: (row[2] || '').toUpperCase(),
    pk: Number(row[5] || 0) // 0 = not PK, >0 = PK (order within composite PK)
  }));
}


function exportTableInserts(tableName) {
  const cols = getTableColumns(tableName);
  if (!cols.length) return '';

  const res = db.exec(`SELECT * FROM ${tableName};`);
  if (!res.length || !res[0].values.length) {
    // No rows
    return `-- INSERTS: ${tableName}\n-- (no rows)\n`;
  }

  const colList = cols.join(', ');
  let out = `-- INSERTS: ${tableName}\n`;

  res[0].values.forEach(row => {
    const values = row.map(sqlLiteral).join(', ');
    out += `INSERT INTO ${tableName} (${colList}) VALUES (${values});\n`;
  });

  return out + '\n';
}

function exportAllInsertsInCreateOrder(createOrder) {
  // Only include tables that exist (user might have edited CREATEs)
  const existing = new Set();
  const t = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';");
  if (t.length) t[0].values.forEach(r => existing.add(r[0]));

  let out = '';
  createOrder.forEach(name => {
    if (existing.has(name)) out += exportTableInserts(name);
  });

  // Also include any “extra” tables not found in CREATE order (optional)
  // This is nice when someone creates tables dynamically or via other means.
  const extras = [...existing].filter(n => !createOrder.includes(n));
  if (extras.length) {
    out += `-- Other tables (not found in CREATE order)\n\n`;
    extras.forEach(name => { out += exportTableInserts(name); });
  }

  return out.trim();
}

function refreshDbScriptTextareaFromLiveDb() {
  if (!db) return;

  const { ddl } = splitDdlAndData(dbScriptInput.value);

  // Reorder CREATE TABLE statements to respect FK dependencies
  const reorderedDdl = reorderDdlByForeignKeys(ddl);

  // Update create-order cache to match the reordered DDL
  lastCreateOrder = extractCreateOrderFromDdl(reorderedDdl);

  // Regenerate INSERT statements in that same order
  const inserts = exportAllInsertsInCreateOrder(lastCreateOrder);
  const rebuilt = inserts ? `${reorderedDdl}\n\n${inserts}\n` : `${reorderedDdl}\n`;

  dbScriptInput.value = rebuilt;
}


// ===============================
// Edit Table Data (no-SQL UI)
// ===============================

let editState = {
  tableName: null,
  columns: [],
  // rows is an array of arrays, aligned to columns
  rows: []
};

function openEditPanelForTable(tableName) {
  if (!db) {
    alert('Database is not initialized. Click "Run Schema" first.');
    return;
  }

  // Load current data
  const cols = getTableColumns(tableName);
  if (!cols.length) {
    alert(`Could not read columns for table "${tableName}".`);
    return;
  }

  const res = db.exec(`SELECT * FROM ${tableName};`);
  const rows = (res.length && res[0].values) ? res[0].values : [];

  editState = {
    tableName,
    columns: cols,
    rows: rows.map(r => [...r]) // clone
  };

  // Render
  editTableNameSpan.textContent = tableName;
  renderEditGrid();

  // Show panel + switch to results view
  switchOutputView('results');
  editPanel.style.display = 'block';

  switchOutputView('results');
  editPanel.style.display = 'block';
  setEditMode(true);
  editPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Keep Query Results in sync with the edited table (no side effects)
  showTablePreview(tableName);

}

function closeEditPanel() {
  setEditMode(false);
  editPanel.style.display = 'none';
  editGridWrap.innerHTML = '';
  editTableNameSpan.textContent = '';
  editState = { tableName: null, columns: [], rows: [] };
}

window.closeEditPanel = closeEditPanel; // needed for HTML onclick
window.applyEditsAndUpdateSchemaSql = applyEditsAndUpdateSchemaSql; // needed for HTML onclick

function renderEditGrid() {
  const { tableName, columns, rows } = editState;

  // Basic guard
  if (!tableName || !columns.length) {
    editGridWrap.innerHTML = '';
    return;
  }

  // Build table
  let html = `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin:10px 0;">
      <div class="muted" style="font-size:12px;">
        Tip: leave a cell blank to store NULL. Numbers will be stored as numbers when possible.
      </div>
      <button type="button" onclick="addEditRow()">+ Add Row</button>
    </div>

    <div style="overflow:auto; border:1px solid var(--border); border-radius:10px;">
      <table class="edit-grid" style="margin:0;">
        <thead>
          <tr>
            ${columns.map(c => `<th>${escapeHtml(c)}</th>`).join('')}
            <th style="width:1%; white-space:nowrap;">Delete</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, rIdx) => `
            <tr>
              ${columns.map((c, cIdx) => {
                const v = row[cIdx];
                const display = (v === null || v === undefined) ? '' : String(v);
                return `
                  <td>
                    <input
                      class="cell-input"
                      data-r="${rIdx}"
                      data-c="${cIdx}"
                      value="${escapeAttr(display)}"
                      style="width:100%; box-sizing:border-box;"
                    />
                  </td>`;
              }).join('')}
              <td style="text-align:center;">
                <button type="button" onclick="deleteEditRow(${rIdx})">🗑️</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  editGridWrap.innerHTML = html;

  // Wire input events (Safari-friendly: use 'input', not change)
  editGridWrap.querySelectorAll('input.cell-input').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const r = Number(e.target.dataset.r);
      const c = Number(e.target.dataset.c);
      editState.rows[r][c] = e.target.value;
    });
  });
}


function addEditRow() {
  const { tableName } = editState;
  if (!tableName || !editState.columns.length) return;

  // Row number (1-based) for the new row
  const rowNum = editState.rows.length + 1;

  // Pull types + PK info from SQLite (best available signal)
  const colsWithTypes = getTableColumnsWithTypes(tableName);
  const typeByCol = new Map(colsWithTypes.map(x => [x.name, x.type]));
  const pkByCol   = new Map(colsWithTypes.map(x => [x.name, x.pk]));
  // --- Precompute "next integer id" seeds for INT PK columns ---
  const nextIntPk = new Map(); // colName -> nextValue

  editState.columns.forEach(colName => {
    const colType = typeByCol.get(colName) || '';
    const isPk = (pkByCol.get(colName) || 0) > 0;

    if (isPk && isType(colType, ['INT'])) {
      // find max existing numeric value in this PK column (from current edit grid)
      let maxVal = 0;
      for (const r of editState.rows) {
        const idx = editState.columns.indexOf(colName);
        if (idx < 0) continue;
        const v = r[idx];
        const n = Number(v);
        if (Number.isFinite(n) && n > maxVal) maxVal = n;
      }
      nextIntPk.set(colName, maxVal + 1);
    }
  });

  const newRow = editState.columns.map(colName => {
    const colType = typeByCol.get(colName) || '';
    const isPk = (pkByCol.get(colName) || 0) > 0;

    // ✅ exception: if column is PK integer, default to '' (so user must choose)
    // if (isPk && isType(colType, ['INT'])) {
    //  return '';
    //}
    // If PK is integer-ish, auto-fill with next available id
    if (isPk && isType(colType, ['INT'])) {
      const next = nextIntPk.get(colName) || rowNum;  // fallback
      nextIntPk.set(colName, next + 1);               // increment seed
      return String(next);
    }

    // Boolean-ish
    if (isType(colType, ['BOOL', 'BOOLEAN'])) {
      return String(randInt(0, 1));
    }

    // Integer-ish
    if (isType(colType, ['INT'])) {
      return String(randInt(1, 100));
    }

    // Real/float/decimal/numeric-ish
    if (isType(colType, ['REAL', 'FLOA', 'DOUB', 'DEC', 'NUM'])) {
      return String(randInt(1, 100));
    }

    // Date/Time-ish
    if (isType(colType, ['DATETIME', 'TIMESTAMP'])) {
      return randomDateTimeLast24Hours();
    }
    if (isType(colType, ['DATE'])) {
      return randomDateLastYear();
    }
    if (isType(colType, ['TIME'])) {
      const pad = n => String(n).padStart(2, '0');
      return `${pad(randInt(0, 23))}:${pad(randInt(0, 59))}:${pad(randInt(0, 59))}`;
    }

    // Default: text-like placeholder = columnName + row#
    return `${colName}${rowNum}`;
  });

  editState.rows.push(newRow);
  renderEditGrid();
}
window.addEditRow = addEditRow;


function deleteEditRow(rIdx) {
  if (rIdx < 0 || rIdx >= editState.rows.length) return;
  editState.rows.splice(rIdx, 1);
  renderEditGrid();
}
window.deleteEditRow = deleteEditRow;

/**
 * Apply editor state to live DB (simple strategy):
 * - DELETE all rows from table
 * - INSERT all editor rows back
 * Then refresh the CREATE/INSERT textarea by exporting inserts in CREATE order.
 */
function applyEditsAndUpdateSchemaSql() {
  if (!db) return;
  const { tableName, columns, rows } = editState;
  if (!tableName) return;

  // Pull latest input values from DOM (in case a browser didn't fire input events)
  const inputs = editGridWrap.querySelectorAll('input.cell-input');
  inputs.forEach(inp => {
    const r = Number(inp.dataset.r);
    const c = Number(inp.dataset.c);
    if (!Number.isNaN(r) && !Number.isNaN(c) && editState.rows[r]) {
      editState.rows[r][c] = inp.value;
    }
  });

  // ✅ NEW: Validate required fields BEFORE coercion/insert
  clearCellErrors();
  const meta = getTableColumnMeta(tableName);
  const colMetaByName = new Map(meta.map(m => [m.name, m]));
  const errors = [];

  rows.forEach((row, rIdx) => {
    columns.forEach((colName, cIdx) => {
      const m = colMetaByName.get(colName);
      if (!m) return;

      // Required if NOT NULL or PK (PK implies required)
      const required = m.notNull || m.pk;

      if (required && isBlankCell(row[cIdx])) {
        errors.push({ rIdx, cIdx, colName });
        markCellError(rIdx, cIdx);
      }
    });
  });

  if (errors.length) {
    statusMessage.className = 'message-box error';
    statusMessage.textContent =
      `❌ Cannot apply edits: ${errors.length} required cell(s) are blank. ` +
      `Fill highlighted cells (NOT NULL / PK) and try again.`;
    return;
  }

  // Convert UI cell strings to typed-ish values:
  const typedRows = rows.map(row => row.map(v => coerceCellValue(v)));

  try {
    // Use a transaction
    db.run('BEGIN;');
    db.run(`DELETE FROM ${tableName};`);

    if (typedRows.length) {
      const placeholders = columns.map(() => '?').join(', ');
      const stmt = db.prepare(
        `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders});`
      );

      typedRows.forEach(r => stmt.run(r));
      stmt.free();
    }

    db.run('COMMIT;');

    refreshDbScriptTextareaFromLiveDb();
	
	saveGeneratedArtifacts({ sql: dbScriptInput.value.trim() });

    populateTableList();
    generateERD();

    queryInput.value = `SELECT * FROM ${tableName};`;
    executeQuery();

    statusMessage.className = 'message-box success';
    statusMessage.textContent = `✅ Updated table "${tableName}" and regenerated INSERT statements.`;

    closeEditPanel();
  } catch (err) {
    try { db.run('ROLLBACK;'); } catch (_) {}

    statusMessage.className = 'message-box error';
    statusMessage.textContent = `❌ Failed to apply edits: ${err.message}`;

    // ✅ NEW (3-line upgrade)
    alert(
      `Update failed:\n\n${err.message}\n\n(See console for details.)`
    );

    console.error(err);
  }
}


function showEditTableData() {
  const tableName = tableListSelect.value;
  if (!tableName) {
    alert("Please select a table to show/edit.");
    return;
  }
  openEditPanelForTable(tableName);
  tableListSelect.value = '';
}
window.showEditTableData = showEditTableData;


// ---------- Helpers for editor ----------

function showTablePreview(tableName) {
  const res = db.exec(`SELECT * FROM ${tableName};`);
  const cols = (res.length) ? res[0].columns : [];
  const rows = (res.length) ? res[0].values : [];
  resultsTableDiv.innerHTML = renderTable(cols, rows);
  statusMessage.className = 'message-box success';
  statusMessage.textContent = `✅ Showing "${tableName}" (${rows.length} row(s))`;
}

function setEditMode(isOn) {
  document.body.classList.toggle('edit-mode', !!isOn);
}

function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function randomDateTimeLast24Hours() {
  const now = Date.now();
  const past = now - randInt(0, 24 * 60 * 60) * 1000; // seconds ago
  const d = new Date(past);
  // SQLite-friendly ISO-ish (no timezone Z; keep it simple)
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function randomDateLastYear() {
  const now = Date.now();
  const past = now - randInt(0, 365 * 24 * 60 * 60) * 1000;
  const d = new Date(past);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isType(typeStr, needles) {
  const t = (typeStr || '').toUpperCase();
  return needles.some(n => t.includes(n));
}

function coerceCellValue(v) {
  // v may already be number/null from original load, or string from edits
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;

  const s = String(v);

  // empty => NULL
  if (s.trim() === '') return null;

  // If it's a clean integer/float string, store as number
  // (This keeps TEXT IDs like "1X1" as text.)
  const num = Number(s);
  if (Number.isFinite(num) && String(num) === s.trim()) return num;

  return s;
}

// ✅ NEW: required-field validation helpers
function isBlankCell(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

function getTableColumnMeta(tableName) {
  if (!db) return [];
  const info = db.exec(`PRAGMA table_info(${tableName});`);
  if (!info.length) return [];
  return info[0].values.map(row => ({
    name: row[1],
    notNull: !!row[3],
    pk: (Number(row[5] || 0) > 0)
  }));
}

function clearCellErrors() {
  editGridWrap.querySelectorAll('input.cell-input').forEach(inp => {
    inp.classList.remove('cell-error');
  });
}

function markCellError(rIdx, cIdx) {
  const inp = editGridWrap.querySelector(`input.cell-input[data-r="${rIdx}"][data-c="${cIdx}"]`);
  if (inp) inp.classList.add('cell-error');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---------- Helpers to reorder create table command in PK-safe order ----------

function normalizeIdent(name) {
  return String(name || '')
    .trim()
    .replace(/^["`[]/, '')
    .replace(/["`\]]$/, '');
}

function parseCreateTableBlocks(ddlText) {
  const ddl = ddlText || '';
  const blocks = [];
  const nonCreateLines = [];

  // We'll find CREATE TABLE blocks by scanning for "CREATE TABLE" and then
  // consuming until the next semicolon that ends the statement.
  const re = /(^|\n)\s*CREATE\s+TABLE\b/ig;
  let starts = [];
  let m;
  while ((m = re.exec(ddl)) !== null) starts.push(m.index + (m[1] ? m[1].length : 0));
  if (!starts.length) {
    return { nonCreate: ddl.trim(), blocks: [] };
  }

  // Collect everything before first CREATE as non-create
  nonCreateLines.push(ddl.slice(0, starts[0]).trim());

  // Extract CREATE statements
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const end = (i + 1 < starts.length) ? starts[i + 1] : ddl.length;
    const chunk = ddl.slice(start, end);

    // Split this chunk into: CREATE statement up to first semicolon, then leftover
    const semiIdx = chunk.indexOf(';');
    if (semiIdx === -1) {
      // malformed/no semicolon; treat as whole statement
      blocks.push(chunk.trim());
      continue;
    }
    const stmt = chunk.slice(0, semiIdx + 1).trim();
    const tail = chunk.slice(semiIdx + 1).trim();
    blocks.push(stmt);
    if (tail) nonCreateLines.push(tail); // rare, but keep anything after semicolon
  }

  return {
    nonCreate: nonCreateLines.filter(Boolean).join('\n\n').trim(),
    blocks
  };
}

function getCreateTableName(createStmt) {
  // CREATE TABLE [IF NOT EXISTS] tableName (
  const re = /^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(["`[]?)([A-Za-z_][\w]*)\1\s*\(/i;
  const m = createStmt.match(re);
  return m ? normalizeIdent(m[2]) : null;
}

function getReferencedTables(createStmt) {
  // Handles: REFERENCES otherTable(...) with optional quoting
  const refs = new Set();
  const re = /\bREFERENCES\s+(["`[]?)([A-Za-z_][\w]*)\1\b/ig;
  let m;
  while ((m = re.exec(createStmt)) !== null) {
    refs.add(normalizeIdent(m[2]));
  }
  return [...refs];
}

function topoSortTables(nodesInOriginalOrder) {
  // nodes: [{name, stmt, deps: [parent1,parent2,...]}]
  const byName = new Map(nodesInOriginalOrder.map(n => [n.name, n]));
  const indeg = new Map();
  const adj = new Map();

  // init
  nodesInOriginalOrder.forEach(n => {
    indeg.set(n.name, 0);
    adj.set(n.name, []);
  });

  // edges: parent -> child
  nodesInOriginalOrder.forEach(n => {
    n.deps.forEach(parent => {
      if (!byName.has(parent)) return; // ignore external refs
      adj.get(parent).push(n.name);
      indeg.set(n.name, (indeg.get(n.name) || 0) + 1);
    });
  });

  // Kahn's algorithm, stable using original order
  const queue = nodesInOriginalOrder
    .filter(n => (indeg.get(n.name) || 0) === 0)
    .map(n => n.name);

  const out = [];
  const inQueue = new Set(queue);

  while (queue.length) {
    const name = queue.shift();
    out.push(name);
    (adj.get(name) || []).forEach(child => {
      indeg.set(child, indeg.get(child) - 1);
      if (indeg.get(child) === 0 && !inQueue.has(child)) {
        queue.push(child);
        inQueue.add(child);
      }
    });
  }

  // Cycle / unresolved case: fall back to original order for the remaining
  if (out.length !== nodesInOriginalOrder.length) {
    const remaining = nodesInOriginalOrder.map(n => n.name).filter(nm => !out.includes(nm));
    return [...out, ...remaining];
  }

  return out;
}

function reorderDdlByForeignKeys(ddlText) {
  const { nonCreate, blocks } = parseCreateTableBlocks(ddlText);
  if (!blocks.length) return ddlText.trim();

  const nodes = blocks
    .map(stmt => {
      const name = getCreateTableName(stmt);
      return name ? { name, stmt, deps: getReferencedTables(stmt) } : null;
    })
    .filter(Boolean);

  if (!nodes.length) return ddlText.trim();

  const order = topoSortTables(nodes);
  const byName = new Map(nodes.map(n => [n.name, n.stmt]));
  const sortedCreates = order.map(nm => byName.get(nm)).filter(Boolean);

  const parts = [];
  if (nonCreate) parts.push(nonCreate);
  parts.push(sortedCreates.join('\n\n'));

  return parts.filter(Boolean).join('\n\n').trim();
}

function extractCreateOrderFromDdl(ddlText) {
  const { blocks } = parseCreateTableBlocks(ddlText);
  const names = [];
  blocks.forEach(stmt => {
    const nm = getCreateTableName(stmt);
    if (nm) names.push(nm);
  });
  return [...new Set(names)];
}