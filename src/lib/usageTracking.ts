import { QueryTypes } from 'sequelize';
import { sequelize } from '@/lib/sequelize';
import { dubaiToday } from '@/lib/dubaiDate';

// Time spent in the CRM: the browser sends a heartbeat every minute while the tab is visible and the person is
// active; each heartbeat adds the elapsed seconds (capped) to that employee's total for the Dubai day.
export const HEARTBEAT_MAX_SECONDS = 90;

let tableReady: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = sequelize
      .query(`CREATE TABLE IF NOT EXISTS crm_usage_daily (
        employee_id INT NOT NULL,
        usage_date DATE NOT NULL,
        seconds INT NOT NULL DEFAULT 0,
        last_seen DATETIME NULL,
        PRIMARY KEY (employee_id, usage_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
      .then(() => undefined)
      .catch((error) => { tableReady = null; throw error; });
  }
  return tableReady;
}

export async function addUsageSeconds(employeeId: number, seconds: number): Promise<void> {
  await ensureTable();
  const add = Math.max(0, Math.min(HEARTBEAT_MAX_SECONDS, Math.round(seconds)));
  await sequelize.query(
    `INSERT INTO crm_usage_daily (employee_id, usage_date, seconds, last_seen) VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE seconds = seconds + VALUES(seconds), last_seen = NOW()`,
    { replacements: [employeeId, dubaiToday(), add] },
  );
}

export interface UsageSummary {
  todaySeconds: number;
  weekSeconds: number;
  monthSeconds: number;
  daily: Array<{ date: string; seconds: number }>;
}

export async function getUsageSummary(employeeId: number): Promise<UsageSummary> {
  await ensureTable();
  const rows = await sequelize.query<{ d: string; seconds: number }>(
    `SELECT DATE_FORMAT(usage_date, '%Y-%m-%d') AS d, seconds FROM crm_usage_daily
      WHERE employee_id = ? AND usage_date >= ? ORDER BY usage_date ASC`,
    { replacements: [employeeId, dubaiToday(-29)], type: QueryTypes.SELECT },
  );
  const today = dubaiToday();
  const weekStart = dubaiToday(-6);
  const monthStart = dubaiToday().slice(0, 8) + '01';
  let todaySeconds = 0, weekSeconds = 0, monthSeconds = 0;
  for (const r of rows) {
    const s = Number(r.seconds) || 0;
    if (r.d === today) todaySeconds += s;
    if (r.d >= weekStart) weekSeconds += s;
    if (r.d >= monthStart) monthSeconds += s;
  }
  return { todaySeconds, weekSeconds, monthSeconds, daily: rows.slice(-14).map((r) => ({ date: r.d, seconds: Number(r.seconds) || 0 })) };
}
