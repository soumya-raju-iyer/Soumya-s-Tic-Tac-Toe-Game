const boardElement = document.getElementById('board');
const cells = document.querySelectorAll('.cell');
const statusElement = document.getElementById('status');
const resetBtn = document.getElementById('resetBtn');
const modalOverlay = document.getElementById('modalOverlay');
const modalTitle = document.getElementById('modalTitle');
const modalMessage = document.getElementById('modalMessage');
const modalEmoji = document.getElementById('modalEmoji');
const playAgainBtn = document.getElementById('playAgainBtn');

// Navigation Elements
const menuScreen = document.getElementById('menu');
const onlineLobbyScreen = document.getElementById('onlineLobby');
const gameScreen = document.getElementById('gameScreen');
const gameModeText = document.getElementById('gameModeText');
const gameLinkInput = document.getElementById('gameLinkInput');
const copyBtn = document.getElementById('copyBtn');

let gameState = ["", "", "", "", "", "", "", "", ""];
let gameActive = false;
const PLAYER_X = "X";
const PLAYER_O = "O";
let currentPlayer = PLAYER_X;
let gameMode = 'computer'; // 'computer', 'local', 'online'
let peer = null;
let conn = null;
let myPeerId = null;
let isHost = false;

const winningConditions = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
];

// --- Initialization ---
function init() {
    cells.forEach(cell => cell.addEventListener('click', handleCellClick));
    resetBtn.addEventListener('click', () => restartGame(false));
    playAgainBtn.addEventListener('click', () => restartGame(true));
    copyBtn.addEventListener('click', copyLink);

    // Check for online game parameter
    const urlParams = new URLSearchParams(window.location.search);
    const gameId = urlParams.get('gameId');
    if (gameId) {
        joinOnlineGame(gameId);
    }
}

// --- Navigation & Modes ---
window.startGame = function (mode) {
    gameMode = mode;
    menuScreen.classList.add('hidden');

    if (mode === 'computer') {
        gameModeText.textContent = "You vs Computer";
        gameScreen.classList.remove('hidden');
        resetGameInternal();
    } else if (mode === 'local') {
        gameModeText.textContent = "Two Players (Local)";
        gameScreen.classList.remove('hidden');
        resetGameInternal();
    } else if (mode === 'online') {
        gameModeText.textContent = "Play Online";
        onlineLobbyScreen.classList.remove('hidden');
        initPeer();
    }
}

window.showMenu = function () {
    menuScreen.classList.remove('hidden');
    gameScreen.classList.add('hidden');
    onlineLobbyScreen.classList.add('hidden');
    gameModeText.textContent = "Select Game Mode";
    gameActive = false;

    // Cleanup Peer
    if (peer) {
        peer.destroy();
        peer = null;
    }

    // Clear URL param if present
    if (window.location.search.includes('gameId')) {
        window.history.pushState({}, document.title, window.location.pathname);
    }
}

// --- Online Logic (PeerJS) ---
function initPeer() {
    peer = new Peer(null, {
        debug: 2
    });

    peer.on('open', (id) => {
        myPeerId = id;
        isHost = true;
        const link = `${window.location.origin}${window.location.pathname}?gameId=${id}`;
        gameLinkInput.value = link;
    });

    peer.on('connection', (c) => {
        // Host received connection
        conn = c;
        setupConnection();
        // Start game
        onlineLobbyScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        gameModeText.textContent = "You vs Online Friend";
        resetGameInternal();
        // Host is X
    });
}

function joinOnlineGame(hostId) {
    menuScreen.classList.add('hidden');
    gameModeText.textContent = "Connecting...";

    peer = new Peer(null, { debug: 2 });

    peer.on('open', (id) => {
        conn = peer.connect(hostId);
        isHost = false;
        setupConnection();
    });

    peer.on('error', (err) => {
        alert("Could not connect to game. Link might be invalid or expired.");
        showMenu();
    });
}

function setupConnection() {
    conn.on('open', () => {
        console.log("Connected!");
        if (!isHost) {
            // Client connected
            gameScreen.classList.remove('hidden');
            gameModeText.textContent = "You vs Online Friend";
            // Client is O, wait for data
            gameActive = false; // Wait for X to start
            statusElement.textContent = "Waiting for host...";
            gameMode = 'online';
        }
    });

    conn.on('data', (data) => {
        handleIncomingData(data);
    });

    conn.on('close', () => {
        alert("Opponent disconnected!");
        showMenu();
    });
}

function sendData(data) {
    if (conn && conn.open) {
        conn.send(data);
    }
}

function handleIncomingData(data) {
    if (data.type === 'move') {
        // Opponent moved
        handleCellPlayed(cells[data.index], data.index, data.player, false); // false = don't send back
        checkResult();
    } else if (data.type === 'restart') {
        resetGameInternal();
        alert("Opponent restarted the game!");
    }
}

// --- Game Logic ---
function handleCellClick(e) {
    const clickedCell = e.target;
    const clickedCellIndex = parseInt(clickedCell.getAttribute('data-index'));

    if (gameState[clickedCellIndex] !== "" || !gameActive) {
        return;
    }

    // Online turn check
    if (gameMode === 'online') {
        const myPlayer = isHost ? PLAYER_X : PLAYER_O;
        if (currentPlayer !== myPlayer) return;
    }

    handleCellPlayed(clickedCell, clickedCellIndex, currentPlayer, true);
    checkResult();
}

function handleCellPlayed(cell, index, player, emit = true) {
    gameState[index] = player;
    cell.textContent = player;
    cell.classList.add(player.toLowerCase());
    cell.classList.add('taken');

    // Animate
    cell.animate([
        { transform: 'scale(1)' },
        { transform: 'scale(1.2)' },
        { transform: 'scale(1)' }
    ], { duration: 200 });

    if (gameMode === 'online' && emit) {
        sendData({ type: 'move', index: index, player: player });
    }
}

function checkResult() {
    let roundWon = false;
    let winningLine = [];

    for (let i = 0; i < winningConditions.length; i++) {
        const [a, b, c] = winningConditions[i];
        if (gameState[a] && gameState[a] === gameState[b] && gameState[a] === gameState[c]) {
            roundWon = true;
            winningLine = winningConditions[i];
            break;
        }
    }

    if (roundWon) {
        endGame(currentPlayer === PLAYER_X ? 'win' : 'loss'); // Simplification: in local, X win vs O win handled in msg
        return;
    }

    if (!gameState.includes("")) {
        endGame('draw');
        return;
    }

    // Switch turn
    currentPlayer = currentPlayer === PLAYER_X ? PLAYER_O : PLAYER_X;
    updateStatus();

    if (gameMode === 'computer' && currentPlayer === PLAYER_O) {
        statusElement.textContent = "Computer is thinking... 🤔";
        setTimeout(computerPlay, 600);
    }
}

function updateStatus() {
    if (gameMode === 'local') {
        statusElement.textContent = `Player ${currentPlayer}'s Turn! ${currentPlayer === 'X' ? '💖' : '💙'}`;
    } else if (gameMode === 'computer') {
        statusElement.textContent = currentPlayer === PLAYER_X ? "Your Turn! 💖" : "Computer is thinking... 🤔";
    } else if (gameMode === 'online') {
        const myPlayer = isHost ? PLAYER_X : PLAYER_O;
        if (currentPlayer === myPlayer) {
            statusElement.textContent = "Your Turn! 💖";
        } else {
            statusElement.textContent = "Opponent's Turn... 🕒";
        }
    }
}

// --- Computer Logic ---
function computerPlay() {
    if (!gameActive) return;
    // (Same logic as before)
    let available = gameState.map((v, i) => v === "" ? i : null).filter(v => v !== null);
    if (available.length === 0) return;

    let move = findBestMove(PLAYER_O); // Try win
    if (move === -1) move = findBestMove(PLAYER_X); // Block
    if (move === -1) move = available[Math.floor(Math.random() * available.length)];

    const cell = document.querySelector(`.cell[data-index='${move}']`);
    handleCellPlayed(cell, move, PLAYER_O);
    checkResult();
}

function findBestMove(player) {
    // (Same logic)
    for (let i = 0; i < winningConditions.length; i++) {
        const [a, b, c] = winningConditions[i];
        const vals = [gameState[a], gameState[b], gameState[c]];
        if (vals.filter(v => v === player).length === 2 && vals.filter(v => v === "").length === 1) {
            return [a, b, c].find(idx => gameState[idx] === "");
        }
    }
    return -1;
}

// --- Game End & UI ---
function endGame(result) {
    gameActive = false;
    setTimeout(() => {
        let title, msg, emoji;

        // Contextual messages
        if (gameMode === 'local') {
            if (result === 'draw') {
                title = "It's a Tie! 🤝"; msg = "Well played both of you!"; emoji = "🐱";
            } else {
                // Determine who won based on last player
                const winner = currentPlayer;
                title = `Player ${winner} Won! 🎉`;
                msg = "Awesome game!";
                emoji = winner === 'X' ? "👑" : "💎";
                triggerConfetti();
            }
        } else {
            // Computer or Online (from perspective of local user unless online requires specific logic)
            if (result === 'draw') {
                title = "It's a Tie! 🤝"; msg = "Good game!"; emoji = "🐱";
            } else {
                // In computer/online, we need to know if 'I' won.
                // CurrentPlayer caused the win.
                let iWon = false;
                if (gameMode === 'computer') iWon = currentPlayer === PLAYER_X;
                if (gameMode === 'online') iWon = currentPlayer === (isHost ? PLAYER_X : PLAYER_O);

                if (iWon) {
                    title = "Yay! You Won! 🎉"; msg = "You're amazing! Super star! ✨"; emoji = "👑";
                    triggerConfetti();
                } else {
                    title = "Oh no! 🥺"; msg = "Keep trying! You can do it!"; emoji = "🌈";
                }
            }
        }

        showModal(title, msg, emoji);
    }, 500);
}

function showModal(title, msg, emoji) {
    modalTitle.textContent = title;
    modalMessage.textContent = msg;
    modalEmoji.textContent = emoji;
    modalOverlay.classList.add('active');
}

function restartGame(fromModal) {
    if (gameMode === 'online') {
        sendData({ type: 'restart' });
    }
    resetGameInternal();
    if (fromModal) modalOverlay.classList.remove('active');
}

function resetGameInternal() {
    gameActive = true;
    gameState.fill("");
    currentPlayer = PLAYER_X;
    cells.forEach(c => {
        c.textContent = "";
        c.className = "cell";
    });
    modalOverlay.classList.remove('active');
    updateStatus();
}

function copyLink() {
    const copyText = document.getElementById("gameLinkInput");
    copyText.select();
    copyText.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(copyText.value);

    const originalText = copyBtn.innerText;
    copyBtn.innerText = "Copied! ✅";
    setTimeout(() => copyBtn.innerText = originalText, 2000);
}

function triggerConfetti() {
    // (Simple confetti logic re-implemented or reused)
    const colors = ['#ffb7b2', '#ff9cee', '#b5eaea', '#ffffba'];
    for (let i = 0; i < 100; i++) {
        const el = document.createElement('div');
        el.style.position = 'fixed';
        el.style.width = '10px'; el.style.height = '10px';
        el.style.background = colors[Math.floor(Math.random() * colors.length)];
        el.style.left = Math.random() * 100 + 'vw';
        el.style.top = '-10px';
        el.style.zIndex = '500';
        document.body.appendChild(el);
        const anim = el.animate([
            { transform: 'translate(0,0)', opacity: 1 },
            { transform: `translate(${Math.random() * 100 - 50}px, 100vh) rotate(${Math.random() * 360}deg)`, opacity: 0 }
        ], { duration: Math.random() * 2000 + 2000 });
        anim.onfinish = () => el.remove();
    }
}

// Start
init();
