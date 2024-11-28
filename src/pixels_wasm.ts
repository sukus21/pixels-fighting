import { PixelFight, PixelGameData } from "./@types/pixelfight.js";
import Faction from "./faction.js";

type PixelWasmExports = {
    memory: WebAssembly.Memory;
    init: (width: number, height: number, factionCount: number) => void;
    factionColor: (factionId: number, color: number) => void;
    getFactionCount: (factionId: number) => bigint;
    getIterations: () => bigint;

    reset: () => void;
    draw: () => void;
    step: () => void;
};

const wasmResponse = fetch('./pixels.wasm');
const wasmModule = await WebAssembly.compileStreaming(wasmResponse);

export default class PixelFightWASM implements PixelFight {
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
    instance: PixelWasmExports;
    memory: ArrayBuffer;

    reset: () => void;
    draw: () => void;
    step: () => void;

    constructor(
        private readonly factions: Faction[],
        width: number,
        height: number,) {

        // Create canvas
        this.canvas = document.createElement("canvas");
        this.canvas.width = width;
        this.canvas.height = height;
        this.context = this.canvas.getContext("2d");

        // Create WASM instance
        const image = new ImageData(width, height);
        const instance = new WebAssembly.Instance(wasmModule, {
            deps: {
                atan2: Math.atan2,
                getRngSeed: () => Math.random() * 0x00FF_FFFF,
                updatePixels: (start: number, end: number) => {
                    image.data.set(new Uint8Array(this.memory).subarray(start, end));
                    this.context.putImageData(image, 0, 0);
                },
            },
        });

        // Initialize WASM runner
        this.instance = instance.exports as PixelWasmExports;
        this.instance.init(width, height, factions.length);
        this.memory = this.instance.memory.buffer;
        for (let i = 0; i < factions.length; i++) {
            this.instance.factionColor(i, factions[i].rgb);
        }

        // Point fight interface to WASM instance
        this.reset = this.instance.reset;
        this.draw = this.instance.draw;
        this.step = this.instance.step;

        // Reset
        this.reset();
    }

    getCanvas(): HTMLCanvasElement {
        return this.canvas;
    }

    getGameData(): PixelGameData {
        const counts = new BigUint64Array(this.factions.length);
        for(let i = 0; i < this.factions.length; i++) {
            counts[i] = this.instance.getFactionCount(i);
        }
        return {
            iterations: this.instance.getIterations(),
            factions: this.factions,
            counts: counts,
        };
    }
}
