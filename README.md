# EUB Changes Web

Import or write a chord chart, adjust the harmony, preview it over MIDI, and send the resulting parts to Digitone II or Emiuet Session FM-1. Charts and settings are stored in IndexedDB. Export a backup to move between browsers.

## Build and verify

Use Node 24, npm, Python 3.11+ and Git. Place checkouts of emnyeca/changes and emnyeca/digitone-syx-toolkit beside this repository. The build reads these Git objects directly, regardless of the checked-out branches.

| Project | Reference |
| --- | --- |
| Changes | f01e7923fd8b2cb394e8f478db673f96ef753156 |
| digitone-syx-toolkit v0.1.0 | c162be40f8fd7e6938b39dd7e108a35958050a51 |
| fm1-base Companion client | 7337375c15e9db26f23b0c68a1db61429add2f48 |

Run npm ci, then npm run build. The first build downloads a PyYAML wheel and verifies its SHA-256 against the installed Pyodide lock. Serve dist with python -m http.server 5186 --bind 127.0.0.1 --directory dist. For development, npm run dev -- --port 5186 and the VS Code tasks use the same staging script.

With Chrome installed and the app running, run node verify.mjs, node verify-studio.mjs and node parity.mjs. For parity, set PYTHON to the desktop Python executable with the pinned Changes and toolkit installed. On Windows the default is the sibling Changes virtual environment. APP_URL selects another running build. Run node verify-midi.mjs to compare framed messages with the existing BASE_EMPTY.syx. With the updated private firmware emulator served separately, set FM_EMU and run node verify-fm.mjs.

## Desktop compatibility and verification

| Workflow | Web implementation and evidence |
| --- | --- |
| Import | MusicXML, ZIP, paired MIDI metadata, iReal Pro song and playlist, and links to the six named playlists. The same iReal converter (2.1.1) runs locally. Chrome verified two numbered playlist titles remain separate. |
| Library | Search, select, rename, edit chords, delete, restore backup, and persist language. A fresh Chrome profile restored an exported library. |
| Compose | Text entry uses the desktop editor model with bar lines, section boundaries and repeat tokens. |
| Arrangement | Cloud, Bass and Chord share the desktop renderer, six-voice graph, track routing, centers, spread, triggers, section filter, transpose and pattern-change policy. |
| Pattern export | The desktop Linear Auto Split and Bundle by Section planners supply the names, timing and steps. Browser and native Python matched the parsed model, notes, graph, plan and every SysEx byte for a four-bar chart, a routed and transposed section, and a 40-bar chart split at steps 120/121. |
| Preview and USB | Web MIDI, explicit port selection, stop, single and multiple SysEx messages with a 50 ms interval. Mock-port tests checked lengths, ordering and disconnect handling. Actual placement and playback require hardware acceptance. |
| FM-1 | Send song to FM-1 auto-detects the instrument and saves one continuous chart with no Digitone generation. The advanced export uses the shared plan to select parts. Concert-pitch chords, Core/LPC, four accompaniment pitches and original quarter-note timing travel independently of Digitone speed. The browser stages and reads back the new set before committing. Firmware emulator tested legacy compatibility, multiple parts, persistence, replacement and deletion. |
| Harmony AI Lab | Excluded from the public edition by owner decision. |

The chart engine, Python runtime and dependencies ship with the app. Song generation requires no EUB server, API credentials or database. Official playlist import fetches the selected public list. Build output includes the corresponding source archive and license. The Web application uses GPL-3.0-only. The vendored fm1-base client carries its original MPL-2.0 notices. The owner authorized distribution of the pinned toolkit and its BASE_EMPTY template. Firmware sources and device captures are separate from this release.

Run npm run package to create release/changes-web.zip for the site. Deploy the exact tagged artifact.
