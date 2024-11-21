// @ts-check

/**
 * @typedef {Object} PixelWasmExports
 * @property {function(number, number, number): void} init
 * @property {function(): void} reset
 * @property {function(): void} draw
 * @property {function(): void} step
 * @property {function(number, number): void} factionColor
 * @property {WebAssembly.Memory} memory
 * @property {function(): bigint} getIterations
 * @property {function(number): bigint} getFactionCount
 */

import Faction from "./faction.js";

const wasmResponse = fetch('./pixels.wasm');
const wasmModule = await WebAssembly.compileStreaming(wasmResponse);

export default class PixelFightWASM {
    /**
     * @type {HTMLCanvasElement}
     */
    canvas;

    /**
     * @type {CanvasRenderingContext2D}
     */
    context;

    /**
     * @type {Faction[]}
     */
    factions;

    /**
     * @type {PixelWasmExports}
     */
    instance;

    /**
     * @readonly
     * @type {function(): void}
     */
    reset;

    /**
     * @readonly
     * @type {function(): void}
     */
    draw;

    /**
     * @readonly
     * @type {function(): void}
     */
    step;

    /**
     * @param {Faction[]} factions
     * @param {number} width
     * @param {number} height
     */
    constructor(factions, width, height) {

        // Create canvas
        this.canvas = document.createElement("canvas");
        this.canvas.width = width;
        this.canvas.height = height;
        const ctx = this.canvas.getContext("2d");
        if (!ctx) {
            throw new Error("browser does not support CanvasRenderingContext2D");
        }
        this.context = ctx;
        this.factions = factions;

        // Create WASM instance
        const image = new ImageData(width, height);
        const instance = new WebAssembly.Instance(wasmModule, {
            deps: {
                atan2: Math.atan2,
                updatePixels: (start, end) => {
                    image.data.set(new Uint8Array(this.memory.slice(start, end)));
                    this.context.putImageData(image, 0, 0);
                },
                getRngSeed: () => {
                    return Math.random() * 0x00FF_FFFF;
                },
            },
        });

        // Initialize WASM runner
        // @ts-ignore
        this.instance = instance.exports;
        this.instance.init(width, height, factions.length);
        this.memory = this.instance.memory.buffer;
        for(let i = 0; i < factions.length; i++) {
            this.instance.factionColor(i, factions[i].colorRGB);
        }

        // Point fight interface to WASM instance
        this.reset = this.instance.reset;
        this.draw = this.instance.draw;
        this.step = this.instance.step;

        // Reset
        this.reset();
    }

    getCanvas() {
        return this.canvas;
    }

    getGameData() {
        let counts = new Array(this.factions.length);
        for(let i = 0; i < this.factions.length; i++) {
            counts[i] = Number(this.instance.getFactionCount(i));
        }
        return {
            iterations: Number(this.instance.getIterations()),
            factions: this.factions,
            counts: counts,
        };
    }
}
