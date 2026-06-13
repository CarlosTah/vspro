# Infraestructura y DevOps

## Arquitectura de Despliegue

```
Internet
    │
    ▼
[CloudFront CDN]
    │
    ├──► [S3] ──────────────────── Imágenes, comprobantes, logos
    │
    └──► [Load Balancer (ALB)]
              │
              ├──► [EC2 / ECS] ── API NestJS (2+ instancias)
              │
              ├──► [EC2 / ECS] ── Web Next.js (2+ instancias)
              │
              └──► [EC2 / ECS] ── Worker BullMQ (2+ instancias)
                        │
                        ├──► [RDS PostgreSQL] ── Base de datos principal
                        │
                        └──► [ElastiCache Redis] ── Caché + colas BullMQ
```

---

## Docker Compose (Desarrollo Local)

```yaml
# docker-compose.yml
version: '3.9'

services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: vspro_db
      POSTGRES_USER: vspro
      POSTGRES_PASSWORD: vspro_dev_pass
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    environment:
      DATABASE_URL: postgresql://vspro:vspro_dev_pass@postgres:5432/vspro_db
      REDIS_URL: redis://redis:6379
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      META_APP_SECRET: ${META_APP_SECRET}
      STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY}
      JWT_SECRET: ${JWT_SECRET}
      AWS_S3_BUCKET: ${AWS_S3_BUCKET}
    ports:
      - "3001:3001"
    depends_on:
      - postgres
      - redis
    volumes:
      - ./apps/api:/app/apps/api
      - /app/node_modules

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3001
    ports:
      - "3000:3000"
    depends_on:
      - api

  worker:
    build:
      context: .
      dockerfile: apps/worker/Dockerfile
    environment:
      DATABASE_URL: postgresql://vspro:vspro_dev_pass@postgres:5432/vspro_db
      REDIS_URL: redis://redis:6379
      OPENAI_API_KEY: ${OPENAI_API_KEY}
    depends_on:
      - postgres
      - redis

volumes:
  postgres_data:
  redis_data:
```

---

## Variables de Entorno

```bash
# .env.example

# Base de datos
DATABASE_URL=postgresql://user:pass@host:5432/vspro_db

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_EXPIRES_IN=7d

# OpenAI
OPENAI_API_KEY=sk-...

# Meta (WhatsApp / Messenger / Instagram)
META_APP_ID=
META_APP_SECRET=
META_VERIFY_TOKEN=your-webhook-verify-token

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_BASIC_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_ENTERPRISE_PRICE_ID=price_...

# AWS S3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
AWS_S3_BUCKET=vspro-uploads

# Facturapi (CFDI México)
FACTURAPI_KEY=

# Email (Resend)
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@vspro.app

# App
APP_URL=https://app.vspro.app
API_URL=https://api.vspro.app
NODE_ENV=production
PORT=3001
```

---

## CI/CD con GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test
      - run: npm run build

  deploy-api:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Build and push Docker image
        run: |
          aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REGISTRY
          docker build -t vspro-api -f apps/api/Dockerfile .
          docker tag vspro-api:latest $ECR_REGISTRY/vspro-api:latest
          docker push $ECR_REGISTRY/vspro-api:latest

      - name: Deploy to ECS
        run: |
          aws ecs update-service \
            --cluster vspro-cluster \
            --service vspro-api \
            --force-new-deployment

      - name: Run DB migrations
        run: |
          aws ecs run-task \
            --cluster vspro-cluster \
            --task-definition vspro-migrations \
            --launch-type FARGATE

  deploy-web:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Vercel
        run: npx vercel --prod --token=${{ secrets.VERCEL_TOKEN }}
```

---

## Seguridad

### Autenticación JWT Multi-Tenant

```typescript
// Payload del JWT
interface JwtPayload {
  sub: string;          // userId
  tenantId: string;     // tenantId
  tenantSchema: string; // schema de PostgreSQL
  role: UserRole;
  iat: number;
  exp: number;
}
```

### Rate Limiting por Tenant

```typescript
// Previene que un tenant abuse y afecte a otros
ThrottlerModule.forRoot([
  {
    name: 'short',
    ttl: 1000,    // 1 segundo
    limit: 10,    // máx 10 requests/segundo por tenant
  },
  {
    name: 'medium',
    ttl: 60000,   // 1 minuto
    limit: 200,   // máx 200 requests/minuto por tenant
  }
])
```

### Encriptación de Tokens de Acceso

Los access tokens de Meta se guardan encriptados en BD:

```typescript
// Encriptar al guardar
const encrypted = await bcrypt.hash(accessToken, 10);
// No, para tokens necesitamos poder recuperarlos → AES-256
import { createCipheriv, createDecipheriv } from 'crypto';

function encrypt(text: string): string {
  const cipher = createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  return cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
}
```

---

## Monitoreo y Alertas

```typescript
// Métricas clave a monitorear en Grafana:

// Por tenant:
- orders_created_total{tenant}
- messages_processed_total{tenant, channel}
- ai_calls_total{tenant}
- payment_verifications_total{tenant, status}

// Sistema:
- api_response_time_p95
- queue_depth{queue_name}
- db_connections_active
- redis_memory_usage

// Negocio:
- mrr_total
- active_tenants_total
- trial_conversions_rate
- churn_rate_monthly
```

### Alertas Críticas

| Alerta | Condición | Acción |
|--------|-----------|--------|
| API down | uptime < 99% por 2 min | PagerDuty → equipo |
| Queue acumulada | > 1000 jobs pendientes | Escalar workers |
| Error rate alto | > 5% requests con error | Slack + Sentry |
| DB connections | > 80% del pool | Alerta inmediata |
| Tenant sin pago | 3 intentos fallidos | Email automático |
