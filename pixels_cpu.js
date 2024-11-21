// @ts-check

import Faction from "./faction.js";

export default class PixelFightCPU {
    /**
     * @type {number[][]}
     */
    bufferA;

    /**
     * @type {number[][]}
     */
    bufferB;

    /**
     * @type {0|1}
     */
    useBuffer = 0;

    /**
     * @type {[number[][], number[][]]}
     */
    buffers;

    /**
     * @type {number[]}
     */
    count;

    /**
     * @type {number}
     */
    iterations = 0;

    /**
     * @param {Faction[]} factions
     * @param {number} width
     * @param {number} height
     */
    constructor(factions, width, height) {
        this.width = width;
        this.height = height;
        this.factions = factions;
        this.iterations = 0;

        this.canvas = document.createElement("canvas");
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.context = this.canvas.getContext("2d");
        if (!this.context) {
            throw new Error("browser does not support CanvasRenderingContext2D");
        }

        this.reset();
    }

    reset() {
        this.iterations = 0;
        this.useBuffer = 0;
        this.bufferA = new Array(this.width);
        this.bufferB = new Array(this.width);
        this.buffers = [this.bufferA, this.bufferB];
        this.count = new Array(this.factions.length);
        for (let i = 0; i < this.factions.length; i++) {
            this.count[i] = 0;
        }

        for (let i = 0; i < this.width; i++) {
            this.bufferA[i] = new Array(this.height);
            this.bufferB[i] = new Array(this.height);

            //Evenly distrubute pixels to each side
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

    step() {
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

    draw() {
        const gameBuffer = this.buffers[this.useBuffer];
        const drawBuffer = this.context.createImageData(this.width, this.height);
        for (let i = 0; i < this.width; i++) {
            for (let j = 0; j < this.height; j++) {
                let color = this.factions[gameBuffer[i][j]].colorRGB;
                let d = (i + j * this.width) * 4;
                drawBuffer.data[d+0] = color >> 16;
                drawBuffer.data[d+1] = (color >> 8) & 255;
                drawBuffer.data[d+2] = color & 255;
                drawBuffer.data[d+3] = 0xFF;
            }
        }
        this.context.putImageData(drawBuffer, 0, 0);
    }

    getCanvas() {
        return this.canvas;
    }

    getGameData() {
        return {
            iterations: this.iterations,
            factions: this.factions,
            counts: this.count,
        };
    }
}
