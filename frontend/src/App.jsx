import { useEffect, useMemo, useState } from "react";
import {
  Activity, BarChart3, CheckCircle2, ChevronLeft, ChevronRight,
  Database, FileSpreadsheet, FlaskConical, FolderOpen, LayoutDashboard,
  RefreshCw, Settings, ShieldCheck, Upload, XCircle,
  ChartNoAxesCombined, FileText, Info, LoaderCircle, Trash2,
  Download, Table2, BrainCircuit, CircleDot, AlertTriangle,
  Lightbulb, Sparkles, Target, TrendingUp
} from "lucide-react";

import {
  ResponsiveContainer, CartesianGrid, Tooltip, Legend,
  XAxis, YAxis, LineChart, Line, BarChart, Bar,
  ScatterChart, Scatter, AreaChart, Area
} from "recharts";

const API_BASE = "https://econocausal-api-kidd.onrender.com";

const PAGES = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "explorer", label: "Data Explorer", icon: Database },
  { id: "management", label: "Data Management", icon: FolderOpen },
  { id: "validation", label: "Data Validation", icon: ShieldCheck },
  { id: "causal", label: "Causal Analysis", icon: FlaskConical },
  { id: "insights", label: "Statistical Insights", icon: ChartNoAxesCombined },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "intelligence", label: "AI Intelligence Center", icon: BrainCircuit },
  { id: "settings", label: "Settings", icon: Settings }
];

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
    const message = typeof result === "object"
      ? result.error || result.message || result.detail
      : result;

    throw new Error(message || `Request failed (${response.status}).`);
  }

  return result;
}

function parseCSVLine(line) {
  const values = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"' && quoted && line[i + 1] === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function Metric({ label, value, detail, icon: Icon }) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon"><Icon size={19} /></span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-detail" title={String(detail)}>{detail}</div>
    </div>
  );
}

function PageTitle({ description, action }) {
  return (
    <div className="page-header">
      <div><p className="page-subtitle">{description}</p></div>
      {action}
    </div>
  );
}

function EmptyState({ title = "No dataset uploaded", description }) {
  return (
    <div className="empty-state">
      <Database size={30} />
      <strong>{title}</strong>
      <p>{description || "Upload a CSV file in Data Explorer to see your dataset here."}</p>
    </div>
  );
}

function ChartCard({ title, description, children }) {
  return (
    <div className="visualization-card">
      <h3>{title}</h3>
      <p>{description}</p>
      <div className="chart-container">{children}</div>
    </div>
  );
}

function SelectField({ label, value, onChange, options, disabled }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={onChange} disabled={disabled}>
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
      </select>
    </label>
  );
}

function formatNumber(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "—";
  }

  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 3
  });
}

function getQuantile(sorted, q) {
  if (!sorted.length) return 0;

  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);

  if (lower === upper) return sorted[lower];

  return sorted[lower] +
    (sorted[upper] - sorted[lower]) * (position - lower);
}

function App() {
  const [page, setPage] = useState("overview");
  const [collapsed, setCollapsed] = useState(false);

  const [file, setFile] = useState(null);
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [previewRows, setPreviewRows] = useState([]);
  const [quality, setQuality] = useState(null);

  const [treatment, setTreatment] = useState("");
  const [outcome, setOutcome] = useState("");
  const [controls, setControls] = useState([]);

  const [health, setHealth] = useState("Unknown");
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statisticsLoading, setStatisticsLoading] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [analysisStatus, setAnalysisStatus] = useState("Not run");

  const [analysis, setAnalysis] = useState(null);
  const [validation, setValidation] = useState(null);
  const [statistics, setStatistics] = useState(null);

  const [xColumn, setXColumn] = useState("");
  const [yColumn, setYColumn] = useState("");
  const [distributionColumn, setDistributionColumn] = useState("");

  // Check the Flask API automatically when the dashboard first loads.
  useEffect(() => {
    let isMounted = true;

    async function verifyBackend() {
      setChecking(true);
      setHealth("Checking");

      try {
        await apiRequest("/api/health");

        if (isMounted) {
          setHealth("Connected");
        }
      } catch (err) {
        if (isMounted) {
          setHealth("Unavailable");
          setError(err.message || "Could not connect to the backend.");
        }
      } finally {
        if (isMounted) {
          setChecking(false);
        }
      }
    }

    verifyBackend();

    return () => {
      isMounted = false;
    };
  }, []);

  const numericColumns = useMemo(() => {
    return columns.filter((column) => {
      const values = rows
        .map((row) => row[column])
        .filter((value) => value !== "" && value !== null);

      return values.length > 0 &&
        values.every((value) => Number.isFinite(Number(value)));
    });
  }, [columns, rows]);

  const controlOptions = useMemo(
    () => columns.filter((column) =>
      column !== treatment && column !== outcome
    ),
    [columns, treatment, outcome]
  );

  const numericRows = useMemo(() => {
    return rows.map((row, index) => {
      const item = { index: index + 1 };

      numericColumns.forEach((column) => {
        const value = Number(row[column]);
        item[column] = Number.isFinite(value) ? value : null;
      });

      return item;
    });
  }, [rows, numericColumns]);

  const chartData = useMemo(() => numericRows.slice(0, 200), [numericRows]);

  const means = useMemo(() => {
    return numericColumns.map((column) => {
      const values = rows
        .map((row) => Number(row[column]))
        .filter(Number.isFinite);

      const mean = values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : 0;

      return { column, mean: Number(mean.toFixed(3)) };
    });
  }, [numericColumns, rows]);

  const histogramData = useMemo(() => {
    if (!distributionColumn) return [];

    const values = rows
      .map((row) => Number(row[distributionColumn]))
      .filter(Number.isFinite);

    if (!values.length) return [];

    const min = Math.min(...values);
    const max = Math.max(...values);
    const binCount = Math.min(10, Math.max(1, Math.ceil(Math.sqrt(values.length))));
    const width = max === min ? 1 : (max - min) / binCount;

    const bins = Array.from({ length: binCount }, (_, index) => ({
      range: `${(min + index * width).toFixed(1)}–${(min + (index + 1) * width).toFixed(1)}`,
      count: 0
    }));

    values.forEach((value) => {
      const index = max === min
        ? 0
        : Math.min(binCount - 1, Math.floor((value - min) / width));

      bins[index].count++;
    });

    return bins;
  }, [rows, distributionColumn]);

  const boxSummary = useMemo(() => {
    if (!distributionColumn) return null;

    const values = rows
      .map((row) => Number(row[distributionColumn]))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);

    if (!values.length) return null;

    return {
      min: values[0],
      q1: getQuantile(values, 0.25),
      median: getQuantile(values, 0.5),
      q3: getQuantile(values, 0.75),
      max: values[values.length - 1]
    };
  }, [rows, distributionColumn]);

  const correlationData = useMemo(() => {
    const selected = numericColumns.slice(0, 8);

    return selected.map((first) => ({
      name: first,
      values: selected.map((second) => {
        const pairs = rows
          .map((row) => [Number(row[first]), Number(row[second])])
          .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));

        if (pairs.length < 2) return 0;

        const meanA = pairs.reduce((s, p) => s + p[0], 0) / pairs.length;
        const meanB = pairs.reduce((s, p) => s + p[1], 0) / pairs.length;

        const numerator = pairs.reduce(
          (s, p) => s + (p[0] - meanA) * (p[1] - meanB), 0
        );

        const denominatorA = Math.sqrt(
          pairs.reduce((s, p) => s + (p[0] - meanA) ** 2, 0)
        );

        const denominatorB = Math.sqrt(
          pairs.reduce((s, p) => s + (p[1] - meanB) ** 2, 0)
        );

        return denominatorA && denominatorB
          ? Number((numerator / (denominatorA * denominatorB)).toFixed(2))
          : 0;
      })
    }));
  }, [numericColumns, rows]);

  const resultValue =
    analysis?.estimated_effect ??
    analysis?.treatment_effect ??
    analysis?.effect ??
    analysis?.ate ??
    analysis?.causal_effect;

  const currentPage = PAGES.find((item) => item.id === page) || PAGES[0];

  function clearMessages() {
    setError("");
    setNotice("");
  }

  function resetResults() {
    setAnalysis(null);
    setValidation(null);
    setStatistics(null);
    setAnalysisStatus("Not run");
    clearMessages();
  }

  function changeTreatment(event) {
    const value = event.target.value;
    setTreatment(value);
    setControls((previous) =>
      previous.filter((item) => item !== value && item !== outcome)
    );
    resetResults();
  }

  function changeOutcome(event) {
    const value = event.target.value;
    setOutcome(value);
    setControls((previous) =>
      previous.filter((item) => item !== value && item !== treatment)
    );
    resetResults();
  }

  async function checkBackend() {
    setChecking(true);
    clearMessages();

    try {
      await apiRequest("/api/health");
      setHealth("Connected");
      setNotice("Flask backend connection successful.");
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

    setNotice("Reading your CSV dataset...");

    try {
      const text = await selectedFile.text();
      const lines = text
        .split(/\r?\n/)
        .filter((line) => line.trim() !== "");

      if (lines.length < 2) {
        throw new Error("The CSV must contain a header and at least one data row.");
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

      const parsed = lines.slice(1).map(parseCSVLine);

      const objects = parsed.map((values) => {
        const item = {};

        headers.forEach((header, index) => {
          item[header] = (values[index] ?? "").trim();
        });

        return item;
      });

      const missingValues = objects.reduce(
        (total, row) => total +
          headers.filter((header) => row[header] === "").length,
        0
      );

      const duplicateRows = objects.length -
        new Set(objects.map((row) => JSON.stringify(row))).size;

      const columnStats = headers.map((name) => {
        const values = objects.map((row) => row[name]).filter(Boolean);

        const isNumeric = values.length > 0 &&
          values.every((value) => Number.isFinite(Number(value)));

        return {
          name,
          dataType: isNumeric ? "Numeric" : "Text",
          missing: objects.length - values.length
        };
      });

      const completeRows = objects.filter((row) =>
        headers.every((header) => row[header] !== "")
      ).length;

      const nextQuality = {
        rowCount: objects.length,
        columnCount: headers.length,
        missingValues,
        duplicateRows,
        completeRows,
        missingPercentage: Number(
          ((missingValues / (objects.length * headers.length)) * 100).toFixed(2)
        ),
        columnStats
      };

      setFile(selectedFile);
      setColumns(headers);
      setRows(objects);
      setPreviewRows(objects.slice(0, 10));
      setQuality(nextQuality);

      const firstNumeric = columnStats.find(
        (item) => item.dataType === "Numeric"
      );

      const secondNumeric = columnStats.find(
        (item) => item.dataType === "Numeric" &&
          item.name !== firstNumeric?.name
      );

      setXColumn(firstNumeric?.name || "");
      setYColumn(secondNumeric?.name || "");
      setDistributionColumn(firstNumeric?.name || "");
      setTreatment("");
      setOutcome("");
      setControls([]);
      setNotice(`Successfully loaded ${selectedFile.name}.`);
      setPage("overview");
    } catch (err) {
      setError(err.message || "Could not read the CSV file.");
      setNotice("");
    } finally {
      event.target.value = "";
    }
  }

  function removeDataset() {
    setFile(null);
    setColumns([]);
    setRows([]);
    setPreviewRows([]);
    setQuality(null);
    setTreatment("");
    setOutcome("");
    setControls([]);
    setXColumn("");
    setYColumn("");
    setDistributionColumn("");
    resetResults();
    setNotice("Dataset removed.");
  }

  function createFileFormData(includeVariables = false) {
    const form = new FormData();
    form.append("file", file);

    if (includeVariables) {
      form.append("treatment", treatment);
      form.append("outcome", outcome);
      form.append("controls", JSON.stringify(controls));
    }

    return form;
  }

  async function runValidation() {
    if (!file) {
      setError("Upload a CSV file first.");
      return;
    }

    setLoading(true);
    clearMessages();
    setValidation(null);
    setAnalysisStatus("Validating");

    try {
      const result = await apiRequest("/api/validate", {
        method: "POST",
        body: createFileFormData()
      });

      setValidation(result);
      setAnalysisStatus(result.is_valid === false ? "Failed" : "Validated");
      setNotice(result.message || "Dataset validation completed.");
    } catch (err) {
      setAnalysisStatus("Failed");
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function runDML() {
    if (!file) {
      setError("Upload a CSV file first.");
      return;
    }

    if (!treatment || !outcome) {
      setError("Select both treatment and outcome columns.");
      return;
    }

    if (treatment === outcome) {
      setError("Treatment and outcome must be different.");
      return;
    }

    if (!controls.length) {
      setError("Select at least one control variable.");
      return;
    }

    if (rows.length < 10) {
      setError(`Upload at least 10 rows. Found ${rows.length}.`);
      return;
    }

    setLoading(true);
    clearMessages();
    setAnalysis(null);
    setValidation(null);
    setAnalysisStatus("Running");

    try {
      const result = await apiRequest("/api/dml", {
        method: "POST",
        body: createFileFormData(true)
      });

      setAnalysis(result);
      setAnalysisStatus("Completed");
      setNotice("Double Machine Learning analysis completed.");
    } catch (err) {
      setAnalysisStatus("Failed");
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function runStatistics() {
    if (!file) {
      setError("Upload a CSV file first.");
      return;
    }

    setStatisticsLoading(true);
    clearMessages();
    setStatistics(null);

    try {
      const result = await apiRequest("/api/statistics", {
        method: "POST",
        body: createFileFormData()
      });

      setStatistics(result);
      setNotice(result.message || "Statistical insights calculated.");
    } catch (err) {
      setError(err.message);
    } finally {
      setStatisticsLoading(false);
    }
  }

  async function downloadValidationReport() {
    if (!file) {
      setError("Upload a CSV file first.");
      return;
    }

    clearMessages();

    try {
      const response = await fetch(`${API_BASE}/api/validation-report`, {
        method: "POST",
        body: createFileFormData()
      });

      if (!response.ok) {
        let message = "Could not download validation report.";

        try {
          const result = await response.json();
          message = result.error || message;
        } catch {
          // Keep default message.
        }

        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = "econocausal_validation_report.csv";

      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setNotice("Validation report downloaded.");
    } catch (err) {
      setError(err.message);
    }
  }

  function downloadOriginalCSV() {
    if (!file) return;

    const url = URL.createObjectURL(file);
    const link = document.createElement("a");

    link.href = url;
    link.download = file.name;

    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function renderOverview() {
    return (
      <div className="page-content">
        <section className="welcome-banner">
          <div className="banner-icon"><Activity size={24} /></div>
          <div className="banner-copy">
            <div className="eyebrow">CAUSAL ANALYSIS WORKSPACE</div>
            <h2>Make every pricing decision data-driven.</h2>
            <p>
              Explore your dataset, validate data quality, understand
              statistical patterns and estimate treatment effects.
            </p>
          </div>
          <div className="banner-decoration"><BarChart3 size={76} /></div>
        </section>

        <div className="metrics-grid">
          <Metric label="Dataset" value={file ? "Uploaded" : "No dataset"}
            detail={file?.name || "Upload a CSV to begin"} icon={FileSpreadsheet} />
          <Metric label="Total rows" value={rows.length || "—"}
            detail="Rows loaded from CSV" icon={Database} />
          <Metric label="Columns" value={columns.length || "—"}
            detail={`${numericColumns.length} numeric columns`} icon={Table2} />
          <Metric label="Analysis status" value={analysisStatus}
            detail="Latest analysis status" icon={FlaskConical} />
        </div>

        {!file ? (
          <div className="panel">
            <div className="panel-heading">
              <div>
                <h3>Start your analysis</h3>
                <p>Upload a CSV dataset to activate your workspace.</p>
              </div>
              <span className="step-badge">GET STARTED</span>
            </div>

            <label className="upload-zone">
              <input type="file" accept=".csv,text/csv" onChange={handleFileChange} />
              <div className="upload-icon"><Upload size={24} /></div>
              <strong>Upload your CSV dataset</strong>
              <span>Choose a CSV file from your computer</span>
              <span className="upload-action">Browse files</span>
            </label>
          </div>
        ) : (
          <>
            <div className="page-grid">
              <ChartCard title="Numeric column averages"
                description="Mean values calculated from the uploaded dataset.">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={means}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#293951" />
                    <XAxis dataKey="column" stroke="#8798b2" />
                    <YAxis stroke="#8798b2" />
                    <Tooltip />
                    <Bar dataKey="mean" fill="#638cff" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Dataset trend"
                description="Values across the first 200 records.">
                {numericColumns.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#293951" />
                      <XAxis dataKey="index" stroke="#8798b2" />
                      <YAxis stroke="#8798b2" />
                      <Tooltip />
                      <Legend />
                      {numericColumns.slice(0, 3).map((column, index) => (
                        <Line key={column} type="monotone" dataKey={column}
                          stroke={["#638cff", "#a17aff", "#37c5d9"][index]}
                          dot={false} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                ) : <EmptyState />}
              </ChartCard>
            </div>

            {quality && (
              <div className="metrics-grid">
                <Metric label="Missing values" value={quality.missingValues}
                  detail={`${quality.missingPercentage}% of all cells`} icon={Info} />
                <Metric label="Duplicate rows" value={quality.duplicateRows}
                  detail="Repeated records" icon={ShieldCheck} />
                <Metric label="Complete rows" value={quality.completeRows}
                  detail="Rows without blank cells" icon={CheckCircle2} />
                <Metric label="Numeric columns" value={numericColumns.length}
                  detail="Suitable for numeric charts" icon={ChartNoAxesCombined} />
              </div>
            )}
          </>
        )}

        <div className="panel">
          <div className="panel-heading">
            <div><h3>Quick navigation</h3><p>Open a workspace page to continue.</p></div>
          </div>

          <div className="page-grid three-columns">
            {PAGES.slice(1).map((item) => {
              const Icon = item.icon;

              return (
                <button key={item.id} className="outline-button"
                  onClick={() => setPage(item.id)}>
                  <Icon size={17} /> {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function renderExplorer() {
    return (
      <div className="page-content">
        <PageTitle description="Upload, inspect and visualize your CSV dataset." />

        <div className="panel">
          <div className="panel-heading">
            <div><h3>Upload dataset</h3><p>CSV files up to 16 MB are supported by the backend.</p></div>
            <span className="step-badge">CSV UPLOAD</span>
          </div>

          <label className="upload-zone">
            <input type="file" accept=".csv,text/csv" onChange={handleFileChange} />
            <div className="upload-icon"><Upload size={24} /></div>
            <strong>{file ? file.name : "Click to upload your CSV"}</strong>
            <span>{file ? `${(file.size / 1024).toFixed(1)} KB` : "Choose a CSV file from your computer"}</span>
            <span className="upload-action">{file ? "Choose another file" : "Browse files"}</span>
          </label>
        </div>

        {!file ? <EmptyState /> : (
          <>
            <div className="metrics-grid">
              <Metric label="Rows" value={rows.length} detail="Dataset records" icon={Database} />
              <Metric label="Columns" value={columns.length} detail="Dataset fields" icon={Table2} />
              <Metric label="Numeric fields" value={numericColumns.length} detail="Detected numeric columns" icon={BarChart3} />
              <Metric label="File size" value={`${(file.size / 1024).toFixed(1)} KB`} detail={file.name} icon={FileSpreadsheet} />
            </div>

            <div className="panel">
              <div className="panel-heading">
                <div><h3>Scatter plot</h3><p>Compare two numeric columns using your CSV records.</p></div>
              </div>

              <div className="chart-selectors">
                <SelectField label="X axis" value={xColumn}
                  onChange={(event) => setXColumn(event.target.value)}
                  options={numericColumns} />
                <SelectField label="Y axis" value={yColumn}
                  onChange={(event) => setYColumn(event.target.value)}
                  options={numericColumns} />
              </div>

              {xColumn && yColumn ? (
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height={320}>
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" stroke="#293951" />
                      <XAxis type="number" dataKey={xColumn} name={xColumn} stroke="#8798b2" />
                      <YAxis type="number" dataKey={yColumn} name={yColumn} stroke="#8798b2" />
                      <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                      <Scatter data={chartData} fill="#8e7aff" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              ) : <EmptyState title="Select two numeric columns" />}
            </div>

            <div className="panel">
              <div className="panel-heading">
                <div><h3>Dataset preview</h3><p>First 10 rows of your uploaded CSV.</p></div>
                <span className="step-badge">PREVIEW</span>
              </div>

              <div className="table-scroll">
                <table>
                  <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
                  <tbody>
                    {previewRows.map((row, index) => (
                      <tr key={index}>
                        {columns.map((column) => <td key={column}>{row[column] || "—"}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  function renderManagement() {
    return (
      <div className="page-content">
        <PageTitle description="Manage the active dataset and inspect its structure." />

        {!file ? <EmptyState /> : (
          <>
            <div className="panel">
              <div className="panel-heading">
                <div><h3>Active dataset</h3><p>Current file loaded into EconoCausal.</p></div>
                <span className="status-pill"><CheckCircle2 size={13} /> Loaded</span>
              </div>

              <div className="settings-row">
                <div><strong>File name</strong><p>{file.name}</p></div><FileSpreadsheet />
              </div>
              <div className="settings-row">
                <div><strong>File size</strong><p>{(file.size / 1024).toFixed(2)} KB</p></div><Database />
              </div>
              <div className="settings-row">
                <div><strong>Rows and columns</strong><p>{rows.length} rows · {columns.length} columns</p></div><Table2 />
              </div>
              <div className="settings-row">
                <div><strong>Numeric columns</strong><p>{numericColumns.join(", ") || "None detected"}</p></div><BarChart3 />
              </div>

              <div className="dml-actions">
                <button className="outline-button" onClick={downloadOriginalCSV}>
                  <Download size={16} /> Download original CSV
                </button>
                <button className="outline-button" onClick={() => setPage("explorer")}>
                  <Table2 size={16} /> View dataset
                </button>
                <button className="outline-button" onClick={removeDataset}>
                  <Trash2 size={16} /> Remove dataset
                </button>
              </div>
            </div>

            <div className="panel">
              <div className="panel-heading">
                <div><h3>Column information</h3><p>Detected column types and missing values.</p></div>
              </div>

              <div className="table-scroll">
                <table>
                  <thead><tr><th>Column</th><th>Type</th><th>Missing</th></tr></thead>
                  <tbody>
                    {quality?.columnStats.map((column) => (
                      <tr key={column.name}>
                        <td>{column.name}</td><td>{column.dataType}</td><td>{column.missing}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  function renderValidation() {
    return (
      <div className="page-content">
        <PageTitle
          description="Check completeness, missing values and duplicate records."
          action={
            <button className="primary-button" onClick={runValidation}
              disabled={!file || loading}>
              {loading ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}
              Run backend validation
            </button>
          }
        />

        {!file ? <EmptyState /> : (
          <>
            <div className="metrics-grid">
              <Metric label="Total rows" value={quality?.rowCount} detail="Dataset rows" icon={Database} />
              <Metric label="Missing values" value={quality?.missingValues} detail={`${quality?.missingPercentage}% of all cells`} icon={AlertTriangle} />
              <Metric label="Duplicate rows" value={quality?.duplicateRows} detail="Repeated records" icon={RefreshCw} />
              <Metric label="Complete rows" value={quality?.completeRows} detail="Rows with no blank cells" icon={CheckCircle2} />
            </div>

            <div className="panel">
              <div className="panel-heading">
                <div><h3>Column validation</h3><p>Local checks based on the uploaded CSV.</p></div>
                <span className="step-badge">DATA QUALITY</span>
              </div>

              <div className="table-scroll">
                <table>
                  <thead><tr><th>Column</th><th>Detected type</th><th>Missing values</th><th>Result</th></tr></thead>
                  <tbody>
                    {quality?.columnStats.map((column) => (
                      <tr key={column.name}>
                        <td>{column.name}</td>
                        <td>{column.dataType}</td>
                        <td>{column.missing}</td>
                        <td>{column.missing === 0 ? "Complete" : "Review"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {validation && (
              <div className="panel">
                <div className="panel-heading">
                  <div><h3>Flask validation response</h3><p>Results returned by POST /api/validate.</p></div>
                  <span className="status-pill">{validation.status || (validation.is_valid ? "Passed" : "Review")}</span>
                </div>

                {(validation.errors || []).map((item, index) => (
                  <div className="alert alert-error" key={`e-${index}`}>
                    <XCircle size={17} /><span>{item}</span>
                  </div>
                ))}

                {(validation.warnings || []).map((item, index) => (
                  <div className="alert" key={`w-${index}`}>
                    <AlertTriangle size={17} /><span>{item}</span>
                  </div>
                ))}

                {!(validation.errors?.length) && !(validation.warnings?.length) && (
                  <div className="validation-result">
                    <CheckCircle2 /><strong>Validation checks passed.</strong>
                  </div>
                )}

                <details className="raw-result">
                  <summary>View complete validation response</summary>
                  <pre>{JSON.stringify(validation, null, 2)}</pre>
                </details>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  function renderCausal() {
    return (
      <div className="page-content">
        <PageTitle description="Configure treatment, outcome and control variables for Double Machine Learning." />

        {!file ? <EmptyState /> : (
          <>
            <div className="panel">
              <div className="panel-heading">
                <div><h3>DML configuration</h3><p>Choose the variables for your causal model.</p></div>
                <span className="step-badge">MODEL SETUP</span>
              </div>

              <div className="variable-fields">
                <SelectField label="Treatment" value={treatment}
                  onChange={changeTreatment} options={numericColumns} />
                <SelectField label="Outcome" value={outcome}
                  onChange={changeOutcome} options={numericColumns} />
              </div>

              <label className="field">
                <span>Control variables</span>
                <select multiple size={Math.min(Math.max(controlOptions.length, 2), 6)}
                  value={controls}
                  onChange={(event) => {
                    setControls(Array.from(event.target.selectedOptions, (option) => option.value));
                    resetResults();
                  }}>
                  {controlOptions.map((column) => (
                    <option key={column} value={column}>{column}</option>
                  ))}
                </select>
                <small>Hold Ctrl on Windows to select multiple control variables. At least one control is required.</small>
              </label>

              <div className="selection-summary">
                <div><span>Treatment</span><strong>{treatment || "Not selected"}</strong></div>
                <div><span>Outcome</span><strong>{outcome || "Not selected"}</strong></div>
                <div><span>Controls selected</span><strong>{controls.length}</strong></div>
              </div>

              <div className="dml-actions">
                <button className="outline-button" onClick={runValidation} disabled={loading}>
                  <ShieldCheck size={16} /> Validate dataset
                </button>
                <button className="primary-button" onClick={runDML} disabled={loading}>
                  {loading ? <LoaderCircle className="spin" size={16} /> : <FlaskConical size={16} />}
                  Run DML analysis
                </button>
              </div>
            </div>

            {analysis && (
              <div className="panel">
                <div className="panel-heading">
                  <div><h3>DML result</h3><p>{analysis.method || "Double Machine Learning"}</p></div>
                  <span className="status-pill"><CheckCircle2 size={13} /> Completed</span>
                </div>

                <div className="effect-result">
                  <span>Estimated treatment effect</span>
                  <strong>{formatNumber(resultValue)}</strong>
                  <p>{analysis.treatment} → {analysis.outcome}</p>
                </div>

                <div className="data-stat-grid">
                  <div className="data-stat"><span>Rows used</span><strong>{analysis.rows_used ?? "—"}</strong></div>
                  <div className="data-stat"><span>Treatment</span><strong>{analysis.treatment || "—"}</strong></div>
                  <div className="data-stat"><span>Outcome</span><strong>{analysis.outcome || "—"}</strong></div>
                </div>

                <p className="section-description" style={{ marginTop: 15 }}>
                  Controls: {(analysis.controls || []).join(", ") || "—"}
                </p>
                <p className="section-description">{analysis.note}</p>

                <details className="raw-result">
                  <summary>View complete DML response</summary>
                  <pre>{JSON.stringify(analysis, null, 2)}</pre>
                </details>
              </div>
            )}

            {validation && (
              <div className="panel">
                <h3 className="section-title">Latest validation response</h3>
                <pre>{JSON.stringify(validation, null, 2)}</pre>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  function renderInsights() {
    return (
      <div className="page-content">
        <PageTitle
          description="Explore distributions, trends, relationships and descriptive statistics."
          action={
            <button className="primary-button" onClick={runStatistics}
              disabled={!file || statisticsLoading}>
              {statisticsLoading ? <LoaderCircle className="spin" size={16} /> : <BarChart3 size={16} />}
              Calculate backend statistics
            </button>
          }
        />

        {!file ? <EmptyState /> : (
          <>
            <div className="metrics-grid">
              <Metric label="Numeric columns" value={numericColumns.length} detail="Detected numeric fields" icon={BarChart3} />
              <Metric label="Rows analysed" value={rows.length} detail="Uploaded records" icon={Database} />
              <Metric label="Chart records" value={chartData.length} detail="First 200 records shown in charts" icon={ChartNoAxesCombined} />
              <Metric label="Statistics" value={statistics ? "Calculated" : "Not calculated"} detail="Backend descriptive statistics" icon={Activity} />
            </div>

            <div className="panel">
              <div className="panel-heading">
                <div><h3>Distribution settings</h3><p>Select the numeric column used by the histogram and box summary.</p></div>
              </div>

              <div className="chart-selectors">
                <SelectField label="Distribution column" value={distributionColumn}
                  onChange={(event) => setDistributionColumn(event.target.value)}
                  options={numericColumns} />
              </div>
            </div>

            <div className="visualization-grid">
              <ChartCard title="Histogram" description="Frequency distribution of the selected numeric column.">
                {histogramData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={histogramData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#293951" />
                      <XAxis dataKey="range" stroke="#8798b2" />
                      <YAxis stroke="#8798b2" />
                      <Tooltip />
                      <Bar dataKey="count" fill="#9878ff" radius={[5, 5, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState title="Choose a numeric column" />}
              </ChartCard>

              <ChartCard title="Line chart" description="Numeric values by row position.">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#293951" />
                    <XAxis dataKey="index" stroke="#8798b2" />
                    <YAxis stroke="#8798b2" />
                    <Tooltip />
                    {numericColumns.slice(0, 3).map((column, index) => (
                      <Line key={column} dataKey={column} type="monotone"
                        stroke={["#638cff", "#a17aff", "#37c5d9"][index]} dot={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Dot plot" description="Individual observations for the selected X and Y variables.">
                {xColumn && yColumn ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" stroke="#293951" />
                      <XAxis dataKey={xColumn} type="number" name={xColumn} stroke="#8798b2" />
                      <YAxis dataKey={yColumn} type="number" name={yColumn} stroke="#8798b2" />
                      <Tooltip />
                      <Scatter data={chartData} fill="#43c9e8" />
                    </ScatterChart>
                  </ResponsiveContainer>
                ) : <EmptyState title="Select numeric columns in Data Explorer" />}
              </ChartCard>

              <ChartCard title="Area chart" description="Trend area for the first numeric field.">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#293951" />
                    <XAxis dataKey="index" stroke="#8798b2" />
                    <YAxis stroke="#8798b2" />
                    <Tooltip />
                    {numericColumns[0] && (
                      <Area type="monotone" dataKey={numericColumns[0]}
                        stroke="#43c9e8" fill="#43c9e8" fillOpacity={0.2} />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {boxSummary && (
              <div className="panel">
                <div className="panel-heading">
                  <div><h3>Box plot summary</h3><p>Five-number summary for {distributionColumn}.</p></div>
                  <span className="step-badge">DISTRIBUTION</span>
                </div>

                <div className="box-summary">
                  {[
                    ["Minimum", boxSummary.min],
                    ["Q1", boxSummary.q1],
                    ["Median", boxSummary.median],
                    ["Q3", boxSummary.q3],
                    ["Maximum", boxSummary.max]
                  ].map(([label, value]) => (
                    <div className="box-summary-item" key={label}>
                      <span>{label}</span><strong>{formatNumber(value)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {correlationData.length > 0 && (
              <div className="panel">
                <div className="panel-heading">
                  <div><h3>Correlation heatmap</h3><p>Pearson correlations between up to eight numeric columns.</p></div>
                  <span className="step-badge">CORRELATION</span>
                </div>

                <div className="heatmap-grid"
                  style={{ gridTemplateColumns: `130px repeat(${correlationData.length}, minmax(48px, 1fr))` }}>
                  <div />
                  {correlationData.map((item) => (
                    <strong key={item.name} className="heatmap-cell">{item.name}</strong>
                  ))}

                  {correlationData.map((row) => (
                    <>
                      <strong key={`${row.name}-label`} className="heatmap-cell">{row.name}</strong>
                      {row.values.map((value, index) => {
                        const intensity = Math.round(Math.abs(value) * 75);
                        const background = value >= 0
                          ? `rgba(65, 130, 255, ${0.15 + intensity / 100})`
                          : `rgba(166, 105, 255, ${0.15 + intensity / 100})`;

                        return (
                          <div key={`${row.name}-${index}`} className="heatmap-cell"
                            style={{ background, border: "1px solid #344663" }}
                            title={`${row.name} / ${correlationData[index].name}: ${value}`}>
                            {value.toFixed(2)}
                          </div>
                        );
                      })}
                    </>
                  ))}
                </div>
              </div>
            )}

            {statistics && (
              <div className="panel">
                <div className="panel-heading">
                  <div><h3>Backend descriptive statistics</h3><p>Results from POST /api/statistics.</p></div>
                  <span className="step-badge">FLASK RESULTS</span>
                </div>

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Column</th><th>Count</th><th>Mean</th><th>Median</th>
                        <th>Std. Dev.</th><th>Min</th><th>Q1</th><th>Q3</th><th>Max</th><th>Missing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(statistics.statistics || {}).map(([name, value]) => (
                        <tr key={name}>
                          <td>{name}</td><td>{value.count}</td><td>{formatNumber(value.mean)}</td>
                          <td>{formatNumber(value.median)}</td><td>{formatNumber(value.std)}</td>
                          <td>{formatNumber(value.min)}</td><td>{formatNumber(value.q1)}</td>
                          <td>{formatNumber(value.q3)}</td><td>{formatNumber(value.max)}</td>
                          <td>{value.missing}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  function renderReports() {
    return (
      <div className="page-content">
        <PageTitle description="Review analysis outputs and download available reports." />

        {!file ? <EmptyState /> : (
          <>
            <div className="panel">
              <div className="panel-heading">
                <div><h3>Available reports</h3><p>Download reports generated from your active dataset.</p></div>
              </div>

              <div className="settings-row">
                <div><strong>Dataset validation report</strong><p>CSV file containing validation errors and warnings.</p></div>
                <button className="outline-button" onClick={downloadValidationReport}>
                  <Download size={15} /> Download
                </button>
              </div>

              <div className="settings-row">
                <div><strong>Original dataset</strong><p>Download the CSV file you uploaded.</p></div>
                <button className="outline-button" onClick={downloadOriginalCSV}>
                  <Download size={15} /> Download
                </button>
              </div>
            </div>

            <div className="panel">
              <div className="panel-heading">
                <div><h3>Analysis summary</h3><p>Current results available in this session.</p></div>
              </div>

              <div className="data-stat-grid">
                <div className="data-stat"><span>Dataset rows</span><strong>{rows.length}</strong></div>
                <div className="data-stat"><span>Columns</span><strong>{columns.length}</strong></div>
                <div className="data-stat"><span>Analysis status</span><strong>{analysisStatus}</strong></div>
                <div className="data-stat"><span>Missing values</span><strong>{quality?.missingValues ?? "—"}</strong></div>
                <div className="data-stat"><span>DML estimate</span><strong>{resultValue === undefined ? "—" : formatNumber(resultValue)}</strong></div>
                <div className="data-stat"><span>Backend statistics</span><strong>{statistics ? "Ready" : "Not run"}</strong></div>
              </div>

              {analysis && (
                <details className="raw-result">
                  <summary>View DML report data</summary>
                  <pre>{JSON.stringify(analysis, null, 2)}</pre>
                </details>
              )}

              {statistics && (
                <details className="raw-result">
                  <summary>View statistics report data</summary>
                  <pre>{JSON.stringify(statistics, null, 2)}</pre>
                </details>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // NEW PAGE: AI Intelligence Center
  function renderIntelligence() {
    const missing = quality?.missingValues ?? 0;
    const duplicates = quality?.duplicateRows ?? 0;
    const missingPercent = quality?.missingPercentage ?? 0;

    const recommendations = [];

    if (!file) {
      recommendations.push({
        title: "Upload a dataset",
        detail: "Upload a CSV file to begin generating dataset insights.",
        action: "Open Data Explorer",
        page: "explorer",
        icon: Upload
      });
    } else {
      if (missing > 0) {
        recommendations.push({
          title: "Review missing values",
          detail: `${missing} missing cells (${missingPercent}%). Check data completeness before analysis.`,
          action: "Open Data Validation",
          page: "validation",
          icon: AlertTriangle
        });
      }

      if (duplicates > 0) {
        recommendations.push({
          title: "Inspect duplicate records",
          detail: `${duplicates} duplicate rows detected in the uploaded dataset.`,
          action: "Open Data Validation",
          page: "validation",
          icon: RefreshCw
        });
      }

      if (numericColumns.length < 3) {
        recommendations.push({
          title: "Review available variables",
          detail: "At least three numeric variables are useful for configuring treatment, outcome and controls.",
          action: "Open Data Explorer",
          page: "explorer",
          icon: Database
        });
      }

      if (!statistics) {
        recommendations.push({
          title: "Calculate statistical insights",
          detail: "Run descriptive statistics to understand your numeric columns.",
          action: "Open Statistical Insights",
          page: "insights",
          icon: BarChart3
        });
      }

      if (!analysis) {
        recommendations.push({
          title: "Configure causal analysis",
          detail: "Choose treatment, outcome and control variables to run Double Machine Learning.",
          action: "Open Causal Analysis",
          page: "causal",
          icon: FlaskConical
        });
      }

      if (recommendations.length === 0) {
        recommendations.push({
          title: "Dataset review looks good",
          detail: "No missing values or duplicate rows were detected by the local checks.",
          action: "View Reports",
          page: "reports",
          icon: CheckCircle2
        });
      }
    }

    return (
      <div className="page-content">
        <PageTitle
          description="AI-assisted overview of your dataset, data quality and analysis progress."
        />

        <section className="welcome-banner">
          <div className="banner-icon"><BrainCircuit size={25} /></div>
          <div className="banner-copy">
            <div className="eyebrow">ECONOCAUSAL INTELLIGENCE</div>
            <h2>Turn your data into actionable insights.</h2>
            <p>
              Review dataset quality, discover analysis opportunities and
              follow recommended next steps.
            </p>
          </div>
          <div className="banner-decoration"><Sparkles size={76} /></div>
        </section>

        <div className="metrics-grid">
          <Metric
            label="Dataset status"
            value={file ? "Available" : "Not uploaded"}
            detail={file ? file.name : "Upload a CSV dataset"}
            icon={Database}
          />
          <Metric
            label="Data quality"
            value={file ? `${Math.max(0, 100 - missingPercent).toFixed(1)}%` : "—"}
            detail="Completeness based on missing cells"
            icon={ShieldCheck}
          />
          <Metric
            label="Numeric variables"
            value={numericColumns.length}
            detail="Detected numeric columns"
            icon={BarChart3}
          />
          <Metric
            label="Causal analysis"
            value={analysis ? "Completed" : "Pending"}
            detail="Double Machine Learning status"
            icon={Target}
          />
        </div>

        <div className="page-grid">
          <div className="panel">
            <div className="panel-heading">
              <div>
                <h3><Sparkles size={18} /> Dataset intelligence</h3>
                <p>Automatically generated observations from the uploaded CSV.</p>
              </div>
              <span className="step-badge">DATA OVERVIEW</span>
            </div>

            {!file ? (
              <EmptyState
                title="Dataset required"
                description="Upload a CSV dataset to generate intelligence insights."
              />
            ) : (
              <div className="intelligence-list">
                <div className="intelligence-card">
                  <span className="intelligence-icon"><Database size={19} /></span>
                  <div>
                    <strong>Dataset structure</strong>
                    <p>{rows.length} rows and {columns.length} columns are loaded.</p>
                  </div>
                </div>

                <div className="intelligence-card">
                  <span className="intelligence-icon"><BarChart3 size={19} /></span>
                  <div>
                    <strong>Numeric variables</strong>
                    <p>
                      {numericColumns.length
                        ? numericColumns.join(", ")
                        : "No numeric columns detected."}
                    </p>
                  </div>
                </div>

                <div className="intelligence-card">
                  <span className="intelligence-icon"><AlertTriangle size={19} /></span>
                  <div>
                    <strong>Missing values</strong>
                    <p>
                      {missing === 0
                        ? "No missing values detected in the uploaded dataset."
                        : `${missing} missing values detected. Review these before analysis.`}
                    </p>
                  </div>
                </div>

                <div className="intelligence-card">
                  <span className="intelligence-icon"><RefreshCw size={19} /></span>
                  <div>
                    <strong>Duplicate records</strong>
                    <p>
                      {duplicates === 0
                        ? "No duplicate rows detected."
                        : `${duplicates} duplicate rows detected.`}
                    </p>
                  </div>
                </div>

                <div className="intelligence-card">
                  <span className="intelligence-icon"><FlaskConical size={19} /></span>
                  <div>
                    <strong>Causal analysis progress</strong>
                    <p>
                      {analysis
                        ? `Analysis completed. Estimated effect: ${formatNumber(resultValue)}`
                        : "DML analysis has not been run for this dataset."}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-heading">
              <div>
                <h3><Lightbulb size={18} /> Recommended next steps</h3>
                <p>Suggestions based on the current project status.</p>
              </div>
            </div>

            <div className="intelligence-list">
              {recommendations.map((item, index) => {
                const Icon = item.icon;

                return (
                  <div className="intelligence-card" key={`${item.title}-${index}`}>
                    <span className="intelligence-icon"><Icon size={19} /></span>
                    <div className="intelligence-card-content">
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                      <button
                        className="outline-button intelligence-action"
                        onClick={() => setPage(item.page)}
                      >
                        {item.action} <ChevronRight size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <h3><TrendingUp size={18} /> Analysis readiness</h3>
              <p>Current progress of the main EconoCausal workflow.</p>
            </div>
          </div>

          <div className="data-stat-grid">
            <div className="data-stat">
              <span>Dataset uploaded</span>
              <strong>{file ? "Yes" : "No"}</strong>
            </div>
            <div className="data-stat">
              <span>Validation</span>
              <strong>{validation ? "Completed" : "Pending"}</strong>
            </div>
            <div className="data-stat">
              <span>Statistics</span>
              <strong>{statistics ? "Completed" : "Pending"}</strong>
            </div>
            <div className="data-stat">
              <span>DML analysis</span>
              <strong>{analysis ? "Completed" : "Pending"}</strong>
            </div>
          </div>

          <p className="section-description" style={{ marginTop: 14 }}>
            These insights are generated from the uploaded dataset and
            current application results. They are recommendations, not
            predictions from an external AI model.
          </p>
        </div>
      </div>
    );
  }

  function renderSettings() {
    return (
      <div className="page-content">
        <PageTitle description="Application configuration and backend connection." />

        <div className="panel">
          <div className="panel-heading">
            <div><h3>Backend connection</h3><p>Check whether the Flask API is reachable.</p></div>
            <span className={`status-pill ${health === "Connected" ? "online" : ""}`}>
              <CircleDot size={13} /> {health}
            </span>
          </div>

          <div className="settings-row">
            <div><strong>API address</strong><p>{API_BASE}</p></div><Database />
          </div>
          <div className="settings-row">
            <div><strong>Health endpoint</strong><p>/api/health</p></div><Activity />
          </div>
          <div className="settings-row">
            <div><strong>Maximum upload size</strong><p>16 MB (Flask configuration)</p></div><Upload />
          </div>

          <button className="primary-button" onClick={checkBackend} disabled={checking}>
            {checking ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}
            Test backend connection
          </button>
        </div>

        <div className="panel">
          <h3 className="section-title">Application information</h3>

          <div className="settings-row">
            <div><strong>Application</strong><p>EconoCausal</p></div><Activity />
          </div>
          <div className="settings-row">
            <div><strong>Frontend</strong><p>React 18 + Vite</p></div><LayoutDashboard />
          </div>
          <div className="settings-row">
            <div><strong>Charts</strong><p>Recharts</p></div><BarChart3 />
          </div>
          <div className="settings-row">
            <div><strong>Icons</strong><p>Lucide React</p></div><BrainCircuit />
          </div>
        </div>
      </div>
    );
  }

  const pageContent = {
    overview: renderOverview,
    explorer: renderExplorer,
    management: renderManagement,
    validation: renderValidation,
    causal: renderCausal,
    insights: renderInsights,
    reports: renderReports,
    intelligence: renderIntelligence,
    settings: renderSettings
  }[page];

  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Activity size={23} /></div>

          {!collapsed && (
            <div>
              <div className="brand-name">EconoCausal</div>
              <div className="brand-caption">PRICING INTELLIGENCE</div>
            </div>
          )}
        </div>

        <button className="sidebar-toggle"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          {!collapsed && <span>Collapse menu</span>}
        </button>

        {!collapsed && <div className="side-label">WORKSPACE</div>}

        <nav className="sidebar-nav">
          {PAGES.map((item) => {
            const Icon = item.icon;

            return (
              <button key={item.id}
                className={`side-item ${page === item.id ? "active" : ""}`}
                onClick={() => {
                  setPage(item.id);
                  clearMessages();
                }}
                title={collapsed ? item.label : undefined}>
                <Icon size={18} />
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-status">
            <span className={`status-dot ${health === "Connected" ? "online" : ""}`} />

            {!collapsed && (
              <div>
                <div className="status-title">API Status</div>
                <div className="status-subtitle">{health}</div>
              </div>
            )}
          </div>

          {!collapsed && (
            <div className="sidebar-footer">EconoCausal · Internship Project</div>
          )}
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-heading">{currentPage.label}</div>
          </div>

          <div className="topbar-actions">
            {file && (
              <span className="status-pill">
                <FileSpreadsheet size={13} /> {file.name}
              </span>
            )}

            <button className="outline-button" onClick={checkBackend} disabled={checking}>
              {checking
                ? <LoaderCircle className="spin" size={15} />
                : <RefreshCw size={15} />}
              Check connection
            </button>
          </div>
        </header>

        {error && (
          <div className="alert alert-error" role="alert">
            <XCircle size={18} /><span>{error}</span>
            <button className="alert-close" onClick={() => setError("")}>×</button>
          </div>
        )}

        {notice && !error && (
          <div className="alert alert-success" role="status">
            <CheckCircle2 size={18} /><span>{notice}</span>
            <button className="alert-close" onClick={() => setNotice("")}>×</button>
          </div>
        )}

        {pageContent()}

        <footer className="page-footer">
          <span>EconoCausal · Pricing Intelligence</span>
          <span>Data-driven decisions start with reliable data.</span>
        </footer>
      </main>
    </div>
  );
}


export default App;


