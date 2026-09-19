const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

/* Speicher – zwei Betriebsarten:

   1) JSON-Datei (Standard, kein Setup nötig)
      - lokal:   ./data/db.json
      - Render:  nur mit einer "Disk" dauerhaft, z. B. DATA_DIR=/var/data
        (siehe ANLEITUNG-RENDER.md, Schritt 9)

   2) Postgres-Datenbank, sobald DATABASE_URL gesetzt ist
      - dauerhaft, unabhängig von Neustarts/Deploys
      - funktioniert mit Neon, Supabase oder Render Postgres
      - Beispiel: postgresql://user:passwort@host:5432/dbname?sslmode=require

   Ohne DATABASE_URL verhält sich alles exakt wie vorher. */
const DATABASE_URL = process.env.DATABASE_URL || null;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

/* ============ EBENEN-HIERARCHIE ============
   Alle Rollen INNERHALB einer Ebene haben identische Rechte.
   level = Vergleichswert für Berechtigungsprüfung (höher = mehr Macht) */
const EBENEN = [
  { key: "supporter", name: "Supporter", level: 1,
    roles: ["Test Supporter", "Supporter", "Head Supporter"] },
  { key: "moderator", name: "Moderator", level: 2,
    roles: ["Jr. Mod", "Mod", "Head Mod"] },
  { key: "admin", name: "Low Team Ebene – Administrator", level: 3,
    roles: ["Jr. Admin", "Admin", "Sr. Administrator", "Head Administrator", "LTD.Administrator"] },
  { key: "highteam", name: "Highteam", level: 4,
    roles: ["Stv. Teamleitung", "Teamleitung", "LTD.Teamleitung", "Stv. Servermanagement",
            "Servermanagement", "Designing Manager", "Stv. Manager", "Manager"] },
  { key: "highrank", name: "High Rank", level: 5,
    roles: ["Stv. Serverleitung", "Serverleitung", "Stv. Projektleitung", "Projektleitung"] },
  { key: "leitung", name: "Leitungsebene", level: 6,
    roles: ["Supervisor", "Co. Owner", "Owner"] },
];
const DEV_EBENE = { key: "dev", name: "Entwickler", level: 99, roles: ["Entwickler"] };

function ebeneOf(role) {
  if (role === "Entwickler") return DEV_EBENE;
  return EBENEN.find(e => e.roles.includes(role)) || EBENEN[0];
}
function levelOf(role) { return ebeneOf(role).level; }
function allRolesOrdered() {
  return [...EBENEN].reverse().flatMap(e => e.roles); // höchste Ebene zuerst
}
// Darf actor die Zielrolle bearbeiten? (nie gleiche oder höhere Ebene, außer Entwickler)
function canEditRole(actorUser, targetRole) {
  if (actorUser.isDeveloper) return true;
  return levelOf(actorUser.role) > levelOf(targetRole);
}
function hasLevel(user, min) {
  if (!user) return false;
  if (user.isDeveloper) return true;
  return levelOf(user.role) >= min;
}

/* ============ DB LOAD/SAVE ============
   Die Funktionen load()/save() bleiben SYNCHRON, weil der ganze Server sie so
   benutzt. Im Postgres-Modus liegt das Dokument deshalb zusätzlich im
   Arbeitsspeicher (cache) und wird bei jedem Speichern in die Datenbank
   geschrieben. Für einen Einzel-Instanz-Betrieb (Render Free/Starter mit
   einer Instanz) ist das dasselbe Verhalten wie vorher bei der JSON-Datei. */
function ensureDb() {
  if (DATABASE_URL) return;               // im DB-Modus gibt es keine Datei
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify(seed(), null, 2));
}

let cache = null;        // Postgres-Modus: komplettes Datenobjekt im Speicher
let pool = null;
let writeChain = Promise.resolve();

function pgSsl() {
  /* Neon/Supabase verlangen SSL. Über deren Pooler (pgbouncer) lässt sich das
     Zertifikat oft nicht gegen die Root-CAs prüfen -> nicht verifizieren. */
  if (/sslmode=require/.test(DATABASE_URL)) return { rejectUnauthorized: false };
  return undefined;
}

/* Einmalig beim Start: Tabelle anlegen, Daten laden (oder neu anlegen). */
async function init() {
  if (!DATABASE_URL) { ensureDb(); return { backend: "json" }; }
  const { Pool } = require("pg");
  pool = new Pool({ connectionString: DATABASE_URL, ssl: pgSsl(), max: 5 });
  await pool.query(`CREATE TABLE IF NOT EXISTS app_data (
    id         integer PRIMARY KEY,
    data       jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  const res = await pool.query("SELECT data FROM app_data WHERE id = 1");
  if (res.rows.length) {
    cache = res.rows[0].data;
    console.log("🗄️  Postgres verbunden – vorhandene Daten geladen.");
  } else {
    cache = seed();
    await pool.query("INSERT INTO app_data (id, data) VALUES (1, $1)", [JSON.stringify(cache)]);
    console.log("🗄️  Postgres verbunden – Datenbank neu angelegt (Startdaten).");
  }
  return { backend: "postgres" };
}

function load() {
  if (DATABASE_URL) {
    if (!cache) throw new Error("Datenbank noch nicht bereit – bitte gleich erneut versuchen.");
    /* Kopie zurückgeben, damit Änderungen erst mit save() wirken
       (genau wie beim Lesen aus der JSON-Datei). */
    return JSON.parse(JSON.stringify(cache));
  }
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}

function save(db) {
  if (!DATABASE_URL) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); return; }
  cache = JSON.parse(JSON.stringify(db));
  const payload = JSON.stringify(cache);
  const write = async () => {
    let letzterFehler;
    for (let versuch = 1; versuch <= 3; versuch++) {
      try {
        await pool.query(
          `INSERT INTO app_data (id, data, updated_at) VALUES (1, $1, now())
           ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
          [payload]);
        return;
      } catch (e) {
        letzterFehler = e;
        await new Promise(r => setTimeout(r, 250 * versuch));
      }
    }
    console.error("❌ Daten konnten NICHT in die Datenbank geschrieben werden:", letzterFehler && letzterFehler.message);
  };
  /* Schreibvorgänge hintereinander ausführen, damit sie sich nicht überschreiben */
  writeChain = writeChain.then(write, write);
}

function uid(prefix = "id") { return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

/* ============ SEED-DATEN ============
   Frische Installation: nur der Entwickler-Account, alle Listen leer. */
/* Feste ID für den Entwickler-Account.
   Warum: Wird die Datenbank neu angelegt (z. B. weil der Speicher beim
   Hosting flüchtig ist und nach einem Neustart/Deploy leer ist), bekam der
   Account früher jedes Mal eine ZUFÄLLIGE neue ID. Alle ausgestellten
   Sitzungen (JWT enthalten die Benutzer-ID) waren damit sofort ungültig –
   man wurde ohne ersichtlichen Grund abgemeldet. Mit fester ID bleibt die
   Sitzung auch nach einem Datenbank-Reset gültig. */
const ROOT_USER_ID = "u_root";

function seed() {
  const h = pw => bcrypt.hashSync(pw, 10);
  const today = new Date().toISOString().slice(0, 10);
  const users = [
    { id: ROOT_USER_ID, username: "Chris", passwordHash: h("mrpRHVO1"), discord: "@Chris", discordId: "",
      role: "Entwickler", isDeveloper: true, active: true, tokenVersion: 1, createdAt: today },
  ];
  const settings = {
    maintenance: false,
    version: "v1.0",
    versionNote: "Erstveröffentlichung",
    versionDate: today,
    systemStatus: [
      { name: "Webseite", status: "online" },
      { name: "Datenbank", status: "online" },
      { name: "Discord-Bot", status: "online" },
      { name: "Roblox-Schnittstelle", status: "online" },
    ],
  };
  return {
    users,
    players: [],
    warns: [],
    bans: [],
    blacklist: [],
    rights: [],
    logs: [],
    contents: [],
    absences: [],
    notifications: [],
    ipLogs: [],
    shifts: [],
    settings,
  };
}

ensureDb();

module.exports = {
  init, load, save, uid, EBENEN, DEV_EBENE, ebeneOf, levelOf, allRolesOrdered, canEditRole, hasLevel,
  ROOT_USER_ID, DATA_DIR, DB_PATH, DATABASE_URL,
  /* "postgres" = dauerhaft, "json" = Datei (nur mit Disk dauerhaft) */
  backend: DATABASE_URL ? "postgres" : "json",
  /* true, wenn der Speicher ausdrücklich dauerhaft ist:
     externe Datenbank (DATABASE_URL) oder Render-Disk (DATA_DIR).
     false = flüchtiger Containerspeicher: Daten gehen bei Neustart/Deploy verloren. */
  isPersistent: !!(process.env.DATABASE_URL || process.env.DATA_DIR),
  /* Render setzt RENDER=true bzw. RENDER_SERVICE_ID – dann ist der lokale
     Speicher ohne Disk grundsätzlich flüchtig. */
  onRender: !!(process.env.RENDER || process.env.RENDER_SERVICE_ID),
};