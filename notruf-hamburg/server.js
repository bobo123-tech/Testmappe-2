const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const DB = require("./db");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const JWT_SECRET = process.env.JWT_SECRET || "nrhh_super_secret_dev_key_change_me";
const PORT = process.env.PORT || 3000;

/* ============ HELPERS ============ */
function sanitizeUser(u) {
  const { passwordHash, tokenVersion, ...safe } = u;
  return { ...safe, ebene: DB.ebeneOf(u.role).name, level: DB.levelOf(u.role) };
}
function log(db, user, action, target) {
  const d = new Date();
  db.logs.unshift({
    id: DB.uid("l"), user: user.username, role: user.role, action, target: target || "-",
    date: d.toLocaleDateString("de-DE"), time: d.toTimeString().slice(0, 5), ts: Date.now(),
  });
}
function notify(db, userId, message) {
  db.notifications.unshift({ id: DB.uid("n"), userId, message, date: new Date().toLocaleString("de-DE"), read: false });
}

/* ============ AUTH MIDDLEWARE ============ */
function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Nicht angemeldet." });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const db = DB.load();
    const user = db.users.find(u => u.id === payload.uid);
    if (!user || !user.active || user.tokenVersion !== payload.tv) {
      return res.status(401).json({ error: "Session ungültig. Bitte erneut anmelden." });
    }
    req.user = user;
    req.db = db;
    next();
  } catch {
    return res.status(401).json({ error: "Session abgelaufen." });
  }
}
function requireLevel(min) {
  return (req, res, next) => {
    if (!DB.hasLevel(req.user, min)) return res.status(403).json({ error: "Keine Berechtigung für diesen Bereich." });
    next();
  };
}
function requireDev(req, res, next) {
  if (!req.user.isDeveloper) return res.status(403).json({ error: "Nur für Entwickler zugänglich." });
  next();
}
function sweepShifts(db) {
  const now = Date.now();
  let changed = false;
  db.shifts.forEach(s => {
    if (s.status === "active" && now > new Date(s.nextDeadline).getTime()) {
      s.status = "auto_ended";
      s.endTime = s.nextDeadline;
      s.cooldownUntil = new Date(new Date(s.nextDeadline).getTime() + 10 * 60000).toISOString();
      log(db, { username: s.username, role: s.role }, "Schicht automatisch beendet (Inaktivität)", s.username);
      notify(db, s.userId, "⏱️ Deine Schicht wurde automatisch beendet, da du nicht rechtzeitig bestätigt hast.");
      changed = true;
    }
  });
  if (changed) DB.save(db);
}
setInterval(() => sweepShifts(DB.load()), 20000);

/* ============ AUTH ROUTES ============ */
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  const db = DB.load();
  const user = db.users.find(u => u.username.toLowerCase() === (username || "").toLowerCase());
  if (!user || !user.active || !bcrypt.compareSync(password || "", user.passwordHash)) {
    return res.status(401).json({ error: "Benutzername oder Passwort falsch, oder Konto deaktiviert." });
  }
  const token = jwt.sign({ uid: user.id, tv: user.tokenVersion }, JWT_SECRET, { expiresIn: "12h" });
  db.ipLogs.unshift({ id: DB.uid("ip"), userId: user.id, username: user.username, ip: req.ip, device: req.headers["user-agent"] || "Unbekannt", date: new Date().toLocaleString("de-DE") });
  log(db, user, "Login", "-");
  DB.save(db);
  res.json({ token, user: sanitizeUser(user) });
});
app.post("/api/auth/logout", auth, (req, res) => {
  const db = req.db;
  log(db, req.user, "Logout", "-");
  DB.save(db);
  res.json({ ok: true });
});
app.get("/api/auth/me", auth, (req, res) => res.json({ user: sanitizeUser(req.user) }));
app.put("/api/auth/change-password", auth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const db = req.db;
  const u = db.users.find(x => x.id === req.user.id);
  if (!bcrypt.compareSync(oldPassword || "", u.passwordHash)) return res.status(400).json({ error: "Aktuelles Passwort falsch." });
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: "Neues Passwort zu kurz." });
  u.passwordHash = bcrypt.hashSync(newPassword, 10);
  u.tokenVersion++;
  log(db, u, "Passwort geändert", "-");
  DB.save(db);
  const token = jwt.sign({ uid: u.id, tv: u.tokenVersion }, JWT_SECRET, { expiresIn: "12h" });
  res.json({ ok: true, token });
});

/* ============ RANK-INFO (statisch, für Frontend) ============ */
app.get("/api/rank-info", auth, (req, res) => res.json({ ebenen: DB.EBENEN, rolesOrdered: DB.allRolesOrdered() }));

/* ============ TEAM-ÜBERSICHT ============ */
app.get("/api/team", auth, (req, res) => {
  const list = req.db.users.filter(u => u.active).map(sanitizeUser)
    .sort((a, b) => DB.levelOf(b.role) - DB.levelOf(a.role));
  res.json({ team: list });
});

/* ============ BENUTZERVERWALTUNG (Level >= 5) ============ */
app.get("/api/users", auth, requireLevel(5), (req, res) => {
  res.json({ users: req.db.users.map(sanitizeUser) });
});
app.post("/api/users", auth, requireLevel(5), (req, res) => {
  const { username, password, discord, discordId, role } = req.body;
  const db = req.db;
  if (!username || !password || !role) return res.status(400).json({ error: "Pflichtfelder fehlen." });
  if (db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) return res.status(400).json({ error: "Benutzername existiert bereits." });
  if (!DB.canEditRole(req.user, role)) return res.status(403).json({ error: "Du darfst keine gleichrangige/höhere Rolle vergeben." });
  const nu = { id: DB.uid("u"), username, passwordHash: bcrypt.hashSync(password, 10), discord: discord || "-", discordId: discordId || "-", role, active: true, isDeveloper: false, tokenVersion: 1, createdAt: new Date().toISOString().slice(0, 10) };
  db.users.push(nu);
  log(db, req.user, "Benutzer erstellt", username);
  DB.save(db);
  res.json({ user: sanitizeUser(nu) });
});
app.put("/api/users/:id", auth, requireLevel(5), (req, res) => {
  const db = req.db;
  const target = db.users.find(u => u.id === req.params.id);
  if (!target) return res.status(404).json({ error: "Nicht gefunden." });
  if (target.id !== req.user.id && !DB.canEditRole(req.user, target.role)) return res.status(403).json({ error: "Keine Berechtigung für diesen Benutzer." });
  const { username, discord, discordId, role, password } = req.body;
  if (role && role !== target.role) {
    if (!DB.canEditRole(req.user, role)) return res.status(403).json({ error: "Du darfst keine gleichrangige/höhere Rolle vergeben." });
    target.role = role;
  }
  if (username) target.username = username;
  if (discord) target.discord = discord;
  if (discordId) target.discordId = discordId;
  if (password) { target.passwordHash = bcrypt.hashSync(password, 10); target.tokenVersion++; }
  log(db, req.user, "Benutzer bearbeitet", target.username);
  DB.save(db);
  res.json({ user: sanitizeUser(target) });
});
app.post("/api/users/:id/toggle", auth, requireLevel(5), (req, res) => {
  const db = req.db;
  const target = db.users.find(u => u.id === req.params.id);
  if (!target || !DB.canEditRole(req.user, target.role)) return res.status(403).json({ error: "Keine Berechtigung." });
  target.active = !target.active;
  if (!target.active) target.tokenVersion++;
  log(db, req.user, target.active ? "Benutzer aktiviert" : "Benutzer deaktiviert", target.username);
  DB.save(db);
  res.json({ ok: true });
});
app.delete("/api/users/:id", auth, requireLevel(5), (req, res) => {
  const db = req.db;
  const target = db.users.find(u => u.id === req.params.id);
  if (!target || !DB.canEditRole(req.user, target.role)) return res.status(403).json({ error: "Keine Berechtigung." });
  db.users = db.users.filter(u => u.id !== req.params.id);
  log(db, req.user, "Benutzer gelöscht", target.username);
  DB.save(db);
  res.json({ ok: true });
});
app.post("/api/users/:id/force-logout", auth, requireLevel(5), (req, res) => {
  const db = req.db;
  const target = db.users.find(u => u.id === req.params.id);
  if (!target || !DB.canEditRole(req.user, target.role)) return res.status(403).json({ error: "Keine Berechtigung." });
  target.tokenVersion++;
  log(db, req.user, "Session beendet (Force-Logout)", target.username);
  DB.save(db);
  res.json({ ok: true });
});

/* ============ SPIELER ============ */
function findOrCreatePlayer(db, robloxName, extra = {}) {
  let p = db.players.find(x => x.robloxName.toLowerCase() === robloxName.toLowerCase());
  if (!p) {
    p = { id: DB.uid("p"), robloxName, discordName: extra.discordName || "-", discordId: extra.discordId || "-", role: extra.role || "Bürger", createdAt: new Date().toISOString().slice(0, 10) };
    db.players.push(p);
  } else if (extra.role) {
    p.role = extra.role;
    if (extra.discordName) p.discordName = extra.discordName;
    if (extra.discordId) p.discordId = extra.discordId;
  }
  return p;
}
app.get("/api/players", auth, (req, res) => {
  const q = (req.query.q || "").toLowerCase();
  const list = req.db.players.filter(p => !q || p.robloxName.toLowerCase().includes(q) || p.discordName.toLowerCase().includes(q) || p.discordId.includes(q));
  res.json({ players: list });
});
app.post("/api/players", auth, requireLevel(2), (req, res) => {
  const db = req.db;
  const p = findOrCreatePlayer(db, req.body.robloxName, req.body);
  log(db, req.user, "Spieler hinzugefügt", p.robloxName);
  DB.save(db);
  res.json({ player: p });
});
app.get("/api/players/:id", auth, (req, res) => {
  const db = req.db;
  const p = db.players.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "Nicht gefunden." });
  res.json({
    player: p,
    warns: db.warns.filter(w => w.playerId === p.id),
    bans: db.bans.filter(b => b.playerId === p.id),
    blacklist: db.blacklist.filter(b => b.discordId === p.discordId),
  });
});

/* ============ WARNS (Level >= 2) ============ */
app.get("/api/warns", auth, requireLevel(2), (req, res) => {
  const { q = "", date = "" } = req.query;
  const list = req.db.warns.filter(w => (!q || w.player.toLowerCase().includes(q.toLowerCase())) && (!date || w.date === date));
  res.json({ warns: list });
});
app.post("/api/warns", auth, requireLevel(2), (req, res) => {
  const db = req.db;
  const { player, reason, date, time, note } = req.body;
  const pl = findOrCreatePlayer(db, player);
  const w = { id: DB.uid("w"), playerId: pl.id, player, reason, date, time, moderator: req.user.username, note: note || "" };
  db.warns.unshift(w);
  log(db, req.user, "Warn erstellt", player);
  DB.save(db);
  res.json({ warn: w });
});
app.put("/api/warns/:id", auth, requireLevel(2), (req, res) => {
  const db = req.db;
  const w = db.warns.find(x => x.id === req.params.id);
  if (!w) return res.status(404).json({ error: "Nicht gefunden." });
  Object.assign(w, req.body);
  log(db, req.user, "Warn bearbeitet", w.player);
  DB.save(db);
  res.json({ warn: w });
});
app.delete("/api/warns/:id", auth, requireLevel(2), (req, res) => {
  const db = req.db;
  const w = db.warns.find(x => x.id === req.params.id);
  db.warns = db.warns.filter(x => x.id !== req.params.id);
  log(db, req.user, "Warn gelöscht", w?.player || "-");
  DB.save(db);
  res.json({ ok: true });
});

/* ============ BANS (Level >= 2) ============ */
function banStatus(b) {
  if (b.type === "permanent") return "Permanent";
  return new Date() < new Date(b.endDateTime) ? "Aktiv" : "Abgelaufen";
}
app.get("/api/bans", auth, requireLevel(2), (req, res) => {
  const q = (req.query.q || "").toLowerCase();
  const list = req.db.bans.filter(b => !q || b.player.toLowerCase().includes(q)).map(b => ({ ...b, status: banStatus(b) }));
  res.json({ bans: list });
});
app.post("/api/bans", auth, requireLevel(2), (req, res) => {
  const db = req.db;
  const { player, reason, type, startDate, startTime, duration, durationUnit, note } = req.body;
  const pl = findOrCreatePlayer(db, player);
  let endDateTime = null;
  if (type === "temporary") {
    const start = new Date(`${startDate}T${startTime}`);
    const end = new Date(start);
    const d = Number(duration);
    if (durationUnit === "hours") end.setHours(end.getHours() + d);
    else if (durationUnit === "days") end.setDate(end.getDate() + d);
    else if (durationUnit === "weeks") end.setDate(end.getDate() + d * 7);
    else if (durationUnit === "months") end.setMonth(end.getMonth() + d);
    endDateTime = end.toISOString();
  }
  const b = { id: DB.uid("b"), playerId: pl.id, player, reason, type, startDate, startTime, duration: duration || null, durationUnit: durationUnit || null, endDateTime, moderator: req.user.username, note: note || "" };
  db.bans.unshift(b);
  log(db, req.user, "Ban erstellt", player);
  DB.save(db);
  res.json({ ban: { ...b, status: banStatus(b) } });
});
app.delete("/api/bans/:id", auth, requireLevel(2), (req, res) => {
  const db = req.db;
  const b = db.bans.find(x => x.id === req.params.id);
  db.bans = db.bans.filter(x => x.id !== req.params.id);
  log(db, req.user, "Ban aufgehoben", b?.player || "-");
  DB.save(db);
  res.json({ ok: true });
});

/* ============ ARCHIV (Level >= 2) ============ */
app.get("/api/archive", auth, requireLevel(2), (req, res) => {
  const db = req.db;
  const items = [
    ...db.warns.map(w => ({ ...w, kind: "Warn" })),
    ...db.bans.map(b => ({ ...b, kind: "Ban", status: banStatus(b) })),
  ].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  res.json({ items });
});

/* ============ BLACKLIST (Level >= 2) ============ */
app.get("/api/blacklist", auth, requireLevel(2), (req, res) => res.json({ blacklist: req.db.blacklist }));
app.post("/api/blacklist", auth, requireLevel(2), (req, res) => {
  const db = req.db;
  const entry = { id: DB.uid("bl"), ...req.body, addedBy: req.user.username, date: new Date().toISOString().slice(0, 10) };
  db.blacklist.unshift(entry);
  log(db, req.user, "Blacklist-Eintrag erstellt", entry.name);
  DB.save(db);
  res.json({ entry });
});
app.delete("/api/blacklist/:id", auth, requireLevel(3), (req, res) => {
  const db = req.db;
  const e = db.blacklist.find(x => x.id === req.params.id);
  db.blacklist = db.blacklist.filter(x => x.id !== req.params.id);
  log(db, req.user, "Blacklist-Eintrag entfernt", e?.name || "-");
  DB.save(db);
  res.json({ ok: true });
});

/* ============ LEADERBOARD (alle) ============ */
app.get("/api/leaderboard", auth, (req, res) => {
  const db = req.db;
  const counts = {};
  const bump = (name, key) => {
    const u = db.users.find(x => x.username === name);
    counts[name] = counts[name] || { name, role: u?.role || "Unbekannt", warns: 0, bans: 0, total: 0 };
    counts[name][key]++; counts[name].total++;
  };
  db.warns.forEach(w => bump(w.moderator, "warns"));
  db.bans.forEach(b => bump(b.moderator, "bans"));
  const modLB = Object.values(counts).sort((a, b) => b.total - a.total);
  const actCounts = {};
  db.logs.forEach(l => { actCounts[l.user] = actCounts[l.user] || { name: l.user, role: l.role, count: 0 }; actCounts[l.user].count++; });
  const actLB = Object.values(actCounts).sort((a, b) => b.count - a.count);
  res.json({ moderation: modLB, activity: actLB });
});

/* ============ STATISTIK (Level >= 3) ============ */
app.get("/api/stats", auth, requireLevel(3), (req, res) => {
  const db = req.db;
  res.json({
    players: db.players.length,
    activeBans: db.bans.filter(b => banStatus(b) !== "Abgelaufen").length,
    warns: db.warns.length,
    team: db.users.filter(u => u.active).length,
    activeShifts: db.shifts.filter(s => s.status === "active").length,
    blacklist: db.blacklist.length,
  });
});
app.get("/api/dashboard-stats", auth, (req, res) => {
  const db = req.db;
  res.json({
    players: db.players.length,
    activeBans: db.bans.filter(b => banStatus(b) !== "Abgelaufen").length,
    warns: db.warns.length,
    team: db.users.filter(u => u.active).length,
    logs: db.logs.slice(0, 8),
  });
});

/* ============ SCHICHT-SYSTEM ============ */
const CHECK_INTERVAL_MIN = 60;
const COOLDOWN_MIN = 10;

app.get("/api/shifts/mine", auth, (req, res) => {
  sweepShifts(req.db);
  const db = DB.load();
  const mine = db.shifts.filter(s => s.userId === req.user.id).sort((a, b) => b.startTime.localeCompare(a.startTime));
  const active = mine.find(s => s.status === "active");
  const last = mine[0];
  let cooldownRemaining = 0;
  if (!active && last && last.cooldownUntil) {
    cooldownRemaining = Math.max(0, new Date(last.cooldownUntil).getTime() - Date.now());
  }
  res.json({ active: active || null, cooldownRemaining, history: mine.slice(0, 10) });
});
app.post("/api/shifts/start", auth, (req, res) => {
  const db = req.db;
  sweepShifts(db);
  const mine = db.shifts.filter(s => s.userId === req.user.id).sort((a, b) => b.startTime.localeCompare(a.startTime));
  if (mine.some(s => s.status === "active")) return res.status(400).json({ error: "Du hast bereits eine aktive Schicht." });
  const last = mine[0];
  if (last && last.cooldownUntil && new Date(last.cooldownUntil) > new Date()) {
    return res.status(400).json({ error: "Cooldown aktiv. Bitte warte, bevor du eine neue Schicht startest.", cooldownRemaining: new Date(last.cooldownUntil).getTime() - Date.now() });
  }
  const now = new Date();
  const next = new Date(now.getTime() + CHECK_INTERVAL_MIN * 60000);
  const shift = { id: DB.uid("s"), userId: req.user.id, username: req.user.username, role: req.user.role, startTime: now.toISOString(), endTime: null, status: "active", lastConfirm: now.toISOString(), nextDeadline: next.toISOString(), confirmCount: 0, cooldownUntil: null };
  db.shifts.unshift(shift);
  log(db, req.user, "Schicht gestartet", "-");
  DB.save(db);
  res.json({ shift });
});
app.post("/api/shifts/confirm", auth, (req, res) => {
  const db = req.db;
  sweepShifts(db);
  const dbFresh = DB.load();
  const shift = dbFresh.shifts.find(s => s.id === req.body.shiftId && s.userId === req.user.id && s.status === "active");
  if (!shift) return res.status(400).json({ error: "Keine aktive Schicht gefunden (evtl. bereits automatisch beendet)." });
  const now = new Date();
  shift.lastConfirm = now.toISOString();
  shift.nextDeadline = new Date(now.getTime() + CHECK_INTERVAL_MIN * 60000).toISOString();
  shift.confirmCount++;
  log(dbFresh, req.user, "Schicht-Check bestätigt", "-");
  DB.save(dbFresh);
  res.json({ shift });
});
app.post("/api/shifts/end", auth, (req, res) => {
  const db = req.db;
  const shift = db.shifts.find(s => s.userId === req.user.id && s.status === "active");
  if (!shift) return res.status(400).json({ error: "Keine aktive Schicht." });
  const now = new Date();
  shift.status = "ended";
  shift.endTime = now.toISOString();
  shift.cooldownUntil = new Date(now.getTime() + COOLDOWN_MIN * 60000).toISOString();
  log(db, req.user, "Schicht beendet", "-");
  DB.save(db);
  res.json({ shift });
});
app.get("/api/shifts/all", auth, requireLevel(3), (req, res) => {
  sweepShifts(req.db);
  const db = DB.load();
  res.json({ shifts: db.shifts.slice(0, 200) });
});

/* ============ INGAME-RECHTE (Level >= 5) ============ */
app.get("/api/rights", auth, requireLevel(5), (req, res) => res.json({ rights: req.db.rights }));
app.post("/api/rights", auth, requireLevel(5), (req, res) => {
  const db = req.db;
  const { discordName, discordId, robloxName, role } = req.body;
  if (!DB.canEditRole(req.user, role)) return res.status(403).json({ error: "Du darfst keine gleichrangige/höhere Rolle vergeben." });
  const r = { id: DB.uid("r"), discordName, discordId, robloxName, role, assignedBy: req.user.username, date: new Date().toISOString().slice(0, 10) };
  db.rights.unshift(r);
  findOrCreatePlayer(db, robloxName, { discordName, discordId, role });
  log(db, req.user, "Ingame-Recht vergeben", robloxName);
  DB.save(db);
  res.json({ right: r });
});
app.put("/api/rights/:id", auth, requireLevel(5), (req, res) => {
  const db = req.db;
  const r = db.rights.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: "Nicht gefunden." });
  if (!DB.canEditRole(req.user, r.role) || (req.body.role && !DB.canEditRole(req.user, req.body.role)))
    return res.status(403).json({ error: "Keine Berechtigung für diese Rollenstufe." });
  Object.assign(r, req.body);
  findOrCreatePlayer(db, r.robloxName, { discordName: r.discordName, discordId: r.discordId, role: r.role });
  log(db, req.user, "Ingame-Recht geändert", r.robloxName);
  DB.save(db);
  res.json({ right: r });
});
app.delete("/api/rights/:id", auth, requireLevel(5), (req, res) => {
  const db = req.db;
  const r = db.rights.find(x => x.id === req.params.id);
  if (!r || !DB.canEditRole(req.user, r.role)) return res.status(403).json({ error: "Keine Berechtigung." });
  db.rights = db.rights.filter(x => x.id !== req.params.id);
  log(db, req.user, "Ingame-Recht entfernt", r.robloxName);
  DB.save(db);
  res.json({ ok: true });
});

/* ============ LOGS (Level >= 5) ============ */
app.get("/api/logs", auth, requireLevel(5), (req, res) => {
  const q = (req.query.q || "").toLowerCase();
  const list = req.db.logs.filter(l => !q || l.user.toLowerCase().includes(q) || l.action.toLowerCase().includes(q) || (l.target || "").toLowerCase().includes(q));
  res.json({ logs: list });
});

/* ============ SICHERHEIT (Level >= 5) ============ */
app.get("/api/security/sessions", auth, requireLevel(5), (req, res) => res.json({ sessions: req.db.ipLogs.slice(0, 100) }));

/* ============ IP-LOGGER (nur Entwickler) ============ */
app.get("/api/ip-logs", auth, requireDev, (req, res) => res.json({ ipLogs: req.db.ipLogs }));

/* ============ SYSTEM-STATUS ============ */
app.get("/api/system-status", auth, (req, res) => res.json({ status: req.db.settings.systemStatus, maintenance: req.db.settings.maintenance }));
app.put("/api/system-status", auth, requireLevel(5), (req, res) => {
  const db = req.db;
  db.settings.systemStatus = req.body.status || db.settings.systemStatus;
  log(db, req.user, "System-Status geändert", "-");
  DB.save(db);
  res.json({ ok: true });
});

/* ============ EINSTELLUNGEN (Level >= 5) ============ */
app.get("/api/settings", auth, requireLevel(5), (req, res) => res.json({ settings: req.db.settings }));
app.put("/api/settings", auth, requireLevel(5), (req, res) => {
  const db = req.db;
  db.settings.maintenance = !!req.body.maintenance;
  log(db, req.user, "Einstellungen geändert", "Wartungsmodus: " + (db.settings.maintenance ? "An" : "Aus"));
  DB.save(db);
  res.json({ ok: true });
});

/* ============ CONTENT: Ankündigungen / Doku / Handbuch / Regeln / Changelog ============ */
app.get("/api/content/:type", auth, (req, res) => {
  const list = req.db.contents.filter(c => c.type === req.params.type).sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date));
  res.json({ items: list });
});
app.post("/api/content/:type", auth, requireLevel(4), (req, res) => {
  const db = req.db;
  const item = { id: DB.uid("c"), type: req.params.type, title: req.body.title, body: req.body.body, pinned: !!req.body.pinned, author: req.user.username, date: new Date().toISOString().slice(0, 10) };
  db.contents.unshift(item);
  log(db, req.user, "Inhalt erstellt (" + req.params.type + ")", item.title);
  DB.save(db);
  res.json({ item });
});
app.delete("/api/content/:type/:id", auth, requireLevel(4), (req, res) => {
  const db = req.db;
  db.contents = db.contents.filter(c => c.id !== req.params.id);
  log(db, req.user, "Inhalt gelöscht (" + req.params.type + ")", req.params.id);
  DB.save(db);
  res.json({ ok: true });
});

/* ============ BENACHRICHTIGUNGEN ============ */
app.get("/api/notifications/mine", auth, (req, res) => {
  res.json({ notifications: req.db.notifications.filter(n => n.userId === req.user.id).slice(0, 50) });
});
app.post("/api/notifications/read-all", auth, (req, res) => {
  const db = req.db;
  db.notifications.forEach(n => { if (n.userId === req.user.id) n.read = true; });
  DB.save(db);
  res.json({ ok: true });
});

/* ============ ABWESENHEITEN ============ */
app.get("/api/absences", auth, (req, res) => {
  const db = req.db;
  const list = DB.hasLevel(req.user, 3) ? db.absences : db.absences.filter(a => a.userId === req.user.id);
  res.json({ absences: list });
});
app.post("/api/absences", auth, (req, res) => {
  const db = req.db;
  const a = { id: DB.uid("ab"), userId: req.user.id, username: req.user.username, from: req.body.from, to: req.body.to, reason: req.body.reason, status: "pending" };
  db.absences.unshift(a);
  log(db, req.user, "Abwesenheit gemeldet", `${req.body.from} - ${req.body.to}`);
  notify(db, req.user.id, "📤 Deine Abwesenheitsmeldung wurde eingereicht.");
  DB.save(db);
  res.json({ absence: a });
});
app.put("/api/absences/:id", auth, requireLevel(3), (req, res) => {
  const db = req.db;
  const a = db.absences.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: "Nicht gefunden." });
  a.status = req.body.status;
  log(db, req.user, "Abwesenheit " + (req.body.status === "approved" ? "genehmigt" : "abgelehnt"), a.username);
  notify(db, a.userId, `📋 Deine Abwesenheit wurde ${req.body.status === "approved" ? "genehmigt ✅" : "abgelehnt ❌"}.`);
  DB.save(db);
  res.json({ absence: a });
});

app.listen(PORT, () => console.log(`🚨 Notruf Hamburg Verwaltung läuft auf Port ${PORT}`));