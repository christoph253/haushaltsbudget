# Haushaltsbudget – Anleitung

Eine Budget-App für das iPhone. Sie läuft im Browser, lässt sich wie eine normale App auf den Home-Bildschirm legen und funktioniert auch offline.
**Alle Daten bleiben auf dem iPhone.** Es gibt keinen Server, kein Konto und keine laufenden Kosten.

---

## 1. Hosting (kostenlos über GitHub Pages)

Die App besteht nur aus Dateien in diesem Ordner. GitHub Pages stellt sie kostenlos unter einer HTTPS-Adresse bereit.

1. Auf github.com ein neues Repository anlegen, z. B. `haushaltsbudget`. Es kann öffentlich sein: Im Repository liegen nur die Programmdateien, nie Dianas Daten.
2. Den Inhalt dieses Ordners hochladen. Der Ordner `tests/` und `werkzeuge/` dürfen mit, sie stören nicht.
3. Im Repository auf **Settings → Pages** gehen und bei „Source“ **Deploy from a branch** wählen, dann `main` und `/ (root)` → **Save**.
4. Nach ein bis zwei Minuten ist die App erreichbar unter
   `https://<benutzername>.github.io/haushaltsbudget/`

**Updates:** Nach jeder Änderung an der App in `sw.js` die Zeile `const VERSION = 'v1';` hochzählen (`v2`, `v3` …).
Nur dann laden die iPhones die neue Fassung. Die Daten auf dem iPhone bleiben dabei erhalten.

## 2. Installation auf dem iPhone

1. Die Adresse in **Safari** öffnen. Andere Browser auf dem iPhone können keine Web-Apps installieren.
2. Unten auf das **Teilen-Symbol** tippen (Quadrat mit Pfeil nach oben).
3. **„Zum Home-Bildschirm“** wählen → **Hinzufügen**.
4. Ab jetzt die App immer über das neue Symbol „Budget“ starten, nicht über Safari.
   Nur in der installierten App bleiben die Daten dauerhaft gespeichert.

Beim ersten Start führt die App durch die Einrichtung: Budgetmonat, Einnahmen, Fixkosten und Sparbetrag.

## 3. Fixkosten aus Kontoauszügen erkennen (Sparkasse)

1. Am Computer im Online-Banking der Sparkasse anmelden.
2. Konto öffnen → **Umsätze** → Zeitraum: die **letzten 13 Monate**.
   Mindestens 12 Monate sind nötig, damit jährliche Zahlungen (z. B. Kfz-Versicherung) erkannt werden.
3. **Exportieren** → Format **„CSV-CAMT V2“** (oder „CSV-MT940“).
4. Die Datei per AirDrop oder Mail aufs iPhone schicken und in „Dateien“ sichern.
5. In der App: **Mehr → Kontoauszüge auswerten** → Datei auswählen.
6. Die Vorschläge prüfen (Name, Betrag, Rhythmus, Kategorie), die passenden anhaken und **übernehmen**.

Die Kontodatei wird nur auf dem iPhone ausgewertet und nicht in der App gespeichert.

## 4. Belegerkennung

„Beleg erfassen“ öffnet Kamera oder Fotomediathek. Die App liest den Text **direkt auf dem iPhone** (Tesseract), also kostenlos und ohne Internet.
Beim allerersten Beleg werden einmalig ca. 9 MB Erkennungsdaten geladen. Danach geht es auch offline.

- **Kassenbon:** Die App sucht Summe, Händler und Datum.
- **Bestellbestätigung (Screenshot):** Die App sucht Gesamtsumme, Shop und Bestelldatum.
- **Banking-App (Screenshot):** Die App erkennt mehrere Umsätze. Diana wählt aus, welche sie übernimmt.

Vor dem Speichern erscheint immer eine Maske, in der Diana die Werte korrigieren kann.
Die Erkennung ist bei sauberen Screenshots gut und bei zerknitterten Bons mäßig. Deshalb sollten die Werte kurz geprüft werden.

**API-Schlüssel:** Für diese kostenlose Variante ist **keiner nötig**.
Eine genauere KI-Erkennung über die Claude-API (wenige Cent pro Beleg) kann später als Option ergänzt werden.

## 5. Datensicherung – wichtig!

Die Daten liegen nur auf dem iPhone. Geht das iPhone verloren oder wird die App gelöscht, sind sie weg, wenn es keine Sicherung gibt.

- Nach jedem Monatsabschluss erinnert die Startseite an die Sicherung.
- **Mehr → Datensicherung & Export → Vollständige Sicherung** → „Teilen“ → **In Dateien sichern** (am besten in iCloud Drive).
- Zum Wiederherstellen: **Mehr → Datensicherung → Sicherungsdatei auswählen**.
- Zusätzlich gibt es den CSV-Export für Excel/Numbers und den PDF-Bericht pro Monat.

## 6. Für Entwickler

- Reine Webdateien ohne Build-Schritt: `index.html`, `css/`, `js/` (ES-Module), `vendor/` (jsPDF, Tesseract.js – lokal, für den Offline-Betrieb).
- Geldbeträge werden intern in Cent (Ganzzahlen) gerechnet.
- Tests: `npm test` (Node 20+). Abgedeckt sind Budgetberechnung, anteilige Fixkosten, Erstattungen, Dubletten, Monatsabschluss, Änderungsprotokoll, PDF-Summen, Sparkasse-CSV und Belegtext.
- Lokale Vorschau: `node werkzeuge/server.mjs` → http://127.0.0.1:8765/
- App-Icons neu erzeugen: `node werkzeuge/icons.mjs`
- `tests/beispiel-sparkasse.csv` enthält erfundene Beispieldaten zum Ausprobieren des Imports.
