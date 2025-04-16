import React from 'react';

interface RulesDisplayProps {
    rulesText: string;
    showRules: boolean;
    setShowRules: (show: boolean) => void;
}

const RulesDisplay: React.FC<RulesDisplayProps> = ({ rulesText, showRules, setShowRules }) => {
    if (!showRules) {
        return null;
    }

    return (
        <div className="mt-4 p-4 bg-white rounded-lg shadow-lg border border-gray-300 max-w-md w-full text-left text-sm z-20">
            <h3 className="text-lg font-semibold mb-2 text-gray-700">Game Rules</h3>
            <pre className="whitespace-pre-wrap text-gray-600">{rulesText}</pre>
            <div className="w-full flex justify-center mt-3">
                <button
                    onClick={() => setShowRules(false)}
                    className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-xs"
                >
                    Close
                </button>
            </div>
        </div>
    );
};

export default RulesDisplay; 