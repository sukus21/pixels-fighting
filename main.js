// @ts-check

import Faction from "./faction.js";
import {factionList, makeColor} from "./faction.js";

// Disable WebGPU in unsupported browsers
const webGpuSupported = Boolean(navigator?.gpu);
if(!webGpuSupported) {
    document.getElementById("config-mode-webgpu").disabled = true;
    document.getElementById("config-mode").value = "cpu";
} 
else {
    document.getElementById("config-mode").value = "gpu";
}

// Template cloner
function templateCreate(templateId) {
    const element = document.getElementById(templateId).cloneNode(true);
    element.removeAttribute("id");
    element.classList.remove("hidden");
    return element;
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
function addFaction(name = "", color = null) {
    const newFaction = templateFaction.cloneNode(true);
    const deleteButton = newFaction.querySelector(".faction-delete");
    deleteButton.addEventListener("click", function() {
        factionEntries.removeChild(newFaction);
    });
    const colorSquare = newFaction.querySelector(".color-picker");
    const colorPicker = newFaction.querySelector(".faction-color");
    const newColor = makeColor(color);
    colorPicker.value = newColor;
    colorSquare.style.backgroundColor = newColor;
    colorPicker.addEventListener("change", function(e) {
        colorSquare.style.backgroundColor = colorPicker.value;
    });
    const nameLabel = newFaction.querySelector(".faction-name");
    nameLabel.value = name;
    factionEntries.appendChild(newFaction);
}

// Add faction button
factionAdd.addEventListener("click", function() {
    addFaction();
});

class GameSettings {
    constructor() {
        this.width = 128;
        this.height = 128;
        this.factions = [
            {name: "", color: Math.floor(Math.random() * 0x00FF_FFFF)},
            {name: "", color: Math.floor(Math.random() * 0x00FF_FFFF)},
        ];
        this.mode = "gpu";
        this.play = true;

        const urlSearchParams = new URLSearchParams(window.location.search);
        this.load(urlSearchParams);
    }

    // Load state of query into this
    load(query) {
        let options = {};
        query.forEach(function(value, key) {
            if(options[key] !== undefined) {
                if(typeof options[key] !== "object") {
                    options[key] = [options[key]];
                }
                options[key].push(value);
            }
            else {
                options[key] = value;
            }
        });

        function getSingleValue(key) {
            if(!options[key]) return undefined;
            if(typeof options[key] === "object") return options[key][0];
            return options[key];
        }

        function getMultiValue(key) {
            if(!options[key]) return [];
            if(typeof options[key] !== "object") return [options[key]];
            return options[key];
        }

        this.width = Number(getSingleValue("w") ?? this.width);
        this.height = Number(getSingleValue("h") ?? this.width);
        this.mode = String(getSingleValue("m") ?? this.mode);
        this.play = Boolean(options["p"] !== undefined ?? this.play);

        const names = getMultiValue("fn");
        const colors = getMultiValue("fc");
        
        if(Math.min(names.length, colors.length) !== 0) {
            this.factions = [];
            for(let i = 0; i < names.length && i < colors.length; i++) {
                this.factions.push({
                    name: names[i],
                    color: Number(colors[i]),
                });
            }
        }
    }

    // Save state of this to url
    createUrl(playing = false) {
        let url = "w=" + this.width;
        url += "&m=" + this.mode;
        if(playing) url += "&p";
        this.factions.forEach(function(faction) {
            url += "&fn=" + faction.name || " ";
            url += "&fc=" + String(faction.color);
        });
        return url;
    }

    // Get state of inputs and apply to this
    apply() {
        let factions = Array(factionEntries.childElementCount);
        factionEntries.childNodes.forEach(function(v, i) {
            let colorStr = v.querySelector(".faction-color").value;
            let color = parseInt(colorStr.replace("#", ""), 16);
            let name = v.querySelector(".faction-name").value;
            factions[i] = {
                name: name,
                color: color,
            };
        });

        this.width = Number(document.getElementById("config-width").value);
        this.height = this.width;
        this.mode = document.getElementById("config-mode").value;
        this.factions = factions;
    }

    // Apply state of this to inputs
    store() {
        document.getElementById("config-width").value = this.width;
        document.getElementById("config-mode").value = this.mode;
        factionEntries.innerHTML = "";
        this.factions.forEach(function(v) {
            addFaction(v.name, v.color);
        });
    }
}

// Settings loading
const settings = new GameSettings();
settings.store();

class GameRunner {
    constructor(settings, game, factions) {
        this.settings = settings;
        this.game = game;
        this.factions = factions;
        this.alive = factions.length;
        this.running = false;
        this.nextFrame = null;
        this.startTime = this.formatTime();
        this.counts = this.setup();
    }

    setup() {
        if(this?.inited) return;
        let results = new Array(this.factions.length);
        for(var i = 0; i < this.factions.length; i++) {
            let element = templateCount.cloneNode(true);
            element.querySelector(".info-color").style.backgroundColor = this.factions[i].color;
            element.querySelector(".info-name").innerText = this.factions[i].name;
            let count = element.querySelector(".info-text");
            count.innerText = "";
            containerCounts.appendChild(element);

            results[i] = {
                element: element,
                count: count,
                dead: false,
            };
        }
        
        // Refresh
        let self = this;
        this.interval = setInterval(function() {
            if(!self.running) self.game.draw();
            self.updateScores(); 
        }, 50);

        // Controls
        const canvas = this.game.getCanvas();
        document.getElementById("game").append(canvas);
        canvas.addEventListener("click", function() {
            if(!self.running) self.game.step();
        });
        canvas.addEventListener("dblclick", function() {
            if(!self.running) self.start();
            else self.stop();
        });

        // Set unchanging stats
        statsGameStarted.innerText = this.startTime;
        statsFactionsStarted.innerText = this.settings.factions.length;
        statsTotalPixels.innerText = this.settings.width * this.settings.height;

        this.inited = true;
        return results;
    }

    updateScores() {
        let status = this.game.getGameData();
        var leader = null;
        for(let i = 0; i < this.counts.length; i++) {
            let counter = this.counts[i];
            if(counter.dead) continue;

            let count = status.counts[i];
            counter.count.innerText = count;
            if(count === 0) {
                counter.dead = true;
                containerCounts.removeChild(counter.element);
                this.alive--;

                let faction = this.factions[i];
                let time = this.formatTime();
                let message = this.getDeathMessage(faction.name, status.iterations, time);
                this.addEvent(faction.color, faction.name, time, message);

                // Stop game and announce winner
                if(this.alive <= 1) {
                    this.stop();
                    let survivor = undefined;
                    let j = 0;
                    for(; j < this.counts.length; j++) {
                        if(!this.counts[j].dead) {
                            survivor = this.counts[j];
                            break;
                        }
                    }
                    
                    let faction = this.factions[j];
                    let message = this.getVictoryMessage(faction.name, status.iterations, time);
                    this.addEvent(faction.color, faction.name, time, message);
                }
            }

            if(leader === null || count > status.counts[leader]) {
                leader = i;
            }
        }

        // Update alive count
        statsAlive.innerText = this.alive;
        statsIterations.innerText = status.iterations;
        statsLead.innerText = this.factions[leader].name;
    }

    addEvent(color, name, time, message) {
        const element = templateEvent.cloneNode(true);
        element.querySelector(".info-color").style.backgroundColor = color;
        element.querySelector(".info-name").innerText = name;
        element.querySelector(".info-timestamp").innerText = time;
        element.querySelector(".info-text").innerText = message;
        containerEvents.prepend(element);
    }

    formatTime(time = new Date()) {
        let hours = ("00" + time.getHours()).slice(-2);
        let minutes = ("00" + time.getMinutes()).slice(-2);
        let seconds = ("00" + time.getSeconds()).slice(-2);
        return hours + ":" + minutes + ":" + seconds;
    }

    getDeathMessage(name, iterations, time) {
        let strings = [
            `${name} kicked the bucket after ${iterations} iterations.`,
            `Nobody ever saw ${name} after iteration ${iterations}.`,
            `At ${this.startTime}, ${name} was brought into the world, and lived happily for ${iterations} iterations, before dying at ${time}.`,
            `At ${iterations} iterations, ${name} tragically died.`,
            `${name} spontaniously combusted on iteration ${iterations}.`,
            `How many iterations does it take to kill ${name}? The answer turns out to be ${iterations} iterations.`,
            `In the dark of night at ${time}, ${name} fell off a cliff after ${iterations} iterations.`,
            `"Staying alive is so hard" thought ${name}, after surviving for ${iterations} iterations, "I quit!".`,
            `name: ${name}, iterations: ${iterations}, time of defeat: ${time}.`,
            `Some say that a full life takes exactly ${iterations+1} iterations to live. Too bad ${name} only lived to ${iterations} iterations.`,
            `It only took ${iterations} iterations, but ${name} is no longer an endangered species! Now it is just dead.`,
            `${name} was not the impostor. ${this.alive} remaining after ${iterations} iterations.`,
            `${name} was offered a better job at Microsoft, and left on day ${iterations}.`,
            `Did you know? More people are killed by vending machines each year than sharks! That's not what happened to ${name}, though; they just died at ${iterations}`,
            `At iterations ${iterations-1}, ${name} showed a photo of its little daughter. It said it wanted to retire at iteration ${iterations + 1}. It died at ${iterations}`,
            `"That autopsy report is outdated. A second autopsy was performed at my request. "${name} died at ${iterations}". I received the results this morning.".`,
            `${name} has reached divinity. According to Nietzsche, it died at ${iterations}.`,
            `${name} completed its Club Penguin banned% speedrun at a world record ${iterations}!`,
            `At ${iterations}, ${name} went to a place far away.`,
            `Long live ${name}! Long live ${name}! (long = ${iterations}).`,
            `${name} didn't lose the ${iterations}th iteration! It merely failed to win!`,
            `${name} tried to swim in lava at ${iterations}.`,
        ];
        
        let result = strings[Math.floor(Math.random() * strings.length)];
        return result;
    }

    getVictoryMessage(name, iterations, time) {
        let strings = [
            `${name} got that epic victory royale after ${iterations} iterations!`,
            `Congratulations ${name}, you are the last one standing after ${iterations} iterations!`,
            `${name} won? Really? ${name}? And after ${iterations} iterations, no less? Impressive!`,
            `After ${iterations} iterations, at ${time} o'clock, ${name} was victorious!`,
            `${iterations} iterations? Wow, you took your time, ${name}. Congratulations!`,
        ];

        let result = strings[Math.floor(Math.random() * strings.length)];
        return result;
    }

    start() {
        if(this.running) return;
        this.running = true;
        this.run();
    }

    stop() {
        this.running = false;
        if(this.nextFrame !== null) {
            cancelAnimationFrame(this.nextFrame);
        }
    }

    run() {
        this.nextFrame = null;
        this.game.step();
        if(this.running) {
            let self = this;
            this.nextFrame = requestAnimationFrame(function() {
                self.run();
            });
        } 
    }
}

// Start function
async function run(settings) {
    const fightConstructors = {
        "cpu": "./pixels_cpu.js",
        "wasm": "./pixels_wasm.js",
        "gl": "./pixels_webgl.js",
        "gpu": "./pixels_webgpu.js",
    }
    if(!fightConstructors[settings.mode]) {
        alert("Please choose a valid execution mode");
        return false;
    }
    const constructor = (await import(fightConstructors[settings.mode])).default;

    // Check faction count
    if(settings.factions.length < 2) {
        alert("You need at least 2 factions to start");
        return false;
    }

    // Create proper faction objects
    let factions = Array(settings.factions.length);
    settings.factions.forEach(function(v, i) {
        if(typeof v !== "object" || typeof v.color === undefined) {
            alert("Malformed faction");
            return false;
        }
        if(typeof v.name === "undefined" || !v.name) v.name = makeColor(v.color);
        factions[i] = new Faction(v.name, v.color);
    });

    const gpuFight = new constructor(factions, settings.width, settings.height);
    const gameRunner = new GameRunner(settings, gpuFight, factions);
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
let didRun = true;
if(settings.play) {
    didRun = run(settings);
    settings.play = didRun;
}

// Start the thing
if(!settings.play) {
    containerConfig.classList.remove("hidden");
    containerMain.classList.add("hidden");
    const containerFactions = document.getElementById("faction-details");
}
