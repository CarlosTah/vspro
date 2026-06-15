import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { MessagingFactory } from '../messaging/messaging-factory.service';

export type ReminderInterval = 'days' | 'weeks' | 'months' | 'km';

export interface CreateServiceReminderDto {
  customerId: string;
  assetId?: string;
  serviceName: string;
  intervalValue: number;
  intervalUnit: ReminderInterval;
  nextDueDate?: string;
  notes?: string;
}

@Injectable()
export class ServiceRemindersService {
  private readonly logger = new Logger(ServiceRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messagingFactory: MessagingFactory,
  ) {}

  async create(dto: CreateServiceReminderDto, schemaName: string) {
    const nextDue = dto.nextDueDate ?? this.calculateNextDue(dto.intervalValue, dto.intervalUnit);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schemaName}".service_reminders
        (customer_id, asset_id, service_name, interval_value, interval_unit, next_due_date, notes, is_active)
      VALUES ($1::uuid, $2, $3, $4, $5, $6::date, $7, true)
      RETURNING id, service_name AS "serviceName", next_due_date AS "nextDueDate", interval_value AS "intervalValue", interval_unit AS "intervalUnit"
    `, dto.customerId, dto.assetId ?? null, dto.serviceName, dto.intervalValue, dto.intervalUnit, nextDue, dto.notes ?? null);
    return rows[0];
  }

  async getByCustomer(customerId: string, schemaName: string) {
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT sr.id, sr.service_name AS "serviceName", sr.interval_value AS "intervalValue",
             sr.interval_unit AS "intervalUnit", sr.next_due_date AS "nextDueDate",
             sr.last_completed_at AS "lastCompletedAt", sr.notes, sr.is_active AS "isActive",
             a.name AS "assetName"
      FROM "${schemaName}".service_reminders sr
      LEFT JOIN "${schemaName}".asset_registry a ON a.id = sr.asset_id::uuid
      WHERE sr.customer_id = $1::uuid AND sr.is_active = true
      ORDER BY sr.next_due_date ASC
    `, customerId);
  }

  async complete(reminderId: string, schemaName: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT interval_value, interval_unit FROM "${schemaName}".service_reminders WHERE id = $1::uuid
    `, reminderId);
    if (!rows[0]) return;

    const nextDue = this.calculateNextDue(rows[0].interval_value, rows[0].interval_unit);
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".service_reminders
      SET last_completed_at = NOW(), next_due_date = $1::date, updated_at = NOW()
      WHERE id = $2::uuid
    `, nextDue, reminderId);
  }

  async getDueReminders(schemaName: string) {
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT sr.id, sr.service_name, sr.next_due_date, sr.customer_id,
             c.name AS customer_name, c.channel_id, c.channel_type
      FROM "${schemaName}".service_reminders sr
      JOIN "${schemaName}".customers c ON c.id = sr.customer_id
      WHERE sr.is_active = true AND sr.next_due_date <= CURRENT_DATE + INTERVAL '3 days'
        AND (sr.last_notified_at IS NULL OR sr.last_notified_at < CURRENT_DATE - INTERVAL '1 day')
    `);
  }

  @Cron('0 9 * * *') // Daily at 9 AM
  async scanDueReminders(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { id: true, schemaName: true },
    });

    for (const tenant of tenants) {
      try {
        const due = await this.getDueReminders(tenant.schemaName);
        for (const reminder of due) {
          const daysUntil = Math.ceil((new Date(reminder.next_due_date).getTime() - Date.now()) / 86400000);
          const msg = daysUntil <= 0
            ? `⏰ *Recordatorio de servicio*\n\nHola ${reminder.customer_name}, tu servicio "${reminder.service_name}" ya está vencido. ¿Agendamos?`
            : `📅 *Próximo servicio*\n\nHola ${reminder.customer_name}, en ${daysUntil} día(s) vence tu servicio "${reminder.service_name}". ¿Te agendo?`;

          if (reminder.channel_id) {
            await this.messagingFactory.sendText(reminder.channel_id, msg, reminder.channel_type, tenant.schemaName);
          }
          await this.prisma.$executeRawUnsafe(`
            UPDATE "${tenant.schemaName}".service_reminders SET last_notified_at = NOW() WHERE id = $1::uuid
          `, reminder.id);
        }
      } catch { /* skip tenant errors */ }
    }
  }

  private calculateNextDue(value: number, unit: ReminderInterval): string {
    const d = new Date();
    switch (unit) {
      case 'days': d.setDate(d.getDate() + value); break;
      case 'weeks': d.setDate(d.getDate() + value * 7); break;
      case 'months': d.setMonth(d.getMonth() + value); break;
      case 'km': d.setMonth(d.getMonth() + 6); break; // Default 6 months for km-based
    }
    return d.toISOString().split('T')[0];
  }
}
