# GameNight — 6-player Truth & Dare

A responsive HTML/CSS/JavaScript multiplayer game with private room codes, six player slots, shared Truth/Dare prompts and real-time group chat.

## Files
- `index.html` — page structure
- `style.css` — responsive dark/purple design
- `app.js` — game and Supabase Realtime logic
- `supabase.sql` — database tables, policies and realtime publication

## 1. Create the Supabase backend
1. Create a free project at https://supabase.com/.
2. Open **SQL Editor → New query**.
3. Paste all of `supabase.sql` and run it.
4. Open **Project Settings → API** (or **Data API**) and copy the Project URL and `anon` / publishable key.
5. In `app.js`, replace:
   - `YOUR_SUPABASE_URL`
   - `YOUR_SUPABASE_ANON_KEY`
6. Save the file. Never put a `service_role` key in browser JavaScript.

The SQL uses permissive anonymous policies to make this starter easy to test without accounts. That is suitable only for a small prototype: anyone who discovers the project URL/key can read or modify game data. Before a public launch, add authentication and membership-checked RLS policies or move room creation/joining/game updates into server-side RPC functions. The six-player check in this browser starter is a friendly client-side check, not a tamper-proof capacity lock.

## 2. Test locally
- Open the folder in VS Code.
- Use the **Live Server** extension, or run `python -m http.server 8000` in this folder.
- Visit `http://localhost:8000`.
- Open a second browser/incognito window or another device. Create a room in one and join with its six-character code in the other.
- To test all six seats, use six browser sessions/devices.

## 3. Publish with GitHub + Vercel
1. Create a new GitHub repository, e.g. `gamenight-truth-dare`.
2. Upload `index.html`, `style.css`, `app.js`, `supabase.sql`, and this README.
3. In Vercel, choose **Add New → Project**, import that GitHub repository.
4. Framework preset: **Other**. Build command: leave blank. Output directory: `.` (or leave default if detected).
5. Click **Deploy**. Vercel will give you a public URL.
6. Every push to the connected GitHub branch will trigger a new deployment.

## Current behavior / notes
- A room creator becomes host; up to five others can join.
- Room code is six characters; the code is shareable with friends.
- Chat and game-state changes are synced through Supabase Realtime.
- All six seats must be occupied before Truth/Dare buttons activate.
- The host controls “Next player's turn”.
- Players can leave a room. If a player closes the browser without leaving, their row remains; for this starter, the host can manually delete stale rows from Supabase Table Editor. A production version should use authenticated sessions and presence/heartbeat cleanup.
- The included prompts are light-hearted. Players should feel free to pass on any prompt.

## Troubleshooting
- **Setup required:** check the Supabase URL and anon key in `app.js`.
- **Room code not found:** ensure the SQL ran successfully and both clients use the same Supabase project.
- **No live chat/player updates:** confirm `players`, `messages`, and `game_state` are included in the `supabase_realtime` publication.
- **Room full:** the app allows only six player rows per room in normal use. This client-side check is not a security boundary.
