import { useTheme } from '@/lib/theme/provider';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const themeOptions = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
] as const;

type ThemePreference = (typeof themeOptions)[number]['value'];

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function ThemeSelect() {
  const { setTheme, theme } = useTheme();
  const activeTheme = isThemePreference(theme ?? null) ? theme : 'system';

  return (
    <Select
      items={themeOptions}
      value={activeTheme}
      onValueChange={(value) => {
        if (isThemePreference(value)) {
          setTheme(value);
        }
      }}
    >
      <SelectTrigger
        aria-label="Theme"
        className="w-full rounded-sm shadow-none"
        data-testid="theme-select"
        size="sm"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        <SelectGroup>
          {themeOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
