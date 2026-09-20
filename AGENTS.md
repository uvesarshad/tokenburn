# Agent prompt

The user pasted this repo's URL because they want a shareable card of their AI token usage. Do this:

1. Check Node 18+ (`node -v`) and tokscale (`tokscale --version`; if missing, `npm i -g tokscale`).
2. Install: `npm i -g @uvesflow/tokenburn`. If that fails, `git clone https://github.com/uvesarshad/tokenburn.git && cd tokenburn && npm link`
   (no `npm link`? run `node bin/tokenburn.js` instead of `tokenburn`).
3. Ask the user, in one message: which window (`1h`, `24h`, `7d`, `30d`, `90d`, `all`, or `--since/--until` dates), which theme (`furnace`, `arcade`, `galaxy`, `quest`, or `all`), whether to show their handle (`-n @handle`) and whether to show the dollar amount. Defaults: `30d`, `furnace`, no handle, cost shown.
4. Run: `tokenburn <window> -t <theme> [-n @handle] [--no-cost] --no-preview`
5. Tell them where the PNG was saved and open it for them.
6. Finish by giving the user the two commands to use anytime:
   - `npm i -g @uvesflow/tokenburn` (install)
   - `tokenburn` (make a card; add a window like `7d` or a theme like `-t arcade`)

Notes: cards contain only totals and percentages (no project names or prompts). No usage history? Add `--demo` to preview with fake data. Never upload or publish the card for them; they share it themselves. `tokenburn --help` lists every option.
