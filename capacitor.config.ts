import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.choreboard.app',
  appName: 'ChoreBoard',
  webDir: 'dist',

  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    allowNavigation: [
      'app.choreboard.io',
      'api.choreboard.io',
      'choreboard.io',
      'assets.choreboard.io',
    ],
  },

  ios: {
    contentInset: 'always',
    backgroundColor: '#10182BFF',
    limitsNavigationsToAppBoundDomains: false,
  },

  android: {
    backgroundColor: '#10182BFF',
    allowMixedContent: false,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      launchAutoHide: true,
      backgroundColor: '#10182B',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      backgroundColor: '#10182B',
      style: 'DARK',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    CapacitorHttp: {
      enabled: false,
    },
  },
};

export default config;
