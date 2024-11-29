import Faction from "../faction.js";

type PixelGameData = {
    iterations: bigint,
    factions: Faction[],
    counts: BigUint64Array,
};

type PixelFightParams = {
    factions: Faction[],
    width: number,
    height: number,
    updateGameData: (gameData: PixelGameData) => void,
};

type PixelFightConstructor = {
    new (params: PixelFightParams): PixelFight,
}

interface PixelFight {
    reset(): void;
    step(): void;
    draw(): void;
    getCanvas(): HTMLCanvasElement;
}
