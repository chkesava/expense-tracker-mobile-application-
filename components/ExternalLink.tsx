import { Link, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import type { ComponentProps } from 'react';
import { Platform } from 'react-native';

export function ExternalLink(
  props: Omit<ComponentProps<typeof Link>, 'href'> & { href: Href | string }
) {
  const href = props.href as Href;
  return (
    <Link
      target="_blank"
      {...props}
      href={href}
      onPress={(e) => {
        if (Platform.OS !== 'web') {
          e.preventDefault();
          WebBrowser.openBrowserAsync(String(props.href));
        }
      }}
    />
  );
}
