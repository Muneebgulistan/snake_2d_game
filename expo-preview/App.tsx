import { useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, StatusBar, StyleSheet, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { GAME_HTML, PRIVACY_HTML } from './src/game-content';

const GAME_ORIGIN = 'https://serpent-run.local/';

export default function App() {
  const [showingPrivacy, setShowingPrivacy] = useState(false);
  const gameView = useRef<WebView<{}>>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showingPrivacy) {
        setShowingPrivacy(false);
        return true;
      }
      gameView.current?.injectJavaScript(
        "(function(){var handled=window.handleAndroidBack?window.handleAndroidBack():false;if(!handled)window.ReactNativeWebView?.postMessage('exit-app')})();true;",
      );
      return true;
    });
    return () => subscription.remove();
  }, [showingPrivacy]);

  const handleNavigation = (request: WebViewNavigation) => {
    if (request.url.includes('privacy-policy.html')) {
      setShowingPrivacy(true);
      return false;
    }
    return request.url.startsWith(GAME_ORIGIN);
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <WebView<{}>
        ref={gameView}
        source={{ html: showingPrivacy ? PRIVACY_HTML : GAME_HTML, baseUrl: GAME_ORIGIN }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess={false}
        allowsBackForwardNavigationGestures
        onShouldStartLoadWithRequest={handleNavigation}
        onMessage={(event) => {
          if (event.nativeEvent.data === 'exit-app') BackHandler.exitApp();
        }}
        style={styles.game}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  game: { backgroundColor: '#111827' },
});
