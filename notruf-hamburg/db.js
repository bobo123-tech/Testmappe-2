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

/* ============ SEED-DATEN ============ */
function seed() {
  const h = pw => bcrypt.hashSync(pw, 10);
  const users = [
    { id: uid("u"), username: "Chris", passwordHash: h("mrpRHVO1"), discord: "@Chris", discordId: "999999999999999999",
      role: "Entwickler", isDeveloper: true, active: true, tokenVersion: 1, createdAt: "2024-01-01" },
    { id: uid("u"), username: "MaxOwner", passwordHash: h("owner123"), discord: "@MaxOwner", discordId: "100000000000000001",
      role: "Owner", isDeveloper: false, active: true, tokenVersion: 1, createdAt: "2024-01-05" },
    { id: uid("u"), username: "AnnaCoOwner", passwordHash: h("coowner123"), discord: "@AnnaCoOwner", discordId: "100000000000000002",
      role: "Co. Owner", active: true, tokenVersion: 1, createdAt: "2024-01-06" },
    { id: uid("u"), username: "TimProjekt", passwordHash: h("projekt123"), discord: "@TimProjekt", discordId: "100000000000000003",
      role: "Projektleitung", active: true, tokenVersion: 1, createdAt: "2024-02-01" },
    { id: uid("u"), username: "NinaServer", passwordHash: h("server123"), discord: "@NinaServer", discordId: "100000000000000004",
      role: "Serverleitung", active: true, tokenVersion: 1, createdAt: "2024-02-05" },
    { id: uid("u"), username: "PhilManager", passwordHash: h("manager123"), discord: "@PhilManager", discordId: "100000000000000005",
      role: "Manager", active: true, tokenVersion: 1, createdAt: "2024-02-10" },
    { id: uid("u"), username: "SaraTeamleitung", passwordHash: h("team123"), discord: "@SaraTeamleitung", discordId: "100000000000000006",
      role: "Teamleitung", active: true, tokenVersion: 1, createdAt: "2024-02-15" },
    { id: uid("u"), username: "MaxAdmin", passwordHash: h("admin123"), discord: "@MaxAdmin", discordId: "100000000000000007",
      role: "Admin", active: true, tokenVersion: 1, createdAt: "2024-03-01" },
    { id: uid("u"), username: "HeadAdminJan", passwordHash: h("headadmin123"), discord: "@HeadAdminJan", discordId: "100000000000000008",
      role: "Head Administrator", active: true, tokenVersion: 1, createdAt: "2024-03-05" },
    { id: uid("u"), username: "LenaJrMod", passwordHash: h("jrmod123"), discord: "@LenaJrMod", discordId: "100000000000000009",
      role: "Jr. Mod", active: true, tokenVersion: 1, createdAt: "2024-03-15" },
    { id: uid("u"), username: "TomHeadMod", passwordHash: h("headmod123"), discord: "@TomHeadMod", discordId: "100000000000000010",
      role: "Head Mod", active: true, tokenVersion: 1, createdAt: "2024-03-20" },
    { id: uid("u"), username: "LisaSupporter", passwordHash: h("supporter123"), discord: "@LisaSupporter", discordId: "100000000000000011",
      role: "Supporter", active: true, tokenVersion: 1, createdAt: "2024-04-01" },
    { id: uid("u"), username: "TestNeuling", passwordHash: h("test123"), discord: "@TestNeuling", discordId: "100000000000000012",
      role: "Test Supporter", active: true, tokenVersion: 1, createdAt: "2024-04-10" },
  ];
  const players = [
    { id: uid("p"), robloxName: "xXPoliceMaxXx", discordName: "@MaxSpieler", discordId: "200000000000000001", role: "Bürger", createdAt: "2024-03-01" },
    { id: uid("p"), robloxName: "Störenfried99", discordName: "@Chaot99", discordId: "200000000000000002", role: "Bürger", createdAt: "2024-05-02" },
    { id: uid("p"), robloxName: "RegelbrecherX", discordName: "@RegelbrecherX", discordId: "200000000000000003", role: "Bürger", createdAt: "2024-06-01" },
    { id: uid("p"), robloxName: "PolizeiJulia", discordName: "@JuliaPD", discordId: "200000000000000004", role: "Ausbilder", createdAt: "2024-04-20" },
    { id: uid("p"), robloxName: "FeuerLisa07", discordName: "@LisaFire", discordId: "200000000000000005", role: "Bürger", createdAt: "2024-03-05" },
  ];
  const pid = n => players.find(p => p.robloxName === n).id;
  const warns = [
    { id: uid("w"), playerId: pid("Störenfried99"), player: "Störenfried99", reason: "RDM (Random Deathmatch)", date: "2024-07-01", time: "18:20", moderator: "MaxAdmin", note: "" },
    { id: uid("w"), playerId: pid("RegelbrecherX"), player: "RegelbrecherX", reason: "Fail-RP", date: "2024-07-03", time: "20:11", moderator: "LenaJrMod", note: "" },
  ];
  const now = Date.now();
  const bans = [
    { id: uid("b"), playerId: pid("RegelbrecherX"), player: "RegelbrecherX", reason: "Cheating / Exploiting", type: "permanent",
      startDate: "2024-08-01", startTime: "14:00", duration: null, durationUnit: null, endDateTime: null, moderator: "HeadAdminJan", note: "Beweise Ticket #4521" },
    { id: uid("b"), playerId: pid("Störenfried99"), player: "Störenfried99", reason: "Massives RDM nach Verwarnung", type: "temporary",
      startDate: "2024-08-16", startTime: "18:30", duration: 7, durationUnit: "days",
      endDateTime: new Date(new Date("2024-08-16T18:30").getTime() + 7 * 86400000).toISOString(), moderator: "MaxAdmin", note: "" },
  ];
  const blacklist = [
    { id: uid("bl"), name: "ScammerFritz", discordId: "300000000000000001", reason: "Betrug bei Bewerbung / Fake-Angaben", addedBy: "TimProjekt", date: "2024-06-01" },
  ];
  const rights = [
    { id: uid("r"), discordName: "@JuliaPD", discordId: "200000000000000004", robloxName: "PolizeiJulia", role: "Ausbilder", assignedBy: "TimProjekt", date: "2024-04-20" },
  ];
  const logs = [
    { id: uid("l"), user: "MaxAdmin", role: "Admin", action: "Warn erstellt", target: "Störenfried99", date: "01.07.2024", time: "18:20", ts: now - 900000 },
    { id: uid("l"), user: "HeadAdminJan", role: "Head Administrator", action: "Ban erstellt", target: "RegelbrecherX", date: "01.08.2024", time: "14:00", ts: now - 800000 },
    { id: uid("l"), user: "Chris", role: "Entwickler", action: "System initialisiert", target: "-", date: "01.01.2024", time: "00:00", ts: now - 700000 },
  ];
  const contents = [
    { id: uid("c"), type: "announcement", title: "Willkommen im neuen Verwaltungspanel!", body: "Das Notruf Hamburg Verwaltungspanel wurde komplett überarbeitet – mit neuem Design, Backend und Schicht-System.", author: "Chris", date: "2024-08-01", pinned: true },
    { id: uid("c"), type: "handbook", title: "Einstieg als Teammitglied", body: "1. Discord beitreten\n2. Team-Regeln lesen\n3. Schicht starten und stündlich bestätigen\n4. Bei Fragen an die Teamleitung wenden.", author: "Chris", date: "2024-01-01", pinned: false },
    { id: uid("c"), type: "rules", title: "Verhaltensregeln im Team", body: "- Respektvoller Umgang\n- Keine Bevorzugung von Freunden\n- Regelmäßige Schichten\n- Vertraulichkeit von internen Informationen", author: "Chris", date: "2024-01-01", pinned: false },
    { id: uid("c"), type: "document", title: "Bewerbungsleitfaden Team", body: "Alle Infos rund um Bewerbungen findest du im Discord-Kanal #bewerbungen.", author: "TimProjekt", date: "2024-02-01", pinned: false },
    { id: uid("c"), type: "changelog", title: "v1.0 – Release", body: "Erstveröffentlichung des neuen Verwaltungspanels mit Backend, API, Schicht-System und neuer Ebenen-Hierarchie.", author: "Chris", date: "2024-08-16", pinned: false },
  ];
  const absences = [];
  const notifications = [];
  const ipLogs = [];
  const shifts = [];
  const settings = {
    maintenance: false,
    systemStatus: [
      { name: "Webseite", status: "online" },
      { name: "Datenbank", status: "online" },
      { name: "Discord-Bot", status: "online" },
      { name: "Roblox-Schnittstelle", status: "online" },
    ],
  };
  return { users, players, warns, bans, blacklist, rights, logs, contents, absences, notifications, ipLogs, shifts, settings };
}

ensureDb();

module.exports = { load, save, uid, EBENEN, DEV_EBENE, ebeneOf, levelOf, allRolesOrdered, canEditRole, hasLevel };