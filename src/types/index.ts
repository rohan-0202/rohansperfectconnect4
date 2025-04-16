export type Player = 'red' | 'yellow' | null;

export type Board = (Player | null)[][];
export type SabotageSpot = { row: number, col: number } | null;
export type GamePhase = 'init_select_red' | 'init_select_yellow' | 'playing' | 'sabotage_select_red' | 'sabotage_select_yellow' | 'game_over' | 'waiting_for_opponent' | 'initial';

export interface GameState {
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