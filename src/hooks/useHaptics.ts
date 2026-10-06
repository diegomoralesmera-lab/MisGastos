import { Platform } from 'react-native';

export async function hapticImpact(style: 'light' | 'medium' | 'heavy' = 'medium') {
  if (Platform.OS === 'web') return;
  try {
    const Haptics = await import('expo-haptics');
    const map = {
      light: Haptics.ImpactFeedbackStyle.Light,
      medium: Haptics.ImpactFeedbackStyle.Medium,
      heavy: Haptics.ImpactFeedbackStyle.Heavy,
    };
    await Haptics.impactAsync(map[style]);
  } catch {}
}

export async function hapticSuccess() {
  if (Platform.OS === 'web') return;
  try {
    const Haptics = await import('expo-haptics');
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}
}
