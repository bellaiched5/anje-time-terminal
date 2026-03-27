/**
 * Écran principal du scanner terminal
 * Affiche l'horloge, la caméra QR code, le clavier numérique
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
  StatusBar,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import qrService from '../services/qrService';
import terminalAPI from '../services/api';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ScannerScreen({ onReset }) {
  // Camera permissions
  const [permission, requestPermission] = useCameraPermissions();

  // QR state
  const [qrReady, setQrReady] = useState(false);
  const [qrError, setQrError] = useState(null);

  // Scan state
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState(null);

  // Code input
  const [codeInput, setCodeInput] = useState('');

  // Clock
  const [currentTime, setCurrentTime] = useState(new Date());

  // Animation
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const overlayScale = useRef(new Animated.Value(0.8)).current;

  // Anti-doublon
  const lastScannedRef = useRef({ data: null, time: 0 });
  const scanResultTimer = useRef(null);
  const scanLockRef = useRef(false);

  // Ref caméra pour capture photo
  const cameraRef = useRef(null);

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

  // Initialiser QR service + permissions caméra
  useEffect(() => {
    const initQr = async () => {
      await qrService.init();

      if (permission?.granted) {
        setQrReady(true);
      } else if (permission?.canAskAgain !== false) {
        const result = await requestPermission();
        if (result.granted) {
          setQrReady(true);
        } else {
          setQrError('Permission caméra refusée');
        }
      } else {
        setQrError('Permission caméra refusée');
      }
    };

    initQr();

    return () => {
      qrService.cleanup();
    };
  }, [permission]);

  /**
   * Callback quand un QR code est scanné par la caméra
   */
  const handleBarcodeScanned = useCallback(async (scanResult) => {
    if (scanLockRef.current || scanning) return;

    const rawData = scanResult.data;
    const parsed = qrService.processScannedData(rawData);

    if (!parsed) return; // Doublon ou invalide

    console.log(`📱 QR scanné: ${parsed.type} - ${parsed.id}`);

    // Verrouiller pendant le traitement
    scanLockRef.current = true;

    // Vibrer pour feedback
    Vibration.vibrate(100);

    setScanning(true);

    try {
      const response = await terminalAPI.scan(parsed.id);

      if (response.success) {
        showScanResult({
          success: true,
          employeeName: response.employeeName,
          type: response.type,
          message: response.message,
          scanType: parsed.type === 'qr_badge' ? '📱 QR Badge' : '📱 QR Code',
        });
      } else {
        showScanResult({
          success: false,
          message: response.message || response.error || 'QR code non reconnu',
          scanType: '📱 QR Code',
        });
      }
    } catch (error) {
      showScanResult({
        success: false,
        message: 'Erreur de connexion au serveur',
      });
    } finally {
      setScanning(false);
      // Déverrouiller après le cooldown
      setTimeout(() => {
        scanLockRef.current = false;
      }, 3000);
    }
  }, [scanning]);

  /**
   * Capturer une photo silencieusement et l'envoyer au backend
   * Appelé uniquement après un badge par code fixe réussi
   */
  const captureAndUploadPhoto = useCallback(async (employeeId, pointageId) => {
    try {
      if (!cameraRef.current) {
        console.log('📸 Pas de caméra disponible pour la photo');
        return;
      }
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.4,
        base64: true,
        skipProcessing: true,
      });
      if (photo?.base64) {
        console.log('📸 Photo capturée, upload en cours...');
        await terminalAPI.uploadPhoto(employeeId, pointageId, photo.base64);
      }
    } catch (err) {
      // Non-bloquant : on ne veut pas perturber le pointage
      console.log('📸 Capture photo échouée (non-bloquant):', err.message);
    }
  }, []);

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
        // Capturer la photo en arrière-plan (non-bloquant)
        if (response.pointageId && response.employeeId) {
          captureAndUploadPhoto(response.employeeId, response.pointageId);
        }
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

  // Keypad handlers
  const handleKeyPress = (digit) => {
    if (codeInput.length < 6) {
      setCodeInput((prev) => prev + digit);
    }
  };
  const handleKeyClear = () => setCodeInput('');
  const handleKeyBackspace = () => setCodeInput((prev) => prev.slice(0, -1));

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
          {/* Indicateur QR */}
          <View style={[styles.qrBadge, qrReady ? styles.qrActive : styles.qrInactive]}>
            <Text style={styles.qrBadgeIcon}>📷</Text>
            <Text style={[styles.qrBadgeText, qrReady ? styles.qrTextActive : styles.qrTextInactive]}>
              {qrReady ? 'Caméra Active' : 'Caméra Inactive'}
            </Text>
          </View>
          <TouchableOpacity onPress={onReset} style={styles.settingsBtn}>
            <Text style={styles.settingsBtnText}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Zone principale */}
      <View style={styles.main}>
        {/* Zone Caméra QR */}
        <View style={styles.qrZone}>
          {qrReady && permission?.granted ? (
            <View style={styles.cameraContainer}>
              <CameraView
                ref={cameraRef}
                style={styles.camera}
                facing="front"
                barcodeScannerSettings={{
                  barcodeTypes: ['qr'],
                }}
                onBarcodeScanned={scanning ? undefined : handleBarcodeScanned}
              />
              {/* Overlay de viseur */}
              <View style={styles.cameraOverlay}>
                <View style={styles.scanFrame}>
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />
                </View>
              </View>
              <View style={styles.cameraLabel}>
                <Text style={styles.cameraLabelText}>
                  📱 Scannez le QR code du badge
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.cameraPlaceholder}>
              <Text style={styles.placeholderIcon}>📷</Text>
              <Text style={styles.placeholderTitle}>
                {qrError || (!permission?.granted ? 'Autorisation caméra requise' : 'Initialisation...')}
              </Text>
              {!permission?.granted && (
                <TouchableOpacity
                  style={styles.permissionBtn}
                  onPress={requestPermission}
                >
                  <Text style={styles.permissionBtnText}>Autoriser la caméra</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
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
              {scanning ? '⏳' : '✔'} Valider
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
              {lastScan.success ? '✔' : '✕'}
            </Text>
            {lastScan.success ? (
              <>
                <Text style={styles.overlayName}>{lastScan.employeeName}</Text>
                <Text style={styles.overlayType}>
                  {getPointageLabel(lastScan.type)}
                </Text>
                {lastScan.scanType && (
                  <Text style={styles.overlayScanType}>
                    {lastScan.scanType}
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
  qrBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  qrActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
  },
  qrInactive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  qrBadgeIcon: {
    fontSize: 14,
  },
  qrBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  qrTextActive: {
    color: '#22c55e',
  },
  qrTextInactive: {
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

  // ===== QR CAMERA ZONE =====
  qrZone: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#334155',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 200,
    height: 200,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#667eea',
    borderWidth: 3,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 8,
  },
  cameraLabel: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  cameraLabelText: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  cameraPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  placeholderIcon: {
    fontSize: 80,
    marginBottom: 20,
  },
  placeholderTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#e2e8f0',
    textAlign: 'center',
    marginBottom: 16,
  },
  permissionBtn: {
    backgroundColor: '#667eea',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  permissionBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  scanningIndicator: {
    position: 'absolute',
    top: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  scanningText: {
    backgroundColor: 'rgba(99, 102, 241, 0.9)',
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
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
  overlayScanType: {
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
});
