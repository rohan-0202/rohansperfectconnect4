import React from 'react';

interface GameInfoProps {
    message: string | React.ReactNode;
    opponentLeftMessage: string | null;
}

const GameInfo: React.FC<GameInfoProps> = ({ message, opponentLeftMessage }) => {
    return (
        <div className="relative flex flex-col items-center w-full max-w-md md:max-w-lg lg:max-w-xl z-10 mb-4">
            {/* Display opponent left message prominently if set */}
            {opponentLeftMessage && (
                <div className="mb-4 p-3 bg-yellow-200 text-yellow-800 border border-yellow-400 rounded-md shadow-md w-full text-center">
                    {opponentLeftMessage}
                </div>
            )}

            {/* Game Status Message */}
            {!opponentLeftMessage && ( // Only show game message if opponent hasn't left
                <div className="flex justify-center items-center w-full min-h-[4rem]">
                    <div className="text-lg sm:text-xl md:text-2xl text-gray-700 text-center">
                        {message}
                    </div>
                </div>
            )}
        </div>
    );
};

export default GameInfo; 