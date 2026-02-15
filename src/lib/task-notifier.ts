/**
 * Task Notification Service
 * Sends phone call and email notifications when tasks complete or fail.
 */

import type { Task, TaskNotifySettings } from '@/lib/types';
import { getOpenClawClient } from '@/lib/openclaw/client';

/**
 * Send notifications for a task status change.
 * Called from the task-completion-watcher when a task moves to done/testing or failed.
 */
export async function sendTaskNotification(
  task: Task,
  event: 'completed' | 'failed',
  summary?: string
): Promise<void> {
  const settings = parseNotifySettings(task.notify_settings);
  if (!settings) return;

  const shouldNotify =
    (event === 'completed' && settings.on_complete !== false) ||
    (event === 'failed' && settings.on_failure !== false);

  if (!shouldNotify) return;

  const statusLabel = event === 'completed' ? 'completed' : 'failed';
  const message = summary
    ? `Task "${task.title}" has ${statusLabel}. ${summary}`
    : `Task "${task.title}" has ${statusLabel}.`;

  // Phone notification
  if (settings.phone) {
    notifyByPhone(settings.phone, message, task).catch((err) => {
      console.error('[TaskNotifier] Phone notification failed:', err instanceof Error ? err.message : err);
    });
  }

  // Email notification
  if (settings.email) {
    notifyByEmail(settings.email, task, statusLabel, summary).catch((err) => {
      console.error('[TaskNotifier] Email notification failed:', err instanceof Error ? err.message : err);
    });
  }
}

function parseNotifySettings(raw: any): TaskNotifySettings | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw as TaskNotifySettings;
}

async function notifyByPhone(phone: string, message: string, task: Task): Promise<void> {
  console.log(`[TaskNotifier] Calling ${phone} for task "${task.title}"...`);

  try {
    const client = getOpenClawClient();
    if (!client.isConnected()) {
      await client.connect();
    }

    await client.initiateCall({
      message,
      to: phone,
      mode: 'notify',
    });

    console.log(`[TaskNotifier] Phone notification sent to ${phone}`);
  } catch (err) {
    console.error('[TaskNotifier] Phone call failed:', err instanceof Error ? err.message : err);
  }
}

async function notifyByEmail(
  email: string,
  task: Task,
  status: string,
  summary?: string
): Promise<void> {
  console.log(`[TaskNotifier] Emailing ${email} for task "${task.title}"...`);

  // Read SMTP config from environment
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || smtpUser || 'mission-control@localhost';

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.warn('[TaskNotifier] SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env.local');
    return;
  }

  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    const statusEmoji = status === 'completed' ? '✅' : '❌';
    const subject = `${statusEmoji} Task ${status}: ${task.title}`;

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: ${status === 'completed' ? '#22c55e' : '#ef4444'};">
          ${statusEmoji} Task ${status.charAt(0).toUpperCase() + status.slice(1)}
        </h2>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Task</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${task.title}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Priority</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${task.priority}</td>
          </tr>
          ${summary ? `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Summary</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${summary}</td>
          </tr>` : ''}
        </table>
        <p style="color: #888; font-size: 12px;">Sent by Mission Control</p>
      </div>
    `;

    await transporter.sendMail({
      from: smtpFrom,
      to: email,
      subject,
      html,
    });

    console.log(`[TaskNotifier] Email sent to ${email}`);
  } catch (err) {
    console.error('[TaskNotifier] Email send failed:', err instanceof Error ? err.message : err);
  }
}
