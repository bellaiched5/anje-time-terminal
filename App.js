/**
 * Anje Time Terminal - App native Android pour tablette
 * 
 * Lecteur NFC pour pointage des employés.
 * Supporte :
 * - Badge NFC physique (carte MIFARE, NTAG, etc.)
 * - Smartphone Android (HCE - émulation de carte)
 * - iPhone Apple Wallet (pass NFC via ISO-DEP)
 * - Code clavier (code fixe / code auto)
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

  // Au démarrage, vérifier si une clé API est sauvegardée
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

          // Vérifier que la clé est toujours valide
          const isValid = await terminalAPI.validateKey(savedKey);
          if (isValid) {
            setIsConfigured(true);
          } else {
            // Clé expirée/supprimée, nettoyer
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

  // Callback quand le terminal est configuré
  const handleConfigured = (apiKey) => {
    setIsConfigured(true);
  };

  // Réinitialiser le terminal
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
