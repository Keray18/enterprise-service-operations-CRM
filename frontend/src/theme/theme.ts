import { createTheme, Theme, ThemeOptions } from '@mui/material/styles';
import { tokens } from './tokens';

export function buildTheme(mode: 'light' | 'dark'): Theme {
  const c = mode === 'light' ? tokens.colors.light : tokens.colors.dark;
  const shadow = mode === 'light' ? tokens.shadows.light : tokens.shadows.dark;

  const options: ThemeOptions = {
    palette: {
      mode,
      primary: {
        main: tokens.colors.brand.primary,
        dark: tokens.colors.brand.hover,
        contrastText: tokens.colors.brand.contrast,
      },
      secondary: {
        main: '#6366f1',
      },
      background: {
        default: c.canvas,
        paper: c.surface,
      },
      text: {
        primary: c.textPrimary,
        secondary: c.textSecondary,
        disabled: c.textMuted,
      },
      divider: c.border,
      success: {
        main: tokens.colors.status.success,
      },
      warning: {
        main: tokens.colors.status.warning,
      },
      error: {
        main: tokens.colors.status.danger,
      },
      info: {
        main: tokens.colors.status.info,
      },
    },
    typography: {
      fontFamily: tokens.typography.fontFamily,
      h1: {
        fontSize: '1.75rem',
        fontWeight: 700,
        lineHeight: 1.25,
        color: c.textPrimary,
      },
      h2: {
        fontSize: '1.25rem',
        fontWeight: 600,
        lineHeight: 1.3,
        color: c.textPrimary,
      },
      h3: {
        fontSize: '1.05rem',
        fontWeight: 600,
        lineHeight: 1.4,
        color: c.textPrimary,
      },
      h4: {
        fontSize: '0.925rem',
        fontWeight: 600,
        lineHeight: 1.4,
        color: c.textPrimary,
      },
      subtitle1: {
        fontSize: '0.875rem',
        lineHeight: 1.5,
        color: c.textSecondary,
      },
      subtitle2: {
        fontSize: '0.8125rem',
        fontWeight: 500,
        color: c.textSecondary,
      },
      body1: {
        fontSize: '0.875rem',
        lineHeight: 1.5,
        color: c.textPrimary,
      },
      body2: {
        fontSize: '0.8125rem',
        lineHeight: 1.45,
        color: c.textSecondary,
      },
      button: {
        textTransform: 'none',
        fontWeight: 500,
        fontSize: '0.8125rem',
      },
      caption: {
        fontSize: '0.6875rem',
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: c.textMuted,
      },
    },
    shape: {
      borderRadius: tokens.shape.borderRadiusSm,
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: c.canvas,
            color: c.textPrimary,
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: tokens.shape.borderRadiusSm,
            boxShadow: 'none',
            padding: '6px 14px',
            '&:hover': {
              boxShadow: 'none',
            },
          },
          containedPrimary: {
            backgroundColor: tokens.colors.brand.primary,
            '&:hover': {
              backgroundColor: tokens.colors.brand.hover,
            },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundColor: c.surface,
            borderRadius: tokens.shape.borderRadius,
            border: `1px solid ${c.border}`,
            boxShadow: shadow.card,
            backgroundImage: 'none',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderBottom: `1px solid ${c.border}`,
            padding: '8px 12px',
            fontSize: '0.8125rem',
            color: c.textPrimary,
          },
          head: {
            backgroundColor: c.subtle,
            color: c.textSecondary,
            fontWeight: 600,
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            '&:hover': {
              backgroundColor: mode === 'light' ? 'rgba(241, 245, 249, 0.6)' : 'rgba(30, 41, 59, 0.5)',
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontWeight: 600,
            fontSize: '0.6875rem',
            height: 22,
            borderRadius: 4,
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: tokens.shape.borderRadiusSm,
            backgroundColor: c.surface,
            '& fieldset': {
              borderColor: c.border,
            },
            '&:hover fieldset': {
              borderColor: c.borderHover,
            },
            '&.Mui-focused fieldset': {
              borderColor: tokens.colors.brand.primary,
              borderWidth: 1.5,
            },
          },
          input: {
            padding: '8px 12px',
            fontSize: '0.8125rem',
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: c.surface,
            color: c.textPrimary,
            borderBottom: `1px solid ${c.border}`,
            boxShadow: 'none',
            backgroundImage: 'none',
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: c.surface,
            borderRight: `1px solid ${c.border}`,
            boxShadow: 'none',
            backgroundImage: 'none',
          },
        },
      },
    },
  };

  return createTheme(options);
}
