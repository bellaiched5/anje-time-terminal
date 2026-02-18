/**
 * Service NFC natif pour la tablette terminal AnjeTime
 * 
 * Utilise react-native-nfc-manager pour lire :
 * 1. Badges NFC physiques (lecture UID + NDEF)
 * 2. Smartphones Android (HCE - Host Card Emulation via NDEF)
 * 3. iPhones Apple Wallet (ISO-DEP / passes NFC)
 * 
 * La tablette est toujours en mode LECTEUR (reader), jamais émetteur.
 */

import NfcManager, { NfcTech, Ndef, NfcEvents } from 'react-native-nfc-manager';

// AID personnalisé AnjeTime (doit correspondre à apduservice.xml de l'app mobile)
const ANJE_TIME_AID = 'F0414E4A4554494D45';

// Commandes APDU
const SELECT_AID_APDU = [
  0x00, 0xa4, 0x04, 0x00, // SELECT command
  ANJE_TIME_AID.length / 2, // Length of AID
  ...hexToBytes(ANJE_TIME_AID),
  0x00, // Le
];

const READ_DATA_APDU = [
  0x00, 0xb0, 0x00, 0x00, // READ BINARY
  0x00, // Le (read all)
];

/**
 * Convertir une string hex en tableau de bytes
 */
function hexToBytes(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }
  return bytes;
}

/**
 * Convertir un tableau de bytes en string hex
 */
function bytesToHex(bytes) {
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * Convertir un tableau de bytes en string UTF-8
 */
function bytesToString(bytes) {
  return String.fromCharCode(...bytes);
}

class NfcService {
  constructor() {
    this.isSupported = false;
    this.isListening = false;
    this.onTagCallback = null;
    this._scanLoop = null;
  }

  /**
   * Initialiser le NFC Manager
   */
  async init() {
    try {
      const supported = await NfcManager.isSupported();
      this.isSupported = supported;

      if (supported) {
        await NfcManager.start();
        console.log('✅ NFC Manager initialisé');
      } else {
        console.log('❌ NFC non supporté sur cet appareil');
      }

      return supported;
    } catch (error) {
      console.error('Erreur init NFC:', error);
      this.isSupported = false;
      return false;
    }
  }

  /**
   * Démarrer l'écoute continue des tags NFC
   * La tablette doit scanner en boucle en permanence
   * 
   * @param {Function} onTag - Callback appelé quand un tag est détecté
   *   Reçoit { type, id, data } :
   *   - type: 'nfc_badge' | 'hce_android' | 'apple_wallet' | 'ndef_generic'
   *   - id: identifiant du badge (UID, HCE ID, etc.)
   *   - data: données brutes supplémentaires
   */
  async startListening(onTag) {
    if (!this.isSupported) {
      console.log('NFC non supporté');
      return false;
    }

    this.onTagCallback = onTag;
    this.isListening = true;
    
    console.log('🔄 Démarrage écoute NFC continue...');
    this._continuousRead();
    return true;
  }

  /**
   * Boucle de lecture NFC continue
   * Essaie de lire un tag, traite le résultat, puis recommence
   */
  async _continuousRead() {
    while (this.isListening) {
      try {
        // Tenter d'abord une lecture NDEF (badges physiques, HCE Android)
        const result = await this._readTag();
        
        if (result && this.onTagCallback) {
          this.onTagCallback(result);
        }
      } catch (error) {
        // Erreur normale si pas de tag présent ou tag retiré trop vite
        if (!error.message?.includes('cancelled')) {
          console.log('NFC read cycle:', error.message);
        }
      }

      // Toujours cleanup avant de recommencer
      try {
        await NfcManager.cancelTechnologyRequest();
      } catch (e) {
        // Ignore
      }

      // Petit délai avant de recommencer (éviter 100% CPU)
      if (this.isListening) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
  }

  /**
   * Lire un tag NFC (une tentative)
   * Essaie dans l'ordre :
   * 1. IsoDep (Apple Wallet, cartes ISO 14443-4)
   * 2. NDEF (badges NFC, HCE Android)
   * 3. UID seul (fallback pour toutes cartes)
   */
  async _readTag() {
    // === Étape 1 : Essayer IsoDep d'abord (Apple Wallet + HCE) ===
    try {
      await NfcManager.requestTechnology([NfcTech.IsoDep], {
        alertMessage: '',
      });

      const tag = await NfcManager.getTag();
      const tagId = tag?.id ? tag.id.toUpperCase() : null;

      // Essayer de sélectionner l'AID AnjeTime (pour HCE Android)
      try {
        const selectResponse = await NfcManager.isoDepHandler.transceive(SELECT_AID_APDU);
        
        // Vérifier le status word (les 2 derniers bytes doivent être 90 00 = succès)
        if (selectResponse && selectResponse.length >= 2) {
          const sw1 = selectResponse[selectResponse.length - 2];
          const sw2 = selectResponse[selectResponse.length - 1];

          if (sw1 === 0x90 && sw2 === 0x00) {
            // AID sélectionné avec succès - c'est notre app HCE Android
            // Lire les données (ID employé)
            const readResponse = await NfcManager.isoDepHandler.transceive(READ_DATA_APDU);
            
            if (readResponse && readResponse.length > 2) {
              const dataSw1 = readResponse[readResponse.length - 2];
              const dataSw2 = readResponse[readResponse.length - 1];
              
              if (dataSw1 === 0x90 && dataSw2 === 0x00) {
                const dataBytes = readResponse.slice(0, -2);
                const hceId = bytesToString(dataBytes).trim();
                
                // HCE ID valide = 10 chiffres (CCCCEEEEEE)
                if (/^\d{10}$/.test(hceId)) {
                  return {
                    type: 'hce_android',
                    id: `HCE:${hceId}`,
                    displayId: hceId,
                    rawId: tagId,
                  };
                }
              }
            }
          }
        }
      } catch (apduError) {
        // L'AID AnjeTime n'est pas supporté par ce device
        // C'est peut-être un Apple Wallet pass ou une carte ISO standard
        console.log('Pas un HCE AnjeTime, essai Apple Wallet/ISO...');
      }

      // === Essayer de lire un Apple Wallet NFC pass ===
      // Les passes Apple Wallet avec NFC transmettent un payload
      // quand présentés à un lecteur NFC via ISO-DEP
      try {
        // Essayer de lire les données NDEF via IsoDep
        // Apple Wallet NFC passes répondent aux commandes NDEF standard
        const ndefSelectApdu = [0x00, 0xa4, 0x04, 0x00, 0x07, 0xd2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x01, 0x00];
        const ndefResponse = await NfcManager.isoDepHandler.transceive(ndefSelectApdu);
        
        if (ndefResponse && ndefResponse.length >= 2) {
          const sw1 = ndefResponse[ndefResponse.length - 2];
          const sw2 = ndefResponse[ndefResponse.length - 1];
          
          if (sw1 === 0x90 && sw2 === 0x00) {
            // Sélectionner le fichier CC (Capability Container)
            const selectCc = [0x00, 0xa4, 0x00, 0x0c, 0x02, 0xe1, 0x03];
            await NfcManager.isoDepHandler.transceive(selectCc);
            
            // Sélectionner le fichier NDEF
            const selectNdef = [0x00, 0xa4, 0x00, 0x0c, 0x02, 0xe1, 0x04];
            await NfcManager.isoDepHandler.transceive(selectNdef);
            
            // Lire le contenu NDEF
            const readNdef = [0x00, 0xb0, 0x00, 0x00, 0x00];
            const ndefData = await NfcManager.isoDepHandler.transceive(readNdef);
            
            if (ndefData && ndefData.length > 4) {
              const dataBytes = ndefData.slice(2, -2); // Skip length prefix and SW
              const text = bytesToString(dataBytes).trim();
              
              // Vérifier si c'est un ID employé AnjeTime (10 chiffres)
              if (/^\d{10}$/.test(text)) {
                return {
                  type: 'apple_wallet',
                  id: `HCE:${text}`,
                  displayId: text,
                  rawId: tagId,
                };
              }
              
              // Autre contenu NDEF texte
              if (text.length > 0) {
                return {
                  type: 'apple_wallet',
                  id: text,
                  displayId: text,
                  rawId: tagId,
                };
              }
            }
          }
        }
      } catch (walletError) {
        // Pas un pass NFC Wallet, utiliser l'UID
        console.log('Pas un Apple Wallet NDEF, fallback UID');
      }

      // Fallback : utiliser l'UID de la carte ISO-DEP
      if (tagId) {
        return {
          type: 'nfc_badge',
          id: `NFC:${tagId}`,
          displayId: tagId,
          rawId: tagId,
        };
      }
    } catch (isoError) {
      // IsoDep non supporté par ce tag, essayer NDEF classique
    }

    // Cleanup avant d'essayer NDEF
    try {
      await NfcManager.cancelTechnologyRequest();
    } catch (e) {}

    // === Étape 2 : Essayer NDEF standard ===
    try {
      await NfcManager.requestTechnology([NfcTech.Ndef], {
        alertMessage: '',
      });

      const tag = await NfcManager.getTag();
      const tagId = tag?.id ? tag.id.toUpperCase() : null;

      // Lire les records NDEF
      if (tag?.ndefMessage && tag.ndefMessage.length > 0) {
        for (const record of tag.ndefMessage) {
          if (record.tnf === Ndef.TNF_WELL_KNOWN && record.type) {
            try {
              const text = Ndef.text.decodePayload(new Uint8Array(record.payload));
              
              // HCE ID (10 chiffres)
              if (/^\d{10}$/.test(text)) {
                return {
                  type: 'hce_android',
                  id: `HCE:${text}`,
                  displayId: text,
                  rawId: tagId,
                };
              }
              
              // Code numérique standard (4-8 chiffres)
              if (/^\d{4,8}$/.test(text)) {
                return {
                  type: 'ndef_generic',
                  id: text,
                  displayId: text,
                  rawId: tagId,
                };
              }
            } catch (e) {}
          }
        }
      }

      // Fallback : UID seul
      if (tagId) {
        return {
          type: 'nfc_badge',
          id: `NFC:${tagId}`,
          displayId: tagId,
          rawId: tagId,
        };
      }
    } catch (ndefError) {
      // Aucune technologie ne fonctionne
    }

    return null;
  }

  /**
   * Arrêter l'écoute NFC
   */
  async stopListening() {
    this.isListening = false;
    this.onTagCallback = null;

    try {
      await NfcManager.cancelTechnologyRequest();
    } catch (e) {}

    console.log('⏹ Écoute NFC arrêtée');
  }

  /**
   * Nettoyer les ressources NFC
   */
  async cleanup() {
    await this.stopListening();
    // NfcManager n'a pas besoin d'être explicitement arrêté
  }
}

export const nfcService = new NfcService();
export default nfcService;
