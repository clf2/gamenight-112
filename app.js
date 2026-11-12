
// ============================================
// GAMENIGHT - SUPABASE CONFIGURATION
// ============================================

const SUPABASE_URL = "PASTE_YOUR_SUPABASE_PROJECT_URL_HERE";
const SUPABASE_ANON_KEY = "sb_publishable_WCdQLu7k5CSt1w2uDd8ZYg_OmwARAHl";

const $ = (id) => document.getElementById(id);

const supabaseReady =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("PASTE_YOUR_") &&
  SUPABASE_ANON_KEY.startsWith("sb_publishable_") &&
  window.supabase;

const db = supabaseReady
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// ============================================
// GAME DATA
// ============================================

const AVATARS = ["😎","🦊","🐼","🐸","🐯","👾"];

const TRUTHS = [
  "What is one thing you have never told this group?",
  "Who was your first crush?",
  "What is the most embarrassing song on your playlist?",
  "What is a silly fear you still have?",
  "What is the funniest lie you have ever told?",
  "What is one thing you would change about your past?",
  "Who in this room would survive longest on a deserted island?",
  "What is your most unusual talent?",
  "What is the last thing you searched for online?",
  "What is one harmless secret you can share?"
];

const DARES = [
  "Do your best celebrity impression for 20 seconds.",
  "Sing the chorus of a song chosen by the group.",
  "Talk in a dramatic movie-trailer voice until your next turn.",
  "Do 10 seconds of your funniest dance.",
  "Make up a two-line poem about the player on your left.",
  "Try to say the alphabet backwards as far as you can.",
  "Give everyone in the room a fun nickname.",
  "Make your best animal sound and let the group guess it.",
  "Describe your day using only three emojis.",
  "Tell a joke. The group decides if it deserves a laugh."
];

const state = {
  room: null,
  player: null,
  players: [],
  channel: null,
  presenceChannel: null,
  messages: [],
  round: 1,
  currentChallenge: null,
  isHost: false
};

let toastTimer;

// ============================================
// COMMON FUNCTIONS
// ============================================

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

function setError(message) {
  $("setup-error").textContent = message || "";
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    crypto.getRandomValues(new Uint8Array(6)),
    n => chars[n % chars.length]
  ).join("");
}

function requireBackend() {
  if (!db) {
    setError("Supabase connection missing. Check your Project URL in app.js.");
    return false;
  }
  return true;
}

function setBusy(button, busy) {
  button.disabled = busy;
  button.dataset.original ||= button.innerHTML;
  button.innerHTML = busy ? "Please wait…" : button.dataset.original;
}

// ============================================
// PLAYER DISPLAY
// ============================================

function showGame() {
  $("setup-screen").classList.add("hidden");
  $("game-screen").classList.remove("hidden");
  $("room-code-display").textContent = state.room.room_code;
  $("player-count").textContent = state.players.length;
  renderPlayers();
}

function renderPlayers() {
  $("player-count").textContent = state.players.length;

  $("player-grid").innerHTML =
    Array.from({ length: 6 }, (_, i) => {
      const p = state.players[i];

      return `
        <div class="player-tile">
          <div class="player-avatar">${AVATARS[i]}</div>
          <div class="player-info">
            <strong>${p ? escapeHTML(p.player_name) : "Waiting for player…"}</strong>
            <small>${p ? (p.id === state.player.id ? "You" : "In the room") : "Slot open"}</small>
          </div>
          ${p?.is_host ? '<span class="host-tag">HOST</span>' : ""}
        </div>
      `;
    }).join("");

  const full = state.players.length === 6;

  $("turn-status").textContent = full
    ? "All players are in — let's go!"
    : `${6 - state.players.length} more player(s) needed`;

  $("truth-btn").disabled = !full;
  $("dare-btn").disabled = !full;
}

// ============================================
// CHAT DISPLAY
// ============================================

function renderMessages() {
  const box = $("chat-messages");

  if (!state.messages.length) {
    box.innerHTML = '<div class="chat-empty">Say hi to your crew 👋</div>';
    return;
  }

  box.innerHTML = state.messages.map(m => `
    <div class="message ${m.player_id === state.player.id ? "mine" : ""}">
      <div class="message-name">${escapeHTML(m.player_name)}</div>
      <div class="message-bubble">${escapeHTML(m.content)}</div>
      <div class="message-time">
        ${new Date(m.created_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        })}
      </div>
    </div>
  `).join("");

  box.scrollTop = box.scrollHeight;
}

// ============================================
// DATABASE FUNCTIONS
// ============================================

async function refreshPlayers() {
  const { data, error } = await db
    .from("players")
    .select("*")
    .eq("room_id", state.room.id)
    .order("created_at");

  if (error) {
    console.error(error);
    return;
  }

  state.players = data || [];
  renderPlayers();
}

async function loadMessages() {
  const { data, error } = await db
    .from("messages")
    .select("*")
    .eq("room_id", state.room.id)
    .order("created_at")
    .limit(100);

  if (error) {
    console.error(error);
    return;
  }

  state.messages = data || [];
  renderMessages();
}

// ============================================
// ENTER ROOM + REALTIME
// ============================================

async function enterRoom(room, player, isHost) {
  state.room = room;
  state.player = player;
  state.isHost = isHost;

  showGame();

  await Promise.all([
    refreshPlayers(),
    loadMessages()
  ]);

  $("connection-label").textContent = "Connected";

  state.channel = db.channel("room-" + room.id)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "players",
        filter: "room_id=eq." + room.id
      },
      () => refreshPlayers()
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: "room_id=eq." + room.id
      },
      payload => {
        if (!state.messages.some(m => m.id === payload.new.id)) {
          state.messages.push(payload.new);
          renderMessages();
        }
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "game_state",
        filter: "room_id=eq." + room.id
      },
      payload => applyGameState(payload.new)
    )
    .subscribe(status => {
      if (status === "SUBSCRIBED") {
        $("connection-label").textContent = "Live connection";
      }
    });

  state.presenceChannel = db.channel("presence-" + room.id);

  await state.presenceChannel
    .on("presence", { event: "sync" }, () => {})
    .subscribe(async status => {
      if (status === "SUBSCRIBED") {
        await state.presenceChannel.track({
          player_id: player.id,
          player_name: player.player_name
        });
      }
    });
}

// ============================================
// CREATE PRIVATE ROOM
// ============================================

async function createRoom() {
  if (!requireBackend()) return;

  const name = $("player-name").value.trim();

  if (!name) {
    setError("Please enter your name.");
    return;
  }

  setError("");
  setBusy($("create-room"), true);

  try {
    let room, player;

    for (let attempt = 0; attempt < 4; attempt++) {
      const code = makeCode();

      const { data, error } = await db
        .from("rooms")
        .insert({
          room_code: code,
          host_name: name
        })
        .select()
        .single();

      if (!error) {
        room = data;
        break;
      }

      if (error.code !== "23505") throw error;
    }

    if (!room) {
      throw new Error("Could not generate room code.");
    }

    const { data, error } = await db
      .from("players")
      .insert({
        room_id: room.id,
        player_name: name,
        is_host: true
      })
      .select()
      .single();

    if (error) throw error;

    player = data;

    const { error: gameError } = await db
      .from("game_state")
      .insert({
        room_id: room.id,
        round_number: 1
      });

    if (gameError) throw gameError;

    await enterRoom(room, player, true);

  } catch (e) {
    setError(e.message || "Could not create room.");
  } finally {
    setBusy($("create-room"), false);
  }
}

// ============================================
// JOIN PRIVATE ROOM
// ============================================

async function joinRoom() {
  if (!requireBackend()) return;

  const name = $("player-name").value.trim();
  const code = $("room-code-input").value.trim().toUpperCase();

  if (!name) {
    setError("Please enter your name.");
    return;
  }

  if (!/^[A-Z2-9]{6}$/.test(code)) {
    setError("Enter a valid 6-character room code.");
    return;
  }

  setError("");
  setBusy($("join-room"), true);

  try {
    const { data: room, error: roomError } = await db
      .from("rooms")
      .select("*")
      .eq("room_code", code)
      .maybeSingle();

    if (roomError) throw roomError;
    if (!room) throw new Error("Room not found. Check the code.");

    const { count, error: countError } = await db
      .from("players")
      .select("*", { count: "exact", head: true })
      .eq("room_id", room.id);

    if (countError) throw countError;

    if (count >= 6) {
      throw new Error("This room is full (6/6 players).");
    }

    const { data: player, error } = await db
      .from("players")
      .insert({
        room_id: room.id,
        player_name: name,
        is_host: false
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new Error("That name is already used in this room.");
      }
      throw error;
    }

    await enterRoom(room, player, false);

  } catch (e) {
    setError(e.message || "Could not join room.");
  } finally {
    setBusy($("join-room"), false);
  }
}

// ============================================
// SEND CHAT MESSAGE
// ============================================

async function sendMessage(event) {
  event.preventDefault();

  const input = $("chat-input");
  const content = input.value.trim();

  if (!content) return;

  input.value = "";

  const { error } = await db
    .from("messages")
    .insert({
      room_id: state.room.id,
      player_id: state.player.id,
      player_name: state.player.player_name,
      content
    });

  if (error) {
    toast("Message could not be sent.");
    console.error(error);
  }
}

// ============================================
// TRUTH AND DARE
// ============================================

async function chooseChallenge(type) {
  if (state.players.length !== 6) {
    toast("Wait until all six players have joined.");
    return;
  }

  const list = type === "truth" ? TRUTHS : DARES;

  const challenge = {
    type,
    text: list[Math.floor(Math.random() * list.length)],
    round: state.round,
    by: state.player.player_name
  };

  const { error } = await db
    .from("game_state")
    .update({
      round_number: state.round,
      challenge
    })
    .eq("room_id", state.room.id);

  if (error) {
    toast("Could not update the game.");
    console.error(error);
    return;
  }

  applyGameState({
    round_number: state.round,
    challenge
  });
}

function applyGameState(game) {
  if (!game) return;

  state.round = game.round_number || 1;

  $("round-number").textContent = state.round;

  if (game.challenge) {
    state.currentChallenge = game.challenge;

    $("challenge-icon").textContent =
      game.challenge.type === "truth" ? "💬" : "🔥";

    $("challenge-title").textContent =
      game.challenge.type === "truth" ? "Truth time!" : "Dare time!";

    $("challenge-text").textContent = game.challenge.text;

    $("turn-status").textContent =
      `Chosen by ${game.challenge.by}`;

    $("next-turn").disabled = !state.isHost;
  }
}

// ============================================
// NEXT ROUND - HOST ONLY
// ============================================

async function nextTurn() {
  if (!state.isHost) {
    toast("Only the room host can start the next round.");
    return;
  }

  state.round += 1;

  const { error } = await db
    .from("game_state")
    .update({
      round_number: state.round,
      challenge: null
    })
    .eq("room_id", state.room.id);

  if (error) {
    toast("Could not start next round.");
    return;
  }

  $("round-number").textContent = state.round;
  $("challenge-icon").textContent = "🎲";
  $("challenge-title").textContent = "Who's up next?";
  $("challenge-text").textContent =
    "Choose Truth or Dare to reveal the next challenge.";

  $("turn-status").textContent = "Choose your challenge";
  $("next-turn").disabled = true;
}

// ============================================
// LEAVE ROOM
// ============================================

async function leaveRoom() {
  if (!state.room) return;

  await db
    .from("players")
    .delete()
    .eq("id", state.player.id);

  if (state.channel) {
    await db.removeChannel(state.channel);
  }

  if (state.presenceChannel) {
    await db.removeChannel(state.presenceChannel);
  }

  state.room = null;
  state.player = null;
  state.players = [];
  state.messages = [];
  state.channel = null;
  state.presenceChannel = null;

  $("game-screen").classList.add("hidden");
  $("setup-screen").classList.remove("hidden");

  $("connection-label").textContent = "Connected";
  setError("");
}

// ============================================
// EVENT LISTENERS
// ============================================

$("create-room").addEventListener("click", createRoom);
$("join-room").addEventListener("click", joinRoom);
$("chat-form").addEventListener("submit", sendMessage);

$("truth-btn").addEventListener("click", () => {
  chooseChallenge("truth");
});

$("dare-btn").addEventListener("click", () => {
  chooseChallenge("dare");
});

$("next-turn").addEventListener("click", nextTurn);
$("leave-room").addEventListener("click", leaveRoom);

$("room-code-input").addEventListener("input", e => {
  e.target.value = e.target.value
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, "")
    .slice(0, 6);
});

$("copy-code").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(state.room.room_code);
    toast("Room code copied!");
  } catch {
    toast("Room code: " + state.room.room_code);
  }
});

// ============================================
// INITIAL CONNECTION STATUS
// ============================================

if (!db) {
  $("connection-label").textContent = "Setup required";
  setError("Paste your Supabase Project URL in app.js to enable online play.");
}
