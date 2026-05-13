/**
 * ══════════════════════════════════════════════════════════
 * MUST Odoo Academic Implementation Tracker — Backend Server
 * Express + sql.js (pure JS SQLite) + JWT + bcrypt + PG snapshot
 * ══════════════════════════════════════════════════════════
 */

const express  = require("express");
const cors     = require("cors");
const jwt      = require("jsonwebtoken");
const bcrypt   = require("bcryptjs");
const path     = require("path");
const initSqlJs = require("sql.js");
const fs       = require("fs");

const app  = express();
const PORT = process.env.PORT || 3300;
const JWT_SECRET = process.env.JWT_SECRET || "must-academic-tracker-secret-2026";

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

/* ══════════════════════════════════════════════════════════
   POSTGRES SNAPSHOT STORAGE (optional — durable on Render)
   ══════════════════════════════════════════════════════════ */
const USE_PG = !!process.env.DATABASE_URL;
let pgPool = null;
if (USE_PG) {
  const { Pool } = require("pg");
  pgPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  pgPool.on("error", err => console.error("PG pool error:", err));
}
// Use a unique table name so this app can share a PG instance with the HR tracker
const PG_TABLE = 'db_snapshot_academic';
async function pgEnsureSchema() { if (!USE_PG) return; await pgPool.query(`CREATE TABLE IF NOT EXISTS ${PG_TABLE} (id INT PRIMARY KEY DEFAULT 1, data BYTEA NOT NULL, byte_size INT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT ${PG_TABLE}_single_row CHECK (id = 1))`); }
async function pgLoadSnapshot() { if (!USE_PG) return null; const r = await pgPool.query(`SELECT data, byte_size, updated_at FROM ${PG_TABLE} WHERE id = 1`); return r.rows.length ? r.rows[0] : null; }
async function pgWriteSnapshot(buf) { if (!USE_PG) return; await pgPool.query(`INSERT INTO ${PG_TABLE} (id, data, byte_size, updated_at) VALUES (1, $1, $2, NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, byte_size = EXCLUDED.byte_size, updated_at = NOW()`, [buf, buf.length]); }
let pgFlushTimer = null, pgFlushInFlight = false, pgFlushQueued = false;
async function flushToPg() { if (!USE_PG || !db) return; if (pgFlushInFlight) { pgFlushQueued = true; return; } pgFlushInFlight = true; try { await pgWriteSnapshot(Buffer.from(db.export())); } catch (e) { console.error("⚠️ PG snapshot write failed:", e.message); } finally { pgFlushInFlight = false; if (pgFlushQueued) { pgFlushQueued = false; scheduleFlush(); } } }
function scheduleFlush() { if (!USE_PG || pgFlushTimer) return; pgFlushTimer = setTimeout(() => { pgFlushTimer = null; flushToPg(); }, 800); }
async function gracefulShutdown(signal) { console.log(`\n🔻 ${signal} — flushing DB...`); if (pgFlushTimer) { clearTimeout(pgFlushTimer); pgFlushTimer = null; } try { await flushToPg(); console.log("✅ Final snapshot flushed."); } catch (e) { console.error("❌ Final flush failed:", e.message); } try { if (pgPool) await pgPool.end(); } catch {} process.exit(0); }
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT",  () => gracefulShutdown("SIGINT"));

/* ══════════════════════════════════════════════════════════
   LOCAL DB PATH + sql.js HELPERS
   ══════════════════════════════════════════════════════════ */
const DB_DIR = process.env.DB_DIR || path.join(__dirname, "db");
if (!fs.existsSync(DB_DIR)) { try { fs.mkdirSync(DB_DIR, { recursive: true }); } catch(e) {} }
const DB_PATH = path.join(DB_DIR, "tracker.db");
const DB_EXISTED_AT_STARTUP = fs.existsSync(DB_PATH);
console.log("══════════════════════════════════════════════════════════");
console.log("📁 DB path      :", DB_PATH);
console.log("🐘 DATABASE_URL :", USE_PG ? "SET — Postgres snapshot enabled" : "NOT SET — filesystem only");
if (!USE_PG && !process.env.DB_DIR) console.log("⚠️  WARNING: No persistent storage. Data will be wiped on Render redeploy.");
console.log("══════════════════════════════════════════════════════════");

let db;
function saveDb() {
  try { fs.writeFileSync(DB_PATH, Buffer.from(db.export())); } catch (e) { console.error("FS write failed:", e.message); }
  if (USE_PG) scheduleFlush();
}
function runP(sql, params = []) { db.run(sql, params); const changes = db.getRowsModified(); const rid = db.exec("SELECT last_insert_rowid() as id"); const lastInsertRowid = rid.length > 0 ? rid[0].values[0][0] : 0; saveDb(); return { changes, lastInsertRowid }; }
function getP(sql, params = []) { const rows = allP(sql, params); return rows.length > 0 ? rows[0] : null; }
function allP(sql, params = []) { const stmt = db.prepare(sql); stmt.bind(params); const rows = []; const cols = []; let gotCols = false; while (stmt.step()) { if (!gotCols) { stmt.getColumnNames().forEach(c => cols.push(c)); gotCols = true; } const vals = stmt.get(); const row = {}; cols.forEach((c, i) => row[c] = vals[i]); rows.push(row); } stmt.free(); return rows; }

/* ══════════════════════════════════════════════════════════
   ACADEMIC PHASES DATA (from MUST-ACAD-IMP-001)
   ══════════════════════════════════════════════════════════ */
const PHASES = [
  { id:0, title:"Immediate pre-work — this week's deliverables", subtitle:"Must be in motion before any Odoo academic module is touched", timeline:"This week", urgent:1,
    note:"Key insight: academic operations in Odoo cannot be configured in any order — the system enforces business rules, and a rule that is not anchored in an approved policy is contestable. Policies first; then master data; then configuration.",
    sections:[
      { label:"Immediate actions (Registrar & CoE → Vice Chancellor)", cat:"action", tasks:[
        "Brief the VC on MUST-ACAD-IMP-001 and seek approval to constitute the Academic Implementation Steering Committee",
        "Circulate MUST-ACAD-POL-001 draft for 30-day comment window",
        "Designate an Academic Implementation Lead from the Registrar's office",
        "Confirm Odoo Education module selection: OpenEduCat vs native vs custom",
        "Request IT to provision UAT, Training and Production environments"
      ]},
      { label:"Approvals required", cat:"authority", tasks:[
        "Vice Chancellor — constitute Steering Committee & approve programme launch",
        "Registrar — convene policy owners; lock Policy Development Calendar",
        "Academic Council — receive 30-day comments and prepare to approve Tier 1 policies"
      ]}
    ]},
  { id:1, title:"Foundation, governance & scope lock", subtitle:"The Steering Committee is constituted and the programme is launched", timeline:"Weeks 1–3", urgent:0,
    note:"The Steering Committee is the apex governance body for the whole 40-week programme.",
    sections:[
      { label:"Policies", cat:"policy", tasks:["Lock Policy Development Calendar (17 policies × owners × target dates)"] },
      { label:"Documents to create", cat:"doc", tasks:[
        "Programme Charter (ratified roadmap)","Academic Implementation Steering Committee — Terms of Reference",
        "Policy Development Calendar (17 policies × owners × target dates)",
        "Odoo Education Module Selection Paper (OpenEduCat vs native vs custom)",
        "Stakeholder Map and Communication Plan"
      ]},
      { label:"Odoo configuration", cat:"odoo", tasks:[
        "Provision UAT, Training and Production environments",
        "Configure source control, backup and restore policy for the Odoo databases",
        "Hold off on academic module configuration until Tier 1 policy approval"
      ]},
      { label:"Approvals required", cat:"authority", tasks:[
        "Vice Chancellor — Steering Committee constitution and Programme Charter",
        "Board of Governors — in-principle approval of the programme"
      ]}
    ]},
  { id:2, title:"Master data build & sign-off", subtitle:"The foundation on which every academic module depends", timeline:"Weeks 4–6", urgent:0,
    note:"Duplicate course codes, inconsistent programme names and missing prerequisites silently corrupt the system for years afterwards.",
    sections:[
      { label:"Policies to approve", cat:"policy", tasks:["P-01 Academic Calendar Policy","P-05 Grading Policy (Fractionalized GPA) — refresh for system alignment"] },
      { label:"Documents to create", cat:"doc", tasks:["Academic Master Data Dictionary v1.0","Course Catalogue Master List (signed by each HoD)","Programme Structure Sheets (course-to-programme mapping)","Role and Access Matrix (Student, Faculty, HoD, Dean, CoE Officer, Registrar Officer)","Approved Academic Calendar for the upcoming session"] },
      { label:"Odoo configuration", cat:"odoo", tasks:["Configure organisational hierarchy: Faculty → Department → Programme","Load course catalogue with credit-hour, prerequisite and co-requisite relationships","Configure the Academic Calendar with sessions, semesters and key dates","Configure the fractionalized grading scale and percentage-to-grade conversion","Create classroom and time-slot master data","Create security groups for every academic role"] },
      { label:"Approvals required", cat:"authority", tasks:["Academic Council — P-01 and P-05","Registrar, CoE, Director HR — sign Master Data Dictionary","HoDs — personally certify their department's courses"] }
    ]},
  { id:3, title:"Admissions module", subtitle:"From public application portal to confirmed enrolment", timeline:"Weeks 7–10", urgent:0,
    note:"Admission is the public face of MUST. Every error here becomes a press story.",
    sections:[
      { label:"Policies to approve", cat:"policy", tasks:["P-02 Admissions Policy"] },
      { label:"Documents to create", cat:"doc", tasks:["Admissions SOP (process map, role-by-role steps, screenshots)","Admissions Test Confidentiality Protocol","Applicant Communication Templates (acknowledgement, test call, merit, offer, joining)","UAT test cases for Admissions","Approved merit formula per programme"] },
      { label:"Odoo configuration", cat:"odoo", tasks:["Configure public Admissions Portal (application form, document upload, fee challan, status tracking)","Configure eligibility-rule engine per programme","Configure entry-test scheduling and scoring","Configure merit-list generation with policy-defined tie-breaker rules","Configure offer-letter and fee-challan templates","Configure conversion of accepted applicant to Student record on first-fee clearance"] },
      { label:"Approvals required", cat:"authority", tasks:["Academic Council — Admissions Policy","Boards of Studies — programme-wise eligibility and merit formulae","Registrar — UAT sign-off and go-live decision"] }
    ]},
  { id:4, title:"Student enrolment & ID issuance", subtitle:"Admitted applicant becomes active MUST student on the system", timeline:"Weeks 11–13", urgent:0,
    note:"Enrolment numbers, once assigned, are permanent and irrevocable — they appear on the degree.",
    sections:[
      { label:"Policies to approve", cat:"policy", tasks:["P-03 Student Registration & Enrolment Policy"] },
      { label:"Documents to create", cat:"doc", tasks:["Student Enrolment SOP","Joining-Day Checklist for new students","Student Code of Conduct undertaking","Student Portal user manual","ID-card template (with photograph, enrolment number, programme, validity, QR for verification)"] },
      { label:"Odoo configuration", cat:"odoo", tasks:["Configure enrolment workflow: fee verification → record creation → enrolment number → portal credentials → ID issuance","Configure enrolment number format YYYY-PROG-NNNN with auto-generation","Configure the Student Portal landing page (profile, enrolment certificate, fee status, document downloads)","Configure document-upload for CNIC, photograph, prior transcripts and undertakings","Configure the six student statuses (Active, Dormant, Frozen, Withdrawn, Dismissed, Graduated) with state transitions"] },
      { label:"Approvals required", cat:"authority", tasks:["Academic Council — Enrolment Policy","Registrar — custodian of student records and enrolment numbers"] }
    ]},
  { id:5, title:"Course registration, sectioning & timetabling", subtitle:"Each enrolled student registers for their semester's courses online", timeline:"Weeks 14–17", urgent:0,
    note:"Prerequisite enforcement is the most common pinch-point. Odoo must hold the line.",
    sections:[
      { label:"Policies to approve", cat:"policy", tasks:["P-04 Course Registration, Add/Drop & Credit-Hour Policy"] },
      { label:"Documents to create", cat:"doc", tasks:["Course Offering SOP (HoD → Dean → Registrar)","Student Course-Registration Guide","Timetable Conflict Resolution Procedure","Faculty Workload Allocation Template (signed by HoD and Dean)"] },
      { label:"Odoo configuration", cat:"odoo", tasks:["Configure semester course-offering workflow (HoD proposes → Dean recommends → Registrar approves)","Configure section creation with faculty assignment and capacity","Configure the timetable engine with room and slot rules","Configure student-portal registration with prerequisite, credit-load and clash checks","Configure the Add/Drop window with automatic closure on the policy-defined date","Configure W-grade (withdrawal) handling after Add/Drop close","Configure late-registration fee posting"] },
      { label:"Approvals required", cat:"authority", tasks:["Academic Council — Course Registration Policy","Registrar — semester course offering and timetable"] }
    ]},
  { id:6, title:"Attendance management", subtitle:"Daily class attendance with policy-driven short-attendance escalation", timeline:"Weeks 18–20", urgent:0,
    note:"An attendance edit window with no time-lock invites manipulation. The 24-hour rule must be hard-enforced in Odoo.",
    sections:[
      { label:"Policies to approve", cat:"policy", tasks:["P-07 Attendance Policy"] },
      { label:"Documents to create", cat:"doc", tasks:["Attendance SOP (Faculty Portal)","Short-Attendance Escalation Procedure","Leave-Application form and approval matrix","Quarterly Attendance Audit Procedure (for QEC)"] },
      { label:"Odoo configuration", cat:"odoo", tasks:["Configure Faculty Portal attendance entry per class period","Configure 75% threshold computation and automatic flagging","Configure short-attendance notifications at weeks 4, 8, 12 and end-of-semester","Configure leave categories (medical, official, bereavement, compassionate) with document upload","Configure condonation workflow (floor: 65%)","Lock attendance 24 hours after class; HoD-only edits thereafter","Where biometric is in scope, configure synchronisation interface"] },
      { label:"Approvals required", cat:"authority", tasks:["Academic Council — Attendance Policy","Deans — condonation approvals"] }
    ]},
  { id:7, title:"Internal assessment & examinations", subtitle:"Quizzes, assignments, mid-terms and finals — end-to-end on system", timeline:"Weeks 21–24", urgent:0,
    note:"Examination integrity defines the worth of every MUST degree.",
    sections:[
      { label:"Policies to approve", cat:"policy", tasks:["P-06 Examination & Internal Assessment Policy","P-14 Academic Integrity & Plagiarism Policy"] },
      { label:"Documents to create", cat:"doc", tasks:["Examination SOP — internal assessment, mid-term and final","Question Paper Development and Vetting Protocol","Invigilation Duty Manual","Seating Plan Generation Standard","Unfair-Means Procedure","Faculty Mark-Entry Guide"] },
      { label:"Odoo configuration", cat:"odoo", tasks:["Configure assessment templates per course type (theory 25/25/50; lab 50/20/30)","Configure Faculty Portal mark-entry with policy-enforced weightage caps","Configure mid-term and final scheduling per section","Configure auto-generated seating plans by enrolment number and hall capacity","Configure invigilation rosters with conflict-avoidance","Configure secure question-paper upload with role-restricted access","Integrate Turnitin (or equivalent) for assignment and thesis upload — HEC threshold 19% overall, 5% single source"] },
      { label:"Approvals required", cat:"authority", tasks:["Academic Council — Examination and Integrity policies","Controller of Examinations — operational ownership of the whole examination cycle"] }
    ]},
  { id:8, title:"Grade processing, GPA/CGPA & result notification", subtitle:"Raw marks → moderated grades → ratified results → student notification", timeline:"Weeks 25–28", urgent:0,
    note:"CGPA must be cross-verified by manual calculation for a sample of 20 students with zero variance before this phase closes.",
    sections:[
      { label:"Policies to approve", cat:"policy", tasks:["P-05 Grading Policy — operational alignment refresh","P-08 Academic Standing, Probation & Promotion Policy","P-09 Result Notification & Award Approval Policy"] },
      { label:"Documents to create", cat:"doc", tasks:["Result Processing SOP","Statistical Moderation Guide for HoDs","Faculty Board Result Approval Template","Student Result Notification template"] },
      { label:"Odoo configuration", cat:"odoo", tasks:["Configure GPA/CGPA computation engine consistent with the fractionalized scale (A=4.00 … F=0.00)","Configure repeat-course rule (better-grade-counts)","Configure grade improvement (one-time per course, before final two semesters)","Configure award-sheet workflow: Faculty → HoD → Faculty Board → CoE → Notification (28-day SLA)","Configure HoD moderation dashboard with grade-distribution statistics","Configure auto-flagging of warning, probation and dismissal cases for the Registrar","Configure result publication to Student Portal"] },
      { label:"Approvals required", cat:"authority", tasks:["Academic Council — Grading, Academic Standing, Result Notification policies","Controller of Examinations — owner of the result cycle","Faculty Boards — ratification step"] }
    ]},
  { id:9, title:"Re-checking, re-evaluation & grade appeal", subtitle:"Student redress mechanism with full audit trail", timeline:"Weeks 29–30", urgent:0,
    note:"Re-evaluation can revise a grade downward if the original was found generous.",
    sections:[
      { label:"Policies to approve", cat:"policy", tasks:["P-12 Re-checking, Re-evaluation & Grade Appeal Policy"] },
      { label:"Documents to create", cat:"doc", tasks:["Re-checking SOP","Grade Appeal Committee charter","Re-checking and Re-evaluation Outcome Letter templates","Fee schedule (PKR 1,000 re-check; PKR 2,500 re-evaluation; PKR 5,000 appeal)"] },
      { label:"Odoo configuration", cat:"odoo", tasks:["Configure student-portal request form with fee posting","Configure three-tier workflow: Re-checking (10 days) → Re-evaluation (20 days) → Grade Appeal (15 days)","Configure independent re-evaluator assignment by HoD","Configure result-amendment workflow with full audit trail","Configure refund logic (re-check: refund on any change; re-evaluation: refund on full-grade change)","Configure auto-notification of outcome and updated transcript"] },
      { label:"Approvals required", cat:"authority", tasks:["Academic Council — Re-checking Policy","CoE — operates the workflow","Grade Appeal Committee (Dean, senior external faculty, CoE) — final adjudication"] }
    ]},
  { id:10, title:"Transcripts & academic records", subtitle:"Self-service transcript portal with QR-verifiable authenticity", timeline:"Weeks 31–33", urgent:0,
    note:"Only the Office of the Controller of Examinations issues transcripts. No other office, no shortcut.",
    sections:[
      { label:"Policies to approve", cat:"policy", tasks:["P-10 Transcript & Certificate Issuance Policy","P-17 Student Records Retention & Data Privacy Policy"] },
      { label:"Documents to create", cat:"doc", tasks:["Transcript Issuance SOP","Transcript Verification Procedure for external requesters","Records Retention Schedule (linked to P-17)","Transcript template — Provisional and Final variants"] },
      { label:"Odoo configuration", cat:"odoo", tasks:["Configure transcript generator pulling all completed semesters","Configure Provisional (watermark) and Final variants","Configure self-service request from Student Portal with fee posting and delivery options","Configure CoE printing and signing workflow (CoE signs, Registrar countersigns)","Configure public verification page (QR / reference number) — read-only, zero PII leakage","Configure access-log on every transcript issuance for audit"] },
      { label:"Approvals required", cat:"authority", tasks:["Academic Council — Transcript and Data Privacy policies","Controller of Examinations — sole authority to issue transcripts"] }
    ]},
  { id:11, title:"Degree audit, convocation & special cases", subtitle:"First graduating cohort — freezes, withdrawals, migrations, transfers and discipline", timeline:"Weeks 34–36", urgent:0,
    note:"MUST's first convocation will be a watched event. Every degree audited through Odoo with zero manual override.",
    sections:[
      { label:"Policies to approve", cat:"policy", tasks:["P-11 Degree Award & Convocation Policy","P-15 Semester Freeze, Withdrawal & Readmission Policy","P-16 Migration, Transfer & Credit Recognition Policy","P-13 Student Discipline Policy"] },
      { label:"Documents to create", cat:"doc", tasks:["Degree Audit Procedure","Convocation Planning Manual","Special-Cases Handbook (Freeze, Withdrawal, Readmission, Migration, Transfer)","Clearance Procedure for Graduating Students","Disciplinary Show-Cause Notice templates","Degree certificate template (HEC-compliant security features)"] },
      { label:"Odoo configuration", cat:"odoo", tasks:["Configure continuous degree-audit engine showing each student's progress against programme requirements","Configure 'Eligible for Convocation' auto-flag on degree-audit pass","Configure parallel clearance workflow (Finance, Library, Hostel, Department, Student Affairs)","Configure degree-issuance workflow with batch printing and tri-signature (VC, Registrar, CoE)","Configure semester-freeze workflow (max 2 semesters; not counted toward time-to-degree)","Configure withdrawal and readmission workflows with HEC fee-refund schedule","Configure migration workflow with the 50% credit-transfer cap","Configure disciplinary case management with confidential records and appeal rights"] },
      { label:"Approvals required", cat:"authority", tasks:["Board of Governors — Degree Award and Discipline policies","Academic Council — Freeze and Migration policies","Vice Chancellor — confers degrees; approves Convocation List"] }
    ]},
  { id:12, title:"Go-live, stabilisation & HEC reporting", subtitle:"Cut over to Odoo as sole system of record; close out programme", timeline:"Weeks 37–40", urgent:0,
    note:"Success criterion: zero academic transactions performed outside Odoo for thirty consecutive days.",
    sections:[
      { label:"Policies — all 17 in force", cat:"policy", tasks:["All policies P-01 through P-17 approved and published in MUST-ACAD-POL-001 v1.0"] },
      { label:"Documents to create", cat:"doc", tasks:["Cut-over Plan and Rollback Plan","Hyper-care Support Protocol (first 30 days)","Decommissioning Certificate for legacy systems","HEC Reporting Calendar mapped to Odoo report objects","Post-Implementation Review (PIR) report"] },
      { label:"Odoo configuration", cat:"odoo", tasks:["Migrate historical data of existing batches; reconcile and freeze as 'pre-Odoo'","Switch production environment to live mode","Decommission spreadsheet trackers and parallel systems","Configure HEC standard reports: enrolment census, results summary, faculty-student ratio, programme outcomes","Configure QEC dashboards: programme reviews, attendance health, grade distribution, attrition","Configure Board-of-Governors dashboard at VC level","Activate scheduled monthly reports to VC, Registrar, CoE"] },
      { label:"Approvals required", cat:"authority", tasks:["Steering Committee — go-live decision and programme closure","Vice Chancellor — formal cut-over notification","Board of Governors — Post-Implementation Review"] }
    ]}
];

/* ══════════════════════════════════════════════════════════
   DATABASE INITIALIZATION & SEED
   ══════════════════════════════════════════════════════════ */
async function initDb() {
  const SQL = await initSqlJs();
  let loadedFromPg = false;
  if (USE_PG) {
    try {
      await pgEnsureSchema();
      const snap = await pgLoadSnapshot();
      if (snap && snap.data) { db = new SQL.Database(new Uint8Array(snap.data)); loadedFromPg = true; console.log(`🐘 Loaded DB from Postgres (${snap.byte_size} bytes)`); }
      else { console.log("🐘 Postgres connected — no snapshot yet"); }
    } catch (e) { console.error("⚠️  PG load failed, using filesystem:", e.message); }
  }
  if (!loadedFromPg) {
    if (fs.existsSync(DB_PATH)) { db = new SQL.Database(fs.readFileSync(DB_PATH)); }
    else { db = new SQL.Database(); }
  }

  const schema = fs.readFileSync(path.join(__dirname, "db", "schema.sql"), "utf-8");
  db.exec(schema);
  db.exec("PRAGMA foreign_keys = ON;");
  saveDb();

  // Seed if empty
  const userCount = getP("SELECT COUNT(*) as c FROM users");
  if (!userCount || userCount.c === 0) seedDefaults();
}

function seedDefaults() {
  console.log("⚙️  Seeding default users and academic roadmap...");
  const hash = bcrypt.hashSync("must2026", 10);
  const users = [
    ["admin",     hash, "System Administrator", "admin",     "admin@must.edu.pk"],
    ["registrar", hash, "Registrar",            "registrar", "registrar@must.edu.pk"],
    ["coe",       hash, "Controller of Examinations", "coe", "coe@must.edu.pk"],
    ["vc",        hash, "Vice Chancellor",      "vc",        "vc@must.edu.pk"],
    ["dean",      hash, "Dean (Rotating)",      "dean",      "dean@must.edu.pk"]
  ];
  users.forEach(u => runP("INSERT INTO users (username, password_hash, display_name, role, email, must_change_password) VALUES (?,?,?,?,?,1)", u));

  // Seed phases and tasks
  PHASES.forEach(ph => {
    runP("INSERT INTO phases (phase_number, title, subtitle, timeline, note, urgent, sort_order) VALUES (?,?,?,?,?,?,?)",
      [ph.id, ph.title, ph.subtitle, ph.timeline, ph.note||'', ph.urgent||0, ph.id]);
    const phaseRow = getP("SELECT id FROM phases WHERE phase_number = ?", [ph.id]);
    if (!phaseRow) return;
    let taskOrder = 0;
    ph.sections.forEach(sec => {
      sec.tasks.forEach(t => {
        runP("INSERT INTO tasks (phase_id, label, category, section_label, sort_order) VALUES (?,?,?,?,?)",
          [phaseRow.id, t, sec.cat, sec.label, taskOrder++]);
      });
    });
  });

  console.log("✅ Seed complete — 5 users, " + PHASES.length + " phases");
}

/* ══════════════════════════════════════════════════════════
   AUTH MIDDLEWARE
   ══════════════════════════════════════════════════════════ */
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) return res.status(401).json({ error: "Token required" });
  try {
    req.user = jwt.verify(h.split(" ")[1], JWT_SECRET);
    next();
  } catch { return res.status(401).json({ error: "Invalid token" }); }
}

/* ══════════════════════════════════════════════════════════
   AUTH ROUTES
   ══════════════════════════════════════════════════════════ */
// Public endpoint for login dropdown (no auth required)
app.get("/api/users/public", (req, res) => {
  const users = allP("SELECT username, display_name, role FROM users WHERE active = 1 ORDER BY display_name");
  res.json({ users });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });
  const user = getP("SELECT * FROM users WHERE username = ? AND active = 1", [username.toLowerCase().trim()]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: "Invalid credentials" });
  runP("UPDATE users SET last_login = datetime('now') WHERE id = ?", [user.id]);
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role, displayName: user.display_name }, JWT_SECRET, { expiresIn: "24h" });
  res.json({ token, user: { id: user.id, username: user.username, displayName: user.display_name, role: user.role, email: user.email, mustChangePassword: user.must_change_password === 1 } });
});

app.post("/api/force-change-password", auth, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
  runP("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?", [bcrypt.hashSync(newPassword, 10), req.user.id]);
  res.json({ success: true });
});

/* ══════════════════════════════════════════════════════════
   USER MANAGEMENT (admin only)
   ══════════════════════════════════════════════════════════ */
app.get("/api/users", auth, (req, res) => {
  res.json({ users: allP("SELECT id, username, display_name, role, email, active, created_at, last_login FROM users") });
});

app.post("/api/users", auth, (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  const { username, displayName, role, email } = req.body;
  if (!username || !displayName || !role) return res.status(400).json({ error: "Missing fields" });
  const hash = bcrypt.hashSync("must2026", 10);
  try {
    const { lastInsertRowid } = runP("INSERT INTO users (username, password_hash, display_name, role, email, must_change_password) VALUES (?,?,?,?,?,1)",
      [username.toLowerCase().trim(), hash, displayName, role, email || null]);
    res.json({ success: true, userId: lastInsertRowid });
  } catch (e) { res.status(400).json({ error: "Username already exists" }); }
});

app.post("/api/users/:id/reset-password", auth, (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  runP("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?", [bcrypt.hashSync("must2026", 10), req.params.id]);
  res.json({ success: true });
});

/* ══════════════════════════════════════════════════════════
   PHASES & TASKS
   ══════════════════════════════════════════════════════════ */
app.get("/api/phases", auth, (req, res) => {
  const phases = allP("SELECT * FROM phases ORDER BY sort_order");
  const tasks = allP("SELECT * FROM tasks ORDER BY phase_id, sort_order");
  // Group tasks by phase
  const tasksByPhase = {};
  tasks.forEach(t => { if (!tasksByPhase[t.phase_id]) tasksByPhase[t.phase_id] = []; tasksByPhase[t.phase_id].push(t); });
  phases.forEach(p => { p.tasks = tasksByPhase[p.id] || []; });
  // Progress stats
  const total = tasks.length;
  const done = tasks.filter(t => t.status === 'done').length;
  const inProgress = tasks.filter(t => t.status === 'in-progress').length;
  const notStarted = total - done - inProgress;
  res.json({ phases, progress: { total, done, inProgress, notStarted, pctDone: total ? Math.round(done/total*100) : 0 } });
});

app.put("/api/tasks/:id/status", auth, (req, res) => {
  const { status } = req.body;
  const valid = ['not-started','in-progress','done'];
  if (!valid.includes(status)) return res.status(400).json({ error: "Invalid status" });
  const task = getP("SELECT * FROM tasks WHERE id = ?", [req.params.id]);
  if (!task) return res.status(404).json({ error: "Task not found" });
  const oldStatus = task.status;
  const completedDate = status === 'done' ? new Date().toISOString() : null;
  const completedBy = status === 'done' ? req.user.displayName : null;
  runP("UPDATE tasks SET status = ?, completed_date = ?, completed_by = ?, updated_at = datetime('now') WHERE id = ?",
    [status, completedDate, completedBy, req.params.id]);
  runP("INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_value, new_value) VALUES (?,?,?,?,?,?)",
    [req.user.id, 'status_change', 'task', task.id, oldStatus, status]);
  res.json({ success: true });
});

app.post("/api/tasks/:id/reset", auth, (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  runP("UPDATE tasks SET status = 'not-started', completed_date = NULL, completed_by = NULL, updated_at = datetime('now') WHERE id = ?", [req.params.id]);
  // Also clean up any forwarded items
  runP("DELETE FROM forwarded_items WHERE task_id = ?", [req.params.id]);
  res.json({ success: true });
});

/* ══════════════════════════════════════════════════════════
   FORWARDING (approval & action workflow)
   ══════════════════════════════════════════════════════════ */
app.post("/api/tasks/:id/forward", auth, (req, res) => {
  const { forwardType, title, description, forwardTo, dueDate, fileName, fileData, fileType } = req.body;
  if (!forwardType || !title || !forwardTo) return res.status(400).json({ error: "Missing fields" });
  const task = getP("SELECT * FROM tasks WHERE id = ?", [req.params.id]);
  if (!task) return res.status(404).json({ error: "Task not found" });
  const { lastInsertRowid } = runP(
    `INSERT INTO forwarded_items (task_id, forward_type, title, description, forwarded_by, forwarded_to, due_date, file_name, file_data, file_type) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [task.id, forwardType, title, description||'', req.user.id, forwardTo, dueDate||null, fileName||null, fileData||null, fileType||null]
  );
  res.json({ success: true, id: lastInsertRowid });
});

app.get("/api/forwarded", auth, (req, res) => {
  const items = allP(`SELECT fi.*, u.display_name AS forwarded_by_name, t.label AS task_label, t.phase_id,
    (SELECT display_name FROM users WHERE username = fi.forwarded_to) AS forwarded_to_name,
    (SELECT role FROM users WHERE username = fi.forwarded_to) AS forwarded_to_role
    FROM forwarded_items fi JOIN users u ON fi.forwarded_by = u.id JOIN tasks t ON fi.task_id = t.id ORDER BY fi.forwarded_at DESC`);
  res.json({ forwardedItems: items });
});

app.post("/api/forwarded/:id/respond", auth, (req, res) => {
  const { status, note } = req.body;
  const valid = ['approved','noted','rejected','done','declined'];
  if (!valid.includes(status)) return res.status(400).json({ error: "Invalid status" });
  const item = getP("SELECT * FROM forwarded_items WHERE id = ?", [req.params.id]);
  if (!item) return res.status(404).json({ error: "Item not found" });
  // Liberal permission: match username or role
  const ft = (item.forwarded_to || '').toLowerCase();
  const myUser = (req.user.username || '').toLowerCase();
  const myRole = (req.user.role || '').toLowerCase();
  const isRecipient = ft === myUser || ft === myRole;
  if (req.user.role !== 'admin' && !isRecipient) return res.status(403).json({ error: "Not authorized" });
  runP("UPDATE forwarded_items SET status = ?, response_note = ?, responded_at = datetime('now') WHERE id = ?",
    [status, note||'', req.params.id]);
  res.json({ success: true });
});

app.post("/api/forwarded/:id/dismiss", auth, (req, res) => {
  runP("UPDATE forwarded_items SET dismissed = 1 WHERE id = ?", [req.params.id]);
  res.json({ success: true });
});

app.get("/api/forwarded/:id/file", auth, (req, res) => {
  const item = getP("SELECT file_name, file_data, file_type FROM forwarded_items WHERE id = ?", [req.params.id]);
  if (!item || !item.file_data) return res.status(404).json({ error: "No file" });
  res.json({ fileName: item.file_name, fileData: item.file_data, fileType: item.file_type });
});

/* ══════════════════════════════════════════════════════════
   HEALTH + SPA FALLBACK + START
   ══════════════════════════════════════════════════════════ */
app.get("/api/health", async (req, res) => {
  let pgInfo = { enabled: USE_PG };
  if (USE_PG) {
    try { const r = await pgPool.query(`SELECT byte_size, updated_at FROM ${PG_TABLE} WHERE id = 1`); pgInfo.hasSnapshot = r.rows.length > 0; if (r.rows.length > 0) { pgInfo.byteSize = r.rows[0].byte_size; pgInfo.updatedAt = r.rows[0].updated_at; } } catch (e) { pgInfo.error = e.message; }
  }
  res.json({ status: "ok", db: { postgres: pgInfo, persistent: USE_PG || !!process.env.DB_DIR }, uptime: process.uptime() });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 MUST Academic Tracker running at http://localhost:${PORT}`);
    console.log(`   Default credentials — all users: password "must2026"`);
    console.log(`   Roles: admin, registrar, coe, vc, dean\n`);
  });
}).catch(err => { console.error("Failed to initialize database:", err); process.exit(1); });
