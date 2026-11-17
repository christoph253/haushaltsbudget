// Gemeinsamer Zustand der Oberfläche.
export const K = {
  daten: null,          // Daten-Instanz
  einst: null,          // zuletzt gelesene Einstellungen
  neuZeichnen: () => {}, // aktuelle Seite neu aufbauen
  async ladeEinst() { this.einst = await this.daten.einstellungen(); return this.einst; },
};
