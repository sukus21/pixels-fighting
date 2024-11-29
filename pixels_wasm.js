// @ts-check

/**
 * @import { PixelFight, PixelFightParams, PixelGameData } from "./@types/pixelfight";
 * @import { PixelWasmExports } from "./@types/wasm_export";
 */

import Faction from "./faction.js";

const wasmResponse = await fetch('./pixels.wasm');
const wasmModule = await WebAssembly.compile(await wasmResponse.arrayBuffer());

/**
 * @implements {PixelFight}
 */
export default class PixelFightWASM {
    /** @type {PixelFightParams} */ params;
    
    /** @type {HTMLCanvasElement} */ canvas;
    /** @type {CanvasRenderingContext2D} */ context;
    /** @type {PixelWasmExports} */ instance;
    /** @type {ArrayBuffer} */ memory;

    /** @type {() => void} */ reset;
    /** @type {() => void} */ draw;

    /**
     * @param {PixelFightParams} params
     */
    constructor(params) {
        this.params = params;

        // Create canvas
        this.canvas = document.createElement("canvas");
        this.canvas.width = params.width;
        this.canvas.height = params.height;
        const ctx = this.canvas.getContext("2d");
        if (!ctx) throw new Error("CanvasContext2D not available");
        this.context = ctx;

        // Create WASM instance
        const image = new ImageData(params.width, params.height);
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
        this.instance.init(params.width, params.height, params.factions.length);
        this.memory = this.instance.memory.buffer;
        params.factions.forEach((faction, i) => {
            this.instance.factionColor(i, faction.rgb);
        });

        // Point fight interface to WASM instance
        this.reset = this.instance.reset;
        this.draw = this.instance.draw;

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
     * @returns {void}
     */
    step() {
        this.instance.step();

        const counts = new BigUint64Array(this.params.factions.length);
        for (let i = 0; i < this.params.factions.length; i++) {
            counts[i] = this.instance.getFactionCount(i);
        }
        this.params.updateGameData({
            iterations: this.instance.getIterations(),
            factions: this.params.factions,
            counts: counts,
        });
    }
}
