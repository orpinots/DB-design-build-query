

let db = null;
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

    const schemaScript = dbScriptInput.value.trim();
    if (!schemaScript) throw new Error("Schema script cannot be empty.");

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