import { useAuth } from '@/utils/auth';
import { THEMES, ThemeName } from '@/constants/Themes';

export function useThemeColors() {
    const { theme } = useAuth();
    const colors = THEMES[theme as ThemeName] || THEMES.light;
    return colors;
}
