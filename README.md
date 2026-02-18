# Anje Time Terminal

Application native Android pour tablette - Lecteur NFC / pointage employés.

## Fonctionnalités

- 📶 **NFC natif** : Lecture de badges NFC physiques (MIFARE, NTAG, etc.)
- 📱 **Android HCE** : Lecture des smartphones Android avec l'app Anje Time
- 🍎 **Apple Wallet** : Lecture des passes NFC iPhone via ISO-DEP
- ⌨️ **Code clavier** : Saisie du code fixe ou code auto
- 🔄 **Affiliation** : Association d'un badge NFC à un employé directement sur la tablette
- 📷 **Photo** : Capture photo au pointage (à venir)

## Installation

```bash
npm install
```

## Développement

```bash
npx expo start --dev-client
```

> **Note** : Cette app nécessite un build natif (`expo-dev-client`) car elle utilise `react-native-nfc-manager` qui n'est pas compatible Expo Go.

## Build APK (test)

```bash
eas build -p android --profile preview
```

## Build AAB (production)

```bash
eas build -p android --profile production
```

## Architecture

```
terminal-app/
├── App.js                       # Point d'entrée, gestion config/scan
├── src/
│   ├── screens/
│   │   ├── ConfigScreen.js      # Configuration clé API terminal
│   │   └── ScannerScreen.js     # Écran principal scanner
│   └── services/
│       ├── api.js               # API backend (badge scan, affiliation)
│       └── nfcService.js        # Service NFC natif (lecture tags)
├── app.json                     # Config Expo (NFC plugin, permissions)
├── eas.json                     # Config EAS Build
└── package.json
```

## Tablette recommandée

**Hosoton Android 14 NFC frontale** (ou similaire) :
- Android 14+ avec GMS
- NFC frontale intégré
- 6GB RAM / 64GB stockage
- Batterie 8000mAh
- Orientation paysage

## Configuration

1. Installez l'APK sur la tablette
2. Lancez l'app
3. Entrez la clé API (depuis Paramètres > Badgeuse sur anjetime.com)
4. L'app passe en mode scanner permanent
