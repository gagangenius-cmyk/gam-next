import { runOverdueFollowUpEmails } from '@/lib/overdueFollowUpEmail';
import { withCronRunLog } from '@/lib/cronRunLog';

type CronTask = {
  start: () => void;
};
type CronModule = {
  schedule: (
    expression: string,
    task: () => void | Promise<void>,
    options: { timezone: string; scheduled?: boolean }
  ) => CronTask;
};

declare global {
  var __dmOverdueEmailCronStarted: boolean | undefined;
}

const loadNodeCron = async (): Promise<CronModule | null> => {
  try {
    const cronPackage = await import('node-cron');
    return (cronPackage.default || cronPackage) as CronModule;
  } catch (error) {
    console.warn('node-cron is not available; overdue follow-up e-mail job was not started.', error);
    return null;
  }
};

// Runs every 10 minutes; the CEO-set threshold (Settings > CRM Controls) decides which follow-ups are old enough.
const SCHEDULE_EXPRESSION = '*/10 * * * *';

export async function startOverdueFollowUpEmailCron() {
  if (globalThis.__dmOverdueEmailCronStarted) {
    return { started: false, reason: 'already_started' };
  }

  if (process.env.OVERDUE_FOLLOW_UP_EMAIL_CRON_ENABLED === 'false') {
    return { started: false, reason: 'disabled_by_env' };
  }

  const cron = await loadNodeCron();
  if (!cron) return { started: false, reason: 'node_cron_unavailable' };

  const task = cron.schedule(
    SCHEDULE_EXPRESSION,
    async () => {
      try {
        const result = await withCronRunLog('overdue_follow_up_email', () => runOverdueFollowUpEmails());
        if (result.sent > 0) console.log(`Overdue follow-up e-mails sent: ${result.sent}`);
      } catch (error) {
        console.error('Overdue follow-up e-mail job failed:', error);
      }
    },
    { timezone: 'Asia/Dubai', scheduled: true }
  );

  task.start();
  globalThis.__dmOverdueEmailCronStarted = true;
  console.log(`Overdue follow-up e-mail cron scheduled: ${SCHEDULE_EXPRESSION}`);
  return { started: true, schedule: SCHEDULE_EXPRESSION };
}
