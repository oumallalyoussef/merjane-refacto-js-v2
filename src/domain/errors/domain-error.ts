/**
 * Classe de base des erreurs metier
 *
 * Toute erreur qui herite de `DomainError` exprime la violation d'une regle metier ou une donnée
 * invalide.
 * Elle est traduite en reponse HTTP 422 par le gestionnaire d'erreurs Fastify,
 * jamais dans les controllers.
 */
export abstract class DomainError extends Error {
	protected constructor(message: string) {
		super(message);
		this.name = new.target.name;
	}
}
