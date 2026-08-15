const activeModalRoots: HTMLElement[] = [];
const managedElements = new Map<HTMLElement, { ariaHidden: string | null; inert: boolean }>();

function restoreElement(element: HTMLElement) {
  const previous = managedElements.get(element);
  if (!previous) return;

  if (previous.ariaHidden === null) element.removeAttribute("aria-hidden");
  else element.setAttribute("aria-hidden", previous.ariaHidden);
  element.toggleAttribute("inert", previous.inert);
  managedElements.delete(element);
}

function reconcileBodyIsolation() {
  const topModalRoot = activeModalRoots.at(-1);
  if (!topModalRoot) {
    managedElements.forEach((_previous, element) => restoreElement(element));
    return;
  }

  Array.from(document.body.children).forEach((element) => {
    if (!(element instanceof HTMLElement)) return;
    if (element === topModalRoot) {
      restoreElement(element);
      return;
    }

    if (!managedElements.has(element)) {
      managedElements.set(element, {
        ariaHidden: element.getAttribute("aria-hidden"),
        inert: element.hasAttribute("inert"),
      });
    }
    element.setAttribute("aria-hidden", "true");
    element.setAttribute("inert", "");
  });
}

/**
 * Makes only the most recently opened modal portal available to assistive
 * technology and pointer/keyboard interaction. Ownership is stack-based so a
 * nested dialog restores its parent modal rather than stale body attributes.
 */
export function acquireModalIsolation(modalRoot: HTMLElement) {
  activeModalRoots.push(modalRoot);
  reconcileBodyIsolation();

  return () => {
    const index = activeModalRoots.lastIndexOf(modalRoot);
    if (index >= 0) activeModalRoots.splice(index, 1);
    reconcileBodyIsolation();
  };
}
