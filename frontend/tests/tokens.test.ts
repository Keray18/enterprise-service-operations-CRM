import { describe, expect, it } from 'vitest';
import { buildTheme } from '../src/theme/theme';
import { tokens } from '../src/theme/tokens';

describe('Design System Tokens', () => {
  it('should define compliant light and dark mode colors', () => {
    expect(tokens.colors.light.canvas).toBe('#f8fafc');
    expect(tokens.colors.dark.canvas).toBe('#090d16');
    expect(tokens.colors.brand.primary).toBe('#4f46e5');
  });

  it('should define semantic operational status colors', () => {
    expect(tokens.colors.status.success).toBe('#10b981');
    expect(tokens.colors.status.warning).toBe('#f59e0b');
    expect(tokens.colors.status.danger).toBe('#ef4444');
    expect(tokens.colors.status.info).toBe('#0284c7');
  });

  it('should successfully build light and dark MUI themes', () => {
    const lightTheme = buildTheme('light');
    const darkTheme = buildTheme('dark');

    expect(lightTheme.palette.mode).toBe('light');
    expect(darkTheme.palette.mode).toBe('dark');
    expect(lightTheme.typography.fontFamily).toContain('Inter');
  });
});
