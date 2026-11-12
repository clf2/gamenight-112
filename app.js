
const SUPABASE_URL = "https://lmhrvhtdwlbmkegsneun.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_WCdQLu7k5CSt1w2uDd8ZYg_OmwARAHl";

const $ = id => document.getElementById(id);

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const AVATARS = ["😎","🦊","🐼","🐸","🐯","👾"];

const TRUTHS = [
  "What is your biggest secret?",
  "Who was your first crush?",
  "What is your most embarrassing moment?",
  "Have you ever lied to your best friend?",
  "Who is the funniest person in this room?",
  "What is your biggest fear?",
  "What is your most unusual talent?",
  "What is the last thing you searched online?",
  "Who would you trust with your biggest secret?",
  "What is one thing you regret?"
];

const DARES = [
  "Dance for 20 seconds.",
  "Sing your favourite song.",
  "Do your funniest celebrity impression.",
  "Speak in an accent for one minute.",
  "Tell everyone a funny joke.",
  "Make a funny face for 15 seconds.",
  "Do 10 jumping jacks.",
  "Describe yourself using only three emojis.",
  "Give everyone a funny nickname.",
  "Act like a movie villain."
];

let state = {
  room: null,
  player: null,
  players: [],
  channel: null,
  messages: [],
  round: 1,
  isHost: false
};

let toastTimer;

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2500);
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
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, n => chars[n % chars.length]).join("");
}

function renderPlayers() {
  $("player-count").textContent = state.players.length;

  $("player-grid").innerHTML =
    Array.from({length: 6}, (_, i) => {
      const p = state.players[i];

      return `
        <div class="player-tile">
          <div class="player-avatar">${AVATARS[i]}</div>
          <div class="player-info">
            <strong>${p ? escapeHTML(p.player_name) : "Waiting..."}</strong>
            <small>${p ? (p.id === state.player.id ? "You" : "Online") : "Empty slot"}</small>
          </div>
          ${p?.is_host ? '<span class="host-tag">HOST</span>' : ""}
        </div>
      `;
    }).join("");

  const full = state.players.length === 6;

  $("turn-status").textContent = full
    ? "All six players are ready!"
    : `${6 - state.players.length} players needed`;

  $("truth-btn").disabled = !full;
  $("dare-btn").disabled = !full;
}

function renderMessages() {
  const box = $("chat-messages");

  if (!state.messages.length) {
    box.innerHTML = '<div class="chat-empty">Say hi to your friends 👋</div>';
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

async function refreshPlayers() {
  const {data, error} = await db
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
  const {data, error} = await db
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

async function enterRoom(room, player, isHost) {
  state.room = room;
  state.player = player;
  state.isHost = isHost;

  $("setup-screen").classList.add("hidden");
  $("game-screen").classList.remove("hidden");

  $("room-code-display").textContent = room.room_code;

  await Promise.all([
    refreshPlayers(),
    loadMessages()
  ]);

  $("connection-label").textContent = "Live connection";

  state.channel = db.channel("room-" + room.id)

    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "players",
      filter: "room_id=eq." + room.id
    }, refreshPlayers)

    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "messages",
      filter: "room_id=eq." + room.id
    }, payload => {
      if (!state.messages.some(m => m.id === payload.new.id)) {
        state.messages.push(payload.new);
        renderMessages();
      }
    })

    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "game_state",
      filter: "room_id=eq." + room.id
    }, payload => applyGameState(payload.new))

    .subscribe();
}

async function createRoom() {
  const name = $("player-name").value.trim();

  if (!name) {
    setError("Enter your name first.");
    return;
  }

  setError("");
  $("create-room").disabled = true;

  try {
    let room;

    for (let i = 0; i < 5; i++) {
      const code = makeCode();

      const result = await db
        .from("rooms")
        .insert({
          room_code: code,
          host_name: name
        })
        .select()
        .single();

      if (!result.error) {
        room = result.data;
        break;
      }

      if (result.error.code !== "23505") {
        throw result.error;
      }
    }

    if (!room) throw new Error("Could not create room.");

    const {data: player, error} = await db
      .from("players")
      .insert({
        room_id: room.id,
        player_name: name,
        is_host: true
      })
      .select()
      .single();

    if (error) throw error;

    const {error: gameError} = await db
      .from("game_state")
      .insert({
        room_id: room.id,
        round_number: 1
      });

    if (gameError) throw gameError;

    await enterRoom(room, player, true);

  } catch (error) {
    setError(error.message);
  } finally {
    $("create-room").disabled = false;
  }
}

async function joinRoom() {
  const name = $("player-name").value.trim();
  const code = $("room-code-input").value.trim().toUpperCase();

  if (!name) {
    setError("Enter your name.");
    return;
  }

  if (!/^[A-Z2-9]{6}$/.test(code)) {
    setError("Enter a valid room code.");
    return;
  }

  setError("");
  $("join-room").disabled = true;

  try {
    const {data: room, error: roomError} = await db
      .from("rooms")
      .select("*")
      .eq("room_code", code)
      .maybeSingle();

    if (roomError) throw roomError;
    if (!room) throw new Error("Room not found.");

    const {count, error: countError} = await db
      .from("players")
      .select("*", {count: "exact", head: true})
      .eq("room_id", room.id);

    if (countError) throw countError;

    if (count >= 6) {
      throw new Error("Room is full!");
    }

    const {data: player, error} = await db
      .from("players")
      .insert({
        room_id: room.id,
        player_name: name,
        is_host: false
      })
      .select()
      .single();

    if (error) throw error;

    await enterRoom(room, player, false);

  } catch (error) {
    setError(error.message);
  } finally {
    $("join-room").disabled = false;
  }
}

async function sendMessage(event) {
  event.preventDefault();

  const input = $("chat-input");
  const content = input.value.trim();

  if (!content || !state.room) return;

  input.value = "";

  const {error} = await db
    .from("messages")
    .insert({
      room_id: state.room.id,
      player_id: state.player.id,
      player_name: state.player.player_name,
      content
    });

  if (error) toast("Message failed to send.");
}

async function chooseChallenge(type) {
  if (state.players.length !== 6) {
    toast("Wait for all six players.");
    return;
  }

  const list = type === "truth" ? TRUTHS : DARES;

  const challenge = {
    type,
    text: list[Math.floor(Math.random() * list.length)],
    round: state.round,
    by: state.player.player_name
  };

  const {error} = await db
    .from("game_state")
    .update({
      round_number: state.round,
      challenge
    })
    .eq("room_id", state.room.id);

  if (error) {
    toast("Game update failed.");
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
    $("challenge-icon").textContent =
      game.challenge.type === "truth" ? "💬" : "🔥";

    $("challenge-title").textContent =
      game.challenge.type === "truth" ? "Truth time!" : "Dare time!";

    $("challenge-text").textContent = game.challenge.text;

    $("turn-status").textContent =
      "Chosen by " + game.challenge.by;

    $("next-turn").disabled = !state.isHost;
  } else {
    $("challenge-icon").textContent = "🎲";
    $("challenge-title").textContent = "Who's next?";
    $("challenge-text").textContent =
      "Choose Truth or Dare!";
    $("turn-status").textContent = "Choose your challenge";
    $("next-turn").disabled = !state.isHost;
  }
}

async function nextTurn() {
  if (!state.isHost) return;

  state.round++;

  const {error} = await db
    .from("game_state")
    .update({
      round_number: state.round,
      challenge: null
    })
    .eq("room_id", state.room.id);

  if (error) toast("Could not start next round.");
}

async function leaveRoom() {
  if (!state.room) return;

  await db
    .from("players")
    .delete()
    .eq("id", state.player.id);

  if (state.channel) {
    await db.removeChannel(state.channel);
  }

  state.room = null;
  state.player = null;
  state.players = [];
  state.messages = [];
  state.channel = null;

  $("game-screen").classList.add("hidden");
  $("setup-screen").classList.remove("hidden");
}

// ============================================
// BUTTON CONNECTIONS
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

$("room-code-input").addEventListener("input", event => {
  event.target.value = event.target.value
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

if (!db) {
  $("connection-label").textContent = "Connection error";
  setError("Check Supabase configuration.");
}
