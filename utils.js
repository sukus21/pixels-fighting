// @ts-check

/**
 * Retrieves a template from the DOM and clones its content.
 *
 * @param {string} templateId - The ID of the template element to retrieve.
 * @returns {HTMLElement} A clone of the template's content.
 * @throws {Error} If the element with the specified ID is not found.
 */
export function templateCreate(templateId) {
    const element = document.getElementById(templateId);
    if (!(element instanceof HTMLTemplateElement)) throw new Error("could not find template element " + templateId);
    return /** @type {HTMLElement} */ (element.content.children[0]);
}
