/* Einstellungen der App. Eigene Werte (z. B. den Last.fm-Schlüssel) NICHT hier eintragen,
   sondern in web/config.local.js; diese Datei ist nicht im Repository (.gitignore). */
window.APP_CONFIG = {
  LANGUAGE: '',       /* Sprache der Oberfläche, z. B. 'de' oder 'en'; leer = wie in Volumio eingestellt (sonst Gerätesprache, sonst Englisch) */
  LANGUAGES: ['de', 'en'],  /* vorhandene Sprachdateien in web/lang/; eine neue Sprache (z. B. fr.js) hier ergänzen */
  THEME: 'auto',      /* 'auto' = hell oder dunkel wie das Gerät; 'light' = immer hell; 'dark' = immer dunkel (Bühnenansicht bleibt dunkel) */
  LASTFM_KEY: '',     /* leer = keine ähnlichen Künstler; auch für Künstler-/Albumtexte, wenn Volumio keine liefert */
  LASTFM_SECRET: '',  /* "Shared secret" zum Schlüssel: nur nötig zum Scrobbeln (Verlauf) */
  HISTORY: true,      /* Verlauf: Tag-Dienst schreibt gespielte Titel mit; false = aus (Tag-Dienst neu starten) */
  MOODTAGS: true,     /* Stimmungs-Tags: Last.fm-Tags je Titel sammeln, nur wenn nichts spielt (braucht LASTFM_KEY); false = aus */
  COLOR_MOOD: true,   /* Farbstimmung aus dem Cover (nur Cover vom Player selbst); false = aus */
  M4A_PROBE: true,    /* m4a: Codec (ALAC/AAC) aus der Datei lesen; false = nur M4A_LOSSLESS */
  M4A_LOSSLESS: true, /* m4a als verlustfrei (ALAC) einstufen; false = kein Abzeichen für m4a (AAC wäre sonst falsch eingestuft) */
  TAGS_PORT: 8766,    /* Port des Tag-Dienstes (Tag-Editor) auf dem Player */
  ROTEL: false,       /* Rotel-Verstärker über rotel/rotel-bridge.js: Ein/Aus oben links, Lautstärke am Verstärker.
                         false = Lautstärke von Volumio (falls dort eingeschaltet), kein Ein/Aus-Knopf */
  ROTEL_HOST: '',     /* Adresse des Verstärkers im Netz (liest nur rotel-bridge.js), z. B. '192.168.1.50' */
  ROTEL_AMP_PORT: 9590, /* Port des Verstärkers (ASCII-Protokoll) */
  ROTEL_PORT: 8765,   /* Port des Rotel-Dienstes auf dem Player */
  TIDAL: 'auto',      /* TIDAL-Teile (Auswahl Lokal/TIDAL in der Suche, ähnliche Künstler bei TIDAL):
                         'auto' = nur, wenn das TIDAL-Plugin in Volumio aktiv ist; true = immer; false = nie */
  QOBUZ: 'auto',      /* Qobuz genauso wie TIDAL (Auswahl in der Suche, ähnliche Künstler bei Qobuz):
                         'auto' = nur, wenn das Qobuz-Plugin in Volumio aktiv ist; true = immer; false = nie */
  HRA: 'auto',        /* HIGHRESAUDIO genauso (Plugin "hra"); 'auto' / true / false wie oben */
  SPOTIFY: 'auto',    /* Spotify genauso (Volumios Spotify-Plugin mit Suche, braucht Premium); 'auto' / true / false wie oben */
  ROTEL_CMD_POWER_ON:  'power_on',    /* Befehlsnamen für /cmd?c=... des Rotel-Dienstes */
  ROTEL_CMD_POWER_OFF: 'power_off'
};
