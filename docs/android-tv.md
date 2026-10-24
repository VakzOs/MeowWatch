# Installer Meow Watch sur Android TV ou un téléphone Android

Il faut Android 8 ou plus récent. Le même fichier marche sur la télé et sur le téléphone.

## Sur un téléphone

1. Ouvre **meowwatch.vkzdev.com/tv.apk** dans le navigateur du téléphone. Le fichier se télécharge.
2. Ouvre-le depuis les téléchargements. Android demande d'autoriser l'installation depuis le navigateur : accepte, puis touche **Installer**.
3. Lance Meow Watch. Un code et un QR code s'affichent : scanne le QR code (ou va sur meowwatch.vkzdev.com/tv et tape le code) depuis un appareil déjà connecté.

## Sur une télé Android TV / Google TV

1. Sur la télé, installe l'appli **Downloader** (de AFTVnews) depuis le Play Store.
2. Dans les paramètres de la télé : *Appareil* > *Sécurité* (ou *Applis* > *Accès spécial*) > *Sources inconnues* : autorise **Downloader**.
   Sur Google TV, il faut d'abord activer les options pour les développeurs (*Paramètres* > *Système* > *À propos* > appuyer 7 fois sur *Build de l'OS Android TV*).
3. Dans Downloader, tape **meowwatch.vkzdev.com/tv.apk** puis **Go**. Une fois téléchargé, choisis **Installer**.
4. Meow Watch apparaît dans les applis de la télé. Connecte-toi avec le code ou le QR code comme sur le téléphone.

## Mettre à jour

Refais la même installation : la nouvelle version remplace l'ancienne, la connexion et les profils restent.

## Publier une nouvelle version (Vakz)

Pousse une étiquette `android-vX.Y.Z` : GitHub Actions construit l'APK et le publie dans une Release.
L'adresse `/tv.apk` du site pointe toujours vers la dernière.

L'APK est signé avec une clé de débogage commune tant que les secrets `ANDROID_KEYSTORE` (fichier .jks en base64) et
`ANDROID_KEYSTORE_PASSWORD` ne sont pas définis dans les réglages du dépôt (alias de la clé : `meowwatch`). Passer à une
clé à soi change la signature : il faudra désinstaller une fois l'ancienne version.
