import { GrindstoneSettings } from '../card/types';

/**
 * Check whether a tag matches any trigger tag, respecting prefix-match mode.
 */
export function tagMatchesTrigger(
  tag: string,
  settings: GrindstoneSettings,
): boolean {
  return tagMatches(tag, settings.triggerTags, settings.prefixMatch);
}

/**
 * Check whether a tag matches any exclude tag (always exact or prefix).
 */
export function tagMatchesExclude(
  tag: string,
  settings: GrindstoneSettings,
): boolean {
  return tagMatches(tag, settings.excludeTags, false);
}

function tagMatches(
  tag: string,
  configured: string[],
  prefixMatch: boolean,
): boolean {
  for (const ct of configured) {
    if (prefixMatch) {
      if (tag === ct || tag.startsWith(ct + '/')) return true;
    } else {
      if (tag === ct) return true;
    }
  }
  return false;
}
