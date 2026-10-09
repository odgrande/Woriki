// Profanity filter: obscenity's English dataset with its recommended transformers,
// plus a short list of common Nigerian Pidgin / Yoruba / Igbo / Hausa insults.
// Matches are masked with asterisks, never dropped, so the conversation still reads.
import {
  RegExpMatcher, TextCensor, DataSet, pattern, englishDataset, englishRecommendedTransformers,
  asteriskCensorStrategy, compareMatchByPositionAndId,
  resolveConfusablesTransformer, toAsciiLowerCaseTransformer, remapCharactersTransformer, collapseDuplicatesTransformer,
} from 'obscenity';

/**
 * Local insults. Kept short and unambiguous: words that are also ordinary English
 * ("were", "ode", "fool" — the Psalms use it) or common names are left out.
 * Each entry is matched as a whole word (or phrase).
 */
export const LOCAL_INSULTS = [
  // Pidgin / general Nigerian English
  'mumu', 'werey', 'weyrey', 'ashawo', 'ashewo', 'olosho', 'oloshi', 'olodo', 'mugu', 'idiot', 'stupid',
  'yeye man', 'yeye girl', 'yeye boy', 'yeye person', 'yeye pikin', 'craze man', 'gbola', 'toto',
  // Yoruba
  'agbaya', 'didirin', 'dindinrin', 'oponu', 'eranko', 'omo ale', 'oloriburuku', 'alakori', 'suegbe', 'apoda', 'obo',
  // Igbo
  'onye ara', 'nwa ashi', 'ofeke', 'onye nzuzu', 'anuofia', 'efulefu',
  // Hausa (widely heard in Lagos too)
  'shege', 'dan iska', 'dan banza', 'wawa',
];

/**
 * @param {{ extra?: string[] }} [opts] extra words/phrases to mask (whole words)
 * @returns {{ clean(text: string): string, hasProfanity(text: string): boolean }}
 */
export function createFilter({ extra = [] } = {}) {
  const english = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });

  // The English preset maps "!" to "i" (b!tch), which breaks word boundaries for
  // our list ("mumu!"), so local words use a lighter set of transformers.
  const local = new DataSet();
  for (const w of [...LOCAL_INSULTS, ...extra]) {
    const word = w.toLowerCase().replace(/[^a-z ]/g, '').replace(/(.)\1+/g, '$1').trim();
    if (!word) continue;
    local.addPhrase((p) => p.setMetadata({ originalWord: word }).addPattern(pattern`|${word}|`));
  }
  const localMatcher = new RegExpMatcher({
    ...local.build(),
    blacklistMatcherTransformers: [
      resolveConfusablesTransformer(),
      toAsciiLowerCaseTransformer(),
      remapCharactersTransformer({ a: '4@', e: '3', i: '1', o: '0', s: '5$' }),
      collapseDuplicatesTransformer({ defaultThreshold: 1 }),
    ],
  });
  const censor = new TextCensor().setStrategy(asteriskCensorStrategy());

  const matches = (text) => {
    const all = [...english.getAllMatches(text), ...localMatcher.getAllMatches(text)];
    all.sort(compareMatchByPositionAndId);
    return all;
  };

  return {
    clean(text) {
      if (!text) return text;
      const m = matches(text);
      return m.length ? censor.applyTo(text, m) : text;
    },
    hasProfanity(text) {
      return !!text && (english.hasMatch(text) || localMatcher.hasMatch(text));
    },
  };
}
