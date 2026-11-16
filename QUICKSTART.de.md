# Schnellstart: Travel Route Animator auf deinem Rechner

[English version](QUICKSTART.md)

Mit dem Travel Route Animator baust du Reiserouten als animierte Karten für deine Videos: Zug, Flugzeug, Auto, Rad oder zu Fuß, auf einer 2D-Karte, in 3D oder auf dem Globus. Am Ende kommt eine Videodatei heraus, die du in Premiere Pro, DaVinci Resolve oder einem anderen Schnittprogramm weiterverwendest.

Es gibt zwei Wege, das Tool zu installieren:

| Weg                            | Für wen                                                 | Was du brauchst               |
| ------------------------------ | ------------------------------------------------------- | ----------------------------- |
| **A: Windows-App** (empfohlen) | Alle mit Windows 10 oder 11, ohne Programmierkenntnisse | Einen Download, ein Installer |
| **B: Aus dem Quellcode**       | Mac, Linux, oder wer am Code mitarbeiten will           | Node.js, pnpm, Git, Terminal  |

Die Oberfläche ist auf Deutsch.

---

## Weg A: die Windows-App

### 1. Was du brauchst

- Windows 10 oder 11, 64 Bit
- Etwa 1 GB freien Speicher
- Internet, solange du arbeitest (Karten und Routen kommen aus dem Netz)
- Eine Grafikkarte ist gut fürs Rendern, ein normaler Laptop reicht aber

### 2. Herunterladen

1. Öffne die Seite [Releases](https://github.com/NihadCommits/travel-route-animator/releases/latest).
2. Unter **Assets** lädst du die Datei herunter, die mit `Routen-Animator` beginnt und auf `.exe` endet (etwa 230 MB).

### 3. Installieren

1. Doppelklick auf die heruntergeladene Datei.
2. Windows zeigt wahrscheinlich **„Der Computer wurde durch Windows geschützt“**. Das liegt daran, dass die App nicht kostenpflichtig signiert ist, nicht an einem Virus. Klicke auf **Weitere Informationen** und dann auf **Trotzdem ausführen**.
3. Folge dem Installer. Er braucht keine Admin-Rechte und legt eine Verknüpfung auf den Desktop.

**Blockiert Windows die App ganz, ohne „Trotzdem ausführen“?** Dann ist auf deinem PC die _intelligente App-Steuerung_ (Smart App Control) eingeschaltet, die nur signierte Programme zulässt. Schalte sie bitte nicht aus: Sie lässt sich danach nur durch eine Neuinstallation von Windows wieder einschalten. Nimm stattdessen [Weg B](#weg-b-aus-dem-quellcode).

### 4. Erster Start

1. Starte **Routen-Animator** über die Desktop-Verknüpfung.
2. Die Frage **„Bestehende Projekte übernehmen?“** beantwortest du mit **Nicht jetzt**. Sie ist nur für Leute gedacht, die schon mit der Quellcode-Version gearbeitet haben.
3. In der Projektliste wartet schon die Beispielreise **„Portugal 2026“**. Öffne sie, wähle links eine Etappe und klicke oben auf **Vorschau**. Mit der Leertaste spielst du sie ab.

Die Beispielreise funktioniert ohne jede Anmeldung. Für eigene Reisen lohnen sich zwei kostenlose Keys (nächster Schritt).

### 5. Kostenlose Keys eintragen (empfohlen)

| Key                  | Wofür                                 | Ohne Key                                                                       |
| -------------------- | ------------------------------------- | ------------------------------------------------------------------------------ |
| **openrouteservice** | Echte Routen für Auto, Rad und zu Fuß | Es gibt einen Ausweichdienst (OSRM), aber ohne „Autobahn meiden“ und Ähnliches |
| **MapTiler**         | Satellitenbilder als Karte            | Alle anderen Kartenstile gehen trotzdem                                        |

So bekommst du sie:

- **openrouteservice:** Auf [openrouteservice.org/dev](https://openrouteservice.org/dev/#/signup) registrieren, im Dashboard einen kostenlosen **Standard**-Key (Token) anlegen und kopieren.
- **MapTiler:** Auf [cloud.maptiler.com](https://cloud.maptiler.com/account/keys/) registrieren und unter **API keys** den vorhandenen Key kopieren. Der Gratis-Plan gilt nur für nicht-kommerzielle Nutzung.

Eintragen: In der App **Datei → Einstellungen**, die Keys einfügen, **Speichern**. Windows speichert sie verschlüsselt für dein Benutzerkonto, die App zeigt sie nie wieder an.

Im selben Fenster ist **Kontakt für freie Dienste** optional. Dort kannst du einen Link zu dir eintragen, z. B. dein Instagram- oder GitHub-Profil. Er geht an die kostenlosen Dienste, die darum bitten. Eine E-Mail-Adresse ist nicht nötig.

### 6. Dein erstes eigenes Video

Beispiel: ein Zug von Salzburg nach Wien.

1. In der Projektliste auf **Neues Projekt**, Namen eingeben, **Anlegen**.
2. Links unten auf **+ Gruppe**, Namen eingeben (z. B. „Hinreise“), Enter.
3. Mit der Maus über die Gruppe fahren, auf das **+** klicken, die Etappe benennen (z. B. „Salzburg – Wien“), Enter.
4. Über die Etappe fahren, auf **+** klicken, **Zug** wählen.
5. Rechts unter **Wegpunkte** ins Suchfeld „Salzburg Hbf“ tippen und den Vorschlag wählen. Dann „Wien Hbf“. Die Route erscheint auf der Karte.
6. Die Etappe links anklicken. Rechts stellst du **Dauer der Fahrt**, Ansicht (2D, 3D geneigt, Globus), Kamera und Kartenstil ein.
7. Oben auf **Vorschau**, mit der Leertaste abspielen. Unten in der Timeline kannst du den Balken des Zugs ziehen, um Start und Dauer zu ändern.
8. Oben rechts auf **Rendern**. Unter **Vorlage** z. B. „YouTube 1080p 25p“ oder „Reel 1080×1920 30p“ wählen und **Rendern** klicken.
9. Die Render-Liste zeigt den Fortschritt. Ist das Video fertig, öffnet **Ordner öffnen** den Speicherort. Standard ist `Videos\Routen-Animator`.

Ziehe die MP4-Datei einfach in dein Schnittprogramm.

### 7. Was es sonst noch gibt

| Funktion                                                                 | Wo                                                                                                                                |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Flug mit 3D-Flugzeug über den Globus                                     | Fahrzeug **Flugzeug**, Wegpunkte per Flughafen-Code (`VIE`, `OPO`), Etappe auf **Globus**                                         |
| Mehrere Fahrzeuge oder Routen-Optionen                                   | Weitere Fahrzeuge in dieselbe Etappe; an der Etappe **Als Optionen darstellen**                                                   |
| Aufzeichnung von Uhr, Strava, Garmin, Drohne                             | Beim Fahrzeug-Wählen **Aus Datei importieren (GPX, FIT, DJI) …** (siehe unten)                                                    |
| Fotos und Ortsnamen, die aufpoppen                                       | An der Etappe **Fotos und Orte**: **Foto hinzufügen** (Handyfoto mit Standort) oder **Ort hinzufügen**                            |
| Kilometer, Reisezeit, Höhenmeter, Profil, Geschwindigkeit, Puls, Uhrzeit | An der Etappe unter **Bausteine**: **Baustein hinzufügen**, dann in der Vorschau an seinen Platz ziehen                           |
| Ein Look für alle Einblendungen, Meilen statt Kilometer                  | **Stil der Einblendungen** am Projekt, an einer Gruppe oder Etappe; **Als eigenen Stil speichern …** behält ihn für alle Projekte |
| Kartenlooks, eigenes Theme                                               | **Kartenstil**: Theme wählen oder **Theme bearbeiten …**; Karte **Gelände** oder **Satellit**                                     |
| 3D-Gelände für Berge                                                     | Ansicht **3D geneigt**, **3D-Gelände** einschalten                                                                                |
| Ankunft in 3D, Sturzflug aufs Ziel                                       | An der Etappe **Anfang und Ende**                                                                                                 |
| Ganze Gruppe als ein Video mit Übergängen                                | Gruppe wählen, **Rendern**, **Ganze Gruppe als ein Video**; Übergang an der Gruppe                                                |
| Rückfahrt, Vorlagen                                                      | Rechtsklick auf eine Etappe: **Rückfahrt anlegen**, **Als Vorlage speichern**; unten **Aus Vorlage …**                            |
| Eigenes Bild oder GIF als Fahrzeug                                       | Am Fahrzeug unter **Fahrzeug-Icon**                                                                                               |
| Transparentes Overlay für Premiere                                       | Beim Rendern Vorlage **Overlay ProRes 4444 (transparent)**                                                                        |
| Credits für die Videobeschreibung                                        | Liegen als `.credits.txt` neben jedem Video                                                                                       |

#### Wanderung oder Radtour von Uhr oder App (ab Version 1.2.0)

So kommt eine echte Aufzeichnung mit Zeit, Höhe und Puls ins Tool:

- **Garmin Connect** (im Browser): Aktivität öffnen, Zahnrad oben rechts, **Export Original**. Das ZIP direkt importieren, es muss nicht entpackt werden.
- **Strava** (im Browser): Aktivität öffnen, Menü **…**, **Export Original** (oder **Export GPX**).
- **Komoot und andere Apps:** die Tour als **GPX** herunterladen.

Mit Zeitstempeln fährt das Fahrzeug im echten Tempo (am Fahrzeug unter **Tempo**: „Wie aufgezeichnet“), und an der Etappe lassen sich die Bausteine **Geschwindigkeit**, **Puls** und **Uhrzeit** einblenden. Bei geplanten Routen ohne Aufzeichnung läuft die Uhr ab einer eingetragenen **Abfahrt**.

### 8. Wenn etwas nicht klappt

| Problem                                            | Lösung                                                                                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Die Karte bleibt grau                              | Internetverbindung prüfen; die Karten kommen online von OpenFreeMap                                                                                  |
| Eine Autoroute fehlt oder es erscheint ein Hinweis | openrouteservice-Key eintragen (Schritt 5) oder im Hinweis OSRM wählen                                                                               |
| Satellit ist ausgegraut                            | MapTiler-Key eintragen (Schritt 5)                                                                                                                   |
| Rendern schlägt fehl oder das Video ist schwarz    | **Datei → Einstellungen → Grafik beim Rendern**: einen anderen Eintrag probieren, z. B. `angle-egl` oder `swangle` (langsamer, geht aber fast immer) |
| Einstellungen lassen sich nicht speichern          | Während ein Video rendert, geht das nicht; den Render abwarten                                                                                       |
| Windows blockiert die App                          | Siehe Schritt 3                                                                                                                                      |

### 9. Wo deine Daten liegen

- Projekte: `%APPDATA%\Routen-Animator` (in die Adresszeile des Explorers eintippen)
- Videos: `Videos\Routen-Animator` (änderbar in den Einstellungen)
- Beim Deinstallieren (Windows-Einstellungen → Apps) bleiben Projekte und Videos erhalten.
- Für ein Update lädst du die neue Version von der Releases-Seite und installierst sie drüber.

---

## Weg B: aus dem Quellcode

Für Mac, Linux, oder wenn du am Code mitarbeiten willst. Das Tool läuft dann im Browser. Getestet ist es unter Windows; Mac und Linux sollten gehen, sind aber nicht geprüft.

### 1. Programme installieren (einmalig)

1. **Node.js 24 LTS** von [nodejs.org](https://nodejs.org/) installieren.
2. **Git** von [git-scm.com](https://git-scm.com/) installieren.
3. Ein Terminal öffnen (Windows: „Terminal“ oder „PowerShell“, Mac: „Terminal“) und **pnpm** installieren:

   ```bash
   npm install -g pnpm@12
   ```

### 2. Projekt holen und einrichten

```bash
git clone https://github.com/NihadCommits/travel-route-animator.git
cd travel-route-animator
pnpm install
pnpm data:airports
```

`pnpm install` lädt alle Bausteine (einige Minuten beim ersten Mal), `pnpm data:airports` lädt die Flughafenliste.

Dann die Einstellungsdatei anlegen, unter Windows mit `copy .env.example .env`, auf Mac und Linux mit `cp .env.example .env`. Öffne `.env` mit einem Texteditor und trage bei Bedarf ein:

- `ORS_API_KEY=` dein openrouteservice-Key (siehe Weg A, Schritt 5)
- `MAPTILER_API_KEY=` dein MapTiler-Key für Satellit
- `SERVICE_CONTACT=` optional ein Link zu dir

Die Beispielreise kopierst du nach `data/projects/` (Windows: `xcopy /E /I examples\portugal-2026 data\projects\portugal-2026`, Mac/Linux: `mkdir -p data/projects && cp -r examples/portugal-2026 data/projects/`).

### 3. Starten

```bash
pnpm dev
```

Öffne <http://127.0.0.1:5173> im Browser (Chrome, Edge oder Firefox). Beenden mit `Strg+C` im Terminal. Beim ersten Rendern lädt das Tool einmalig einen eigenen Browser zum Rendern herunter (etwa 100 MB). Die Videos landen im Ordner `output/`.

Ab hier gilt alles aus Weg A ab Schritt 6. Statt **Datei → Einstellungen** gibt es die `.env`-Datei; nach einer Änderung `pnpm dev` neu starten.

### 4. Aktualisieren

```bash
git pull
pnpm install
```

Mehr für Entwicklerinnen und Entwickler steht in der [README](README.md).
