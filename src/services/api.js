/**
 * Service API pour la tablette terminal AnjeTime
 * Communique avec le backend pour le pointage via QR code / code clavier
 */

const DEFAULT_API_URL = 'https://api.anjetime.com/api';

class TerminalAPI {
  constructor() {
    this.apiUrl = DEFAULT_API_URL;
    this.terminalKey = null;
  }

  setApiUrl(url) {
    this.apiUrl = url.replace(/\/$/, '');
  }

  setTerminalKey(key) {
    this.terminalKey = key;
  }

  getHeaders() {
    return {
      'Content-Type': 'application/json',
      ...(this.terminalKey ? { 'X-Terminal-Key': this.terminalKey } : {}),
    };
  }

  /**
   * Scanner un badge (QR code ou code clavier)
   * @param {string} qrData - Le QR code scanné ou le code tapé
   * @returns {Promise<Object>} Résultat du pointage
   */
  async scan(qrData) {
    try {
      const response = await fetch(`${this.apiUrl}/badge/scan`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ qrData }),
      });
      return await response.json();
    } catch (error) {
      console.error('Erreur scan:', error);
      return { success: false, error: 'Erreur de connexion au serveur' };
    }
  }

  /**
   * Envoyer la photo de vérification après un pointage par code
   * @param {number} employeeId - L'ID de l'employé
   * @param {number} pointageId - L'ID du pointage
   * @param {string} photoBase64 - La photo en base64
   */
  async uploadPhoto(employeeId, pointageId, photoBase64) {
    try {
      const response = await fetch(`${this.apiUrl}/pointages/photo`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          employee_id: employeeId,
          pointage_id: pointageId,
          photo_base64: `data:image/jpeg;base64,${photoBase64}`,
          source: 'terminal_code',
        }),
      });
      const data = await response.json();
      console.log('📸 Photo uploadée:', data.success ? 'OK' : 'ERREUR');
      return data;
    } catch (error) {
      console.log('📸 Upload photo échoué (non-bloquant):', error.message);
      return { success: false };
    }
  }

  /**
   * Valider la clé API du terminal
   */
  async validateKey(key) {
    try {
      const response = await fetch(`${this.apiUrl}/badge/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Terminal-Key': key,
        },
        body: JSON.stringify({ qrData: 'test-validation' }),
      });
      const data = await response.json();
      // Si la clé est invalide, l'API retourne une erreur spécifique
      return data.error !== 'Clé API terminal invalide';
    } catch (error) {
      console.error('Erreur validation clé:', error);
      return false;
    }
  }
}

export const terminalAPI = new TerminalAPI();
export default terminalAPI;
