# ASI-402 · MRT Drone Team website

Online interim report for **CDE4301 Innovation & Design Capstone**: a custom quadcopter for aerial reconnaissance and non-visual line-of-sight relay, built by the NUS Mars Rover Team drone subsystem for the University Rover Challenge 2027.

Static site: no framework, no build step, no npm. It runs from GitHub Pages or by opening `index.html`.

## What is on the page

| Section | Interactive pieces |
|---|---|
| 01 Mission | Mission cards, **line-of-sight relay simulator** (drag the rover and drone), requirements, targets against evidence |
| 02 Background | Predecessor review, thrust-loss breakdown, lesson → design response |
| 03 Concept | Design-methodology stepper, 3 kg vs 5 kg mass budget and endurance charts |
| 04 Propulsion | Sizing calculator, motor test-data explorer, **hover-endurance model** with adjustable assumptions |
| 05 Airframe | CAD views with hotspots, **3D frame viewer** with propeller discs |
| 06 Electrical | **Clickable system architecture**, harness tables, pan/zoom wiring diagram, port map, software stack |
| 07 Comms | Signal architecture, **link-budget calculator** for all five link options |
| 08 Testing | Progress pipeline, repeater ping logs, verified-vs-pending table |
| 09 Plan | Challenges, risk matrix (before/after), roadmap, filterable Gantt chart |
| 10 Team | Members and individual areas of work, workstream matrix |
| Appendices | Bill of materials, flight-controller trade study, link inputs, motor data, abbreviations, references |

## Files

```
index.html            Page structure and all prose
styles.css            Theme and layout (colour tokens at the top)
script.js             Navigation, tables, test log, risk matrix, Gantt, team, appendices
js/data.js            EVERY number and table on the site: edit this after each test
js/charts.js          Engineering models, calculators and charts
js/diagrams.js        Relay simulator, architecture map, CAD hotspots, wiring viewer
js/viewer3d.js        WebGL viewer for the frame model
assets/img/           Images used by the page
assets/model/         frame-model.js, the 3D mesh (loaded only on request)
tools/                Local preview server and the STL-to-web converter
```

## Updating content

- **Numbers, tables, parts, risks, Gantt tasks:** edit `js/data.js`. Charts, calculators and tables all read from it, so a value changed there updates everywhere.
- **Sentences and headings:** edit `index.html`.
- **Colours and fonts:** edit the tokens at the top of `styles.css` (`:root`, `.dark`, `.light`).
- **Team photos:** put a square image in `assets/img/` and set `photo` for that member in `js/data.js` (`team` list). Members without a photo show an initial.
- **Evidence tags:** each target and test carries `calc`, `mfr`, `bench` or `pending`. When a test is done, change the tag and the number together.

### Models behind the calculators

- **Endurance:** take-off mass = 2,384 g fixed + 2 × battery mass (the dummy equals the battery). Thrust per motor is looked up in the manufacturer test table by linear interpolation; hover time = usable energy ÷ (4 × motor power + auxiliary load). With the design values this reproduces the sizing calculator: 1,240 g → 21.69 min.
- **Link budget:** received power = TX power + antenna gains − free-space path loss − 2 dB other losses. This reproduces the presentation figures (35.4, 50.9, 13.7, 19.7 and 23.4 dB at 1.2 km).
- **Relay simulator:** illustrative terrain; line of sight is tested against that terrain and margins use the relay link budget.

## Word limit

The brief allows **6,000 words for a four-person group, appendices excluded**. Open the site, press F12, and run this in the console:

```js
siteWordCount()
```

It prints words per section, the total as displayed, and the total with every interactive state included. Data tables under charts and the appendix section are not counted. At hand-over the totals were about 4,150 and 4,800.

## Preview locally

Open `index.html` in a browser. Everything works offline except the web fonts, which fall back to system fonts.

To serve it over `http://localhost` on Windows without installing anything:

```
powershell -ExecutionPolicy Bypass -File tools\preview-server.ps1
```

then open `http://localhost:8123/`.

## Publish with GitHub Pages

1. Create a public repository and upload the contents of this folder to its root.
2. In **Settings → Pages**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
3. The site appears at `https://YOUR-USERNAME.github.io/REPOSITORY-NAME/`.

### Before publishing

- `assets/interim-report.pdf` shows the members' **matriculation numbers** on its cover and is an older draft. The site no longer links to it. Delete it, or replace it with a redacted copy, before the repository goes public.
- `assets/pic_(1).png`, `assets/TEAM LOGO TRANSPARENT (smaller).png` and `assets/team_pics/` are the original uploads. The page uses the optimised copies in `assets/img/`, so the originals can be removed.
- Confirm that everyone pictured or named is happy to appear on a public page.

## Regenerating the 3D model

`assets/model/frame-model.js` is built from `Tarot_TL680A_reference_assembly.stl`:

```
powershell -ExecutionPolicy Bypass -File tools\stl-to-web.ps1 -Stl "path\to\model.stl" -OutJs "assets\model\frame-model.js"
```

The converter welds vertices, quantises positions to 16 bits and writes an indexed mesh. The viewer expects millimetres with Z up, and draws the propeller discs from the constants at the top of `js/viewer3d.js`.

## Caveats

This is an interim design report. Apart from the repeater ping test, every performance figure is a calculation from manufacturer data and is labelled as such on the page. Update the numbers and their evidence tags as bench and flight tests are completed.
