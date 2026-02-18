/**
 * Écran principal du scanner terminal
 * Affiche l'horloge, le clavier numérique, le statut NFC
 * et les résultats de pointage
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Vibration,
  Animated,
  Modal,
  TextInput,
  FlatList,
  StatusBar,
} from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import nfcService from '../services/nfcService';
import terminalAPI from '../services/api';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ScannerScreen({ onReset }) {
  // NFC state
  const [nfcReady, setNfcReady] = useState(false);
  const [nfcError, setNfcError] = useState(null);

  // Scan state
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState(null);

  // Code input
  const [codeInput, setCodeInput] = useState('');

  // Affiliation NFC
  const [showAffiliation, setShowAffiliation] = useState(false);
  const [pendingNfcId, setPendingNfcId] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [affiliationSearch, setAffiliationSearch] = useState('');
  const [affiliating, setAffiliating] = useState(false);

  // Clock
  const [currentTime, setCurrentTime] = useState(new Date());

  // Animation
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const overlayScale = useRef(new Animated.Value(0.8)).current;

  // Anti-doublon
  const lastScannedRef = useRef({ data: null, time: 0 });
  const scanResultTimer = useRef(null);

  // Horloge
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Garder l'écran allumé (c'est un terminal fixe)
  useEffect(() => {
    activateKeepAwakeAsync();
    return () => deactivateKeepAwake();
  }, []);

  // Masquer la barre de statut pour mode kiosque
  useEffect(() => {
    StatusBar.setHidden(true);
  }, []);

  // Initialiser NFC
  useEffect(() => {
    let mounted = true;

    const initNfc = async () => {
      const supported = await nfcService.init();

      if (!mounted) return;

      if (supported) {
        setNfcReady(true);
        // Démarrer l'écoute continue
        nfcService.startListening(handleNfcTag);
      } else {
        setNfcError('NFC non disponible sur cet appareil');
      }
    };

    initNfc();

    return () => {
      mounted = false;
      nfcService.stopListening();
    };
  }, []);

  /**
   * Callback quand un tag NFC est détecté
   */
  const handleNfcTag = useCallback(async (tagResult) => {
    if (scanning) return;

    const now = Date.now();
    if (
      lastScannedRef.current.data === tagResult.id &&
      now - lastScannedRef.current.time < 3000
    ) {
      return; // Anti-doublon 3s
    }
    lastScannedRef.current = { data: tagResult.id, time: now };

    console.log(`📱 Tag détecté: ${tagResult.type} - ${tagResult.id}`);
    
    // Vibrer pour feedback
    Vibration.vibrate(100);

    setScanning(true);

    try {
      const response = await terminalAPI.scan(tagResult.id);

      if (response.success) {
        showScanResult({
          success: true,
          employeeName: response.employeeName,
          type: response.type,
          message: response.message,
          nfcType: tagResult.type,
        });
      } else {
        // Badge NFC non affilié ?
        if (response.error === 'NFC_NOT_AFFILIATED' && response.canAffiliate) {
          setPendingNfcId(response.nfcId);
          loadEmployeesForAffiliation();
          setShowAffiliation(true);
          showScanResult({
            success: false,
            message: 'Badge non reconnu - Affiliation nécessaire',
            nfcType: tagResult.type,
          });
        } else {
          showScanResult({
            success: false,
            message: response.message || response.error || 'Badge non reconnu',
            nfcType: tagResult.type,
          });
        }
      }
    } catch (error) {
      showScanResult({
        success: false,
        message: 'Erreur de connexion au serveur',
      });
    } finally {
      setScanning(false);
    }
  }, [scanning]);

  /**
   * Soumission du code clavier
   */
  const handleCodeSubmit = useCallback(async () => {
    if (codeInput.length < 4 || scanning) return;

    const code = codeInput;
    setCodeInput('');
    
    const now = Date.now();
    if (
      lastScannedRef.current.data === code &&
      now - lastScannedRef.current.time < 3000
    ) {
      return;
    }
    lastScannedRef.current = { data: code, time: now };

    Vibration.vibrate(50);
    setScanning(true);

    try {
      const response = await terminalAPI.scan(code);

      if (response.success) {
        showScanResult({
          success: true,
          employeeName: response.employeeName,
          type: response.type,
          message: response.message,
        });
      } else {
        showScanResult({
          success: false,
          message: response.error || 'Code invalide',
        });
      }
    } catch (error) {
      showScanResult({
        success: false,
        message: 'Erreur de connexion',
      });
    } finally {
      setScanning(false);
    }
  }, [codeInput, scanning]);

  /**
   * Afficher le résultat du scan avec animation
   */
  const showScanResult = useCallback((result) => {
    setLastScan({ ...result, time: new Date().toLocaleTimeString('fr-FR') });

    // Animation d'entrée
    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(overlayScale, {
        toValue: 1,
        friction: 6,
        useNativeDriver: true,
      }),
    ]).start();

    // Vibration feedback
    if (result.success) {
      Vibration.vibrate([0, 100, 50, 100]); // Double tap success
    } else {
      Vibration.vibrate([0, 300]); // Long error
    }

    // Auto-hide après 4s
    if (scanResultTimer.current) clearTimeout(scanResultTimer.current);
    scanResultTimer.current = setTimeout(() => {
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setLastScan(null);
        overlayScale.setValue(0.8);
      });
    }, 4000);
  }, []);

  /**
   * Charger les employés pour l'affiliation
   */
  const loadEmployeesForAffiliation = async () => {
    const emps = await terminalAPI.getEmployeesForAffiliation();
    setEmployees(emps);
  };

  /**
   * Affilier un badge NFC à un employé
   */
  const handleAffiliate = async (employeeId) => {
    if (!pendingNfcId || affiliating) return;

    setAffiliating(true);
    try {
      const result = await terminalAPI.affiliateNfc(pendingNfcId, employeeId);

      if (result.success) {
        setShowAffiliation(false);
        setPendingNfcId(null);
        setAffiliationSearch('');
        showScanResult({
          success: true,
          employeeName: result.employee?.name || 'Employé',
          message: `Badge NFC affilié avec succès`,
        });
      } else {
        showScanResult({
          success: false,
          message: result.error || "Erreur d'affiliation",
        });
      }
    } catch (error) {
      showScanResult({
        success: false,
        message: 'Erreur de connexion',
      });
    } finally {
      setAffiliating(false);
    }
  };

  // Keypad handlers
  const handleKeyPress = (digit) => {
    if (codeInput.length < 6) {
      setCodeInput((prev) => prev + digit);
    }
  };
  const handleKeyClear = () => setCodeInput('');
  const handleKeyBackspace = () => setCodeInput((prev) => prev.slice(0, -1));

  // Filtrer les employés
  const filteredEmployees = employees.filter((e) =>
    e.name.toLowerCase().includes(affiliationSearch.toLowerCase())
  );

  // Formater la date/heure
  const timeStr = currentTime.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const dateStr = currentTime.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Type de pointage en français
  const getPointageLabel = (type) => {
    switch (type) {
      case 'entree': return '✅ Entrée enregistrée';
      case 'sortie': return '🚪 Sortie enregistrée';
      case 'debut_pause': return '☕ Début de pause';
      case 'fin_pause': return '▶️ Fin de pause';
      default: return 'Pointage enregistré';
    }
  };

  const getNfcTypeLabel = (type) => {
    switch (type) {
      case 'hce_android': return '📱 Android NFC';
      case 'apple_wallet': return '🍎 Apple Wallet';
      case 'nfc_badge': return '💳 Badge NFC';
      default: return '';
    }
  };

  return (
    <View style={styles.container}>
      {/* Header avec horloge */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.logo}>⏱️ Anje Time</Text>
        </View>
        <View style={styles.headerCenter}>
          <Text style={styles.time}>{timeStr}</Text>
          <Text style={styles.date}>{dateStr}</Text>
        </View>
        <View style={styles.headerRight}>
          {/* Indicateur NFC */}
          <View style={[styles.nfcBadge, nfcReady ? styles.nfcActive : styles.nfcInactive]}>
            <Text style={styles.nfcBadgeIcon}>📶</Text>
            <Text style={[styles.nfcBadgeText, nfcReady ? styles.nfcTextActive : styles.nfcTextInactive]}>
              {nfcReady ? 'NFC Actif' : 'NFC Inactif'}
            </Text>
          </View>
          <TouchableOpacity onPress={onReset} style={styles.settingsBtn}>
            <Text style={styles.settingsBtnText}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Zone principale */}
      <View style={styles.main}>
        {/* Zone NFC info */}
        <View style={styles.nfcZone}>
          <Text style={styles.nfcIcon}>📱</Text>
          <Text style={styles.nfcTitle}>
            {nfcReady
              ? 'Approchez votre badge ou smartphone'
              : nfcError || 'Initialisation NFC...'}
          </Text>
          <Text style={styles.nfcSubtitle}>
            Badge NFC • Android • iPhone (Wallet)
          </Text>
          {scanning && (
            <View style={styles.scanningIndicator}>
              <Text style={styles.scanningText}>⏳ Vérification en cours...</Text>
            </View>
          )}
        </View>

        {/* Séparateur */}
        <View style={styles.separator}>
          <View style={styles.separatorLine} />
          <Text style={styles.separatorText}>OU</Text>
          <View style={styles.separatorLine} />
        </View>

        {/* Clavier numérique */}
        <View style={styles.keypadZone}>
          <Text style={styles.keypadTitle}>Entrez votre code</Text>

          {/* Affichage du code */}
          <View style={styles.codeDisplay}>
            {Array.from({ length: 6 }, (_, i) => (
              <View
                key={i}
                style={[
                  styles.codeDigit,
                  i < codeInput.length ? styles.codeDigitFilled : null,
                ]}
              >
                <Text style={styles.codeDigitText}>
                  {i < codeInput.length ? codeInput[i] : '○'}
                </Text>
              </View>
            ))}
          </View>

          {/* Grille du clavier */}
          <View style={styles.keypadGrid}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '⌫'].map((key) => (
              <TouchableOpacity
                key={key}
                style={[
                  styles.keypadBtn,
                  key === 'C' && styles.keypadBtnClear,
                  key === '⌫' && styles.keypadBtnBackspace,
                ]}
                onPress={() => {
                  if (key === 'C') handleKeyClear();
                  else if (key === '⌫') handleKeyBackspace();
                  else handleKeyPress(String(key));
                }}
              >
                <Text
                  style={[
                    styles.keypadBtnText,
                    (key === 'C' || key === '⌫') && styles.keypadBtnTextSpecial,
                  ]}
                >
                  {key}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Bouton valider */}
          <TouchableOpacity
            style={[
              styles.submitBtn,
              codeInput.length < 4 && styles.submitBtnDisabled,
            ]}
            onPress={handleCodeSubmit}
            disabled={codeInput.length < 4 || scanning}
          >
            <Text style={styles.submitBtnText}>
              {scanning ? '⏳' : '✓'} Valider
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Overlay résultat de scan */}
      {lastScan && (
        <Animated.View
          style={[
            styles.overlay,
            {
              opacity: overlayOpacity,
              transform: [{ scale: overlayScale }],
            },
          ]}
          pointerEvents="none"
        >
          <View
            style={[
              styles.overlayCard,
              lastScan.success ? styles.overlaySuccess : styles.overlayError,
            ]}
          >
            <Text style={styles.overlayIcon}>
              {lastScan.success ? '✓' : '✕'}
            </Text>
            {lastScan.success ? (
              <>
                <Text style={styles.overlayName}>{lastScan.employeeName}</Text>
                <Text style={styles.overlayType}>
                  {getPointageLabel(lastScan.type)}
                </Text>
                {lastScan.nfcType && (
                  <Text style={styles.overlayNfcType}>
                    {getNfcTypeLabel(lastScan.nfcType)}
                  </Text>
                )}
              </>
            ) : (
              <>
                <Text style={styles.overlayErrorTitle}>Erreur</Text>
                <Text style={styles.overlayMessage}>{lastScan.message}</Text>
              </>
            )}
            <Text style={styles.overlayTime}>{lastScan.time}</Text>
          </View>
        </Animated.View>
      )}

      {/* Modal affiliation NFC */}
      <Modal
        visible={showAffiliation}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowAffiliation(false);
          setPendingNfcId(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>📱 Nouveau badge détecté</Text>
            <Text style={styles.modalSubtitle}>
              Sélectionnez l'employé à qui affilier ce badge
            </Text>
            <Text style={styles.modalNfcId}>ID: {pendingNfcId}</Text>

            <TextInput
              style={styles.modalSearch}
              placeholder="🔍 Rechercher un employé..."
              placeholderTextColor="#999"
              value={affiliationSearch}
              onChangeText={setAffiliationSearch}
              autoFocus
            />

            <FlatList
              data={filteredEmployees}
              keyExtractor={(item) => String(item.id)}
              style={styles.modalList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.employeeItem}
                  onPress={() => handleAffiliate(item.id)}
                  disabled={affiliating}
                >
                  <Text style={styles.employeeName}>{item.name}</Text>
                  {item.hasNfc && (
                    <Text style={styles.employeeNfcBadge}>Badge existant</Text>
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  {affiliationSearch ? 'Aucun employé trouvé' : 'Chargement...'}
                </Text>
              }
            />

            {affiliating && (
              <Text style={styles.affiliatingText}>⏳ Affiliation en cours...</Text>
            )}

            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => {
                setShowAffiliation(false);
                setPendingNfcId(null);
                setAffiliationSearch('');
              }}
            >
              <Text style={styles.modalCancelText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },

  // ===== HEADER =====
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerLeft: {
    flex: 1,
  },
  logo: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  headerCenter: {
    flex: 2,
    alignItems: 'center',
  },
  time: {
    fontSize: 36,
    fontWeight: '300',
    color: '#fff',
    letterSpacing: 4,
  },
  date: {
    fontSize: 14,
    color: '#94a3b8',
    textTransform: 'capitalize',
  },
  headerRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  nfcBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  nfcActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
  },
  nfcInactive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  nfcBadgeIcon: {
    fontSize: 14,
  },
  nfcBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  nfcTextActive: {
    color: '#22c55e',
  },
  nfcTextInactive: {
    color: '#ef4444',
  },
  settingsBtn: {
    padding: 8,
  },
  settingsBtnText: {
    fontSize: 20,
  },

  // ===== MAIN =====
  main: {
    flex: 1,
    flexDirection: 'row',
    padding: 20,
    gap: 20,
  },

  // ===== NFC ZONE =====
  nfcZone: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    borderWidth: 2,
    borderColor: '#334155',
    borderStyle: 'dashed',
  },
  nfcIcon: {
    fontSize: 80,
    marginBottom: 20,
  },
  nfcTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#e2e8f0',
    textAlign: 'center',
    marginBottom: 8,
  },
  nfcSubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
  scanningIndicator: {
    marginTop: 16,
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  scanningText: {
    color: '#818cf8',
    fontSize: 14,
    fontWeight: '600',
  },

  // ===== SEPARATOR =====
  separator: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 40,
  },
  separatorLine: {
    flex: 1,
    width: 1,
    backgroundColor: '#334155',
  },
  separatorText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    paddingVertical: 8,
  },

  // ===== KEYPAD ZONE =====
  keypadZone: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypadTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: 12,
  },

  // Code display
  codeDisplay: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  codeDigit: {
    width: 44,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#0f172a',
    borderWidth: 2,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  codeDigitFilled: {
    borderColor: '#667eea',
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
  },
  codeDigitText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#e2e8f0',
  },

  // Keypad grid
  keypadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    width: 240,
    marginBottom: 12,
  },
  keypadBtn: {
    width: 72,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keypadBtnClear: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  keypadBtnBackspace: {
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
  },
  keypadBtnText: {
    fontSize: 22,
    fontWeight: '600',
    color: '#e2e8f0',
  },
  keypadBtnTextSpecial: {
    fontSize: 16,
  },

  // Submit
  submitBtn: {
    backgroundColor: '#667eea',
    paddingHorizontal: 48,
    paddingVertical: 14,
    borderRadius: 12,
    width: 240,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },

  // ===== OVERLAY RÉSULTAT =====
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  overlayCard: {
    borderRadius: 24,
    padding: 40,
    alignItems: 'center',
    minWidth: 350,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 40,
    elevation: 20,
  },
  overlaySuccess: {
    backgroundColor: '#065f46',
  },
  overlayError: {
    backgroundColor: '#7f1d1d',
  },
  overlayIcon: {
    fontSize: 64,
    color: '#fff',
    fontWeight: '700',
    marginBottom: 12,
  },
  overlayName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  overlayType: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 4,
  },
  overlayNfcType: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 8,
  },
  overlayErrorTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  overlayMessage: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    marginBottom: 8,
  },
  overlayTime: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 4,
  },

  // ===== MODAL AFFILIATION =====
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    padding: 24,
    width: '80%',
    maxWidth: 500,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 8,
  },
  modalNfcId: {
    fontSize: 12,
    color: '#64748b',
    fontFamily: 'monospace',
    marginBottom: 16,
  },
  modalSearch: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: '#e2e8f0',
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 12,
  },
  modalList: {
    maxHeight: 300,
  },
  employeeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  employeeName: {
    fontSize: 16,
    color: '#e2e8f0',
    fontWeight: '500',
  },
  employeeNfcBadge: {
    fontSize: 11,
    color: '#fbbf24',
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  emptyText: {
    textAlign: 'center',
    color: '#64748b',
    padding: 20,
  },
  affiliatingText: {
    textAlign: 'center',
    color: '#818cf8',
    padding: 10,
  },
  modalCancelBtn: {
    marginTop: 12,
    padding: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '600',
  },
});
