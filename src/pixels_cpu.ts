import { PixelFight, PixelGameData } from "./@types/pixelfight.js";
import Faction from "./faction.js";

export default class PixelFightCPU implements PixelFight {
    bufferA: Uint32Array[];
    bufferB: Uint32Array[];
    useBuffer: 0|1 = 0;
    buffers: [Uint32Array[], Uint32Array[]];
    count: BigUint64Array;
    iterations: bigint;

    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;

    constructor(
        private readonly factions: Faction[],
        private readonly width: number,
        private readonly height: number,
    ) {
        this.canvas = document.createElement("canvas");
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.context = this.canvas.getContext("2d");

        this.bufferA = new Array(this.width);
        this.bufferB = new Array(this.width);
        this.buffers = [this.bufferA, this.bufferB];
        for (let i = 0; i < this.height; i++) {
            this.bufferA[i] = new Uint32Array(this.width);
            this.bufferB[i] = new Uint32Array(this.height);
        }

        this.count = new BigUint64Array(this.factions.length);
        this.reset();
    }

    reset(): void {
        this.iterations = 0n;
        this.useBuffer = 0;
        this.count.fill(0n, 0, this.factions.length);

        // "Evenly" distrubute pixels to each side
        for (let i = 0; i < this.width; i++) {
            for (let j = 0; j < this.height; j++) {
                let angle = Math.atan2(this.width/2 - i - 0.5, this.height/2 - j - 0.5) * 180 / Math.PI;
                while (angle < 0) angle += 360;
                const owner = Math.floor((360 - angle) / (360 / this.factions.length));
                this.bufferA[i][j] = owner;
                this.bufferB[i][j] = owner;
                this.count[owner]++;
            }
        }

        this.draw();
    }

    step(): void {
        this.iterations++;
        
        // Get and swap buffers
        const bufferOld = this.buffers[this.useBuffer];
        this.useBuffer = this.useBuffer === 0 ? 1 : 0;
        const bufferNew = this.buffers[this.useBuffer];

        // Loop for each pixel
        for (let i = 0; i < this.width; ++ i) {
            for (let j = 0; j < this.height; ++ j) {
                const neighbors = [];

                // Check neighbors above
                if (i > 0) {
                    if (j > 0) neighbors.push(bufferOld[i-1][j-1])
                    neighbors.push(bufferOld[i-1][j]);
                    if (j < this.height-1) neighbors.push(bufferOld[i-1][j+1]);
                }

                // Check neighbors to the sides
                if (j > 0) neighbors.push(bufferOld[i][j-1]);
                if (j < this.height - 1) neighbors.push(bufferOld[i][j+1]);

                // Check neighbors below
                if (i < this.width-1) {
                    if (j > 0) neighbors.push(bufferOld[i+1][j-1])
                    neighbors.push(bufferOld[i+1][j]);
                    if (j < this.height - 1) neighbors.push(bufferOld[i+1][j+1]);
                }

                // Exchange owners
                const oldOwner = bufferOld[i][j];
                const newOwner = neighbors[Math.floor(Math.random() * (neighbors.length))];
                bufferNew[i][j] = newOwner;
                this.count[oldOwner]--;
                this.count[newOwner]++;
            }
        }
        this.draw();
    }

    draw(): void {
        const gameBuffer = this.buffers[this.useBuffer];
        const drawBuffer = this.context.createImageData(this.width, this.height);
        for (let i = 0; i < this.width; i++) {
            for (let j = 0; j < this.height; j++) {
                let color = this.factions[gameBuffer[i][j]].rgb;
                let d = (i + j * this.width) * 4;
                drawBuffer.data[d+0] = color >> 16;
                drawBuffer.data[d+1] = (color >> 8) & 255;
                drawBuffer.data[d+2] = color & 255;
                drawBuffer.data[d+3] = 0xFF;
            }
        }
        this.context.putImageData(drawBuffer, 0, 0);
    }

    getCanvas(): HTMLCanvasElement {
        return this.canvas;
    }

    getGameData(): PixelGameData {
        return {
            iterations: this.iterations,
            factions: this.factions,
            counts: this.count,
        };
    }
}
