export const ssrMarkup =
  '<div><glass-button variant="prominent" light-angle="30" defer-hydration="">Go</glass-button><glass-switch checked="" name="wifi" defer-hydration=""></glass-switch></div>';
/** What the DOM looks like once hydration released the elements. */
export const hydratedMarkup = ssrMarkup.replaceAll(' defer-hydration=""', "");
