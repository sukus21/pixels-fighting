import Faction from "../faction.js";

type PopulatorImplementation =
    "uneven" |
    "image"
;

type PixelCoordinateInfo = {
    x: number,
    y: number,
    u: number,
    v: number,
    index: number,
    factions: Faction[],
};

/**
 * Returns ID of faction.
 * Returned value must be less than factions.length.
 */
type ImagePopulator = (info: PixelCoordinateInfo) => number;
