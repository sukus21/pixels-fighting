// @ts-check

/**
 * @import { PixelFight, PixelFightParams, PixelGameData } from "./@types/pixelfight";
 * @import { WebGPU } from "./@types/webgpu_elements";
 */

import Faction from "./faction.js";

const GPUshaderSourceCompute = /* wgsl */ `
    @binding(0) @group(0) var<storage, read> size: vec4<u32>;
    @binding(1) @group(0) var<storage, read> current: array<u32>;
    @binding(2) @group(0) var<storage, read_write> next: array<u32>;
    @binding(3) @group(0) var<storage, read_write> counts: array<atomic<u32>>;

    override blockSize = 8;

    fn getRng(x: u32, y: u32) -> u32 {
        var sd = size.w + x + y * size.x;
        sd ^= 2747636419u;
        sd *= 2654435769u;
        sd ^= sd >> 16;
        sd *= 2654435769u;
        sd ^= sd >> 16;
        sd *= 2654435769u;
        return sd;
    }

    fn getIndex(x: u32, y: u32) -> u32 {
        let w = size.x;
        let h = size.y;

        return (y % h) * w + (x % w);
    }

    fn getCell(x: u32, y: u32) -> vec2<u32> {
        let inBounds = u32(!(x >= size.x || y >= size.y));
        
        let cell = u32(current[getIndex(x, y)]);
        let res = vec2(cell, inBounds);
        return res;
    }

    @compute @workgroup_size(blockSize, blockSize)
    fn main(
        @builtin(global_invocation_id) grid: vec3<u32>,
    ) {
        let x = grid.x;
        let y = grid.y;
        var i = 0u;
        var neighbors = array<u32, 8>();
        var cellDeets: vec2<u32>;
        
        //Sizeways neighbors
        cellDeets = getCell(x-1, y+0);
        neighbors[i] = cellDeets.x;
        i += cellDeets.y;
        cellDeets = getCell(x+1, y+0);
        neighbors[i] = cellDeets.x;
        i += cellDeets.y;

        //Lower neighbors
        cellDeets = getCell(x+0, y+1);
        neighbors[i] = cellDeets.x;
        i += cellDeets.y;
        cellDeets = getCell(x+1, y+1);
        neighbors[i] = cellDeets.x;
        i += cellDeets.y;
        cellDeets = getCell(x-1, y+1);
        neighbors[i] = cellDeets.x;
        i += cellDeets.y;

        //Upper neighbors
        cellDeets = getCell(x+0, y-1);
        neighbors[i] = cellDeets.x;
        i += cellDeets.y;
        cellDeets = getCell(x+1, y-1);
        neighbors[i] = cellDeets.x;
        i += cellDeets.y;
        cellDeets = getCell(x-1, y-1);
        neighbors[i] = cellDeets.x;
        i += cellDeets.y;

        //Choose random neighbor
        let n = getRng(x, y) % i;
        let newOwner = neighbors[n];
        let oldOwner = getCell(x, y).x;
        atomicAdd(&counts[oldOwner], 0xFFFFFFFF);
        atomicAdd(&counts[newOwner], 1);
        next[getIndex(x, y)] = newOwner;
    }
`;

const GPUshaderSourceComputeInit = /* wgsl */ `
    @binding(0) @group(0) var<storage, read> size: vec4<u32>;
    @binding(1) @group(0) var<storage, read_write> buffer0: array<u32>;
    @binding(2) @group(0) var<storage, read_write> buffer1: array<u32>;
    @binding(3) @group(0) var<storage, read_write> counts: array<atomic<u32>>;

    override blockSize = 8;

    fn getIndex(x: u32, y: u32) -> u32 {
        let w = size.x;
        let h = size.y;

        return (y % h) * w + (x % w);
    }

    @compute @workgroup_size(blockSize, blockSize)
    fn main(
        @builtin(global_invocation_id) grid: vec3<u32>,
    ) {
        let x = f32(grid.x);
        let y = f32(grid.y);
        let w = f32(size.x);
        let h = f32(size.y);
        let pi = acos(-1);
        let angle = (atan2(w/2.-x-.5, h/2.-y-.5) + pi) / (pi * 2.);
        let owner = u32(floor(angle * f32(size.z)));
        let i = getIndex(grid.x, grid.y);
        buffer0[i] = owner;
        buffer1[i] = owner;
        atomicAdd(&counts[owner], 1);
    }
`;

const GPUshaderSourceVertex = /* wgsl */ `
    struct Out {
        @builtin(position) pos: vec4<f32>,
        @location(0) @interpolate(flat) cell: u32,
    }

    @binding(0) @group(0) var<uniform> size: vec4<u32>;

    @vertex
    fn main(
        @builtin(instance_index) i: u32, 
        @location(0) cell: u32, 
        @location(1) pos: vec2<u32>,
    ) -> Out {
        let w = size.x;
        let h = size.y;
        let x = (f32(i % w + pos.x) / f32(w) - 0.5) * 2. * f32(w) / f32(w);
        let y = (f32((i - (i % w)) / w + pos.y) / f32(h) - 0.5) * 2. * f32(h) / f32(h);

        return Out(
            vec4<f32>(x, y, 0., 1.), 
            cell,
        );
    }
`;

const GPUshaderSourceFragment = /* wgsl */ `
    @binding(1) @group(0) var<storage, read> colors: array<vec4<f32>>;

    @fragment
    fn main(
        @location(0) @interpolate(flat) cell: u32,
    ) -> @location(0) vec4<f32> { 
        return vec4(
            colors[cell].x, 
            colors[cell].y, 
            colors[cell].z, 
            1.,
        );
    }
`;

const GPUadapter = await navigator.gpu.requestAdapter();
const GPUdevice = await GPUadapter?.requestDevice();
const GPUpresentationFormat = navigator.gpu.getPreferredCanvasFormat();

/**
 * @param {number} binding
 * @param {GPUFlagsConstant} visibility
 * @param {GPUBufferBindingType} bufferType
 * @returns {GPUBindGroupLayoutEntry}
 */
function createBufferBinding(binding, visibility, bufferType) {
    return {
        binding: binding,
        visibility: visibility,
        buffer: {type: bufferType},
    };
}

/**
 * @implements {PixelFight}
 */
export default class PixelFightWebGPU {
    /** @type {PixelFightParams} */ params;
    /** @type {HTMLCanvasElement} */ canvas;
    /** @type {GPUCanvasContext} */ context;

    /** @type {Uint32Array} */ counts = new Uint32Array();
    /** @type {bigint} */ iterations = 0n;
    /** @type {0|1} */ useBuffer = 0;

    /** @type {WebGPU} */ webGPU;
    /** @type {GPUDevice} */ device;

    /**
     * @param {PixelFightParams} params
     */
    constructor(params) {
        this.params = params;

        if (!GPUdevice) throw new Error("GPUDevice not available");
        this.device = GPUdevice;

        this.canvas = document.createElement("canvas");
        this.canvas.width = this.params.width;
        this.canvas.height = this.params.height;
        const ctx = this.canvas.getContext("webgpu");
        if (!ctx) throw new Error("GPUCanvasContext not available");
        this.context = ctx;

        this.blocked = false;
        this.webGPU = this.initWebGPU();
        this.reset();
        this.draw();
    }

    /**
     * @returns {WebGPU}
     */
    initWebGPU() {
        // Configure context
        this.context.configure({
            device: this.device,
            format: GPUpresentationFormat,
            alphaMode: "premultiplied",
        });

        // Compile shaders(?)
        const initShader = this.device.createShaderModule({ label: "init", code: GPUshaderSourceComputeInit });
        const computeShader = this.device.createShaderModule({ label: "compute", code: GPUshaderSourceCompute });
        const vertexShader = this.device.createShaderModule({ label: "vertex", code: GPUshaderSourceVertex });
        const fragmentShader = this.device.createShaderModule({ label: "fragment", code: GPUshaderSourceFragment });

        // Compute layout group
        const bindLayoutCompute = this.device.createBindGroupLayout({
            label: "bindLayoutCompute",
            entries: [
                createBufferBinding(0, GPUShaderStage.COMPUTE, "read-only-storage"),
                createBufferBinding(1, GPUShaderStage.COMPUTE, "read-only-storage"),
                createBufferBinding(2, GPUShaderStage.COMPUTE, "storage"),
                createBufferBinding(3, GPUShaderStage.COMPUTE, "storage"),
            ],
        });

        const bindLayoutInit = this.device.createBindGroupLayout({
            label: "bindLayoutInit",
            entries: [
                createBufferBinding(0, GPUShaderStage.COMPUTE, "read-only-storage"),
                createBufferBinding(1, GPUShaderStage.COMPUTE, "storage"),
                createBufferBinding(2, GPUShaderStage.COMPUTE, "storage"),
                createBufferBinding(3, GPUShaderStage.COMPUTE, "storage"),
            ],
        });

        // Render layout group
        const bindLayoutRender = this.device.createBindGroupLayout({
            label: "bindLayoutRender",
            entries: [
                createBufferBinding(0, GPUShaderStage.VERTEX, "uniform"),
                createBufferBinding(1, GPUShaderStage.FRAGMENT, "read-only-storage"),
            ],
        });

        // Square vertex buffer
        let vertexData = new Uint32Array([0, 0, 0, 1, 1, 0, 1, 1]);
        const bufferVertex = this.device.createBuffer({
            size: vertexData.byteLength,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
        });
        new Uint32Array(bufferVertex.getMappedRange()).set(vertexData);
        bufferVertex.unmap();

        // Create init pipeline
        const pipelineComputeInit = this.device.createComputePipeline({
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [bindLayoutInit],
            }),
            compute: {
                module: initShader,
                entryPoint: "main",
                constants: {
                    blockSize: 16,
                },
            },
        });

        // Create compute pipeline
        const pipelineCompute = this.device.createComputePipeline({
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [bindLayoutCompute],
            }),
            compute: {
                module: computeShader,
                entryPoint: "main",
                constants: {
                    blockSize: 16,
                },
            },
        });

        // Size parameter
        let sizeData = this.createSizeBufferContent();
        const bufferSize = this.device.createBuffer({
            size: sizeData.byteLength,
            usage:
                GPUBufferUsage.STORAGE |
                GPUBufferUsage.UNIFORM |
                GPUBufferUsage.COPY_DST |
                GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
        });
        new Uint32Array(bufferSize.getMappedRange()).set(sizeData);
        bufferSize.unmap();

        // Colors data
        let colorsData = new Float32Array(4 * this.params.factions.length);
        for (let i = 0; i < this.params.factions.length; i++) {
            let color = this.params.factions[i].rgb;
            let colorR = (color >> 16) & 0xFF;
            let colorG = (color >> 8) & 0xFF;
            let colorB = (color >> 0) & 0xFF;
            colorsData[i*4+0] = colorR / 255.0;
            colorsData[i*4+1] = colorG / 255.0;
            colorsData[i*4+2] = colorB / 255.0;
            colorsData[i*4+3] = 1.0;
        }

        // Colors parameter
        const bufferColors = this.device.createBuffer({
            size: colorsData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
        });
        new Float32Array(bufferColors.getMappedRange()).set(colorsData);
        bufferColors.unmap();

        // Create CPU buffer
        const length = this.params.width * this.params.height;
        const cells = new Uint32Array(length);

        // Create GPU buffers
        const buffer0 = this.device.createBuffer({
            size: cells.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
        });
        new Uint32Array(buffer0.getMappedRange()).set(cells);
        buffer0.unmap();
        const buffer1 = this.device.createBuffer({
            size: cells.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
        });

        // Create counts buffers
        const bufferCounts = this.device.createBuffer({
            size: this.params.factions.length * Uint32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });
        new Uint32Array(bufferCounts.getMappedRange()).set(new Uint32Array(this.params.factions.length));
        bufferCounts.unmap();

        const bufferCountsDst = this.device.createBuffer({
            size: this.params.factions.length * Uint32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });
        new Uint32Array(bufferCountsDst.getMappedRange()).set(new Uint32Array(this.params.factions.length));
        bufferCountsDst.unmap();

        const bindGroupBuffer0 = this.device.createBindGroup({
            layout: bindLayoutCompute,
            entries: [
                { binding: 0, resource: { buffer: bufferSize, size: sizeData.byteLength } },
                { binding: 1, resource: { buffer: buffer0 } },
                { binding: 2, resource: { buffer: buffer1 } },
                { binding: 3, resource: { buffer: bufferCounts } },

            ],
        });

        const bindGroupBuffer1 = this.device.createBindGroup({
            layout: bindLayoutCompute,
            entries: [
                { binding: 0, resource: { buffer: bufferSize, size: sizeData.byteLength } },
                { binding: 1, resource: { buffer: buffer1 } },
                { binding: 2, resource: { buffer: buffer0 } },
                { binding: 3, resource: { buffer: bufferCounts } },
            ],
        });

        const bindGroupInit = this.device.createBindGroup({
            layout: bindLayoutInit,
            entries: [
                { binding: 0, resource: { buffer: bufferSize, size: sizeData.byteLength } },
                { binding: 1, resource: { buffer: buffer0 } },
                { binding: 2, resource: { buffer: buffer1 } },
                { binding: 3, resource: { buffer: bufferCounts } },
            ],
        });

        const pipelineRender = this.device.createRenderPipeline({
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [bindLayoutRender],
            }),
            primitive: { topology: "triangle-strip" },
            vertex: {
                module: vertexShader,
                entryPoint: "main",
                buffers: [
                    {
                        arrayStride: Uint32Array.BYTES_PER_ELEMENT,
                        stepMode: "instance",
                        attributes: [{
                            shaderLocation: 0,
                            offset: 0,
                            format: "uint32",
                        }],
                    },
                    {
                        arrayStride: 2 * Uint32Array.BYTES_PER_ELEMENT,
                        stepMode: "vertex",
                        attributes: [{
                            shaderLocation: 1,
                            offset: 0,
                            format: "uint32x2",
                        }],
                    },
                ],
            },
            fragment: {
                module: fragmentShader,
                entryPoint: "main",
                targets: [{ format: GPUpresentationFormat }],
            },
        });

        const bindGroupRender = this.device.createBindGroup({
            label: "bindGroupRender",
            layout: bindLayoutRender,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: bufferSize,
                        offset: 0,
                        size: sizeData.byteLength,
                    },
                },
                {
                    binding: 1,
                    resource: {
                        buffer: bufferColors,
                        offset: 0,
                        size: colorsData.byteLength,
                    },
                },
            ],
        });

        // Save ALL of this to a convenient webGPU object
        return {
            shaders: {
                compute: computeShader,
                vertex: vertexShader,
                fragment: fragmentShader,
                init: initShader,
            },
            bindGroupLayouts: {
                compute: bindLayoutCompute,
                render: bindLayoutRender,
                init: bindLayoutInit,
            },
            bindGroups: {
                buffer0: bindGroupBuffer0,
                buffer1: bindGroupBuffer1,
                render: bindGroupRender,
                init: bindGroupInit,
            },
            buffers: {
                size: bufferSize,
                vertex: bufferVertex,
                buffer0: buffer0,
                buffer1: buffer1,
                colors: bufferColors,
                counts: bufferCounts,
                countsDst: bufferCountsDst,
            },
            pipelines: {
                compute: pipelineCompute,
                render: pipelineRender,
                init: pipelineComputeInit,
            },
            countsSize: this.params.factions.length * Uint32Array.BYTES_PER_ELEMENT,
        };
    }

    /**
     * @returns {void}
     */
    reset() {
        this.useBuffer = 0;
        const commandEncoder = this.device.createCommandEncoder();

        // Reset faction counts
        const filler = new Uint32Array(this.params.factions.length);
        this.device.queue.writeBuffer(this.webGPU.buffers.counts, 0, filler);
        this.device.queue.writeBuffer(this.webGPU.buffers.countsDst, 0, filler);

        // Run compute shader
        const computePassEncoder = commandEncoder.beginComputePass();
        computePassEncoder.setPipeline(this.webGPU.pipelines.init);
        computePassEncoder.setBindGroup(0, this.webGPU.bindGroups.init);
        computePassEncoder.dispatchWorkgroups(
            this.params.width / 16,
            this.params.height / 16,
        );
        computePassEncoder.end();
        this.device.queue.submit([commandEncoder.finish()]);
    }

    /**
     * @returns {void}
     */
    step() {
        this.useBuffer = this.useBuffer ? 0 : 1;
        this.iterations++;
        this.draw(true).then(async () => {
            const bufferCounts = this.webGPU.buffers.countsDst;

            // Get game data whenever possible
            if (bufferCounts.mapState === "unmapped") {
                await bufferCounts.mapAsync(GPUMapMode.READ, 0, this.webGPU.countsSize);
                this.counts = new Uint32Array(bufferCounts.getMappedRange(0, this.webGPU.countsSize)).slice();
                bufferCounts.unmap();

                const counts = new BigUint64Array(this.params.factions.length);
                this.counts.forEach((v, i) => {
                    counts[i] = BigInt(v);
                });

                this.params.updateGameData({
                    iterations: this.iterations,
                    factions: this.params.factions,
                    counts: counts,
                });
            }
        });
    }

    /**
     * @param {boolean} doUpdate
     * @returns {Promise<void>}
     */
    async draw(doUpdate = false) {
        const commandEncoder = this.device.createCommandEncoder();

        if (doUpdate) {
            let data = this.createSizeBufferContent();
            this.device.queue.writeBuffer(this.webGPU.buffers.size, 0, data);

            // Run compute shader
            const computePassEncoder = commandEncoder.beginComputePass();
            computePassEncoder.setPipeline(this.webGPU.pipelines.compute);
            computePassEncoder.setBindGroup(0, this.useBuffer ? this.webGPU.bindGroups.buffer1 : this.webGPU.bindGroups.buffer0);
            computePassEncoder.dispatchWorkgroups(
                this.params.width / 16,
                this.params.height / 16,
            );
            computePassEncoder.end();
        }

        // Render
        const renderPassEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                loadOp: "clear",
                storeOp: "store",
            }],
        });
        renderPassEncoder.setPipeline(this.webGPU.pipelines.render);
        renderPassEncoder.setVertexBuffer(0, this.useBuffer ? this.webGPU.buffers.buffer0 : this.webGPU.buffers.buffer1);
        renderPassEncoder.setVertexBuffer(1, this.webGPU.buffers.vertex);
        renderPassEncoder.setBindGroup(0, this.webGPU.bindGroups.render);
        renderPassEncoder.draw(4, this.params.width * this.params.height);
        renderPassEncoder.end();

        // Transfer faction counts back to the CPU
        const bufferCounts = this.webGPU.buffers.countsDst;
        if (bufferCounts.mapState === "unmapped") {
            commandEncoder.copyBufferToBuffer(
                this.webGPU.buffers.counts, 0,
                bufferCounts, 0,
                this.webGPU.countsSize,
            );
        }

        this.device.queue.submit([commandEncoder.finish()]);
    }

    /**
     * @returns {Uint32Array}
     */
    createSizeBufferContent() {
        return new Uint32Array([
            this.params.width,
            this.params.height,
            this.params.factions.length,
            Math.random() * 0x00FF_FFFF,
        ]);
    }

    /**
     * @returns {HTMLCanvasElement}
     */
    getCanvas() {
        return this.canvas;
    }
}
