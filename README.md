# EUB Changes Web

Browser development build for importing and browsing chord charts. The library and language preference use browser local storage. Export a backup before clearing browser data.

Run npm ci and npm run dev -- --port 5186. Open the loopback URL. With Chrome installed, run node verify.mjs against the running app. Run npm run build to produce dist/ with relative asset URLs. VS Code tasks also provide local serving and building.

## Compatibility at this revision

| Desktop workflow | Browser status |
| --- | --- |
| MusicXML file import | Reads partwise XML and displays a basic chord grid. Synthetic file checked in Chrome. Desktop analysis parity pending. |
| iReal Pro song and playlist | Uses the desktop converter version 2.1.1 locally. Playlist parity pending. |
| Library | Search, select, browser persistence, backup and restore. Edit and delete pending. |
| Harmony Cloud, Bass, Chord and voice-leading graph | Pending |
| Section filtering, transpose, Linear, Auto Split, Bundle | Pending |
| MIDI preview, SysEx export and device transfers | Pending |

Reference versions are Changes f01e7923fd8b2cb394e8f478db673f96ef753156 and digitone-syx-toolkit v0.1.0 (c162be40f8fd7e6938b39dd7e108a35958050a51). The toolkit is not bundled in this development build.

The iReal conversion path uses @music-i18n/ireal-musicxml by Karim Ratib / infojunkie under GPL-3.0-only. See LICENSE.
