-- Additional contact number on a lead (a second phone, e.g. a spouse or an office line), alongside phone / WhatsApp.
ALTER TABLE crm_forum_leads
  ADD COLUMN additional_number VARCHAR(50) NULL;
