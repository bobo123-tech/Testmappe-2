# 🗄️ Daten dauerhaft speichern – kostenlose Datenbank einrichten

Ohne diesen Schritt sind **Benutzer, Warns, Bans, Rechte und Logs nach jedem
Neustart oder Deploy wieder weg**. Der Grund: Render Free hat einen *flüchtigen*
Speicher – alles, was der Dienst nach dem Start schreibt, verschwindet beim
nächsten Neustart. Disks (Festplatten) gibt es bei Render erst im Bezahlplan.

Die Lösung: eine **externe Datenbank**, die unabhängig von Render läuft.
Das Panel unterstützt dafür Postgres (z. B. **Neon** oder **Supabase**).

Kosten: **0 €**, keine Kreditkarte nötig.

---

## ⚠️ Kurz erklärt

| Thema | Wert |
|---|---|
| Kosten | 0 € (Free-Plan, keine Kreditkarte) |
| Speicher | 0,5 GB pro Projekt – für ein Team-Panel weit mehr als genug |
| Rechenzeit | 100 CU-Stunden/Monat, Datenbank schläft nach 5 Min. ohne Zugriff ein |
| Auswirkung | Erste Abfrage nach der Ruhephase dauert ~1 Sekunde länger |

Quelle: [Neon Plans (offizielle Doku)](https://neon.com/docs/introduction/plans)

---

## Schritt 1 – Konto bei Neon anlegen

1. Gehe auf **https://neon.com** und klicke auf **Sign Up**
2. Am einfachsten: mit **GitHub** anmelden (gleiches Konto wie dein Repo)
3. Wenn nach einem Projekt-Namen gefragt wird: `notruf-hamburg`
4. Region auswählen: **AWS Frankfurt (eu-central-1)** – das ist am nächsten an deinem Render-Dienst

## Schritt 2 – Verbindungszeichenkette kopieren

1. Nach dem Anlegen zeigt Neon direkt die Seite **Connection Details** an
2. Wähle dort **Pooled connection** (steht meist schon so da)
3. Klicke auf das Kopieren-Symbol bei **Connection string**

Die Zeichenkette sieht so aus:

```
postgresql://neondb_owner:npg_XXXXXXXXXXXX@ep-irgendwas-abc12345-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

⚠️ **Diese Zeichenkette ist ein Passwort.** Nicht weitergeben, nicht in den Chat,
nicht in eine E-Mail.

## Schritt 3 – Bei Render eintragen

1. Öffne dein Render-Dashboard → Dienst **mrp-notruf-hamburg**
2. Links im Menü: **Environment**
3. **Add Environment Variable**:
   - **Key:** `DATABASE_URL`
   - **Value:** die kopierte Verbindungszeichenkette (komplett, inkl. `?sslmode=require`)
4. **Save Changes** → Render startet den Dienst automatisch neu

## Schritt 4 – Prüfen, ob es funktioniert

1. Panel öffnen und anmelden (`Chris`)
2. Im Dashboard darf **kein oranges Warnbanner** mehr erscheinen
   („Daten gehen bei jedem Neustart verloren")
3. Alternativ: `https://deine-adresse.onrender.com/api/health` aufrufen –
   dort muss stehen:

```json
{"ok":true,"storage":{"backend":"postgres","persistent":true,"atRisk":false}}
```

Steht dort `"backend":"json"`, ist `DATABASE_URL` nicht angekommen
(Tippfehler, nicht gespeichert, Dienst nicht neu gestartet).

## Schritt 5 – Testen

1. Lege einen Test-Benutzer an
2. Render-Dashboard → **Manual Deploy** → **Deploy latest commit** (oder einfach 20 Minuten warten)
3. Panel neu laden → **der Test-Benutzer muss noch da sein** ✅

---

## ❗ Häufige Probleme

| Problem | Lösung |
|---|---|
| Banner „Daten gehen bei jedem Neustart verloren" bleibt | `DATABASE_URL` fehlt oder Dienst wurde nicht neu gestartet |
| Dienst startet nicht mehr, Log: „Datenbank konnte nicht gestartet werden" | Verbindungszeichenkette prüfen – vollständig kopiert? `?sslmode=require` am Ende vorhanden? |
| Panel lädt beim ersten Aufruf langsam | Normal: sowohl Render Free als auch Neon schlafen nach kurzer Inaktivität ein |
| „Benutzername oder Passwort falsch" nach der Umstellung | Die Datenbank wurde neu angelegt → Startpasswort `mrpRHVO1` gilt wieder, danach sofort ändern |

---

## 🔄 Von der JSON-Datei zur Datenbank wechseln

Beim ersten Start mit `DATABASE_URL` legt das Panel die Tabelle `app_data` selbst
an und schreibt die Startdaten hinein (nur dein Chris-Account).

**Wichtig:** Bestehende Daten aus der JSON-Datei werden dabei **nicht**
automatisch übernommen – sie wären beim letzten Render-Neustart ohnehin schon
verloren gewesen. Lege Teammitglieder nach der Umstellung einmal neu an; ab dann
bleiben sie dauerhaft erhalten.

---

## 🧪 Für Neugierige: Wie es technisch funktioniert

- Ohne `DATABASE_URL` verhält sich das Panel exakt wie vorher (JSON-Datei unter
  `notruf-hamburg/data/db.json`).
- Mit `DATABASE_URL` werden alle Daten in einer einzigen Zeile der Tabelle
  `app_data` (Spalte `data`, Typ `jsonb`) gespeichert.
- Beim Start wird diese Zeile gelesen und im Arbeitsspeicher gehalten; jede
  Änderung wird sofort zurückgeschrieben (mit 3 Versuchen, falls die Verbindung
  kurz weg ist).
- Vorteil: keine Code-Umstellung nötig, alle bestehenden Funktionen laufen
  unverändert. Eine Aufteilung in echte Tabellen (Benutzer, Warns, Bans …) ist
  später möglich, falls du mal Auswertungen direkt in der Datenbank machen willst.
