const { Client, Databases, ID, Query } = Appwrite;

const APPWRITE_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const APPWRITE_PROJECT_ID = '6a9ebdc600050066a348';
const DATABASE_ID = '6a9eca7a002b27d358bb';

const COLLECTION_GAMES = 'games';
const COLLECTION_LEADERBOARD = 'leaderboard';

const appwriteClient = new Client();
appwriteClient.setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);

const databases = new Databases(appwriteClient);

/* ==================== GAME & APP STATE ==================== */
let loggedInUser = "Player";
let userLeaderboardDocId = null;
let userWins = 0;

let selectedGameType = "dots"; // "dots" or "hockey"
let gameMode = "computer"; // "computer" or "online"
let currentGameDoc = null;
let gameUnsubscribe = null;
let myRole = "p1"; // "p1" (Host) or "ai" (Guest / Player 2)
let isPaused = false;

let p1Name = "You";
let p2Name = "CPU";
let p1Color = "#3295ff";
let p2Color = "#ff3eaa";

const P1 = "p1";
const AI = "ai";

/* Dots State */
let gridSize = 4;
let startingPlayer = P1;
let currentPlayer = P1;
let p1Score = 0;
let aiScore = 0;
let hLines = [];
let vLines = [];
let boxes = [];
let lastMoveLineElement = null;
let lastProcessedChatTime = 0;

const PRESET_COLORS = ['#3295ff', '#a6e3a1', '#f38ba8', '#fab387', '#cba6f7'];

const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function playSound(type) {
  const soundEnabled = document.getElementById("sound-toggle").checked;
  if (!soundEnabled) return;

  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'click') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.05);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === 'hit') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.08);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'goal') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(900, now + 0.35);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'box') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.08);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'win') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.1);
      osc.frequency.setValueAtTime(783.99, now + 0.2);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
      osc.start(now);
      osc.stop(now + 0.45);
    }
  } catch (e) { console.warn("Audio error:", e); }
}

function showToast(msg) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function showConfirmModal(title, msg, onConfirm) {
  document.getElementById("confirm-title").textContent = title;
  document.getElementById("confirm-msg").textContent = msg;
  const yesBtn = document.getElementById("confirm-yes-btn");
  
  const newYesBtn = yesBtn.cloneNode(true);
  yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);
  
  newYesBtn.addEventListener("click", () => {
    closeConfirmModal();
    onConfirm();
  });
  
  document.getElementById("confirm-modal").style.display = "flex";
}

function closeConfirmModal() {
  document.getElementById("confirm-modal").style.display = "none";
}

function closeGameOverModal() {
  document.getElementById("game-over-modal").style.display = "none";
}

function showPage(pageId) {
  const pages = [
    "login-page", "main-menu", "select-game-page", "game-mode-page", 
    "online-search-page", "settings-page", "leaderboard-page", "game-page"
  ];
  pages.forEach(id => document.getElementById(id).classList.add("hidden"));
  document.getElementById(pageId).classList.remove("hidden");
}

function changeTheme(accentColor, backgroundColor, btnEl) {
  p1Color = accentColor;
  document.documentElement.style.setProperty("--accent", accentColor);
  document.documentElement.style.setProperty("--bg", backgroundColor);
  
  if (btnEl) {
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
    btnEl.classList.add('selected');
  }
}

function chooseGame(type) {
  selectedGameType = type;
  showPage("game-mode-page");
}

async function login() {
  const input = document.getElementById("user-id-input").value.trim();
  if (!input) {
    showToast("Please enter a Player ID!");
    return;
  }
  loggedInUser = input;
  p1Name = input;
  document.getElementById("welcome-text").textContent = "Welcome, " + loggedInUser;

  await registerOrFetchLeaderboardUser(loggedInUser);
  showPage("main-menu");
}

function logout() {
  loggedInUser = "Player";
  userLeaderboardDocId = null;
  userWins = 0;
  document.getElementById("user-id-input").value = "";
  if (gameUnsubscribe) gameUnsubscribe();
  cancelOnlineSearch();
  showPage("login-page");
}

async function registerOrFetchLeaderboardUser(userId) {
  try {
    const res = await databases.listDocuments(
      DATABASE_ID,
      COLLECTION_LEADERBOARD,
      [Query.equal('userId', userId), Query.limit(1)]
    );

    if (res.documents.length > 0) {
      userLeaderboardDocId = res.documents[0].$id;
      userWins = res.documents[0].wins || 0;
    } else {
      const newDoc = await databases.createDocument(
        DATABASE_ID,
        COLLECTION_LEADERBOARD,
        ID.unique(),
        { userId: userId, wins: 0 }
      );
      userLeaderboardDocId = newDoc.$id;
      userWins = 0;
    }
  } catch (err) {
    console.error("Leaderboard user registration failed:", err);
  }
}

async function incrementPlayerWins() {
  userWins++;
  if (!userLeaderboardDocId) {
    await registerOrFetchLeaderboardUser(loggedInUser);
  }

  if (userLeaderboardDocId) {
    try {
      await databases.updateDocument(
        DATABASE_ID,
        COLLECTION_LEADERBOARD,
        userLeaderboardDocId,
        { wins: userWins }
      );
    } catch (err) {
      console.error("Failed to update wins in Appwrite:", err);
    }
  }
}

async function showLeaderboard() {
  showPage("leaderboard-page");
  const body = document.getElementById("leaderboard-body");
  body.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:16px; color:var(--muted);">Loading ranking...</td></tr>`;

  try {
    const res = await databases.listDocuments(
      DATABASE_ID,
      COLLECTION_LEADERBOARD,
      [Query.orderDesc('wins'), Query.limit(50)]
    );

    body.innerHTML = "";
    if (res.documents.length === 0) {
      body.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:16px; color:var(--muted);">No records found.</td></tr>`;
      return;
    }

    res.documents.forEach((doc, index) => {
      const rank = index + 1;
      const isMe = doc.userId === loggedInUser;
      const row = document.createElement("tr");
      if (isMe) row.style.background = "rgba(50, 149, 255, 0.22)";

      let rankBadge = `<span class="rank-badge rank-other">${rank}</span>`;
      if (rank === 1) rankBadge = `<span class="rank-badge rank-1">🥇</span>`;
      if (rank === 2) rankBadge = `<span class="rank-badge rank-2">🥈</span>`;
      if (rank === 3) rankBadge = `<span class="rank-badge rank-3">🥉</span>`;

      row.innerHTML = `
        <td>${rankBadge}</td>
        <td>${doc.userId} ${isMe ? ' <span style="font-size:10px; opacity:0.8;">(You)</span>' : ''}</td>
        <td style="text-align:right; font-weight:800; color:var(--accent);">${doc.wins || 0}</td>
      `;
      body.appendChild(row);
    });

  } catch (err) {
    console.error("Leaderboard fetch error:", err);
    body.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:16px; color:#ff6b6b;">Failed to load leaderboard.</td></tr>`;
  }
}

function startComputerGame() {
  gameMode = "computer";
  myRole = P1;
  p1Name = loggedInUser;
  p2Name = "CPU";
  p2Color = "#ff3eaa";

  document.documentElement.style.setProperty("--accent", p1Color);
  document.documentElement.style.setProperty("--p2-color", p2Color);

  document.getElementById("player-display-name").textContent = p1Name;
  document.getElementById("opponent-display-name").textContent = p2Name;
  
  // Completely hide chat system when playing vs Computer
  document.getElementById("chat-room").classList.add("hidden");

  showPage("game-page");
  initGame(true);
}

async function startOnlineSearch() {
  gameMode = "online";
  showPage("online-search-page");

  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTION_GAMES,
      [
        Query.equal('status', 'waiting'),
        Query.equal('gameType', selectedGameType),
        Query.limit(1)
      ]
    );

    if (response.documents.length > 0) {
      const matchDoc = response.documents[0];
      if (matchDoc.player1 === loggedInUser) return;

      myRole = AI; // Player 2 (Guest Role)
      let chosenP2Color = p1Color;

      if (chosenP2Color.toLowerCase() === (matchDoc.p1Color || "").toLowerCase()) {
        chosenP2Color = PRESET_COLORS.find(c => c.toLowerCase() !== matchDoc.p1Color.toLowerCase()) || '#ff3eaa';
      }

      currentGameDoc = await databases.updateDocument(
        DATABASE_ID,
        COLLECTION_GAMES,
        matchDoc.$id,
        {
          player2: loggedInUser,
          p2Color: chosenP2Color,
          status: 'playing'
        }
      );

      listenToGameUpdates(matchDoc.$id);
      startOnlineGameUI(currentGameDoc);
    } else {
      myRole = P1; // Player 1 (Host Role)
      currentGameDoc = await databases.createDocument(
        DATABASE_ID,
        COLLECTION_GAMES,
        ID.unique(),
        {
          player1: loggedInUser,
          p1Color: p1Color,
          player2: "",
          p2Color: "",
          gameType: selectedGameType,
          status: "waiting",
          turn: P1,
          gridSize: gridSize,
          lastMove: "",
          lastChat: "",
          isPaused: false,
          isRestarted: false
        }
      );

      listenToGameUpdates(currentGameDoc.$id);
    }
  } catch (err) {
    console.error("Matchmaking error:", err);
    showToast("Matchmaking failed. Check Appwrite connection.");
    showPage("game-mode-page");
  }
}

async function cancelOnlineSearch() {
  if (currentGameDoc && currentGameDoc.status === 'waiting') {
    try {
      await databases.deleteDocument(DATABASE_ID, COLLECTION_GAMES, currentGameDoc.$id);
    } catch(e) {}
  }
  if (gameUnsubscribe) gameUnsubscribe();
  currentGameDoc = null;
  showPage("game-mode-page");
}

function listenToGameUpdates(gameId) {
  if (gameUnsubscribe) gameUnsubscribe();

  gameUnsubscribe = appwriteClient.subscribe(
    `databases.${DATABASE_ID}.collections.${COLLECTION_GAMES}.documents.${gameId}`,
    response => {
      const doc = response.payload;
      
      if (currentGameDoc && currentGameDoc.status === 'waiting' && doc.status === 'playing') {
        currentGameDoc = doc;
        startOnlineGameUI(doc);
      }

      if (doc.status === 'playing') {
        if (doc.isPaused !== isPaused) {
          isPaused = doc.isPaused;
          togglePauseUI(isPaused);
        }

        if (doc.gridSize && doc.gridSize !== gridSize) {
          gridSize = doc.gridSize;
          const gridSelect = document.getElementById("grid-select");
          if (gridSelect) gridSelect.value = gridSize.toString();
          initGame(true);
        } else if (doc.isRestarted) {
          initGame(true);
          if (myRole === P1) {
            databases.updateDocument(DATABASE_ID, COLLECTION_GAMES, gameId, { isRestarted: false });
          }
        }

        // Live Chat Message Sync
        if (doc.lastChat && gameMode === "online") {
          try {
            const chatData = JSON.parse(doc.lastChat);
            if (chatData.timestamp && chatData.timestamp !== lastProcessedChatTime) {
              lastProcessedChatTime = chatData.timestamp;
              if (chatData.sender !== loggedInUser) {
                appendChatMessage(chatData.sender, chatData.text, false);
                playSound('click');
              }
            }
          } catch(e) {}
        }

        // Optimized Network Move Sync
        if (doc.lastMove) {
          try {
            const moveData = JSON.parse(doc.lastMove);
            if (selectedGameType === "dots") {
              if (moveData.sender !== myRole) {
                executeMoveLocally(moveData.type, moveData.r, moveData.c, moveData.sender);
              }
            } else if (selectedGameType === "hockey") {
              receiveOnlineHockeyMove(moveData);
            }
          } catch(e) {}
        }
      }
    }
  );
}

function startOnlineGameUI(doc) {
  p1Name = doc.player1;
  p2Name = doc.player2 || "Player 2";
  p1Color = doc.p1Color || "#3295ff";
  p2Color = doc.p2Color || "#ff3eaa";

  document.documentElement.style.setProperty("--accent", p1Color);
  document.documentElement.style.setProperty("--p2-color", p2Color);

  document.getElementById("player-display-name").textContent = p1Name;
  document.getElementById("opponent-display-name").textContent = p2Name;
  document.getElementById("chat-status-text").textContent = "Online Sync";

  // Show Chat System in Online Mode
  document.getElementById("chat-room").classList.remove("hidden");
  resetChatBox();

  showPage("game-page");
  initGame(true);
}

function confirmLeaveGame() {
  showConfirmModal("Leave Game?", "Are you sure you want to return to menu?", () => {
    stopHockeyLoop();
    if (gameUnsubscribe) gameUnsubscribe();
    showPage("select-game-page");
  });
}

function initGame(fullReset = false) {
  p1Score = 0;
  aiScore = 0;
  document.getElementById("p1-score").textContent = "0";
  document.getElementById("ai-score").textContent = "0";
  closeGameOverModal();
  isPaused = false;
  togglePauseUI(false);

  if (fullReset) {
    startingPlayer = P1;
  } else {
    startingPlayer = startingPlayer === P1 ? AI : P1;
  }
  currentPlayer = startingPlayer;

  const dotsBoard = document.getElementById("dots-board");
  const hockeyWrapper = document.getElementById("hockey-wrapper");
  const gridSelectBox = document.getElementById("grid-selector-box");
  const gameTitle = document.getElementById("game-title");

  if (selectedGameType === "dots") {
    stopHockeyLoop();
    gameTitle.textContent = "Dots & Boxes 3D";
    dotsBoard.classList.remove("hidden");
    hockeyWrapper.classList.add("hidden");
    gridSelectBox.classList.remove("hidden");

    initDotsGame();
  } else {
    gameTitle.textContent = "Air Hockey 3D";
    dotsBoard.classList.add("hidden");
    hockeyWrapper.classList.remove("hidden");
    gridSelectBox.classList.add("hidden");

    initHockeyGame();
  }

  updateTurnUI();
}

function initDotsGame() {
  const gridSelect = document.getElementById("grid-select");
  gridSize = parseInt(gridSelect.value);

  hLines = Array.from({ length: gridSize + 1 }, () => Array(gridSize).fill(null));
  vLines = Array.from({ length: gridSize }, () => Array(gridSize + 1).fill(null));
  boxes = Array.from({ length: gridSize }, () => Array(gridSize).fill(null));

  if (lastMoveLineElement) {
    lastMoveLineElement.classList.remove("last-move");
    lastMoveLineElement = null;
  }

  renderDotsBoard();

  if (gameMode === "computer" && currentPlayer === AI) {
    setTimeout(aiDotsMove, 500);
  }
}

function renderDotsBoard() {
  const boardEl = document.getElementById("dots-board");
  boardEl.innerHTML = "";
  boardEl.className = "board grid-" + gridSize;

  for (let r = 0; r <= gridSize; r++) {
    const hRow = document.createElement("div");
    hRow.className = "row";

    for (let c = 0; c < gridSize; c++) {
      const dot = document.createElement("div");
      dot.className = "dot";
      hRow.appendChild(dot);

      const line = document.createElement("div");
      line.className = "h-line line";
      line.dataset.type = "h";
      line.dataset.r = r;
      line.dataset.c = c;
      line.addEventListener("click", handleLineClick);
      hRow.appendChild(line);
    }

    const lastDot = document.createElement("div");
    lastDot.className = "dot";
    hRow.appendChild(lastDot);
    boardEl.appendChild(hRow);

    if (r < gridSize) {
      const vRow = document.createElement("div");
      vRow.className = "row";

      for (let c = 0; c <= gridSize; c++) {
        const line = document.createElement("div");
        line.className = "v-line line";
        line.dataset.type = "v";
        line.dataset.r = r;
        line.dataset.c = c;
        line.addEventListener("click", handleLineClick);
        vRow.appendChild(line);

        if (c < gridSize) {
          const box = document.createElement("div");
          box.className = "box";
          box.id = `box-${r}-${c}`;
          vRow.appendChild(box);
        }
      }
      boardEl.appendChild(vRow);
    }
  }
}

async function handleLineClick(event) {
  if (isPaused || currentPlayer !== myRole) return;

  const type = event.target.dataset.type;
  const r = parseInt(event.target.dataset.r);
  const c = parseInt(event.target.dataset.c);

  if (gameMode === "online") {
    if (executeMoveLocally(type, r, c, myRole)) {
      try {
        await databases.updateDocument(
          DATABASE_ID,
          COLLECTION_GAMES,
          currentGameDoc.$id,
          {
            lastMove: JSON.stringify({ type, r, c, sender: myRole }),
            turn: currentPlayer
          }
        );
      } catch (err) { console.error(err); }
    }
  } else {
    if (executeMoveLocally(type, r, c, P1)) {
      if (checkDotsGameOver()) return;
      if (currentPlayer === AI) setTimeout(aiDotsMove, 400);
    }
  }
}

function executeMoveLocally(type, r, c, player) {
  const lineArray = type === "h" ? hLines : vLines;
  if (lineArray[r][c] !== null) return false;

  lineArray[r][c] = player;
  playSound('click');

  const lineElement = document.querySelector(`.line[data-type="${type}"][data-r="${r}"][data-c="${c}"]`);
  if (lineElement) {
    lineElement.classList.add("taken", player);

    // Neon Green last move highlight
    if (lastMoveLineElement) {
      lastMoveLineElement.classList.remove("last-move");
    }
    lineElement.classList.add("last-move");
    lastMoveLineElement = lineElement;
  }

  const completed = checkBoxes(type, r, c, player);

  if (completed > 0) {
    playSound('box');
    if (player === P1) p1Score += completed;
    else aiScore += completed;
    updateScores();
  } else {
    currentPlayer = currentPlayer === P1 ? AI : P1;
    updateTurnUI();
  }

  checkDotsGameOver();
  return true;
}

function checkBoxes(type, r, c, player) {
  let completed = 0;
  getAffectedBoxes(type, r, c).forEach(({br, bc}) => {
    if (boxes[br][bc] === null && getBoxEdgeCount(br, bc) === 4) {
      boxes[br][bc] = player;
      const boxElement = document.getElementById(`box-${br}-${bc}`);
      if (boxElement) {
        boxElement.classList.add(`filled-${player}`);
        boxElement.textContent = (player === P1 ? p1Name : p2Name).charAt(0).toUpperCase();
      }
      completed++;
    }
  });
  return completed;
}

function getAffectedBoxes(type, r, c) {
  const result = [];
  if (type === "h") {
    if (r > 0) result.push({br: r - 1, bc: c});
    if (r < gridSize) result.push({br: r, bc: c});
  } else {
    if (c > 0) result.push({br: r, bc: c - 1});
    if (c < gridSize) result.push({br: r, bc: c});
  }
  return result;
}

function getBoxEdgeCount(r, c) {
  let count = 0;
  if (hLines[r][c] !== null) count++;
  if (hLines[r + 1][c] !== null) count++;
  if (vLines[r][c] !== null) count++;
  if (vLines[r][c + 1] !== null) count++;
  return count;
}

function aiDotsMove() {
  if (isPaused || currentPlayer !== AI) return;
  const availableMoves = getAllAvailableMoves();
  if (!availableMoves.length) return;

  for (const move of availableMoves) {
    if (createsBox(move)) {
      executeMoveLocally(move.type, move.r, move.c, AI);
      if (!checkDotsGameOver() && currentPlayer === AI) setTimeout(aiDotsMove, 400);
      return;
    }
  }

  const safeMoves = availableMoves.filter(move => !givesAwayBox(move));
  const choice = safeMoves.length
    ? safeMoves[Math.floor(Math.random() * safeMoves.length)]
    : availableMoves[Math.floor(Math.random() * availableMoves.length)];

  executeMoveLocally(choice.type, choice.r, choice.c, AI);

  if (!checkDotsGameOver() && currentPlayer === AI) {
    setTimeout(aiDotsMove, 400);
  }
}

function getAllAvailableMoves() {
  const moves = [];
  for (let r = 0; r <= gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (hLines[r][c] === null) moves.push({type: "h", r, c});
    }
  }
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c <= gridSize; c++) {
      if (vLines[r][c] === null) moves.push({type: "v", r, c});
    }
  }
  return moves;
}

function createsBox(move) {
  return getAffectedBoxes(move.type, move.r, move.c).some(({br, bc}) => getBoxEdgeCount(br, bc) === 3);
}

function givesAwayBox(move) {
  return getAffectedBoxes(move.type, move.r, move.c).some(({br, bc}) => getBoxEdgeCount(br, bc) === 2);
}

function checkDotsGameOver() {
  if (p1Score + aiScore !== gridSize * gridSize) return false;
  handleGameEnd(p1Score, aiScore);
  return true;
}

document.getElementById("grid-select").addEventListener("change", async (e) => {
  const newSize = parseInt(e.target.value);
  gridSize = newSize;

  if (gameMode === "online" && currentGameDoc) {
    try {
      await databases.updateDocument(
        DATABASE_ID,
        COLLECTION_GAMES,
        currentGameDoc.$id,
        {
          gridSize: gridSize,
          isRestarted: true
        }
      );
    } catch (err) {
      console.error("Failed to sync grid size:", err);
    }
  } else {
    initGame(true);
  }
});

let hockeyCanvas = null;
let hockeyCtx = null;
let hockeyAnimationId = null;

// Smart Throttling and Network Interpolation State
let lastNetSendTime = 0;
const NET_SEND_INTERVAL = 28; // ~35 updates/sec — faster sync to match the rocket-speed puck
let lastSentPaddlePos = { x: -1, y: -1 };
let lastSentPuckPos = { x: -1, y: -1, vx: 0, vy: 0 };

const HOCKEY_WIN_SCORE = 7;

// Table Dimensions
const TABLE = {
  width: 300,
  height: 420,
  goalWidth: 100,
  borderMargin: 10
};

// Physics Entities with Lerp Targets
let puck = {
  x: TABLE.width / 2,
  y: TABLE.height / 2,
  targetX: TABLE.width / 2,
  targetY: TABLE.height / 2,
  vx: 0,
  vy: 0,
  radius: 11,
  friction: 0.996,
  maxSpeed: 48
};

let paddle1 = {
  x: TABLE.width / 2,
  y: TABLE.height - 60,
  vx: 0,
  vy: 0,
  targetX: TABLE.width / 2,
  targetY: TABLE.height - 60,
  radius: 20,
  color: "#3295ff"
};

let paddle2 = {
  x: TABLE.width / 2,
  y: 60,
  vx: 0,
  vy: 0,
  targetX: TABLE.width / 2,
  targetY: 60,
  radius: 20,
  color: "#ff3eaa"
};

let particles = [];

function initHockeyGame() {
  hockeyCanvas = document.getElementById("hockey-canvas");
  hockeyCtx = hockeyCanvas.getContext("2d");

  resetPuck(0);
  paddle1.x = paddle1.targetX = TABLE.width / 2;
  paddle1.y = paddle1.targetY = TABLE.height - 60;
  paddle1.color = p1Color;

  paddle2.x = paddle2.targetX = TABLE.width / 2;
  paddle2.y = paddle2.targetY = 60;
  paddle2.color = p2Color;

  lastSentPaddlePos = { x: -1, y: -1 };
  lastSentPuckPos = { x: -1, y: -1, vx: 0, vy: 0 };
  lastNetSendTime = 0;

  particles = [];

  hockeyCanvas.removeEventListener("pointermove", handleHockeyPointerMove);
  hockeyCanvas.removeEventListener("pointerdown", handleHockeyPointerMove);
  hockeyCanvas.addEventListener("pointermove", handleHockeyPointerMove);
  hockeyCanvas.addEventListener("pointerdown", handleHockeyPointerMove);

  stopHockeyLoop();
  runHockeyLoop();
}

function stopHockeyLoop() {
  if (hockeyAnimationId) {
    cancelAnimationFrame(hockeyAnimationId);
    hockeyAnimationId = null;
  }
}

function resetPuck(scorer) {
  // Puck sits perfectly still at center court — it only comes alive once a paddle touches it
  puck.x = puck.targetX = TABLE.width / 2;
  puck.y = puck.targetY = TABLE.height / 2;
  puck.vx = 0;
  puck.vy = 0;
}

function handleHockeyPointerMove(e) {
  if (isPaused) return;

  const rect = hockeyCanvas.getBoundingClientRect();
  const scaleX = TABLE.width / rect.width;
  const scaleY = TABLE.height / rect.height;

  const pointerX = (e.clientX - rect.left) * scaleX;
  const pointerY = (e.clientY - rect.top) * scaleY;

  if (myRole === P1 || gameMode === "computer") {
    // Host / Player 1 controls paddle at bottom of screen
    paddle1.targetX = Math.max(TABLE.borderMargin + paddle1.radius, Math.min(TABLE.width - TABLE.borderMargin - paddle1.radius, pointerX));
    paddle1.targetY = Math.max(TABLE.height / 2 + paddle1.radius + 4, Math.min(TABLE.height - TABLE.borderMargin - paddle1.radius, pointerY));
  } else {
    // Guest / Player 2 controls paddle at bottom of THEIR screen (inverted coords mapped to top half canonical)
    const canonicalX = TABLE.width - pointerX;
    const canonicalY = TABLE.height - pointerY;

    paddle2.targetX = Math.max(TABLE.borderMargin + paddle2.radius, Math.min(TABLE.width - TABLE.borderMargin - paddle2.radius, canonicalX));
    paddle2.targetY = Math.max(TABLE.borderMargin + paddle2.radius, Math.min(TABLE.height / 2 - paddle2.radius - 4, canonicalY));
  }
}

function runHockeyLoop() {
  if (!isPaused) {
    updateHockeyPhysics();
    renderHockeyCanvas();
    if (gameMode === "online") {
      syncHockeyNetworkState();
    }
  }
  hockeyAnimationId = requestAnimationFrame(runHockeyLoop);
}

function updateHockeyPhysics() {
  const isHost = (myRole === P1 || gameMode === "computer");

  // Local Paddle Lerp (Zero latency responsive feeling) — snappier so you can still steer a rocket-fast puck
  if (isHost) {
    const prevP1X = paddle1.x;
    const prevP1Y = paddle1.y;
    paddle1.x += (paddle1.targetX - paddle1.x) * 0.82;
    paddle1.y += (paddle1.targetY - paddle1.y) * 0.82;
    paddle1.vx = paddle1.x - prevP1X;
    paddle1.vy = paddle1.y - prevP1Y;

    // Remote / AI Paddle 2 Lerp
    if (gameMode === "computer") {
      updateAIBehavior();
    }
    const prevP2X = paddle2.x;
    const prevP2Y = paddle2.y;
    paddle2.x += (paddle2.targetX - paddle2.x) * 0.55;
    paddle2.y += (paddle2.targetY - paddle2.y) * 0.55;
    paddle2.vx = paddle2.x - prevP2X;
    paddle2.vy = paddle2.y - prevP2Y;

  } else { // Guest (Player 2)
    const prevP2X = paddle2.x;
    const prevP2Y = paddle2.y;
    paddle2.x += (paddle2.targetX - paddle2.x) * 0.82;
    paddle2.y += (paddle2.targetY - paddle2.y) * 0.82;
    paddle2.vx = paddle2.x - prevP2X;
    paddle2.vy = paddle2.y - prevP2Y;

    // Remote Paddle 1 Lerp
    const prevP1X = paddle1.x;
    const prevP1Y = paddle1.y;
    paddle1.x += (paddle1.targetX - paddle1.x) * 0.55;
    paddle1.y += (paddle1.targetY - paddle1.y) * 0.55;
    paddle1.vx = paddle1.x - prevP1X;
    paddle1.vy = paddle1.y - prevP1Y;
  }

  // Puck Physics Engine
  if (isHost) { // Host Authority calculates puck physics
    const rawSpeed = Math.hypot(puck.vx, puck.vy);

    // Rocket trail — only appears once the puck is actually moving (i.e. after it's been touched)
    if (rawSpeed > 8) {
      particles.push({
        x: puck.x, y: puck.y,
        vx: 0, vy: 0,
        color: "rgba(56, 189, 248, 0.55)",
        radius: puck.radius * 0.55,
        life: 0.35
      });
    }

    // Sub-step the movement so a rocket-fast puck can't tunnel through paddles/walls in a single frame
    const substeps = Math.min(10, Math.max(1, Math.ceil(rawSpeed / 6)));

    const leftWall = TABLE.borderMargin + puck.radius;
    const rightWall = TABLE.width - TABLE.borderMargin - puck.radius;
    const topWall = TABLE.borderMargin + puck.radius;
    const bottomWall = TABLE.height - TABLE.borderMargin - puck.radius;
    const goalLeft = (TABLE.width - TABLE.goalWidth) / 2;
    const goalRight = (TABLE.width + TABLE.goalWidth) / 2;

    for (let s = 0; s < substeps; s++) {
      puck.x += puck.vx / substeps;
      puck.y += puck.vy / substeps;

      if (puck.x < leftWall) {
        puck.x = leftWall;
        puck.vx *= -0.95;
        playSound('hit');
      } else if (puck.x > rightWall) {
        puck.x = rightWall;
        puck.vx *= -0.95;
        playSound('hit');
      }

      if (puck.y < topWall) {
        if (puck.x > goalLeft && puck.x < goalRight) {
          if (puck.y < TABLE.borderMargin - 12) {
            triggerGoal(1);
            return;
          }
        } else {
          puck.y = topWall;
          puck.vy *= -0.95;
          playSound('hit');
        }
      }

      if (puck.y > bottomWall) {
        if (puck.x > goalLeft && puck.x < goalRight) {
          if (puck.y > TABLE.height - TABLE.borderMargin + 12) {
            triggerGoal(2);
            return;
          }
        } else {
          puck.y = bottomWall;
          puck.vy *= -0.95;
          playSound('hit');
        }
      }

      checkPaddlePuckCollision(paddle1);
      checkPaddlePuckCollision(paddle2);
    }

    puck.vx *= puck.friction;
    puck.vy *= puck.friction;

    const speed = Math.hypot(puck.vx, puck.vy);
    if (speed > puck.maxSpeed) {
      puck.vx = (puck.vx / speed) * puck.maxSpeed;
      puck.vy = (puck.vy / speed) * puck.maxSpeed;
    }

  } else { // Guest smooth extrapolation & Lerp interpolation
    puck.targetX += puck.vx;
    puck.targetY += puck.vy;
    puck.x += (puck.targetX - puck.x) * 0.5;
    puck.y += (puck.targetY - puck.y) * 0.5;
  }

  // Update visual particle effects
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.03;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function checkPaddlePuckCollision(pad) {
  const dx = puck.x - pad.x;
  const dy = puck.y - pad.y;
  const dist = Math.hypot(dx, dy);
  const minDist = pad.radius + puck.radius;

  if (dist < minDist) {
    playSound('hit');
    const nx = dx / (dist || 1);
    const ny = dy / (dist || 1);

    const overlap = minDist - dist;
    puck.x += nx * overlap;
    puck.y += ny * overlap;

    const kx = puck.vx - pad.vx;
    const ky = puck.vy - pad.vy;
    const p = 2 * (nx * kx + ny * ky);

    puck.vx = puck.vx - p * nx + pad.vx * 0.8;
    puck.vy = puck.vy - p * ny + pad.vy * 0.8;

    const newSpeed = Math.hypot(puck.vx, puck.vy);
    if (newSpeed < 14) {
      puck.vx = nx * 22;
      puck.vy = ny * 22;
    }
  }
}

function updateAIBehavior() {
  if (puck.y < TABLE.height / 2) {
    // Lead the puck a little so the AI can still react to rocket-fast shots
    const predictedX = puck.x + puck.vx * 6;
    paddle2.targetX = Math.max(TABLE.borderMargin + paddle2.radius, Math.min(TABLE.width - TABLE.borderMargin - paddle2.radius, predictedX));
    paddle2.targetY = Math.min(TABLE.height / 2 - paddle2.radius - 8, puck.y - 10);
  } else {
    const goalCenterX = TABLE.width / 2;
    paddle2.targetX = goalCenterX + (puck.x - goalCenterX) * 0.45;
    paddle2.targetY = 60;
  }
}

function triggerGoal(scorer) {
  playSound('goal');

  const goalY = scorer === 1 ? TABLE.borderMargin : TABLE.height - TABLE.borderMargin;
  const pColor = scorer === 1 ? p1Color : p2Color;

  for (let i = 0; i < 30; i++) {
    particles.push({
      x: TABLE.width / 2 + (Math.random() - 0.5) * TABLE.goalWidth,
      y: goalY,
      vx: (Math.random() - 0.5) * 8,
      vy: (scorer === 1 ? 1 : -1) * (Math.random() * 6 + 2),
      color: pColor,
      radius: Math.random() * 4 + 2,
      life: 1.0
    });
  }

  if (scorer === 1) {
    p1Score++;
  } else {
    aiScore++;
  }
  updateScores();

  if (p1Score >= HOCKEY_WIN_SCORE || aiScore >= HOCKEY_WIN_SCORE) {
    handleGameEnd(p1Score, aiScore);
  } else {
    resetPuck(scorer);
  }
}

function renderHockeyCanvas() {
  if (!hockeyCtx) return;

  const ctx = hockeyCtx;
  ctx.clearRect(0, 0, TABLE.width, TABLE.height);

  ctx.save();

  // If local player is Player 2 in online mode, invert view 180 degrees so Player 2 paddle is at BOTTOM!
  if (gameMode === "online" && myRole === AI) {
    ctx.translate(TABLE.width, TABLE.height);
    ctx.rotate(Math.PI);
  }

  // Draw Table Background
  ctx.fillStyle = "#0a0f1d";
  ctx.fillRect(0, 0, TABLE.width, TABLE.height);

  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.strokeRect(TABLE.borderMargin, TABLE.borderMargin, TABLE.width - TABLE.borderMargin * 2, TABLE.height - TABLE.borderMargin * 2);

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";

  ctx.beginPath();
  ctx.moveTo(TABLE.borderMargin, TABLE.height / 2);
  ctx.lineTo(TABLE.width - TABLE.borderMargin, TABLE.height / 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(TABLE.width / 2, TABLE.height / 2, 38, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
  ctx.beginPath();
  ctx.arc(TABLE.width / 2, TABLE.height / 2, 5, 0, Math.PI * 2);
  ctx.fill();

  const goalLeft = (TABLE.width - TABLE.goalWidth) / 2;

  // Goals
  ctx.fillStyle = p2Color;
  ctx.shadowColor = p2Color;
  ctx.shadowBlur = 10;
  ctx.fillRect(goalLeft, TABLE.borderMargin - 5, TABLE.goalWidth, 5);

  ctx.fillStyle = p1Color;
  ctx.shadowColor = p1Color;
  ctx.shadowBlur = 10;
  ctx.fillRect(goalLeft, TABLE.height - TABLE.borderMargin, TABLE.goalWidth, 5);
  ctx.shadowBlur = 0;

  // Particles
  particles.forEach(p => {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.life;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1.0;

  // Puck
  ctx.save();
  ctx.shadowColor = "#38bdf8";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#0f172a";
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(puck.x, puck.y, puck.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Paddles
  drawMallet(paddle1.x, paddle1.y, paddle1.radius, p1Color);
  drawMallet(paddle2.x, paddle2.y, paddle2.radius, p2Color);

  ctx.restore();
}

function drawMallet(x, y, radius, color) {
  const ctx = hockeyCtx;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

async function syncHockeyNetworkState() {
  if (!currentGameDoc) return;
  const now = Date.now();
  if (now - lastNetSendTime < NET_SEND_INTERVAL) return;

  const isHost = (myRole === P1);

  if (isHost) {
    const distP1 = Math.hypot(paddle1.x - lastSentPaddlePos.x, paddle1.y - lastSentPaddlePos.y);
    const distPuck = Math.hypot(puck.x - lastSentPuckPos.x, puck.y - lastSentPuckPos.y);

    if (distP1 < 0.5 && distPuck < 0.5) return; // Deduplicate unnecessary updates

    lastNetSendTime = now;
    lastSentPaddlePos = { x: paddle1.x, y: paddle1.y };
    lastSentPuckPos = { x: puck.x, y: puck.y, vx: puck.vx, vy: puck.vy };

    const hostPayload = {
      t: "h", // Host update
      p1: [Math.round(paddle1.x), Math.round(paddle1.y)],
      pk: [Math.round(puck.x * 10) / 10, Math.round(puck.y * 10) / 10, Math.round(puck.vx * 10) / 10, Math.round(puck.vy * 10) / 10],
      s: [p1Score, aiScore],
      r: P1
    };

    try {
      await databases.updateDocument(
        DATABASE_ID,
        COLLECTION_GAMES,
        currentGameDoc.$id,
        { lastMove: JSON.stringify(hostPayload) }
      );
    } catch (e) {}

  } else { // Guest update
    const distP2 = Math.hypot(paddle2.x - lastSentPaddlePos.x, paddle2.y - lastSentPaddlePos.y);
    if (distP2 < 0.5) return; // Deduplicate

    lastNetSendTime = now;
    lastSentPaddlePos = { x: paddle2.x, y: paddle2.y };

    const guestPayload = {
      t: "g", // Guest update
      p2: [Math.round(paddle2.x), Math.round(paddle2.y)],
      r: AI
    };

    try {
      await databases.updateDocument(
        DATABASE_ID,
        COLLECTION_GAMES,
        currentGameDoc.$id,
        { lastMove: JSON.stringify(guestPayload) }
      );
    } catch (e) {}
  }
}

function receiveOnlineHockeyMove(data) {
  if (data.t === "h" && myRole === AI) { // Guest receiving Host state
    if (data.p1) {
      paddle1.targetX = data.p1[0];
      paddle1.targetY = data.p1[1];
    }
    if (data.pk) {
      puck.targetX = data.pk[0];
      puck.targetY = data.pk[1];
      puck.vx = data.pk[2];
      puck.vy = data.pk[3];
    }
    if (data.s) {
      if (data.s[0] !== p1Score || data.s[1] !== aiScore) {
        p1Score = data.s[0];
        aiScore = data.s[1];
        updateScores();
        playSound('goal');
      }
    }
  } else if (data.t === "g" && myRole === P1) { // Host receiving Guest state
    if (data.p2) {
      paddle2.targetX = data.p2[0];
      paddle2.targetY = data.p2[1];
    }
  }
}

function resetChatBox() {
  const msgBox = document.getElementById("chat-messages");
  msgBox.innerHTML = `
    <div class="chat-bubble them">
      <span style="font-weight:bold; display:block; font-size:10px; opacity:0.85;">System</span>
      <span>Game room ready! Chat with opponent below.</span>
    </div>
  `;
}

async function sendChatMessage() {
  if (gameMode !== "online") return;

  const input = document.getElementById("chat-input");
  const msgText = input.value.trim();
  if (!msgText) return;

  const chatObj = {
    sender: loggedInUser,
    role: myRole,
    text: msgText,
    timestamp: Date.now()
  };

  appendChatMessage(loggedInUser, msgText, true);
  input.value = "";

  if (currentGameDoc) {
    try {
      await databases.updateDocument(
        DATABASE_ID,
        COLLECTION_GAMES,
        currentGameDoc.$id,
        { lastChat: JSON.stringify(chatObj) }
      );
    } catch (err) {
      console.error("Chat sync failed:", err);
    }
  }
}

function appendChatMessage(sender, text, isMe) {
  const msgBox = document.getElementById("chat-messages");
  if (!msgBox) return;

  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${isMe ? 'me' : 'them'}`;
  
  const senderSpan = document.createElement("span");
  senderSpan.style.fontWeight = "bold";
  senderSpan.style.display = "block";
  senderSpan.style.fontSize = "10px";
  senderSpan.style.opacity = "0.85";
  senderSpan.textContent = sender;

  const textSpan = document.createElement("span");
  textSpan.textContent = text;

  bubble.appendChild(senderSpan);
  bubble.appendChild(textSpan);
  msgBox.appendChild(bubble);

  msgBox.scrollTop = msgBox.scrollHeight;
}

document.getElementById("chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChatMessage();
});

function updateScores() {
  document.getElementById("p1-score").textContent = p1Score;
  document.getElementById("ai-score").textContent = aiScore;
}

function updateTurnUI() {
  document.getElementById("p1-card").classList.toggle("active-p1", currentPlayer === P1);
  document.getElementById("ai-card").classList.toggle("active-ai", currentPlayer === AI);
}

function handleGameEnd(p1Res, aiRes) {
  stopHockeyLoop();

  const title = document.getElementById("winner-title");
  const msg = document.getElementById("winner-msg");

  if (p1Res > aiRes) {
    title.textContent = `${p1Name} Won! 🎉`;
    msg.textContent = `Victory added to your leaderboard stats!`;
    if (myRole === P1 || gameMode === "computer") incrementPlayerWins();
  } else if (aiRes > p1Res) {
    title.textContent = `${p2Name} Won!`;
    msg.textContent = `Better luck next time!`;
    if (gameMode === "online" && myRole === AI) incrementPlayerWins();
  } else {
    title.textContent = "It's a Tie! 🤝";
    msg.textContent = `Equal skills!`;
  }

  document.getElementById("game-over-modal").style.display = "flex";
}

async function togglePause() {
  isPaused = !isPaused;
  togglePauseUI(isPaused);

  if (gameMode === "online" && currentGameDoc) {
    try {
      await databases.updateDocument(DATABASE_ID, COLLECTION_GAMES, currentGameDoc.$id, {
        isPaused: isPaused
      });
    } catch(e) {}
  }
}

function togglePauseUI(paused) {
  const pauseIcon = document.getElementById("pause-icon");
  const activeBoard = selectedGameType === "dots" ? document.getElementById("dots-board") : document.getElementById("hockey-wrapper");
  pauseIcon.textContent = paused ? "▶" : "⏸";
  activeBoard.style.opacity = paused ? "0.4" : "1";
  activeBoard.style.pointerEvents = paused ? "none" : "auto";
}

function confirmRestart() {
  showConfirmModal("Restart Game?", "Reset current game state?", () => {
    if (gameMode === "online" && currentGameDoc) {
      databases.updateDocument(DATABASE_ID, COLLECTION_GAMES, currentGameDoc.$id, {
        isRestarted: true
      });
    } else {
      initGame(true);
    }
  });
}

// Enable Enter Key on Login Input
document.getElementById("user-id-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") login();
});
