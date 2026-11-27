# Historical GPL Web releases

This repository and its existing releases retain their original GPL-3.0 terms. The separately maintained Web edition is at https://emnyeca.com/eub/changes/app/. EUB Changes desktop is a separate application.

For the RC2 Web release, download changes-web.zip from https://github.com/emnyeca/changes-web/releases/tag/v0.2.0-rc.2 . Inside it, changes-source.zip contains the application sources and engine.zip contains the selected Python files in editable form. The original source ZIP is also available at https://emnyeca.com/eub/changes/app/changes-source.zip .

To rebuild the browser application without access to either development checkout:

1. Extract changes-source.zip to a working directory. Run npm ci with its package-lock.json.
2. Create public/ and copy the runtime/ directory, LICENSE.txt, changes-source.zip and engine.zip from the same release into public/. Copy worker.mjs from the working directory into public/.
3. To modify the Python engine, extract engine.zip, edit its source and zip the same entries with their original relative paths.
4. Run npx --no-install vite build --base=./ from the working directory. Serve dist/ with an HTTP server.

The original stage.py also records the exact Git inputs and runtime dependencies. Recipients retain permission to use, modify and redistribute the GPL version under its terms.
