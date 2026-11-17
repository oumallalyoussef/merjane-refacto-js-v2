import {
	describe, it, expect, beforeEach, afterEach, vi,
} from 'vitest';
import {mockDeep, type DeepMockProxy} from 'vitest-mock-extended';
import {eq} from 'drizzle-orm';
import {type INotificationService} from '../notifications.port.js';
import {ProductService} from './product.service.js';
import {createDatabaseMock, cleanUp} from '@/utils/test-utils/database-tools.ts.js';
import {products, type ProductInsert} from '@/db/schema.js';
import {type Database} from '@/db/type.js';
import {UnknownProductTypeError} from '@/domain/product/product-type.js';

const NOW = new Date('2026-06-15T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const inDays = (days: number) => new Date(NOW.getTime() + (days * DAY));

type Expectation = {
	available: number;
	notification?: 'delay' | 'outOfStock' | 'expiration';
};

describe('ProductService', () => {
	let notificationServiceMock: DeepMockProxy<INotificationService>;
	let productService: ProductService;
	let database: Database;
	let databaseName: string;
	let closeDatabase: () => void;

	beforeEach(async () => {
		({databaseMock: database, databaseName, close: closeDatabase} = await createDatabaseMock());
		notificationServiceMock = mockDeep<INotificationService>();
		productService = new ProductService({ns: notificationServiceMock, db: database});
		vi.useFakeTimers({toFake: ['Date']});
		vi.setSystemTime(NOW);
	});

	afterEach(async () => {
		vi.useRealTimers();
		closeDatabase();
		await cleanUp(databaseName);
	});

	async function processProduct(values: ProductInsert) {
		const product = database.insert(products).values(values).returning().get();
		await productService.processProduct(product);
		return database.query.products.findFirst({where: eq(products.id, product.id)});
	}

	function expectNotification(product: ProductInsert, notification?: Expectation['notification']) {
		const {sendDelayNotification, sendOutOfStockNotification, sendExpirationNotification} = notificationServiceMock;

		expect(sendDelayNotification).toHaveBeenCalledTimes(notification === 'delay' ? 1 : 0);
		expect(sendOutOfStockNotification).toHaveBeenCalledTimes(notification === 'outOfStock' ? 1 : 0);
		expect(sendExpirationNotification).toHaveBeenCalledTimes(notification === 'expiration' ? 1 : 0);

		switch (notification) {
			case 'delay': {
				expect(sendDelayNotification).toHaveBeenCalledWith(product.leadTime, product.name);
				break;
			}

			case 'outOfStock': {
				expect(sendOutOfStockNotification).toHaveBeenCalledWith(product.name);
				break;
			}

			case 'expiration': {
				expect(sendExpirationNotification).toHaveBeenCalledWith(product.name, product.expiryDate);
				break;
			}

			case undefined: {
				break;
			}
		}
	}

	describe('NORMAL product', () => {
		it.each<[string, ProductInsert, Expectation]>([
			[
				'in stock: sells one unit without notification',
				{
					type: 'NORMAL', name: 'RJ45 Cable', leadTime: 15, available: 30,
				},
				{available: 29},
			],
			[
				'out of stock: notifies the delay',
				{
					type: 'NORMAL', name: 'USB Dongle', leadTime: 10, available: 0,
				},
				{available: 0, notification: 'delay'},
			],
			[
				'out of stock without lead time: notifies nothing',
				{
					type: 'NORMAL', name: 'HDMI Cable', leadTime: 0, available: 0,
				},
				{available: 0},
			],
		])('%s', async (_label, values, expectation) => {
			const result = await processProduct(values);

			expect(result!.available).toBe(expectation.available);
			expectNotification(values, expectation.notification);
		});
	});

	describe('SEASONAL product', () => {
		it.each<[string, ProductInsert, Expectation]>([
			[
				'in season and in stock: sells one unit without notification',
				{
					type: 'SEASONAL', name: 'Watermelon', leadTime: 15, available: 30, seasonStartDate: inDays(-2), seasonEndDate: inDays(58),
				},
				{available: 29},
			],
			[
				'in season, out of stock, restocked before the season ends: notifies the delay',
				{
					type: 'SEASONAL', name: 'Melon', leadTime: 15, available: 0, seasonStartDate: inDays(-2), seasonEndDate: inDays(58),
				},
				{available: 0, notification: 'delay'},
			],
			[
				'in season, out of stock, restocked after the season ends: unavailable',
				{
					type: 'SEASONAL', name: 'Peach', leadTime: 15, available: 0, seasonStartDate: inDays(-50), seasonEndDate: inDays(5),
				},
				{available: 0, notification: 'outOfStock'},
			],
			[
				'season not started: notifies out of stock and keeps the stock',
				{
					type: 'SEASONAL', name: 'Grapes', leadTime: 15, available: 30, seasonStartDate: inDays(180), seasonEndDate: inDays(240),
				},
				{available: 30, notification: 'outOfStock'},
			],
			[
				'season over: notifies out of stock and empties the stock',
				{
					type: 'SEASONAL', name: 'Cherry', leadTime: 15, available: 30, seasonStartDate: inDays(-100), seasonEndDate: inDays(-10),
				},
				{available: 0, notification: 'outOfStock'},
			],
		])('%s', async (_label, values, expectation) => {
			const result = await processProduct(values);

			expect(result!.available).toBe(expectation.available);
			expectNotification(values, expectation.notification);
		});
	});

	describe('EXPIRABLE product', () => {
		it.each<[string, ProductInsert, Expectation]>([
			[
				'not expired and in stock: sells one unit without notification',
				{
					type: 'EXPIRABLE', name: 'Butter', leadTime: 15, available: 30, expiryDate: inDays(26),
				},
				{available: 29},
			],
			[
				'expired: notifies the expiration and empties the stock',
				{
					type: 'EXPIRABLE', name: 'Milk', leadTime: 90, available: 6, expiryDate: inDays(-2),
				},
				{available: 0, notification: 'expiration'},
			],
			[
				'not expired but out of stock: notifies the expiration (historical behaviour)',
				{
					type: 'EXPIRABLE', name: 'Yogurt', leadTime: 15, available: 0, expiryDate: inDays(26),
				},
				{available: 0, notification: 'expiration'},
			],
		])('%s', async (_label, values, expectation) => {
			const result = await processProduct(values);

			expect(result!.available).toBe(expectation.available);
			expectNotification(values, expectation.notification);
		});
	});

	it('rejects a product of unknown type', async () => {
		await expect(processProduct({
			type: 'UNKNOWN', name: 'Mystery Box', leadTime: 5, available: 10,
		})).rejects.toThrow(UnknownProductTypeError);
	});
});
