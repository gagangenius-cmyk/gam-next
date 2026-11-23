import { QueryTypes } from 'sequelize';
import { sequelize } from '@/lib/sequelize';

// A red flag marks a lead / client that needs management attention (a difficult client, a suspected fake document, a
// payment risk...). It records who raised it, why, and when, and is cleared by a manager.
let columnsReady: Promise<void> | null = null;
export function ensureRedFlagColumns(): Promise<void> {
  if (!columnsReady) {
    columnsReady = (async () => {
      for (const ddl of [
        'ALTER TABLE crm_forum_leads ADD COLUMN red_flag TINYINT(1) NOT NULL DEFAULT 0',
        'ALTER TABLE crm_forum_leads ADD COLUMN red_flag_reason VARCHAR(500) NULL',
        'ALTER TABLE crm_forum_leads ADD COLUMN red_flag_by INT NULL',
        'ALTER TABLE crm_forum_leads ADD COLUMN red_flag_at DATETIME NULL',
      ]) {
        try {
          await sequelize.query(ddl);
        } catch (error) {
          if ((error as { original?: { code?: string } })?.original?.code !== 'ER_DUP_FIELDNAME') {
            columnsReady = null;
            throw error;
          }
        }
      }
    })();
  }
  return columnsReady;
}

export interface RedFlagState {
  flagged: boolean;
  reason: string | null;
  byName: string | null;
  at: string | null;
}

export async function getRedFlag(leadId: number): Promise<RedFlagState> {
  await ensureRedFlagColumns();
  const [row] = await sequelize.query<{ red_flag: number; red_flag_reason: string | null; red_flag_at: string | null; by_name: string | null }>(
    `SELECT l.red_flag, l.red_flag_reason, l.red_flag_at, e.name AS by_name
       FROM crm_forum_leads l LEFT JOIN crm_employee e ON e.id = l.red_flag_by WHERE l.id = ? LIMIT 1`,
    { replacements: [leadId], type: QueryTypes.SELECT },
  );
  return { flagged: Boolean(row?.red_flag), reason: row?.red_flag_reason ?? null, byName: row?.by_name ?? null, at: row?.red_flag_at ?? null };
}

export async function setRedFlag(leadId: number, flagged: boolean, reason: string | null, employeeId: number): Promise<void> {
  await ensureRedFlagColumns();
  if (flagged) {
    await sequelize.query(
      'UPDATE crm_forum_leads SET red_flag = 1, red_flag_reason = ?, red_flag_by = ?, red_flag_at = NOW() WHERE id = ?',
      { replacements: [reason ? reason.slice(0, 500) : null, employeeId, leadId], type: QueryTypes.UPDATE },
    );
  } else {
    await sequelize.query(
      'UPDATE crm_forum_leads SET red_flag = 0, red_flag_reason = NULL, red_flag_by = NULL, red_flag_at = NULL WHERE id = ?',
      { replacements: [leadId], type: QueryTypes.UPDATE },
    );
  }
}
