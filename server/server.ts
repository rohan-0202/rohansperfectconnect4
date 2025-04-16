import express from 'express';
import http from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { randomBytes } from 'crypto'; // For generating game IDs

// --- Types (reuse/adapt from client if possible, or define server-specific) ---
type Player = 'red' | 'yellow' | null;
type Board = (Player | null)[][];
type SabotageSpot = { row: number, col: number } | null;
type GamePhase = 'init_select_red' | 'init_select_yellow' | 'playing' | 'sabotage_select_red' | 'sabotage_select_yellow' | 'game_over' | 'waiting_for_opponent'; // Added waiting phase

interface GameState {
    board: Board;
    players: { [key: string]: Player }; // Map socket ID to player color
    playerSockets: { red: string | null, yellow: string | null }; // Store socket IDs for each color
    currentPlayer: Player;
    winner: Player | null;
    isDraw: boolean;
    gamePhase: GamePhase;
    redSabotage: SabotageSpot;
    yellowSabotage: SabotageSpot;
    overlapJustTriggered: Player | null;
    sabotageTriggeredBy: Player | null; // Added: Who caused the sabotage re-selection?
    rematchRequested: { red: boolean, yellow: boolean }; // Added: Track rematch requests
}

// --- Constants ---
const ROWS = 6;
const COLS = 7;

const createEmptyBoard = (): Board => {
    return Array(ROWS).fill(null).map(() => Array(COLS).fill(null));
};

const generateGameId = (): string => {
    return randomBytes(4).toString('hex'); // Generate an 8-character hex ID
};

// --- Game Storage ---
const games: { [gameId: string]: GameState } = {};

// --- Game Logic Helpers ---
const checkWin = (board: Board, player: Player, r: number, c: number): boolean => {
    if (!player) return false;

    // Horizontal
    let count = 0;
    for (let j = 0; j < COLS; j++) {
        count = (board[r][j] === player) ? count + 1 : 0;
        if (count >= 4) return true;
    }

    // Vertical
    count = 0;
    for (let i = 0; i < ROWS; i++) {
        count = (board[i][c] === player) ? count + 1 : 0;
        if (count >= 4) return true;
    }

    // Diagonal (top-left to bottom-right)
    count = 0;
    let startRow = r - Math.min(r, c);
    let startCol = c - Math.min(r, c);
    for (let i = startRow, j = startCol; i < ROWS && j < COLS; i++, j++) {
        count = (board[i][j] === player) ? count + 1 : 0;
        if (count >= 4) return true;
    }

    // Diagonal (bottom-left to top-right)
    count = 0;
    startRow = r + Math.min(ROWS - 1 - r, c);
    startCol = c - Math.min(ROWS - 1 - r, c);
    // Check boundaries: i >= 0 and j < COLS
    for (let i = startRow, j = startCol; i >= 0 && j < COLS; i--, j++) {
        count = (board[i][j] === player) ? count + 1 : 0;
        if (count >= 4) return true;
    }

    return false;
};

const checkDraw = (board: Board): boolean => {
    // Check if the top row is full
    return board[0].every(cell => cell !== null);
};

// --- Server Setup ---
const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
    cors: {
        // Use environment variable for client URL, fallback for Next.js local dev
        origin: process.env.CLIENT_URL || "http://localhost:3000", // Allow specific origin or local Next.js dev server
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3001;

io.on('connection', (socket: Socket) => {
    console.log('a user connected:', socket.id);

    // --- Game Creation ---
    socket.on('create_game', () => {
        const gameId = generateGameId();
        const playerColor: Player = 'red'; // First player is always red for now

        // Create initial game state
        games[gameId] = {
            board: createEmptyBoard(),
            players: { [socket.id]: playerColor },
            playerSockets: { red: socket.id, yellow: null },
            currentPlayer: null, // No one can play until opponent joins
            winner: null,
            isDraw: false,
            gamePhase: 'waiting_for_opponent',
            redSabotage: null,
            yellowSabotage: null,
            overlapJustTriggered: null,
            sabotageTriggeredBy: null, // Initialize new field
            rematchRequested: { red: false, yellow: false }, // Initialize new field
        };

        // Put the creating player into the room
        socket.join(gameId);
        console.log(`Player ${socket.id} created game ${gameId} as ${playerColor}`);

        // Send confirmation and game details back to the creator
        socket.emit('game_created', { gameId, playerColor });
        // Send initial game state
        socket.emit('game_update', games[gameId]);
    });

    // --- Game Joining ---
    socket.on('join_game', (gameIdToJoin: string) => {
        const game = games[gameIdToJoin];

        // Validation
        if (!game) {
            console.log(`Join attempt failed: Game ${gameIdToJoin} not found.`);
            socket.emit('join_error', { message: `Game not found: ${gameIdToJoin}` });
            return;
        }

        if (game.playerSockets.yellow !== null) {
            console.log(`Join attempt failed: Game ${gameIdToJoin} is already full.`);
            socket.emit('join_error', { message: 'This game is already full.' });
            return;
        }

        if (game.playerSockets.red === socket.id) {
            console.log(`Join attempt ignored: Player ${socket.id} tried to join their own game ${gameIdToJoin}.`);
            // Optionally emit an info message, or just ignore
            // socket.emit('join_error', { message: 'You cannot join your own game.' });
            return; // Prevent joining own game
        }

        // Assign player and update state
        const playerColor: Player = 'yellow';
        game.players[socket.id] = playerColor;
        game.playerSockets.yellow = socket.id;
        game.gamePhase = 'init_select_red'; // Game starts, Red selects sabotage first
        game.currentPlayer = 'red'; // Red's turn to select

        // Add joining player to the room
        socket.join(gameIdToJoin);
        console.log(`Player ${socket.id} joined game ${gameIdToJoin} as ${playerColor}`);

        // Notify the joining player
        socket.emit('game_joined', { gameId: gameIdToJoin, playerColor });

        // Send updated game state to EVERYONE in the room
        io.to(gameIdToJoin).emit('game_update', game);
        console.log(`Sent game_update to room ${gameIdToJoin}`);

    });

    // --- Sabotage Selection ---
    socket.on('select_sabotage', ({ gameId, row, col }: { gameId: string, row: number, col: number }) => {
        const game = games[gameId];
        if (!game) {
            console.error(`Sabotage selection failed: Game ${gameId} not found.`);
            socket.emit('game_error', { message: "Game not found for sabotage selection." });
            return;
        }

        const playerColor = game.players[socket.id];
        if (!playerColor) {
            console.error(`Sabotage selection failed: Player ${socket.id} not found in game ${gameId}.`);
            socket.emit('game_error', { message: "Error identifying player for sabotage selection." });
            return;
        }

        // Validate Phase and Turn
        const validPhase = game.gamePhase === 'init_select_red' || game.gamePhase === 'init_select_yellow' ||
            game.gamePhase === 'sabotage_select_red' || game.gamePhase === 'sabotage_select_yellow';
        const correctTurn = game.currentPlayer === playerColor;

        if (!validPhase || !correctTurn) {
            console.log(`Invalid sabotage selection attempt by ${playerColor} in phase ${game.gamePhase} (current: ${game.currentPlayer})`);
            socket.emit('game_error', { message: "Not your turn to select sabotage or invalid game phase." });
            return;
        }

        // Validate coordinates
        if (row < 0 || row >= ROWS || col < 0 || col >= COLS) {
            console.log(`Invalid coordinates for sabotage selection: (${row}, ${col})`);
            socket.emit('game_error', { message: "Invalid coordinates selected." });
            return;
        }
        // Optional: Add check if cell is already occupied by a piece
        // if (game.board[row][col] !== null) {
        //     socket.emit('game_error', { message: "Cannot select an occupied cell for sabotage." });
        //     return;
        // }

        console.log(`Player ${playerColor} (${socket.id}) selected sabotage at (${row}, ${col}) in game ${gameId}`);

        // Update Sabotage Spot
        if (playerColor === 'red') {
            game.redSabotage = { row, col };
        } else {
            game.yellowSabotage = { row, col };
        }

        // Advance Phase and Current Player
        const currentPhase = game.gamePhase;
        if (currentPhase === 'init_select_red') {
            game.gamePhase = 'init_select_yellow';
            game.currentPlayer = 'yellow';
        } else if (currentPhase === 'init_select_yellow') {
            game.gamePhase = 'playing';
            game.currentPlayer = 'red'; // Red starts the playing phase
        } else if (currentPhase === 'sabotage_select_red') {
            const selectingPlayer = 'red'; // We know who is selecting based on the phase
            const opponentPlayer = 'yellow';
            if (game.overlapJustTriggered === selectingPlayer) {
                // Red selected after overlap, now Yellow selects
                game.gamePhase = 'sabotage_select_yellow';
                game.currentPlayer = opponentPlayer;
                // Keep overlapJustTriggered until Yellow selects
            } else {
                // Non-overlap: Red selected after self-trigger or opponent-trigger.
                if (game.sabotageTriggeredBy === selectingPlayer) {
                    // Self-trigger (Red landed on Red's spot)
                    game.currentPlayer = opponentPlayer; // Turn passes to Yellow
                } else {
                    // Opponent-trigger (Yellow landed on Red's spot)
                    game.currentPlayer = selectingPlayer; // Red gets the turn
                }
                game.gamePhase = 'playing';
                game.overlapJustTriggered = null;
                game.sabotageTriggeredBy = null; // Reset trigger info
            }
        } else if (currentPhase === 'sabotage_select_yellow') {
            const selectingPlayer = 'yellow';
            const opponentPlayer = 'red';
            if (game.overlapJustTriggered === selectingPlayer) {
                // Yellow selected after overlap, now Red selects
                game.gamePhase = 'sabotage_select_red';
                game.currentPlayer = opponentPlayer;
                // Keep overlapJustTriggered until Red selects
            } else {
                // Non-overlap: Yellow selected after self-trigger or opponent-trigger.
                if (game.sabotageTriggeredBy === selectingPlayer) {
                    // Self-trigger (Yellow landed on Yellow's spot)
                    game.currentPlayer = opponentPlayer; // Turn passes to Red
                } else {
                    // Opponent-trigger (Red landed on Yellow's spot)
                    game.currentPlayer = selectingPlayer; // Yellow gets the turn
                }
                game.gamePhase = 'playing';
                game.overlapJustTriggered = null;
                game.sabotageTriggeredBy = null; // Reset trigger info
            }
        }

        // Send update to all players in the room
        io.to(gameId).emit('game_update', game);
        console.log(`Sent game_update to room ${gameId} after sabotage selection by ${playerColor}`);
    });

    // --- Make Move ---
    socket.on('make_move', ({ gameId, col: colIndex }: { gameId: string, col: number }) => {
        const game = games[gameId];
        if (!game) {
            console.error(`Make move failed: Game ${gameId} not found.`);
            socket.emit('game_error', { message: "Game not found for making move." });
            return;
        }

        const playerMakingMove = game.players[socket.id];
        if (!playerMakingMove) {
            console.error(`Make move failed: Player ${socket.id} not found in game ${gameId}.`);
            socket.emit('game_error', { message: "Error identifying player for making move." });
            return;
        }

        // Validate Phase and Turn
        if (game.gamePhase !== 'playing') {
            console.log(`Invalid move attempt by ${playerMakingMove}: Not in playing phase (${game.gamePhase}).`);
            socket.emit('game_error', { message: "You can only make moves during the 'playing' phase." });
            return;
        }
        if (game.currentPlayer !== playerMakingMove) {
            console.log(`Invalid move attempt: Not ${playerMakingMove}'s turn (current: ${game.currentPlayer}).`);
            socket.emit('game_error', { message: "It's not your turn." });
            return;
        }

        // Validate Column
        if (colIndex < 0 || colIndex >= COLS) {
            console.log(`Invalid move attempt: Invalid column index ${colIndex}.`);
            socket.emit('game_error', { message: "Invalid column selected." });
            return;
        }

        // Find Landing Row
        let rowIndex = -1;
        for (let i = ROWS - 1; i >= 0; i--) {
            if (game.board[i][colIndex] === null) {
                rowIndex = i;
                break;
            }
        }

        if (rowIndex < 0) {
            console.log(`Invalid move attempt: Column ${colIndex} is full.`);
            socket.emit('game_error', { message: "This column is full." });
            return;
        }

        // --- Sabotage Logic ---
        const opponent = playerMakingMove === 'red' ? 'yellow' : 'red';
        const targetCoords = { row: rowIndex, col: colIndex };

        const isOverlap = game.redSabotage?.row === targetCoords.row && game.redSabotage?.col === targetCoords.col &&
            game.yellowSabotage?.row === targetCoords.row && game.yellowSabotage?.col === targetCoords.col;

        const isOpponentSabotage = !isOverlap && (
            (playerMakingMove === 'red' && game.yellowSabotage?.row === targetCoords.row && game.yellowSabotage?.col === targetCoords.col) ||
            (playerMakingMove === 'yellow' && game.redSabotage?.row === targetCoords.row && game.redSabotage?.col === targetCoords.col)
        );

        const isOwnSabotage = !isOverlap && !isOpponentSabotage && (
            (playerMakingMove === 'red' && game.redSabotage?.row === targetCoords.row && game.redSabotage?.col === targetCoords.col) ||
            (playerMakingMove === 'yellow' && game.yellowSabotage?.row === targetCoords.row && game.yellowSabotage?.col === targetCoords.col)
        );

        const playerToPlace = isOpponentSabotage ? opponent : playerMakingMove;

        console.log(`Player ${playerMakingMove} moves to (${rowIndex}, ${colIndex}). Overlap: ${isOverlap}, OppSab: ${isOpponentSabotage}, OwnSab: ${isOwnSabotage}. Piece: ${playerToPlace}`);

        // --- Update Board and Check Win/Draw ---
        game.board[rowIndex][colIndex] = playerToPlace;

        if (checkWin(game.board, playerToPlace, rowIndex, colIndex)) {
            console.log(`Player ${playerToPlace} wins game ${gameId}!`);
            game.winner = playerToPlace;
            game.gamePhase = 'game_over';
            io.to(gameId).emit('game_update', game);
            return; // Game over
        }

        if (checkDraw(game.board)) {
            console.log(`Game ${gameId} is a draw!`);
            game.isDraw = true;
            game.gamePhase = 'game_over';
            io.to(gameId).emit('game_update', game);
            return; // Game over
        }

        // --- Handle Sabotage Outcomes & Next Turn/Phase ---
        game.sabotageTriggeredBy = null; // Reset by default

        if (isOverlap) {
            console.log(`Overlap triggered by ${playerMakingMove} at (${rowIndex}, ${colIndex}) in game ${gameId}. Both reselect.`);
            game.overlapJustTriggered = playerMakingMove;
            game.redSabotage = null; // Clear both spots
            game.yellowSabotage = null;
            game.gamePhase = playerMakingMove === 'red' ? 'sabotage_select_red' : 'sabotage_select_yellow';
            game.currentPlayer = playerMakingMove; // Player who triggered selects first
        } else if (isOpponentSabotage) {
            console.log(`Sabotage triggered by ${playerMakingMove} on ${opponent}'s spot in game ${gameId}. ${opponent} reselects.`);
            game.overlapJustTriggered = null;
            game.sabotageTriggeredBy = playerMakingMove; // Store who triggered it
            if (playerMakingMove === 'red') game.yellowSabotage = null; // Clear opponent's spot
            else game.redSabotage = null;
            game.gamePhase = opponent === 'red' ? 'sabotage_select_red' : 'sabotage_select_yellow';
            game.currentPlayer = opponent; // Opponent selects new spot
        } else if (isOwnSabotage) {
            console.log(`Player ${playerMakingMove} triggered own sabotage in game ${gameId}. ${playerMakingMove} reselects.`);
            game.overlapJustTriggered = null;
            game.sabotageTriggeredBy = playerMakingMove; // Store who triggered it
            if (playerMakingMove === 'red') game.redSabotage = null; // Clear own spot
            else game.yellowSabotage = null;
            game.gamePhase = playerMakingMove === 'red' ? 'sabotage_select_red' : 'sabotage_select_yellow';
            game.currentPlayer = playerMakingMove; // Player selects new spot
        } else {
            // Normal move, switch player, stay in playing phase
            game.overlapJustTriggered = null;
            // game.sabotageTriggeredBy remains null (already set)
            game.currentPlayer = opponent;
            // game.gamePhase remains 'playing'
        }

        // Send update to all players in the room
        io.to(gameId).emit('game_update', game);
        console.log(`Sent game_update to room ${gameId} after move by ${playerMakingMove}`);

    });

    // --- Rematch Logic ---
    socket.on('request_rematch', ({ gameId }: { gameId: string }) => {
        const game = games[gameId];
        if (!game) {
            console.error(`Rematch request failed: Game ${gameId} not found.`);
            socket.emit('game_error', { message: "Game not found for rematch." });
            return;
        }

        if (game.gamePhase !== 'game_over') {
            console.log(`Invalid rematch request: Game ${gameId} is not over.`);
            socket.emit('game_error', { message: "Can only request rematch when game is over." });
            return;
        }

        const playerColor = game.players[socket.id];
        if (!playerColor) {
            console.error(`Rematch request failed: Player ${socket.id} not identified in game ${gameId}.`);
            socket.emit('game_error', { message: "Error identifying player for rematch." });
            return;
        }

        // Mark the player's request
        if (playerColor === 'red') {
            game.rematchRequested.red = true;
        } else {
            game.rematchRequested.yellow = true;
        }
        console.log(`Player ${playerColor} requested rematch for game ${gameId}`);

        // Check if both players have requested
        if (game.rematchRequested.red && game.rematchRequested.yellow) {
            console.log(`Rematch accepted for game ${gameId}! Resetting game...`);

            // Reset game state for rematch
            const oldRedSocketId = game.playerSockets.red;
            const oldYellowSocketId = game.playerSockets.yellow;

            // Important: Check if sockets still exist (unlikely but good practice)
            if (!oldRedSocketId || !oldYellowSocketId) {
                console.error(`Cannot reset game ${gameId}: Missing player socket info.`);
                // Handle this error case - maybe delete the game?
                return;
            }

            game.board = createEmptyBoard();
            // Swap colors
            game.players = { // Rebuild players map with swapped colors
                [oldRedSocketId]: 'yellow',
                [oldYellowSocketId]: 'red'
            };
            game.playerSockets = { // Swap socket IDs
                red: oldYellowSocketId,
                yellow: oldRedSocketId
            };
            game.winner = null;
            game.isDraw = false;
            game.redSabotage = null;
            game.yellowSabotage = null;
            game.overlapJustTriggered = null;
            game.sabotageTriggeredBy = null;
            game.rematchRequested = { red: false, yellow: false }; // Reset requests
            game.gamePhase = 'init_select_red'; // New Red (old Yellow) selects first
            game.currentPlayer = 'red'; // Set current player to new Red

            console.log(`Game ${gameId} reset. New Red: ${game.playerSockets.red}, New Yellow: ${game.playerSockets.yellow}`);
            // Send update to all players in the room
            io.to(gameId).emit('game_update', game);
            // Optional: emit a specific 'rematch_started' event

        } else {
            // Only one player has requested, just update the state
            console.log(`Waiting for opponent to accept rematch in game ${gameId}`);
            io.to(gameId).emit('game_update', game); // Notify clients of the request state change
        }
    });

    // --- Handle Player Leaving Game (Button Click or Disconnect) ---
    const handleLeave = (socketId: string) => {
        let gameIdFound: string | null = null;
        let leavingPlayer: Player | null = null;
        let opponentSocketId: string | null = null;

        // Find the game the disconnecting player was in
        for (const gameId in games) {
            const game = games[gameId];
            if (game.playerSockets.red === socketId) {
                gameIdFound = gameId;
                leavingPlayer = 'red';
                opponentSocketId = game.playerSockets.yellow;
                break;
            } else if (game.playerSockets.yellow === socketId) {
                gameIdFound = gameId;
                leavingPlayer = 'yellow';
                opponentSocketId = game.playerSockets.red;
                break;
            }
        }

        if (gameIdFound && leavingPlayer) {
            console.log(`Player ${leavingPlayer} (${socketId}) left game ${gameIdFound}.`);

            // Notify opponent if they exist
            if (opponentSocketId) {
                console.log(`Notifying opponent ${opponentSocketId} in game ${gameIdFound}.`);
                io.to(opponentSocketId).emit('opponent_left');
            }

            // Remove the game
            delete games[gameIdFound];
            console.log(`Game ${gameIdFound} removed.`);

            // Make the leaving socket leave the room (might be redundant if disconnecting, but safe)
            const leavingSocket = io.sockets.sockets.get(socketId);
            if (leavingSocket) {
                leavingSocket.leave(gameIdFound);
            }
        }
    };

    // Explicit leave request
    socket.on('leave_game', ({ gameId }: { gameId: string }) => {
        // Basic validation: Does the game exist?
        if (games[gameId]) {
            handleLeave(socket.id);
        } else {
            console.log(`Leave request ignored: Game ${gameId} not found for socket ${socket.id}.`);
        }
    });

    // Handle disconnects (tab close, etc.)
    socket.on('disconnect', () => {
        console.log('user disconnected:', socket.id);
        handleLeave(socket.id); // Reuse the same logic
    });

    // More event handlers will go here
});

server.listen(PORT, () => {
    console.log(`Server listening on *:${PORT}`);
}); 