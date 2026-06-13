# Fase 0 — Hardening de Infraestructura

## Por qué esta fase existe

En un SaaS multi-tenant, un bug en producción no afecta a un cliente: afecta a todos simultáneamente.
No hay "el cliente X tuvo un problema". Hay "el sistema cayó para los 200 clientes activos".

Esta fase se ejecuta **antes de escribir una sola línea de lógica de negocio**.
Su objetivo es que ningún código llegue a producción sin haber pasado por un entorno idéntico,
con pruebas automatizadas que validen tanto la funcionalidad como el aislamiento entre tenants.

---

## Entornos

```
Developer (local)
      │
      │  git push → PR abierto
      ▼
CI Pipeline (GitHub Actions)
      │  lint + type-check + unit tests
      ▼
Staging Environment
      │  integration tests + tenant isolation tests + smoke tests
      │  "Staging Tenant" idéntico a producción
      ▼
Production Environment
      │  deploy con zero-downtime (rolling update)
      ▼
Post-deploy smoke test automático
      │  si falla → rollback automático
```

### Reglas de oro

- **Nadie hace push directo a `main`**. Todo entra por Pull Request.
- **Ningún PR se mergea sin que el pipeline esté verde**.
- **Staging es idéntico a producción**: misma versión de PostgreSQL, Redis, variables de entorno (con valores de prueba), misma configuración de Nginx.
- **El "Staging Tenant"** es un tenant real creado en staging con datos representativos: productos, clientes, pedidos en distintos estados, historial de conversaciones.

---

## Estructura de Branches

```
main          → producción (protegida, solo merge via PR)
staging       → entorno de staging (auto-deploy en cada merge)
develop       → integración de features (opcional para equipos grandes)
feature/*     → features individuales
fix/*         → bugfixes
hotfix/*      → fixes urgentes de producción (merge directo a main + staging)
```

### Reglas de protección en GitHub

```yaml
# Configurar en GitHub → Settings → Branches → Branch protection rules

Branch: main
  ✅ Require pull request before merging
  ✅ Require approvals: 1
  ✅ Require status checks to pass:
       - ci/lint
       - ci/typecheck
       - ci/unit-tests
       - ci/integration-tests
       - ci/tenant-isolation-tests
  ✅ Require branches to be up to date before merging
  ✅ Do not allow bypassing the above settings (ni para admins)
```

---

## Pipeline CI/CD Completo

```yaml
# .github/workflows/ci.yml
name: CI Pipeline

on:
  pull_request:
    branches: [main, staging]
  push:
    branches: [main, staging]

env:
  NODE_VERSION: '20'
  POSTGRES_VERSION: '16'

jobs:
  # ─────────────────────────────────────────
  # JOB 1: Calidad de código (rápido, < 2 min)
  # ─────────────────────────────────────────
  lint-and-typecheck:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - run: npm ci

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npm run typecheck

      - name: Check formatting
        run: npm run format:check

  # ─────────────────────────────────────────
  # JOB 2: Unit Tests (sin dependencias externas)
  # ─────────────────────────────────────────
  unit-tests:
    name: Unit Tests
    runs-on: ubuntu-latest
    needs: lint-and-typecheck
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci

      - name: Run unit tests
        run: npm run test:unit -- --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}

  # ─────────────────────────────────────────
  # JOB 3: Integration Tests (con PostgreSQL + Redis reales)
  # ─────────────────────────────────────────
  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    needs: lint-and-typecheck

    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_DB: vspro_test
          POSTGRES_USER: vspro
          POSTGRES_PASSWORD: test_pass
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      DATABASE_URL: postgresql://vspro:test_pass@localhost:5432/vspro_test
      REDIS_URL: redis://localhost:6379
      JWT_SECRET: test-jwt-secret-min-32-characters-long
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY_TEST }}
      META_APP_SECRET: test-meta-secret
      NODE_ENV: test

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci

      - name: Run DB migrations
        run: npm run db:migrate:test

      - name: Run integration tests
        run: npm run test:integration

  # ─────────────────────────────────────────
  # JOB 4: Tenant Isolation Tests (crítico para SaaS)
  # ─────────────────────────────────────────
  tenant-isolation-tests:
    name: Tenant Isolation Tests
    runs-on: ubuntu-latest
    needs: lint-and-typecheck

    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_DB: vspro_test
          POSTGRES_USER: vspro
          POSTGRES_PASSWORD: test_pass
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379

    env:
      DATABASE_URL: postgresql://vspro:test_pass@localhost:5432/vspro_test
      REDIS_URL: redis://localhost:6379
      JWT_SECRET: test-jwt-secret-min-32-characters-long
      NODE_ENV: test

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm run db:migrate:test

      - name: Run tenant isolation tests
        run: npm run test:isolation

  # ─────────────────────────────────────────
  # JOB 5: Deploy a Staging (solo en push a staging/main)
  # ─────────────────────────────────────────
  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    needs: [unit-tests, integration-tests, tenant-isolation-tests]
    if: github.ref == 'refs/heads/staging' || github.ref == 'refs/heads/main'
    environment: staging

    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Build & push Docker images
        run: |
          aws ecr get-login-password | docker login --username AWS \
            --password-stdin ${{ secrets.ECR_REGISTRY }}

          docker build -t vspro-api:${{ github.sha }} -f apps/api/Dockerfile .
          docker tag vspro-api:${{ github.sha }} \
            ${{ secrets.ECR_REGISTRY }}/vspro-api:staging
          docker push ${{ secrets.ECR_REGISTRY }}/vspro-api:staging

      - name: Run DB migrations on staging
        run: |
          aws ecs run-task \
            --cluster vspro-staging \
            --task-definition vspro-migrations-staging \
            --launch-type FARGATE \
            --network-configuration "awsvpcConfiguration={subnets=[${{ secrets.STAGING_SUBNET }}],securityGroups=[${{ secrets.STAGING_SG }}]}"

      - name: Deploy API to staging (rolling update)
        run: |
          aws ecs update-service \
            --cluster vspro-staging \
            --service vspro-api-staging \
            --force-new-deployment \
            --deployment-configuration \
              "minimumHealthyPercent=100,maximumPercent=200"

      - name: Wait for deployment to stabilize
        run: |
          aws ecs wait services-stable \
            --cluster vspro-staging \
            --services vspro-api-staging

      - name: Run smoke tests against staging
        run: npm run test:smoke -- --env=staging
        env:
          STAGING_URL: ${{ secrets.STAGING_URL }}
          STAGING_TENANT_TOKEN: ${{ secrets.STAGING_TENANT_TOKEN }}

      - name: Notify Slack on failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "❌ Deploy a staging FALLÓ en commit ${{ github.sha }}",
              "channel": "#deployments"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}

  # ─────────────────────────────────────────
  # JOB 6: Deploy a Producción (solo en push a main)
  # ─────────────────────────────────────────
  deploy-production:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: deploy-staging
    if: github.ref == 'refs/heads/main'
    environment: production   # requiere aprobación manual en GitHub

    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID_PROD }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY_PROD }}
          aws-region: us-east-1

      - name: Tag imagen de staging como producción
        run: |
          # Reutiliza la imagen ya construida y probada en staging
          # No se construye de nuevo: lo que se probó es lo que se despliega
          aws ecr batch-get-image \
            --repository-name vspro-api \
            --image-ids imageTag=staging \
            --query 'images[].imageManifest' \
            --output text | \
          aws ecr put-image \
            --repository-name vspro-api \
            --image-tag production \
            --image-manifest -

      - name: Run DB migrations on production
        run: |
          aws ecs run-task \
            --cluster vspro-production \
            --task-definition vspro-migrations-prod \
            --launch-type FARGATE \
            --network-configuration "awsvpcConfiguration={subnets=[${{ secrets.PROD_SUBNET }}],securityGroups=[${{ secrets.PROD_SG }}]}"

      - name: Deploy to production (rolling, zero-downtime)
        run: |
          aws ecs update-service \
            --cluster vspro-production \
            --service vspro-api-production \
            --force-new-deployment \
            --deployment-configuration \
              "minimumHealthyPercent=100,maximumPercent=200"

      - name: Wait for stable deployment
        run: |
          aws ecs wait services-stable \
            --cluster vspro-production \
            --services vspro-api-production

      - name: Post-deploy smoke test en producción
        id: smoke
        run: npm run test:smoke -- --env=production
        env:
          PROD_URL: ${{ secrets.PROD_URL }}
          PROD_SMOKE_TOKEN: ${{ secrets.PROD_SMOKE_TOKEN }}

      - name: Rollback automático si smoke test falla
        if: failure() && steps.smoke.outcome == 'failure'
        run: |
          echo "Smoke test falló. Iniciando rollback..."
          aws ecs update-service \
            --cluster vspro-production \
            --service vspro-api-production \
            --task-definition vspro-api-production:${{ env.PREVIOUS_TASK_DEF }}
          aws ecs wait services-stable \
            --cluster vspro-production \
            --services vspro-api-production
          echo "Rollback completado."

      - name: Notify Slack — deploy exitoso
        if: success()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "✅ Deploy a producción exitoso — ${{ github.sha }}",
              "channel": "#deployments"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
