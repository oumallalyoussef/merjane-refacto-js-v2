import {DomainError} from '../errors/domain-error.js';

/**
 * Erreur levé lorsqu une commande demandee n existe pas
 */
export class OrderNotFoundError extends DomainError {
	/**
	 * @param orderId
	 */
	public constructor(public readonly orderId: number) {
		super(`Order ${orderId} not found`);
	}
}
