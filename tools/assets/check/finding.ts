/** One thing a check noticed. Errors fail the build; warnings are reported and left to a person. */
export interface Finding {
  level: 'error' | 'warn';
  /** Which check noticed it, as a short name for the report. */
  check: string;
  message: string;
}

export const error = (check: string, message: string): Finding => ({ level: 'error', check, message });
export const warn = (check: string, message: string): Finding => ({ level: 'warn', check, message });
