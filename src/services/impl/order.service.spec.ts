import {
	describe, it, expect, beforeEach, afterEach,
} from 'vitest';
import {mockDeep, type DeepMockProxy} from 'vitest-mock-extended';
import {OrderService} from './order.service.js';
import {type ProductService} from './product.service.js';
import {createDatabaseMock, cleanUp} from '@/utils/test-utils/database-tools.ts.js';
import {
	orders, ordersToProducts, products, type ProductInsert,
} from '@/db/schema.js';
import {type Database} from '@/db/type.js';
import {OrderNotFoundError} from '@/domain/order/order-not-found.error.js';
import {UnknownProductTypeError} from '@/domain/product/product-type.js';

describe('OrderService', () => {
	let productServiceMock: DeepMockProxy<ProductService>;
	let orderService: OrderService;
	let database: Database;
	let databaseName: string;
	let closeDatabase: () => void;

	beforeEach(async () => {
		({databaseMock: database, databaseName, close: closeDatabase} = await createDatabaseMock());
		productServiceMock = mockDeep<ProductService>();
		orderService = new OrderService({db: database, ps: productServiceMock});
	});

	afterEach(async () => {
		closeDatabase();
		await cleanUp(databaseName);
	});

	function createOrderWith(...values: ProductInsert[]) {
		return database.transaction(tx => {
			const inserted = tx.insert(products).values(values).returning().all();
			const order = tx.insert(orders).values({}).returning().get();
			tx.insert(ordersToProducts).values(inserted.map(product => ({orderId: order.id, productId: product.id}))).run();
			return {orderId: order.id, inserted};
		});
	}

	it('processes every product of the order', async () => {
		const {orderId, inserted} = createOrderWith(
			{
				type: 'NORMAL', name: 'USB Cable', leadTime: 15, available: 30,
			},
			{
				type: 'EXPIRABLE', name: 'Butter', leadTime: 15, available: 30, expiryDate: new Date(),
			},
		);

		await orderService.processOrder(orderId);

		expect(productServiceMock.processProduct).toHaveBeenCalledTimes(2);
		for (const product of inserted) {
			expect(productServiceMock.processProduct).toHaveBeenCalledWith(expect.objectContaining({id: product.id}));
		}
	});

	it('rejects an unknown product type before processing any product', async () => {
		const {orderId} = createOrderWith(
			{
				type: 'NORMAL', name: 'USB Cable', leadTime: 15, available: 30,
			},
			{
				type: 'UNKNOWN', name: 'Mystery Box', leadTime: 5, available: 10,
			},
		);

		await expect(orderService.processOrder(orderId)).rejects.toThrow(UnknownProductTypeError);
		expect(productServiceMock.processProduct).not.toHaveBeenCalled();
	});

	it('rejects an order that does not exist', async () => {
		await expect(orderService.processOrder(404)).rejects.toThrow(OrderNotFoundError);
	});
});
