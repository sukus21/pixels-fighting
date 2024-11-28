export function templateCreate(templateId: string): HTMLElement {
    const element = document.getElementById(templateId);
    if (!element) throw new Error("could not find element " + templateId);
    element.remove();
    element.removeAttribute("id");
    element.classList.remove("hidden");
    return element;
}
