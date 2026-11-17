/* eslint-disable no-await-in-loop */
import {type Cradle} from '@fastify/awilix';
import {eq} from 'drizzle-orm';
import {orders} from '@/db/schema.js';
import {type Database} from '@/db/type.js';
import {OrderNotFoundError} from '@/domain/order/order-not-found.error.js';
import {parseProductType} from '@/domain/product/product-type.js';
import {type ProductService} from '@/services/impl/product.service.js';

/**
 * Traite les commandes : applique les regles de vente a chaque produit commande
 */
export class OrderService {
	private readonly db: Database;
	private readonly ps: ProductService;

	/**
	 * @param dependencies
	 */
	public constructor({db, ps}: Pick<Cradle, 'db' | 'ps'>) {
		this.db = db;
		this.ps = ps;
	}

	/**
	 * Traite une commande : chaque produit commande voit son stock decremente ou les clients sont notifies
	 *
	 * Les types de tous les produits sont valides avant de modifier le moindre stock,
	 * pour qu une commande ne soit jamais traitee a moitie
	 *
	 * @param orderId - id de la commande
	 * @throws {OrderNotFoundError} Si la commande n existe pas
	 * @throws {UnknownProductTypeError} Si un produit de la commande a un type inconnu
	 */
	public async processOrder(orderId: number): Promise<void> {
		const order = await this.db.query.orders.findFirst({
			where: eq(orders.id, orderId),
			with: {products: {columns: {}, with: {product: true}}},
		});
		if (!order) {
			throw new OrderNotFoundError(orderId);
		}

		const productList = order.products.map(({product}) => product);
		for (const {type} of productList) {
			parseProductType(type);
		}

		for (const product of productList) {
			await this.ps.processProduct(product);
		}
	}
}
