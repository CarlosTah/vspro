import { Module } from '@nestjs/common';
import { MenuVisionService } from './menu-vision.service';
import { MenuVisionController } from './menu-vision.controller';

/**
 * Menu Vision Module — OCR de menú con GPT-4o Vision.
 *
 * Flujo:
 * 1. PYME envía foto de su menú (pizarrón, lona, hoja, carta)
 * 2. GPT-4o Vision extrae: nombre, precio, categoría, descripción
 * 3. Se muestra al dueño para revisar/editar
 * 4. Al aprobar, se dan de alta los productos + inventario
 *
 * Funciona tanto via:
 * - REST API (dashboard: upload image → parse → approve)
 * - AI Agent (WhatsApp: dueño manda foto → IA muestra parsed → aprueba)
 */
@Module({
  controllers: [MenuVisionController],
  providers: [MenuVisionService],
  exports: [MenuVisionService],
})
export class MenuVisionModule {}
