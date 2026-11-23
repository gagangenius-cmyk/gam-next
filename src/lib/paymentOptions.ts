// Bank and card/POS payment options carried over from the legacy CRM's
// payoption/paycardoption fields, so branches can record exactly which bank
// account or card terminal/gateway a payment went through.
export const BANK_PAYMENT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'SZR Bank', label: 'SZR Bank' },
  { value: 'AUH Bank', label: 'AUH Bank' },
  { value: 'SHJ Bank', label: 'SHJ Bank' },
  { value: 'CAD SZR Bank', label: 'CAD SZR Bank' },
  { value: 'USD SZR Bank', label: 'USD SZR Bank' },
  { value: 'Oman Bank', label: 'Oman Bank' },
  { value: 'Qatar Bank', label: 'Qatar Bank' },
  { value: 'Kuwait Bank', label: 'Kuwait Bank' },
  { value: 'Saudi Bank', label: 'Saudi Bank' },
  { value: 'India Bank', label: 'India Bank' },
  { value: 'Interac Scotia Bank', label: 'Interac Scotia Bank' },
];

export const CARD_PAYMENT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'POS Machine', label: 'POS Machine' },
  { value: 'TAP', label: 'TAP Link - GCC' },
  { value: 'Razr', label: 'Razr' },
  { value: 'Payu', label: 'Payu' },
  { value: 'Paypal', label: 'Paypal' },
  { value: 'Payment Link', label: 'Payment Link' },
  { value: 'Tabby', label: 'Tabby' },
  { value: 'Tamara', label: 'Tamara' },
];

// Which CEO-set surcharge (Settings > CRM Controls) applies to a payment method, or null when none does.
export function surchargeSettingKey(method: string | null | undefined): 'payments.surcharge.payment_link' | 'payments.surcharge.pos' | 'payments.surcharge.tabby' | 'payments.surcharge.tamara' | null {
  const m = String(method || '').trim().toLowerCase();
  if (m === 'pos machine' || m === 'pos') return 'payments.surcharge.pos';
  if (m === 'tabby') return 'payments.surcharge.tabby';
  if (m === 'tamara') return 'payments.surcharge.tamara';
  if (m === 'payment link' || m === 'tap' || m === 'credit_card') return 'payments.surcharge.payment_link';
  return null;
}
