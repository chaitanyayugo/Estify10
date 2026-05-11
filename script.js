// =====================================================
// ESTIFY • ONE TEMPLATE / MANY VARIANTS
// Model = one sofa template
// Variant = colour + configuration
// Price = base + colour extra + config extra
// =====================================================

let material_master = [];
let price_sheet = [];

window.estifyPlans = {};
window.estifyCurrentPlan = null;

// =====================================================
// LOAD DATA
// =====================================================
async function loadData() {
  if (material_master.length && price_sheet.length) return;

  const [mRes, pRes] = await Promise.all([
    fetch("./material_master.json"),
    fetch("./price_sheet.json")
  ]);

  if (!mRes.ok) {
    throw new Error("material_master.json failed to load");
  }

  if (!pRes.ok) {
    throw new Error("price_sheet.json failed to load");
  }

  material_master = await mRes.json();
  price_sheet = await pRes.json();
}

// =====================================================
// HELPERS
// =====================================================
function normalize(v) {
  return String(v ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function formatValue(v) {
  const n = Number(v);
  return Number.isFinite(n)
    ? new Intl.NumberFormat("en-IN").format(Math.round(n))
    : "—";
}

function formatPrecise(v) {
  const n = Number(v);
  return Number.isFinite(n)
    ? new Intl.NumberFormat("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(n)
    : "—";
}

function pickEl(...ids) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}

function showToast(message) {
  const old = document.querySelector(".estify-toast");
  if (old) old.remove();

  const toast = document.createElement("div");
  toast.className = "estify-toast";
  toast.textContent = message;

  Object.assign(toast.style, {
    position: "fixed",
    right: "24px",
    bottom: "24px",
    padding: "14px 18px",
    background: "rgba(15,23,42,.95)",
    border: "1px solid rgba(255,255,255,.08)",
    borderRadius: "16px",
    color: "#fff",
    zIndex: "999999",
    boxShadow: "0 20px 60px rgba(0,0,0,.45)"
  });

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function copyText(text) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => showToast("Copied to clipboard"))
      .catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
  showToast("Copied to clipboard");
}

function isRawLine(input) {
  const text = String(input || "").trim();
  return text.length > 0 && !text.includes("(") && !text.includes(")");
}

function isMaterialCode(value) {
  const v = normalize(value);
  return material_master.some(m => normalize(m.code) === v);
}

function looksLikeConfig(value) {
  const v = normalize(value);

  return (
    /^\d+(\.\d+)?(X\d+)?([A-Z]+)?$/.test(v) ||
    /^\d+X\d+([A-Z]+)?$/.test(v) ||
    /^[A-Z]?\d+(\.\d+)?S$/.test(v) ||
    /^[A-Z]?\d+(\.\d+)?SS$/.test(v) ||
    (/^[A-Z]{1,4}\d+[A-Z0-9\-_/]*$/.test(v) && !isMaterialCode(v)) ||
    v.includes("+") ||
    /^LHF$/i.test(v) ||
    /^RHF$/i.test(v) ||
    /^LF$/i.test(v) ||
    /^RF$/i.test(v) ||
    /^NS$/i.test(v) ||
    /^WB$/i.test(v) ||
    /^BF$/i.test(v) ||
    /^U$/i.test(v) ||
    /^CM$/i.test(v) ||
    /^BFU$/i.test(v) ||
    /^WBF$/i.test(v) ||
    /^RFSTB$/i.test(v)
  );
}

function chooseMostCommon(values) {
  const counts = new Map();
  const order = [];

  for (const v of values) {
    if (!counts.has(v)) order.push(v);
    counts.set(v, (counts.get(v) || 0) + 1);
  }

  return order.sort((a, b) => {
    const diff = (counts.get(b) || 0) - (counts.get(a) || 0);
    return diff !== 0 ? diff : a.localeCompare(b);
  })[0];
}

// =====================================================
// PARSER
// =====================================================
function extractCode(fabricPart) {
  const text = normalize(fabricPart);

  const sortedCodes = material_master
    .map(m => normalize(m.code))
    .sort((a, b) => b.length - a.length);

  for (const code of sortedCodes) {
    if (
      text === code ||
      text.startsWith(code + "-") ||
      text.startsWith(code + " ")
    ) {
      return code;
    }
  }

  return text.split("-")[0];
}

function parseVariant(input) {
  input = String(input || "").trim().replace(/\s+/g, " ");

  // RAW FORMAT
  if (isRawLine(input)) {
    const tokens = input.split(" ").filter(Boolean);

    if (tokens.length < 2) {
      throw new Error(`Unable to parse raw format: ${input}`);
    }

    const model = tokens.shift().trim();
    const config = tokens.join(" ").trim().toUpperCase();

    return {
      model: normalize(model),
      code: /BED/i.test(model) ? "BED" : "RAW",
      config
    };
  }

  // BRACKET FORMAT
  const brackets = input.match(/\(([^()]*)\)/g);

  if (!brackets || brackets.length < 2) {
    throw new Error(`Invalid bracket format: ${input}`);
  }

  const prefix = brackets[0].replace(/[()]/g, "").trim();
  const afterPrefix = input.split(")")[1]?.trim() || "";
  const modelName = afterPrefix.split(" ")[0];
  const model = `${prefix}-${modelName}`;

  const last = brackets[brackets.length - 1].replace(/[()]/g, "").trim();

  let fabricPart = "";
  let configPart = "";

  if (last.includes(",")) {
    const split = last.split(",");
    fabricPart = split[0]?.trim() || "";
    configPart = split[1]?.trim() || "";
  } else {
    const pieces = last.split(" ").filter(Boolean);
    if (pieces.length < 2) {
      throw new Error(`Invalid fabric/config structure: ${input}`);
    }
    fabricPart = pieces[0].trim();
    configPart = pieces.slice(1).join(" ").trim();
  }

  // Smart swap if they are reversed
  if (isMaterialCode(configPart) && !isMaterialCode(fabricPart)) {
    [fabricPart, configPart] = [configPart, fabricPart];
  } else if (looksLikeConfig(fabricPart) && !looksLikeConfig(configPart)) {
    [fabricPart, configPart] = [configPart, fabricPart];
  }

  const code = extractCode(fabricPart);

  return {
    model: normalize(model),
    code: normalize(code),
    config: normalize(configPart)
  };
}

// =====================================================
// GRADE
// =====================================================
function getGrade(code) {
  const safeCode = normalize(code);

  if (
    !safeCode ||
    safeCode === "DEFAULT" ||
    safeCode === "RAW" ||
    safeCode === "BED"
  ) {
    return "DEFAULT";
  }

  const item = material_master.find(m => normalize(m.code) === safeCode);

  if (!item) {
    console.warn(`Unknown material code: ${safeCode}`);
    return "DEFAULT";
  }

  return normalize(item.grade || "DEFAULT");
}

// =====================================================
// PRICE LOOKUP
// =====================================================
function getFinalPrice(model, config, grade) {
  const safeModel = normalize(model);
  const safeConfig = normalize(config);
  const safeGrade = normalize(grade || "DEFAULT");

  const findRow = (cfg) => {
    const normalizedCfg = normalize(cfg);

    let row = price_sheet.find(p =>
      normalize(p.model) === safeModel &&
      normalize(p.config) === normalizedCfg &&
      normalize(p.grade || "DEFAULT") === safeGrade
    );
    if (row) return row;

    row = price_sheet.find(p =>
      normalize(p.model) === safeModel &&
      normalize(p.config) === normalizedCfg
    );
    if (row) return row;

    return null;
  };

  if (safeConfig.includes("+")) {
    return safeConfig.split("+").reduce((sum, part) => {
      const row = findRow(part);
      if (!row) {
        throw new Error(`Missing config part price: ${part}`);
      }
      return sum + Number(row.price);
    }, 0);
  }

  const item = findRow(safeConfig);

  if (!item) {
    throw new Error(`Price not found: ${safeModel} | ${safeConfig} | ${safeGrade}`);
  }

  return Number(item.price);
}

// =====================================================
// LINEAR SOLVER
// =====================================================
function solveLinearSystem(A, b) {
  const n = A.length;
  const M = A.map((row, i) => row.slice().concat([b[i]]));

  for (let col = 0; col < n; col++) {
    let pivot = col;

    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) {
        pivot = r;
      }
    }

    if (Math.abs(M[pivot][col]) < 1e-12) {
      throw new Error("Underdetermined system");
    }

    if (pivot !== col) {
      [M[pivot], M[col]] = [M[col], M[pivot]];
    }

    const div = M[col][col];
    for (let c = col; c <= n; c++) {
      M[col][c] /= div;
    }

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      if (!factor) continue;

      for (let c = col; c <= n; c++) {
        M[r][c] -= factor * M[col][c];
      }
    }
  }

  return M.map(row => row[n]);
}

function solveLeastSquares(X, y) {
  const m = X.length;
  const n = X[0].length;

  const XtX = Array.from({ length: n }, () => Array(n).fill(0));
  const Xty = Array(n).fill(0);

  for (let i = 0; i < m; i++) {
    for (let a = 0; a < n; a++) {
      const xa = X[i][a];
      Xty[a] += xa * y[i];

      for (let b = 0; b < n; b++) {
        XtX[a][b] += xa * X[i][b];
      }
    }
  }

  // tiny stabilizer
  for (let i = 0; i < n; i++) {
    XtX[i][i] += 1e-8;
  }

  return solveLinearSystem(XtX, Xty);
}

// =====================================================
// ODOO ATTRIBUTE ENGINE
// =====================================================
function generateUnifiedPlan(results, tolerance = 10) {
  if (!results?.length) return null;

  const model = results[0].model;

  const colourCounts = {};
  const configCounts = {};

  for (const r of results) {
    colourCounts[r.code] = (colourCounts[r.code] || 0) + 1;
    configCounts[r.config] = (configCounts[r.config] || 0) + 1;
  }

  const colours = [...new Set(results.map(r => r.code))].sort((a, b) => {
    const diff = (colourCounts[b] || 0) - (colourCounts[a] || 0);
    return diff !== 0 ? diff : a.localeCompare(b);
  });

  const configs = [...new Set(results.map(r => r.config))].sort((a, b) => {
    const diff = (configCounts[b] || 0) - (configCounts[a] || 0);
    return diff !== 0 ? diff : a.localeCompare(b);
  });

  const anchorColour = chooseMostCommon(colours);
  const anchorConfig = chooseMostCommon(configs);

  const colourVars = colours.filter(c => c !== anchorColour);
  const configVars = configs.filter(k => k !== anchorConfig);

  const colourIndex = new Map(colourVars.map((c, i) => [c, i]));
  const configIndex = new Map(configVars.map((k, i) => [k, i]));

  const X = [];
  const y = [];

  for (const r of results) {
    const row = new Array(1 + colourVars.length + configVars.length).fill(0);
    row[0] = 1;

    if (r.code !== anchorColour && colourIndex.has(r.code)) {
      row[1 + colourIndex.get(r.code)] = 1;
    }

    if (r.config !== anchorConfig && configIndex.has(r.config)) {
      row[1 + colourVars.length + configIndex.get(r.config)] = 1;
    }

    X.push(row);
    y.push(Number(r.price));
  }

  let beta;
  try {
    beta = solveLeastSquares(X, y);
  } catch (err) {
    // fallback to simple lowest-price anchor
    const base = results.reduce((a, b) =>
      Number(b.price) < Number(a.price) ? b : a
    );

    const basePrice = Number(base.price);

    const colourExtras = { [base.code]: 0 };
    const configExtras = { [base.config]: 0 };

    const validation = results.map(r => {
      const predicted = basePrice + (colourExtras[r.code] || 0) + (configExtras[r.config] || 0);
      const diff = predicted - Number(r.price);

      return {
        ...r,
        predicted,
        diff,
        fits: Math.abs(diff) <= tolerance,
        status: Math.abs(diff) <= tolerance ? "EXACT" : "MISMATCH"
      };
    });

    const mismatches = validation.filter(v => !v.fits);
    const maxDiff = mismatches.length ? Math.max(...mismatches.map(v => Math.abs(v.diff))) : 0;

    return {
      model,
      grade: results[0].grade,
      base,
      basePrice,
      anchorColour: base.code,
      anchorConfig: base.config,
      colourExtras,
      configExtras,
      validation,
      mismatchCount: mismatches.length,
      maxDiff,
      tolerance,
      forcedExact: maxDiff > tolerance,
      pricingMode: maxDiff > tolerance ? "FORCED EXACT" : "SHARED ADDITIVE",
      error: String(err)
    };
  }

  const basePrice = beta[0];

  const colourExtras = { [anchorColour]: 0 };
  colourVars.forEach((c, i) => {
    colourExtras[c] = beta[1 + i];
  });

  const configExtras = { [anchorConfig]: 0 };
  configVars.forEach((k, i) => {
    configExtras[k] = beta[1 + colourVars.length + i];
  });

  const validation = results.map(r => {
    const predicted =
      basePrice +
      (colourExtras[r.code] || 0) +
      (configExtras[r.config] || 0);

    const diff = predicted - Number(r.price);

    return {
      ...r,
      predicted,
      diff,
      fits: Math.abs(diff) <= tolerance,
      status: Math.abs(diff) <= tolerance ? "EXACT" : "MISMATCH"
    };
  });

  const mismatches = validation.filter(v => !v.fits);
  const maxDiff = mismatches.length
    ? Math.max(...mismatches.map(v => Math.abs(v.diff)))
    : 0;

  return {
    model,
    grade: results[0].grade,
    base: results.reduce((a, b) =>
      Number(b.price) < Number(a.price) ? b : a
    ),
    basePrice,
    anchorColour,
    anchorConfig,
    colourExtras,
    configExtras,
    validation,
    mismatchCount: mismatches.length,
    maxDiff,
    tolerance,
    forcedExact: maxDiff > tolerance,
    pricingMode: maxDiff > tolerance ? "FORCED EXACT" : "SHARED ADDITIVE"
  };
}

function generatePlans(results) {
  const grouped = {};

  for (const r of results) {
    const key = normalize(r.model);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }

  const plans = {};

  for (const [key, rows] of Object.entries(grouped)) {
    const plan = generateUnifiedPlan(rows);

    if (plan) {
      plan.model = key;
      plan.groupKey = key;
    }

    plans[key] = plan;
  }

  return plans;
}

// =====================================================
// UI HELPERS
// =====================================================
function renderRows(obj = {}) {
  const entries = Object.entries(obj);

  if (!entries.length) {
    return `<tr><td colspan="2">No data</td></tr>`;
  }

  return entries.map(([k, v]) => `
    <tr>
      <td>${escapeHtml(k)}</td>
      <td class="${
        Number(v) > 0 ? "positive" : Number(v) < 0 ? "negative" : ""
      }">₹ ${formatValue(v)}</td>
    </tr>
  `).join("");
}

function renderValidationRows(plan) {
  if (!plan || !plan.validation?.length) {
    return `<tr><td colspan="6">No validation data</td></tr>`;
  }

  return plan.validation.map(v => `
    <tr class="${v.fits ? "fit-row" : "mismatch-row"}">
      <td>${escapeHtml(v.model)}</td>
      <td>${escapeHtml(v.code)}</td>
      <td>${escapeHtml(v.config)}</td>
      <td>₹ ${formatPrecise(v.price)}</td>
      <td>₹ ${formatPrecise(v.predicted)}</td>
      <td class="${v.fits ? "success" : "negative"}">
        ${v.fits ? "EXACT" : formatPrecise(v.diff)}
      </td>
    </tr>
  `).join("");
}

// =====================================================
// RESULTS TABLE
// =====================================================
function displayResults(data, plans) {
  const tbody = document.querySelector("#output tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  data.forEach(d => {
    const tr = document.createElement("tr");

    if (d.error) {
      tr.className = "error-row";
      tr.innerHTML = `<td colspan="6">${escapeHtml(d.error)}</td>`;
      tbody.appendChild(tr);
      return;
    }

    const key = normalize(d.model);
    const plan = plans[key];
    const extra = Number(d.price) - Number(plan.basePrice);

    tr.innerHTML = `
      <td>${escapeHtml(d.model)}</td>
      <td>${escapeHtml(d.code)}</td>
      <td>${escapeHtml(d.grade)}</td>
      <td>${escapeHtml(d.config)}</td>
      <td>₹ ${formatValue(d.price)}</td>
      <td class="${
        extra > 0 ? "positive" : extra < 0 ? "negative" : ""
      }">₹ ${formatValue(extra)}</td>
    `;

    tbody.appendChild(tr);
  });
}

// =====================================================
// ODOO PANELS
// =====================================================
function displayOdoo(plans) {
  const keys = Object.keys(plans || {});
  if (!keys.length) return;

  const first = plans[keys[0]];

  const summary = pickEl("summary");
  const odooBase = pickEl("odooBase");
  const odooFit = pickEl("odooFit");
  const configBody = pickEl("configOutputBody");
  const colourBody = pickEl("colourOutputBody");
  const validationBody = pickEl("validationOutputBody");
  const host = pickEl("estifyPlans");

  window.estifyCurrentPlan = first;

  if (summary) summary.textContent = `${keys.length} pricing group(s) solved`;
  if (odooBase) {
    odooBase.textContent = `${first.anchorColour} | ${first.anchorConfig} | ₹ ${formatValue(first.basePrice)}`;
  }
  if (odooFit) {
    odooFit.textContent = first.forcedExact
      ? `System auto-corrected mismatches → BEST FIT / REVIEW NEEDED`
      : `All variants fit additive pricing`;
  }

  if (configBody) configBody.innerHTML = renderRows(first.configExtras);
  if (colourBody) colourBody.innerHTML = renderRows(first.colourExtras);
  if (validationBody) validationBody.innerHTML = renderValidationRows(first);

  if (host) {
    host.innerHTML = keys.map(k => renderPlanCard(k, plans[k])).join("");
  }
}

function renderPlanCard(modelKey, plan) {
  return `
    <section>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;">
        <div>
          <h3>${escapeHtml(modelKey)}</h3>
          <div style="margin-top:10px;color:#94a3b8;">
            ${plan.forcedExact ? "Best-Fit / Review Needed" : "Shared Attribute Pricing Engine"}
          </div>
        </div>

        <button onclick='copyOdooPlan(${JSON.stringify(modelKey)})'>Copy Odoo Plan</button>
      </div>

      <div class="highlight">
        Base Price: <strong>₹ ${formatValue(plan.basePrice)}</strong>
        &nbsp;&nbsp;|&nbsp;&nbsp;
        Anchor Colour: <strong>${escapeHtml(plan.anchorColour)}</strong>
        &nbsp;&nbsp;|&nbsp;&nbsp;
        Anchor Config: <strong>${escapeHtml(plan.anchorConfig)}</strong>
        &nbsp;&nbsp;|&nbsp;&nbsp;
        Mode: <strong>${plan.pricingMode}</strong>
      </div>

      <div class="grid">
        <div class="card">
          <h3>Colour Extras</h3>
          <table>
            <thead>
              <tr><th>Colour</th><th>Extra</th></tr>
            </thead>
            <tbody>
              ${renderRows(plan.colourExtras)}
            </tbody>
          </table>
        </div>

        <div class="card">
          <h3>Configuration Extras</h3>
          <table>
            <thead>
              <tr><th>Config</th><th>Extra</th></tr>
            </thead>
            <tbody>
              ${renderRows(plan.configExtras)}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card" style="margin-top:18px;">
        <h3>Validation Matrix</h3>
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>Code</th>
              <th>Config</th>
              <th>Actual</th>
              <th>Predicted</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${renderValidationRows(plan)}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

// =====================================================
// COPY PLAN
// =====================================================
function buildPlanText(plan) {
  const lines = [];

  lines.push(`MODEL: ${plan.model}`);
  lines.push(`GRADE: ${plan.grade}`);
  lines.push(`MODE: ${plan.pricingMode}`);
  lines.push("");

  lines.push(`BASE PRICE: ${formatValue(plan.basePrice)}`);
  lines.push(`ANCHOR COLOUR: ${plan.anchorColour}`);
  lines.push(`ANCHOR CONFIG: ${plan.anchorConfig}`);

  lines.push("");
  lines.push("COLOUR EXTRAS");
  Object.entries(plan.colourExtras).forEach(([k, v]) => {
    lines.push(`${k} = ${formatValue(v)}`);
  });

  lines.push("");
  lines.push("CONFIG EXTRAS");
  Object.entries(plan.configExtras).forEach(([k, v]) => {
    lines.push(`${k} = ${formatValue(v)}`);
  });

  lines.push("");
  lines.push("VALIDATION");
  plan.validation.forEach(v => {
    lines.push(
      `${v.code} | ${v.config} | actual=${formatValue(v.price)} | predicted=${formatValue(v.predicted)} | diff=${formatPrecise(v.diff)}`
    );
  });

  return lines.join("\n");
}

function copyOdooPlan(modelKey) {
  const plan = window.estifyPlans?.[modelKey];
  if (!plan) return;
  copyText(buildPlanText(plan));
}

// =====================================================
// MAIN
// =====================================================
async function runCalculator() {
  try {
    await loadData();

    const rawInput = document.getElementById("input")?.value || "";
    const lines = rawInput.split("\n").filter(v => v.trim());

    const results = [];

    for (const line of lines) {
      try {
        const parsed = parseVariant(line);
        const grade = getGrade(parsed.code);
        const price = getFinalPrice(parsed.model, parsed.config, grade);

        results.push({
          ...parsed,
          grade,
          price
        });
      } catch (err) {
        console.error(err);
        results.push({
          raw: line,
          error: err.message || String(err)
        });
      }
    }

    const validResults = results.filter(r => !r.error);
    const plans = generatePlans(validResults);

    window.estifyPlans = plans;

    displayResults(results, plans);
    displayOdoo(plans);

    showToast("Pricing analysis complete");
  } catch (err) {
    console.error(err);
    showToast(err.message || String(err));
  }
}

// =====================================================
// DOM EVENTS
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
  const runBtn = document.getElementById("runBtn");
  const analyzeBtn = document.getElementById("analyzeBtn");
  const clearBtn = document.getElementById("clearBtn");

  if (runBtn) runBtn.addEventListener("click", runCalculator);
  if (analyzeBtn) analyzeBtn.addEventListener("click", runCalculator);

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      const input = document.getElementById("input");
      if (input) input.value = "";
    });
  }
});

// =====================================================
// GLOBALS
// =====================================================
window.runCalculator = runCalculator;
window.copyOdooPlan = copyOdooPlan;
