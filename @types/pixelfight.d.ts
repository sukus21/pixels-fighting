import Faction from "../faction.js";

type PixelGameData = {
    iterations: bigint,
    factions: Faction[],
    counts: BigUint64Array,
};

type PixelFightConstructor = {
    new (factions: Faction[], width: number, height: number): PixelFight,
}

interface PixelFight {
    reset(): void;
    step(): void;
    draw(): void;
    getCanvas(): HTMLCanvasElement;
    getGameData(): PixelGameData;
}
