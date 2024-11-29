// @ts-check

/**
 * @import { PixelFight, PixelFightConstructor, PixelGameData } from "./@types/pixelfight";
 */

import Faction, { FactionInfo, makeColor } from "./faction.js";
import { templateCreate } from "./utils.js";

try {

const configWidth = /** @type {HTMLInputElement} */ (document.getElementById("config-width"));
const configMode = /** @type {HTMLSelectElement} */ (document.getElementById("config-mode"));
const configModeWebgpu = /** @type {HTMLOptionElement} */ (document.getElementById("config-mode-webgpu"));
const configRunButton = /** @type {HTMLButtonElement} */ (document.getElementById("config-run-button"));

// Disable WebGPU in unsupported browsers
configMode.value = "gpu";
const webGpuSupported = Boolean(navigator?.gpu?.requestAdapter);
if (!webGpuSupported) {
    configModeWebgpu.disabled = true;
    configMode.value = "cpu";
}

// Grab different containers
const containerMain = /** @type {HTMLElement} */ (document.getElementById("main"));
const containerConfig = /** @type {HTMLElement} */ (document.getElementById("config"));
const containerGame = /** @type {HTMLElement} */ (document.getElementById("game"));
const containerCounts = /** @type {HTMLElement} */ (document.getElementById("info-counts"));
const containerEvents = /** @type {HTMLElement} */ (document.getElementById("info-events"));

// Grab stats containers
const statsIterations = /** @type {HTMLElement} */ (document.getElementById("info-iterations"));
const statsGameStarted = /** @type {HTMLElement} */ (document.getElementById("info-game-started"));
const statsAlive = /** @type {HTMLElement} */ (document.getElementById("info-alive"));
const statsFactionsStarted = /** @type {HTMLElement} */ (document.getElementById("info-factions-started"));
const statsLead = /** @type {HTMLElement} */ (document.getElementById("info-lead"));
const statsTotalPixels = /** @type {HTMLElement} */ (document.getElementById("info-total-pixels"));

// Various templates
const templateCount = templateCreate("info-count-template");
const templateEvent = templateCreate("info-event-template");
const templateFaction = templateCreate("faction-template");

// Faction shenanigans
const factionEntries = /** @type {HTMLElement} */ (document.getElementById("faction-container"));
const factionAdd = /** @type {HTMLButtonElement} */ (document.getElementById("faction-add"));

/**
 * @param {string} name
 * @param {?number} color
 * @returns {void}
 */
function addFaction(name = "", color = null) {
    const newFaction = /** @type {HTMLElement} */ (templateFaction.cloneNode(true));
    const deleteButton = /** @type {HTMLButtonElement} */ (newFaction.querySelector(".faction-delete"));
    deleteButton.addEventListener("click", () => {
        factionEntries.removeChild(newFaction);
    });

    const colorSquare = /** @type {HTMLElement} */ (newFaction.querySelector(".color-picker"));
    const colorPicker = /** @type {HTMLInputElement} */ (newFaction.querySelector(".faction-color"));
    const newColor = makeColor(color);
    colorPicker.value = newColor;
    colorSquare.style.backgroundColor = newColor;
    colorPicker.addEventListener("change", () => {
        colorSquare.style.backgroundColor = colorPicker.value;
    });

    const nameLabel = /** @type {HTMLInputElement} */ (newFaction.querySelector(".faction-name"));
    nameLabel.value = name;
    factionEntries.appendChild(newFaction);
}

// Add faction button
factionAdd.addEventListener("click", () => addFaction());

class GameSettings {
    /** @type {Faction[]} */ factions;
    /** @type {number} */ width = 128;
    /** @type {number} */ height = 128;
    /** @type {string} */ mode = webGpuSupported ? "gpu" : "cpu";
    /** @type {boolean} */ play = true;

    constructor() {
        this.factions = [
            new Faction("", Math.floor(Math.random() * 0x00FF_FFFF)),
            new Faction("", Math.floor(Math.random() * 0x00FF_FFFF)),
        ];

        const urlSearchParams = new URLSearchParams(window.location.search);
        this.load(urlSearchParams);
    }

    /**
     * Load state of query into this
     * @param {URLSearchParams} query
     * @returns {void}
     */
    load(query) {
        /** @type {{[k: string]: string[]}} */
        const options = {};
        query.forEach((value, key) => {
            if (key in options) options[key].push(value);
            else options[key] = [value];
        });

        /**
         * @param {string} key
         * @returns {?string}
         */
        function getSingleValue(key) {
            if (!(key in options)) return null;
            else return options[key][0];
        }

        /**
         * @param {string} key
         * @returns {string[]}
         */
        function getMultiValue(key) {
            if (!options[key]) return [];
            else return options[key];
        }

        this.width = Number(getSingleValue("w") ?? this.width);
        this.height = Number(getSingleValue("h") ?? this.width);
        this.mode = String(getSingleValue("m") ?? this.mode);
        this.play = "p" in options;

        const names = getMultiValue("fn");
        const colors = getMultiValue("fc");
        
        const numFactions = Math.min(names.length, colors.length);
        if (numFactions !== 0) {
            this.factions = new Array(numFactions);
            for (let i = 0; i < numFactions; i++) {
                this.factions[i] = new Faction(names[i], Number(colors[i]));
            }
        }
    }

    /**
     * Save state of this to url
     * @param {boolean} playing
     * @returns {string}
     */
    createUrl(playing = false) {
        let url = "w=" + this.width;
        url += "&m=" + this.mode;
        if (playing) url += "&p";
        this.factions.forEach((faction) => {
            url += "&fn=" + faction.name || " ";
            url += "&fc=" + faction.rgb.toString();
        });
        return url;
    }

    /**
     * Get state of inputs and apply to this
     * @returns {void}
     */
    apply() {
        const factions = new Array(factionEntries.childElementCount);
        factionEntries.childNodes.forEach((v, i) => {
            const elem = /** @type {HTMLElement} */ (v);
            const factionColor = /** @type {HTMLInputElement} */ (elem.querySelector(".faction-color"));
            const factionName = /** @type {HTMLInputElement} */ (elem.querySelector(".faction-name"));
            const color = parseInt(factionColor.value.replace("#", ""), 16);
            factions[i] = new Faction(factionName.value, color);
        });

        this.width = Number(configWidth.value);
        this.height = this.width;
        this.mode = configMode.value;
        this.factions = factions;
    }

    /**
     * Apply state of this to inputs
     * @returns {void}
     */
    store() {
        configWidth.value = this.width.toString();
        configMode.value = this.mode;
        factionEntries.innerHTML = "";
        this.factions.forEach((v) => {
            addFaction(v.name, v.rgb);
        });
    }
}

// Settings loading
const settings = new GameSettings();
settings.store();



class GameRunner {
    /** @type {boolean} */ inited = false;
    /** @type {boolean} */ running = false;

    /** @type {number} */ alive;
    /** @type {string} */ startTime;
    /** @type {FactionInfo[]} */ counts;

    /** @type {GameSettings} */ settings;
    /** @type {PixelFight} */ game;

    /** @type {?number} */ nextFrame = null;
    /** @type {?number} */ interval = null;

    /**
     * @param {GameSettings} settings
     * @param {PixelFightConstructor} constructor
     */
    constructor(settings, constructor) {
        this.settings = settings;
        this.game = new constructor({
            factions: settings.factions,
            width: settings.width,
            height: settings.height,
            updateGameData: this.updateGameData,
        });

        this.alive = settings.factions.length;
        this.startTime = this.formatTime();
        this.counts = this.setup();
    }

    /**
     * @returns {FactionInfo[]}
     */
    setup() {
        if (this.inited) return [];
        this.inited = true;

        const results = new Array(this.settings.factions.length);
        this.settings.factions.forEach((faction, i) => {
            const element = /** @type {HTMLElement} */ (templateCount.cloneNode(true));
            const infoColor = /** @type {HTMLElement} */ (element.querySelector(".info-color"));
            const infoName = /** @type {HTMLElement} */ (element.querySelector(".info-name"));
            const counter = /** @type {HTMLElement} */ (element.querySelector(".info-text"));
            infoColor.style.backgroundColor = faction.color;
            infoName.innerText = faction.name;
            counter.innerText = "";
            containerCounts.appendChild(element);
            results[i] = new FactionInfo(element, counter, false);
        });
        
        // Refresh
        this.interval = setInterval(() => {
            if (!this.running) this.game.draw();
        }, 1000);

        // Controls
        const canvas = this.game.getCanvas();
        containerGame.append(canvas);
        canvas.addEventListener("click", () => {
            if (!this.running) this.game.step();
        });
        canvas.addEventListener("dblclick", () => {
            if (!this.running) this.start();
            else this.stop();
        });

        // Set unchanging stats
        statsGameStarted.innerText = this.startTime;
        statsFactionsStarted.innerText = this.settings.factions.length.toString();
        statsTotalPixels.innerText = (this.settings.width * this.settings.height).toString();
        return results;
    }

    /**
     * @param {PixelGameData} gameData
     * @returns {void}
     */
    updateGameData = (gameData) => {
        let leader = 0;
        for (let i = 0; i < this.counts.length; i++) {
            const factionInfo = this.counts[i];
            if (factionInfo.isDead) continue;

            const count = gameData.counts[i];
            factionInfo.counter.innerText = count.toString();
            if (count === 0n) {
                factionInfo.isDead = true;
                containerCounts.removeChild(factionInfo.container);
                this.alive--;

                const faction = this.settings.factions[i];
                const time = this.formatTime();
                const message = this.getDeathMessage(faction.name, gameData.iterations, time);
                this.addEvent(faction.color, faction.name, time, message);

                // Stop game and announce winner
                if (this.alive <= 1) {
                    this.stop();
                    for (let j = 0; j < this.counts.length; j++) {
                        if (!this.counts[j].isDead) {
                            const winner = this.settings.factions[j];
                            const message = this.getVictoryMessage(winner.name, gameData.iterations, time);
                            this.addEvent(winner.color, winner.name, time, message);
                            break;
                        }
                    }
                }
            }

            if (count > gameData.counts[leader]) {
                leader = i;
            }
        }

        // Update alive count
        statsAlive.innerText = this.alive.toString();
        statsIterations.innerText = gameData.iterations.toString();
        statsLead.innerText = this.settings.factions[leader].name;
    }

    /**
     * @param {string} color
     * @param {string} name
     * @param {string} time
     * @param {string} message
     * @returns {void}
     */
    addEvent(color, name, time, message) {
        const element = /** @type {HTMLElement} */ (templateEvent.cloneNode(true));
        const infoColor = /** @type {HTMLElement} */ (element.querySelector(".info-color"));
        const infoName = /** @type {HTMLElement} */ (element.querySelector(".info-name"));
        const infoTimestamp = /** @type {HTMLElement} */ (element.querySelector(".info-timestamp"));
        const infoText = /** @type {HTMLElement} */ (element.querySelector(".info-text"));
        infoColor.style.backgroundColor = color;
        infoName.innerText = name;
        infoTimestamp.innerText = time;
        infoText.innerText = message;
        containerEvents.prepend(element);
    }

    /**
     * @param {Date} time
     * @returns {string}
     */
    formatTime(time = new Date()) {
        let hours = ("00" + time.getHours()).slice(-2);
        let minutes = ("00" + time.getMinutes()).slice(-2);
        let seconds = ("00" + time.getSeconds()).slice(-2);
        return hours + ":" + minutes + ":" + seconds;
    }

    /**
     * @param {string} name
     * @param {bigint} iterations
     * @param {string} time
     * @returns {string}
     */
    getDeathMessage(name, iterations, time) {
        const strings = [
            `${name} kicked the bucket after ${iterations} iterations.`,
            `Nobody ever saw ${name} after iteration ${iterations}.`,
            `At ${this.startTime}, ${name} was brought into the world, and lived happily for ${iterations} iterations, before dying at ${time}.`,
            `At ${iterations} iterations, ${name} tragically died.`,
            `${name} spontaniously combusted on iteration ${iterations}.`,
            `How many iterations does it take to kill ${name}? The answer turns out to be ${iterations} iterations.`,
            `In the dark of night at ${time}, ${name} fell off a cliff after ${iterations} iterations.`,
            `"Staying alive is so hard" thought ${name}, after surviving for ${iterations} iterations, "I quit!".`,
            `name: ${name}, iterations: ${iterations}, time of defeat: ${time}.`,
            `Some say that a full life takes exactly ${iterations+1n} iterations to live. Too bad ${name} only lived to ${iterations} iterations.`,
            `It only took ${iterations} iterations, but ${name} is no longer an endangered species! Now it is just dead.`,
            `${name} was not the impostor. ${this.alive} remaining after ${iterations} iterations.`,
            `${name} was offered a better job at Microsoft, and left on day ${iterations}.`,
            `Did you know? More people are killed by vending machines each year than sharks! That's not what happened to ${name}, though; they just died at ${iterations}`,
            `At iterations ${iterations-1n}, ${name} showed a photo of its little daughter. It said it wanted to retire at iteration ${iterations + 1n}. It died at ${iterations}`,
            `"That autopsy report is outdated. A second autopsy was performed at my request. "${name} died at ${iterations}". I received the results this morning.".`,
            `${name} has reached divinity. According to Nietzsche, it died at ${iterations}.`,
            `${name} completed its Club Penguin banned% speedrun at a world record ${iterations}!`,
            `At ${iterations}, ${name} went to a place far away.`,
            `Long live ${name}! Long live ${name}! (long = ${iterations}).`,
            `${name} didn't lose the ${iterations}th iteration! It merely failed to win!`,
            `${name} tried to swim in lava at ${iterations}.`,
        ];
        
        const result = strings[Math.floor(Math.random() * strings.length)];
        return result;
    }

    /**
     * @param {string} name
     * @param {bigint} iterations
     * @param {string} time
     * @returns {string}
     */
    getVictoryMessage(name, iterations, time) {
        let strings = [
            `${name} got that epic victory royale after ${iterations} iterations!`,
            `Congratulations ${name}, you are the last one standing after ${iterations} iterations!`,
            `${name} won? Really? ${name}? And after ${iterations} iterations, no less? Impressive!`,
            `After ${iterations} iterations, at ${time} o'clock, ${name} was victorious!`,
            `${iterations} iterations? Wow, you took your time, ${name}. Congratulations!`,
        ];

        const result = strings[Math.floor(Math.random() * strings.length)];
        return result;
    }

    /**
     * @returns {void}
     */
    start() {
        if (this.running) return;
        this.running = true;
        this.run();
    }

    /**
     * @returns {void}
     */
    stop() {
        this.running = false;
        if(this.nextFrame !== null) {
            cancelAnimationFrame(this.nextFrame);
        }
    }

    /**
     * @returns {void}
     */
    run() {
        this.nextFrame = null;
        this.game.step();
        if (this.running) {
            this.nextFrame = requestAnimationFrame(() => {
                this.run();
            });
        } 
    }
}

/** @type {{[k: string]: () => Promise<PixelFightConstructor>}} */
const fightConstructors = {
    "cpu": async () => (await import("./pixels_cpu.js")).default,
    "wasm": async () => (await import("./pixels_wasm.js")).default,
    "gl": async () => (await import("./pixels_webgl.js")).default,
    "gpu": async () => (await import("./pixels_webgpu.js")).default,
};

/**
 * @param {GameSettings} settings
 * @returns {Promise<void>}
 */
async function run(settings) {
    // Check execution mode
    if (!(settings.mode in fightConstructors)) throw new Error("invalid execution mode");
    const constructor = await fightConstructors[settings.mode]();

    // Check factions
    if (settings.factions.length < 2) throw new Error("need at least 2 factions to start");
    settings.factions.forEach((faction) => {
        faction.name ||= makeColor(faction.rgb);
    });

    // Construct game and start running
    const gameRunner = new GameRunner(settings, constructor);
    gameRunner.start();
}

// Add listener to run button
configRunButton.addEventListener("click", () => {
    settings.apply();
    let url = settings.createUrl(true);
    window.location.search = url;
});

// Try running?
if (settings.play) {
    await run(settings);
    settings.play = true;

    containerConfig.classList.add("hidden");
    containerMain.classList.remove("hidden");
}

// Start the thing
if (!settings.play) {
    containerConfig.classList.remove("hidden");
    containerMain.classList.add("hidden");
}

} catch (e) {
    const node = document.createElement('p');
    node.innerText = String(e);
    document.body.appendChild(node);
}
