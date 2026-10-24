; Désinstallation : retire aussi l'ouverture au démarrage de Windows (option de l'installateur Meow Watch).
!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Meow Watch"
!macroend
