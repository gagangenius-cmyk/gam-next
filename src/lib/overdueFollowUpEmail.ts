import { QueryTypes } from 'sequelize';
import { sequelize } from '@/lib/sequelize';
import { sendEmail } from '@/lib/mailer';
import { escapeHtml } from '@/lib/escapeHtml';
import { getAppSettings } from '@/lib/appSettings';

let columnReady: Promise<void> | null = null;
function ensureColumn(): Promise<void> {
  if (!columnReady) {
    columnReady = sequelize
      .query('ALTER TABLE crm_follow_up_reminders ADD COLUMN overdue_email_sent_at DATETIME NULL')
      .then(() => undefined)
      .catch((error) => {
        if ((error as { original?: { code?: string } })?.original?.code === 'ER_DUP_FIELDNAME') return;
        columnReady = null;
        throw error;
      });
  }
  return columnReady;
}

interface OverdueRow {
  id: number;
  lead_id: number;
  reminder_date: string;
  message: string | null;
  lead_name: string | null;
  counselor_name: string | null;
  counselor_email: string | null;
  manager_email: string | null;
}

// E-mails each follow-up that has stayed open past the CEO-set threshold (Settings > CRM Controls), once per follow-up.
// The recipient is the counselor, copied to the branch manager(s) of the lead's branch.
export async function runOverdueFollowUpEmails(): Promise<{ checked: number; sent: number; skipped?: string }> {
  const settings = await getAppSettings();
  if (settings['alerts.overdue_email_enabled'] !== '1') return { checked: 0, sent: 0, skipped: 'disabled_in_settings' };
  const hours = Number(settings['alerts.overdue_email_hours']) || 2;
  await ensureColumn();

  const rows = await sequelize.query<OverdueRow>(
    `SELECT r.id, r.lead_id, r.reminder_date, r.message,
            TRIM(CONCAT(COALESCE(l.fname, ''), ' ', COALESCE(l.lname, ''))) AS lead_name,
            e.name AS counselor_name, COALESCE(NULLIF(e.cemail, ''), e.email) AS counselor_email,
            (SELECT GROUP_CONCAT(COALESCE(NULLIF(m.cemail, ''), m.email) SEPARATOR ',')
               FROM crm_employee m JOIN crm_role mr ON mr.id = m.role
              WHERE m.status = 1 AND m.branch = e.branch AND LOWER(mr.name) = 'branch manager') AS manager_email
       FROM crm_follow_up_reminders r
       JOIN crm_employee e ON e.id = r.user_id
       LEFT JOIN crm_forum_leads l ON l.id = r.lead_id
      WHERE r.status IN ('pending', 'rescheduled')
        AND r.overdue_email_sent_at IS NULL
        AND r.reminder_date <= DATE_SUB(NOW(), INTERVAL :minutes MINUTE)
      ORDER BY r.reminder_date ASC
      LIMIT 200`,
    { replacements: { minutes: Math.round(hours * 60) }, type: QueryTypes.SELECT },
  );

  let sent = 0;
  for (const row of rows) {
    const recipients = [row.counselor_email, ...(row.manager_email ? row.manager_email.split(',') : [])]
      .map((v) => String(v || '').trim()).filter((v, i, a) => v && a.indexOf(v) === i);
    if (recipients.length === 0) continue;
    try {
      for (const to of recipients) {
      await sendEmail({
        to,
        subject: `Overdue follow-up: ${row.lead_name || 'Lead #' + row.lead_id}`,
        html: `<p>The follow-up for <strong>${escapeHtml(row.lead_name || `Lead #${row.lead_id}`)}</strong> assigned to ${escapeHtml(row.counselor_name || 'the counselor')} was due on ${escapeHtml(new Date(row.reminder_date).toLocaleString())} and is still open after ${hours} hour(s).</p><p>${escapeHtml(row.message || '')}</p><p>Please update it in the CRM with a remark.</p>`,
        text: `Follow-up for ${row.lead_name || 'Lead #' + row.lead_id} (${row.counselor_name || 'counselor'}) due ${row.reminder_date} is still open after ${hours} hour(s). Please update it in the CRM.`,
      });
      }
      await sequelize.query('UPDATE crm_follow_up_reminders SET overdue_email_sent_at = NOW() WHERE id = ?', { replacements: [row.id] });
      sent += 1;
    } catch (error) {
      console.error(`Overdue follow-up e-mail failed for reminder ${row.id}:`, error);
    }
  }
  return { checked: rows.length, sent };
}
