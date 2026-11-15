import { UNICORN_IDS as IDS, type UnicornId } from '../../../../src/shared/ids';
import type { UnicornSpec } from '../spec';
import { cinder } from './cinder';
import { glacier } from './glacier';
import { leaf } from './leaf';
import { river } from './river';
import { storm } from './storm';
import { wildstar } from './wildstar';

export const UNICORNS: Record<UnicornId, UnicornSpec> = { wildstar, leaf, glacier, river, cinder, storm };
export const UNICORN_IDS: readonly UnicornId[] = IDS;
