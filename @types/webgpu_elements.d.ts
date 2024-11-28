export type WebGPU = {
    shaders: {
        compute: GPUShaderModule,
        vertex: GPUShaderModule,
        fragment: GPUShaderModule,
        init: GPUShaderModule,
    },
    bindGroupLayouts: {
        compute: GPUBindGroupLayout,
        render: GPUBindGroupLayout,
        init: GPUBindGroupLayout,
    },
    bindGroups: {
        buffer0: GPUBindGroup,
        buffer1: GPUBindGroup,
        render: GPUBindGroup,
        init: GPUBindGroup,
    },
    buffers: {
        size: GPUBuffer,
        vertex: GPUBuffer,
        buffer0: GPUBuffer,
        buffer1: GPUBuffer,
        colors: GPUBuffer,
        counts: GPUBuffer,
        countsDst: GPUBuffer,
    },
    pipelines: {
        compute: GPUComputePipeline,
        render: GPURenderPipeline,
        init: GPUComputePipeline,
    },
    countsSize: number,
};
