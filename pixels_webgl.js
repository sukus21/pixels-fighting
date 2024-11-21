const vertexShaderSourceCode = `
    #version 100
    attribute vec2 aPosition;
    attribute vec2 aTexCoord;

    varying highp vec2 vTexCoord;

    void main() {
        gl_PointSize = 16.0;
        gl_Position = vec4(aPosition, 0.0, 1.0);
        vTexCoord = aTexCoord;
    }
`;

const fragmentShaderSourceCode = `
    #version 100

    varying highp vec2 vTexCoord;
    uniform sampler2D uSampler;

    void main() {
        gl_FragColor = vec4(vTexCoord.x, vTexCoord.y, vTexCoord.y+vTexCoord.x, 1.0);
    }
`;

export default class PixelFightWebGL {
    /**
     * 
     * @param {Faction[]} factions 
     * @param {number} width 
     * @param {number} height 
     * @param {number} scale 
     */
    constructor(factions, width, height, scale) {
        this.width = width;
        this.height = height;
        this.scale = scale;
        this.factions = factions;

        this.canvas = document.createElement("canvas");
        this.canvas.setAttribute("width", this.width*this.scale);
        this.canvas.setAttribute("height", this.height*this.scale);
        this.context = this.canvas.getContext("webgl");
        document.body.append(this.canvas);

        this.webglSetup();
        //this.reset();
    }

    webglSetup() {
        const gl = this.context;
        this.context.clearColor(1, 0, 1, 1);
        this.context.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        let vertexShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertexShader, vertexShaderSourceCode);
        gl.compileShader(vertexShader);
        if(!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
            let compileError = gl.getShaderInfoLog(vertexShader);
            console.error("vertex shader compile error: \n" + compileError);
        }

        let fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragmentShader, fragmentShaderSourceCode);
        gl.compileShader(fragmentShader);
        if(!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
            let compileError = gl.getShaderInfoLog(fragmentShader);
            console.error("fragment shader compile error: \n" + compileError);
        }

        let shaderProgram = gl.createProgram();
        gl.attachShader(shaderProgram, vertexShader);
        gl.attachShader(shaderProgram, fragmentShader);
        gl.linkProgram(shaderProgram);
        gl.detachShader(shaderProgram, vertexShader);
        gl.detachShader(shaderProgram, fragmentShader);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);

        if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
            let linkError = gl.getProgramInfoLog(shaderProgram);
            console.error("shader program link error: \n" + linkError);
            return;
        }

        //Get uniforms
        const aPosition = gl.getAttribLocation(shaderProgram, "aPosition");
        const aTexCoord = gl.getAttribLocation(shaderProgram, "aTexCoord");
        const uSampler = gl.getUniformLocation(shaderProgram, "uSampler");

        const d = 1;
        const verts = [
            -d, -d, 
             d, -d, 
            -d,  d, 
            
             d,  d, 
             d, -d, 
            -d,  d, 
        ];

        const texcoords = [
            0.0, 0.0,
            1.0, 0.0,
            0.0, 1.0,

            1.0, 1.0,
            1.0, 0.0,
            0.0, 1.0,
        ]

        let texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, this.width, this.height, 0, gl.UNSIGNED_BYTE, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        let vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(aPosition);
        gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
        
        let texcoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texcoords), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(aTexCoord);
        gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 0, 0);
        gl.uniform1i(uSampler, 0);

        gl.useProgram(shaderProgram);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    reset() {
        
        this.draw();
    }

    start() {

    }

    stop() {

    }

    run() {

    }

    draw() {
        const gl = this.context;
        this.context.clearColor(1, 0, 1, 1);
        this.context.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }

    static setup() {
        let pixelFight = new PixelFightWebGL(factionList(10), 125, 125, 4);
        //pixelFight.start();
    }
}
