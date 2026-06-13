import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

/**
 * WebSocket Gateway con aislamiento por tenant.
 * Cada tenant tiene su propia "room" — los eventos de un tenant
 * nunca llegan a otro.
 *
 * Autenticación: el cliente envía el JWT en el handshake.
 * Room: se usa el tenantId como nombre de room.
 */
@WebSocketGateway({
  cors: {
    origin: '*', // En producción: restringir a APP_URL
  },
  namespace: '/events',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  // ─── Conexión ─────────────────────────────────────────────────

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ??
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Cliente sin token — desconectando ${client.id}`);
        client.disconnect();
        return;
      }

      // Verificar JWT
      const payload = this.jwtService.verify(token);
      const tenantId = payload.tenantId;
      const userId = payload.sub;

      // Guardar metadata en el socket
      (client as any).tenantId = tenantId;
      (client as any).userId = userId;
      (client as any).role = payload.role;

      // Unir a la room del tenant (aislamiento)
      client.join(`tenant:${tenantId}`);

      // Room personal del usuario (para notificaciones directas)
      client.join(`user:${userId}`);

      this.logger.debug(
        `Cliente conectado: ${client.id} → tenant:${tenantId} user:${userId}`,
      );
    } catch (err) {
      this.logger.warn(`Token inválido — desconectando ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Cliente desconectado: ${client.id}`);
  }

  // ─── Eventos del cliente ──────────────────────────────────────

  @SubscribeMessage('ping')
  handlePing(client: Socket): string {
    return 'pong';
  }

  // ─── Métodos para emitir eventos desde otros servicios ────────

  /**
   * Emite un evento a todos los usuarios de un tenant.
   * Uso: this.eventsGateway.emitToTenant(tenantId, 'order:updated', data)
   */
  emitToTenant(tenantId: string, event: string, data: any) {
    this.server.to(`tenant:${tenantId}`).emit(event, data);
  }

  /**
   * Emite un evento a un usuario específico.
   */
  emitToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  /**
   * Emite una notificación genérica al tenant.
   */
  notifyTenant(tenantId: string, notification: {
    type: string;
    title: string;
    message: string;
    data?: any;
  }) {
    this.server.to(`tenant:${tenantId}`).emit('notification', {
      ...notification,
      timestamp: new Date().toISOString(),
    });
  }
}
