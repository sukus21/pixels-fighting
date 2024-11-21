// @ts-check

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

const GPUadapter = await navigator.gpu?.requestAdapter();
const GPUdevice = await GPUadapter?.requestDevice();
const GPUpresentationFormat = navigator?.gpu?.getPreferredCanvasFormat();

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

export default class PixelFightWebGPU {
    /**
     * @type {GPUCanvasContext}
     */
    context;

    /**
     * @param {Faction[]} factions
     * @param {number} width
     * @param {number} height
     */
    constructor(factions, width, height) {
        if (!GPUdevice) {
            alert("browser does not support WebGPU");
            throw "browser does not support WebGPU";
        }
        this.width = width;
        this.height = height;
        this.factions = factions;
        this.counts = new Uint32Array();

        this.nextFrame = null;
        this.iterations = 0;

        this.canvas = document.createElement("canvas");
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        // @ts-ignore
        this.context = this.canvas.getContext("webgpu");

        this.blocked = false;
        this.initWebGPU();
        this.reset();
        this.draw();
    }

    initWebGPU() {
        // Configure context
        this.context.configure({
            device: GPUdevice,
            format: GPUpresentationFormat,
            alphaMode: "premultiplied",
        });

        // Compile shaders(?)
        const initShader = GPUdevice.createShaderModule({ label: "init", code: GPUshaderSourceComputeInit });
        const computeShader = GPUdevice.createShaderModule({ label: "compute", code: GPUshaderSourceCompute });
        const vertexShader = GPUdevice.createShaderModule({ label: "vertex", code: GPUshaderSourceVertex });
        const fragmentShader = GPUdevice.createShaderModule({ label: "fragment", code: GPUshaderSourceFragment });

        // Compute layout group
        const bindLayoutCompute = GPUdevice.createBindGroupLayout({
            label: "bindLayoutCompute",
            entries: [
                createBufferBinding(0, GPUShaderStage.COMPUTE, "read-only-storage"),
                createBufferBinding(1, GPUShaderStage.COMPUTE, "read-only-storage"),
                createBufferBinding(2, GPUShaderStage.COMPUTE, "storage"),
                createBufferBinding(3, GPUShaderStage.COMPUTE, "storage"),
            ],
        });

        const bindLayoutInit = GPUdevice.createBindGroupLayout({
            label: "bindLayoutInit",
            entries: [
                createBufferBinding(0, GPUShaderStage.COMPUTE, "read-only-storage"),
                createBufferBinding(1, GPUShaderStage.COMPUTE, "storage"),
                createBufferBinding(2, GPUShaderStage.COMPUTE, "storage"),
                createBufferBinding(3, GPUShaderStage.COMPUTE, "storage"),
            ],
        });

        // Render layout group
        const bindLayoutRender = GPUdevice.createBindGroupLayout({
            label: "bindLayoutRender",
            entries: [
                createBufferBinding(0, GPUShaderStage.VERTEX, "uniform"),
                createBufferBinding(1, GPUShaderStage.FRAGMENT, "read-only-storage"),
            ],
        });

        // Square vertex buffer
        let vertexData = new Uint32Array([0, 0, 0, 1, 1, 0, 1, 1]);
        const bufferVertex = GPUdevice.createBuffer({
            size: vertexData.byteLength,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
        });
        new Uint32Array(bufferVertex.getMappedRange()).set(vertexData);
        bufferVertex.unmap();

        /**
         * Size of cell ID
         * @type {GPUVertexBufferLayout}
         */
        const strideCellNumber = {
            arrayStride: Uint32Array.BYTES_PER_ELEMENT,
            stepMode: "instance",
            attributes: [{
                shaderLocation: 0,
                offset: 0,
                format: "uint32",
            }],
        };

        /**
         * Size of 2D coordinate
         * @type {GPUVertexBufferLayout}
         */
        const strideVertexPosition = {
            arrayStride: 2 * Uint32Array.BYTES_PER_ELEMENT,
            stepMode: "vertex",
            attributes: [{
                shaderLocation: 1,
                offset: 0,
                format: "uint32x2",
            }],
        };

        // Create init pipeline
        const pipelineComputeInit = GPUdevice.createComputePipeline({
            layout: GPUdevice.createPipelineLayout({
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
        const pipelineCompute = GPUdevice.createComputePipeline({
            layout: GPUdevice.createPipelineLayout({
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
        const bufferSize = GPUdevice.createBuffer({
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
        let colorsData = new Float32Array(4 * this.factions.length);
        for(let i = 0; i < this.factions.length; i++) {
            let color = this.factions[i].colorRGB;
            let colorR = (color >> 16) & 0xFF;
            let colorG = (color >> 8) & 0xFF;
            let colorB = (color >> 0) & 0xFF;
            colorsData[i*4+0] = colorR / 255.0;
            colorsData[i*4+1] = colorG / 255.0;
            colorsData[i*4+2] = colorB / 255.0;
            colorsData[i*4+3] = 1.0;
        }

        // Colors parameter
        const bufferColors = GPUdevice.createBuffer({
            size: colorsData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
        });
        new Float32Array(bufferColors.getMappedRange()).set(colorsData);
        bufferColors.unmap();

        // Create CPU buffer
        const length = this.width * this.height;
        const cells = new Uint32Array(length);

        // Create GPU buffers
        const buffer0 = GPUdevice.createBuffer({
            size: cells.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
        });
        new Uint32Array(buffer0.getMappedRange()).set(cells);
        buffer0.unmap();
        const buffer1 = GPUdevice.createBuffer({
            size: cells.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
        });

        // Create counts buffers
        const bufferCounts = GPUdevice.createBuffer({
            size: this.factions.length * Uint32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });
        new Uint32Array(bufferCounts.getMappedRange()).set(new Uint32Array(this.factions.length));
        bufferCounts.unmap();

        const bufferCountsDst = GPUdevice.createBuffer({
            size: this.factions.length * Uint32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });
        new Uint32Array(bufferCountsDst.getMappedRange()).set(new Uint32Array(this.factions.length));
        bufferCountsDst.unmap();

        const bindGroupBuffer0 = GPUdevice.createBindGroup({
            layout: bindLayoutCompute,
            entries: [
                { binding: 0, resource: { buffer: bufferSize, size: sizeData.byteLength } },
                { binding: 1, resource: { buffer: buffer0 } },
                { binding: 2, resource: { buffer: buffer1 } },
                { binding: 3, resource: { buffer: bufferCounts } },

            ],
        });

        const bindGroupBuffer1 = GPUdevice.createBindGroup({
            layout: bindLayoutCompute,
            entries: [
                { binding: 0, resource: { buffer: bufferSize, size: sizeData.byteLength } },
                { binding: 1, resource: { buffer: buffer1 } },
                { binding: 2, resource: { buffer: buffer0 } },
                { binding: 3, resource: { buffer: bufferCounts } },
            ],
        });

        const bindGroupInit = GPUdevice.createBindGroup({
            layout: bindLayoutInit,
            entries: [
                { binding: 0, resource: { buffer: bufferSize, size: sizeData.byteLength } },
                { binding: 1, resource: { buffer: buffer0 } },
                { binding: 2, resource: { buffer: buffer1 } },
                { binding: 3, resource: { buffer: bufferCounts } },
            ],
        });

        const pipelineRender = GPUdevice.createRenderPipeline({
            layout: GPUdevice.createPipelineLayout({
                bindGroupLayouts: [bindLayoutRender],
            }),
            primitive: { topology: "triangle-strip" },
            vertex: {
                module: vertexShader,
                entryPoint: "main",
                buffers: [strideCellNumber, strideVertexPosition],
            },
            fragment: {
                module: fragmentShader,
                entryPoint: "main",
                targets: [{ format: GPUpresentationFormat }],
            },
        });

        const bindGroupRender = GPUdevice.createBindGroup({
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
        this.webGPU = {
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
            strides: {
                vertexPosition: strideVertexPosition,
                cellNumber: strideCellNumber,
            },
            countsSize: this.factions.length * Uint32Array.BYTES_PER_ELEMENT,
        };
    }

    reset() {
        this.useBuffer = 0;
        const commandEncoder = GPUdevice.createCommandEncoder();

        // Reset faction counts
        let filler = new Uint32Array(this.factions.length);
        GPUdevice.queue.writeBuffer(this.webGPU.buffers.counts, 0, filler);
        GPUdevice.queue.writeBuffer(this.webGPU.buffers.countsDst, 0, filler);

        // Run compute shader
        const computePassEncoder = commandEncoder.beginComputePass();
        computePassEncoder.setPipeline(this.webGPU.pipelines.init);
        computePassEncoder.setBindGroup(0, this.webGPU.bindGroups.init);
        computePassEncoder.dispatchWorkgroups(
            this.width / 16,
            this.height / 16,
        );
        computePassEncoder.end();
        GPUdevice.queue.submit([commandEncoder.finish()]);
    }

    step() {
        this.useBuffer = 1 - this.useBuffer;
        this.iterations++;
        this.draw(true);
    }

    /**
     * @param {boolean} doUpdate
     */
    async draw(doUpdate = false) {
        const commandEncoder = GPUdevice.createCommandEncoder();

        if (doUpdate) {
            let data = this.createSizeBufferContent();
            GPUdevice.queue.writeBuffer(this.webGPU.buffers.size, 0, data);

            // Run compute shader
            const computePassEncoder = commandEncoder.beginComputePass();
            computePassEncoder.setPipeline(this.webGPU.pipelines.compute);
            computePassEncoder.setBindGroup(0, this.useBuffer ? this.webGPU.bindGroups.buffer1 : this.webGPU.bindGroups.buffer0);
            computePassEncoder.dispatchWorkgroups(
                this.width / 16,
                this.height / 16,
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
        renderPassEncoder.draw(4, this.width * this.height);
        renderPassEncoder.end();

        const bufferCounts = this.webGPU.buffers.countsDst;
        if (!this.blocked) {
            commandEncoder.copyBufferToBuffer(
                this.webGPU.buffers.counts,
                0,
                bufferCounts,
                0,
                this.webGPU.countsSize,
            );
        }

        GPUdevice.queue.submit([commandEncoder.finish()]);

        // Read out thing
        if (!this.blocked) {
            this.blocked = true;
            await bufferCounts.mapAsync(GPUMapMode.READ, 0, this.webGPU.countsSize);
            this.counts = new Uint32Array(bufferCounts.getMappedRange(0, this.webGPU.countsSize)).slice();
            bufferCounts.unmap();
            this.blocked = false;
        }
    }

    /**
     * @returns {Uint32Array}
     */
    createSizeBufferContent() {
        return new Uint32Array([this.width, this.height, this.factions.length, Math.random() * 0x00FF_FFFF]);
    }

    getGameData() {
        let counts = new Array(this.factions.length);
        this.counts.forEach(function(v, i) {
            counts[i] = v;
        });
        return {
            iterations: this.iterations,
            factions: this.factions,
            counts: counts,
        };
    }

    getCanvas() {
        return this.canvas;
    }
}
