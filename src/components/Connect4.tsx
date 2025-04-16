"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Player, GameState, Board, GamePhase } from '@/types'; // <-- Import types
import { io, Socket } from "socket.io-client";
import { Quicksand } from 'next/font/google';

// Import child components
import GameBoard from './GameBoard';
import GameInfo from './GameInfo';
import InitialScreen from './InitialScreen';
import GameControls from './GameControls';
import DecorativePieces from './DecorativePieces';

// Instantiate the font
const quicksand = Quicksand({ subsets: ['latin'], weight: ['400', '700'] });

// --- Removed Server Type Duplication --- 

const ROWS = 6;
const COLS = 7;

const createEmptyBoard = (): Board => {
    return Array(ROWS).fill(null).map(() => Array(COLS).fill(null));
};

const Connect4: React.FC = () => {
    // --- State Management --- 
    const [gameState, setGameState] = useState<GameState | null>(null); // Holds the entire game state from server
    const [socket, setSocket] = useState<Socket | null>(null);
    const [message, setMessage] = useState<string | React.ReactNode>("Connecting...");
    const [gameId, setGameId] = useState<string | null>(null);
    const [myPlayerColor, setMyPlayerColor] = useState<Player | null>(null); // <-- Fixed type
    const [joinGameIdInput, setJoinGameIdInput] = useState<string>("");
    const [joinError, setJoinError] = useState<string | null>(null);
    const [opponentLeftMessage, setOpponentLeftMessage] = useState<string | null>(null);
    const [showRules, setShowRules] = useState<boolean>(false);
    const [isMounted, setIsMounted] = useState(false);

    // --- Constant Data --- 
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
*   If a player chooses to place a tile on their own Sabotage Space, they are allowed to pick a new Sabotage Space at the beginning of their next turn.
*   If both players have the same Sabotage Space, the effect is cancelled out without either player knowing until either player places a tile there, and then both players pick new Sabotage Spaces.
    `;

    // --- Effects --- 
    useEffect(() => {
        setIsMounted(true);
    }, []);

    const resetClientState = useCallback(() => {
        setGameState(null);
        setGameId(null);
        setMyPlayerColor(null);
        setJoinGameIdInput("");
        setJoinError(null);
        setMessage("Create or Join a Game.");
    }, []);

    useEffect(() => {
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
        });

        newSocket.on('game_joined', ({ gameId: joinedGameId, playerColor }) => {
            console.log(`Successfully joined game ${joinedGameId} as ${playerColor}`);
            setGameId(joinedGameId);
            setMyPlayerColor(playerColor);
            setJoinError(null);
        });

        newSocket.on('join_error', ({ message: errorMessage }) => {
            console.error("Join error:", errorMessage);
            setJoinError(errorMessage);
            setMessage("Failed to join game. See error below.");
        });

        newSocket.on('game_update', (newGameState: GameState) => {
            console.log("Received game update:", newGameState);
            setGameState(newGameState);

            // Read latest player color inside the event handler if needed
            // This check remains correct as it uses the newGameState
            if (newSocket.id && newGameState.players) {
                const myNewColor = newGameState.players[newSocket.id] || null;
                // Use a functional update if comparing against the *absolute* latest state is critical
                // or rely on the fact that this listener closes over the `myPlayerColor` from its definition.
                // For this specific check, the closed-over value is likely sufficient.
                setMyPlayerColor(prevColor => {
                    if (myNewColor !== prevColor) {
                        console.log(`My color changed from ${prevColor} to ${myNewColor}`);
                        return myNewColor;
                    }
                    return prevColor;
                });
            }
        });

        newSocket.on('connect_error', (err) => {
            console.error("Connection error:", err);
            setMessage("Failed to connect to server.");
            setGameState(null);
            setGameId(null);
        });

        newSocket.on('opponent_left', () => {
            console.log("Opponent left the game.");
            setOpponentLeftMessage("Your opponent has left the game.");
            setTimeout(() => {
                resetClientState();
                setOpponentLeftMessage(null);
            }, 4000);
        });

        return () => {
            console.log("Disconnecting socket...");
            newSocket.disconnect();
        };
    }, [resetClientState]);


    const updateMessage = useCallback(() => {
        if (opponentLeftMessage) return; // Don't update message if opponent left message is showing

        if (!gameState) {
            // Handle states before gameState is populated (connecting, initial, waiting)
            if (gameId && !gameState) { // We have a gameId but no state yet (likely waiting)
                setMessage(
                    <div className="flex flex-col items-center text-center">
                        <span>Game ID: <span className="font-mono bg-gray-200 px-1 rounded">{gameId}</span></span>
                        <span>Send this ID to your opponent!</span>
                        <span>Waiting for them to join...</span>
                    </div>
                );
            } else if (!socket?.connected) {
                setMessage("Connecting...");
            } else if (!gameId) {
                setMessage("Connected! Create or Join a Game.");
            }
            return;
        }

        let newMessage: string | React.ReactNode = "";
        const { gamePhase, currentPlayer, winner, isDraw, overlapJustTriggered, pendingReselect } = gameState;
        const playerString = currentPlayer === 'red' ? "Red" : "Yellow";
        const myTurn = currentPlayer === myPlayerColor;
        const iNeedToReselect = (myPlayerColor === 'red' && pendingReselect?.red) || (myPlayerColor === 'yellow' && pendingReselect?.yellow);

        switch (gamePhase) {
            case 'waiting_for_opponent': // Should be covered by !gameState block, but keep for robustness
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
                if (overlapJustTriggered) newMessage = `${redMsgPrefix} Overlap triggered! Select new Sabotage.`; // Simplified logic, server state dictates who selects
                else newMessage = `${redMsgPrefix} Select a NEW Sabotage Space.`; // General message
                break;
            case 'sabotage_select_yellow':
                const yellowMsgPrefix = myPlayerColor === 'yellow' ? "Your turn (Yellow):" : "Waiting for Yellow:";
                if (overlapJustTriggered) newMessage = `${yellowMsgPrefix} Overlap triggered! Select new Sabotage.`;
                else newMessage = `${yellowMsgPrefix} Select a NEW Sabotage Space.`;
                break;
            case 'playing':
                if (myTurn) {
                    if (iNeedToReselect) {
                        newMessage = (
                            <div className="flex flex-col items-center text-center">
                                <span>Your turn (<span className={`font-semibold ${myPlayerColor === 'red' ? 'text-red-600' : 'text-yellow-600'}`}>{myPlayerColor === 'red' ? 'Red' : 'Yellow'}</span>):</span>
                                <span className="text-orange-600 font-bold">Select a NEW Sabotage Space</span>
                            </div>
                        );
                    } else {
                        newMessage = <>Your turn (<span className={`font-semibold ${myPlayerColor === 'red' ? 'text-red-600' : 'text-yellow-600'}`}>{myPlayerColor === 'red' ? 'Red' : 'Yellow'}</span>)</>;
                    }
                } else {
                    newMessage = (
                        <span>
                            Waiting for <span className={`font-semibold ${currentPlayer === 'red' ? 'text-red-600' : 'text-yellow-600'}`}>{playerString}</span>
                        </span>
                    );
                }
                break;
            case 'game_over':
                if (winner) newMessage = <span className="text-green-700 font-bold">Player {winner === 'red' ? 'Red' : 'Yellow'} Wins! {(winner === myPlayerColor) ? " (You)" : " (Opponent)"}</span>;
                else if (isDraw) newMessage = <span className="text-gray-700 font-bold">It&apos;s a Draw!</span>;
                else newMessage = "Game Over";
                break;
            default: newMessage = ""; // Should not happen
        }
        setMessage(newMessage);
    }, [gameState, gameId, myPlayerColor, socket?.connected, opponentLeftMessage]); // Added socket.connected and opponentLeftMessage

    useEffect(() => {
        updateMessage();
    }, [updateMessage]);

    // --- Game Actions --- 
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
            setJoinError(null);
        }
    }, [socket, joinGameIdInput]);

    const handleRequestRematch = useCallback(() => {
        if (socket && gameId && gameState?.gamePhase === 'game_over') {
            console.log(`Emitting request_rematch for game ${gameId}`);
            socket.emit('request_rematch', { gameId });
        }
    }, [socket, gameId, gameState]);

    const handleSabotageSelectionClick = useCallback((row: number, col: number) => {
        if (!socket || !socket.id || !gameId || !gameState) return;

        const playerColor = gameState.players[socket.id];
        if (!playerColor) return;

        const currentPhase = gameState.gamePhase;
        const myTurn = gameState.currentPlayer === playerColor;
        const iNeedToReselect = (playerColor === 'red' && gameState.pendingReselect.red) || (playerColor === 'yellow' && gameState.pendingReselect.yellow);

        let canSelect = false;
        if (myTurn) {
            if ((currentPhase === 'init_select_red' || currentPhase === 'sabotage_select_red') && playerColor === 'red') {
                canSelect = true;
            } else if ((currentPhase === 'init_select_yellow' || currentPhase === 'sabotage_select_yellow') && playerColor === 'yellow') {
                canSelect = true;
            } else if (currentPhase === 'playing' && iNeedToReselect) {
                canSelect = true;
            }
        }

        if (!canSelect) {
            console.log("Client validation: Not your turn to select sabotage.");
            return;
        }

        if (row < 0 || row >= ROWS || col < 0 || col >= COLS) {
            console.error("Invalid coordinates selected on client.");
            return;
        }

        console.log(`Emitting select_sabotage: ${row}, ${col}`);
        socket.emit('select_sabotage', { gameId, row, col });

    }, [socket, gameId, gameState]);

    const handleColumnClick = useCallback((colIndex: number) => {
        if (!socket || !socket.id || !gameId || !gameState) return;

        const playerColor = gameState.players[socket.id];
        if (!playerColor) return;

        const myTurn = gameState.currentPlayer === playerColor;
        const iNeedToReselect = (playerColor === 'red' && gameState.pendingReselect.red) || (playerColor === 'yellow' && gameState.pendingReselect.yellow);

        if (gameState.gamePhase === 'playing' && myTurn && !iNeedToReselect) {
            console.log(`Emitting make_move: ${colIndex}`);
            socket.emit('make_move', { gameId, col: colIndex });
        } else {
            if (gameState.gamePhase !== 'playing') console.log("Client validation: Not in playing phase.");
            else if (!myTurn) console.log("Client validation: Not your turn.");
            else if (iNeedToReselect) console.log("Client validation: Must select sabotage first.");
        }
    }, [socket, gameId, gameState]);

    const handleLeaveGame = useCallback(() => {
        if (socket && gameId) {
            console.log(`Emitting leave_game for game ${gameId}`);
            socket.emit('leave_game', { gameId });
            resetClientState();
        }
    }, [socket, gameId, resetClientState]);

    // --- Derived State for Rendering --- 
    const board = gameState?.board || createEmptyBoard();
    const gamePhase = gameState?.gamePhase ?? 'initial';
    const myTurn = gameState?.currentPlayer === myPlayerColor;
    const iNeedToReselect = !!(myPlayerColor && gameState && (
        (myPlayerColor === 'red' && gameState.pendingReselect.red) ||
        (myPlayerColor === 'yellow' && gameState.pendingReselect.yellow)
    ));

    // Determine button text and disabled state based on rematch requests
    let playAgainButtonText = "Play Again?";
    let playAgainDisabled = false;

    // Ensure these default to false if gameState or myPlayerColor is null
    const iRequested = !!(myPlayerColor && gameState && (
        (myPlayerColor === 'red' && gameState.rematchRequested.red) ||
        (myPlayerColor === 'yellow' && gameState.rematchRequested.yellow)
    ));
    const opponentRequested = !!(myPlayerColor && gameState && (
        (myPlayerColor === 'red' && gameState.rematchRequested.yellow) ||
        (myPlayerColor === 'yellow' && gameState.rematchRequested.red)
    ));

    if (gamePhase === 'game_over') {
        if (iRequested && !opponentRequested) {
            playAgainButtonText = "Waiting for Opponent...";
            playAgainDisabled = true;
        } else if (!iRequested && opponentRequested) {
            playAgainButtonText = "Accept Rematch";
            playAgainDisabled = false;
        } else if (iRequested && opponentRequested) {
            playAgainButtonText = "Starting Rematch...";
            playAgainDisabled = true;
        }
    }

    const isSelectionPhase = gamePhase.includes('select');

    const myTurnToSelect = !!(myTurn && (
        (isSelectionPhase && (
            ((gamePhase === 'init_select_red' || gamePhase === 'sabotage_select_red') && myPlayerColor === 'red') ||
            ((gamePhase === 'init_select_yellow' || gamePhase === 'sabotage_select_yellow') && myPlayerColor === 'yellow')
        )) ||
        (gamePhase === 'playing' && iNeedToReselect)
    ));

    const myTurnToPlay = !!(myTurn && gamePhase === 'playing' && !iNeedToReselect);

    // --- Render Logic --- 
    return (
        <div className="relative flex flex-col items-center justify-center min-h-screen bg-[#FDECE2] p-2 sm:p-4 overflow-hidden">
            {/* Decorative Images */}
            <DecorativePieces isMounted={isMounted} />

            {/* Title */}
            <h1 className={`relative text-3xl sm:text-4xl md:text-5xl font-extrabold mb-4 sm:mb-6 text-gray-800 ${quicksand.className} text-center z-10`}>
                Rohans Perfect Connect 4
            </h1>

            {/* Initial Screen (Create/Join/Rules) */}
            {gamePhase === 'initial' && !gameId && !opponentLeftMessage && (
                <InitialScreen
                    socket={socket}
                    gameId={gameId}
                    handleCreateGame={handleCreateGame}
                    handleJoinGame={handleJoinGame}
                    joinGameIdInput={joinGameIdInput}
                    setJoinGameIdInput={setJoinGameIdInput}
                    joinError={joinError}
                    showRules={showRules}
                    setShowRules={setShowRules}
                    rulesText={rulesText}
                />
            )}

            {/* Game Area (Info, Board, Controls) - Show if game exists and opponent hasn't left */}
            {(gameState || gameId) && !opponentLeftMessage && gamePhase !== 'initial' && (
                <div className="relative flex flex-col items-center w-full max-w-md md:max-w-lg lg:max-w-xl z-10">
                    {/* Game Info Display */}
                    <GameInfo
                        message={message}
                        opponentLeftMessage={null} // Opponent left handled globally
                    />

                    {/* Game Board */}
                    <GameBoard
                        board={board}
                        gameState={gameState}
                        myPlayerColor={myPlayerColor}
                        handleSabotageSelectionClick={handleSabotageSelectionClick}
                        handleColumnClick={handleColumnClick}
                        myTurnToSelect={myTurnToSelect}
                        myTurnToPlay={myTurnToPlay}
                    />

                    {/* Game Controls (Leave/Rematch) */}
                    <GameControls
                        gamePhase={gamePhase}
                        handleLeaveGame={handleLeaveGame}
                        handleRequestRematch={handleRequestRematch}
                        playAgainButtonText={playAgainButtonText}
                        playAgainDisabled={playAgainDisabled}
                        iRequested={iRequested}
                        opponentRequested={opponentRequested}
                    />
                </div>
            )}

            {/* Display opponent left message globally if set */}
            {opponentLeftMessage && (
                <GameInfo
                    message="" // No regular message when opponent left msg is shown
                    opponentLeftMessage={opponentLeftMessage}
                />
            )}
        </div>
    );
};

export default Connect4; 