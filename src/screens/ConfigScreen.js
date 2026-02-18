/**
 * Écran de configuration du terminal
 * L'admin entre la clé API pour activer le terminal
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import terminalAPI from '../services/api';

const STORAGE_KEY_API = '@terminal_api_key';
const STORAGE_KEY_URL = '@terminal_api_url';

export default function ConfigScreen({ onConfigured }) {
  const [apiKey, setApiKey] = useState('');
  const [apiUrl, setApiUrl] = useState('https://api.anjetime.com/api');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleConfigure = async () => {
    if (!apiKey.trim()) {
      setError('Veuillez entrer une clé API');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Configurer l'URL si modifiée
      terminalAPI.setApiUrl(apiUrl);
      
      // Valider la clé
      const isValid = await terminalAPI.validateKey(apiKey.trim());

      if (isValid) {
        terminalAPI.setTerminalKey(apiKey.trim());

        // Sauvegarder
        await AsyncStorage.setItem(STORAGE_KEY_API, apiKey.trim());
        await AsyncStorage.setItem(STORAGE_KEY_URL, apiUrl);

        onConfigured(apiKey.trim());
      } else {
        setError('Clé API invalide. Vérifiez dans Paramètres > Badgeuse.');
      }
    } catch (err) {
      console.error('Erreur configuration:', err);
      setError('Impossible de se connecter au serveur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.card}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>⏱️</Text>
          <Text style={styles.title}>Anje Time</Text>
          <Text style={styles.subtitle}>Configuration du Terminal</Text>
        </View>

        {/* Formulaire */}
        <View style={styles.form}>
          <Text style={styles.label}>Clé API du terminal</Text>
          <TextInput
            style={styles.input}
            placeholder="Collez la clé API ici..."
            placeholderTextColor="#999"
            value={apiKey}
            onChangeText={setApiKey}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* URL avancée */}
          <TouchableOpacity
            onPress={() => setShowAdvanced(!showAdvanced)}
            style={styles.advancedToggle}
          >
            <Text style={styles.advancedToggleText}>
              {showAdvanced ? '▼' : '▶'} Configuration avancée
            </Text>
          </TouchableOpacity>

          {showAdvanced && (
            <View>
              <Text style={styles.label}>URL du serveur</Text>
              <TextInput
                style={styles.input}
                placeholder="https://api.anjetime.com/api"
                placeholderTextColor="#999"
                value={apiUrl}
                onChangeText={setApiUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </View>
          )}

          {/* Erreur */}
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
            </View>
          )}

          {/* Bouton */}
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleConfigure}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Activer le terminal</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Instructions */}
        <View style={styles.instructions}>
          <Text style={styles.instructionsTitle}>Comment obtenir la clé ?</Text>
          <Text style={styles.instructionStep}>1. Connectez-vous en tant qu'admin sur anjetime.com</Text>
          <Text style={styles.instructionStep}>2. Allez dans Paramètres → Badgeuse</Text>
          <Text style={styles.instructionStep}>3. Créez un nouveau terminal</Text>
          <Text style={styles.instructionStep}>4. Copiez la clé API générée</Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#667eea',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 40,
    width: '100%',
    maxWidth: 500,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 30,
    elevation: 15,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  logoText: {
    fontSize: 48,
    marginBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginTop: 4,
  },
  form: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    color: '#333',
  },
  advancedToggle: {
    marginTop: 12,
    paddingVertical: 4,
  },
  advancedToggleText: {
    color: '#888',
    fontSize: 13,
  },
  errorContainer: {
    backgroundColor: '#fff0f0',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
  },
  errorText: {
    color: '#e74c3c',
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#667eea',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  instructions: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 16,
  },
  instructionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
    marginBottom: 8,
  },
  instructionStep: {
    fontSize: 13,
    color: '#999',
    marginBottom: 3,
    paddingLeft: 8,
  },
});
