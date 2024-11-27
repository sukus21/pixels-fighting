// @ts-check

/**
 * Template cloner
 * @param {string} templateId
 * @returns {HTMLElement}
 */
export function templateCreate(templateId) {
    const element = document.getElementById(templateId);
    if (!element) throw new Error("could not find element " + templateId);
    element.remove();
    element.removeAttribute("id");
    element.classList.remove("hidden");
    return element;
}

/**
 * QuerySelector, with a given return type
 * 
 * @template T
 * @param {HTMLElement|Document} node
 * @param {{new (): T}} expected
 * @param {string} selector
 * @returns {T}
 */
export function qs(node, expected, selector) {
    const newNode = node.querySelector(selector);
    // @ts-ignore
    if (newNode?.__proto__.constructor !== expected) {
        throw new Error("does not match expected type");
    }
    return /** @type {T} */ (newNode);
}
