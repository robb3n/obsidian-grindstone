import { DataStore } from '../../storage/data-store';
import { SrsParams, BUILTIN_PRESETS } from '../../card/types';
import { t, getLang } from '../../i18n';

/** Resolve a preset id (built-in or user) to its SrsParams. Falls back to global default. */
export function resolvePresetParams(ds: DataStore, presetId: string): SrsParams {
  const allPresets = [
    ...BUILTIN_PRESETS,
    ...(ds.getSettings().customPresets ?? []),
  ];
  const preset = allPresets.find(p => p.id === presetId);
  return preset?.params ?? ds.getSrsParams();
}

/** Display name for a deck's strategy override. */
export function resolveStrategyName(ds: DataStore, deckTag: string): string {
  const overrides = ds.getDeckSrsOverrides();
  const override = overrides[deckTag];
  if (!override) return t('srs.global_default');
  if (typeof override === 'string') {
    const allPresets = [...BUILTIN_PRESETS, ...(ds.getSettings().customPresets ?? [])];
    const p = allPresets.find(p => p.id === override);
    if (!p) return t('srs.global_default');
    return getLang() === 'zh' ? p.name : p.nameEn;
  }
  return t('srs.custom_label');
}
