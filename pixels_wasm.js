// @ts-check

/**
 * @import { PixelFight, PixelGameData } from "./@types/pixelfight";
 * @import { PixelWasmExports } from "./@types/wasm_export";
 */

import Faction from "./faction.js";

const wasmResponse = await fetch('./pixels.wasm');
const wasmModule = await WebAssembly.compile(await wasmResponse.arrayBuffer());

/**
 * @implements {PixelFight}
 */
export default class PixelFightWASM {
    /** @type {Faction[]} */ factions;
    
    /** @type {HTMLCanvasElement} */ canvas;
    /** @type {CanvasRenderingContext2D} */ context;
    /** @type {PixelWasmExports} */ instance;
    /** @type {ArrayBuffer} */ memory;

    /** @type {() => void} */ reset;
    /** @type {() => void} */ draw;
    /** @type {() => void} */ step;

    /**
     * @param {Faction[]} factions
     * @param {number} width
     * @param {number} height
     */
    constructor(factions, width, height) {
        this.factions = factions;

        // Create canvas
        this.canvas = document.createElement("canvas");
        this.canvas.width = width;
        this.canvas.height = height;
        const ctx = this.canvas.getContext("2d");
        if (!ctx) throw new Error("CanvasContext2D not available");
        this.context = ctx;

        // Create WASM instance
        const image = new ImageData(width, height);
        const instance = new WebAssembly.Instance(wasmModule, {
            deps: {
                atan2: Math.atan2,
                getRngSeed: () => Math.random() * 0x00FF_FFFF,
                /**
                 * @param {number} start
                 * @param {number} end
                 */
                updatePixels: (start, end) => {
                    image.data.set(new Uint8Array(this.memory).subarray(start, end));
                    this.context.putImageData(image, 0, 0);
                },
            },
        });

        // Initialize WASM runner
        this.instance = /** @type {PixelWasmExports} */ (instance.exports);
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

    /**
     * @returns {HTMLCanvasElement}
     */
    getCanvas() {
        return this.canvas;
    }

    /**
     * @returns {PixelGameData}
     */
    getGameData() {
        const counts = new BigUint64Array(this.factions.length);
        for (let i = 0; i < this.factions.length; i++) {
            counts[i] = this.instance.getFactionCount(i);
        }
        return {
            iterations: this.instance.getIterations(),
            factions: this.factions,
            counts: counts,
        };
    }
}
