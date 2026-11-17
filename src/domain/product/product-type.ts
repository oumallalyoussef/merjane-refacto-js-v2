import {DomainError} from '../errors/domain-error.js';

export const PRODUCT_TYPES = ['NORMAL', 'SEASONAL', 'EXPIRABLE'] as const;

export type ProductType = typeof PRODUCT_TYPES[number];

/**
 * Erreur levee lorsqu un produit porte un type que le metier ne connait pas.
 *
 * C est une erreur de donnees : le produit n est jamais ignore silencieusement.
 */
export class UnknownProductTypeError extends DomainError {
	/**
	 * @param type - Le type reçu, tel qu il est stocke.
	 */
	public constructor(public readonly type: string) {
		super(`Unknown product type: "${type}"`);
	}
}

/**
 * Converti le type brut d un produit (stocke sous forme de texte) en `ProductType`
 *
 * @param type - Le type brut lu en base
 * @returns Le type, type de façon strict
 * @throws {UnknownProductTypeError} Si le type n est pas l'un de `PRODUCT_TYPES`
 */
export function parseProductType(type: string): ProductType {
	const known = PRODUCT_TYPES.find(productType => productType === type);
	if (known === undefined) {
		throw new UnknownProductTypeError(type);
	}

	return known;
}
