import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { config } from '../lib/config';

export type LegalLink = 'terms' | 'privacy' | 'support';

export function legalUrl(link: LegalLink): string {
  if (link === 'terms') return config.termsUrl;
  if (link === 'privacy') return config.privacyUrl;
  if (config.supportUrl) return config.supportUrl;
  return config.supportEmail ? `mailto:${config.supportEmail}` : '';
}

/** Opens a legal / support link. Returns false when the link is not configured in this build. */
export async function openLegalLink(link: LegalLink): Promise<boolean> {
  const url = legalUrl(link);
  if (!url) return false;
  if (url.startsWith('mailto:')) {
    await Linking.openURL(url);
    return true;
  }
  if (!url.startsWith('https://')) return false;
  await WebBrowser.openBrowserAsync(url);
  return true;
}
