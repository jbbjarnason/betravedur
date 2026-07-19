// CC BY 4.0 attribution/license text in a UI-consumable form (DATA-08, UX-04).
//
// Wording verified live against https://athuganir.vedur.is/disclaimer (both is/en
// serve the Icelandic terms) on 2026-07-19. Veðurstofan's open data is published
// under CC BY 4.0; use under the licence requires naming the source (Veðurstofa
// Íslands), the dataset name, and the licence terms. Because Betra Veður aggregates
// and derives climatology from the raw observations, the modified-data clause applies:
// "Ef gögnunum er breytt skal bæta við: Gögnunum hefur verið breytt af [nafn notanda].
//  Veðurstofa Íslands ber ekki ábyrgð á þeirri vinnslu eða túlkun."
//
// Pure typed const, zero deps — lives in @betravedur/domain so the browser UI can
// consume it directly (Architectural Responsibility Map).

export interface Attribution {
  license: string;
  text_is: string;
  text_en: string;
  sourceUrl: string;
  modifiedNotice_is: string;
}

export const ATTRIBUTION: Attribution = {
  license: "CC BY 4.0",
  text_is:
    "Uppruni gagna: Veðurstofa Íslands. Veðurgögn gefin út samkvæmt Creative " +
    "Commons afnotaleyfi CC BY 4.0 (Attribution 4.0 International).",
  text_en:
    "Weather data from the Icelandic Meteorological Office (Veðurstofa Íslands), " +
    "published under the Creative Commons CC BY 4.0 (Attribution 4.0 International) licence.",
  sourceUrl: "https://athuganir.vedur.is/disclaimer",
  modifiedNotice_is:
    "Gögnunum hefur verið breytt af Betra Veður (samandregin veðurfarsmeðaltöl). " +
    "Veðurstofa Íslands ber ekki ábyrgð á þeirri vinnslu eða túlkun.",
};
