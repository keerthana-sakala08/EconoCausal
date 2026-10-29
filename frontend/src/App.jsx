import { useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  FileSpreadsheet,
  FlaskConical,
  Info,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";

const API_BASE = "http://127.0.0.1:5000";

async function apiRequest(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, options);
  } catch {
    throw new Error(
      "Cannot connect to Flask. Start the backend at http://127.0.0.1:5000."
    );
  }

  const contentType = response.headers.get("content-type") || "";
  const result = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof result === "object"
        ? result.error || result.message || result.detail
        : result;

    throw new Error(message || `Request failed (${response.status}).`);
  }

  return result;
}

function Metric({ label, value, detail, icon: Icon }) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">
          <Icon size={19} />
        </span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-detail" title={detail}>
        {detail}
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, options, disabled }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={onChange} disabled={disabled}>
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function parseCSVLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"' && inQuotes && line[i + 1] === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

export default function App() {
  const [file, setFile] = useState(null);
  const [columns, setColumns] = useState([]);
  const [previewRows, setPreviewRows] = useState([]);
  const [rowCount, setRowCount] = useState(null);
  const [quality, setQuality] = useState(null);

  const [treatment, setTreatment] = useState("");
  const [outcome, setOutcome] = useState("");
  const [controls, setControls] = useState([]);

  const [dmlOpen, setDmlOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [health, setHealth] = useState("Unknown");

  const [analysis, setAnalysis] = useState(null);
  const [validation, setValidation] = useState(null);

  // Fixed: Analysis Status is managed explicitly.
  const [analysisStatus, setAnalysisStatus] = useState("Not run");

  const controlOptions = useMemo(
    () =>
      columns.filter(
        (column) => column !== treatment && column !== outcome
      ),
    [columns, treatment, outcome]
  );

  function resetResults() {
    setAnalysis(null);
    setValidation(null);
    setAnalysisStatus("Not run");
    setError("");
    setNotice("");
  }

  function handleTreatmentChange(event) {
    const value = event.target.value;
    setTreatment(value);

    setControls((previous) =>
      previous.filter(
        (column) => column !== value && column !== outcome
      )
    );

    resetResults();
  }

  function handleOutcomeChange(event) {
    const value = event.target.value;
    setOutcome(value);

    setControls((previous) =>
      previous.filter(
        (column) => column !== treatment && column !== value
      )
    );

    resetResults();
  }

  function handleControlsChange(event) {
    setControls(
      Array.from(
        event.target.selectedOptions,
        (option) => option.value
      )
    );

    resetResults();
  }

  async function checkBackend() {
    setChecking(true);
    setError("");
    setNotice("");

    try {
      await apiRequest("/api/health");
      setHealth("Connected");
      setNotice("Backend connection successful.");
    } catch (err) {
      setHealth("Unavailable");
      setError(err.message);
    } finally {
      setChecking(false);
    }
  }

  async function handleFileChange(event) {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    resetResults();

    if (!selectedFile.name.toLowerCase().endsWith(".csv")) {
      setError("Please upload a CSV file.");
      event.target.value = "";
      return;
    }

    setFile(null);
    setColumns([]);
    setPreviewRows([]);
    setRowCount(null);
    setTreatment("");
    setOutcome("");
    setControls([]);
    setError("");
    setNotice("Reading CSV file...");

    try {
      const text = await selectedFile.text();
      const lines = text
        .split(/\r?\n/)
        .filter((line) => line.trim() !== "");

      if (lines.length < 2) {
        throw new Error(
          "The CSV must contain a header and at least one data row."
        );
      }

      const headers = parseCSVLine(lines[0]).map((name) =>
        name.replace(/^\uFEFF/, "").trim()
      );

      if (headers.some((name) => !name)) {
        throw new Error("Your CSV contains an empty column name.");
      }

      if (new Set(headers).size !== headers.length) {
        throw new Error("Your CSV contains duplicate column names.");
      }

      const parsedRows = lines.slice(1, 6).map(parseCSVLine);
      
const allRows = lines.slice(1).map(parseCSVLine);

const missingValues = allRows.reduce(
  (total, row) =>
    total +
    headers.filter((_, index) => !(row[index] ?? "").trim()).length,
  0
);

const duplicateRows = allRows.length -
  new Set(allRows.map((row) => JSON.stringify(row))).size;

const columnStats = headers.map((name, index) => {
  const values = allRows
    .map((row) => (row[index] ?? "").trim())
    .filter(Boolean);

  const numeric = values.length > 0 &&
    values.every((value) => Number.isFinite(Number(value)));

  return {
    name,
    dataType: numeric ? "Numeric" : "Text",
    missing: allRows.length - values.length,
  };
});

const completeRows = allRows.filter((row) =>
  headers.every((_, index) => (row[index] ?? "").trim() !== "")
).length;

setQuality({
  rowCount: allRows.length,
  columnCount: headers.length,
  missingValues,
  duplicateRows,
  completeRows,
  missingPercentage: allRows.length * headers.length
    ? Number(
        ((missingValues / (allRows.length * headers.length)) * 100).toFixed(2)
      )
    : 0,
  columnStats,
});


      setFile(selectedFile);
      setColumns(headers);
      setPreviewRows(parsedRows);
      setRowCount(lines.length - 1);
      setNotice(
        `Loaded ${selectedFile.name}. Select your DML variables to continue.`
      );
    } catch (err) {
      setFile(null);
      setError(err.message || "Could not read this CSV file.");
      setNotice("");
    } finally {
      event.target.value = "";
    }
  }

  function validateSelection() {
    if (!file) {
      setError("Upload a CSV file first.");
      return false;
    }

    if (!treatment || !outcome) {
      setError("Select both treatment and outcome columns.");
      return false;
    }

    if (treatment === outcome) {
      setError("Treatment and outcome must be different columns.");
      return false;
    }

    if (controls.includes(treatment) || controls.includes(outcome)) {
      setError(
        "Treatment and outcome cannot also be control variables."
      );
      return false;
    }

    if (rowCount !== null && rowCount < 10) {
      setError(`Upload at least 10 rows. Found ${rowCount}.`);
      return false;
    }

    return true;
  }

  function createFormData() {
    const form = new FormData();
    form.append("file", file);
    form.append("treatment", treatment);
    form.append("outcome", outcome);
    form.append("controls", JSON.stringify(controls));
    return form;
  }

  async function runValidation() {
    if (loading || !validateSelection()) return;

    setLoading(true);
    setError("");
    setNotice("");
    setValidation(null);
    setAnalysisStatus("Validating");

    try {
      // Requires POST /api/validate in backend/app.py.
      const result = await apiRequest("/api/validate", {
        method: "POST",
        body: createFormData(),
      });

      setValidation(result);

      const valid =
        result.valid !== false && result.is_valid !== false;

      setAnalysisStatus(valid ? "Validated" : "Failed");
      setNotice(
        result.message || "Dataset validation request completed."
      );
    } catch (err) {
      setAnalysisStatus("Failed");
      setError(
        `${err.message} Confirm that your backend supports POST /api/validate.`
      );
    } finally {
      setLoading(false);
    }
  }

  async function runDML() {
    if (loading || !validateSelection()) return;

    setLoading(true);
    setError("");
    setNotice("");
    setAnalysis(null);
    setValidation(null);

    // Status changes immediately when the user starts the request.
    setAnalysisStatus("Running");

    try {
      // Requires POST /api/dml in backend/app.py.
      const result = await apiRequest("/api/dml", {
        method: "POST",
        body: createFormData(),
      });

      setAnalysis(result);
      setAnalysisStatus("Completed");
      setNotice("DML analysis completed successfully.");
    } catch (err) {
      setAnalysisStatus("Failed");
      setError(
        `${err.message} Confirm that your backend supports POST /api/dml and accepts these form fields.`
      );
    } finally {
      setLoading(false);
    }
  }

  function removeDataset() {
    setFile(null);
    setColumns([]);
    setPreviewRows([]);
    setRowCount(null);
    setTreatment("");
    setOutcome("");
    setControls([]);
    resetResults();
    setQuality(null);
  }

  const resultValue =
    analysis?.treatment_effect ??
    analysis?.effect ??
    analysis?.ate ??
    analysis?.estimated_effect ??
    analysis?.causal_effect;

  const statusDetail = {
    "Not run": "Ready when you are",
    Running: "DML analysis is in progress",
    Validating: "Checking selected dataset",
    Validated: "Dataset validation completed",
    Completed: "Analysis response received",
    Failed: "Check the error message",
  }[analysisStatus];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Activity size={23} />
          </div>
          <div>
            <div className="brand-name">EconoCausal</div>
            <div className="brand-caption">PRICING INTELLIGENCE</div>
          </div>
        </div>

        <div className="side-label">WORKSPACE</div>

        <div className="side-item active">
          <BarChart3 size={18} />
          Overview
        </div>

        <button
          className="side-item side-button"
          onClick={() => setDmlOpen((open) => !open)}
        >
          <FlaskConical size={18} />
          DML Analysis
          <span className="side-chevron">
            {dmlOpen ? (
              <ChevronUp size={16} />
            ) : (
              <ChevronDown size={16} />
            )}
          </span>
        </button>

        <button
          className="side-item side-button"
          onClick={checkBackend}
          disabled={checking}
        >
          <Database size={18} />
          Backend Status
        </button>

        <div className="sidebar-bottom">
          <div className="sidebar-status">
            <span
              className={`status-dot ${
                health === "Connected" ? "online" : ""
              }`}
            />
            <div>
              <div className="status-title">API Status</div>
              <div className="status-subtitle">{health}</div>
            </div>
          </div>
          <div className="sidebar-footer">
            EconoCausal · Internship Project
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <div className="breadcrumb">
              Workspace / <strong>Overview</strong>
            </div>
            <h1>Pricing Intelligence Dashboard</h1>
            <p className="page-subtitle">
              Analyze your data and estimate the impact of pricing decisions.
            </p>
          </div>

          <button
            className="outline-button"
            onClick={checkBackend}
            disabled={checking}
          >
            {checking ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <RefreshCw size={16} />
            )}
            Check connection
          </button>
        </header>

        {error && (
          <div className="alert alert-error" role="alert">
            <XCircle size={19} />
            <span>{error}</span>
            <button
              className="alert-close"
              onClick={() => setError("")}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        {notice && !error && (
          <div className="alert alert-success" role="status">
            <CheckCircle2 size={19} />
            <span>{notice}</span>
            <button
              className="alert-close"
              onClick={() => setNotice("")}
              aria-label="Dismiss notice"
            >
              ×
            </button>
          </div>
        )}

        <section className="welcome-banner">
          <div className="banner-icon">
            <Activity size={23} />
          </div>
          <div className="banner-copy">
            <div className="eyebrow">CAUSAL ANALYSIS WORKSPACE</div>
            <h2>Make every pricing decision data-driven.</h2>
            <p>
              Upload a sales dataset, configure your variables, and run
              Double Machine Learning when your backend is ready.
            </p>
          </div>
          <div className="banner-decoration">
            <BarChart3 size={76} />
          </div>
        </section>

{quality && (
  <section className="panel">
    <div className="panel-heading">
      <div>
        <h3>Dataset Quality Report</h3>
        <p>Check data completeness before running DML.</p>
      </div>
      <span className="step-badge">DATA QUALITY</span>
    </div>

    <div className="metrics-grid">
      <Metric label="Rows" value={quality.rowCount}
        detail="Total data rows" icon={Database} />
      <Metric label="Columns" value={quality.columnCount}
        detail="Detected columns" icon={BarChart3} />
      <Metric label="Missing values" value={quality.missingValues}
        detail={`${quality.missingPercentage}% of all cells`}
        icon={Info} />
      <Metric label="Duplicate rows" value={quality.duplicateRows}
        detail="Repeated complete rows" icon={ShieldCheck} />
    </div>

    <p>
      Complete rows: {quality.completeRows} / {quality.rowCount}
    </p>

    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Column</th>
            <th>Detected type</th>
            <th>Missing values</th>
          </tr>
        </thead>
        <tbody>
          {quality.columnStats.map((column) => (
            <tr key={column.name}>
              <td>{column.name}</td>
              <td>{column.dataType}</td>
              <td>{column.missing}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
)}

        <section className="metrics-grid">
          <Metric
            label="Dataset"
            value={file ? "Uploaded" : "No dataset"}
            detail={file ? file.name : "Upload a CSV to begin"}
            icon={FileSpreadsheet}
          />

          <Metric
            label="Total rows"
            value={
              rowCount === null ? "—" : rowCount.toLocaleString()
            }
            detail="Rows read from CSV"
            icon={Database}
          />

          <Metric
            label="Available columns"
            value={columns.length || "—"}
            detail="Detected from CSV header"
            icon={BarChart3}
          />

          <Metric
            label="Analysis status"
            value={analysisStatus}
            detail={statusDetail}
            icon={FlaskConical}
          />
        </section>

        <section className="content-grid">
          <div className="panel upload-panel">
            <div className="panel-heading">
              <div>
                <h3>Dataset</h3>
                <p>Import your sales data to get started.</p>
              </div>
              <span className="step-badge">STEP 01</span>
            </div>

            <label className="upload-zone">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
              />
              <div className="upload-icon">
                <Upload size={23} />
              </div>
              <strong>
                {file ? file.name : "Click to upload your CSV"}
              </strong>
              <span>
                {file
                  ? `${(file.size / 1024).toFixed(1)} KB · CSV file`
                  : "Choose a CSV file from your computer"}
              </span>
              <span className="upload-action">
                {file ? "Choose another file" : "Browse files"}
              </span>
            </label>

            {file && (
              <div className="file-info">
                <FileSpreadsheet size={19} />
                <div className="file-info-copy">
                  <strong>{file.name}</strong>
                  <span>
                    {columns.length} columns · {rowCount} data rows
                  </span>
                </div>
                <button
                  className="icon-button"
                  aria-label="Remove dataset"
                  onClick={removeDataset}
                >
                  <XCircle size={18} />
                </button>
              </div>
            )}

            <div className="info-note">
              <Info size={17} />
              <span>
                Use at least 10 rows and numeric analysis columns for DML
                validation.
              </span>
            </div>
          </div>

          <div className="panel config-panel">
            <div className="panel-heading">
              <div>
                <h3>Analysis configuration</h3>
                <p>Define the variables for your causal model.</p>
              </div>
              <span className="step-badge">STEP 02</span>
            </div>

            <div className="variable-fields">
              <SelectField
                label="Treatment"
                value={treatment}
                onChange={handleTreatmentChange}
                options={columns}
                disabled={!file}
              />

              <SelectField
                label="Outcome"
                value={outcome}
                onChange={handleOutcomeChange}
                options={columns}
                disabled={!file}
              />
            </div>

            <button
              className="dml-toggle-row"
              onClick={() => setDmlOpen((open) => !open)}
              aria-expanded={dmlOpen}
            >
              <span className="dml-toggle-icon">
                <FlaskConical size={18} />
              </span>
              <span className="dml-toggle-copy">
                <strong>DML Configuration</strong>
                <span>
                  Choose control variables and configure analysis.
                </span>
              </span>
              {dmlOpen ? (
                <ChevronUp size={19} />
              ) : (
                <ChevronDown size={19} />
              )}
            </button>

            {dmlOpen && (
              <div className="dml-panel">
                <label className="field">
                  <span>Control variables</span>
                  <select
                    multiple
                    value={controls}
                    onChange={handleControlsChange}
                    disabled={!file || controlOptions.length === 0}
                    size={Math.min(
                      Math.max(controlOptions.length, 2),
                      5
                    )}
                  >
                    {controlOptions.map((column) => (
                      <option key={column} value={column}>
                        {column}
                      </option>
                    ))}
                  </select>
                  <small>
                    Hold Ctrl on Windows to select multiple controls.
                  </small>
                </label>

                <div className="selection-summary">
                  <div>
                    <span>Treatment</span>
                    <strong>{treatment || "Not selected"}</strong>
                  </div>
                  <div>
                    <span>Outcome</span>
                    <strong>{outcome || "Not selected"}</strong>
                  </div>
                  <div>
                    <span>Controls selected</span>
                    <strong>{controls.length}</strong>
                  </div>
                </div>

                <div className="dml-actions">
                  <button
                    className="outline-button"
                    onClick={runValidation}
                    disabled={loading || !file}
                  >
                    {loading ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <ShieldCheck size={16} />
                    )}
                    Validate dataset
                  </button>

                  <button
                    className="primary-button"
                    onClick={runDML}
                    disabled={loading || !file}
                  >
                    {loading ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <FlaskConical size={16} />
                    )}
                    Run DML analysis
                  </button>
                </div>
              </div>
            )}

            {!dmlOpen && (
              <button
                className="primary-button full-button"
                onClick={() => setDmlOpen(true)}
              >
                Configure DML <ChevronDown size={17} />
              </button>
            )}
          </div>
        </section>

        {previewRows.length > 0 && (
          <section className="panel preview-panel">
            <div className="panel-heading">
              <div>
                <h3>Dataset preview</h3>
                <p>Showing up to the first five data rows.</p>
              </div>
              <span className="step-badge">CSV PREVIEW</span>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {columns.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, index) => (
                    <tr key={index}>
                      {columns.map((column, columnIndex) => (
                        <td key={column}>
                          {row[columnIndex] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {(validation || analysis) && (
          <section className="panel results-panel">
            <div className="panel-heading">
              <div>
                <h3>Analysis results</h3>
                <p>Response returned by your backend API.</p>
              </div>
              <span className="result-status">
                <CheckCircle2 size={15} /> Response received
              </span>
            </div>

            {validation && (
              <div className="validation-result">
                <ShieldCheck size={20} />
                <div>
                  <strong>
                    {validation.message ||
                      "Validation response received"}
                  </strong>
                  <p>
                    {validation.valid === false ||
                    validation.is_valid === false
                      ? "The dataset did not pass validation."
                      : "Review the validation response below."}
                  </p>
                </div>
              </div>
            )}

            {analysis && resultValue !== undefined && (
              <div className="effect-result">
                <span>Estimated treatment effect</span>
                <strong>{String(resultValue)}</strong>
                <p>
                  Interpret this estimate using the model details and
                  assumptions.
                </p>
              </div>
            )}

            <details className="raw-result">
              <summary>View complete API response</summary>
              <pre>
                {JSON.stringify(analysis || validation, null, 2)}
              </pre>
            </details>
          </section>
        )}

        <footer className="page-footer">
          <span>EconoCausal · Pricing Intelligence</span>
          <span>
            Data-driven decisions start with reliable data.
          </span>
        </footer>
      </main>
    </div>
  );
}
