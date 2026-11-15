/** Generation option defaults and the per-tool options sent to the API. */

export const DEFAULT_OPTIONS = {
  deckSlideCount: 7,
  deckTheme: 'clean_slate',
  imageSlideCount: 7,
  imageSlideTheme: 'light_slate',
  audioLength: 'standard',
  audioTone: 'casual',
};

/** Options sent to the API for `tab`. */
export function optionsFor(tab, options) {
  if (tab === 'slides') return { slideCount: options.deckSlideCount, theme: options.deckTheme };
  if (tab === 'slides_img') return { slideCount: options.imageSlideCount, theme: options.imageSlideTheme };
  if (tab === 'audio') return { audioLength: options.audioLength, audioTone: options.audioTone };
  return {};
}
