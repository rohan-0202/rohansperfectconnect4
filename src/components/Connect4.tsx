"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Player } from '@/types';
import { io, Socket } from "socket.io-client";
import { Quicksand } from 'next/font/google'; // Import the font

// Instantiate the font
const quicksand = Quicksand({ subsets: ['latin'], weight: ['400', '700'] });

// --- Types from Server (ensure these match server/server.ts) ---
// Duplicating these here for clarity, ideally share via a common types package
type Board = (Player | null)[][];
type SabotageSpot = { row: number, col: number } | null;
type GamePhase = 'init_select_red' | 'init_select_yellow' | 'playing' | 'sabotage_select_red' | 'sabotage_select_yellow' | 'game_over' | 'waiting_for_opponent' | 'initial'; // Added 'initial' and 'waiting'

interface GameState {
    board: Board;
    players: { [key: string]: Player };
    playerSockets: { red: string | null, yellow: string | null };
    currentPlayer: Player;
    winner: Player | null;
    isDraw: boolean;
    gamePhase: GamePhase;
    redSabotage: SabotageSpot;
    yellowSabotage: SabotageSpot;
    overlapJustTriggered: Player | null;
    sabotageTriggeredBy: Player | null;
    rematchRequested: { red: boolean, yellow: boolean };
    pendingReselect: { red: boolean, yellow: boolean };
}
// --- End Server Types ---

const ROWS = 6;
const COLS = 7;

const createEmptyBoard = (): Board => { // Use Board type
    return Array(ROWS).fill(null).map(() => Array(COLS).fill(null));
};

const Connect4: React.FC = () => {
    // Remove individual state slices that are now part of GameState
    // const [board, setBoard] = useState<Board>(createEmptyBoard());
    // const [currentPlayer, setCurrentPlayer] = useState<Player>('red');
    // const [winner, setWinner] = useState<Player | null>(null);
    // const [isDraw, setIsDraw] = useState<boolean>(false);
    // const [gamePhase, setGamePhase] = useState<GamePhase>('initial'); // Start in initial phase
    // const [redSabotage, setRedSabotage] = useState<SabotageSpot>(null);
    // const [yellowSabotage, setYellowSabotage] = useState<SabotageSpot>(null);
    // const [overlapJustTriggered, setOverlapJustTriggered] = useState<Player | null>(null);

    const [gameState, setGameState] = useState<GameState | null>(null); // Holds the entire game state from server
    const [socket, setSocket] = useState<Socket | null>(null);
    const [message, setMessage] = useState<string | React.ReactNode>("Connecting...");
    const [gameId, setGameId] = useState<string | null>(null);
    const [myPlayerColor, setMyPlayerColor] = useState<Player>(null);
    const [joinGameIdInput, setJoinGameIdInput] = useState<string>(""); // State for join input
    const [joinError, setJoinError] = useState<string | null>(null); // State for join errors
    const [opponentLeftMessage, setOpponentLeftMessage] = useState<string | null>(null); // Message for opponent leaving
    const [showRules, setShowRules] = useState<boolean>(false); // State for rules visibility

    const rulesText = `
You're probably familiar with the game connect 4. This game is that game, but my friend said connect 4 was too simple, so I added a twist.

**Rules that are the same**
*   Red goes first, Yellow goes second placing tiles on the board.
*   They alternate in turns, and tiles fall to the bottom unfilled space of their column.
*   If either player makes 4 tiles in a row horizontally, vertically, or diagonally, that player wins.
*   If the board fills up completely with the above condition unfulfilled, the game is a draw.

**New Rules**
*   At the start of the game, each player selects a "Sabotage Space".
*   If a player places their tile on a space that is the other player's Sabotage Space, it becomes the other player's color.
*   If a player chooses to place a tile on their own Sabotage Space, they are then allowed to pick a new Sabotage Space.
*   If both players have the same Sabotage Space, the effect is cancelled out without either player knowing until either player places a tile there, and then both players pick new Sabotage Spaces.
    `;

    // Function to reset client state to initial screen
    const resetClientState = useCallback(() => {
        setGameState(null);
        setGameId(null);
        setMyPlayerColor(null);
        setJoinGameIdInput("");
        setJoinError(null);
        // Keep opponentLeftMessage briefly? Or clear immediately?
        // Let's clear it after a delay or rely on message update
        // setOpponentLeftMessage(null);
        setMessage("Create or Join a Game."); // Set initial message
    }, []); // No dependencies needed if it only calls setters

    // --- Socket Connection and Event Listeners ---
    useEffect(() => {
        // Use Next.js public environment variable for URL, fallback for local dev
        const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";
        console.log(`Connecting to server at: ${socketUrl}`);
        const newSocket = io(socketUrl);
        setSocket(newSocket);

        newSocket.on("connect", () => {
            console.log("Connected to server with ID:", newSocket.id);
            setMessage("Connected! Create or Join a Game.");
        });

        newSocket.on('game_created', ({ gameId: newGameId, playerColor }) => {
            console.log(`Game created: ${newGameId}, I am ${playerColor}`);
            setGameId(newGameId);
            setMyPlayerColor(playerColor);
            setMessage(<>Game ID: <span className="font-mono bg-gray-200 px-1 rounded">{newGameId}</span>. Send this ID to your opponent! Waiting for them to join...</>);
        });

        newSocket.on('game_joined', ({ gameId: joinedGameId, playerColor }) => {
            console.log(`Successfully joined game ${joinedGameId} as ${playerColor}`);
            setGameId(joinedGameId);
            setMyPlayerColor(playerColor);
            setJoinError(null); // Clear any previous join errors
            // Game state update will arrive via 'game_update'
        });

        newSocket.on('join_error', ({ message: errorMessage }) => {
            console.error("Join error:", errorMessage);
            setJoinError(errorMessage);
            setMessage("Failed to join game. See error below."); // Update main message temporarily
        });

        newSocket.on('game_update', (newGameState: GameState) => {
            console.log("Received game update:", newGameState);
            setGameState(newGameState);

            // Update own player color based on the new state
            if (newSocket.id && newGameState.players) {
                const myNewColor = newGameState.players[newSocket.id] || null;
                if (myNewColor !== myPlayerColor) { // Only update if it changed
                    console.log(`My color changed from ${myPlayerColor} to ${myNewColor}`);
                    setMyPlayerColor(myNewColor);
                }
            }
        });

        newSocket.on('connect_error', (err) => {
            console.error("Connection error:", err);
            setMessage("Failed to connect to server.");
        });

        newSocket.on('opponent_left', () => {
            console.log("Opponent left the game.");
            setOpponentLeftMessage("Your opponent has left the game.");
            // Reset state after a short delay to allow user to see the message
            setTimeout(() => {
                resetClientState();
                setOpponentLeftMessage(null); // Clear the message after resetting
            }, 3000); // 3 second delay
        });

        // TODO: Add listeners for 'player_joined', 'opponent_disconnected', 'error', etc.

        return () => {
            console.log("Disconnecting socket...");
            newSocket.disconnect();
        };
    }, [resetClientState]); // Added resetClientState as dependency

    // --- Message Update Logic ---
    // Define updateMessage before the effect that uses it, wrap in useCallback
    const updateMessage = useCallback(() => {
        if (!gameState) {
            // Show initial message or connection status if gameState isn't loaded yet
            // setMessage is handled elsewhere for initial connection
            return;
        }

        let newMessage: string | React.ReactNode = "";
        const { gamePhase, currentPlayer, winner, isDraw, overlapJustTriggered, pendingReselect } = gameState;
        const playerString = currentPlayer === 'red' ? "Red" : "Yellow";
        const myTurn = currentPlayer === myPlayerColor;
        const iNeedToReselect = (myPlayerColor === 'red' && pendingReselect?.red) || (myPlayerColor === 'yellow' && pendingReselect?.yellow);

        switch (gamePhase) {
            case 'waiting_for_opponent':
                newMessage = (
                    <div className="flex flex-col items-center text-center">
                        <span>Game ID: <span className="font-mono bg-gray-200 px-1 rounded">{gameId}</span></span>
                        <span>Send this ID to your opponent!</span>
                        <span>Waiting for them to join...</span>
                    </div>
                );
                break;
            case 'init_select_red':
                newMessage = myPlayerColor === 'red' ? "Your turn (Red): Select your Sabotage Space" : "Waiting for Red to select Sabotage Space";
                break;
            case 'init_select_yellow':
                newMessage = myPlayerColor === 'yellow' ? "Your turn (Yellow): Select your Sabotage Space" : "Waiting for Yellow to select Sabotage Space";
                break;
            case 'sabotage_select_red':
                const redMsgPrefix = myPlayerColor === 'red' ? "Your turn (Red):" : "Waiting for Red:";
                if (overlapJustTriggered === 'red') newMessage = `${redMsgPrefix} Overlap triggered! Select new Sabotage.`;
                else if (overlapJustTriggered === 'yellow') newMessage = `${redMsgPrefix} Yellow selected. Select new Sabotage.`;
                else if (currentPlayer === 'red') newMessage = `${redMsgPrefix} You used your sabotage space! Select a NEW one.`;
                else newMessage = `${redMsgPrefix} Your sabotage was triggered by Yellow! Select a NEW one.`;
                break;
            case 'sabotage_select_yellow':
                const yellowMsgPrefix = myPlayerColor === 'yellow' ? "Your turn (Yellow):" : "Waiting for Yellow:";
                if (overlapJustTriggered === 'yellow') newMessage = `${yellowMsgPrefix} Overlap triggered! Select new Sabotage.`;
                else if (overlapJustTriggered === 'red') newMessage = `${yellowMsgPrefix} Red selected. Select new Sabotage.`;
                else if (currentPlayer === 'yellow') newMessage = `${yellowMsgPrefix} You used your sabotage space! Select a NEW one.`;
                else newMessage = `${yellowMsgPrefix} Your sabotage was triggered by Red! Select a NEW one.`;
                break;
            case 'playing':
                if (myTurn) {
                    if (iNeedToReselect) {
                        // Show reselect message even though phase is 'playing'
                        newMessage = <>Your turn (<span className={`font-semibold ${myPlayerColor === 'red' ? 'text-red-600' : 'text-yellow-600'}`}>{myPlayerColor === 'red' ? 'Red' : 'Yellow'}</span>): Select a NEW Sabotage Space</>;
                    } else {
                        // Normal playing turn message
                        newMessage = <>Your turn (<span className={`font-semibold ${myPlayerColor === 'red' ? 'text-red-600' : 'text-yellow-600'}`}>{myPlayerColor === 'red' ? 'Red' : 'Yellow'}</span>)</>;
                    }
                } else {
                    // Waiting message remains the same
                    newMessage = (
                        <span>
                            Waiting for <span className={`font-semibold ${currentPlayer === 'red' ? 'text-red-600' : 'text-yellow-600'}`}>{playerString}</span>
                        </span>
                    );
                }
                break;
            case 'game_over':
                if (winner) newMessage = <span className="text-green-700 font-bold">Player {winner === 'red' ? 'Red' : 'Yellow'} Wins! {(winner === myPlayerColor) ? "(You)" : "(Opponent)"}</span>;
                // Escape apostrophe here
                else if (isDraw) newMessage = <span className="text-gray-700 font-bold">It&apos;s a Draw!</span>;
                else newMessage = "Game Over";
                break;
            default: newMessage = "";
        }
        setMessage(newMessage);
    }, [gameState, gameId, myPlayerColor]); // Dependencies for useCallback

    // --- Message Update Effect ---
    // Separated message logic from the main game state update effect
    useEffect(() => {
        updateMessage();
        // Optional: log current state details if needed for debugging
        // console.log(`Phase: ${gameState?.gamePhase}, Current: ${gameState?.currentPlayer}, MyColor: ${myPlayerColor}, GameID: ${gameId}`);
    }, [updateMessage]); // Now only depends on the memoized updateMessage function

    // --- Game Actions (Emit events to server) ---
    const handleCreateGame = useCallback(() => {
        if (socket) {
            console.log("Emitting create_game");
            socket.emit('create_game');
            setMessage("Creating game...");
        }
    }, [socket]);

    const handleJoinGame = useCallback(() => {
        if (socket && joinGameIdInput.trim()) {
            const trimmedId = joinGameIdInput.trim();
            console.log(`Emitting join_game: ${trimmedId}`);
            socket.emit('join_game', trimmedId);
            setMessage(`Joining game ${trimmedId}...`);
            setJoinError(null); // Clear previous errors on new attempt
        }
    }, [socket, joinGameIdInput]);

    const handleRequestRematch = useCallback(() => {
        if (socket && gameId && gameState?.gamePhase === 'game_over') {
            console.log(`Emitting request_rematch for game ${gameId}`);
            socket.emit('request_rematch', { gameId });
        }
    }, [socket, gameId, gameState]);

    const handleSabotageSelectionClick = useCallback((row: number, col: number) => {
        if (!socket || !gameId || !gameState) return;

        // The render logic determines if this handler should be active via `myTurnToSelect`.
        // If this function is called, we assume it's valid and just emit the event.

        // Validate coordinates are within bounds (basic client check)
        if (row < 0 || row >= ROWS || col < 0 || col >= COLS) {
            console.error("Invalid coordinates selected on client.");
            // Maybe show a temporary error message?
            return;
        }
        // Optional: Check if cell is already occupied? 
        // if (gameState.board[row][col] !== null) return;

        console.log(`Emitting select_sabotage: ${row}, ${col}`);
        socket.emit('select_sabotage', { gameId, row, col });

    }, [socket, gameId, gameState]); // Removed myPlayerColor from dependencies as it's not used directly here anymore

    const handleColumnClick = useCallback((colIndex: number) => {
        if (!socket || !gameId || !gameState) return;
        // Only allow column click if it's this player's turn during the playing phase
        if (gameState.gamePhase === 'playing' && gameState.currentPlayer === myPlayerColor) {
            console.log(`Emitting make_move: ${colIndex}`);
            socket.emit('make_move', { gameId, col: colIndex });
        } else {
            console.log("Not your turn or not in playing phase.");
        }
    }, [socket, gameId, gameState, myPlayerColor]);

    const handleLeaveGame = useCallback(() => {
        if (socket && gameId) {
            console.log(`Emitting leave_game for game ${gameId}`);
            socket.emit('leave_game', { gameId });
            resetClientState(); // Immediately reset local state
        }
    }, [socket, gameId, resetClientState]);

    // --- Helper Functions (Mostly unchanged, but now use gameState) ---
    const getCellClass = (player: Player | null) => {
        if (player === 'red') return 'bg-red-500';
        if (player === 'yellow') return 'bg-yellow-500';
        return 'bg-gray-200';
    };

    // --- Render Logic ---
    const board = gameState?.board || createEmptyBoard(); // Use server board or empty if null
    const gamePhase = gameState?.gamePhase ?? 'initial'; // Use server phase or initial if null
    const iNeedToReselect = (myPlayerColor === 'red' && gameState?.pendingReselect.red) || (myPlayerColor === 'yellow' && gameState?.pendingReselect.yellow);
    const myTurn = gameState?.currentPlayer === myPlayerColor; // Explicit check for current turn

    // Determine button text and disabled state based on rematch requests
    let playAgainButtonText = "Play Again?";
    let playAgainDisabled = false;
    const iRequested = (myPlayerColor === 'red' && gameState?.rematchRequested.red) || (myPlayerColor === 'yellow' && gameState?.rematchRequested.yellow);
    const opponentRequested = (myPlayerColor === 'red' && gameState?.rematchRequested.yellow) || (myPlayerColor === 'yellow' && gameState?.rematchRequested.red);

    if (gamePhase === 'game_over') {
        if (iRequested && !opponentRequested) {
            playAgainButtonText = "Waiting for Opponent...";
            playAgainDisabled = true; // Already requested
        } else if (!iRequested && opponentRequested) {
            playAgainButtonText = "Accept Rematch";
            playAgainDisabled = false; // Can accept
        } else if (iRequested && opponentRequested) {
            // Should not happen for long, game resets quickly
            playAgainButtonText = "Starting Rematch...";
            playAgainDisabled = true;
        }
        // else: neither requested, default "Play Again?" and enabled
    }

    const isSelectionPhase = gamePhase.includes('select');

    // Player can select sabotage ONLY IF it's my turn AND (
    //   (it's an explicit selection phase for my color) 
    //   OR 
    //   (a reselect is pending during playing phase)
    // )
    const myTurnToSelect = myTurn && (
        (isSelectionPhase && (
            ((gamePhase === 'init_select_red' || gamePhase === 'sabotage_select_red') && myPlayerColor === 'red') ||
            ((gamePhase === 'init_select_yellow' || gamePhase === 'sabotage_select_yellow') && myPlayerColor === 'yellow')
        )) ||
        (gamePhase === 'playing' && iNeedToReselect)
    );

    // Player can play only if it's the playing phase AND my turn AND no reselect is pending
    const myTurnToPlay = myTurn && gamePhase === 'playing' && !iNeedToReselect;

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-200 to-purple-300 p-4">
            {/* Apply the font class to the h1 element */}
            <h1 className={`text-5xl font-extrabold mb-6 text-gray-800 ${quicksand.className}`}>
                Rohans Perfect Connect 4
            </h1>

            {/* Display opponent left message prominently if set */}
            {opponentLeftMessage && (
                <div className="mb-4 p-3 bg-yellow-200 text-yellow-800 border border-yellow-400 rounded-md shadow-md">
                    {opponentLeftMessage}
                </div>
            )}

            {/* Conditional Rendering: Show Create/Join buttons OR Game ID OR Board */}
            {!gameState && gamePhase === 'initial' && (
                <div className="flex flex-col items-center space-y-4">
                    <div className="flex space-x-4">
                        <button
                            onClick={handleCreateGame}
                            disabled={!socket || !!gameId}
                            className="px-6 py-3 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 disabled:bg-gray-400 transition-colors duration-200 text-lg font-semibold"
                        >
                            Create Game
                        </button>
                        <div className="flex items-center space-x-2">
                            <input
                                type="text"
                                value={joinGameIdInput}
                                onChange={(e) => setJoinGameIdInput(e.target.value)}
                                placeholder="Enter Game ID"
                                className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-700 text-gray-800"
                                disabled={!socket || !!gameId}
                            />
                            <button
                                onClick={handleJoinGame}
                                disabled={!socket || !!gameId || !joinGameIdInput.trim()}
                                className="px-6 py-3 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 disabled:bg-gray-400 transition-colors duration-200 text-lg font-semibold"
                            >
                                Join Game
                            </button>
                        </div>
                    </div>
                    {/* Rules Button - Moved and Centered Below */}
                    <div className="w-full flex justify-center mt-4">
                        <button
                            onClick={() => setShowRules(!showRules)}
                            className="px-6 py-3 bg-gray-500 text-white rounded-lg shadow hover:bg-gray-600 disabled:bg-gray-400 transition-colors duration-200 text-lg font-semibold"
                        >
                            Rules
                        </button>
                    </div>
                    {joinError && (
                        <p className="mt-2 text-red-600 font-semibold">Error: {joinError}</p>
                    )}
                    {/* Rules Dropdown - Added Here */}
                    {showRules && (
                        <div className="mt-4 p-4 bg-white rounded-lg shadow-lg border border-gray-300 max-w-md w-full text-left text-sm">
                            <h3 className="text-lg font-semibold mb-2 text-gray-700">Game Rules</h3>
                            {/* Use pre-wrap to preserve formatting */}
                            <pre className="whitespace-pre-wrap text-gray-600">{rulesText}</pre>
                            {/* Center the Close button */}
                            <div className="w-full flex justify-center mt-3">
                                <button
                                    onClick={() => setShowRules(false)}
                                    className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-xs"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {(gameState || gameId) && !opponentLeftMessage && ( // Only show game if opponent hasn't left
                <> {/* Fragment to group game elements */}
                    <div className="flex justify-between items-center w-full max-w-lg mb-4">
                        <div className="text-2xl text-gray-700 flex-grow text-center min-h-[3rem] flex items-center justify-center">
                            {message}
                        </div>
                    </div>

                    <div className="relative">
                        <div className="grid grid-cols-7 gap-2 bg-blue-700 p-3 rounded-lg mb-6 shadow-xl border-4 border-blue-800">
                            {board.map((row, rowIndex) =>
                                row.map((cell, colIndex) => {
                                    // Determine if the cell is clickable based on phase and turn
                                    // const canClickCell = myTurnToSelect; // No longer needed directly
                                    const canClickColumn = gamePhase === 'playing' && myTurnToPlay;

                                    // Assign click handler based on whether selection or playing is appropriate
                                    const clickHandler = myTurnToSelect
                                        ? () => handleSabotageSelectionClick(rowIndex, colIndex)
                                        : () => handleColumnClick(colIndex); // Column handler will only be effective if myTurnToPlay is true

                                    // Cell is disabled if game is over OR it's not my turn to select/play
                                    const isDisabled = gamePhase === 'game_over' || (!myTurnToSelect && !myTurnToPlay);

                                    // Cursor depends on whether selecting or playing is possible
                                    const cursorStyle = isDisabled ? 'cursor-default' : (myTurnToSelect ? 'cursor-crosshair' : 'cursor-pointer');

                                    // Highlight potential sabotage selection for the current player
                                    const selectionHoverClass = myTurnToSelect
                                        ? (myPlayerColor === 'red' ? 'group-hover:bg-red-400' : 'group-hover:bg-yellow-400')
                                        : '';

                                    // Highlight playable columns on hover during playing phase
                                    const playHoverClass = canClickColumn ? 'hover:bg-blue-400' : '';

                                    const innerCircleClass = cell === null && myTurnToSelect
                                        ? selectionHoverClass
                                        : getCellClass(cell);

                                    return (
                                        <div
                                            key={`${rowIndex}-${colIndex}`}
                                            // Use group for column hover effect if needed
                                            className={`group w-12 h-12 md:w-16 md:h-16 flex items-center justify-center rounded-full bg-blue-500 ${cursorStyle} ${playHoverClass} transition-colors duration-150`}
                                            onClick={!isDisabled ? clickHandler : undefined}
                                        >
                                            <div
                                                // Apply hover effect to the inner circle during selection phase
                                                className={`w-10 h-10 md:w-14 md:h-14 rounded-full ${innerCircleClass} shadow-lg border-2 ${cell ? (cell === 'red' ? 'border-red-800' : 'border-yellow-800') : 'border-gray-400'} transition-colors duration-150`}
                                            ></div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                        {/* Wrap button in a div for centering */}
                        <div className="w-full flex justify-center">
                            {gamePhase !== 'game_over' && gamePhase !== 'initial' && (
                                <button
                                    onClick={handleLeaveGame}
                                    className="mt-2 mb-4 px-4 py-2 bg-red-600 text-white rounded-lg shadow hover:bg-red-700 transition-colors duration-200 text-sm font-semibold"
                                >
                                    Leave Game
                                </button>
                            )}
                        </div>
                    </div>

                    {gamePhase === 'game_over' && (
                        <div className="mt-4 text-center"> {/* Wrap button and potential message */}
                            <button
                                onClick={handleRequestRematch} // Use new handler
                                disabled={playAgainDisabled} // Use dynamic disabled state
                                className="px-6 py-3 bg-indigo-600 text-white rounded-lg shadow hover:bg-indigo-700 disabled:bg-gray-400 transition-colors duration-200 text-lg font-semibold"
                            >
                                {playAgainButtonText} {/* Use dynamic text */}
                            </button>
                            {/* Optionally, add a message if waiting */}
                            {iRequested && !opponentRequested && (
                                <p className="mt-2 text-gray-600">Rematch request sent.</p>
                            )}
                            {!iRequested && opponentRequested && (
                                <p className="mt-2 text-green-600">Opponent wants a rematch!</p>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default Connect4; 