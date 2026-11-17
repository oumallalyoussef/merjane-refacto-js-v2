import fastify from 'fastify';
import {asValue} from 'awilix';
import {awilixPlugin} from './di/awilix.plugin.js';
import {configureDiContext} from './di/di.context.js';
import shutdownPlugin from './shutdown/shutdown.plugin.js';
import {drizzlePlugin} from './db/drizzle.plugin.js';
import {orderController} from './controllers/order-controller.js';
import {DomainError} from './domain/errors/domain-error.js';

export async function buildFastify() {
	const server = fastify();

	server.setErrorHandler(async (error, _request, reply) => {
		if (error instanceof DomainError) {
			return reply.status(422).send({
				statusCode: 422,
				error: 'Unprocessable Entity',
				message: error.message,
			});
		}

		throw error;
	});

	await server.register(awilixPlugin());
	await server.register(drizzlePlugin);
	await server.register(shutdownPlugin);
	await server.register(configureDiContext);
	await server.register(orderController);

	server.addHook('onRequest', async request => {
		request.diScope.register({
			logger: asValue(request.log),
		});
	});
	return server;
}
