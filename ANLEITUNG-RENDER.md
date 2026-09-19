# 🚀 Dauerhafter Link mit Render.com – Schritt für Schritt

Mit dieser Anleitung bekommst du eine **feste Adresse** für dein Verwaltungspanel, z. B.:

```
https://notruf-hamburg.onrender.com
```

Die Adresse bleibt dauerhaft bestehen – unabhängig davon, ob dein PC an ist.

---

## ⚠️ Wichtig vorab (bitte einmal lesen)

| Thema | Was du wissen musst |
|---|---|
| **Kosten** | Der Free-Tarif kostet **0 €** (kein Abo). Render kann zur Verifizierung eine Kreditkarte verlangen – abgebucht wird im Free-Tarif nichts. |
| **„Schlafen"** | Nach ca. 15 Minuten ohne Besucher schläft der Gratis-Dienst ein. Der **erste Aufruf dauert dann 30–60 Sekunden**, danach läuft es wieder normal. |
| **Datenspeicher** | Im Gratis-Tarif ist der Speicher **flüchtig**: Bei jedem neuen Deploy (Code-Update) startet die Datenbank auf dem Ausgangszustand (nur dein Chris-Account, alles auf 0). Für dauerhafte Speicherung siehe **Schritt 9**. |

---

## Schritt 1 – Code auf `main` bringen (1 Klick)

Auf Render wird der Zweig **`main`** veröffentlicht. Deine Änderungen liegen aktuell auf dem Arbeits-Zweig.

1. Öffne auf GitHub: `https://github.com/bobo123-tech/Testmappe-2/pulls`
2. Öffne den offenen Pull Request **„UI-Verbesserungen, Login-Fix, Nullstand, Version & IP-Logger"**
3. Klicke **Merge pull request** → **Confirm merge**

✅ Danach ist der aktuelle Stand auf `main`. (Ohne diesen Schritt würde Render eine alte Version veröffentlichen.)

---

## Schritt 2 – Konto bei Render anlegen

1. Gehe auf **https://render.com**
2. Klicke oben rechts auf **Get Started** / **Sign Up**
3. Wähle **GitHub** als Anmeldung
4. Bestätige den Zugriff auf dein GitHub-Konto (Häkchen bei *Public repositories* reicht, wenn dein Repo öffentlich ist)

---

## Schritt 3 – Blueprint anlegen (empfohlen, einfachster Weg)

Im Repo liegt bereits die Datei **`render.yaml`** – Render liest alle Einstellungen automatisch daraus.

1. Im Render-Dashboard: Klick auf **New +** (oben rechts) → **Blueprint**
2. Repository auswählen: **`bobo123-tech/Testmappe-2`** → **Connect**
3. Render zeigt jetzt den Dienst **`notruf-hamburg`** an → Klick auf **Apply** / **Create**

Render baut und startet das Panel jetzt automatisch (Dauer: ca. 2–4 Minuten).

---

## Schritt 3b – Alternative: manuell anlegen (falls Blueprint nicht klappt)

1. **New +** → **Web Service** → Repository `bobo123-tech/Testmappe-2` → **Connect**
2. Diese Werte eintragen:

| Feld | Wert |
|---|---|
| Name | `notruf-hamburg` |
| Region | `Frankfurt (EU Central)` |
| Branch | `main` |
| **Root Directory** | `notruf-hamburg` |
| Runtime | `Node` |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type | `Free` |
| Health Check Path | `/api/health` |

3. **Environment Variables** anlegen (Abschnitt *Advanced* aufklappen):
   - `JWT_SECRET` → **Generate** klicken (Render erzeugt einen Zufallswert)
   - `NODE_VERSION` → `22.11.0`
4. **Create Web Service** klicken

---

## Schritt 4 – Warten, bis der Status grün ist

Im Render-Dashboard siehst du oben den Status:

- **Building** → wird gerade gebaut
- **Live** ✅ → fertig, die Seite ist erreichbar

Oben steht deine Adresse, z. B.:

```
https://notruf-hamburg.onrender.com
```

Klicke darauf – oder kopiere sie in deinen Browser (auch auf dem Handy).

---

## Schritt 5 – Anmelden und Passwort ändern

1. Öffne deine neue Adresse
2. Anmelden mit:
   - **Benutzername:** `Chris`
   - **Passwort:** `mrpRHVO1`
3. ⚠️ **Sofort das Passwort ändern:** Menü links → **Passwort ändern**
   (Das Startpasswort steht offen im Internet – das solltest du auf jeden Fall ersetzen.)

---

## Schritt 6 – Eigene Adresse testen

- Alles funktioniert genau wie in der Vorschau: Dashboard, Warns, Bans, Benutzerverwaltung, IP-Logger usw.
- Der **IP-Logger** zeigt jetzt die **echten Besucher-IPs** deiner Teammitglieder an (nur du siehst ihn).
- Unten auf jeder Seite: `Entwickelt von Christopher · © 2026 Notruf Hamburg · Version v1.0`

**Tipp:** Ersten Besucher nach der Ruhephase nicht wundern – der erste Aufruf kann bis zu einer Minute dauern (Dienst wacht auf). Danach ist alles schnell.

---

## Schritt 7 – Updates veröffentlichen (Version & Changelog)

Wenn du etwas am Code änderst (oder ich für dich):

1. Änderung landet auf `main` (per Pull Request mergen)
2. Render merkt das automatisch und baut neu → nach ca. 2 Minuten ist es live

**Versionsnummer im Panel:** Öffne **Entwickler-Protokoll** (Changelog) → **Neuer Eintrag** → veröffentlichen.
Die Version springt dann automatisch hoch: `v1.0 → v1.01 → v1.02 …` und wird überall angezeigt (Fußzeile, Sidebar, Browser-Tab).
Manuell setzen kannst du sie dort auch über den Button **„Version setzen"**.

---

## Schritt 8 – Zugriff schützen (sehr wichtig!)

Der Free-Tarif erlaubt jedem, deine Adresse aufzurufen (die Anmeldung schützt die Inhalte, aber die Login-Seite ist öffentlich sichtbar).

Wenn du das nicht willst:

- **Render → dein Dienst → Settings → Access Control** → auf **„Password protected"** stellen
- Dann fragt Render **vor** der Seite schon nach einem zweiten Passwort.

Damit kann niemand mehr die Login-Seite sehen, ohne vorher das Render-Passwort zu kennen.

---

## Schritt 9 – Daten dauerhaft speichern (optional, kostenpflichtig)

Ohne diesen Schritt werden Warns, Bans, Benutzer usw. bei jedem Deploy zurückgesetzt.

1. Render → dein Dienst → **Settings** → Plan auf **Starter** wechseln (ca. 7 $/Monat)
2. **Disks** → **Add Disk** → Name `notruf-hamburg-data`, **Mount Path** `/var/data`, Größe `1 GB`
3. **Environment** → **Add Environment Variable**:
   - Key: `DATA_DIR`
   - Value: `/var/data`
4. **Save** → der Dienst startet neu und legt die Datenbank automatisch in `/var/data` ab.

Ab jetzt überleben alle Daten (Benutzer, Warns, Bans, IP-Logs, Changelog) jeden Deploy und Neustart.

*(Alternativ: Ich baue dir später eine echte Datenbank an – sag einfach Bescheid.)*

---

## Schritt 10 – Eigener Name statt „onrender.com" (optional)

1. Render → dein Dienst → **Settings** → **Custom Domains** → **Add Custom Domain**
2. Trage deine Domain ein, z. B. `panel.notruf-hamburg.de`
3. Render zeigt dir einen **CNAME-Eintrag** – diesen bei deinem Domain-Anbieter (z. B. IONOS, Namecheap) eintragen
4. Nach ein paar Minuten ist deine eigene Adresse aktiv (kostenlos)

---

## ❗ Häufige Probleme

| Problem | Lösung |
|---|---|
| „Build failed" | Prüfe, ob **Root Directory** auf `notruf-hamburg` steht und Branch `main` gewählt ist |
| Seite lädt lange | Normal im Free-Tarif (Dienst schläft nach 15 Min. Inaktivität ein) – einfach warten |
| „Sitzung abgelaufen" nach Deploy | Nach einem Deploy neu anmelden – durch neues `JWT_SECRET` wird die alte Sitzung ungültig |
| Alle Daten weg | Free-Tarif hat flüchtigen Speicher → **Schritt 9** durchführen |
| Gesundheitsprüfung schlägt fehl | Health Check Path muss `/api/health` sein |

---

## 📋 Kurzfassung (wenn du es eilig hast)

1. GitHub → PR mergen auf `main`
2. render.com → mit GitHub anmelden
3. **New + → Blueprint** → Repo `Testmappe-2` wählen → **Apply**
4. Warten bis **Live** ✅
5. Adresse öffnen → Login `Chris` / `mrpRHVO1` → **Passwort ändern**

Fertig! 🎉
