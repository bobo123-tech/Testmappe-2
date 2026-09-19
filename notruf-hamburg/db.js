const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const DATA_DIR = path.join(__dirname, "data");
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

/* ============ DB LOAD/SAVE ============ */
function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify(seed(), null, 2));
}
function load() { return JSON.parse(fs.readFileSync(DB_PATH, "utf-8")); }
function save(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }
function uid(prefix = "id") { return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

/* ============ SEED-DATEN ============
   Frische Installation: nur der Entwickler-Account, alle Listen leer. */
function seed() {
  const h = pw => bcrypt.hashSync(pw, 10);
  const today = new Date().toISOString().slice(0, 10);
  const users = [
    { id: uid("u"), username: "Chris", passwordHash: h("mrpRHVO1"), discord: "@Chris", discordId: "",
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

module.exports = { load, save, uid, EBENEN, DEV_EBENE, ebeneOf, levelOf, allRolesOrdered, canEditRole, hasLevel };