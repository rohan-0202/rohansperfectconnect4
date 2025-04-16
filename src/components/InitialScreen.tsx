import React from 'react';
import { Socket } from "socket.io-client";
import { Quicksand } from 'next/font/google'; // Import the font
import RulesDisplay from './RulesDisplay'; // Import RulesDisplay

// Instantiate the font (assuming the same configuration)
const quicksand = Quicksand({ subsets: ['latin'], weight: ['400', '700'] });

interface InitialScreenProps {
    socket: Socket | null;
    gameId: string | null;
    handleCreateGame: () => void;
    handleJoinGame: () => void;
    joinGameIdInput: string;
    setJoinGameIdInput: (id: string) => void;
    joinError: string | null;
    showRules: boolean;
    setShowRules: (show: boolean) => void;
    rulesText: string;
}

const InitialScreen: React.FC<InitialScreenProps> = ({
    socket,
    gameId,
    handleCreateGame,
    handleJoinGame,
    joinGameIdInput,
    setJoinGameIdInput,
    joinError,
    showRules,
    setShowRules,
    rulesText
}) => {
    return (
        <div className="relative flex flex-col items-center space-y-4 w-full px-2 z-10">
            <div className="flex flex-col sm:flex-row items-center space-y-3 sm:space-y-0 sm:space-x-4 w-full justify-center">
                <button
                    onClick={handleCreateGame}
                    disabled={!socket || !!gameId}
                    className="w-full sm:w-auto px-4 py-2 sm:px-6 sm:py-3 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 disabled:bg-gray-400 transition-colors duration-200 text-base sm:text-lg font-semibold"
                >
                    Create Game
                </button>
                <div className="flex flex-col sm:flex-row items-center space-y-3 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
                    <input
                        type="text"
                        value={joinGameIdInput}
                        onChange={(e) => setJoinGameIdInput(e.target.value)}
                        placeholder="Enter Game ID"
                        className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-700 text-gray-800"
                        disabled={!socket || !!gameId}
                    />
                    <button
                        onClick={handleJoinGame}
                        disabled={!socket || !!gameId || !joinGameIdInput.trim()}
                        className="w-full sm:w-auto px-4 py-2 sm:px-6 sm:py-3 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 disabled:bg-gray-400 transition-colors duration-200 text-base sm:text-lg font-semibold"
                    >
                        Join Game
                    </button>
                </div>
            </div>
            {/* Server Note */}
            <p className={`mt-4 text-lg text-gray-800 text-center ${quicksand.className}`}>
                Note: Server falls asleep if unused for a while! If you can&apos;t create a room, just wait a minute!
            </p>
            <div className="w-full flex justify-center mt-4">
                <button
                    onClick={() => setShowRules(!showRules)}
                    className="px-4 py-2 sm:px-6 sm:py-3 bg-gray-500 text-white rounded-lg shadow hover:bg-gray-600 disabled:bg-gray-400 transition-colors duration-200 text-base sm:text-lg font-semibold"
                >
                    Rules
                </button>
            </div>
            {joinError && (
                <p className="mt-2 text-red-600 font-semibold">Error: {joinError}</p>
            )}
            {/* Render RulesDisplay conditionally */}
            <RulesDisplay
                rulesText={rulesText}
                showRules={showRules}
                setShowRules={setShowRules}
            />
        </div>
    );
};

export default InitialScreen; 