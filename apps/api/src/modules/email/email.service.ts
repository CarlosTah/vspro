import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(this.config.get('RESEND_API_KEY'));
    this.from = this.config.get('EMAIL_FROM', 'noreply@vspro.app');
  }

  /**
   * Send a password reset email with a link containing the reset token.
   */
  async sendPasswordResetEmail(params: {
    to: string;
    userName: string;
    resetUrl: string;
    businessName: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const { to, userName, resetUrl, businessName } = params;

      const { error } = await this.resend.emails.send({
        from: this.from,
        to,
        subject: `Recupera tu contraseña — ${businessName}`,
        html: this.buildResetEmailHtml({ userName, resetUrl, businessName }),
      });

      if (error) {
        this.logger.warn(`Failed to send reset email to ${to}: ${error.message}`);
        return { success: false, error: error.message };
      }

      this.logger.log(`Password reset email sent to ${to} for ${businessName}`);
      return { success: true };
    } catch (err: any) {
      this.logger.error(`Email send error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  private buildResetEmailHtml(params: {
    userName: string;
    resetUrl: string;
    businessName: string;
  }): string {
    const { userName, resetUrl, businessName } = params;

    return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#111827;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#1f2937;border-radius:16px;border:1px solid #374151;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 32px 0;text-align:center;">
              <h1 style="margin:0;font-size:24px;font-weight:700;color:#ffffff;">VSPRO</h1>
              <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">Pedidos omnicanal para PYMEs</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#f3f4f6;">Recupera tu contraseña</h2>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#d1d5db;">
                Hola ${userName},
              </p>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#d1d5db;">
                Recibimos una solicitud para restablecer la contraseña de tu cuenta en <strong style="color:#f3f4f6;">${businessName}</strong>. Haz clic en el botón de abajo para crear una nueva contraseña.
              </p>
              <!-- Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;background-color:#2563eb;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
                      Restablecer contraseña
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#6b7280;">
                Este enlace expira en 1 hora. Si no solicitaste este cambio, ignora este correo.
              </p>
              <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#6b7280;">
                Si el botón no funciona, copia y pega este enlace en tu navegador:
              </p>
              <p style="margin:4px 0 0;font-size:11px;line-height:1.5;color:#4b5563;word-break:break-all;">
                ${resetUrl}
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:0 32px 32px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#4b5563;">
                VSPRO &copy; ${new Date().getFullYear()} — Todos los derechos reservados
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
  }
}
