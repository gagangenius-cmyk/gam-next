import { NextRequest, NextResponse } from 'next/server';
import { QueryTypes } from 'sequelize';
import { sequelize } from '@/lib/sequelize';
import { requireAuth, isAuthError } from '@/lib/apiAuth';
import { getAppSettingNumber } from '@/lib/appSettings';

// The signed-in employee's own follow-ups and appointments starting within the CEO-set lead time
// (Settings > CRM Controls), for the persistent reminder toast.
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (isAuthError(auth)) return auth;
  if (!auth.id) return NextResponse.json({ items: [], minutes: 0 });

  const minutes = await getAppSettingNumber('alerts.meeting_toast_minutes');

  const followUps = await sequelize.query<{ id: number; lead_id: number; at: string; message: string | null; lead_name: string | null }>(
    `SELECT r.id, r.lead_id, r.reminder_date AS at, r.message, TRIM(CONCAT(COALESCE(l.fname, ''), ' ', COALESCE(l.lname, ''))) AS lead_name
       FROM crm_follow_up_reminders r LEFT JOIN crm_forum_leads l ON l.id = r.lead_id
      WHERE r.user_id = :userId AND r.status IN ('pending', 'rescheduled')
        AND r.reminder_date >= NOW() AND r.reminder_date <= DATE_ADD(NOW(), INTERVAL :minutes MINUTE)
      ORDER BY r.reminder_date ASC LIMIT 20`,
    { replacements: { userId: auth.id, minutes }, type: QueryTypes.SELECT },
  );

  const appointments = await sequelize.query<{ id: number; leadid: number; at: string; lead_name: string | null }>(
    `SELECT a.id, a.leadid, STR_TO_DATE(CONCAT(a.date, ' ', a.appointtime), '%Y-%m-%d %H:%i:%s') AS at,
            TRIM(CONCAT(COALESCE(l.fname, ''), ' ', COALESCE(l.lname, ''))) AS lead_name
       FROM appointments a LEFT JOIN crm_forum_leads l ON l.id = a.leadid
      WHERE a.counsilorid = :userId AND (a.done IS NULL OR a.done = 0)
        AND STR_TO_DATE(CONCAT(a.date, ' ', a.appointtime), '%Y-%m-%d %H:%i:%s') BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL :minutes MINUTE)
      ORDER BY at ASC LIMIT 20`,
    { replacements: { userId: auth.id, minutes }, type: QueryTypes.SELECT },
  );

  const items = [
    ...appointments.map((a) => ({ key: `appt-${a.id}`, kind: 'Meeting', leadId: a.leadid, leadName: a.lead_name || `Lead #${a.leadid}`, at: a.at, note: null as string | null })),
    ...followUps.map((f) => ({ key: `fu-${f.id}`, kind: 'Follow-up', leadId: f.lead_id, leadName: f.lead_name || `Lead #${f.lead_id}`, at: f.at, note: f.message })),
  ].sort((x, y) => String(x.at).localeCompare(String(y.at)));

  return NextResponse.json({ items, minutes });
}
