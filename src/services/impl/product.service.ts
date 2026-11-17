import {type Cradle} from '@fastify/awilix';
import {eq} from 'drizzle-orm';
import {type INotificationService} from '../notifications.port.js';
import {products, type Product} from '@/db/schema.js';
import {type Database} from '@/db/type.js';
import {parseProductType} from '@/domain/product/product-type.js';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Applique les règles de vente d'un produit commandé, selon son type.
 */
export class ProductService {
	private readonly ns: INotificationService;
	private readonly db: Database;

	/**
	 * @param dependencies - Le service de notification et la base de données.
	 */
	public constructor({ns, db}: Pick<Cradle, 'ns' | 'db'>) {
		this.ns = ns;
		this.db = db;
	}

	/**
	 * Traite la commande d'une unite du produit : décrémente son stock s'il est vendable,
	 * sinon notifie les clients (délai, rupture ou expiration) selon le type du produit.
	 *
	 * @param product - Le produit commandé.
	 * @throws {UnknownProductTypeError} Si le type du produit n'est pas reconnu.
	 */
	public async processProduct(product: Product): Promise<void> {
		const now = new Date();

		switch (parseProductType(product.type)) {
			case 'NORMAL': {
				await this.processNormal(product);
				break;
			}

			case 'SEASONAL': {
				await this.processSeasonal(product, now);
				break;
			}

			case 'EXPIRABLE': {
				await this.processExpirable(product, now);
				break;
			}
		}
	}

	private async processNormal(product: Product): Promise<void> {
		if (product.available > 0) {
			await this.sellOne(product);
		} else if (product.leadTime > 0) {
			this.ns.sendDelayNotification(product.leadTime, product.name);
		}
	}

	private async processSeasonal(product: Product, now: Date): Promise<void> {
		const seasonStart = product.seasonStartDate!;
		const seasonEnd = product.seasonEndDate!;

		if (now > seasonStart && now < seasonEnd && product.available > 0) {
			await this.sellOne(product);
			return;
		}

		const restockDate = new Date(now.getTime() + (product.leadTime * MILLISECONDS_PER_DAY));
		if (restockDate > seasonEnd) {
			this.ns.sendOutOfStockNotification(product.name);
			await this.setAvailable(product, 0);
		} else if (seasonStart > now) {
			this.ns.sendOutOfStockNotification(product.name);
		} else {
			this.ns.sendDelayNotification(product.leadTime, product.name);
		}
	}

	private async processExpirable(product: Product, now: Date): Promise<void> {
		const expiryDate = product.expiryDate!;

		if (product.available > 0 && expiryDate > now) {
			await this.sellOne(product);
			return;
		}

		this.ns.sendExpirationNotification(product.name, expiryDate);
		await this.setAvailable(product, 0);
	}

	private async sellOne(product: Product): Promise<void> {
		await this.setAvailable(product, product.available - 1);
	}

	private async setAvailable(product: Product, available: number): Promise<void> {
		await this.db.update(products).set({available}).where(eq(products.id, product.id));
	}
}
