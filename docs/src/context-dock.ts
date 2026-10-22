import type { Scope } from "./scope";
import "./context-dock.css";

export function mountContextDock(root: ParentNode, scope: Scope): void {
  const dock = root.querySelector<HTMLElement>("[data-context-dock]");
  const photos = dock?.querySelector<HTMLUListElement>("[data-context-photos]");
  const toolbar = dock?.querySelector<HTMLElement>("[data-context-toolbar]");
  const summary = dock?.querySelector<HTMLElement>("[data-context-summary]");
  const primary = dock?.querySelector<HTMLElement>("[data-context-primary]");
  const secondary = dock?.querySelector<HTMLElement>("[data-context-secondary]");
  const status = dock?.querySelector<HTMLElement>("[data-context-status]");
  if (!dock || !photos || !toolbar || !summary || !primary || !secondary || !status) return;

  const items = Array.from(photos.querySelectorAll<HTMLElement>("[data-context-photo]"));
  const selected = new Set<HTMLElement>();
  const favorites = new Set<HTMLElement>();
  let sortDescending = false;

  const render = () => {
    const count = selected.size;
    dock.toggleAttribute("data-has-selection", count > 0);
    summary.replaceChildren(
      document.createTextNode(count ? `${count} selected ` : "Browse "),
      Object.assign(document.createElement("span"), {
        textContent: `${items.length} photos`,
      }),
    );
    primary.textContent = count
      ? [...selected].every((item) => favorites.has(item)) ? "Remove favorites" : "Add favorites"
      : sortDescending ? "Sort Z-A" : "Sort A-Z";
    secondary.textContent = count ? "Clear selection" : "Select all";
    for (const item of items) {
      item.querySelector("button")?.setAttribute("aria-pressed", String(selected.has(item)));
      const favorite = item.querySelector<HTMLElement>("[data-context-favorite]");
      if (favorite) favorite.hidden = !favorites.has(item);
      const description = item.querySelector("[data-context-description]");
      if (description) description.textContent = favorites.has(item) ? "Favorite" : "Not a favorite";
    }
  };

  for (const item of items) {
    const button = item.querySelector("button");
    if (!button) continue;
    scope.on(button, "click", () => {
      if (selected.has(item)) selected.delete(item);
      else selected.add(item);
      render();
    });
    button.disabled = false;
  }

  scope.on(primary, "click", () => {
    if (selected.size) {
      const remove = [...selected].every((item) => favorites.has(item));
      for (const item of selected) {
        if (remove) favorites.delete(item);
        else favorites.add(item);
      }
      const count = selected.size;
      status.textContent = `${count} ${count === 1 ? "photo" : "photos"} ${remove ? "removed from" : "added to"} favorites.`;
    } else {
      const ordered = [...items].sort((a, b) =>
        (a.dataset.title ?? "").localeCompare(b.dataset.title ?? "", "en"),
      );
      if (sortDescending) ordered.reverse();
      photos.append(...ordered);
      status.textContent = `Photos sorted ${sortDescending ? "Z to A" : "A to Z"}.`;
      sortDescending = !sortDescending;
    }
    render();
  });

  scope.on(secondary, "click", () => {
    if (selected.size) {
      selected.clear();
      status.textContent = "Selection cleared.";
    } else {
      for (const item of items) selected.add(item);
      status.textContent = `All ${items.length} photos selected.`;
    }
    render();
  });

  primary.removeAttribute("disabled");
  secondary.removeAttribute("disabled");
  toolbar.hidden = false;
  render();
  scope.add(() => {
    toolbar.hidden = true;
    primary.setAttribute("disabled", "");
    secondary.setAttribute("disabled", "");
    for (const item of items) {
      const button = item.querySelector("button");
      if (button) button.disabled = true;
    }
  });
}
