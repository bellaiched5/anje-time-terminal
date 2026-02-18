/**
 * Service API pour la tablette terminal AnjeTime
 * Communique avec le backend pour le pointage via badge/NFC/code
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
   * Scanner un badge (code, NFC UID, ou HCE ID)
   * @param {string} qrData - Le code ou ID NFC scanné
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
   * Valider la clé API du terminal
   * On fait un scan test pour vérifier que la clé est valide
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

  /**
   * Récupérer la liste des employés pour l'affiliation NFC
   */
  async getEmployeesForAffiliation() {
    try {
      const response = await fetch(`${this.apiUrl}/badge/employees-for-affiliation`, {
        headers: this.getHeaders(),
      });
      const data = await response.json();
      return data.success ? data.employees : [];
    } catch (error) {
      console.error('Erreur chargement employés:', error);
      return [];
    }
  }

  /**
   * Affilier un badge NFC à un employé
   * @param {string} nfcId - L'ID NFC du badge/smartphone
   * @param {number} employeeId - L'ID de l'employé
   */
  async affiliateNfc(nfcId, employeeId) {
    try {
      const response = await fetch(`${this.apiUrl}/badge/affiliate-nfc`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ nfcId, employeeId }),
      });
      return await response.json();
    } catch (error) {
      console.error('Erreur affiliation:', error);
      return { success: false, error: 'Erreur de connexion' };
    }
  }

  /**
   * Envoyer la photo du pointage
   */
  async savePhoto(pointageId, employeeId, photoBase64) {
    try {
      await fetch(`${this.apiUrl}/pointages/photo`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          pointage_id: pointageId,
          employee_id: employeeId,
          photo_base64: photoBase64,
          source: 'terminal_nfc',
        }),
      });
    } catch (error) {
      console.error('Erreur sauvegarde photo:', error);
    }
  }
}

export const terminalAPI = new TerminalAPI();
export default terminalAPI;
