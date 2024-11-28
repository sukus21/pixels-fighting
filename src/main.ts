// @ts-check

import { PixelFight, PixelFightConstructor, PixelFightFactory } from "./@types/pixelfight.js";
import Faction, { FactionInfo } from "./faction.js";
import { makeColor } from "./faction.js";
import { templateCreate } from "./utils.js";

const configWidth = document.getElementById("config-width") as HTMLInputElement;
const configMode = document.getElementById("config-mode") as HTMLSelectElement;
const configModeWebgpu = document.getElementById("config-mode-webgpu") as HTMLOptionElement;

// Disable WebGPU in unsupported browsers
configMode.value = "gpu";
const webGpuSupported = Boolean(navigator?.gpu?.requestAdapter);
if (!webGpuSupported) {
    configModeWebgpu.disabled = true;
    configMode.value = "cpu";
}

// Grab different containers
const containerMain = document.getElementById("main");
const containerConfig = document.getElementById("config");
const containerCounts = document.getElementById("info-counts");
const containerEvents = document.getElementById("info-events");

// Grab stats containers
const statsIterations = document.getElementById("info-iterations");
const statsGameStarted = document.getElementById("info-game-started");
const statsAlive = document.getElementById("info-alive");
const statsFactionsStarted = document.getElementById("info-factions-started");
const statsLead = document.getElementById("info-lead");
const statsTotalPixels = document.getElementById("info-total-pixels");

// Various templates
const templateCount = templateCreate("info-count-template");
const templateEvent = templateCreate("info-event-template");
const templateFaction = templateCreate("faction-template");

// Faction shenanigans
const factionEntries = document.getElementById("faction-container");
const factionAdd = document.getElementById("faction-add");

// Add faction function
function addFaction(name: string = "", color: number = null) {
    const newFaction = templateFaction.cloneNode(true) as HTMLElement;
    const deleteButton = newFaction.querySelector(".faction-delete");
    deleteButton.addEventListener("click", () => {
        factionEntries.removeChild(newFaction);
    });

    const colorSquare = newFaction.querySelector(".color-picker") as HTMLElement;
    const colorPicker = newFaction.querySelector(".faction-color") as HTMLInputElement;
    const newColor = makeColor(color);
    colorPicker.value = newColor;
    colorSquare.style.backgroundColor = newColor;
    colorPicker.addEventListener("change", () => {
        colorSquare.style.backgroundColor = colorPicker.value;
    });

    const nameLabel = newFaction.querySelector(".faction-name") as HTMLInputElement;
    nameLabel.value = name;
    factionEntries.appendChild(newFaction);
}

// Add faction button
factionAdd.addEventListener("click", () => addFaction());

class GameSettings {
    width: number = 128;
    height: number = 128;
    factions: Faction[];

    mode: string = "gpu";
    play: boolean = true;

    constructor() {
        this.factions = [
            new Faction("", Math.floor(Math.random() * 0x00FF_FFFF)),
            new Faction("", Math.floor(Math.random() * 0x00FF_FFFF)),
        ];

        const urlSearchParams = new URLSearchParams(window.location.search);
        this.load(urlSearchParams);
    }

    // Load state of query into this
    load(query: URLSearchParams) {
        let options = {};
        query.forEach((value, key) => {
            if (options[key] !== undefined) {
                if (typeof options[key] !== "object") {
                    options[key] = [options[key]];
                }
                options[key].push(value);
            }
            else {
                options[key] = value;
            }
        });

        function getSingleValue(key: string): string|null {
            if (!options[key]) return null;
            if (typeof options[key] === "object") return options[key][0];
            return options[key];
        }

        function getMultiValue(key: string): string[] {
            if (!options[key]) return [];
            if (typeof options[key] !== "object") return [options[key]];
            return options[key];
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

    // Save state of this to url
    createUrl(playing: boolean = false): string {
        let url = "w=" + this.width;
        url += "&m=" + this.mode;
        if(playing) url += "&p";
        this.factions.forEach((faction) => {
            url += "&fn=" + faction.name || " ";
            url += "&fc=" + faction.rgb.toString();
        });
        return url;
    }

    // Get state of inputs and apply to this
    apply(): void {
        let factions = Array(factionEntries.childElementCount);
        factionEntries.childNodes.forEach((v: HTMLElement, i: number) => {
            const factionColor = v.querySelector(".faction-color") as HTMLInputElement;
            const factionName = v.querySelector(".faction-name") as HTMLInputElement;
            const color = parseInt(factionColor.value.replace("#", ""), 16);
            factions[i] = new Faction(factionName.value, color);
        });

        this.width = Number(configWidth.value);
        this.height = this.width;
        this.mode = configMode.value;
        this.factions = factions;
    }

    // Apply state of this to inputs
    store(): void {
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
    alive: number;
    running: boolean = false;
    nextFrame: number|null = null;
    startTime: string;
    counts: FactionInfo[];
    inited: boolean = false;

    interval: number;

    constructor(
        private readonly settings: GameSettings,
        private readonly game: PixelFight,
        private readonly factions: Faction[],
    ) {
        this.alive = this.factions.length;
        this.startTime = this.formatTime();
        this.counts = this.setup();
    }

    setup() {
        if (this.inited) return;
        this.inited = true;

        const results = new Array(this.factions.length);
        for (let i = 0; i < this.factions.length; i++) {
            const element = templateCount.cloneNode(true) as HTMLElement;
            const infoColor = element.querySelector(".info-color") as HTMLElement;
            const infoName = element.querySelector(".info-name") as HTMLElement;
            const counter = element.querySelector(".info-text") as HTMLElement;
            infoColor.style.backgroundColor = this.factions[i].color;
            infoName.innerText = this.factions[i].name;
            counter.innerText = "";
            containerCounts.appendChild(element);
            results[i] = new FactionInfo(element, counter, false);
        }
        
        // Refresh
        this.interval = setInterval(() => {
            if (!this.running) this.game.draw();
            this.updateScores(); 
        }, 50);

        // Controls
        const canvas = this.game.getCanvas();
        document.getElementById("game").append(canvas);
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

    updateScores(): void {
        const gameData = this.game.getGameData();
        let leader: number= null;
        for (let i = 0; i < this.counts.length; i++) {
            const factionInfo = this.counts[i];
            if (factionInfo.isDead) continue;

            const count = gameData.counts[i];
            factionInfo.counter.innerText = count.toString();
            if (count === 0n) {
                factionInfo.isDead = true;
                containerCounts.removeChild(factionInfo.container);
                this.alive--;

                let faction = this.factions[i];
                let time = this.formatTime();
                let message = this.getDeathMessage(faction.name, gameData.iterations, time);
                this.addEvent(faction.color, faction.name, time, message);

                // Stop game and announce winner
                if (this.alive <= 1) {
                    this.stop();
                    let survivor: FactionInfo;
                    let j = 0;
                    for (; j < this.counts.length; j++) {
                        if (!this.counts[j].isDead) {
                            survivor = this.counts[j];
                            break;
                        }
                    }
                    
                    const winner = this.factions[j];
                    const message = this.getVictoryMessage(winner.name, gameData.iterations, time);
                    this.addEvent(winner.color, winner.name, time, message);
                }
            }

            if (leader === null || count > gameData.counts[leader]) {
                leader = i;
            }
        }

        // Update alive count
        statsAlive.innerText = this.alive.toString();
        statsIterations.innerText = gameData.iterations.toString();
        statsLead.innerText = this.factions[leader].name;
    }

    addEvent(color: string, name: string, time: string, message: string) {
        const element = templateEvent.cloneNode(true) as HTMLElement;
        const infoColor = element.querySelector(".info-color") as HTMLElement;
        const infoName = element.querySelector(".info-name") as HTMLElement;
        const infoTimestamp = element.querySelector(".info-timestamp") as HTMLElement;
        const infoText = element.querySelector(".info-text") as HTMLElement;
        infoColor.style.backgroundColor = color;
        infoName.innerText = name;
        infoTimestamp.innerText = time;
        infoText.innerText = message;
        containerEvents.prepend(element);
    }

    formatTime(time: Date = new Date()): string {
        let hours = ("00" + time.getHours()).slice(-2);
        let minutes = ("00" + time.getMinutes()).slice(-2);
        let seconds = ("00" + time.getSeconds()).slice(-2);
        return hours + ":" + minutes + ":" + seconds;
    }

    getDeathMessage(name: string, iterations: bigint, time: string): string {
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

    getVictoryMessage(name: string, iterations: bigint, time: string): string {
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

    start(): void {
        if (this.running) return;
        this.running = true;
        this.run();
    }

    stop(): void {
        this.running = false;
        if(this.nextFrame !== null) {
            cancelAnimationFrame(this.nextFrame);
        }
    }

    run(): void {
        this.nextFrame = null;
        this.game.step();
        if (this.running) {
            this.nextFrame = requestAnimationFrame(() => {
                this.run();
            });
        } 
    }
}

// Start function
async function run(settings: GameSettings) {
    const fightConstructors: {[k: string]: () => Promise<PixelFightConstructor>} = {
        "cpu": async () => (await import("./pixels_cpu.js")).default,
        "wasm": async () => (await import("./pixels_wasm.js")).default,
        "gl": async () => (await import("./pixels_webgl.js")).default,
        "gpu": async () => (await import("./pixels_webgpu.js")).default,
    }
    if (!fightConstructors[settings.mode]) {
        alert("Please choose a valid execution mode");
        return false;
    }
    const constructor = await fightConstructors[settings.mode]();

    // Check faction count
    if (settings.factions.length < 2) {
        alert("You need at least 2 factions to start");
        return false;
    }

    // Set names for factions missing names
    settings.factions.forEach((faction) => {
        faction.name ||= makeColor(faction.rgb);
    });

    const gpuFight = new constructor(settings.factions, settings.width, settings.height);
    const gameRunner = new GameRunner(settings, gpuFight, settings.factions);
    gameRunner.start();

    containerConfig.classList.add("hidden");
    containerMain.classList.remove("hidden");
    return true;
}

// Add listener to run button
document.getElementById("config-run-button").addEventListener("click", function() {
    settings.apply();
    let url = settings.createUrl(true);
    window.location.search = url;
});

// Try running?
if (settings.play) {
    settings.play = await run(settings);
}

// Start the thing
if (!settings.play) {
    containerConfig.classList.remove("hidden");
    containerMain.classList.add("hidden");
}
