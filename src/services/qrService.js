/**
 * Service QR Code pour la tablette terminal AnjeTime
 *
 * Remplace le service NFC par la lecture de QR codes via caméra.
 * Format QR attendu : QR:CCCCEEEEEE (4 digits companyId + 6 digits employeeId)
 *
 * La tablette utilise la caméra pour scanner les QR codes
 * affichés sur les smartphones des employés (PWA badge ou app mobile).
 */

const QR_PREFIX = 'QR:';

class QrService {
  constructor() {
    this.isReady = false;
    this.onScanCallback = null;
    this.lastScan = { data: null, time: 0 };
    this.cooldownMs = 3000; // Anti-doublon 3 secondes
  }

  /**
   * Initialiser le service QR
   * (Toujours prêt - la caméra est gérée par le composant React)
   */
  async init() {
    this.isReady = true;
    console.log('✅ QR Scanner service initialisé');
    return true;
  }

  /**
   * Traiter un QR code scanné
   * @param {string} rawData - Données brutes du QR code
   * @returns {Object|null} Résultat parsé ou null si doublon/invalide
   */
  processScannedData(rawData) {
    if (!rawData) return null;

    const data = rawData.trim();
    const now = Date.now();

    // Anti-doublon
    if (
      this.lastScan.data === data &&
      now - this.lastScan.time < this.cooldownMs
    ) {
      return null;
    }
    this.lastScan = { data, time: now };

    // Format QR:CCCCEEEEEE (depuis PWA badge ou app mobile)
    if (data.startsWith(QR_PREFIX)) {
      const payload = data.substring(QR_PREFIX.length);
      if (/^\d{10}$/.test(payload)) {
        return {
          type: 'qr_badge',
          id: data, // Envoyer le format complet QR:CCCCEEEEEE
          displayId: payload,
          companyId: payload.substring(0, 4),
          employeeId: payload.substring(4),
        };
      }
    }

    // Code numérique simple (6 chiffres - code auto-généré)
    if (/^\d{6}$/.test(data)) {
      return {
        type: 'qr_code',
        id: data,
        displayId: data,
      };
    }

    // Code numérique 4-8 chiffres
    if (/^\d{4,10}$/.test(data)) {
      return {
        type: 'qr_code',
        id: data,
        displayId: data,
      };
    }

    // Autre format - essayer quand même
    return {
      type: 'qr_unknown',
      id: data,
      displayId: data.substring(0, 20),
    };
  }

  /**
   * Réinitialiser le cooldown (pour permettre un nouveau scan)
   */
  resetCooldown() {
    this.lastScan = { data: null, time: 0 };
  }

  /**
   * Nettoyer les ressources
   */
  async cleanup() {
    this.isReady = false;
    this.onScanCallback = null;
    console.log('ℹ QR Scanner service arrêté');
  }
}

export const qrService = new QrService();
export default qrService;
