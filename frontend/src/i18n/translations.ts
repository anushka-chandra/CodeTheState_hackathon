/**
 * UI translations for PLANRAUM. Keys are dot-namespaced; each maps to one string
 * per language. Use `t(key, params)` (see I18nContext) with `{token}` slots for
 * interpolation. Domain terms that are the same in both languages (Bebauungsplan,
 * Satteldach, GRZ, …) are intentionally left untranslated.
 */

export type Lang = 'en' | 'de'

export const LANGS: Lang[] = ['en', 'de']

type Entry = Record<Lang, string>

export const TRANSLATIONS: Record<string, Entry> = {
  // ── Title block ──────────────────────────────────────────────────────────
  'app.tagline': {
    en: 'AI Bebauungsplan Reader & 3D Compliance Viewer',
    de: 'KI-Bebauungsplan-Reader & 3D-Konformitätsansicht',
  },
  'title.sheet': { en: 'Sheet', de: 'Blatt' },
  'title.standard': { en: 'Standard', de: 'Norm' },
  'title.crs': { en: 'CRS', de: 'CRS' },
  'title.status': { en: 'Status', de: 'Status' },
  'title.statusValue': { en: 'DRAFT', de: 'ENTWURF' },
  'lang.label': { en: 'Language', de: 'Sprache' },

  // ── Stepper ──────────────────────────────────────────────────────────────
  'step.upload': { en: 'Upload', de: 'Hochladen' },
  'step.extract': { en: 'Extract', de: 'Auslesen' },
  'step.review': { en: 'Review', de: 'Prüfen' },
  'step.compliance': { en: '3D & Compliance', de: '3D & Konformität' },
  'step.complete': { en: 'complete', de: 'fertig' },
  'step.inProgress': { en: 'in progress', de: 'läuft' },
  'step.pending': { en: 'pending', de: 'offen' },

  // ── Upload screen ────────────────────────────────────────────────────────
  'upload.eyebrow': {
    en: 'Step 01 — Upload Bebauungsplan',
    de: 'Schritt 01 — Bebauungsplan hochladen',
  },
  'upload.title': { en: 'Add a plan to read', de: 'Plan zum Auslesen hinzufügen' },
  'upload.dropTitle': { en: 'Drop plan here', de: 'Plan hier ablegen' },
  'upload.dropHint': {
    en: 'or click to browse · PDF, PNG, JPG, TIFF',
    de: 'oder klicken zum Auswählen · PDF, PNG, JPG, TIFF',
  },
  'upload.dropAria': {
    en: 'Drop a plan file here or click to browse',
    de: 'Plandatei hier ablegen oder zum Auswählen klicken',
  },
  'upload.staged': { en: 'Staged document', de: 'Bereitgestelltes Dokument' },
  'upload.readyToRead': { en: 'Ready to read', de: 'Bereit zum Auslesen' },
  'upload.nothingStaged': { en: 'Nothing staged', de: 'Nichts bereitgestellt' },
  'upload.previewHere': {
    en: 'Your uploaded plan will preview here.',
    de: 'Ihr hochgeladener Plan erscheint hier als Vorschau.',
  },
  'upload.rendering': { en: 'rendering…', de: 'rendert…' },
  'upload.metaFilename': { en: 'Filename', de: 'Dateiname' },
  'upload.metaSize': { en: 'Size', de: 'Größe' },
  'upload.metaPlanNo': { en: 'Plan no.', de: 'Plan-Nr.' },
  'upload.metaType': { en: 'Type', de: 'Typ' },
  'upload.notDetected': { en: 'not detected', de: 'nicht erkannt' },
  'upload.remove': { en: 'Remove', de: 'Entfernen' },
  'upload.readThis': { en: 'Read this plan', de: 'Diesen Plan auslesen' },
  'upload.unsupported': {
    en: '"{name}" isn\'t a supported plan. Use a PDF, PNG, JPG or TIFF export.',
    de: '"{name}" ist kein unterstützter Plan. Bitte PDF-, PNG-, JPG- oder TIFF-Export verwenden.',
  },
  'upload.previewAlt': { en: 'Preview of {name}', de: 'Vorschau von {name}' },

  // ── Extract screen ───────────────────────────────────────────────────────
  'extract.eyebrow': { en: 'Step 02 — Extraction', de: 'Schritt 02 — Auslesen' },
  'extract.reading': { en: 'AI is reading the plan', de: 'Die KI liest den Plan' },
  'extract.complete': {
    en: 'Plan read complete',
    de: 'Plan vollständig ausgelesen',
  },
  'extract.stalled': { en: 'Extraction stalled', de: 'Auslesen unterbrochen' },
  'extract.failBody': {
    en: "Couldn't read the document — try a clearer PDF export instead of a scan, or check that the extraction service is running.",
    de: 'Dokument konnte nicht gelesen werden — versuchen Sie einen klareren PDF-Export statt eines Scans oder prüfen Sie, ob der Extraktionsdienst läuft.',
  },
  'extract.backToUpload': { en: 'Back to upload', de: 'Zurück zum Upload' },
  'extract.stageDone': { en: 'done', de: 'fertig' },
  'extract.stageReading': { en: 'reading…', de: 'liest…' },
  'extract.stageQueued': { en: 'queued', de: 'in Warteschlange' },
  'extract.footPre': {
    en: 'Powered by ',
    de: 'Verarbeitet durch ',
  },
  'extract.footPost': { en: ' · vision extraction.', de: ' · Vision-Extraktion.' },

  // Extraction stage labels (by stage key)
  'stage.reading': { en: 'Reading document', de: 'Dokument wird gelesen' },
  'stage.locating': {
    en: 'Locating Nutzungsschablone',
    de: 'Nutzungsschablone wird lokalisiert',
  },
  'stage.extracting': {
    en: 'Extracting constraints',
    de: 'Vorgaben werden extrahiert',
  },
  'stage.geocoding': { en: 'Geocoding plan area', de: 'Plangebiet wird geokodiert' },
  'stage.building': { en: 'Building 3D candidate', de: '3D-Entwurf wird erstellt' },

  // ── Review screen ────────────────────────────────────────────────────────
  'review.source': { en: 'Source document', de: 'Quelldokument' },
  'review.noPreview': {
    en: 'No page preview for this upload — constraints are still editable on the right.',
    de: 'Keine Seitenvorschau für diesen Upload — die Vorgaben sind rechts weiterhin bearbeitbar.',
  },
  'review.pageWord': { en: 'page', de: 'Seite' },
  'review.humanLoop': {
    en: 'Human-in-the-loop · verify constraints',
    de: 'Mensch in der Schleife · Vorgaben prüfen',
  },
  'review.extracted': { en: 'Extracted constraints', de: 'Extrahierte Vorgaben' },
  'review.colParameter': { en: 'Parameter', de: 'Parameter' },
  'review.colValue': {
    en: 'Value · Confidence · Confirm',
    de: 'Wert · Konfidenz · Bestätigen',
  },
  'review.noLow': {
    en: 'No low-confidence values flagged.',
    de: 'Keine Werte mit geringer Konfidenz markiert.',
  },
  'review.allResolved': {
    en: '✓ All {n} low-confidence values resolved.',
    de: '✓ Alle {n} Werte mit geringer Konfidenz geklärt.',
  },
  'review.needReviewOne': {
    en: '{n} low-confidence value needs review — edit or confirm.',
    de: '{n} Wert mit geringer Konfidenz muss geprüft werden — bearbeiten oder bestätigen.',
  },
  'review.needReviewMany': {
    en: '{n} low-confidence values need review — edit or confirm.',
    de: '{n} Werte mit geringer Konfidenz müssen geprüft werden — bearbeiten oder bestätigen.',
  },
  'review.confirmContinue': {
    en: 'Confirm all & continue',
    de: 'Alle bestätigen & weiter',
  },
  'review.locateTitle': { en: 'Locate on plan', de: 'Im Plan lokalisieren' },
  'review.confirmedTitle': {
    en: 'Confirmed by reviewer',
    de: 'Vom Prüfer bestätigt',
  },
  'review.markConfirmed': {
    en: 'Mark as confirmed',
    de: 'Als bestätigt markieren',
  },
  'review.zonePick': {
    en: 'Multiple zones found — pick one to review',
    de: 'Mehrere Zonen gefunden — eine zum Prüfen wählen',
  },
  'review.zone': { en: 'Zone', de: 'Zone' },

  // ── Plan viewer (source-region pane) ─────────────────────────────────────
  'planViewer.regionsOne': {
    en: '{n} source region · click a value to locate',
    de: '{n} Quellbereich · Wert anklicken zum Lokalisieren',
  },
  'planViewer.regionsMany': {
    en: '{n} source regions · click a value to locate',
    de: '{n} Quellbereiche · Wert anklicken zum Lokalisieren',
  },
  'planViewer.reset': { en: 'Reset', de: 'Zurücksetzen' },
  'planViewer.zoomIn': { en: 'Zoom in', de: 'Vergrößern' },
  'planViewer.zoomOut': { en: 'Zoom out', de: 'Verkleinern' },

  // ── Compliance screen ────────────────────────────────────────────────────
  'compliance.view': { en: '3D compliance view', de: '3D-Konformitätsansicht' },
  'compliance.legendProposed': { en: 'Proposed', de: 'Geplant' },
  'compliance.legendExisting': { en: 'Existing', de: 'Bestand' },
  'compliance.centroidWord': { en: 'centroid', de: 'Schwerpunkt' },
  'compliance.sourceWord': { en: 'source', de: 'Quelle' },
  'compliance.report': { en: 'Compliance report', de: 'Konformitätsbericht' },
  'compliance.baunvo': { en: 'BauNVO check', de: 'BauNVO-Prüfung' },
  'compliance.export': { en: 'Export report', de: 'Bericht exportieren' },
  'compliance.exportGeoJSON': { en: 'GeoJSON (QGIS)', de: 'GeoJSON (QGIS)' },
  'compliance.exportCityGML': { en: 'CityGML LOD2', de: 'CityGML LOD2' },
  'compliance.exportPDF': { en: 'Print / PDF', de: 'Drucken / PDF' },
  'compliance.violated': {
    en: '{fail} of {total} constraints violated',
    de: '{fail} von {total} Vorgaben verletzt',
  },
  'compliance.needReviewOne': {
    en: '{n} constraint needs review',
    de: '{n} Vorgabe muss geprüft werden',
  },
  'compliance.needReviewMany': {
    en: '{n} constraints need review',
    de: '{n} Vorgaben müssen geprüft werden',
  },
  'compliance.allSatisfied': {
    en: 'All constraints satisfied',
    de: 'Alle Vorgaben erfüllt',
  },
  'compliance.allowed': { en: 'Allowed', de: 'Zulässig' },
  'compliance.proposed': { en: 'Proposed', de: 'Geplant' },
  'compliance.editHint': {
    en: 'Edit any proposed value to re-check instantly. The 3D candidate updates live with height and roof type.',
    de: 'Ändern Sie einen geplanten Wert für eine sofortige Neuprüfung. Der 3D-Entwurf aktualisiert sich live mit Höhe und Dachform.',
  },
  'compliance.zoneLabel': { en: 'Zone', de: 'Zone' },
  'compliance.parcelArea': { en: 'Cadastral parcel: {area} m\u00B2', de: 'Flurst\u00FCck: {area} m\u00B2' },
  'compliance.referenceTitle': { en: 'Reference LOD2', de: 'Referenz LOD2' },
  'compliance.refHeight': { en: 'Reference height', de: 'Referenzh\u00F6he' },
  'compliance.refArea': { en: 'Reference area', de: 'Referenzfl\u00E4che' },
  'compliance.refRoof': { en: 'Roof type match', de: 'Dachform-Abgleich' },
  'compliance.deltaClose': { en: 'Matching', de: '\u00DCbereinstimmend' },
  'compliance.deltaOff': { en: 'Deviation {delta}', de: 'Abweichung {delta}' },
  'compliance.exportCityJSON': { en: 'CityJSON 2.0', de: 'CityJSON 2.0' },
  'compliance.noParcel': { en: 'No parcel found', de: 'Kein Flurst\u00FCck gefunden' },
  'compliance.noReference': { en: 'No reference building', de: 'Kein Referenzgeb\u00E4ude' },
  'compliance.legendSpot': { en: 'Available site', de: 'Verf\u00FCgbarer Standort' },
  'compliance.spotWord': { en: 'Selected site', de: 'Gew\u00E4hlter Standort' },
  'compliance.resetSpot': { en: 'Reset', de: 'Zur\u00FCcksetzen' },
  'compliance.spotHint': {
    en: 'Select a green spot on the map to place your building and check compliance against the extracted constraints.',
    de: 'W\u00E4hlen Sie einen gr\u00FCnen Punkt auf der Karte, um Ihr Geb\u00E4ude zu platzieren und die Konformit\u00E4t mit den extrahierten Vorgaben zu pr\u00FCfen.',
  },

  // ── Confidence chip ──────────────────────────────────────────────────────
  'confidence.high': { en: 'High', de: 'Hoch' },
  'confidence.medium': { en: 'Medium', de: 'Mittel' },
  'confidence.low': { en: 'Low', de: 'Gering' },
  'confidence.aiConfidence': { en: 'AI confidence', de: 'KI-Konfidenz' },

  // ── Plan-Stempel (verdict stamp) ─────────────────────────────────────────
  'stempel.seal': {
    en: 'Bebauungsplan · Prüfsiegel',
    de: 'Bebauungsplan · Prüfsiegel',
  },
  'stempel.passHead': { en: 'Compliant', de: 'Konform' },
  'stempel.failHead': { en: 'Not compliant', de: 'Nicht konform' },
  'stempel.reviewHead': { en: 'Review needed', de: 'Prüfung nötig' },
  'stempel.subPass': {
    en: 'All constraints satisfied',
    de: 'Alle Vorgaben erfüllt',
  },
  'stempel.subViolated': {
    en: '{violated} of {total} constraints violated',
    de: '{violated} von {total} Vorgaben verletzt',
  },

  // ── 3D viewer overlays ───────────────────────────────────────────────────
  'viewer.proposedBuilding': { en: 'Proposed building', de: 'Geplantes Gebäude' },
  'viewer.withinLimits': { en: 'within limits', de: 'im Rahmen' },
  'viewer.exceedsLimits': { en: 'exceeds limits', de: 'überschreitet Grenzen' },
  'viewer.existingBuildings': {
    en: '{n} existing LOD2 buildings',
    de: '{n} bestehende LOD2-Gebäude',
  },
  'viewer.backdropMissing': {
    en: 'city backdrop not loaded',
    de: 'Stadtkulisse nicht geladen',
  },
  'viewer.slot': { en: '3D viewer slot', de: '3D-Viewer-Platz' },
  'viewer.slotNote': {
    en: 'MapLibre / Cesium canvas mounts here',
    de: 'MapLibre-/Cesium-Canvas wird hier eingebunden',
  },
  'viewer.modeMap': { en: '3D Map', de: '3D-Karte' },
  'viewer.modeSchematic': { en: 'Schematic', de: 'Schema' },
  'viewer.mapUnavailable': {
    en: 'Map unavailable — showing schematic.',
    de: 'Karte nicht verfügbar — Schema wird angezeigt.',
  },
  'viewer.loading': { en: 'loading 3D map…', de: '3D-Karte wird geladen…' },
  'viewer.selectSpot': { en: 'Click a green spot to place a building', de: 'Gr\u00FCnen Punkt anklicken, um ein Geb\u00E4ude zu platzieren' },

  // ── Print report ─────────────────────────────────────────────────────────
  'print.header': {
    en: 'PLANRAUM · Zoning-plan compliance check',
    de: 'PLANRAUM · Bebauungsplan-Konformitätsprüfung',
  },
  'print.asOf': { en: 'as of', de: 'Stand' },
  'print.overallPass': {
    en: 'Compliant — all constraints satisfied',
    de: 'Konform — alle Vorgaben erfüllt',
  },
  'print.overallFail': {
    en: 'Not compliant — {fail} of {total} constraints violated',
    de: 'Nicht konform — {fail} von {total} Vorgaben verletzt',
  },
  'print.overallReview': {
    en: 'Review needed — {n} constraint(s) need review',
    de: 'Prüfung nötig — {n} Vorgabe(n) zu prüfen',
  },
  'print.colParameter': { en: 'Parameter', de: 'Parameter' },
  'print.colAllowed': { en: 'Allowed', de: 'Zulässig' },
  'print.colProposed': { en: 'Proposed', de: 'Geplant' },
  'print.colVerdict': { en: 'Verdict', de: 'Urteil' },
  'print.colNote': { en: 'Note', de: 'Hinweis' },
  'print.footer': {
    en: "Generated by PLANRAUM — AI Bebauungsplan reader. Demonstration output, not legally binding. Values reflect human-reviewed extraction and the planner's proposed building.",
    de: 'Erstellt von PLANRAUM — KI-Bebauungsplan-Reader. Demonstrationsausgabe, nicht rechtsverbindlich. Werte basieren auf der vom Menschen geprüften Extraktion und dem geplanten Gebäude.',
  },

  // ── Compliance notes (generated in data/compliance.ts) ───────────────────
  'note.notNumeric': {
    en: 'Value not numeric — verify manually.',
    de: 'Wert nicht numerisch — manuell prüfen.',
  },
  'note.exceeds': {
    en: 'exceeds allowed {allowed} by {delta}',
    de: 'überschreitet zulässige {allowed} um {delta}',
  },
  'note.headroom': {
    en: '{head} headroom below limit',
    de: '{head} Spielraum unter dem Grenzwert',
  },
  'note.atLimit': { en: 'at limit', de: 'am Grenzwert' },
  'note.pitchNotComparable': {
    en: 'Pitch not comparable — verify manually.',
    de: 'Neigung nicht vergleichbar — manuell prüfen.',
  },
  'note.belowMin': {
    en: 'below minimum {min}° by {by}°',
    de: 'unter Minimum {min}° um {by}°',
  },
  'note.aboveMax': {
    en: 'above maximum {max}° by {by}°',
    de: 'über Maximum {max}° um {by}°',
  },
  'note.within': { en: 'within {min}–{max}°', de: 'innerhalb {min}–{max}°' },
  'note.roofMatches': {
    en: 'matches required {value}',
    de: 'entspricht geforderter {value}',
  },
  'note.roofMismatch': {
    en: 'proposed {proposed} ≠ required {value}',
    de: 'geplant {proposed} ≠ gefordert {value}',
  },
  'note.floorsMatch': {
    en: 'matches permitted {value} storeys',
    de: 'entspricht zulässigen {value} Geschossen',
  },
  'note.floorsReview': {
    en: 'proposed {proposed} vs permitted {value} — manual check',
    de: 'geplant {proposed} vs. zulässig {value} — manuelle Prüfung',
  },
  'note.lowConfidence': {
    en: 'source value low-confidence — verify {label} against plan',
    de: 'Quellwert geringe Konfidenz — {label} gegen Plan prüfen',
  },
  'note.genericMatch': {
    en: 'matches plan value {value}',
    de: 'entspricht Planwert {value}',
  },
  'note.genericReview': {
    en: 'proposed {proposed} vs plan {value} — manual check',
    de: 'geplant {proposed} vs. Plan {value} — manuelle Prüfung',
  },
}

/** Resolve a key + optional `{token}` params into a string for `lang`. */
export function translate(
  lang: Lang,
  key: string,
  params?: Record<string, string | number>,
): string {
  const entry = TRANSLATIONS[key]
  let str = entry ? entry[lang] : key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return str
}
