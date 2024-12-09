// @ts-check

/**
 * Retrieves a template from the DOM and clones its content.
 *
 * @param {string} templateId - The ID of the template element to retrieve.
 * @returns {HTMLElement} A clone of the template's content.
 * @throws {Error} If the element with the specified ID is not found.
 */
export function templateCreate(templateId) {
    const element = /** @type {HTMLTemplateElement} */ document.getElementById(templateId);
    if (!element) throw new Error("could not find element " + templateId);
    if (!("content" in element)) throw new Error("element " + templateId + " does not have a content property");
    return element.content.cloneNode(true).children[0];
}
