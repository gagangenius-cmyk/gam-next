import { QueryTypes, type Transaction } from 'sequelize';
import { sequelize } from '@/lib/sequelize';

// A lead a counselor marks "Junk" is closed: it leaves the working lists, its open follow-ups are cancelled, and it
// is kept on the Junk Leads page (who closed it and when). Moving it to any other status re-opens it.
export const isJunkStatus = (status: unknown) => String(status ?? '').trim().toLowerCase() === 'junk';

let columnsReady: Promise<void> | null = null;
export function ensureJunkColumns(): Promise<void> {
  if (!columnsReady) {
    columnsReady = (async () => {
      for (const ddl of [
        'ALTER TABLE crm_forum_leads ADD COLUMN closed_at DATETIME NULL',
        'ALTER TABLE crm_forum_leads ADD COLUMN closed_by INT NULL',
        'ALTER TABLE crm_forum_leads ADD COLUMN closed_reason VARCHAR(255) NULL',
      ]) {
        try { await sequelize.query(ddl); } catch (error) {
          if ((error as { original?: { code?: string } })?.original?.code !== 'ER_DUP_FIELDNAME') { columnsReady = null; throw error; }
        }
      }
    })();
  }
  return columnsReady;
}

export async function closeJunkLead(leadId: number, employeeId: number, reason: string | null): Promise<void> {
  await ensureJunkColumns();
  await sequelize.query(
    `UPDATE crm_forum_leads SET closed_at = NOW(), closed_by = ?, closed_reason = ? WHERE id = ?`,
    { replacements: [employeeId, reason ? reason.slice(0, 255) : null, leadId], type: QueryTypes.UPDATE },
  );
  await sequelize.query(
    `UPDATE crm_follow_up_reminders SET status = 'cancelled', completion_notes = COALESCE(completion_notes, 'Lead closed as junk'), updated_at = NOW()
      WHERE lead_id = ? AND status IN ('pending', 'rescheduled')`,
    { replacements: [leadId], type: QueryTypes.UPDATE },
  );
}

export async function reopenLead(leadId: number): Promise<void> {
  await ensureJunkColumns();
  await sequelize.query('UPDATE crm_forum_leads SET closed_at = NULL, closed_by = NULL, closed_reason = NULL WHERE id = ?', { replacements: [leadId], type: QueryTypes.UPDATE });
}

export type { Transaction };
