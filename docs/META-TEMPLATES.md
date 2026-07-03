# Templates de WhatsApp para VSPRO

## ¿Por qué necesitamos templates?

WhatsApp Business API tiene una regla de ventana de 24 horas:
- **Dentro de 24h** del último mensaje del cliente → puedes enviar texto libre
- **Fuera de 24h** → SOLO puedes enviar **Message Templates** pre-aprobados por Meta

VSPRO ahora tiene fallback automático: si el texto libre falla por ventana expirada, automáticamente intenta enviar un template.

## Templates requeridos

Crear en: Meta Business Manager → WhatsApp → Message Templates

---

### 1. `vspro_notification` (UTILITY)
**Categoría:** Utility
**Idioma:** Español (México) — es_MX
**Body:**
```
{{1}}
```
**Descripción:** Template genérico para cualquier notificación del sistema. La variable {{1}} contiene el mensaje completo.

---

### 2. `order_payment_confirmed` (UTILITY)
**Categoría:** Utility
**Idioma:** es_MX
**Body:**
```
✅ Pago confirmado para tu pedido *{{1}}*. Ya está en preparación. Te avisamos cuando esté listo. 🙌
```

---

### 3. `order_ready` (UTILITY)
**Categoría:** Utility
**Idioma:** es_MX
**Body:**
```
🎉 ¡Tu pedido *{{1}}* está listo! {{2}}
```
Variables: {{1}}=número de pedido, {{2}}="Pasa a recoger" o "Tu repartidor va en camino"

---

### 4. `order_shipped` (UTILITY)
**Categoría:** Utility
**Idioma:** es_MX
**Body:**
```
🛵 Tu pedido *{{1}}* va en camino. Tu repartidor {{2}} está de camino. Contacto: {{3}}
```

---

### 5. `driver_new_delivery` (UTILITY)
**Categoría:** Utility
**Idioma:** es_MX
**Body:**
```
📦 Nuevo pedido para entrega:
Pedido: *{{1}}*
Cliente: {{2}}
Dirección: {{3}}
Total: ${{4}}

¿Puedes recogerlo? Responde SI o NO
```

---

### 6. `order_survey` (MARKETING)
**Categoría:** Marketing
**Idioma:** es_MX
**Body:**
```
⭐ ¡Hola {{1}}! ¿Cómo estuvo tu pedido *{{2}}*?

Responde con un número del 1 al 5:
1 ⭐ Muy malo
2 ⭐⭐ Malo
3 ⭐⭐⭐ Regular
4 ⭐⭐⭐⭐ Bueno
5 ⭐⭐⭐⭐⭐ Excelente
```

---

### 7. `customer_reengagement` (MARKETING)
**Categoría:** Marketing
**Idioma:** es_MX
**Body:**
```
¡Hola {{1}}! 👋 Te extrañamos. ¿Qué se te antoja hoy? Escríbenos para hacer tu pedido 🙌
```

---

## Cómo crear templates

1. Ir a https://business.facebook.com → WhatsApp → Message Templates
2. Crear cada template con la categoría indicada
3. Esperar aprobación (generalmente 1-24 horas para Utility, más para Marketing)
4. Una vez aprobados, VSPRO los usa automáticamente

## Template principal recomendado

El template **`vspro_notification`** es el más importante porque es genérico — permite enviar CUALQUIER notificación del sistema como variable. Si solo creas uno, que sea este.

## Comportamiento automático en VSPRO

```
1. Intenta enviar texto libre (si la ventana de 24h está abierta, llega)
2. Si falla con error 131026 (ventana expirada):
   - Intenta template 'vspro_notification' con el texto como {{1}}
   - Si no existe, intenta 'vspro_alert'
   - Si no existe, intenta 'hello_world' (template default de Meta)
3. Si todo falla, loguea el error
```

No requiere configuración adicional — el fallback es automático.
