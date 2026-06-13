# Semana 1 — El Loop que Vende

> **Objetivo:** Un cliente de la PYME escribe por WhatsApp → la IA responde con catálogo visual → el cliente arma su pedido → paga → recibe confirmación. Sin intervención humana.

---

## Flujo Completo

```
Cliente WhatsApp                    VSPRO                           PYME (dueño)
     │                                │                                │
     │── "Hola, qué tienen?" ────────▶│                                │
     │                                │── Router: sales agent          │
     │                                │── Carga catálogo + memoria     │
     │◀── "¡Hola! Te muestro..." ────│                                │
     │◀── [Imagen: Vestido $389] ─────│                                │
     │◀── [Imagen: Chamarra $599] ────│                                │
     │                                │                                │
     │── "Quiero el vestido talla 6" ▶│                                │
     │                                │── Agrega al carrito            │
     │◀── "Perfecto! Tu carrito:" ────│                                │
     │◀── "1x Vestido $389. ¿Algo más?"│                               │
     │                                │                                │
     │── "No, es todo" ──────────────▶│                                │
     │                                │── Crea pedido ORD-2026-00011   │
     │◀── "Total: $389. Datos para" ──│                                │
     │◀── "transferencia: CLABE..." ──│                                │
     │                                │                                │
     │── [Foto comprobante] ─────────▶│                                │
     │                                │── OCR: $389 ✓ match            │
     │                                │── Auto-verify payment          │
     │◀── "¡Pago confirmado! ✅" ──────│                                │
     │◀── "Tu pedido está en proceso" │                                │
     │                                │── Notifica al dueño ──────────▶│
     │                                │                    "Nuevo pedido $389"
```

---

## 4 Entregables

### 1. WhatsApp Real End-to-End

**Componentes:**
- `WebhooksController` — Recibe mensajes de Meta (ya existe, falta HMAC real)
- `WhatsAppChannel` — Envía respuestas (ya existe, falta conectar con token real)
- `MessagingFactory` — Orquesta el flujo (ya existe)
- **Nuevo:** `WhatsAppMediaService` — Envío de imágenes/documentos

**Configuración requerida:**
- Meta Business Account + WhatsApp Business API
- Phone Number ID + Access Token (permanente)
- Webhook URL pública (ngrok/tunnel)
- HMAC verification con META_APP_SECRET

### 2. Catálogo Visual por WhatsApp

**Componentes:**
- **Nuevo:** Tool `show_catalog` — La IA envía imágenes de productos
- **Nuevo:** Tool `show_product_detail` — Detalle con precio + stock + imagen
- Usa WhatsApp Interactive Messages (buttons + lists)

**Formato de mensajes:**
- Image message con caption (nombre + precio)
- Interactive list (hasta 10 productos)
- Reply buttons ("Agregar al carrito" / "Ver más")

### 3. Carrito Conversacional

**Componentes:**
- **Nuevo:** `CartService` — CRUD del carrito en `conversations.context` JSONB
- **Nuevo:** Tool `add_to_cart` — Agrega item
- **Nuevo:** Tool `show_cart` — Muestra resumen
- **Nuevo:** Tool `confirm_order` — Convierte carrito en pedido

**Estado en JSONB:**
```json
{
  "cart": {
    "items": [{"productId": "...", "name": "Vestido", "quantity": 1, "price": 389}],
    "total": 389,
    "updatedAt": "2026-05-23T..."
  }
}
```

### 4. Flujo de Pago End-to-End

**Componentes:**
- `PaymentVerificationService` (ya existe — OCR con GPT-4o Vision)
- **Nuevo:** Detección automática de imagen de comprobante en el webhook
- **Nuevo:** Mensaje con datos bancarios del tenant (CLABE, banco, beneficiario)
- **Nuevo:** Confirmación automática + notificación al dueño

**Configuración por tenant:**
```json
{
  "payment_info": {
    "bank": "BBVA",
    "clabe": "012180001234567890",
    "beneficiary": "Vikids SA de CV",
    "reference_prefix": "VK"
  }
}
```

---

## Dependencias Externas

| Servicio | Necesario para | Cómo obtener |
|----------|---------------|--------------|
| Meta Business Account | WhatsApp API | business.facebook.com (gratis) |
| WhatsApp Business API | Enviar/recibir mensajes | Meta Developer Portal |
| ngrok o Cloudflare Tunnel | Webhook público en dev | ngrok.com (gratis) |
| OpenAI API key | IA + OCR | Ya configurada ✅ |

---

## Plan de Implementación

| Día | Entregable | Archivos |
|-----|-----------|----------|
| 1 | WhatsApp webhook real + HMAC + envío de texto | webhooks.controller, whatsapp.channel |
| 2 | Envío de imágenes + Interactive Messages | whatsapp-media.service, catalog tools |
| 3 | Carrito conversacional (JSONB) + tools | cart.service, cart tools en SalesAgent |
| 4 | Flujo de pago: detección imagen → OCR → confirm | payment flow, tenant payment_info |
| 5 | Testing E2E con WhatsApp real | dry-run con número real |
