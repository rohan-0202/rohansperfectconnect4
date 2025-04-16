import React from 'react';
import { Player, GameState } from '@/types';

const ROWS = 6;
const COLS = 7;

// Helper function
const getCellClass = (player: Player | null) => {
    if (player === 'red') return 'bg-red-500';
    if (player === 'yellow') return 'bg-yellow-500';
    return 'bg-gray-200';
};

interface GameBoardProps {
    board: (Player | null)[][];
    gameState: GameState | null;
    myPlayerColor: Player | null;
    handleSabotageSelectionClick: (row: number, col: number) => void;
    handleColumnClick: (col: number) => void;
    myTurnToSelect: boolean;
    myTurnToPlay: boolean;
}

const GameBoard: React.FC<GameBoardProps> = ({
    board,
    gameState,
    myPlayerColor,
    handleSabotageSelectionClick,
    handleColumnClick,
    myTurnToSelect,
    myTurnToPlay
}) => {

    const gamePhase = gameState?.gamePhase;

    return (
        <div className="grid grid-cols-7 gap-1 sm:gap-2 bg-blue-700 p-2 sm:p-3 rounded-lg mb-4 sm:mb-6 shadow-xl border-2 sm:border-4 border-blue-800 w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg">
            {board.map((row, rowIndex) =>
                row.map((cell, colIndex) => {
                    // Determine click handler
                    const clickHandler = myTurnToSelect
                        ? () => handleSabotageSelectionClick(rowIndex, colIndex)
                        : () => handleColumnClick(colIndex);

                    // Determine if interaction is disabled
                    const isDisabled = gamePhase === 'game_over' || (!myTurnToSelect && !myTurnToPlay);

                    // Determine cursor style
                    const cursorStyle = isDisabled ? 'cursor-default' : (myTurnToSelect ? 'cursor-crosshair' : 'cursor-pointer');

                    // Hover effects for selection
                    const selectionHoverClass = myTurnToSelect
                        ? (myPlayerColor === 'red' ? 'group-hover:bg-red-300' : 'group-hover:bg-yellow-300')
                        : '';

                    // Hover effects for playing
                    const playHoverClass = myTurnToPlay ? 'hover:bg-blue-400' : '';

                    // Check if this is the player's own sabotage spot
                    const isMySabotageSpot =
                        (myPlayerColor === 'red' && gameState?.redSabotage?.row === rowIndex && gameState?.redSabotage?.col === colIndex) ||
                        (myPlayerColor === 'yellow' && gameState?.yellowSabotage?.row === rowIndex && gameState?.yellowSabotage?.col === colIndex);

                    // Determine inner circle class
                    let innerCircleClass = '';
                    if (cell !== null) {
                        innerCircleClass = getCellClass(cell);
                    } else if (isMySabotageSpot) {
                        innerCircleClass = 'bg-gray-600 opacity-50';
                    } else if (myTurnToSelect) {
                        innerCircleClass = `bg-gray-200 ${selectionHoverClass}`;
                    } else {
                        innerCircleClass = 'bg-gray-200';
                    }

                    return (
                        <div
                            key={`${rowIndex}-${colIndex}`}
                            className={`group aspect-square flex items-center justify-center rounded-full bg-blue-500 ${cursorStyle} ${playHoverClass} transition-colors duration-150`}
                            onClick={!isDisabled ? clickHandler : undefined}
                        >
                            <div
                                className={`w-[85%] h-[85%] rounded-full ${innerCircleClass} shadow-inner border ${cell ? (cell === 'red' ? 'border-red-700' : 'border-yellow-700') : 'border-gray-400'} transition-colors duration-150`}
                            >
                                {/* Inner div */}
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
};

export default GameBoard; 