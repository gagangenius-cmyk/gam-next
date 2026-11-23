import { QueryTypes } from 'sequelize';
import { sequelize } from '@/lib/sequelize';

// Who signed in, from which device, and when (Admin > Login Activity). Recording is best-effort: a logging failure
// must never block a sign-in.
export type LoginEvent = 'login' | 'login_failed' | 'blocked_network' | 'logout';

export interface DeviceInfo {
  deviceType: 'Desktop' | 'Mobile' | 'Tablet' | 'Unknown';
  browser: string;
  os: string;
}

export function parseUserAgent(userAgent: string | null | undefined): DeviceInfo {
  const ua = String(userAgent || '');
  if (!ua) return { deviceType: 'Unknown', browser: 'Unknown', os: 'Unknown' };

  const os = /Windows NT 10|Windows NT 11/.test(ua) ? 'Windows'
    : /Windows/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'Unknown';

  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Unknown';

  const deviceType = /iPad|Tablet/.test(ua) ? 'Tablet'
    : /Mobi|Android|iPhone|iPod/.test(ua) ? 'Mobile'
    : 'Desktop';

  return { deviceType, browser, os };
}

let tableReady: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = sequelize
      .query(`CREATE TABLE IF NOT EXISTS crm_login_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NULL,
        username VARCHAR(120) NULL,
        event VARCHAR(30) NOT NULL,
        success TINYINT(1) NOT NULL DEFAULT 1,
        ip_address VARCHAR(64) NULL,
        user_agent VARCHAR(500) NULL,
        device_type VARCHAR(20) NULL,
        browser VARCHAR(40) NULL,
        os VARCHAR(40) NULL,
        reason VARCHAR(255) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_login_logs_employee (employee_id),
        INDEX idx_login_logs_created (created_at),
        INDEX idx_login_logs_event (event)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
      .then(() => undefined)
      .catch((error) => {
        tableReady = null;
        throw error;
      });
  }
  return tableReady;
}

export async function recordLoginEvent(input: {
  employeeId?: number | null;
  username?: string | null;
  event: LoginEvent;
  success: boolean;
  ip: string;
  userAgent?: string | null;
  reason?: string | null;
}): Promise<void> {
  try {
    await ensureTable();
    const device = parseUserAgent(input.userAgent);
    await sequelize.query(
      `INSERT INTO crm_login_logs (employee_id, username, event, success, ip_address, user_agent, device_type, browser, os, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      {
        replacements: [
          input.employeeId ?? null,
          input.username ? String(input.username).slice(0, 120) : null,
          input.event,
          input.success ? 1 : 0,
          input.ip ? String(input.ip).slice(0, 64) : null,
          input.userAgent ? String(input.userAgent).slice(0, 500) : null,
          device.deviceType,
          device.browser,
          device.os,
          input.reason ? String(input.reason).slice(0, 255) : null,
        ],
      },
    );
  } catch (error) {
    console.error('Failed to record login activity:', error);
  }
}

export interface LoginLogRow {
  id: number;
  employee_id: number | null;
  username: string | null;
  employee_name: string | null;
  role_name: string | null;
  event: string;
  success: number;
  ip_address: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  reason: string | null;
  created_at: string;
}

export async function listLoginLogs(filters: {
  from?: string;
  to?: string;
  employeeId?: number;
  event?: string;
  search?: string;
  limit: number;
  offset: number;
}): Promise<{ rows: LoginLogRow[]; total: number }> {
  await ensureTable();
  const where: string[] = [];
  const replacements: unknown[] = [];
  if (filters.from) { where.push('l.created_at >= ?'); replacements.push(`${filters.from} 00:00:00`); }
  if (filters.to) { where.push('l.created_at <= ?'); replacements.push(`${filters.to} 23:59:59`); }
  if (filters.employeeId) { where.push('l.employee_id = ?'); replacements.push(filters.employeeId); }
  if (filters.event) { where.push('l.event = ?'); replacements.push(filters.event); }
  if (filters.search) {
    where.push('(l.username LIKE ? OR e.name LIKE ? OR l.ip_address LIKE ?)');
    const like = `%${filters.search}%`;
    replacements.push(like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [countRow] = await sequelize.query<{ total: number }>(
    `SELECT COUNT(*) AS total FROM crm_login_logs l LEFT JOIN crm_employee e ON e.id = l.employee_id ${whereSql}`,
    { replacements, type: QueryTypes.SELECT },
  );
  const rows = await sequelize.query<LoginLogRow>(
    `SELECT l.id, l.employee_id, l.username, e.name AS employee_name, r.name AS role_name, l.event, l.success,
            l.ip_address, l.device_type, l.browser, l.os, l.reason, l.created_at
       FROM crm_login_logs l
       LEFT JOIN crm_employee e ON e.id = l.employee_id
       LEFT JOIN crm_role r ON r.id = e.role
       ${whereSql}
      ORDER BY l.id DESC
      LIMIT ? OFFSET ?`,
    { replacements: [...replacements, filters.limit, filters.offset], type: QueryTypes.SELECT },
  );
  return { rows, total: Number(countRow?.total || 0) };
}
