# CLAUDE.md — Workflow Orchestration & Guidelines

Diese Datei definiert die dauerhaften Prozesse für Planung, Ausführung und Qualitätssicherung.
Zeitgebundene Inhalte (Roadmap, Strategie, Gates) leben in `tasks/todo.md` — nicht hier.

---

## 0. Wissensbasis & Zuständigkeiten (ZUERST LESEN)

**Pflicht zu Session-Beginn, in dieser Reihenfolge lesen:**

1. `CLAUDE.md` (diese Datei) — dauerhafte Prozesse und Regeln
2. `Brain.md` — Projektgedächtnis: Vision, Tech-Stack, Architektur, gelöste Probleme, Umgebungs-Einschränkungen (z. B. lokale Entwicklung vs. Sandbox/CI)
3. `tasks/lessons.md` — wiederkehrende Fehler-Muster und daraus abgeleitete Regeln
4. `tasks/todo.md` — aktueller Master-Plan, Roadmap, bindende Gates

**Scharfe Abgrenzung der drei Wissensdateien:**

| Datei | Enthält | Enthält NICHT |
|---|---|---|
| `CLAUDE.md` | Dauerhafte Prozesse, Konventionen, Stopp-Regeln | Projekt-Fakten, Roadmap-Details |
| `Brain.md` | Fakten & Historie: Architektur, Entscheidungen, gelöste Bugs | Prozessregeln, To-dos |
| `tasks/lessons.md` | Verhaltens-Lektionen als nummerierte Regeln (`L#`) | Fakten, Pläne |

**Update-Protokoll für `Brain.md`:**
- Nach jeder nennenswerten Änderung, jedem gelösten Bug und jeder Architektur-Entscheidung den passenden Abschnitt aktualisieren und das „Letzte Aktualisierung"-Datum setzen.
- Eintrags-Format: `[YYYY-MM-DD] [Typ: Bug | Entscheidung | Fortschritt] — max. 5 Zeilen. Bei Bedarf Link auf Commit/Datei statt langer Erklärung.`
- Anti-Aufbläh-Regel: Gelöste Probleme, die älter als 3 Monate und nicht mehr relevant sind, in `Brain-Archiv.md` verschieben. `Brain.md` soll unter ~500 Zeilen bleiben.

---

## 1. Konfliktauflösung (Prioritäten-Hierarchie)

Wenn Regeln kollidieren, gilt diese Rangfolge (höher schlägt tiefer):

1. **Sicherheit & Datenintegrität** (Abschnitt 5: Stopp-Regeln)
2. **Bindende Gates** aus `tasks/todo.md`
3. **Verifizierung / Beweispflicht** (Abschnitt 3)
4. **Autonomie** (eigenständiges Bug-Fixing)
5. **Geschwindigkeit / Effizienz**

Beispiel: „Autonomous Bug Fixing" erlaubt eigenständiges Handeln — aber nie bei Operationen aus Abschnitt 5, und nie an einem bindenden Gate vorbei.

---

## 2. Workflow Orchestration

### 2.1 Plan Mode Default
- **Trigger:** Plan-Modus ist Pflicht bei Aufgaben mit **3+ Schritten**, bei **Architektur-Entscheidungen** oder wenn **mehr als 3 Dateien** geändert werden.
- **Re-Planning-Trigger:** Nach **spätestens 2 fehlgeschlagenen Versuchen desselben Ansatzes** STOPPEN und neu planen — nicht weiter probieren.
- **Verifizierung:** Auch Verifizierungsschritte gehören in den Plan, nicht nur der Aufbau.
- **Spezifikationen:** Bei unklaren Anforderungen zuerst eine kurze Spec schreiben (Was, Warum, Akzeptanzkriterien), dann implementieren.

### 2.2 Subagent Strategy
- **Trigger:** Subagent verwenden, wenn eine Recherche/Exploration voraussichtlich **mehr als 5 Dateien** berührt oder das Ergebnis nur eine Zusammenfassung sein soll (Context-Hygiene).
- **Ein Subagent = eine Aufgabe.** Keine Sammel-Aufträge.
- **Parallelisierung:** Unabhängige Analysen parallel an mehrere Subagents delegieren.
- **Ergebnis-Format:** Subagents liefern eine kompakte Zusammenfassung + Datei-/Zeilen-Referenzen, keinen Rohtext.

### 2.3 Self-Improvement Loop
- **Trigger:** Nach **jeder Korrektur durch den User** prüfen: Ist das ein wiederholbares Muster? Wenn ja → als neue Regel `L#` in `tasks/lessons.md` (Format: `L# [Datum] — Regel in einem Satz. Kontext in max. 2 Sätzen.`).
- **Review:** Zu Session-Beginn die für die aktuelle Aufgabe relevanten `L#`-Regeln aktiv anwenden.
- **Iteration:** Wenn dieselbe Lektion 2× verletzt wurde, die Regel umformulieren (offenbar war sie nicht klar genug).

### 2.4 Demand Elegance (Balanced)
- **Trigger:** Bei nicht-trivialen Änderungen (siehe 2.1) vor dem Präsentieren einmal fragen: „Gibt es einen eleganteren Weg?"
- **Anti-Hacky:** Fühlt sich ein Fix unsauber an → mit dem jetzigen Wissen die saubere Lösung implementieren, nicht den Workaround behalten.
- **Pragmatismus:** Einfache, offensichtliche Fixes (1 Datei, < 10 Zeilen) nicht over-engineeren.

### 2.5 Autonomous Bug Fixing
- **Eigenständigkeit:** Bug-Reports direkt diagnostizieren (Logs, Fehler, fehlschlagende Tests) und beheben — ohne Rückfragen, solange kein Punkt aus Abschnitt 5 berührt wird.
- **Zero Context Switching:** Der User muss keinen Kontext liefern, der aus Code/Logs/`Brain.md` ableitbar ist.
- **CI-Pflege:** Fehlschlagende CI-Tests ohne Aufforderung reparieren (Ausnahme: Fix erfordert Operation aus Abschnitt 5 → nachfragen).

### 2.6 Agentic Loops
Bei Aufgaben mit **messbarem, binärem Erfolgs-Kriterium** wird selbstständig iteriert, bis der Beweis erbracht ist — statt nach einem Versuch mit Teilergebnis zurückzukommen.

**Erlaubte Standard-Loops:**
- **Test-Fix-Loop:** Tests ausführen → Fehler analysieren → fixen → erneut ausführen. Exit: alle Tests grün.
- **Build/Lint-Loop:** Analog für Compile-, Typecheck- und Lint-Fehler. Exit: Befehl läuft fehlerfrei durch.
- **Verifikations-Loop:** Nach jeder Änderung die Definition of Done (Abschnitt 3) durchlaufen. Jeder nicht erfüllte Punkt startet eine neue Iteration statt einer Rückfrage. Exit: alle DoD-Punkte erfüllt.

**Bindende Loop-Regeln:**
1. **Exit-Kriterium zuerst:** Vor Loop-Start das messbare Erfolgs-Kriterium in einem Satz festhalten. Kein binäres Kriterium → kein Loop (dann normaler Plan-Modus gem. 2.1).
2. **Iterations-Limit:** Max. **5 Durchläufe** pro Loop. Danach greift die Re-Planning-Regel aus 2.1: STOPPEN, Ansatz neu bewerten, ggf. User informieren — nicht weiter probieren.
3. **Scope-Sperre:** Innerhalb eines Loops wird nur am ursprünglichen Problem gearbeitet. Keine Drive-by-Refactorings, keine „während ich hier bin"-Änderungen (Minimal Impact, Abschnitt 6).
4. **Regressions-Schutz:** Macht eine Iteration mehr kaputt als sie fixt (mehr rote Tests als vorher), wird sie rückgängig gemacht, bevor die nächste startet.
5. **Stopp-Regeln gelten weiter:** Loops laufen **nie** über Abschnitt-5-Operationen. Erfordert der Fix z. B. eine Migration oder eine Berechtigungs-Änderung → Loop abbrechen und nachfragen, nicht „autonom" durchdrücken, um das Exit-Kriterium zu erreichen.
6. **Kein Loop auf subjektive Ziele:** „Eleganter machen", „Architektur verbessern" o. Ä. sind keine Loop-Ziele — Eleganz bleibt ein einmaliger Check (2.4).

**Abschluss-Protokoll:** Nach Loop-Ende kurz dokumentieren: Anzahl Iterationen, was der Knackpunkt war, finaler Beweis (Test-Output/Log). Bei auffälligen Mustern → `tasks/lessons.md` (2.3).

---

## 3. Definition of Done (Beweispflicht)

Eine Aufgabe ist erst DONE, wenn **alle** Punkte erfüllt sind:

- [ ] Tests grün: `npm test` (Vitest, Suites unter `test/`)
- [ ] Lint/Typecheck sauber: `npm run lint` und `npx tsc --noEmit`
- [ ] Verhalten demonstriert (Log-Auszug, Test-Output oder Screenshot — Behauptung genügt nicht)
- [ ] Diff gegen Main geprüft: keine unbeabsichtigten Änderungen, minimaler Impact
- [ ] `tasks/todo.md`: Item abgehakt, Review-Sektion ergänzt
- [ ] `Brain.md` aktualisiert (falls nennenswerte Änderung, Bug oder Entscheidung)
- [ ] Qualitäts-Check bestanden: „Würde ein Staff-Engineer das so absegnen?"

> **Hinweis:** Die konkreten Befehle oben einmalig aus dem tatsächlichen Stack eintragen, damit nichts interpretiert werden muss.

---

## 4. Task Management

1. **Plan First:** Plan in `tasks/todo.md` als Checklisten-Items anlegen.
2. **Verify Plan:** Plan vor Implementierung kurz vom User bestätigen lassen (entfällt bei trivialen Fixes gem. 2.4).
3. **Track Progress:** Items während der Bearbeitung abhaken.
4. **Explain Changes:** High-Level-Zusammenfassung pro Schritt (1–3 Sätze, kein Roman).
5. **Document Results:** Review-Sektion in `tasks/todo.md` ergänzen.
6. **Capture Lessons:** `tasks/lessons.md` nach Korrekturen aktualisieren (siehe 2.3).

---

## 5. Stopp-Regeln — IMMER nachfragen bei:

Diese Operationen werden **nie autonom** ausgeführt, unabhängig von allen anderen Regeln:

- **Datenbank-Migrationen** und Schema-Änderungen in Prod/Staging
- **Destruktive Operationen** (Löschen von Daten, `DROP`, `force push`, Überschreiben von Historie)
- **Änderungen an Authentifizierung, Autorisierung oder Berechtigungen** (Access Control, Security-Policies, Rollen — jede solche Änderung braucht explizites Review)
- **Deployments** nach Staging oder Prod
- **Dependency-Upgrades** (Major-Versionen) und neue Abhängigkeiten
- **Alles mit Zahlungs-, Finanz- oder regulatorischem Bezug** (Transaktionen, Compliance-Anforderungen, gesetzliche Fristen — projektspezifisch ergänzen)
- **Externe Kommunikation** (E-Mails, API-Calls an Dritte mit Seiteneffekten)

Format der Rückfrage: Kurz beschreiben **was**, **warum**, **welches Risiko** — dann auf Freigabe warten.

---

## 6. Core Principles & Konventionen

- **Simplicity First:** Jede Änderung so einfach wie möglich. Minimaler Code-Impact.
- **No Laziness:** Ursachenforschung statt Symptom-Fixes. Keine temporären Workarounds ohne Ticket. Senior-Developer-Standards.
- **Minimal Impact:** Nur das Notwendige ändern. Keine Drive-by-Refactorings ohne Absprache.

**Sprach- und Stil-Konventionen (einmalig festlegen und dann konsistent):**
- Code-Kommentare: `<Deutsch | Englisch — FESTLEGEN>`
- Commit-Messages: `<Deutsch | Englisch — FESTLEGEN>`, Format: `<z. B. Conventional Commits — FESTLEGEN>`
- Doku (`Brain.md`, `tasks/*`): `<Sprache — DEUTSCH>`
- Verbotene Muster: `<z. B. keine any-Types, kein direkter Prod-DB-Zugriff — ERGÄNZEN>`

---

## 7. Aktiver Master-Plan (Verweis)

- **Dauerhafte Regel:** Der jeweils aktuelle Master-Plan, die Strategie-Referenz und alle bindenden Gates stehen in `tasks/todo.md` (eigener, klar benannter Roadmap-Abschnitt). **Die dortigen Gates sind bindend** (Priorität 2 gem. Abschnitt 1).
- Zeitgebundene Details (Horizonte, Reihenfolgen, Dokument-Pfade) werden **nur dort** gepflegt, damit diese Datei stabil bleibt.
