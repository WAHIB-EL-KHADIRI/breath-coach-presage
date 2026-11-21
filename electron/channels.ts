export const CH = {
  version: 'breathcoach:version',
  keyStatus: 'breathcoach:key:status',
  keySave: 'breathcoach:key:save',
  keyLoad: 'breathcoach:key:load',
  keyRemove: 'breathcoach:key:remove',
  armCamera: 'breathcoach:camera:arm',
  sdkStatus: 'breathcoach:sdk:status',
  openExternal: 'breathcoach:open-external',
  nativeStart: 'breathcoach:native:start',
  nativeStop: 'breathcoach:native:stop',
  nativeEvent: 'breathcoach:native:event',
} as const;

/** Fixed allow-list: the renderer asks for an id, never for an arbitrary URL. */
export const EXTERNAL_LINKS: Record<string, string> = {
  'presage-console': 'https://physiology.presagetech.com/',
};
