export type PixelWasmExports = {
    memory: WebAssembly.Memory;
    init: (width: number, height: number, factionCount: number) => void;
    factionColor: (factionId: number, color: number) => void;
    getFactionCount: (factionId: number) => bigint;
    getIterations: () => bigint;

    reset: () => void;
    draw: () => void;
    step: () => void;
};
