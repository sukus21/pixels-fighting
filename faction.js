// @ts-check

export default class Faction {
    /**
     * @param {string} name
     * @param {?number} color
     */
    constructor(name = "", color = null) {
        this.color = "#FF00FF";
        this.colorRGB = 0xFF00FF;

        this.setColor(color);
        this.name = name;
    }

    /**
     * @param {?number} color
     */
    setColor(color = null) {
        color ??= Math.floor(Math.random() * 0x00FF_FFFF);
        this.colorRGB = color;
        this.color = makeColor(color);
    }
}

/**
 * @param {number} count
 * @returns {Faction[]}
 */
export function factionList(count = 2) {
    let factions = new Array(count);
    for(let i = 0; i < count; i++) {
        factions[i] = new Faction();
    }
    return factions;
}

/**
 * @param {Faction[]} factions
 */
export function factionsPrint(factions) {
    let table = document.createElement('div');
    factions.forEach(function(v, i) {
        let entry = document.createElement('div');
        entry.style = "background-color: " + v.color + ";";
        entry.innerText = i + "";
        table.append(entry);
    });
    document.body.append(table);
}

/**
 * @param {?number} color
 * @returns {string}
 */
export function makeColor(color = null) {
    if(color === null) color = Math.floor(Math.random() * 0x00FF_FFFF);
    let colorHex = color.toString(16);
    return "#" + ("000000" + colorHex).slice(-6);
}
