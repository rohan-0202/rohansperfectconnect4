import React from 'react';
import { GamePhase, Player } from '@/types';

interface GameControlsProps {
    gamePhase: GamePhase;
    handleLeaveGame: () => void;
    handleRequestRematch: () => void;
    playAgainButtonText: string;
    playAgainDisabled: boolean;
    iRequested: boolean;
    opponentRequested: boolean;
}

const GameControls: React.FC<GameControlsProps> = ({
    gamePhase,
    handleLeaveGame,
    handleRequestRematch,
    playAgainButtonText,
    playAgainDisabled,
    iRequested,
    opponentRequested
}) => {
    return (
        <div className="relative w-full flex flex-col items-center mt-4 z-10"> {/* Added z-index */}
            {/* Leave Game Button (shown during active game phases) */}
            {gamePhase !== 'game_over' && gamePhase !== 'initial' && gamePhase !== 'waiting_for_opponent' && (
                <div className="w-full flex justify-center mb-4"> {/* Added mb-4 for spacing */}
                    <button
                        onClick={handleLeaveGame}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg shadow hover:bg-red-700 transition-colors duration-200 text-sm sm:text-base font-semibold"
                    >
                        Leave Game
                    </button>
                </div>
            )}

            {/* Rematch Section (shown only when game is over) */}
            {gamePhase === 'game_over' && (
                <div className="text-center"> {/* Removed mt-4, handled by parent container */}
                    <button
                        onClick={handleRequestRematch}
                        disabled={playAgainDisabled}
                        className="px-4 py-2 sm:px-6 sm:py-3 bg-indigo-600 text-white rounded-lg shadow hover:bg-indigo-700 disabled:bg-gray-400 transition-colors duration-200 text-base sm:text-lg font-semibold"
                    >
                        {playAgainButtonText}
                    </button>
                    {/* Optional feedback messages based on request state */}
                    {iRequested && !opponentRequested && (
                        <p className="mt-2 text-gray-600">Rematch request sent.</p>
                    )}
                    {!iRequested && opponentRequested && (
                        <p className="mt-2 text-green-600">Opponent wants a rematch!</p>
                    )}
                </div>
            )}
        </div>
    );
};

export default GameControls; 