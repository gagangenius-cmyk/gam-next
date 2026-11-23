import { QueryTypes } from 'sequelize';
import { sequelize } from '@/lib/sequelize';

// CEO-adjustable CRM settings (Admin > CRM Settings), stored as key/value rows in crm_app_settings so nothing
// below is hard-coded: office-network lock, overdue e-mail threshold, meeting reminder lead time, and the
// payment-gateway surcharge percentages. A missing row falls back to the default here.
export const APP_SETTING_DEFAULTS = {
  'security.office_network_only': '0',
  'security.office_allowed_ips': '',
  'alerts.overdue_email_enabled': '1',
  'alerts.overdue_email_hours': '2',
  'alerts.meeting_toast_minutes': '30',
  'payments.surcharge.payment_link': '2.15',
  'payments.surcharge.pos': '2.15',
  'payments.surcharge.tabby': '7',
  'payments.surcharge.tamara': '7',
} as const;

export type AppSettingKey = keyof typeof APP_SETTING_DEFAULTS;
export type AppSettings = Record<AppSettingKey, string>;

const CACHE_MS = 15_000;
let cache: { at: number; values: AppSettings } | null = null;
let tableReady: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = sequelize
      .query(`CREATE TABLE IF NOT EXISTS crm_app_settings (
        setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
        setting_value TEXT NULL,
        updated_by INT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
      .then(() => undefined)
      .catch((error) => {
        tableReady = null;
        throw error;
      });
  }
  return tableReady;
}

export async function getAppSettings(): Promise<AppSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.values;
  await ensureTable();
  const rows = await sequelize.query<{ setting_key: string; setting_value: string | null }>(
    'SELECT setting_key, setting_value FROM crm_app_settings',
    { type: QueryTypes.SELECT },
  );
  const values: AppSettings = { ...APP_SETTING_DEFAULTS };
  for (const row of rows) {
    if (row.setting_key in APP_SETTING_DEFAULTS && row.setting_value !== null) {
      values[row.setting_key as AppSettingKey] = row.setting_value;
    }
  }
  cache = { at: Date.now(), values };
  return values;
}

export async function getAppSetting(key: AppSettingKey): Promise<string> {
  return (await getAppSettings())[key];
}

export async function getAppSettingNumber(key: AppSettingKey): Promise<number> {
  const value = Number(await getAppSetting(key));
  return Number.isFinite(value) ? value : Number(APP_SETTING_DEFAULTS[key]);
}

function validate(key: AppSettingKey, raw: unknown): string {
  const value = String(raw ?? '').trim();
  switch (key) {
    case 'security.office_network_only':
    case 'alerts.overdue_email_enabled':
      return value === '1' || value === 'true' ? '1' : '0';
    case 'alerts.overdue_email_hours': {
      const hours = Number(value);
      if (!Number.isFinite(hours) || hours < 0.5 || hours > 24) throw new Error('Overdue e-mail threshold must be between 0.5 and 24 hours');
      return String(hours);
    }
    case 'alerts.meeting_toast_minutes': {
      const minutes = Number(value);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) throw new Error('Reminder lead time must be a whole number of minutes between 1 and 240');
      return String(minutes);
    }
    case 'security.office_allowed_ips': {
      const entries = value.split(/[\s,;]+/).filter(Boolean);
      for (const entry of entries) {
        if (!/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(entry) && !/^[0-9a-fA-F:]+(\/\d{1,3})?$/.test(entry)) {
          throw new Error(`"${entry}" is not a valid IP address or CIDR range`);
        }
      }
      return entries.join('\n');
    }
    default: {
      // payments.surcharge.* percentages
      const percent = Number(value);
      if (!Number.isFinite(percent) || percent < 0 || percent > 50) throw new Error('A surcharge must be a percentage between 0 and 50');
      return String(percent);
    }
  }
}

export async function updateAppSettings(updates: Partial<Record<AppSettingKey, unknown>>, updatedBy: number | null): Promise<AppSettings> {
  await ensureTable();
  const clean: Array<[AppSettingKey, string]> = [];
  for (const [key, raw] of Object.entries(updates)) {
    if (!(key in APP_SETTING_DEFAULTS)) throw new Error(`Unknown setting "${key}"`);
    clean.push([key as AppSettingKey, validate(key as AppSettingKey, raw)]);
  }
  for (const [key, value] of clean) {
    await sequelize.query(
      `INSERT INTO crm_app_settings (setting_key, setting_value, updated_by) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
      { replacements: [key, value, updatedBy] },
    );
  }
  cache = null;
  return getAppSettings();
}
