export default class Faction {
    color: string = "#FF00FF";
    rgb: number = 0xFF00FF;

    constructor(
        public name: string = "",
        color: number = null,
    ) {
        this.setColor(color);
    }

    setColor(color: number = null): void {
        color ??= Math.floor(Math.random() * 0x00FF_FFFF);
        this.rgb = color;
        this.color = makeColor(color);
    }
}

export function factionList(count: number = 2): Faction[] {
    let factions = new Array(count);
    for(let i = 0; i < count; i++) {
        factions[i] = new Faction();
    }
    return factions;
}

export function factionsPrint(factions: Faction[]): void {
    const table = document.createElement('div');
    factions.forEach(function(v, i) {
        let entry = document.createElement('div');
        entry.style.backgroundColor = v.color;
        entry.innerText = i.toString();
        table.append(entry);
    });
    document.body.append(table);
}

export function makeColor(color: number = null): string {
    if(color === null) color = Math.floor(Math.random() * 0x00FF_FFFF);
    let colorHex = color.toString(16);
    return "#" + ("000000" + colorHex).slice(-6);
}

export class FactionInfo {
    constructor(
        public container: HTMLElement,
        public counter: HTMLElement,
        public isDead: boolean = false,
    ) {
    }
}
