# EU AI Act Artikel 50 (Auszug)

Verbatim excerpt of Regulation (EU) 2024/1689, Article 50, German text.

Every chunk below is a verbatim substring of `_sources/eu-ai-act-art50-de.source.txt`,
which carries the retrieval URL, date and SHA-256 in its sibling `.provenance.json`.
`corpus-provenance.unit.test.ts` enforces that; only line wrapping is applied here.
Regenerate the snapshot with `pnpm exec tsx scripts/fetch-corpus-source.ts --article 50
--slug eu-ai-act-art50-de`.

**A duty is chunked together with the exception that limits it.** The unit of retrieval is the
legal unit, not the sentence. Article 50 states each obligation and then narrows it with a
counter-clause that names its subject anaphorically — "Diese Pflicht gilt nicht …" — so an
exception cut into its own chunk is unreachable from any question phrased in its duty's words, and
indistinguishable from the four other exceptions that open with the same five words. Retrieval could
then serve a duty without its carve-out, which is the same misrepresentation
`corpus-provenance.unit.test.ts` already guards the corpus against: verbatim text minus a clause is
still not the law. Splitting these cost citation precision nothing and cost correctness everything,
so the cut follows the Absätze.

<!-- chunk:art50-interaction -->
Die Anbieter stellen sicher, dass KI-Systeme, die für die direkte Interaktion
mit natürlichen Personen bestimmt sind, so konzipiert und entwickelt werden,
dass die betreffenden natürlichen Personen informiert werden, dass sie mit
einem KI-System interagieren, es sei denn, dies ist aus Sicht einer angemessen
informierten, aufmerksamen und verständigen natürlichen Person aufgrund der
Umstände und des Kontexts der Nutzung offensichtlich.

Diese Pflicht gilt nicht für gesetzlich zur Aufdeckung, Verhütung, Ermittlung
oder Verfolgung von Straftaten zugelassene KI-Systeme, wenn geeignete
Schutzvorkehrungen für die Rechte und Freiheiten Dritter bestehen, es sei
denn, diese Systeme stehen der Öffentlichkeit zur Anzeige einer Straftat zur
Verfügung.

<!-- chunk:art50-marking -->
Anbieter von KI-Systemen, einschließlich KI-Systemen mit allgemeinem
Verwendungszweck, die synthetische Audio-, Bild-, Video- oder Textinhalte
erzeugen, stellen sicher, dass die Ausgaben des KI-Systems in einem
maschinenlesbaren Format gekennzeichnet und als künstlich erzeugt oder
manipuliert erkennbar sind.

Die Anbieter sorgen dafür, dass — soweit technisch möglich — ihre technischen
Lösungen wirksam, interoperabel, belastbar und zuverlässig sind und
berücksichtigen dabei die Besonderheiten und Beschränkungen der verschiedenen
Arten von Inhalten, die Umsetzungskosten und den allgemein anerkannten Stand
der Technik, wie er in den einschlägigen technischen Normen zum Ausdruck
kommen kann.

Diese Pflicht gilt nicht, soweit die KI-Systeme eine unterstützende Funktion
für die Standardbearbeitung ausführen oder die vom Betreiber bereitgestellten
Eingabedaten oder deren Semantik nicht wesentlich verändern oder wenn sie zur
Aufdeckung, Verhütung, Ermittlung oder Verfolgung von Straftaten gesetzlich
zugelassen sind.

<!-- chunk:art50-emotion-biometric -->
Die Betreiber eines Emotionserkennungssystems oder eines Systems zur
biometrischen Kategorisierung informieren die davon betroffenen natürlichen
Personen über den Betrieb des Systems und verarbeiten personenbezogene Daten
gemäß den Verordnungen (EU) 2016/679 und (EU) 2018/1725 und der Richtlinie
(EU) 2016/680.

Diese Pflicht gilt nicht für gesetzlich zur Aufdeckung, Verhütung oder
Ermittlung von Straftaten zugelassene KI-Systeme, die zur biometrischen
Kategorisierung und Emotionserkennung im Einklang mit dem Unionsrecht
verwendet werden, sofern geeignete Schutzvorkehrungen für die Rechte und
Freiheiten Dritter bestehen.

<!-- chunk:art50-deepfake -->
Betreiber eines KI-Systems, das Bild-, Ton- oder Videoinhalte erzeugt oder
manipuliert, die ein Deepfake sind, müssen offenlegen, dass die Inhalte
künstlich erzeugt oder manipuliert wurden. Diese Pflicht gilt nicht, wenn die
Verwendung zur Aufdeckung, Verhütung, Ermittlung oder Verfolgung von
Straftaten gesetzlich zugelassen ist.

Ist der Inhalt Teil eines offensichtlich künstlerischen, kreativen,
satirischen, fiktionalen oder analogen Werks oder Programms, so beschränken
sich die in diesem Absatz festgelegten Transparenzpflichten darauf, das
Vorhandensein solcher erzeugten oder manipulierten Inhalte in geeigneter Weise
offenzulegen, die die Darstellung oder den Genuss des Werks nicht
beeinträchtigt.

<!-- chunk:art50-public-interest-text -->
Betreiber eines KI-Systems, das Text erzeugt oder manipuliert, der
veröffentlicht wird, um die Öffentlichkeit über Angelegenheiten von
öffentlichem Interesse zu informieren, müssen offenlegen, dass der Text
künstlich erzeugt oder manipuliert wurde.

Diese Pflicht gilt nicht, wenn die Verwendung zur Aufdeckung, Verhütung,
Ermittlung oder Verfolgung von Straftaten gesetzlich zugelassen ist oder wenn
die durch KI erzeugten Inhalte einem Verfahren der menschlichen Überprüfung
oder redaktionellen Kontrolle unterzogen wurden und wenn eine natürliche oder
juristische Person die redaktionelle Verantwortung für die Veröffentlichung
der Inhalte trägt.

<!-- chunk:art50-first-contact-accessibility -->
Die in den Absätzen 1 bis 4 genannten Informationen werden den betreffenden
natürlichen Personen spätestens zum Zeitpunkt der ersten Interaktion oder
Aussetzung in klarer und eindeutiger Weise bereitgestellt. Die Informationen
müssen den geltenden Barrierefreiheitsanforderungen entsprechen.

<!-- chunk:art50-chapter3-unaffected -->
Die Absätze 1 bis 4 lassen die in Kapitel III festgelegten Anforderungen und
Pflichten unberührt und berühren nicht andere Transparenzpflichten, die im
Unionsrecht oder dem nationalen Recht für Betreiber von KI-Systemen festgelegt
sind.

<!-- chunk:art50-codes-of-practice -->
Das Büro für Künstliche Intelligenz fördert und erleichtert die Ausarbeitung
von Praxisleitfäden auf Unionsebene, um die wirksame Umsetzung der Pflichten
in Bezug auf die Feststellung und Kennzeichnung künstlich erzeugter oder
manipulierter Inhalte zu erleichtern. Die Kommission kann
Durchführungsrechtsakte zur Genehmigung dieser Praxisleitfäden nach dem in
Artikel 56 Absatz 6 festgelegten Verfahren erlassen. Hält sie einen Kodex für
nicht angemessen, so kann die Kommission einen Durchführungsrechtsakt gemäß
dem in Artikel 98 Absatz 2 genannten Prüfverfahren erlassen, in dem gemeinsame
Vorschriften für die Umsetzung dieser Pflichten festgelegt werden.
