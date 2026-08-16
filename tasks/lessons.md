# tasks/lessons.md — Verhaltens-Lektionen

L1 [2026-07-08] — Bei „App zeigt nichts an"-Bugs zuerst Server (HTTP direkt via curl) und WebView getrennt verifizieren, bevor am Timing geschraubt wird. Der Server war hier von Anfang an gesund; wer nur Logs liest, sucht am falschen Ende.

L2 [2026-07-08] — `window.location.reload()` ist nach einer fehlgeschlagenen WKWebView-Erstnavigation wirkungslos (leerer Kontext); Wiederherstellung immer über explizite Ziel-URL (`location.replace` / Rust `navigate()`).

L3 [2026-07-08] — Vor jedem Weißbild-/Portproblem prüfen, ob mehrere installierte App-Kopien parallel laufen (`ps aux | grep forensproto`, `lsof -i:38217`) — zwei BUNDLED-Instanzen killen sich gegenseitig die Server.
