// @ts-check

import Faction, { makeColor } from "./faction.js";
import { qs, templateCreate } from "./utils.js";

// Config elements
const configWidth = qs(document, HTMLInputElement, "#config-width");
const configMode = qs(document, HTMLSelectElement, "#config-mode");

// Faction shenanigans
const factionEntries = qs(document, HTMLTableSectionElement, "#faction-container");
const factionAdd = qs(document, HTMLButtonElement, "faction-add");
const templateFaction = templateCreate("faction-template");

/**
 * Add faction function
 * @param {string} name
 * @param {?number} color
 */
function addFaction(name = "", color = null) {
    const newFaction = /** @type {HTMLElement} */ (templateFaction.cloneNode(true));
    const deleteButton = qs(newFaction, HTMLButtonElement, ".faction-delete");
    deleteButton.addEventListener("click", function() {
        factionEntries.removeChild(newFaction);
    });

    // Make up a new color
    const newColor = makeColor(color);
    const colorSquare = qs(newFaction, HTMLDivElement, ".color-picker");
    const colorPicker = qs(newFaction, HTMLInputElement, ".faction-color");
    colorPicker.value = newColor;
    colorSquare.style.backgroundColor = newColor;
    colorPicker.addEventListener("change", function(e) {
        colorSquare.style.backgroundColor = colorPicker.value;
    });

    // Set name
    const nameLabel = qs(newFaction, HTMLInputElement, ".faction-name");
    nameLabel.value = name;
    factionEntries.appendChild(newFaction);
}

// Add faction button
factionAdd.addEventListener("click", function() {
    addFaction();
});

export default class GameSettings {
    constructor() {
        this.width = 128;
        this.height = 128;
        this.factions = [
            new Faction("", Math.floor(Math.random() * 0x00FF_FFFF)),
            new Faction("", Math.floor(Math.random() * 0x00FF_FFFF)),
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
                this.factions.push(new Faction(names[i], Number(colors[i])));
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
        const factions = Array(factionEntries.childElementCount);
        factionEntries.childNodes.forEach((v) => {
            const childElement = /** @type {HTMLElement} */ (v);
            const factionColor = qs(childElement, HTMLInputElement, ".faction-color");
            const factionName = qs(childElement, HTMLInputElement, ".faction-name");
            const colorStr = factionColor.value;
            const faction = new Faction(factionName.value, parseInt(colorStr.replace("#", ""), 16));
            factions.push(faction);
        });

        this.width = Number(configWidth.value);
        this.height = this.width;
        this.mode = configMode.value;
        this.factions = factions;
    }

    // Apply state of this to inputs
    store() {
        configWidth.value = this.width.toString();
        configMode.value = this.mode;
        factionEntries.innerHTML = "";
        this.factions.forEach((faction) => {
            addFaction(faction.name, faction.colorRGB);
        });
    }
}
