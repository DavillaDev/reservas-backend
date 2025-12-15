import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private resend: Resend;
  private readonly logger = new Logger(MailService.name);

  constructor() {
    if (!process.env.RESEND_API_KEY) {
      this.logger.error(
        'RESEND_API_KEY não encontrada nas variáveis de ambiente.',
      );
    }
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  async sendReservationConfirmation(reservation: any, nightclubName: string) {
    // 1. Preparação de Dados e Formatação
    const settings = reservation.nightclub.settings as any;
    const customerEmail = reservation.customerEmail;
    const token = reservation.validationToken || 'ERROR-NO-TOKEN';

    // Formatação de Moeda e Data para pt-BR
    const formattedDate = new Date(reservation.date).toLocaleDateString(
      'pt-BR',
      {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      },
    );
    const formattedAmount = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(Number(reservation.amount || 0));

    // Gerador de QR Code (API Pública de Alta Disponibilidade)
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${token}&color=000000&bgcolor=ffffff&margin=10`;

    // Configuração de Remetente
    // Nota: Em produção, você deve verificar o domínio no painel do Resend para usar 'nao-responda@suabalada.com'
    const fromAddress = 'onboarding@resend.dev';

    // Configuração de Reply-To
    let replyToAddress = settings?.email_reply_to?.trim();
    if (!replyToAddress || !replyToAddress.includes('@'))
      replyToAddress = undefined;

    try {
      this.logger.log(`📧 Preparando envio para: ${customerEmail}`);

      // 2. Construção do Template HTML (Design System: Nightclub Premium)
      const htmlTemplate = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Seu Ingresso - ${nightclubName}</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #0f172a; color: #ffffff;">
          
          <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0f172a; padding: 40px 0;">
            <tr>
              <td align="center">
                
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 500px; background-color: #1e293b; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);">
                  
                  <tr>
                    <td align="center" style="padding: 40px 40px 20px 40px; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);">
                      <h2 style="margin: 0; font-size: 14px; text-transform: uppercase; letter-spacing: 2px; color: rgba(255,255,255,0.8);">${nightclubName}</h2>
                      <h1 style="margin: 10px 0 0 0; font-size: 28px; font-weight: 800; color: #ffffff;">Reserva Confirmada!</h1>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding: 30px 40px;">
                      <p style="margin: 0 0 20px 0; font-size: 16px; color: #94a3b8; text-align: center;">
                        Olá, <strong style="color: #ffffff;">${reservation.customerName}</strong>. Tudo pronto para a sua noite.
                      </p>

                      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 16px; margin: 20px 0;">
                        <tr>
                          <td align="center" style="padding: 30px;">
                            <p style="margin: 0 0 15px 0; color: #0f172a; font-weight: bold; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Apresente na Portaria</p>
                            
                            <img src="${qrCodeUrl}" alt="QR Code de Acesso" width="200" height="200" style="display: block; border-radius: 8px;" />
                            
                            <p style="margin: 15px 0 0 0; font-family: monospace; font-size: 14px; color: #64748b; word-break: break-all;">
                              TOKEN: ${token.substring(0, 8).toUpperCase()}...
                            </p>
                          </td>
                        </tr>
                      </table>

                      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 30px;">
                        <tr>
                          <td style="padding-bottom: 15px; border-bottom: 1px solid #334155;">
                            <span style="font-size: 12px; color: #94a3b8; text-transform: uppercase;">Data</span><br>
                            <span style="font-size: 16px; color: #ffffff; font-weight: 600;">${formattedDate}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding-top: 15px; padding-bottom: 15px; border-bottom: 1px solid #334155;">
                            <span style="font-size: 12px; color: #94a3b8; text-transform: uppercase;">Espaço Reservado</span><br>
                            <span style="font-size: 16px; color: #ffffff; font-weight: 600;">${reservation.space?.name || 'Acesso Geral'}</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding-top: 15px;">
                             <span style="font-size: 12px; color: #94a3b8; text-transform: uppercase;">Total Pago</span><br>
                             <span style="font-size: 16px; color: #10b981; font-weight: 600;">${formattedAmount}</span>
                          </td>
                        </tr>
                      </table>

                    </td>
                  </tr>

                  <tr>
                    <td align="center" style="background-color: #0f172a; padding: 20px; border-top: 1px dashed #334155;">
                      <p style="margin: 0; font-size: 12px; color: #64748b;">
                        Problemas com o acesso? Procure a gerência.
                      </p>
                    </td>
                  </tr>

                </table>
                
                <p style="margin-top: 30px; font-size: 11px; color: #475569;">
                  Enviado via Nightclub SaaS System • ${new Date().getFullYear()}
                </p>

              </td>
            </tr>
          </table>
        </body>
        </html>
      `;

      // 3. Envio via Resend
      const data = await this.resend.emails.send({
        from: fromAddress,
        to: [customerEmail],
        // 🚨 CORREÇÃO AQUI: 'replyTo' (CamelCase) em vez de 'reply_to'
        replyTo: replyToAddress,
        subject: `🎫 Seu Ingresso: ${nightclubName}`,
        html: htmlTemplate,
      });

      if (data.error) {
        this.logger.error('❌ Falha ao enviar email Resend:', data.error);
        return false;
      }

      this.logger.log(`✅ Email enviado com sucesso! ID: ${data.data?.id}`);
      this.logger.debug(`🔑 Token enviado para o cliente: ${token}`);

      return true;
    } catch (error) {
      this.logger.error('❌ Exceção crítica no serviço de e-mail:', error);
      return false;
    }
  }
}
