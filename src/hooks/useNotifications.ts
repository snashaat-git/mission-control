'use client';

import { useCallback, useEffect, useRef } from 'react';

const STORAGE_KEY = 'mc-notifications-enabled';

function isEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

export function useNotifications() {
  const permissionRef = useRef<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'denied'
  );

  // Sync permission state on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      permissionRef.current = Notification.permission;
    }
  }, []);

  const notify = useCallback((title: string, options?: { body?: string; tag?: string }) => {
    // Skip if notifications not supported, not enabled, or no permission
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (!isEnabled()) return;
    if (Notification.permission !== 'granted') return;

    // Only notify when tab is not focused
    if (!document.hidden) return;

    try {
      const notification = new Notification(title, {
        body: options?.body,
        tag: options?.tag, // Deduplicates notifications with same tag
        icon: '/favicon.ico',
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // Auto-close after 8 seconds
      setTimeout(() => notification.close(), 8000);
    } catch (e) {
      // Notification constructor can throw in some environments
      console.warn('[Notifications] Failed to create notification:', e);
    }
  }, []);

  return { notify };
}

/**
 * Request notification permission. Call this from a user gesture (button click).
 * Returns the resulting permission state.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  const result = await Notification.requestPermission();
  return result;
}

/**
 * Get current notification settings for the Settings UI.
 */
export function getNotificationSettings() {
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  return {
    supported,
    permission: supported ? Notification.permission : ('denied' as NotificationPermission),
    enabled: isEnabled(),
  };
}

/**
 * Toggle notification enabled state in localStorage.
 */
export function setNotificationsEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, String(enabled));
}
