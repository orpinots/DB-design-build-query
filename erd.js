// IMPORTANT: erd-presets.js must be ed before erd.js
const ERD_PRESETS = window.ERD_PRESETS || {};

// Small helper to deep-clone our ERD objects
function cloneErd(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function findRelationshipById(rid) {
  if (!rid) return null;

  // 1) Look in the current view (includes synthetic assocView_* rels)
  if (erd._viewRelationships && erd._viewRelationships.length) {
    const r = erd._viewRelationships.find(rr => rr.id === rid);
    if (r) return r;
  }

  // 2) Fallback to the underlying ERD relationships
  return (erd.relationships || []).find(rr => rr.id === rid) || null;
}


// --- CURRENT (in-progress) ERD persistence ---
const CURRENT_ERD_KEY = "erd_current";

function saveCurrentErdState(erdObj) {
  try {
    localStorage.setItem(CURRENT_ERD_KEY, JSON.stringify(erdObj));
  } catch (e) {
    console.warn("Could not save current ERD:", e);
  }
}

function loadCurrentErdState() {
  try {
    const raw = localStorage.getItem(CURRENT_ERD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.entities) || !Array.isArray(parsed.relationships)) return null;
    return parsed;
  } catch (e) {
    console.warn("Could not load current ERD:", e);
    return null;
  }
}

function clearCurrentErdState() {
  try {
    localStorage.removeItem(CURRENT_ERD_KEY);
  } catch (e) {
    console.warn("Could not clear current ERD:", e);
  }
}



let svg  = document.getElementById("svgLayer"); // changed to let, because we may move it
const svgNS = "http://www.w3.org/2000/svg";


// Use the 4-way as the default
// let erd = cloneErd(ERD_PRESETS.fourWay.data);

// Use the 4-way as the default *fallback*, but prefer the last in-progress ERD
let erd = loadCurrentErdState() || cloneErd(ERD_PRESETS.fourWay.data);

// =========================
// Mouse-drag panning (background)
// =========================

const wrap = document.getElementById("canvasWrap");

wrap.addEventListener("wheel", (e) => {
  // Zoom when Ctrl/Cmd held (trackpad pinch often comes as ctrlKey)
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const rect = wrap.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const zoomFactor = Math.exp(-e.deltaY * 0.002);
    zoomAtScreenPoint(viewScale * zoomFactor, sx, sy);
    return;
  }

  // Otherwise: trackpad two-finger scroll pans the canvas
  e.preventDefault();
  viewPanX -= e.deltaX;
  viewPanY -= e.deltaY;
  applyViewTransform();
}, { passive: false });

// Track last input type so we can ignore touch "contextmenu" (long-press)
let lastPointerType = "mouse";

document.addEventListener("pointerdown", (e) => {
  lastPointerType = e.pointerType || "mouse";
}, { capture: true });



let isMousePanning = false;
let panStart = { x: 0, y: 0 };
let panStartView = { x: 0, y: 0 };

let _scrollLockCount = 0;

let _lastDragTs = 0;

// --- Touch detection for suppressing native contextmenu ---
let _lastTouchLikeTs = 0;

let suppressContextUntil = 0;           // timestamp (ms)
let cancelActiveLongPress = null;       // function set by enableContext


function markTouchLike() {
  _lastTouchLikeTs = Date.now();
}

function isRecentTouchLike(ms = 1200) {
  return (Date.now() - _lastTouchLikeTs) < ms;
}

// Mark touch/pointer activity (capture so we see it early)
window.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "touch") markTouchLike();
}, { capture: true });

window.addEventListener("touchstart", () => {
  markTouchLike();
}, { capture: true, passive: true });

// Kill the browser's native long-press contextmenu on touch
window.addEventListener("contextmenu", (e) => {
  // Android can fire contextmenu after touch-drag; kill it if we touched OR dragged recently.
  if (isRecentTouchLike() || isRecentDrag()) {
    e.preventDefault();
    e.stopPropagation();
  }
}, { capture: true });


function markDrag() {
  _lastDragTs = Date.now();
}

function isRecentDrag(ms = 1200) {
  return (Date.now() - _lastDragTs) < ms;
}

function lockPageScroll() {
  _scrollLockCount++;
  if (_scrollLockCount === 1) {
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
  }
}

function unlockPageScroll() {
  _scrollLockCount = Math.max(0, _scrollLockCount - 1);
  if (_scrollLockCount === 0) {
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
  }
}

function isPanBackgroundTarget(t) {
  if (!t) return true;

  // Don't pan when starting on draggable ERD objects / UI
  if (t.closest?.(".entity")) return false;
  if (t.closest?.(".rel-hit")) return false;
  if (t.closest?.(".attr-hit")) return false;
  if (t.closest?.("#ctxMenu")) return false;
  if (t.closest?.("#relCtxMenu")) return false;
  if (t.closest?.(".modal")) return false;

  return true; // empty canvas / svg / stage
}

wrap.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "mouse") return;
  if (e.button !== 0) return;                 // left button only
  if (!isPanBackgroundTarget(e.target)) return;

  // Don't start mouse-pan if a two-finger gesture is active
  if (activePtrs && activePtrs.size >= 2) return;

  e.preventDefault();

  isMousePanning = true;
  panStart = { x: e.clientX, y: e.clientY };
  panStartView = { x: viewPanX, y: viewPanY };

  try { wrap.setPointerCapture(e.pointerId); } catch {}
}, { passive: false, capture: true });

wrap.addEventListener("pointermove", (e) => {
  if (!isMousePanning) return;
  if (e.pointerType !== "mouse") return;

  e.preventDefault();

  const dx = e.clientX - panStart.x;
  const dy = e.clientY - panStart.y;

  viewPanX = panStartView.x + dx;
  viewPanY = panStartView.y + dy;
  clampPanToContent();
  applyViewTransform();
}, { passive: false, capture: true });

function endMousePan(e) {
  if (e && e.pointerType === "mouse") {
    try { wrap.releasePointerCapture(e.pointerId); } catch {}
  }
  isMousePanning = false;
}

wrap.addEventListener("pointerup", endMousePan, { capture: true });
wrap.addEventListener("pointercancel", endMousePan, { capture: true });


let stage = null;

// ===== Pan/Zoom (world -> screen transform) =====

// world-to-screen: screen = world * viewScale + (viewPanX, viewPanY)
let viewScale = 1;
let viewPanX = 0;
let viewPanY = 0;
const PAN_SENS = 0.35;      // 0.20–0.50 is typical on tablets
const PAN_DEAD_PX = 2.0;    // ignore tiny jitter in pixels

const MIN_SCALE = 0.35;
const MAX_SCALE = 2.5;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function applyViewTransform() {
  if (!stage) return;
  stage.style.transform = `translate(${viewPanX}px, ${viewPanY}px) scale(${viewScale})`;
}

function getContentWorldBounds() {
  const ents = (erd && erd.entities) ? erd.entities : [];
  if (!ents.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const ent of ents) {
    const x = ent.x || 0;
    const y = ent.y || 0;
    const w = ent.width  || 140;
    const h = ent.height || 60;

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);

    // Include pinned attribute ovals if present
    const attrs = ent.attributes || [];
    for (const a of attrs) {
      if (typeof a.ovalX === "number" && typeof a.ovalY === "number") {
        // Conservative oval extents (rx depends on label length, but this works well)
        const rx = 90;
        const ry = 22;
        minX = Math.min(minX, a.ovalX - rx);
        maxX = Math.max(maxX, a.ovalX + rx);
        minY = Math.min(minY, a.ovalY - ry);
        maxY = Math.max(maxY, a.ovalY + ry);
      }
    }
  }

  // Fallback safety
  if (!Number.isFinite(minX)) minX = minY = maxX = maxY = 0;
  return { minX, minY, maxX, maxY };
}

function clampPanToContent() {
  if (!wrap) return;

  const vw = wrap.clientWidth;
  const vh = wrap.clientHeight;

  const PAD = 80; // visible breathing room around content (tweak: 40–140)

  const { minX, minY, maxX, maxY } = getContentWorldBounds();

  const contentW = (maxX - minX);
  const contentH = (maxY - minY);

  const scaledW = contentW * viewScale;
  const scaledH = contentH * viewScale;

  // If content is smaller than viewport, center it (with padding ignored)
  if (scaledW + 2 * PAD <= vw) {
    viewPanX = (vw - scaledW) / 2 - minX * viewScale;
  } else {
    // Clamp so you can’t pan content completely out of view
    const minPanX = vw - (maxX * viewScale) - PAD; // farthest left
    const maxPanX = -(minX * viewScale) + PAD;     // farthest right
    viewPanX = clamp(viewPanX, minPanX, maxPanX);
  }

  if (scaledH + 2 * PAD <= vh) {
    viewPanY = (vh - scaledH) / 2 - minY * viewScale;
  } else {
    const minPanY = vh - (maxY * viewScale) - PAD; // farthest up
    const maxPanY = -(minY * viewScale) + PAD;     // farthest down
    viewPanY = clamp(viewPanY, minPanY, maxPanY);
  }
}


// Create a transform stage that will contain BOTH svg + entity divs
(function initStage() {
  // If already created, do nothing
  if (document.getElementById("erdStage")) {
    stage = document.getElementById("erdStage");
    return;
  }

  stage = document.createElement("div");
  stage.id = "erdStage";

  // Move the existing SVG into the stage
  if (svg && svg.parentElement) {
    svg.parentElement.removeChild(svg);
  }
  stage.appendChild(svg);

  // ✅ Critical: allow lines/ovals to render outside the SVG viewport
  svg.style.overflow = "visible";
  svg.setAttribute("overflow", "visible");

  // Put stage into canvasWrap
  wrap.appendChild(stage);
  // Put stage into canvasWrap
  wrap.appendChild(stage);

  // start with identity transform
  applyViewTransform();
  stage.style.transformOrigin = "0 0";
  setTouchActionNone(wrap);
  if (stage) setTouchActionNone(stage);
})();



// Convert a pointer/mouse event to WORLD coords (the coordinate system your ERD uses)
function eventToWorld(ev) {
  const rect = document.getElementById("canvasWrap").getBoundingClientRect();
  const sx = ev.clientX - rect.left;
  const sy = ev.clientY - rect.top;
  return {
    x: (sx - viewPanX) / viewScale,
    y: (sy - viewPanY) / viewScale
  };
}

// Convert SCREEN coords (relative to canvasWrap) to WORLD coords
function screenToWorld(sx, sy) {
  return {
    x: (sx - viewPanX) / viewScale,
    y: (sy - viewPanY) / viewScale
  };
}

// Zoom around a specific SCREEN point (sx,sy) so the world point under the cursor stays fixed
function zoomAtScreenPoint(newScale, sx, sy) {
  newScale = clamp(newScale, MIN_SCALE, MAX_SCALE);
  const before = screenToWorld(sx, sy);
  viewScale = newScale;
  // keep `before` pinned under (sx,sy)
  viewPanX = sx - before.x * viewScale;
  viewPanY = sy - before.y * viewScale;
  clampPanToContent();
  applyViewTransform();
}



// =========================
// Two-finger pan + pinch zoom (canvasWrap)
// =========================
const activePtrs = new Map(); // pointerId -> {sx, sy}
let gestureMode = null;       // null | "panzoom"
let startDist = 0;
let startScale = 1;
let startPanX = 0;
let startPanY = 0;
let startMid = { x: 0, y: 0 };

function dist(a, b) {
  const dx = a.sx - b.sx;
  const dy = a.sy - b.sy;
  return Math.hypot(dx, dy);
}
function midpoint(a, b) {
  return { x: (a.sx + b.sx) / 2, y: (a.sy + b.sy) / 2 };
}
function updatePtrFromEvent(ev) {
  const rect = wrap.getBoundingClientRect();
  activePtrs.set(ev.pointerId, {
    sx: ev.clientX - rect.left,
    sy: ev.clientY - rect.top
  });
}

function onWrapPointerDown(ev) {
  // only touch/pen for gestures; mouse wheel can be separate later
  if (ev.pointerType === "mouse") return;

  // allow entities to handle 1-finger drags; we only engage at 2 pointers
  updatePtrFromEvent(ev);
  activePtrs.set(ev.pointerId, activePtrs.get(ev.pointerId));
  try { wrap.setPointerCapture(ev.pointerId); } catch {}

  if (activePtrs.size === 2) {
    ev.preventDefault(); // key
    lockPageScroll();              // <-- add
    gestureMode = "panzoom";

    const pts = [...activePtrs.values()];
    startDist = dist(pts[0], pts[1]);
    startScale = viewScale;
    startPanX = viewPanX;
    startPanY = viewPanY;
    startMid = midpoint(pts[0], pts[1]);
  }
}

function onWrapPointerMove(ev) {
  if (!activePtrs.has(ev.pointerId)) return;
  updatePtrFromEvent(ev);

  if (gestureMode === "panzoom" && activePtrs.size >= 2) {
    ev.preventDefault();

    const pts = [...activePtrs.values()];
    const mid = midpoint(pts[0], pts[1]);
    const d = dist(pts[0], pts[1]) || 1;

    // pinch -> scale
    const rawScale = startScale * (d / startDist);
    const newScale = clamp(rawScale, MIN_SCALE, MAX_SCALE);

    // keep the world point under the starting midpoint pinned under the current midpoint
    const worldUnderStartMid = screenToWorld(startMid.x, startMid.y);

	// --- compute the "full" target pan (no damping) ---
	const targetPanX = mid.x - worldUnderStartMid.x * newScale;
	const targetPanY = mid.y - worldUnderStartMid.y * newScale;

	// --- optional dead-zone to avoid jitter ---
	let dx = targetPanX - startPanX;
	let dy = targetPanY - startPanY;
	if (Math.abs(dx) < PAN_DEAD_PX) dx = 0;
	if (Math.abs(dy) < PAN_DEAD_PX) dy = 0;

	// --- apply damping ---
	viewScale = newScale;
	viewPanX = startPanX + dx * PAN_SENS;
	viewPanY = startPanY + dy * PAN_SENS;

	applyViewTransform();
	
  }
}

function onWrapPointerUp(ev) {
  if (activePtrs.has(ev.pointerId)) activePtrs.delete(ev.pointerId);
  try { wrap.releasePointerCapture(ev.pointerId); } catch {}

  if (activePtrs.size < 2) {
    gestureMode = null;
    unlockPageScroll();            // <-- add
  }
}

// IMPORTANT: capture:true so it still runs even if entity drag stops propagation
wrap.addEventListener("pointerdown", onWrapPointerDown, { passive: false, capture: true });
wrap.addEventListener("pointermove", onWrapPointerMove, { passive: false, capture: true });
wrap.addEventListener("pointerup", onWrapPointerUp, { capture: true });
wrap.addEventListener("pointercancel", onWrapPointerUp, { capture: true });




// =========================
// Pointer / Touch utilities
// =========================
function clientPointFromEvent(ev) {
  // PointerEvent / MouseEvent
  if (ev && typeof ev.clientX === "number") {
    return { clientX: ev.clientX, clientY: ev.clientY };
  }
  // TouchEvent fallback (rare if pointer events are supported)
  const t = (ev.touches && ev.touches[0]) || (ev.changedTouches && ev.changedTouches[0]);
  if (t) return { clientX: t.clientX, clientY: t.clientY };
  return { clientX: 0, clientY: 0 };
}

function localPointInWrapFromClient(clientX, clientY) {
  const rect = wrap.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top
  };
}

function pagePointFromClient(clientX, clientY) {
  // For positioning context menus (absolute on page)
  return {
    x: clientX + window.scrollX,
    y: clientY + window.scrollY
  };
}

// Prevent iOS "double-tap to zoom" / pan conflicts while dragging
function setTouchActionNone(el) {
  // pointer events honor touch-action; makes dragging reliable on tablets
  el.style.touchAction = "none";
}



const SQL_TYPE_OPTIONS = [
  "INTEGER",
  "REAL",
  "TEXT",
  "BOOLEAN",
  "DATE",
  "TIMESTAMP",
  "DECIMAL(10,2)"
];

let showAttributeOvals = false;

// --- ERD canvas save/ config ---
const ERD_STORAGE_KEY = 'erd_canvas_layouts';
const MAX_ERD_SAVES   = 10;


// Build the label for an attribute.
// inOvals = true  → no [PK]/[FK] tags (ovals view)
// inOvals = false → include [PK]/[FK] tags (box view)
// isDiscriminator = optional flag for weak partial keys
function getAttrLabel(attr, inOvals, isDiscriminator = false) {
  const base = attr.name || "";

  if (inOvals) {
    // ✅ Ovals mode: always clean text
    return base;
  }

  // ✅ Box mode: show structural tags
  const tags = [];

  if (attr.pk) tags.push("PK");
  if (attr.fk) tags.push("FK");

  // Multi-valued attribute
  if (attr.multi) tags.push(":*");

  // Optional attribute (only if NOT a PK)
  if (!attr.pk && !attr.notNull) tags.push("O");

  const suffix = tags.length ? ` [${tags.join(", ")}]` : "";
  return `${base}${suffix}`;
}


function isBorrowedOwnerKey(ent, attr) {
  // In a weak entity, borrowed owner keys are PK *and* FK
  return !!(ent.isWeak && attr.pk && attr.fk);
}

function isDiscriminatorKey(ent, attr) {
  // In a weak entity, discriminator is PK but *not* FK
  return !!(ent.isWeak && attr.pk && !attr.fk);
}

// In a specialization hierarchy, hide PKs that are inherited from a supertype.
// We detect this by:
//   - a relationship r with specializationExtras (a = supertype);
//   - ent is either r.b or in r.specializationExtras (subtypes);
//   - attr.pk is true and its name matches a PK on the supertype.
function isInheritedPkFromSuper(ent, attr) {
  if (!attr || !attr.pk || !attr.name) return false;
  const attrName = attr.name.toLowerCase();

  const rels = erd.relationships || [];
  for (const r of rels) {
    const specExtras = r.specializationExtras || [];
    if (!specExtras.length) continue;

    // supertype = r.a
    const superEnt = erd.entities.find(e => e.id === r.a);
    if (!superEnt) continue;

    // is this entity a subtype in this specialization?
    const isSubtype =
      ent.id === r.b ||
      specExtras.includes(ent.id);

    if (!isSubtype) continue;

    const superPkNames = (superEnt.attributes || [])
      .filter(a => a.pk && a.name)
      .map(a => a.name.toLowerCase());

    if (superPkNames.includes(attrName)) {
      return true; // this PK on the subtype is inherited from the supertype
    }
  }

  return false;
}


//   /* menus & modals */
const ctxMenu = document.getElementById("ctxMenu");
let ctxEntityId = null;
const relCtxMenu = document.getElementById("relCtxMenu");
let ctxRelId = null;

const entityModal = document.getElementById("entityModal");
const entityNameInput = document.getElementById("entityNameInput");
const entityAttrBody = document.getElementById("entityAttrBody");
let editingEntityId = null;

const relModal = document.getElementById("relModal");
const relNameInput = document.getElementById("relNameInput");
const relSidesPanel = document.getElementById("relSidesPanel");
let editingRelId = null;
const relAttrBody = document.getElementById("relAttrBody");


document.addEventListener("click", e => {
  const inEntityMenu =
    ctxMenu.contains(e.target);

  if (!inEntityMenu) {
    ctxMenu.style.display = "none";
    resetCtxSubmenus();
  }

  if (!relCtxMenu.contains(e.target)) relCtxMenu.style.display = "none";
});


// Heuristic: mark associative entities based on PK/FK pattern
function autoMarkAssociativeEntities(erdObj) {
  if (!erdObj || !Array.isArray(erdObj.entities)) return;

  (erdObj.entities || []).forEach(ent => {
    const attrs = ent.attributes || [];
    if (!attrs.length) return;

    const pkAttrs = attrs.filter(a => a.pk);
    const fkAttrs = attrs.filter(a => a.fk);

    // Associative/junction pattern:
    //  - at least 2 PK attributes
    //  - every PK is also an FK
    //  - at least 2 FKs overall
    const allPkAreFk =
      pkAttrs.length >= 2 &&
      pkAttrs.every(a => a.fk);

    if (allPkAreFk && fkAttrs.length >= 2) {
      // Only ever *set* the flag; don't auto-unset in case user
      // explicitly converted something to associative.
      ent.isAssociative = true;
    }
  });
}

// Build a "view" relationship list when we are collapsing associative entities
// into M:N / n-ary relationships. Returns:
//   { relationships: [...], hiddenAssocIds: Set<string> }
function buildViewRelationships(erd, showAssocAsMM) {
  const entities      = erd.entities || [];
  const relationships = erd.relationships || [];

  // Default view: no collapsing, just return originals
  if (!showAssocAsMM) {
    const viewEntities      = entities;
    const viewRelationships = relationships;
    erd._viewRelationships  = viewRelationships;
    return { viewEntities, viewRelationships };
  }

  // ---------- Build adjacency: which relationships touch which entities ----------
  const relsByEntity = new Map();
  (relationships || []).forEach(r => {
    const ids = [r.a, r.b, ...(r.extras || [])];
    ids.forEach(id => {
      if (!id) return;
      if (!relsByEntity.has(id)) relsByEntity.set(id, []);
      relsByEntity.get(id).push(r);
    });
  });

  const assocIds   = new Set();   // ids of associative entities we hide in this view
  const synthetic  = [];          // synthetic M:N (or n-ary) relationships we create

  (entities || []).forEach(ent => {
    if (!ent.isAssociative) return;

    const rels = relsByEntity.get(ent.id) || [];
    if (!rels.length) return;

    // Collect all distinct neighbor entities (excluding the associative entity itself)
    const neighborIdsSet = new Set();
    rels.forEach(r => {
      [r.a, r.b, ...(r.extras || [])].forEach(id => {
        if (id && id !== ent.id) neighborIdsSet.add(id);
      });
    });

    const neighborIds = [...neighborIdsSet];
    if (neighborIds.length < 2) return;   // need at least 2 parents

    // For binary associative entities, this yields 2 parents.
    // For n-ary associative entities, this yields 3+ parents.
    const [first, ...rest] = neighborIds;

    const syn = {
      id: "assocView_" + ent.id,
      name: ent.name || "",
      type: "N:N",           // A and B are many
      a: first,
      b: rest[0],
      extras: rest.slice(1), // for 3-way, 4-way, ...
      optA: true,            // we’ll show 0..N via drawRelationship()
      optB: true,
      synthetic: true,       // 🔹 mark as synthetic
      assocEntityId: ent.id,  // 🔹 remember which associative entity it came from
      fromAssocCollapse: true   // NEW: flag for drawing logic (0..N extras etc.)
    };

	// 🔹 NEW: treat non-key attributes of the associative entity
	//         as relationship attributes on the synthetic diamond.
	//         We also wire them back to the source entity attribute so
	//         dragging can persist layout.
	const nonKeyAttrs = (ent.attributes || []).filter(a => !a.pk && !a.fk);
	if (nonKeyAttrs.length) {
	  syn.attributes = nonKeyAttrs.map(a => {
	    // index of this attribute in the *entity* definition
	    const srcIndex = ent.attributes.indexOf(a);

	    const viewAttr = {
	      name: a.name,
	      type: a.type || "TEXT",
	      notNull: !!a.notNull,

	      // so the drag handler knows how to persist back
	      _assocEntityId: ent.id,
	      _assocAttrIndex: srcIndex
	    };

	    // if we’ve previously dragged this, reuse stored coords
	    if (typeof a.relOvalX === "number") {
	      viewAttr.ovalX = a.relOvalX;
	    }
	    if (typeof a.relOvalY === "number") {
	      viewAttr.ovalY = a.relOvalY;
	    }

	    return viewAttr;
	  });
	}
    synthetic.push(syn);
    assocIds.add(ent.id);
  });

  // Hide associative entities themselves in this view
  const viewEntities = (entities || []).filter(e => !assocIds.has(e.id));

  // Remove any base relationships that touch those associative entities
  const baseRels = (relationships || []).filter(r => {
    const ids = [r.a, r.b, ...(r.extras || [])];
    return !ids.some(id => assocIds.has(id));
  });

  const viewRelationships = baseRels.concat(synthetic);

  // Store the *current* view so dragging code can look up synthetic rels
  erd._viewRelationships = viewRelationships;

  return { viewEntities, viewRelationships };
}



//  ---------- RENDER ---------- */
function render() {
  // autoMarkAssociativeEntities(erd);   // now handled in schemaEngine
  stage.querySelectorAll(".entity, .rel-hit, .attr-hit").forEach(e => e.remove());
  svg.innerHTML = "";

  if (!erd || !erd.entities || !erd.relationships) return;

  // Instead of manually fiddling with showAssocAsMM here, delegate to helper:
  const { viewEntities, viewRelationships } = buildViewRelationships(erd, showAssocAsMM);

  // --------- Draw entities (from the view) ----------
  viewEntities.forEach(ent => {
    const d = document.createElement("div");

    d.className = "entity";
    d.style.left = ent.x + "px";
    d.style.top  = ent.y + "px";
    d.dataset.id = ent.id;
    if (ent.isWeak) d.classList.add("weak-entity");
    if (ent.isAssociative) d.classList.add("assoc-entity");

    // 1. Build the Text Content
    const textStyle = "position:relative; z-index:2; pointer-events:none;";
    let contentHtml = "";

	if (showAttributeOvals) {
	  contentHtml = `<div style="${textStyle}"><b>${ent.name}</b></div>`;
	} else {
	  // For weak entities, hide borrowed owner keys (PK+FK),
	  // and mark discriminator keys (PK but not FK) for dashed underline.
	  const visibleAttrs = (ent.attributes || []).filter(a =>
	    !isBorrowedOwnerKey(ent, a) &&
	    !isInheritedPkFromSuper(ent, a)   // 🔹 hide inherited PKs from supertype
	  );
	  contentHtml =
	    `<div style="${textStyle}"><b>${ent.name}</b><br>` +
	    visibleAttrs
	      .map(a => getAttrLabel(a, false, isDiscriminatorKey(ent, a)))
	      .join("<br>") +
	    "</div>";
	}

    // 2. If Associative, inject the SVG Diamond Outline BEHIND the text
    // Only when we are *not* collapsing them into M:N lines
    if (ent.isAssociative && !showAssocAsMM) {
      contentHtml += `
        <svg xmlns="http://www.w3.org/2000/svg" 
             width="100%" height="100%" 
             viewBox="0 0 100 100" 
             preserveAspectRatio="none" 
             style="position:absolute; top:0; left:0; z-index:1; pointer-events:none;">
          <polygon points="50,0 100,50 50,100 0,50" 
                   fill="none" 
                   stroke="#2d6cff" 
                   stroke-width="2" 
                   vector-effect="non-scaling-stroke" /> 
        </svg>
      `;
    }

    d.innerHTML = contentHtml;

    enableDrag(d);
    enableContext(d);
    stage.appendChild(d);

    ent.width  = d.offsetWidth;
    ent.height = d.offsetHeight;
  });

  // --------- Draw relationships (from the view) ----------
  viewRelationships.forEach(r => drawRelationship(r));

  // --------- Attribute ovals, if enabled ----------
  if (showAttributeOvals) {
    viewEntities.forEach(ent => drawAttributeOvalsForEntity(ent));
  }
  // persist current ERD for schema.html and sandbox.html
  saveCurrentErdState(erd);
}

function toggleAttrView() {
  showAttributeOvals = !showAttributeOvals;
  const btn = document.getElementById("toggleAttrViewBtn");
  btn.textContent = showAttributeOvals ? "Attributes: Ovals" : "Attributes: In Box";
  render();
}

// If a relationship has an explicit (x,y), use it.
// Otherwise, fall back to a reasonable default position.
//
// Unary (recursive) relationships: place the diamond above the entity's TOP edge
// so it doesn't start buried inside the box.
function getRelDiamondPosition(rel, axCenter, ayCenter, bxCenter, byCenter, aTopY) {
  if (typeof rel.x === "number" && typeof rel.y === "number") {
    return { x: rel.x, y: rel.y };
  }

  // Unary: same entity on both sides (centers coincide)
  if (axCenter === bxCenter && ayCenter === byCenter) {
    const gapAboveBox = 26;  // tweak to taste: 20–40 is typical
    return {
      x: axCenter,
      y: (typeof aTopY === "number") ? (aTopY - gapAboveBox) : (ayCenter - 60)
    };
  }

  // Normal binary case: midpoint
  return {
    x: (axCenter + bxCenter) / 2,
    y: (ayCenter + byCenter) / 2
  };
}

function drawRelationshipAttributes(ctx, rel, cx, cy) {
  const attrs = rel.attributes || [];
  if (!attrs.length) return;

  const radius = 55;              // distance from diamond center
  const angleStep = (Math.PI * 2) / attrs.length;

  attrs.forEach((attr, i) => {
    // start at -90° (top) and go around
    const angle = -Math.PI / 2 + i * angleStep;
    const ax = cx + radius * Math.cos(angle);
    const ay = cy + radius * Math.sin(angle);

    drawAttributeOval(ctx, attr, ax, ay);
  });
}

function drawDoubleLine(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx*dx + dy*dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const offset = 2;

  const coords = [
    { ox:  px * offset, oy:  py * offset },
    { ox: -px * offset, oy: -py * offset }
  ];

  coords.forEach(c => {
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", x1 + c.ox);
    line.setAttribute("y1", y1 + c.oy);
    line.setAttribute("x2", x2 + c.ox);
    line.setAttribute("y2", y2 + c.oy);
    line.setAttribute("stroke", "#222");
    line.setAttribute("stroke-width", "2");
    svg.appendChild(line);
  });
}


function drawRoleLabelNearMinSymbol(endX, endY, towardX, towardY, roleText, perpSign = 1, fixedPerp = null) {
  if (!roleText) return;

  const dx = towardX - endX;
  const dy = towardY - endY;
  const len = Math.sqrt(dx*dx + dy*dy) || 1;
  const ux = dx / len, uy = dy / len;

  let px, py;
  if (fixedPerp && typeof fixedPerp.x === "number" && typeof fixedPerp.y === "number") {
    px = fixedPerp.x; py = fixedPerp.y;
  } else {
    px = -uy; py = ux;
  }

  const offsetAlong = 30;          // move a bit away from the min symbol
  const offsetPerp  = 12 * perpSign; // separate labels left/right of leg

  const tx = endX + ux * offsetAlong + px * offsetPerp;
  const ty = endY + uy * offsetAlong + py * offsetPerp;

  const t = document.createElementNS(svgNS, "text");
  t.setAttribute("x", tx);
  t.setAttribute("y", ty);
  t.setAttribute("text-anchor", "middle");
  t.style.fontSize = "10px";
  t.style.fill = "#222";
  t.textContent = roleText;
  svg.appendChild(t);
}

//  ---------- Relationships + Crow's Feet ---------- */
function drawRelationship(r) {
  const a = erd.entities.find(e => e.id === r.a);
  const b = erd.entities.find(e => e.id === r.b);
  if (!a || !b) return;

  const extras = r.extras || [];
  const isNAry = extras.length > 0;
  const specExtras = r.specializationExtras || [];
  const isSpecialization = specExtras.length > 0;
  const specDisjoint = (r.specializationDisjoint !== false); // default: disjoint
  const specTotal    = !!r.specializationTotal;

  const aHalfW = (a.width  || 140) / 2;
  const aHalfH = (a.height ||  60) / 2;
  const bHalfW = (b.width  || 140) / 2;
  const bHalfH = (b.height ||  60) / 2;

  const axCenter = a.x + aHalfW;
  const ayCenter = a.y + aHalfH;
  const bxCenter = b.x + bHalfW;
  const byCenter = b.y + bHalfH;

  // cardinalities
  const typeStr   = (r.type || "1:1").toUpperCase();
  const parts     = typeStr.split(":");
  const leftCard  = (parts[0] || "1").toUpperCase();
  const rightCard = (parts[1] || "1").toUpperCase();

  const isManyA = isNAry ? true : /[NM]/.test(leftCard);
  const isManyB = isNAry ? true : /[NM]/.test(rightCard);

  // Unary (recursive) relationship = same entity on both ends,
  // not n-ary and not specialization.
  const isUnary =
    !isNAry &&
    !isSpecialization &&
    a.id === b.id;

  // Effective min-cardinality flags used for drawing inner symbols.
  // For relationships synthesized from collapsing an associative entity,
  // we *only* know they are "0..N" on each side, so force optA/optB = true.
  const optA = r.fromAssocCollapse ? true : !!r.optA;
  const optB = r.fromAssocCollapse ? true : !!r.optB;

  const crowMargin = 0.5;

  // ---- diamond position (possibly user-dragged) ----
  const pos = getRelDiamondPosition(r, axCenter, ayCenter, bxCenter, byCenter, a.y);
  const mx  = pos.x;
  const my  = pos.y;

  // ---- connect diamond to A & B ----
  let aEnd, bEnd;

  if (isUnary) {
    // Unary: attach to the box edge in the direction of the diamond,
    // then split into two nearby points along the perpendicular.
    const cx = axCenter;
    const cy = ayCenter;

    // Where the "main" leg would hit the box edge, toward the diamond
    const base = edgePoint(
      cx, cy, mx, my,
      aHalfW, aHalfH,
      0
    );

    // Vector from base -> diamond, for a stable perpendicular
    const dx = mx - base.x;
    const dy = my - base.y;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    const ux = dx / len;
    const uy = dy / len;

    // Perpendicular direction
    const px = -uy;
    const py = ux;

    // How far apart the two attachment points are
    const sep = 16; // tweak to taste (12–22 is typical)

    aEnd = { x: base.x + px * sep, y: base.y + py * sep };
    bEnd = { x: base.x - px * sep, y: base.y - py * sep };
  } else {
    // Normal binary / n-ary:
    aEnd = edgePoint(
      axCenter, ayCenter, mx, my, aHalfW, aHalfH,
      isManyA ? crowMargin : 0
    );
    bEnd = edgePoint(
      bxCenter, byCenter, mx, my, bHalfW, bHalfH,
      isManyB ? crowMargin : 0
    );
  }

  // Decide where to use double lines:
  // - specialization + total: double from supertype (A)
  // - identifying: double from weak/child side (opposite parentSide)
  const isIdentifying = !!r.identifying;
  const useDoubleA =
    (isSpecialization && specTotal) || (isIdentifying && r.parentSide === "b");
  const useDoubleB =
    (isIdentifying && r.parentSide === "a");

  // ---- A side ----
  if (useDoubleA) {
    drawDoubleLine(aEnd.x, aEnd.y, mx, my);
  } else {
    const lineA = document.createElementNS(svgNS, "line");
    lineA.setAttribute("x1", aEnd.x);
    lineA.setAttribute("y1", aEnd.y);
    lineA.setAttribute("x2", mx);
    lineA.setAttribute("y2", my);
    lineA.setAttribute("stroke", "#222");
    lineA.setAttribute("stroke-width", "2");
    svg.appendChild(lineA);
  }

  // ---- B side ----
  if (useDoubleB) {
    drawDoubleLine(bEnd.x, bEnd.y, mx, my);
  } else {
    const lineB = document.createElementNS(svgNS, "line");
    lineB.setAttribute("x1", bEnd.x);
    lineB.setAttribute("y1", bEnd.y);
    lineB.setAttribute("x2", mx);
    lineB.setAttribute("y2", my);
    lineB.setAttribute("stroke", "#222");
    lineB.setAttribute("stroke-width", "2");
    svg.appendChild(lineB);
  }

  // A/B side cardinalities
  // For specialization hierarchies (is-a), Chen notation does NOT show
  // crow’s feet or 1-bars on any branch, so we skip them entirely.
  if (!isSpecialization) {
    // A side
    if (isManyA) {
      drawCrowFoot(aEnd.x, aEnd.y, mx, my);
    } else {
      drawOuterOneBar(aEnd.x, aEnd.y, mx, my);
    }
    if (optA) {
      drawInnerCircle(aEnd.x, aEnd.y, mx, my);
    } else {
      drawInnerOneBar(aEnd.x, aEnd.y, mx, my);
    }

    // B side
    if (isManyB) {
      drawCrowFoot(bEnd.x, bEnd.y, mx, my);
    } else {
      drawOuterOneBar(bEnd.x, bEnd.y, mx, my);
    }
    if (optB) {
      drawInnerCircle(bEnd.x, bEnd.y, mx, my);
    } else {
      drawInnerOneBar(bEnd.x, bEnd.y, mx, my);
    }
    // ---- role labels (binary/unary only; not n-ary; not specialization) ----
    if (!isNAry) {
      // Keep them short so they don't clutter; optional
      const roleA = (r.roleA || "").trim();
      const roleB = (r.roleB || "").trim();
	  // Choose perp signs so each label is pushed OUTWARD from the diamond,
	  // not both toward the middle.
	  if (isUnary) {
	    if (roleA) drawRoleLabelNearMinSymbol(aEnd.x, aEnd.y, mx, my, roleA, +1);
	    if (roleB) drawRoleLabelNearMinSymbol(bEnd.x, bEnd.y, mx, my, roleB, -1);
	  } else {
	    const aPerpSign = (aEnd.x < mx) ? -1 : +1;
	    const bPerpSign = (bEnd.x < mx) ? +1 : -1;

	    if (roleA) drawRoleLabelNearMinSymbol(aEnd.x, aEnd.y, mx, my, roleA, aPerpSign);
	    if (roleB) drawRoleLabelNearMinSymbol(bEnd.x, bEnd.y, mx, my, roleB, bPerpSign);
	  }
    }
  }

  // ---- n-ary extras (always many) ----
  // For n-ary relationships, draw extra spokes from the diamond.
  extras.forEach(extraId => {
    const ent = erd.entities.find(e => e.id === extraId);
    if (!ent) return;

    const halfW = (ent.width  || 140) / 2;
    const halfH = (ent.height ||  60) / 2;
    const cx    = ent.x + halfW;
    const cy    = ent.y + halfH;

    // point on entity’s box edge toward the diamond
    const entEnd = edgePoint(cx, cy, mx, my, halfW, halfH, crowMargin);

    // line from diamond to entity edge
    const lineExtra = document.createElementNS(svgNS, "line");
    lineExtra.setAttribute("x1", mx);
    lineExtra.setAttribute("y1", my);
    lineExtra.setAttribute("x2", entEnd.x);
    lineExtra.setAttribute("y2", entEnd.y);
    lineExtra.setAttribute("stroke", "#222");
    lineExtra.setAttribute("stroke-width", "2");
    svg.appendChild(lineExtra);

    // max multiplicity = Many (crow's foot at entity side)
    drawCrowFoot(entEnd.x, entEnd.y, mx, my);

    // Min multiplicity:
    // • Normal n-ary relationships: 1..N  → inner bar
    // • Collapsed associative n-ary: 0..N → inner circle
    if (r.fromAssocCollapse) {
      drawInnerCircle(entEnd.x, entEnd.y, mx, my);
    } else {
      drawInnerOneBar(entEnd.x, entEnd.y, mx, my);
    }
  });

  // ---- specialization extras (all 1:1) ----
  specExtras.forEach(extraId => {
    const ent = erd.entities.find(e => e.id === extraId);
    if (!ent) return;

    const halfW = (ent.width  || 140) / 2;
    const halfH = (ent.height ||  60) / 2;
    const cx    = ent.x + halfW;
    const cy    = ent.y + halfH;

    // point on entity’s box edge toward the central circle
    const entEnd = edgePoint(cx, cy, mx, my, halfW, halfH, 0);

    // line from circle to entity edge
    const lineExtra = document.createElementNS(svgNS, "line");
    lineExtra.setAttribute("x1", mx);
    lineExtra.setAttribute("y1", my);
    lineExtra.setAttribute("x2", entEnd.x);
    lineExtra.setAttribute("y2", entEnd.y);
    lineExtra.setAttribute("stroke", "#222");
    lineExtra.setAttribute("stroke-width", "2");
    svg.appendChild(lineExtra);

    // Chen: no crow’s-foot/1-bars on specialization arms.
  });

  function drawDiamond(size) {
    const p = document.createElementNS(svgNS, "polygon");
    p.setAttribute(
      "points",
      `${mx},${my-size} ${mx+size},${my} ${mx},${my+size} ${mx-size},${my}`
    );
    p.setAttribute("fill", "white");
    p.setAttribute("stroke", "black");
    svg.appendChild(p);
  }

  if (isSpecialization) {
    // specialization: circle with 'd' or 'o'
    const c = document.createElementNS(svgNS, "circle");
    c.setAttribute("cx", mx);
    c.setAttribute("cy", my);
    c.setAttribute("r", 9);
    c.setAttribute("fill", "white");
    c.setAttribute("stroke", "black");
    svg.appendChild(c);

    const t = document.createElementNS(svgNS, "text");
    t.setAttribute("x", mx);
    t.setAttribute("y", my + 4);
    t.setAttribute("text-anchor", "middle");
    t.style.fontSize = "10px";
    t.textContent = specDisjoint ? "d" : "o"; // disjoint vs overlapping
    svg.appendChild(t);

  } else if (r.identifying) {
    // Bigger double-diamond for identifying relationships
    drawDiamond(17);   // outer
    drawDiamond(12);   // inner
  } else {
    // Regular relationship diamond
    drawDiamond(16);
  }

  // label
  const label = document.createElementNS(svgNS, "text");
  label.setAttribute("x", mx + 10);
  label.setAttribute("y", my - 10);
  label.textContent = r.name;
  svg.appendChild(label);

  // relationship attributes, if any
  const relAttrs = r.attributes || [];
  if (relAttrs.length) {
    const rx       = 38;
    const ry       = 14;
    const gap      = 45;
    const vSpacing = 32;
    const startY   = my - gap - ((relAttrs.length - 1) * vSpacing) / 2;

    relAttrs.forEach((aAttr, idx) => {
      let defX, defY;

      if (r.fromAssocCollapse) {
        // Fan them around the diamond on an arc
        const radius    = 60;              // distance from diamond center
        const n         = relAttrs.length;
        const baseAngle = -Math.PI / 2;    // start roughly "up"
        const spread    = (Math.PI * 2) / 3; // 120° arc

        const offset = (idx - (n - 1) / 2) *
                       (spread / Math.max(n - 1, 1));
        const angle  = baseAngle + offset;

        defX = mx + radius * Math.cos(angle);
        defY = my + radius * Math.sin(angle);
      } else {
        // Original vertical stack for non-synthetic relationships
        defX = mx;
        defY = startY + idx * vSpacing;
      }

      const ovalX =
        (typeof aAttr.ovalX === "number") ? aAttr.ovalX : defX;
      const ovalY =
        (typeof aAttr.ovalY === "number") ? aAttr.ovalY : defY;
	  
	  const connector = document.createElementNS(svgNS, "line");
	  connector.setAttribute("x1", mx);
	  connector.setAttribute("y1", my);
	  // Compute where the line from the oval center toward the diamond
	  // intersects the ellipse boundary.
	  // const hit = edgePoint(ovalX, ovalY, mx, my, rx, ry, 0);
	  const hit = ellipseEdgePoint(ovalX, ovalY, mx, my, rx, ry, 0);	  
	  connector.setAttribute("x2", hit.x);
	  connector.setAttribute("y2", hit.y);
	  connector.setAttribute("stroke", "#222");
	  connector.setAttribute("stroke-width", "1.3");
	  svg.appendChild(connector);

      const ell = document.createElementNS(svgNS, "ellipse");
      ell.setAttribute("cx", ovalX);
      ell.setAttribute("cy", ovalY);
      ell.setAttribute("rx", rx);
      ell.setAttribute("ry", ry);
      ell.setAttribute("fill", "#fff");
      ell.setAttribute("stroke", "#222");
      svg.appendChild(ell);

      const t = document.createElementNS(svgNS, "text");
      t.setAttribute("x", ovalX);
      t.setAttribute("y", ovalY + 4);
      t.setAttribute("text-anchor", "middle");
      t.style.fontSize = "12px";
      t.textContent = aAttr.name;
      svg.appendChild(t);

      const hitAttr = document.createElement("div");
      hitAttr.className = "attr-hit";
      hitAttr.style.left = (ovalX - 12) + "px";
      hitAttr.style.top  = (ovalY - 12) + "px";
      hitAttr.dataset.relId = r.id;
      hitAttr.dataset.attrIndex = String(idx);
      hitAttr.dataset.ovalX = String(ovalX);
      hitAttr.dataset.ovalY = String(ovalY);
      enableRelAttrDrag(hitAttr);
      stage.appendChild(hitAttr);
    });
  }
  // hit area for context menu / edit / drag
  const hit = document.createElement("div");
  hit.className = "rel-hit";
  hit.style.left = (mx - 11) + "px";
  hit.style.top  = (my - 11) + "px";
  hit.dataset.rid = r.id;
  enableRelContext(hit);
  enableRelDrag(hit);   // make the relationship draggable
  stage.appendChild(hit);
}


function drawAttributeOvalsForEntity(ent) {
  const halfW = (ent.width  || 140) / 2;
  const halfH = (ent.height ||  60) / 2;

  const centerX = ent.x + halfW;
  const centerY = ent.y + halfH;

  const attrs = ent.attributes || [];
  if (!attrs.length) return;

  const visible = attrs
    .map((a, idx) => ({ attr: a, idx })) // keep original index
    .filter(({ attr }) =>
      !isBorrowedOwnerKey(ent, attr) &&
      !isInheritedPkFromSuper(ent, attr)
    );

  if (!visible.length) return;

  const side = -1;               // left side by default
  const gapFromBox = 40;
  const verticalSpacing = 40;

  // ---- NEW: compute a single "column rx" (max needed among visible attrs)
  const MIN_RX = 40;
  const CHAR_PX = 5;  // tweak: 6–7 feels about right at 12px font
  const rxCol = visible.reduce((mx, { attr: a }) => {
    const base = a.name || "";
    const extra = (!a.pk && a.notNull !== true) ? " (O)" : "";
    const textLen = (base + extra).length;
    const rx = Math.max(MIN_RX, textLen * CHAR_PX);
    return Math.max(mx, rx);
  }, MIN_RX);

  // Use column rx so all ovals align nicely
  const baseX = centerX + side * (halfW + gapFromBox + rxCol);
  const baseStartY = centerY - ((visible.length - 1) * verticalSpacing) / 2;

  visible.forEach(({ attr: a, idx }, i) => {
    const defX = baseX;
    const defY = baseStartY + i * verticalSpacing;

    const ovalX = (typeof a.ovalX === "number") ? a.ovalX : defX;
    const ovalY = (typeof a.ovalY === "number") ? a.ovalY : defY;

    // ---- NEW: per-attribute rx (so long names get wider ovals)
    const baseLabel = a.name || "";
    const optExtra  = (!a.pk && a.notNull !== true) ? " (O)" : "";
    const labelText = baseLabel + optExtra;

    const rx = Math.max(MIN_RX, labelText.length * CHAR_PX);
    const ry = 16;

    // point on entity’s box edge toward the oval
    const edge = edgePoint(centerX, centerY, ovalX, ovalY, halfW, halfH, 0);

    const line = document.createElementNS(svgNS,"line");
    line.setAttribute("x1", edge.x);
    line.setAttribute("y1", edge.y);
    line.setAttribute("x2", ovalX);
    line.setAttribute("y2", ovalY);
    line.setAttribute("stroke","#222");
    line.setAttribute("stroke-width","1.3");
    svg.appendChild(line);

    // --- draw oval(s) ---
    const isMulti = !!a.multi;

    const ellOuter = document.createElementNS(svgNS, "ellipse");
    ellOuter.setAttribute("cx", ovalX);
    ellOuter.setAttribute("cy", ovalY);
    ellOuter.setAttribute("rx", rx);
    ellOuter.setAttribute("ry", ry);
    ellOuter.setAttribute("fill", "#fff");
    ellOuter.setAttribute("stroke", "#222");
    svg.appendChild(ellOuter);

    if (isMulti) {
      const inset = 4;
      const ellInner = document.createElementNS(svgNS, "ellipse");
      ellInner.setAttribute("cx", ovalX);
      ellInner.setAttribute("cy", ovalY);
      ellInner.setAttribute("rx", Math.max(1, rx - inset));
      ellInner.setAttribute("ry", Math.max(1, ry - inset));
      ellInner.setAttribute("fill", "none");
      ellInner.setAttribute("stroke", "#222");
      svg.appendChild(ellInner);
    }

    const text = document.createElementNS(svgNS,"text");
    text.setAttribute("x", ovalX);
    text.setAttribute("y", ovalY + 4);
    text.setAttribute("text-anchor","middle");
    text.style.fontSize = "12px";
    text.textContent = labelText;
    svg.appendChild(text);

    const isDiscr = isDiscriminatorKey(ent, a);

    // Underlines for PK (solid) / discriminator (dashed underline)
    if (a.pk) {
      text.setAttribute("font-weight","bold");

      const bbox = text.getBBox();
      const underline = document.createElementNS(svgNS,"line");
      underline.setAttribute("x1", bbox.x);
      underline.setAttribute("x2", bbox.x + bbox.width);
      underline.setAttribute("y1", ovalY + 7);
      underline.setAttribute("y2", ovalY + 7);
      underline.setAttribute("stroke","#222");
      underline.setAttribute("stroke-width","1");

      if (isDiscr) underline.setAttribute("stroke-dasharray", "3,3");
      svg.appendChild(underline);
    }

    // draggable hit area
    const hit = document.createElement("div");
    hit.className = "attr-hit";
    hit.style.left = (ovalX - 12) + "px";
    hit.style.top  = (ovalY - 12) + "px";
    hit.dataset.entId = ent.id;
    hit.dataset.attrIndex = String(idx);
    hit.dataset.ovalX = String(ovalX);
    hit.dataset.ovalY = String(ovalY);
    enableEntityAttrDrag(hit);
    stage.appendChild(hit);
  });
}

function edgePoint(cx, cy, otherX, otherY, halfW, halfH, extra) {
  const dx  = otherX - cx;
  const dy  = otherY - cy;
  const len = Math.sqrt(dx*dx + dy*dy) || 1;
  const ux  = dx / len;
  const uy  = dy / len;

  let tx = Infinity, ty = Infinity;
  if (Math.abs(ux) > 1e-6) tx = halfW / Math.abs(ux);
  if (Math.abs(uy) > 1e-6) ty = halfH / Math.abs(uy);

  const tEdge = Math.min(tx, ty);
  const t     = tEdge + extra;
  return { x: cx + ux * t, y: cy + uy * t };
}

function ellipseEdgePoint(cx, cy, towardX, towardY, rx, ry, extra = 0) {
  const dx = towardX - cx;
  const dy = towardY - cy;

  // If degenerate, just return center
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  // Scale factor to hit ellipse boundary:
  // (x/rx)^2 + (y/ry)^2 = 1  along the ray (dx,dy)
  const s = 1 / Math.sqrt((dx*dx) / (rx*rx) + (dy*dy) / (ry*ry));

  // Base hit point on ellipse
  let x = cx + dx * s;
  let y = cy + dy * s;

  // Optional: extend slightly beyond the ellipse (usually leave extra=0)
  if (extra) {
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    x += (dx / len) * extra;
    y += (dy / len) * extra;
  }

  return { x, y };
}


function drawCrowFoot(tipX, tipY, otherX, otherY) {
  // Vector FROM Tip (box edge) TO Diamond
  const dx = otherX - tipX;
  const dy = otherY - tipY;
  const len = Math.sqrt(dx*dx + dy*dy) || 1;
  
  // Unit vector towards diamond
  const ux = dx / len;
  const uy = dy / len;

  // Perpendicular vector
  const px = -uy;
  const py = ux;

  // Configuration
  const branchLen = 22; // Distance back from the edge where the split starts
  const spread = 8;     // How wide the feet are

  // Point on the main line where the feet split (the "ankle")
  const forkX = tipX + ux * branchLen;
  const forkY = tipY + uy * branchLen;

  // We already have a center line drawn by drawRelationship.
  // We just need to draw the "V" shape from the fork back to the box.

  // Leg 1: Fork -> (Tip + Spread)
  const leg1 = document.createElementNS(svgNS, "line");
  leg1.setAttribute("x1", forkX);
  leg1.setAttribute("y1", forkY);
  leg1.setAttribute("x2", tipX + px * spread);
  leg1.setAttribute("y2", tipY + py * spread);
  leg1.setAttribute("stroke", "#222");
  leg1.setAttribute("stroke-width", "2");
  svg.appendChild(leg1);

  // Leg 2: Fork -> (Tip - Spread)
  const leg2 = document.createElementNS(svgNS, "line");
  leg2.setAttribute("x1", forkX);
  leg2.setAttribute("y1", forkY);
  leg2.setAttribute("x2", tipX - px * spread);
  leg2.setAttribute("y2", tipY - py * spread);
  leg2.setAttribute("stroke", "#222");
  leg2.setAttribute("stroke-width", "2");
  svg.appendChild(leg2);
}

function drawInnerCircle(x, y, towardX, towardY) {
  const r = 5;
  const dx = towardX - x;
  const dy = towardY - y;
  const len = Math.sqrt(dx*dx + dy*dy) || 1;
  const ux = dx / len, uy = dy / len;

  // CHANGE: Increased offset from 34 to 54 to move it further out
  const offset = 23;
  const cx = x + ux * offset;
  const cy = y + uy * offset;

  const c = document.createElementNS(svgNS, "circle");
  c.setAttribute("cx", cx);
  c.setAttribute("cy", cy);
  c.setAttribute("r", r);
  c.setAttribute("fill", "white");
  c.setAttribute("stroke", "#222");
  c.setAttribute("stroke-width", "2");
  svg.appendChild(c);
}

function drawInnerOneBar(x, y, towardX, towardY) {
  const dx = towardX - x;
  const dy = towardY - y;
  const len = Math.sqrt(dx*dx + dy*dy) || 1;
  const ux = dx / len, uy = dy / len;

  const px = -uy, py = ux;

  // CHANGE: Increased offset from 34 to 54 here as well
  const offset = 23;
  const cx = x + ux * offset;
  const cy = y + uy * offset;

  const bar = document.createElementNS(svgNS, "line");
  bar.setAttribute("x1", cx - px * 7);
  bar.setAttribute("y1", cy - py * 7);
  bar.setAttribute("x2", cx + px * 7);
  bar.setAttribute("y2", cy + py * 7);
  bar.setAttribute("stroke", "#222");
  bar.setAttribute("stroke-width", "2");
  svg.appendChild(bar);
}


function drawOuterOneBar(x, y, towardX, towardY) {
  const dx = towardX - x;
  const dy = towardY - y;
  const len = Math.sqrt(dx*dx + dy*dy) || 1;
  const ux = dx / len, uy = dy / len;

  const px = -uy, py = ux;

  const cx = x + ux * 13;
  const cy = y + uy * 13;

  const bar = document.createElementNS(svgNS, "line");
  bar.setAttribute("x1", cx - px * 8);
  bar.setAttribute("y1", cy - py * 8);
  bar.setAttribute("x2", cx + px * 8);
  bar.setAttribute("y2", cy + py * 8);
  bar.setAttribute("stroke", "#222");
  bar.setAttribute("stroke-width", "2");
  svg.appendChild(bar);
}


//  /* ---------- Drag entities ---------- */
//  /* ---------- Drag entities (mouse + touch) ---------- */
function enableDrag(el) {
  setTouchActionNone(el);

  el.onpointerdown = (e) => {
    // Left mouse only; touch/pen allowed
    if (e.pointerType !== "mouse" && activePtrs && activePtrs.size >= 2) return;
	if (e.pointerType === "mouse" && e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    // hide menus if any
    ctxMenu.style.display = "none";
    relCtxMenu.style.display = "none";

    const ent = erd.entities.find(en => en.id === el.dataset.id);
    if (!ent) return;

    // WORLD coordinates at drag start
    const startWorld = eventToWorld(e);
    const startEntX = ent.x;
    const startEntY = ent.y;
	
	let hasMoved = false;
	const DRAG_CANCEL_PX = 3; // small threshold works best on Android
	const startClient = { x: e.clientX, y: e.clientY };

    // ✅ ADD: track whether we've *actually* dragged
    let didDrag = false;

    // capture pointer so dragging keeps working if finger leaves element
    try { el.setPointerCapture(e.pointerId); } catch {}

    const onMove = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      ev.preventDefault();

	  if (!hasMoved) {
	    const dx = ev.clientX - startClient.x;
	    const dy = ev.clientY - startClient.y;
	    if (Math.hypot(dx, dy) >= DRAG_CANCEL_PX) {
	      hasMoved = true;

	      // Cancel any long-press menu that might be pending
	      if (cancelActiveLongPress) cancelActiveLongPress();

	      // Also suppress context menu for a short window after drag ends
	      suppressContextUntil = Date.now() + 800;
	    }
	  }
	  
      const currWorld = eventToWorld(ev);

      // Move entity in WORLD coords
      const newX = Math.round(startEntX + (currWorld.x - startWorld.x));
      const newY = Math.round(startEntY + (currWorld.y - startWorld.y));

      const dx = newX - ent.x;
      const dy = newY - ent.y;

      // ✅ ADD: only once, once movement is real, mark it as a drag (Android contextmenu killer)
      if (!didDrag && (Math.abs(dx) + Math.abs(dy)) >= 2) {
        didDrag = true;
        markDrag(); // sets _lastDragTs
      }

      ent.x = newX;
      ent.y = newY;

      // Move any "pinned" attribute ovals by the same delta so they stay attached.
      (ent.attributes || []).forEach(a => {
        if (typeof a.ovalX === "number") a.ovalX += dx;
        if (typeof a.ovalY === "number") a.ovalY += dy;
      });

      render();
    };

    const onUp = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      document.removeEventListener("pointermove", onMove, { passive: false });
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      try { el.releasePointerCapture(e.pointerId); } catch {}
    };

    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  };
}

function enableRelDrag(hitEl) {
  setTouchActionNone(hitEl);

  hitEl.onpointerdown = (e) => {
    if (e.pointerType !== "mouse" && activePtrs && activePtrs.size >= 2) return;
	if (e.pointerType === "mouse" && e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    const rid = hitEl.dataset.rid;
    const rel = findRelationshipById(rid);
    if (!rel) return;

    ctxMenu.style.display = "none";
    relCtxMenu.style.display = "none";

    // WORLD coords at drag start (undoes pan/zoom)
    const startWorld = eventToWorld(e);

    const a = erd.entities.find(en => en.id === rel.a);
    const b = erd.entities.find(en => en.id === rel.b);
    if (!a || !b) return;

    const aHalfW = (a.width || 140) / 2;
    const aHalfH = (a.height || 60) / 2;
    const bHalfW = (b.width || 140) / 2;
    const bHalfH = (b.height || 60) / 2;

    const axCenter = a.x + aHalfW;
    const ayCenter = a.y + aHalfH;
    const bxCenter = b.x + bHalfW;
    const byCenter = b.y + bHalfH;

    // Diamond position is in WORLD coords
    const pos = getRelDiamondPosition(rel, axCenter, ayCenter, bxCenter, byCenter, a.y);
    const startRelX = pos.x;
    const startRelY = pos.y;

    // --- Android long-press/context suppression (same as enableDrag) ---
    let hasMoved = false;
    const DRAG_CANCEL_PX = 3;
    const startClient = { x: e.clientX, y: e.clientY };
    let didDrag = false;
	
    try { hitEl.setPointerCapture(e.pointerId); } catch {}

    const onMove = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      ev.preventDefault();

      if (!hasMoved) {
        const dx = ev.clientX - startClient.x;
        const dy = ev.clientY - startClient.y;
        if (Math.hypot(dx, dy) >= DRAG_CANCEL_PX) {
          hasMoved = true;

          // Cancel any pending long-press context menu
		  if (typeof cancelActiveLongPress === "function") cancelActiveLongPress();

          // Suppress context menu briefly after drag ends (Android)
          suppressContextUntil = Date.now() + 800;
        }
      }

      const currWorld = eventToWorld(ev);

      const newX = startRelX + (currWorld.x - startWorld.x);
      const newY = startRelY + (currWorld.y - startWorld.y);

      // markDrag once real movement happens
      if (!didDrag && (Math.abs(newX - startRelX) + Math.abs(newY - startRelY)) >= 2) {
        didDrag = true;
		if (typeof markDrag === "function") markDrag();
      }

      rel.x = newX;
      rel.y = newY;

      // persist synthetic assocView_* relationship position back onto source entity
      if (rel.synthetic && rel.assocEntityId) {
        const src = erd.entities.find(en => en.id === rel.assocEntityId);
        if (src) {
          src.assocRelX = newX;
          src.assocRelY = newY;

          const w = src.width || 140;
          const h = src.height || 60;
          src.x = newX - w / 2;
          src.y = newY - h / 2;
        }
      }

      render();
    };

    const onUp = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
	  if (didDrag) suppressContextUntil = Date.now() + 800;
      document.removeEventListener("pointermove", onMove, { passive: false });
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      try { hitEl.releasePointerCapture(e.pointerId); } catch {}
    };

    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  };
}

function enableEntityAttrDrag(hitEl) {
  setTouchActionNone(hitEl);

  hitEl.onpointerdown = (e) => {
    if (e.pointerType !== "mouse" && activePtrs && activePtrs.size >= 2) return;
	if (e.pointerType === "mouse" && e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    const entId = hitEl.dataset.entId;
    const idx   = parseInt(hitEl.dataset.attrIndex, 10);
    const ent   = erd.entities.find(en => en.id === entId);
    if (!ent || !ent.attributes[idx]) return;
    const attr = ent.attributes[idx];

    // WORLD coords at drag start
    const startWorld = eventToWorld(e);

    // Starting oval position (WORLD coords)
    const startX = parseFloat(hitEl.dataset.ovalX);
    const startY = parseFloat(hitEl.dataset.ovalY);

    try { hitEl.setPointerCapture(e.pointerId); } catch {}

    const onMove = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      ev.preventDefault();

      const currWorld = eventToWorld(ev);

      attr.ovalX = startX + (currWorld.x - startWorld.x);
      attr.ovalY = startY + (currWorld.y - startWorld.y);

      render();
    };

    const onUp = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      document.removeEventListener("pointermove", onMove, { passive: false });
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      try { hitEl.releasePointerCapture(e.pointerId); } catch {}
    };

    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  };
}

function enableRelAttrDrag(hitEl) {
  setTouchActionNone(hitEl);

  hitEl.onpointerdown = (e) => {
    if (e.pointerType !== "mouse" && activePtrs && activePtrs.size >= 2) return;
	if (e.pointerType === "mouse" && e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    const relId = hitEl.dataset.relId;
    const idx   = parseInt(hitEl.dataset.attrIndex, 10);

    const relList = erd._viewRelationships || erd.relationships || [];
    const rel = relList.find(r => r.id === relId);
    if (!rel || !rel.attributes || !rel.attributes[idx]) return;

    const attr = rel.attributes[idx];

    // WORLD coords at drag start
    const startWorld = eventToWorld(e);

    // Starting oval position (WORLD coords)
    const startX = parseFloat(hitEl.dataset.ovalX);
    const startY = parseFloat(hitEl.dataset.ovalY);

    try { hitEl.setPointerCapture(e.pointerId); } catch {}

    const onMove = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      ev.preventDefault();

      const currWorld = eventToWorld(ev);

      const newX = startX + (currWorld.x - startWorld.x);
      const newY = startY + (currWorld.y - startWorld.y);

      // move the *view* attribute (WORLD coords)
      attr.ovalX = newX;
      attr.ovalY = newY;

      // persist back onto assoc source entity attribute (so rebuild keeps coords)
      if (rel.fromAssocCollapse && attr._assocEntityId != null) {
        const assoc = erd.entities.find(e => e.id === attr._assocEntityId);
        if (assoc && Array.isArray(assoc.attributes)) {
          const src = assoc.attributes[attr._assocAttrIndex];
          if (src) {
            src.relOvalX = newX;
            src.relOvalY = newY;
          }
        }
      }

      render();
    };

    const onUp = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      document.removeEventListener("pointermove", onMove, { passive: false });
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      try { hitEl.releasePointerCapture(e.pointerId); } catch {}
    };

    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  };
}

//  ---------- Context menus ---------- */
function enableContext(el) {  
  el.oncontextmenu = (e) => {
    // Touch long-press can generate a contextmenu event.
    // If this came from touch/long-press, ignore (we handle touch via our timer)
    if (isRecentTouchLike()) {
      e.preventDefault();
      return;
    }
	if (Date.now() < suppressContextUntil) return;
    e.preventDefault();
    ctxEntityId = el.dataset.id;
    openEntityCtxMenuAtPageXY(e.pageX, e.pageY);
  };

  // Double click (mouse) still works
  el.ondblclick = (e) => {
    e.preventDefault();
    const ent = erd.entities.find(en => en.id === el.dataset.id);
    if (ent) openEntityModal(ent);
  };

  // Touch long-press for context menu
  let pressTimer = null;
  let startClient = null;
  let moved = false;
  
  function cancelLongPress() {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
  }

  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
	e.preventDefault();  // IMPORTANT: suppress native long-press behaviors
	el.oncontextmenu = (ev) => ev.preventDefault();
    moved = false;
    startClient = clientPointFromEvent(e);
    ctxEntityId = el.dataset.id;

    // Important: don’t open the menu if the user is starting a drag
    // (your drag code uses touch-action:none and pointer capture, so this is safe)
    pressTimer = setTimeout(() => {
      if (moved) return;
	  if (Date.now() < suppressContextUntil) return;
      const pt = pagePointFromClient(startClient.clientX, startClient.clientY);
      openEntityCtxMenuAtPageXY(pt.x, pt.y);
    }, 550);
	cancelActiveLongPress = cancelLongPress;
	
  }, { passive: true });

  el.addEventListener("pointermove", (e) => {
    if (!pressTimer || e.pointerType !== "touch") return;
	e.preventDefault();  // IMPORTANT: suppress native long-press behaviors
	
    const p = clientPointFromEvent(e);
    const dx = p.clientX - startClient.clientX;
    const dy = p.clientY - startClient.clientY;

    if (Math.hypot(dx, dy) > 10) { // movement cancels long-press
      moved = true;
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  }, { passive: true });

  el.addEventListener("pointerup", () => {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
	cancelActiveLongPress = null;
  });

  el.addEventListener("pointercancel", () => {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
	cancelActiveLongPress = null;
  });
}

function showCtxMenu(x,y){
  ctxMenu.style.left  = x + "px";
  ctxMenu.style.top   = y + "px";
  ctxMenu.style.display = "block";
}

// --- Cascading context menus for Add Relationship ---
let relTargetMenu = null;
let relTypeMenu = null;
let pendingRelTargetId = null;


// --- Cascading Add Relationship (NESTED submenus inside #ctxMenu) ---

function resetCtxSubmenus() {
  if (relTargetMenu) relTargetMenu.innerHTML = "";
  if (relTypeMenu) {
    relTypeMenu.innerHTML = "";
    relTypeMenu.style.display = "none";
  }
  pendingRelTargetId = null;
}

function positionMenuNextToAnchor(menuEl, anchorRect, offsetX = 6) {
  // anchorRect is a DOMRect in viewport coords
  const x = anchorRect.right + offsetX + window.scrollX;
  const y = anchorRect.top + window.scrollY;
  menuEl.style.left = `${x}px`;
  menuEl.style.top  = `${y}px`;
}

function populateRelTargetSubmenu(sourceEntityId) {
  if (!relTargetMenu) return;

  relTargetMenu.innerHTML = "";
  relTargetMenu.style.display = "block";      // ensure visible when populated (optional)
  if (relTypeMenu) relTypeMenu.style.display = "none";
  pendingRelTargetId = null;

  const targets = (erd.entities || []);       // ✅ include source too (recursive rels)

  if (!targets.length) {
    relTargetMenu.innerHTML = `
      <div style="padding:6px 10px; font-size:13px; color:#555;">
        No entities available
      </div>`;
    return;
  }

  targets.forEach(t => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = t.name;
    btn.dataset.relTarget = t.id;

    // Hover (desktop): reveal type submenu
    btn.addEventListener("mouseenter", () => {
      pendingRelTargetId = t.id;
      showRelTypeSubmenuForTarget(btn);
    });

    // Tap/click (mobile): also reveal type submenu
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      pendingRelTargetId = t.id;
      showRelTypeSubmenuForTarget(btn);
    });

    relTargetMenu.appendChild(btn);
  });
}


function showRelTypeSubmenuForTarget(targetBtnEl) {
  if (!relTypeMenu) return;

  relTypeMenu.innerHTML = "";

  const choices = ["1:1", "1:N", "N:1", "M:N"];
  choices.forEach(card => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = card;

    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (!ctxEntityId || !pendingRelTargetId) return;
      createRelationshipAndEdit(ctxEntityId, pendingRelTargetId, card);
    });

    relTypeMenu.appendChild(b);
  });

  // Align submenu 2 vertically with hovered/selected target row
  // (targetBtnEl is inside relTargetMenu)
  relTypeMenu.style.top = (targetBtnEl.offsetTop || 0) + "px";
  relTypeMenu.style.display = "block";
}




function createRelationshipAndEdit(sourceId, targetId, card) {
  const id = "r" + Math.random().toString(36).slice(2, 7);

  const rel = {
    id,
    name: "has",     // default per your UX goal
    type: card,      // "1:N", "N:1", etc.
    a: sourceId,
    b: targetId
  };

  erd.relationships.push(rel);

  // close menus
  ctxMenu.style.display = "none";
  resetCtxSubmenus();

  render();

  // open the relationship editor immediately
  openRelModal(rel);
}

function openEntityCtxMenuAtPageXY(pageX, pageY) {
  ctxMenu.style.display = "none";
  relCtxMenu.style.display = "none";
  resetCtxSubmenus();

  // safety in case DOMContentLoaded timing ever changes
  relTargetMenu = relTargetMenu || document.getElementById("ctxRelTargetMenu");
  relTypeMenu   = relTypeMenu   || document.getElementById("ctxRelTypeMenu");

  populateRelTargetSubmenu(ctxEntityId);
  showCtxMenu(pageX, pageY);
}

function enableRelContext(el) {
  el.oncontextmenu = e => {
    // ✅ if we just dragged, ignore the context menu event (Android can fire it late)
    if (typeof shouldSuppressContextMenu === "function" && shouldSuppressContextMenu()) return;

    e.preventDefault();
    ctxRelId = el.dataset.rid;
    showRelCtxMenu(e.pageX, e.pageY);
  };

  el.ondblclick = e => {
    e.preventDefault();
    const rel = erd.relationships.find(r => r.id === el.dataset.rid);
    if (rel) openRelModal(rel);
  };

  // Touch long-press
  let pressTimer = null;
  let startClient = null;
  let moved = false;

  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;

    // ✅ If we just dragged, do not even start a long-press timer
    if (typeof shouldSuppressContextMenu === "function" && shouldSuppressContextMenu()) return;

    // ✅ MUST be allowed to preventDefault on Android, so this listener cannot be passive
    e.preventDefault();

    moved = false;
    startClient = clientPointFromEvent(e);
    ctxRelId = el.dataset.rid;

    // ✅ Allow enableRelDrag() (and others) to cancel this exact timer.
    cancelActiveLongPress = () => {
      if (pressTimer) clearTimeout(pressTimer);
      pressTimer = null;
      moved = true;
    };

    pressTimer = setTimeout(() => {
      if (moved) return;

      // ✅ One more guard right before showing (covers late Android events)
      if (typeof shouldSuppressContextMenu === "function" && shouldSuppressContextMenu()) return;

      const pt = pagePointFromClient(startClient.clientX, startClient.clientY);
      showRelCtxMenu(pt.x, pt.y);
    }, 550);

  }, { passive: false }); // ✅ CRITICAL CHANGE
  
  
  el.addEventListener("pointermove", (e) => {
    if (!pressTimer || e.pointerType !== "touch") return;

    const p = clientPointFromEvent(e);
    const dx = p.clientX - startClient.clientX;
    const dy = p.clientY - startClient.clientY;

    if (Math.hypot(dx, dy) > 10) {
      moved = true;
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  }, { passive: false });

  el.addEventListener("pointerup", () => {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
    if (cancelActiveLongPress) cancelActiveLongPress = null;
  });

  el.addEventListener("pointercancel", () => {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
    if (cancelActiveLongPress) cancelActiveLongPress = null;
  });
}


function showRelCtxMenu(x,y){
  // ✅ Final safety net (prevents *any* path from showing after a drag)
  if (typeof shouldSuppressContextMenu === "function" && shouldSuppressContextMenu()) return;

  relCtxMenu.style.left  = x + "px";
  relCtxMenu.style.top   = y + "px";
  relCtxMenu.style.display = "block";
}


window.addEventListener("DOMContentLoaded", () => {
  const sel = document.getElementById("erdPresetSelect");
  if (sel) sel.value = "fourWay";

  refreshSavedErdList();   // populate saved ERD dropdown from localStorage
});

window.addEventListener("DOMContentLoaded", () => {
  relTargetMenu = document.getElementById("ctxRelTargetMenu");
  relTypeMenu   = document.getElementById("ctxRelTypeMenu");
});


//  ---------- Draggable modals ---------- */
function makeModalDraggable(modal) {
  const content = modal.querySelector(".modal-content");
  const header  = modal.querySelector(".modal-header");

  let isDragging = false;
  let startX, startY, origLeft, origTop;

  function onMouseMove(ev) {
    if (!isDragging) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    content.style.left = (origLeft + dx) + "px";
    content.style.top  = (origTop  + dy) + "px";
  }

  function onMouseUp() {
    isDragging = false;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }

  header.addEventListener("mousedown", e => {
    if (e.button !== 0) return;

    isDragging = true;

    // current position of centered modal
    const rect = content.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    origLeft = rect.left;
    origTop  = rect.top;

    // lock into fixed coordinates and remove the centering transform
    content.style.position = "fixed";
    content.style.margin   = "0";
    content.style.left     = origLeft + "px";
    content.style.top      = origTop  + "px";
    content.style.transform = "none";

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });
}


//  Entity menu actions */
ctxMenu.addEventListener("click", e => {
  // If clicking a submenu item, handle that first
  const targetBtn = e.target.closest("button[data-rel-target]");
  if (targetBtn) {
    // user picked a target entity
    pendingRelTargetId = targetBtn.dataset.relTarget;
    showRelTypeSubmenuForTarget(targetBtn.getBoundingClientRect());
    return;
  }

  const typeBtn = e.target.closest("button[data-rel-type]");
  if (typeBtn) {
    // user picked cardinality
    const card = typeBtn.dataset.relType;
    const sourceId = ctxEntityId;
    const targetId = pendingRelTargetId;
    if (sourceId && targetId && card) {
      createRelationshipAndEdit(sourceId, targetId, card);
    }
    return;
  }

  const act = e.target.dataset.act;
  if (!act || !ctxEntityId) return;

  const ent = erd.entities.find(en => en.id === ctxEntityId);
  if (!ent) return;

  if (act === "edit" || act === "attr") {
    ctxMenu.style.display = "none";
    resetCtxSubmenus();
    openEntityModal(ent);
    return;
  }

  if (act === "rel") {
    // DO NOT close ctxMenu. Show cascading targets.
    pendingRelTargetId = null;

    populateRelTargetSubmenu(ctxEntityId);

    // Position target submenu aligned with the "Add Relationship" button row
    const anchorRect = e.target.getBoundingClientRect();
    positionMenuNextToAnchor(relTargetMenu, anchorRect, 6);

    relTargetMenu.style.display = "block";
    if (relTypeMenu) relTypeMenu.style.display = "none";
    return;
  }

  if (act === "weak") {
    ctxMenu.style.display = "none";
    resetCtxSubmenus();

    const n = promptForNewEntityName("Weak entity name:");
    if (!n) return;   // cancelled

    const parentPKs = ent.attributes
      .filter(a => a.pk)
      .map(a => ({
        name: a.name,
        pk: true,
        fk: true,
        type: a.type || "TEXT",
        notNull: true
      }));

    const attrs = [...parentPKs];

    const wantDisc = confirm(
      "Add discriminator attribute(s) on the weak entity (making this a 1:M relationship)?"
    );

    if (wantDisc) {
      const discInput = prompt(
        "Enter discriminator attribute name(s) for the weak entity.\n" +
        "You can enter multiple names separated by commas (e.g., SectionNumber, Term):",
        "SectionNumber"
      );
      if (discInput) {
        discInput.split(",").map(s => s.trim()).filter(Boolean).forEach(name => {
          attrs.push({ name, pk: true, type:"TEXT", notNull:true });
        });
      }
    }

    const newId = n.toLowerCase();

    erd.entities.push({
      id: newId,
      name: n,
      x: ent.x + 160,
      y: ent.y,
      attributes: attrs,
      isWeak: true
    });

    const defaultRelName = "identifies";
    const relName = prompt(
      `Name of identifying relationship between ${ent.name} and ${n}:`,
      defaultRelName
    ) || defaultRelName;

    const relType = wantDisc ? "1:N" : "1:1";

    erd.relationships.push({
      id: "r" + Math.random().toString(36).slice(2, 7),
      name: relName,
      type: relType,
      a: ent.id,
      b: newId,
      identifying: true,
      parentSide: "a"
    });

    render();
    return;
  }

  if (act === "dup") {
    ctxMenu.style.display = "none";
    resetCtxSubmenus();
    duplicateEntity(ctxEntityId);
    return;
  }

  if (act === "del") {
    ctxMenu.style.display = "none";
    resetCtxSubmenus();

    if (confirm("Delete entity and its relationships?")) {
      erd.entities = erd.entities.filter(e => e.id !== ctxEntityId);
      erd.relationships = erd.relationships.filter(r => r.a !== ctxEntityId && r.b !== ctxEntityId);
      render();
    }
  }
});


//  Relationship menu actions */
relCtxMenu.addEventListener("click", e => {
  const act = e.target.dataset.act;
  if (!act || !ctxRelId) return;
  relCtxMenu.style.display = "none";

  const rel = erd.relationships.find(r => r.id === ctxRelId);
  if (!rel) return;

  if (act === "editRel") {
    openRelModal(rel);
    return;
  }

  if (act === "convertAssoc") {
    convertRelationshipToAssociative(rel);
    return;
  }

  if (act === "delRel") {
    if (confirm("Delete this relationship?")) {
      erd.relationships = erd.relationships.filter(r => r.id !== ctxRelId);
      render();
    }
  }
});

let showAssocAsMM = false;

const toggleAttrCheckbox  = document.getElementById("toggleAttributeOvals");
const toggleAssocCheckbox = document.getElementById("toggleAssocAsMM");

toggleAttrCheckbox.addEventListener("change", e => {
  showAttributeOvals = e.target.checked;
  render();
});

toggleAssocCheckbox.addEventListener("change", e => {
  showAssocAsMM = e.target.checked;
  render();
});


// --- Hot ERD Time Machine (runs ONLY on ERD Builder page) ---

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

  while (snapshots.length > SNAPSHOT_MAX) snapshots.shift();

  saveSnapshots(snapshots);
  refreshTimeMachineDropdown();
}

function refreshTimeMachineDropdown() {
  const sel = document.getElementById("erdTimeMachineSelect");
  if (!sel) return;

  const snapshots = loadSnapshots();
  sel.innerHTML = "";

  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = snapshots.length
    ? "Select a restore point…"
    : "(no snapshots yet)";
  sel.appendChild(opt0);

  if (!snapshots.length) return;

  const now = Date.now();
  const newestFirst = [...snapshots].reverse();

  newestFirst.forEach(s => {
    const mins = Math.round((now - s.ts) / 60000);
    const opt = document.createElement("option");
    opt.value = String(s.ts);

    if (mins <= 0) {
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

  erd = cloneErd(snap.erd);

  // Persist current state so page switches keep it
  saveCurrentErd(erd);

  render();
}

function wireTimeMachineDropdown() {
  const sel = document.getElementById("erdTimeMachineSelect");
  if (!sel) return;

  sel.addEventListener("change", () => {
    const val = sel.value;
    if (!val) return;
    restoreSnapshotByTs(val);
    sel.value = ""; // reset
  });
}

function startErdAutosave() {
  // optional: take one immediately so dropdown shows something right away
  pushSnapshot(erd);

  setInterval(() => {
    pushSnapshot(erd);
  }, SNAPSHOT_INTERVAL_MIN * 60 * 1000);
}




// --- Hot ERD Time Machine dropdown restore ---
const tmSelect = document.getElementById("erdTimeMachineSelect");

if (tmSelect) {
  tmSelect.addEventListener("change", () => {
    const ts = tmSelect.value;
    if (!ts) return;

    restoreSnapshotByTs(ts);
    tmSelect.value = ""; // reset after restore
  });
}

// Populate dropdown once on startup
refreshTimeMachineDropdown();

//  ---------- Entity modal ---------- */
function openEntityModal(ent) {
  editingEntityId = ent.id;
  entityNameInput.value = ent.name;
  entityAttrBody.innerHTML = "";

  ent.attributes.forEach(a => {
    const tr = document.createElement("tr");
	tr.innerHTML = `
	  <td><input type="text" value="${a.name || ""}" class="attr-name"></td>
	  <td><select class="attr-type"></select></td>
	  <td style="text-align:center;"><input type="checkbox" class="attr-nn" ${a.notNull || a.pk ? "checked" : ""}></td>
	  <td style="text-align:center;"><input type="checkbox" class="attr-uniq" ${a.unique ? "checked" : ""}></td>
	  <td style="text-align:center;"><input type="checkbox" class="attr-multi" ${a.multi ? "checked" : ""}></td>
	  <td style="text-align:center;"><input type="checkbox" class="attr-pk" ${a.pk ? "checked" : ""}></td>
	  <td style="text-align:center;"><button onclick="removeAttrRow(this)">✕</button></td>
	`;
    entityAttrBody.appendChild(tr);
    const selectEl = tr.querySelector(".attr-type");
    populateTypeSelect(selectEl, a.type || "TEXT");
    attachTypeSelectHandler(selectEl);
  });

  entityModal.classList.add("show");
}


function closeEntityModal() {
  editingEntityId = null;
  entityModal.classList.remove("show");
}


function addAttrRow() {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="text" class="attr-name"></td>
    <td><select class="attr-type"></select></td>
    <td style="text-align:center;"><input type="checkbox" class="attr-nn"></td>
    <td style="text-align:center;"><input type="checkbox" class="attr-uniq"></td>
    <td style="text-align:center;"><input type="checkbox" class="attr-multi"></td>
    <td style="text-align:center;"><input type="checkbox" class="attr-pk"></td>
    <td style="text-align:center;"><button onclick="removeAttrRow(this)">✕</button></td>
  `;
  entityAttrBody.appendChild(tr);
  const selectEl = tr.querySelector(".attr-type");
  populateTypeSelect(selectEl, "TEXT");
  attachTypeSelectHandler(selectEl);
}

function removeAttrRow(btn) {
  const tr = btn.closest("tr");
  tr.parentNode.removeChild(tr);
}

function addRelAttrRow(attr) {
  const tr = document.createElement("tr");
  const name   = attr?.name    || "";
  const type   = attr?.type    || "TEXT";
  const notNil = attr?.notNull || false;

  tr.innerHTML = `
    <td><input type="text" class="rel-attr-name" value="${name}"></td>
    <td><select class="rel-attr-type"></select></td>
    <td style="text-align:center;">
      <input type="checkbox" class="rel-attr-nn" ${notNil ? "checked" : ""}>
    </td>
    <td style="text-align:center;">
      <button onclick="removeRelAttrRow(this)">✕</button>
    </td>
  `;

  relAttrBody.appendChild(tr);

  const selectEl = tr.querySelector(".rel-attr-type");
  populateTypeSelect(selectEl, type);
  attachTypeSelectHandler(selectEl);
}

function removeRelAttrRow(btn) {
  const tr = btn.closest("tr");
  tr.parentNode.removeChild(tr);
}


function populateTypeSelect(selectEl, currentType) {
  selectEl.innerHTML = "";
  SQL_TYPE_OPTIONS.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    selectEl.appendChild(opt);
  });

  if (currentType && !SQL_TYPE_OPTIONS.includes(currentType.toUpperCase())) {
    const customOpt = document.createElement("option");
    customOpt.value = currentType;
    customOpt.textContent = currentType + " (custom)";
    selectEl.appendChild(customOpt);
  }

  const customChoice = document.createElement("option");
  customChoice.value = "__CUSTOM__";
  customChoice.textContent = "Custom…";
  selectEl.appendChild(customChoice);

  if (currentType) {
    const std = SQL_TYPE_OPTIONS.find(
      t => t.toUpperCase() === currentType.toUpperCase()
    );
    if (std) {
      selectEl.value = std;
    } else {
      selectEl.value = currentType;
    }
  } else {
    selectEl.value = "TEXT";
  }
  selectEl.dataset.currentType = selectEl.value;
}
function attachTypeSelectHandler(selectEl) {
  selectEl.addEventListener("change", () => {
    if (selectEl.value === "__CUSTOM__") {
      const prev = selectEl.dataset.currentType || "TEXT";
      const input = prompt(
        "Enter custom SQL data type (e.g., VARCHAR(20), UUID):",
        "VARCHAR(20)"
      );
      if (!input) {
        selectEl.value = prev;
        return;
      }
      let existing = Array.from(selectEl.options).find(o => o.value === input);
      if (!existing) {
        const customOption = Array.from(selectEl.options).find(o => o.value === "__CUSTOM__");
        const opt = document.createElement("option");
        opt.value = input;
        opt.textContent = input + " (custom)";
        selectEl.insertBefore(opt, customOption);
        existing = opt;
      }
      selectEl.value = input;
      selectEl.dataset.currentType = input;
    } else {
      selectEl.dataset.currentType = selectEl.value;
    }
  });
}

function saveEntityModal() {
  if (!editingEntityId) return;
  const ent = erd.entities.find(e => e.id === editingEntityId);
  if (!ent) return;

  const oldAttrs = ent.attributes || [];   // ✅ add this line

  const newName = entityNameInput.value.trim();
  if (newName) ent.name = newName;

  const rows = entityAttrBody.querySelectorAll("tr");
  const newAttrs = [];
  rows.forEach(row => {
    const name = row.querySelector(".attr-name").value.trim();
    if (!name) return;
    const type = row.querySelector(".attr-type").value.trim() || "TEXT";

	const notNull = row.querySelector(".attr-nn").checked;
	const unique  = row.querySelector(".attr-uniq").checked;
	const pk      = row.querySelector(".attr-pk").checked;
	const multi   = row.querySelector(".attr-multi")?.checked || false;
	if (multi && pk) {
	  // simplest: auto-fix and keep going
	  // (or you could alert + return)
	  // eslint-disable-next-line no-console
	  console.warn(`Attribute "${name}" cannot be both multi-valued and PK; clearing PK.`);
	}
	const pkFinal = (multi ? false : pk);
	const base = { name, type, notNull, unique, pk: pkFinal, multi };
//	const base = { name, type, notNull, unique, pk, multi };

	const old = oldAttrs.find(a => a.name === name);
	if (old) {
	  if (typeof old.ovalX === "number") base.ovalX = old.ovalX;
	  if (typeof old.ovalY === "number") base.ovalY = old.ovalY;
	  if (old.fk) base.fk = true;
	  if (old.references) base.references = old.references;

	  // preserve multi if user didn’t change it (or if row didn’t include it somehow)
	  if (typeof old.multi === "boolean" && !row.querySelector(".attr-multi")) {
	    base.multi = old.multi;
	  }
	}

    newAttrs.push(base);
  });
  
  ent.attributes = newAttrs;
  closeEntityModal();
  render();
}

function openRelModal(rel) {
  editingRelId = rel.id;

  const entA = erd.entities.find(e => e.id === rel.a);
  const entB = erd.entities.find(e => e.id === rel.b);
  if (!entA || !entB) return;

  const typeParts = (rel.type || "1:1").split(":");
  const cardA = (typeParts[0] || "1").toUpperCase();
  const cardB = (typeParts[1] || "1").toUpperCase();
  // Only 1:1 relationships are eligible for specialization hierarchies
  const isOneOne = cardA !== "N" && cardA !== "M" && cardB !== "N" && cardB !== "M";

  relNameInput.value = rel.name;

  const isIdentifying = !!rel.identifying;
  const disableManyA = isIdentifying && rel.parentSide === "a";
  const disableManyB = isIdentifying && rel.parentSide === "b";

  const extras = rel.extras || [];
  const relAttrs = rel.attributes || [];
  const isUnary = rel.a === rel.b;
  // --- identifying eligibility (weak entity) ---
  const aIsWeak = !!entA.isWeak;
  const bIsWeak = !!entB.isWeak;
  const exactlyOneWeak = (aIsWeak ^ bIsWeak); // XOR
  const weakSide = aIsWeak ? "a" : (bIsWeak ? "b" : null);

  // --- specialization state (new) ---
  const specializationExtras = rel.specializationExtras || [];
  const specDisjoint = (rel.specializationDisjoint !== false);  // default: disjoint
  const specTotal    = !!rel.specializationTotal;                // default: partial

  // Identifying only makes sense for binary, non-specialization, non-n-ary
  const canShowIdentifying =
    exactlyOneWeak &&
    (extras.length === 0) &&
    (specializationExtras.length === 0) &&
    !isUnary; // optional: you can allow unary later, but keep it simple now	

  const supportsRoleLabels = (extras.length === 0) && (specializationExtras.length === 0);

  const availableOthers = erd.entities
    .filter(e => e.id !== rel.a && e.id !== rel.b);

  const nAryOptionsHtml = availableOthers
    .map(e => {
      const checked = extras.includes(e.id) ? "checked" : "";
      return `
        <label style="display:block; margin-bottom:2px;">
          <input type="checkbox" class="rel-extra-entity" value="${e.id}" ${checked}>
          ${e.name}
        </label>`;
    }).join("");

  const specializationOptionsHtml = availableOthers
    .map(e => {
      const checked  = specializationExtras.includes(e.id) ? "checked" : "";
      const disabled = isOneOne ? "" : "disabled";
      return `
        <label style="display:block; margin-bottom:2px; opacity:${isOneOne ? "1" : ".5"};">
          <input type="checkbox" class="rel-specialization-entity"
                 value="${e.id}" ${checked} ${disabled}>
          ${e.name}
        </label>`;
    }).join("") || '<em>At least 2 potential subtype entities must pre-exist.</em>';

  const attrRowsHtml = relAttrs.map((a, i) => `
    <tr>
      <td>
        <input type="text" class="rel-attr-name" data-idx="${i}"
               value="${a.name || ""}">
      </td>
      <td>
        <select class="rel-attr-type" data-idx="${i}">
          ${SQL_TYPE_OPTIONS.map(
            t => `<option value="${t}" ${a.type === t ? "selected" : ""}>${t}</option>`
          ).join("")}
        </select>
      </td>
      <td style="text-align:center;">
        <input type="checkbox" class="rel-attr-nn" data-idx="${i}"
               ${a.notNull ? "checked" : ""}>
      </td>
      <td style="text-align:center;">
        <button type="button" class="rel-attr-del" data-idx="${i}">✕</button>
      </td>
    </tr>
  `).join("");

  const roleAVal = (typeof rel.roleA === "string") ? rel.roleA : "";
  const roleBVal = (typeof rel.roleB === "string") ? rel.roleB : "";

  relSidesPanel.innerHTML = `
    <div class="rel-edit-layout">
      <div class="rel-edit-side">
        <div class="rel-edit-side-title">${entA.name}</div>
        <div class="rel-edit-side-options">
          <label>
            <input type="checkbox" id="relManyA"
              ${cardA === "N" || cardA === "M" ? "checked" : ""}
              ${disableManyA ? "disabled" : ""}>
            Many on this side (…*)
          </label>
			  
		  <label class="opt-with-role">
			<input type="checkbox" id="relOptA" ${rel.optA ? "checked" : ""}>
			Optional on this side (0..)

			${supportsRoleLabels ? `
			  <span class="role-inline">
			    Role:
			    <input type="text"
			           id="relRoleA"
			           class="rel-role-input"
			           value="${roleAVal}"
			           placeholder="${isUnary ? "e.g., manager" : "e.g., buyer"}">
			  </span>
			` : ``}
	      </label>			  		  
        </div>
      </div>

      <div class="rel-edit-side">
        <div class="rel-edit-side-title">${entB.name}</div>
        <div class="rel-edit-side-options">
          <label>
            <input type="checkbox" id="relManyB"
              ${cardB === "N" || cardB === "M" ? "checked" : ""}
              ${disableManyB ? "disabled" : ""}>
            Many on this side (…*)
          </label>
		  <label class="opt-with-role">
			<input type="checkbox" id="relOptB" ${rel.optB ? "checked" : ""}>
			Optional on this side (0..)

			${supportsRoleLabels ? `
			  <span class="role-inline">
			    Role:
			    <input type="text"
			           id="relRoleB"
			           class="rel-role-input"
			           value="${roleBVal}"
			           placeholder="${isUnary ? "e.g., subordinate" : "e.g., order"}">
			  </span>
			` : ``}
		  </label>
        </div>
      </div>
    </div>
	${canShowIdentifying ? `
	  <div class="rel-section">
	    <h4>Weak entity key</h4>
		<label style="display:block; margin-top:6px;">
		  <input type="checkbox" id="relIdentifying" ${rel.identifying ? "checked" : ""}>
		  Make identifying (parent key becomes part of weak entity PK)
	    </label>
	    <div style="font-size:12px; color:#555; margin-top:4px;">
	      When enabled, the weak side is forced to be “Many” and “NOT optional”.
		</div>
	  </div>
	` : ``}

    <div class="rel-section">
      <h4>Relationship Attributes</h4>
      <table id="relAttrTable">
        <thead>
          <tr>
            <th style="width:40%;">Name</th>
            <th style="width:30%;">Type</th>
            <th style="width:15%;">NOT NULL</th>
            <th style="width:15%;">Delete</th>
          </tr>
        </thead>
        <tbody id="relAttrBody">
          ${attrRowsHtml}
        </tbody>
      </table>
      <button type="button" id="relAddAttrBtn" style="margin-top:6px;">
        + Add Attribute
      </button>
    </div>

    <div class="rel-section">
      <h4>Additional entities (n-ary)</h4>
      <div style="margin-top:4px; max-height:120px; overflow:auto;">
        ${nAryOptionsHtml || '<em>No other entities defined yet.</em>'}
      </div>
      <div style="font-size:12px; color:#555; margin-top:4px;">
        If you select one or more additional entities, this becomes an n-ary
        relationship and all ends will be treated as “Many” in the relational schema.
      </div>
    </div>

    <div class="rel-section">
      <h4>Specialization hierarchy</h4>
      <div style="margin-top:4px; max-height:120px; overflow:auto;">
        ${specializationOptionsHtml}
      </div>
      <div style="font-size:12px; color:#555; margin-top:4px;">
        Select one or more entities to form a specialization hierarchy.
        All ends are treated as 1:1 in the ERD (typically, ${entA.name} is the supertype).<br>
        <strong>Note:</strong> Specialization is only available for 1:1 relationships whose
        entities share the same primary key.
      </div>      <div style="margin-top:8px; display:flex; gap:24px; font-size:13px;">
        <label>
          <input type="checkbox" id="relSpecDisjoint" ${specDisjoint ? "checked" : ""}>
          Disjoint (an instance belongs to at most one subtype)
        </label>
        <label>
          <input type="checkbox" id="relSpecTotal" ${specTotal ? "checked" : ""}>
          Total specialization (every ${entA.name} is in some subtype)
        </label>
      </div>
    </div>
  `;

  // --- wire up attribute add/delete ---
  const relAttrBodyEl = relSidesPanel.querySelector("#relAttrBody");
  const addBtn = relSidesPanel.querySelector("#relAddAttrBtn");

  if (addBtn) {
    addBtn.addEventListener("click", () => {
      const idx = relAttrBodyEl.querySelectorAll("tr").length;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <input type="text" class="rel-attr-name" data-idx="${idx}">
        </td>
        <td>
          <select class="rel-attr-type" data-idx="${idx}">
            ${SQL_TYPE_OPTIONS.map(t => `<option value="${t}">${t}</option>`).join("")}
          </select>
        </td>
        <td style="text-align:center;">
          <input type="checkbox" class="rel-attr-nn" data-idx="${idx}">
        </td>
        <td style="text-align:center;">
          <button type="button" class="rel-attr-del" data-idx="${idx}">✕</button>
        </td>
      `;
      relAttrBodyEl.appendChild(tr);
    });
  }

  relAttrBodyEl.addEventListener("click", (ev) => {
    if (!ev.target.classList.contains("rel-attr-del")) return;
    const row = ev.target.closest("tr");
    if (row) row.remove();
  });

  // --- mutual-exclusion logic: n-ary vs specialization ---
  const nAryChecks  = Array.from(relSidesPanel.querySelectorAll(".rel-extra-entity"));
  const specChecks  = Array.from(relSidesPanel.querySelectorAll(".rel-specialization-entity"));
  const specDisEl   = document.getElementById("relSpecDisjoint");
  const specTotalEl = document.getElementById("relSpecTotal");

  function refreshSpecializationEnableState() {
    const identEl = document.getElementById("relIdentifying");
    const identifyingOn = !!(identEl && identEl.checked);
    const anyNAry  = nAryChecks.some(chk => chk.checked);
    const anySpec  = specChecks.some(chk => chk.checked);

    const allowSpec = isOneOne && !anyNAry && !identifyingOn;

    // Specialization only when 1:1 AND not n-ary
    specChecks.forEach(chk => {
      chk.disabled = !allowSpec;
    });
    if (specDisEl) {
      specDisEl.disabled = !allowSpec || !anySpec;
    }
    if (specTotalEl) {
      specTotalEl.disabled = !allowSpec || !anySpec;
    }

    // If specialization is chosen, we still prevent n-ary at the same time
    nAryChecks.forEach(chk => {
      chk.disabled = anySpec || identifyingOn;
    });
    if (identEl) identEl.addEventListener("change", refreshSpecializationEnableState);
  }

  nAryChecks.forEach(chk => chk.addEventListener("change", refreshSpecializationEnableState));
  specChecks.forEach(chk => chk.addEventListener("change", refreshSpecializationEnableState));
  refreshSpecializationEnableState();

  relModal.classList.add("show");
}


function entitiesShareSamePk(ent1, ent2) {
  if (!ent1 || !ent2) return false;

  const pkNames1 = (ent1.attributes || [])
    .filter(a => a.pk)
    .map(a => (a.name || "").toLowerCase())
    .sort();

  const pkNames2 = (ent2.attributes || [])
    .filter(a => a.pk)
    .map(a => (a.name || "").toLowerCase())
    .sort();

  if (!pkNames1.length || !pkNames2.length) return false;
  if (pkNames1.length !== pkNames2.length) return false;

  for (let i = 0; i < pkNames1.length; i++) {
    if (pkNames1[i] !== pkNames2[i]) return false;
  }
  return true;
}

function closeRelModal() {
  editingRelId = null;
  relModal.classList.remove("show");
}

function saveRelModal() {
  if (!editingRelId) return;
  const rel = erd.relationships.find(r => r.id === editingRelId);
  if (!rel) return;

  const oldRelAttrs = rel.attributes || [];

  // 1. Name
  const name = relNameInput.value.trim();
  if (name) rel.name = name;

  // 2. Cardinalities + optional flags
  const manyAEl = document.getElementById("relManyA");
  const manyBEl = document.getElementById("relManyB");
  const optAEl  = document.getElementById("relOptA");
  const optBEl  = document.getElementById("relOptB");

  const manyA  = !!(manyAEl && manyAEl.checked);
  const manyB  = !!(manyBEl && manyBEl.checked);
  const optA   = !!(optAEl  && optAEl.checked);
  const optB   = !!(optBEl  && optBEl.checked);

  const normCard = c => (c ? "N" : "1");
  rel.type = `${normCard(manyA)}:${normCard(manyB)}`;
  rel.optA = optA;
  rel.optB = optB;

  // 2.5 Identifying (weak entity) toggle
  const identEl = document.getElementById("relIdentifying");
  const wantIdentifying = !!(identEl && identEl.checked);

  if (wantIdentifying) {
    const entA = erd.entities.find(e => e.id === rel.a);
    const entB = erd.entities.find(e => e.id === rel.b);
    const aIsWeak = !!(entA && entA.isWeak);
    const bIsWeak = !!(entB && entB.isWeak);

    // Only allow if exactly one side is weak and relationship is binary
    const exactlyOneWeak = (aIsWeak ^ bIsWeak);
    const hasNAry = Array.isArray(rel.extras) && rel.extras.length > 0;
    const hasSpec = Array.isArray(rel.specializationExtras) && rel.specializationExtras.length > 0;

    if (!exactlyOneWeak || hasNAry || hasSpec) {
      // Safety fallback: reject silently and clear
      rel.identifying = false;
      rel.parentSide = undefined;
    } else {
      // Parent is the NON-weak side
      const parentSide = aIsWeak ? "b" : "a";
      const weakSide   = aIsWeak ? "a" : "b";

      rel.identifying = true;
      rel.parentSide = parentSide;
      // Optional: if you want to forbid M:N for identifying weak semantics:
      const [l, rr] = String(rel.type || "1:1").toUpperCase().split(":");
      const manyA = (l === "N" || l === "M");
      const manyB = (rr === "N" || rr === "M");
      if (manyA && manyB) {
        // If you prefer to reject silently:
        rel.identifying = false;
        rel.parentSide = undefined;
        // Or instead, you could auto-coerce to 1:N with weak on N side.
        // return;
      } else {
        if (parentSide === "a") {
          // weak side is B; enforce: B requires A
          rel.optA = false;
        } else {
          // parentSide === "b"; weak side is A; enforce: A requires B
          rel.optB = false;
        }
        // OPTIONAL: You may still want to prevent editing "Many" checkboxes
        // in the UI for the weak side if you have other weak-entity creation semantics,
        // but schema-wise it's fine to allow identifying 1:1 too.
      }
    }
  } else {
    // If unchecked, clear identifying flags
    rel.identifying = false;
    rel.parentSide = undefined;
  }
  
  // 3. n-ary participants
  if (relSidesPanel) {
    const extraChecks = relSidesPanel.querySelectorAll(".rel-extra-entity");
    const extras = [];
    extraChecks.forEach(chk => {
      if (chk.checked && !chk.disabled) extras.push(chk.value);
    });
    rel.extras = extras;
  }
  
  // 3.5 Role labels (only for unary/binary; NOT for n-ary or specialization)
  const hasNAry = Array.isArray(rel.extras) && rel.extras.length > 0;

  // We'll compute specialization later; for now just read role inputs if present
  const roleAEl = document.getElementById("relRoleA");
  const roleBEl = document.getElementById("relRoleB");

  // Temporarily store raw values (we'll decide whether to keep them after spec logic)
  const roleARaw = roleAEl ? roleAEl.value.trim() : "";
  const roleBRaw = roleBEl ? roleBEl.value.trim() : "";

  // If n-ary is active, immediately clear (we don't support role labels there)
  if (hasNAry) {
    rel.roleA = "";
    rel.roleB = "";
  } else {
    // Tentatively set; may be cleared if specialization is later enabled
    rel.roleA = roleARaw;
    rel.roleB = roleBRaw;
  }  

  // 4. specialization participants (new)
  if (relSidesPanel) {
    const specChecks = relSidesPanel.querySelectorAll(".rel-specialization-entity");
    const specializationExtras = [];
    specChecks.forEach(chk => {
      if (chk.checked && !chk.disabled) specializationExtras.push(chk.value);
    });

    // Relationship must be 1:1 to allow specialization
    const isOneOne = !manyA && !manyB;

    if (!isOneOne || specializationExtras.length === 0) {
      // Not eligible or nothing selected → clear any prior specialization
      rel.specializationExtras   = [];
      rel.specializationDisjoint = false;
      rel.specializationTotal    = false;
    } else {
      // Check PK compatibility: supertype (A) and all selected subtypes
      const entA = erd.entities.find(e => e.id === rel.a);
      const subEntities = specializationExtras
        .map(id => erd.entities.find(e => e.id === id))
        .filter(Boolean);

      const allMatch = subEntities.every(sub => entitiesShareSamePk(entA, sub));

      if (!allMatch) {
        alert(
          "Specialization hierarchy could not be created.\n\n" +
          "The supertype and selected subtypes do not share the same primary key " +
          "(same PK attribute names). Please align their PKs and try again."
        );
        rel.specializationExtras   = [];
        rel.specializationDisjoint = false;
        rel.specializationTotal    = false;
      } else {
        rel.specializationExtras = specializationExtras;

        const hasSpec = specializationExtras.length > 0;
        const specDisEl   = document.getElementById("relSpecDisjoint");
        const specTotalEl = document.getElementById("relSpecTotal");

        rel.specializationDisjoint = hasSpec && specDisEl && specDisEl.checked;
        rel.specializationTotal    = hasSpec && specTotalEl && specTotalEl.checked;
      }
    }
  }
  // If specialization is active, we do NOT support role labels → clear them
  const hasSpec = Array.isArray(rel.specializationExtras) && rel.specializationExtras.length > 0;
  if (hasSpec) {
    rel.roleA = "";
    rel.roleB = "";
  }
    
  // 5. Relationship attributes
  const relAttrBodyEl = document.getElementById("relAttrBody");
  if (relAttrBodyEl) {
    const rows = relAttrBodyEl.querySelectorAll("tr");
    const attrs = [];

    rows.forEach(row => {
      const nameInput = row.querySelector(".rel-attr-name");
      const typeSelect = row.querySelector(".rel-attr-type");
      const nnCheck    = row.querySelector(".rel-attr-nn");
      if (!nameInput || !typeSelect) return;

      const attrName = nameInput.value.trim();
      if (!attrName) return;

      const attrType = (typeSelect.value || "TEXT").trim();
      const notNull  = !!(nnCheck && nnCheck.checked);

      const base = { name: attrName, type: attrType, notNull };

      const old = oldRelAttrs.find(a => a.name === attrName);
      if (old) {
        if (typeof old.ovalX === "number") base.ovalX = old.ovalX;
        if (typeof old.ovalY === "number") base.ovalY = old.ovalY;
      }

      attrs.push(base);
    });

    rel.attributes = attrs;
  }

  closeRelModal();
  render();
}


// ---------- Helper: ensure we have a table object for each entity ----------
function makeInitialTableMap() {
  const tableMap = new Map();

  erd.entities.forEach(ent => {
    const cols = (ent.attributes || []).map(a => ({
      name: a.name,
      type: a.type || "TEXT",
      notNull: !!(a.notNull || a.pk),
      unique: !!a.unique,
      pk: !!a.pk,
      fk: !!a.fk,
      // we don't store actual FK targets on attributes yet,
      // but we'll add .references when we create/join FKs.
      references: a.references || null,
	  multi: !!a.multi
    }));

    tableMap.set(ent.id, {
      id: ent.id,
      name: ent.name,
      cols,
      isAssoc: false,       // will be true for auto junction tables
      fromRelId: null
    });
  });

  return tableMap;
}

// ---------- Helper: add FK columns for 1:N / N:1 ----------
function addForeignKeyColumns(childTable, parentEntity, isOptionalOnChild) {
  if (!childTable || !parentEntity) return;

  const parentPKs = (parentEntity.attributes || []).filter(a => a.pk);
  if (!parentPKs.length) {
    // No primary key to reference; nothing to add.
    return;
  }

  parentPKs.forEach(pkAttr => {
    // If the child already has a column with this name, don't duplicate
    if (childTable.cols.some(c => c.name === pkAttr.name)) {
      return;
    }

    childTable.cols.push({
      name: pkAttr.name,
      type: pkAttr.type || "TEXT",
      notNull: !isOptionalOnChild,   // optional ⇒ FK may be NULL
      unique: false,
      pk: false,
      fk: true,
      references: {
        table: parentEntity.name,
        column: pkAttr.name
      }
    });
  });
}

// ---------- Helper: pick a unique name for a junction table ----------
function makeAssocTableName(rel, entA, entB, existingTables) {
  const base =
    (rel && rel.name)
      ? rel.name
      : (entA.name + "_" + entB.name);

  // Start with something like "Enrollment" or "StudentCourse"
  let candidate =
    base.charAt(0).toUpperCase() + base.slice(1);

  const usedNames = new Set(
    Array.from(existingTables.values()).map(t => t.name)
  );

  if (!usedNames.has(candidate)) return candidate;

  // Fallback: add suffixes until we find a free name
  let i = 2;
  while (usedNames.has(candidate + "_" + i)) {
    i++;
  }
  return candidate + "_" + i;
}

// ---------- Helper: add FK-based columns for M:N junction table ----------
function addJunctionFKColumns(assocCols, ent, existingColNames) {
  const pkAttrs = (ent.attributes || []).filter(a => a.pk);
  if (!pkAttrs.length) return;

  pkAttrs.forEach(pkAttr => {
    let colName = pkAttr.name;

    // Avoid name collisions if both sides use same PK name
    if (existingColNames.has(colName)) {
      colName = ent.name + "_" + pkAttr.name;
    }

    existingColNames.add(colName);

    assocCols.push({
      name: colName,
      type: pkAttr.type || "TEXT",
      notNull: true,
      unique: false,
      pk: true,       // part of composite PK of junction table
      fk: true,
      references: {
        table: ent.name,
        column: pkAttr.name
      }
    });
  });
}


// ---------- Helper: is this relationship eligible for associative-entity conversion? ----------
function isManyManyOrNAry(rel) {
  const extras = rel.extras || [];
  if (extras.length >= 1) return true; // n-ary (3+ participants)

  // binary case: require M:N / N:M
  const typeParts = (rel.type || "1:1").toUpperCase().split(":");
  const left  = (typeParts[0] || "1");
  const right = (typeParts[1] || "1");
  const manyLeft  = /[NM]/.test(left);
  const manyRight = /[NM]/.test(right);
  return manyLeft && manyRight;
}

// ---------- Core: convert M:N or n-ary relationship into an associative entity ----------
function convertRelationshipToAssociative(rel) {
  if (!isManyManyOrNAry(rel)) {
    alert("Only M:N or n-ary (3+ entities) relationships can be converted to an associative entity.");
    return;
  }

  // Collect all participating entity ids: primary ends + extras
  const extras      = rel.extras || [];
  const participantIds = [rel.a, rel.b, ...extras];

  const participants = participantIds
    .map(id => erd.entities.find(e => e.id === id))
    .filter(Boolean);

  if (participants.length < 2) {
    alert("Not enough entities are attached to this relationship.");
    return;
  }

  // Position new associative entity roughly at the center of participants
  let sumX = 0, sumY = 0;
  participants.forEach(ent => {
    sumX += (ent.x || 0);
    sumY += (ent.y || 0);
  });
  const avgX = sumX / participants.length + 40; // small offset so it doesn't overlap
  const avgY = sumY / participants.length;

  // Build attributes for the associative entity:
  // - all PKs from participants as PK+FK
  // - then relationship attributes as regular attrs
  const assocAttrs = [];
  const usedNames = new Set();

  function addAssocAttrFromPk(ent, pkAttr) {
    let name = pkAttr.name || (ent.name + "_id");
    if (usedNames.has(name)) {
      name = ent.name + "_" + name; // avoid collisions
    }
    usedNames.add(name);
    assocAttrs.push({
      name,
      type: pkAttr.type || "TEXT",
      pk: true,
      fk: true,
      notNull: true,
      references: {
        table: ent.name,
        column: pkAttr.name
      },
	  // optional: associative entity keys are never multi-valued
	  multi: false
    });
  }

  participants.forEach(ent => {
    const pkAttrs = (ent.attributes || []).filter(a => a.pk);
    if (!pkAttrs.length) {
      // If no PK defined, we skip; you could also auto-create a surrogate here.
      return;
    }
    pkAttrs.forEach(pkAttr => addAssocAttrFromPk(ent, pkAttr));
  });

  // Add relationship-level attributes as non-PK, non-FK
  (rel.attributes || []).forEach(a => {
    let name = a.name || "attr";
    if (usedNames.has(name)) {
      name = rel.name + "_" + name;
    }
    usedNames.add(name);
    assocAttrs.push({
      name,
      type: a.type || "TEXT",
      pk: false,
      fk: false,
      notNull: !!a.notNull,
	  multi: false	
    });
  });

  // Create the new associative entity
  function makeUniqueEntityId(base) {
    let id = base.toLowerCase().replace(/\s+/g, "_");
    const already = new Set(erd.entities.map(e => e.id));
    if (!already.has(id)) return id;
    let i = 2;
    while (already.has(id + "_" + i)) i++;
    return id + "_" + i;
  }

  const assocName = rel.name ? rel.name.charAt(0).toUpperCase() + rel.name.slice(1) : "Associative";
  const assocId   = makeUniqueEntityId(assocName);

  const assocEntity = {
    id: assocId,
    name: assocName,
    x: avgX,
    y: avgY,
    attributes: assocAttrs,
    isAssociative: true   // just a flag you can style later if you like
  };

  erd.entities.push(assocEntity);

  // Remove the original relationship
  erd.relationships = erd.relationships.filter(r => r.id !== rel.id);


  // Create new 1:N relationships from each original entity to the associative entity
  participantIds.forEach((entId, idx) => {
    const ent = erd.entities.find(e => e.id === entId);
    if (!ent) return;

    erd.relationships.push({
      id: "r" + Math.random().toString(36).slice(2, 7),
      name: "has",       // <<< use a neutral label for all associative links
      type: "1:N",       // parent:1 → associative:* (many rows per parent)
      a: ent.id,         // parent side
      b: assocId,        // child (associative entity)
      optA: false,
      optB: true,
      identifying: true,
      parentSide: "a"
    });
  });

  render();
}

// ---- Helpers for unique entity names ----
function isEntityNameInUse(name) {
  const norm = String(name || "").trim().toLowerCase();
  if (!norm) return false;

  return erd.entities.some(e => {
    const byName = (e.name || "").trim().toLowerCase() === norm;
    const byId   = (e.id   || "").trim().toLowerCase() === norm;
    return byName || byId;
  });
}

// Prompt the user until they give a non-empty, unique entity name,
// or cancel. Returns the chosen name (string) or null if cancelled.
function promptForNewEntityName(message, defaultValue) {
  while (true) {
    let n = prompt(message, defaultValue || "");
    if (n === null) return null;          // user pressed Cancel

    n = n.trim();
    if (!n) {
      alert("Please enter a non-empty name.");
      continue;
    }

    if (isEntityNameInUse(n)) {
      alert(`An entity named "${n}" (or id "${n.toLowerCase()}") already exists. Please choose a different name.`);
      continue;
    }

    return n;
  }
}

//  ---------- Add Entity ---------- */
function addEntity() {
  const n = promptForNewEntityName("Entity name:");
  if (!n) return;   // user cancelled

  const id = n.toLowerCase();   // safe enough for your current usage

  erd.entities.push({
    id,
    name: n,
    x: 100,
    y: 80,
    attributes: []
  });

  render();
}


function duplicateEntity(sourceId) {
  const src = erd.entities.find(e => e.id === sourceId);
  if (!src) return;

  // ----- new id / name -----
  const baseId = src.id + "_copy";
  let newId = baseId;
  let k = 2;
  while (erd.entities.some(e => e.id === newId)) {
    newId = baseId + "_" + k++;
  }

  const newName = src.name + " (Copy)";

  // ----- clone entity -----
  const newEnt = JSON.parse(JSON.stringify(src));
  newEnt.id = newId;
  newEnt.name = newName;
  newEnt.x = (src.x || 0) + 40;   // small offset so it’s visible
  newEnt.y = (src.y || 0) + 40;
  delete newEnt.width;
  delete newEnt.height;

  erd.entities.push(newEnt);

  // ----- clone relationships that involve this entity -----
  const newRels = [];

  erd.relationships.forEach(r => {
    let touches = false;
    const rCopy = JSON.parse(JSON.stringify(r));

    // if source is on side a/b, swap that side to new entity
    if (r.a === sourceId) {
      rCopy.a = newId;
      touches = true;
    }
    if (r.b === sourceId) {
      rCopy.b = newId;
      touches = true;
    }

    // if source appears in n-ary extras, swap that entry
    if (Array.isArray(r.extras) && r.extras.includes(sourceId)) {
      rCopy.extras = r.extras.map(id => (id === sourceId ? newId : id));
      touches = true;
    }

    // if source appears as a specialization subtype, swap that entry
    if (Array.isArray(r.specializationExtras) &&
        r.specializationExtras.includes(sourceId)) {
      rCopy.specializationExtras =
        r.specializationExtras.map(id => (id === sourceId ? newId : id));
      touches = true;
    }

    if (touches) {
      rCopy.id = "r" + Math.random().toString(36).slice(2, 7);
      // optional: clear per-layout diamond position so it re-centers
      delete rCopy.x;
      delete rCopy.y;
      newRels.push(rCopy);
    }
  });

  erd.relationships.push(...newRels);

  render();
}

//  =========================
//     ERD Canvas from MERMAID script
//  ========================= */
async function MermaidToErd() {
  const raw = document.getElementById("mermaidOut").value.trim();
  if (!raw) {
    alert("Paste Mermaid code first.");
    return;
  }

  // ✅ Show working messages immediately
  document.getElementById("sqlOut").value =
    "-- Sending Mermaid to backend for parsing...\n-- Please wait...";
  document.getElementById("mermaidOut").value =
    raw + "\n\n%% Parsing Mermaid on server...";

  try {
    const resp = await fetch(BACKEND_URL + "/mermaid-to-erd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mermaid: raw })
    });

    if (!resp.ok) {
      throw new Error("Server returned " + resp.status);
    }

    const data = await resp.json();  // { erd }
    erd = data.erd;                  // ✅ overwrite current ERD
    render();                        // ✅ redraw canvas

    document.getElementById("sqlOut").value =
      "-- ERD successfully reconstructed from Mermaid.\n" +
      "-- You may now edit the diagram or rebuild the schema.";
  } catch (err) {
    document.getElementById("sqlOut").value =
      "-- ERROR ing Mermaid remotely: " + err.message;
    document.getElementById("mermaidOut").value =
      raw + "\n\n%% ERROR: " + err.message;
  }
}


//  =========================
//    SCHEMA + MERMAID (from ERD)
//  ========================= */
async function buildSchema() {
  const sqlOut = document.getElementById("sqlOut");
  const mermaidOut = document.getElementById("mermaidOut");

  // simple guard UI
  sqlOut.value = "-- Building schema remotely…";
  mermaidOut.value = "erDiagram\n  %% Building schema remotely…";

  try {
    const resp = await fetch("https://erd-schema-backend.onrender.com/build-schema", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(erd)      // <-- use the global ERD object
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`HTTP ${resp.status} – ${text}`);
    }

    const data = await resp.json();
    sqlOut.value = data.sql || "";
    mermaidOut.value = data.mermaid || "";
  } catch (err) {
    console.error("buildSchema error:", err);
    sqlOut.value = `-- Error building schema: ${err.message}`;
    mermaidOut.value = "erDiagram\n  %% Error building schema on server.";
  }
}

// ------- Save /  ERD layouts (canvas) -------

// Align to the next 5-minute boundary for “nice” times
function msUntilNext5Min() {
  const now = new Date();
  const mins = now.getMinutes();
  const next = Math.ceil((mins + 0.001) / SNAPSHOT_INTERVAL_MIN) * SNAPSHOT_INTERVAL_MIN;
  const nextTime = new Date(now);
  nextTime.setMinutes(next, 0, 0);
  return nextTime - now;
}

setTimeout(() => {
  // take one snapshot immediately at the boundary
  pushSnapshot(erd);

  // then repeat every 5 minutes
  setInterval(() => pushSnapshot(erd), SNAPSHOT_INTERVAL_MIN * 60 * 1000);
}, msUntilNext5Min());




function refreshSavedErdList() {
  const sel = document.getElementById("savedErdSelect");
  if (!sel) return;

  const saved = JSON.parse(localStorage.getItem(ERD_STORAGE_KEY) || "[]");

  sel.innerHTML = '<option value="">-- Select Saved ERD --</option>';

  saved.forEach((item, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);              // index into the saved array
    opt.textContent = `[${idx + 1}] ${item.name}`;
    sel.appendChild(opt);
  });
}

function saveErdLayout() {
  const name = prompt("Enter a name for this ERD layout:", "My ERD");
  if (!name) return;

  // current ERD state (entities + relationships)
  const current = erd;

  let saved = JSON.parse(localStorage.getItem(ERD_STORAGE_KEY) || "[]");

  // If a layout with same name exists, offer to overwrite it
  const existingIndex = saved.findIndex(item => item.name === name);
  if (existingIndex >= 0) {
    const overwrite = confirm(
      `An ERD named "${name}" already exists. Overwrite it?`
    );
    if (!overwrite) return;
    saved[existingIndex] = { name, data: current };
  } else {
    if (saved.length >= MAX_ERD_SAVES) {
      // simple FIFO – drop oldest
      saved.shift();
    }
    saved.push({ name, data: current });
  }

  localStorage.setItem(ERD_STORAGE_KEY, JSON.stringify(saved));
  refreshSavedErdList();
  alert(`ERD layout "${name}" saved.`);
}


function loadErdLayout(idxStr) {
  if (idxStr == null || idxStr === "") return;

  const saved = JSON.parse(localStorage.getItem(ERD_STORAGE_KEY) || "[]");
  const idx = Number(idxStr);

  if (!Number.isFinite(idx) || idx < 0 || idx >= saved.length) return;

  const item = saved[idx];
  if (!item) return;

  // Expect shape like: { name, erd: {entities, relationships} }
  // (fallbacks included just in case older saves used a different property name)
  const loaded = item.erd || item.data || item;
  if (!loaded || !Array.isArray(loaded.entities) || !Array.isArray(loaded.relationships)) {
    alert("Saved ERD is missing entities/relationships.");
    return;
  }

  erd = cloneErd(loaded);

  // Persist so schema.html / sandbox.html see the same current ERD
  saveCurrentErdState(erd);

  // Redraw canvas
  render();

  // Optional nice touch: clear the dropdown selection after load
  const sel = document.getElementById("savedErdSelect");
  if (sel) sel.value = "";

  // Optional: refresh time machine menu if you want it to reflect the loaded ERD immediately
  if (typeof refreshTimeMachineDropdown === "function") refreshTimeMachineDropdown();
}

// Make it callable from inline HTML onchange="..."
window.loadErdLayout = loadErdLayout;



function ErdLayout(value) {
  if (value === "") return;

  const idx = parseInt(value, 10);
  if (Number.isNaN(idx)) return;

  const saved = JSON.parse(localStorage.getItem(ERD_STORAGE_KEY) || "[]");
  const item = saved[idx];
  if (!item || !item.data) {
    alert("Could not  that ERD layout.");
    return;
  }

  erd = cloneErd(item.data);
  render();

  // Optional: reset schema/mermaid text to indicate they’re out of date
  document.getElementById("sqlOut").value =
    "-- Click 'Build Schema from ERD' to regenerate SQL for this ERD.";
  document.getElementById("mermaidOut").value =
    "erDiagram\n  %% Click 'Build Schema from ERD' to regenerate ERD text.";
}

function deleteErdLayout() {
  const sel = document.getElementById("savedErdSelect");
  const value = sel.value;
  if (!value) {
    alert("Select a saved ERD to delete.");
    return;
  }

  const idx = parseInt(value, 10);
  if (Number.isNaN(idx)) {
    alert("Could not parse selection.");
    return;
  }

  let saved = JSON.parse(localStorage.getItem(ERD_STORAGE_KEY) || "[]");
  const item = saved[idx];
  if (!item) {
    alert("Could not find that ERD in storage.");
    return;
  }

  if (!confirm(`Delete saved ERD "${item.name}"? This cannot be undone.`)) {
    return;
  }

  saved.splice(idx, 1);
  localStorage.setItem(ERD_STORAGE_KEY, JSON.stringify(saved));
  refreshSavedErdList();
  sel.value = "";
}

function switchErdPreset(key) {
  if (key === "blank") {
    // Explicitly clear the ERD
    erd = { entities: [], relationships: [] };
  } else {
    const preset = ERD_PRESETS[key];
    if (!preset) {
      console.warn("Unknown ERD preset:", key);
      return;
    }
    erd = cloneErd(preset.data);
  }
  
  // Re-render canvas
  render();

  // Optional: reset the text areas so it’s clear the schema is tied to the current ERD
  document.getElementById("sqlOut").value =
    "-- Click 'Build Schema from ERD' to regenerate SQL for this ERD.";
  document.getElementById("mermaidOut").value =
    "erDiagram\n  %% Click 'Build Schema from ERD' to regenerate ERD text.";
}


//  ---------- Open Mermaid Preview in new tab ---------- */
function openMermaidPreview() {
  const code = (document.getElementById("mermaidOut").value || "").trim();
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
      <script>mermaid.initialize({startOn:true});<\/script>
    </body>
    </html>
  `);
  w.document.close();
}

//  ---------- Init ---------- */
makeModalDraggable(entityModal);
makeModalDraggable(relModal);
render();
