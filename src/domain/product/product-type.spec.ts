import {describe, it, expect} from 'vitest';
import {parseProductType, UnknownProductTypeError} from './product-type.js';

describe('parseProductType', () => {
	it.each(['NORMAL', 'SEASONAL', 'EXPIRABLE'])('accepts the known type %s', type => {
		expect(parseProductType(type)).toBe(type);
	});

	it.each(['', 'normal', 'UNKNOWN'])('rejects the unknown type "%s"', type => {
		expect(() => parseProductType(type)).toThrow(UnknownProductTypeError);
	});
});
