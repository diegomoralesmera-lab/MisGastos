import { useColorScheme as useRNColorScheme } from 'react-native';
import { Colors } from '../constants/colors';

export function useTheme() {
  const scheme = useRNColorScheme();
  return Colors[scheme === 'dark' ? 'dark' : 'light'];
}
