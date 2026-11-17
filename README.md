### Consignes JS:

- Si probleme de version pnpm, utiliser `corepack enable pnpm` qui devrait automatiquement utiliser la bonne version
- Ne pas modifier les classes qui ont un commentaire: `// WARN: Should not be changed during the exercise
`
- Pour lancer les tests: `pnpm test`
  - integration only in watch mode `pnpm test:integration`
  - unit only in watch mode `pnpm test:unit`

## Merjane : suivi d'inventaire

Quand une commande est traitée (`POST /orders/:orderId/processOrder`), chaque produit commandé
voit son stock décrémenté, ou bien les clients sont notifiés si le produit n'est pas vendable.
Les règles dépendent du type de produit.

### Règles métier

| Type | Vendable si | Sinon |
|---|---|---|
| `NORMAL` | `available > 0` | notification du délai de réapprovisionnement (si `leadTime > 0`) |
| `SEASONAL` | on est dans la saison et `available > 0` | rupture si le réapprovisionnement dépasse la fin de saison ou si la saison n'a pas commencé (le stock est alors remis à 0 dans le premier cas), délai sinon |
| `EXPIRABLE` | `available > 0` et date d'expiration non dépassée | notification d'expiration et stock remis à 0 |

Un produit d'un type inconnu est une erreur de données : la commande est rejetée (422) avant que le
moindre stock ne soit modifié.

### Architecture

```
src/
├── controllers/   contrat HTTP uniquement (validation des paramètres, réponse)
├── services/      règles métier : OrderService, ProductService
├── domain/        types et erreurs du métier (ProductType, DomainError, ...)
├── db/            schéma Drizzle
└── di/, configuration/, shutdown/, utils/   infrastructure
```

Le chemin d'une requête : `OrderController` -> `OrderService` -> `ProductService` -> base de
données et notifications. Les erreurs métier héritent de `DomainError` et sont traduites en
réponse 422 par le gestionnaire d'erreurs Fastify (`src/fastify.ts`), jamais dans le controller.

Les conventions de l'équipe sont dans `CLAUDE.md`.

### Lancer le projet

Node 20 minimum, puis :

```bash
corepack enable pnpm
pnpm install
pnpm test        # tests unitaires puis tests d'intégration
pnpm lint
```

Les tests sont à côté du code qu'ils testent :

- `*.spec.ts` : tests unitaires des règles métier (services, types du domaine) ;
- `*.integration.spec.ts` : tests du controller, qui ne vérifient que le contrat HTTP.

### Points d'attention

- Un produit `EXPIRABLE` non expiré mais en rupture de stock déclenche une notification
  d'**expiration**. C'est le comportement historique, conservé tel quel (il est couvert par un test).
- Les dates des produits `SEASONAL` et `EXPIRABLE` sont nullables en base. Le code suppose qu'elles
  sont renseignées pour ces types, comme avant la refacto.
