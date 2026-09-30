import { ProviderNames } from './index';
import { LRCLib } from './LRCLib';
import { YTMusic } from './YTMusic';

export const providers = {
  [ProviderNames.YTMusic]: new YTMusic(),
  [ProviderNames.LRCLib]: new LRCLib(),
} as const;