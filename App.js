/**
 * Anje Time Terminal - App native Android pour tablette
 * 
 * Scanner QR code pour pointage des employÃ©s.
 * Supporte :
 * - QR code badge (depuis PWA ou app mobile)
 */
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import terminalAPI from './src/services/api';
import ConfigScreen from './src/screens/ConfigScreen';
import ScannerScreen from './src/screens/ScannerScreen';

const STORAGE_KEY_API = '@terminal_api_key';
const STORAGE_KEY_URL = '@terminal_api_url';

export default function App() {
  const [isConfigured, setIsConfigured] = useState(false);
  const [loading, setLoading] = useState(true);

  // Au dÃ©marrage, vÃ©rifier si une clÃ© API est sauvegardÃ©e
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const savedKey = await AsyncStorage.getItem(STORAGE_KEY_API);
        const savedUrl = await AsyncStorage.getItem(STORAGE_KEY_URL);

        if (savedUrl) {
          terminalAPI.setApiUrl(savedUrl);
        }

        if (savedKey) {
          terminalAPI.setTerminalKey(savedKey);

          // VÃ©rifier que la clÃ© est toujours valide
          const isValid = await terminalAPI.validateKey(savedKey);
          if (isValid) {
            setIsConfigured(true);
          } else {
            // ClÃ© expirÃ©e/supprimÃ©e, nettoyer
            await AsyncStorage.removeItem(STORAGE_KEY_API);
          }
        }
      } catch (error) {
        console.error('Erreur chargement config:', error);
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, []);

  // Callback quand le terminal est configurÃ©
  const handleConfigured = (apiKey) => {
    setIsConfigured(true);
  };

  // RÃ©initialiser le terminal
  const handleReset = async () => {
    await AsyncStorage.removeItem(STORAGE_KEY_API);
    await AsyncStorage.removeItem(STORAGE_KEY_URL);
    terminalAPI.setTerminalKey(null);
    setIsConfigured(false);
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <StatusBar hidden />
      </View>
    );
  }

  if (!isConfigured) {
    return <ConfigScreen onConfigured={handleConfigured} />;
  }

  return <ScannerScreen onReset={handleReset} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
