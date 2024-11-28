// @ts-check

export default class Faction {
    /** @type {string} */ color = "#FF00FF";
    /** @type {number} */ rgb = 0xFF00FF;
    /** @type {string} */ name;

    /**
     * @param {string} name
     * @param {?number} color
     */
    constructor(name = "", color = null) {
        this.name = name;
        this.setColor(color);
    }

    /**
     * @param {?number} color
     */
    setColor(color = null) {
        color ??= Math.floor(Math.random() * 0x00FF_FFFF);
        this.rgb = color;
        this.color = makeColor(color);
    }
}

/**
 * @param {number} count
 * @returns {Faction[]}
 */
export function factionList(count = 2) {
    let factions = new Array(count);
    for (let i = 0; i < count; i++) {
        factions[i] = new Faction();
    }
    return factions;
}

/**
 * @param {Faction[]} factions
 */
export function factionsPrint(factions) {
    const table = document.createElement('div');
    factions.forEach(function(v, i) {
        let entry = document.createElement('div');
        entry.style.backgroundColor = v.color;
        entry.innerText = i.toString();
        table.append(entry);
    });
    document.body.append(table);
}

/**
 * @param {?number} color
 * @returns {string}
 */
export function makeColor(color = null) {
    color ??= Math.floor(Math.random() * 0x00FF_FFFF);
    let colorHex = color.toString(16);
    return "#" + ("000000" + colorHex).slice(-6);
}

export class FactionInfo {
    /** @type {HTMLElement} */ container;
    /** @type {HTMLElement} */ counter;
    /** @type {boolean} */ isDead;

    /**
     * @param {HTMLElement} container
     * @param {HTMLElement} counter
     * @param {boolean} isDead
     */
    constructor(container, counter, isDead = false) {
        this.container = container;
        this.counter = counter;
        this.isDead = isDead;
    }
}
