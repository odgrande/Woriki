// Temptations and life events ported from legacy/game.js, plus the moment each one
// fires in real time: `trigger` = 'random' (any waking hour), 'night' (end of the day),
// 'service-start' / 'service-end' (role moments during church), 'sunday-morning',
// or 'special' (only fired directly). Choices run through the helper `h` (systems.js).
import { naira, V, verseText, STAGE } from './content.js';
import { isPastor } from './actions.js';

/**
 * @typedef {object} GameEvent
 * @property {string} id
 * @property {string} emoji
 * @property {string} title
 * @property {boolean} [tempt]
 * @property {'random'|'night'|'service-start'|'service-end'|'sunday-morning'|'special'} [trigger]
 * @property {(s: object, c: object) => boolean} [cond]
 * @property {(h: object) => string} text
 * @property {{label: string, run?: (h: object) => string}[]} choices
 */

/** @type {GameEvent[]} */
export const EVENTS = [
  /* ---------------------------------------------------------- temptations */
  {
    id: 'gossip', tempt: true, emoji: '🗣️', title: 'Gossip after service', trigger: 'service-end',
    text: () => 'Some sisters are whispering about the choir leader\'s marriage by the car park. "Did you hear...?"',
    choices: [
      { label: 'Join the gist', run: (h) => h.fall('gossip') },
      { label: 'Walk away kindly', run: (h) => { h.grow('character', 4); return 'You changed the topic and walked away. +4 character.'; } },
    ],
  },
  {
    id: 'traffic', tempt: true, emoji: '🚌', title: 'Danfo wahala at Ojuelegba', trigger: 'random',
    text: () => 'A danfo driver hit your side mirror at Ojuelegba, then insulted you loudly in traffic.',
    choices: [
      { label: 'Give it back to him!', run: (h) => h.fall('anger') },
      { label: 'Forgive and let it go', run: (h) => { h.grow('character', 5); return `You forgave him. +5 character.\n${verseText(V.forgive)}`; } },
    ],
  },
  {
    id: 'receipts', tempt: true, emoji: '🧾', title: 'Inflate the receipt?', trigger: 'random',
    cond: (s) => !isPastor(s),
    text: (h) => `Your boss wants you to inflate a supplier receipt. "Na small thing. I'll add ${naira(h.s.salary * 3)} for you."`,
    choices: [
      { label: 'Do it', run: (h) => { h.s.naira += h.s.salary * 3; return h.fall('dishonesty'); } },
      { label: 'Refuse respectfully', run: (h) => {
        h.grow('character', 6);
        if (h.chance(0.4)) { h.s.salary = Math.round(h.s.salary * 1.3); return `The MD heard about your honesty and promoted you! Salary is now ${naira(h.s.salary)}.`; }
        return 'Your boss was annoyed, but your conscience is clear. +6 character.';
      } },
    ],
  },
  {
    id: 'wallet', tempt: true, emoji: '👛', title: 'Found a wallet', trigger: 'random',
    text: () => 'You found a wallet with ₦50,000 and an ID card at the Yaba bus stop.',
    choices: [
      { label: 'Keep it', run: (h) => { h.s.naira += 50000; return h.fall('stealing'); } },
      { label: 'Return it to the owner', run: (h) => { h.grow('character', 7); h.s.naira += 5000; return 'The owner cried with joy and gave you ₦5,000 "for transport". +7 character.'; } },
    ],
  },
  {
    id: 'leak', tempt: true, emoji: '📄', title: 'Exam questions leaked', trigger: 'random',
    cond: (s) => s.stage === STAGE.student,
    text: () => 'A classmate whispers: "I have the exam questions. Want them?"',
    choices: [
      { label: 'Take a look', run: (h) => `${h.fall('cheating')} The leak was discovered and the exam was rescheduled anyway.` },
      { label: 'No, I will study', run: (h) => { h.grow('character', 5); h.grow('word', 3); return 'You studied honestly instead. +5 character, +3 word.'; } },
    ],
  },
  {
    id: 'pride', tempt: true, emoji: '🏆', title: 'Praise from everyone', trigger: 'random',
    cond: (s) => isPastor(s) && s.pastor.members >= 100,
    text: () => 'After a powerful service, people are calling you "the greatest man of God in this city".',
    choices: [
      { label: 'Enjoy it. I worked hard!', run: (h) => { h.grow('fame', 5); return h.fall('pride'); } },
      { label: 'Give all glory to God', run: (h) => { h.grow('character', 5); h.grow('faith', 3); return 'You pointed everyone to Jesus. +5 character.'; } },
    ],
  },
  {
    id: 'deacon', tempt: true, emoji: '💼', title: 'Rich member, one request', trigger: 'random',
    cond: (s) => isPastor(s) && s.pastor.members >= 30,
    text: (h) => `Chief Okafor will donate ${naira(h.s.pastor.members * 2000)}... if you make him a Deacon. He hasn't attended service in months.`,
    choices: [
      { label: 'Accept the donation', run: (h) => { h.s.naira += h.s.pastor.members * 2000; return h.fall('compromise', 5); } },
      { label: 'Politely decline', run: (h) => { h.grow('character', 4); h.grow('faith', 2); return 'You stood your ground. +4 character.'; } },
    ],
  },
  {
    id: 'politician', tempt: true, emoji: '🎩', title: 'A politician\'s offer', trigger: 'random',
    cond: (s) => isPastor(s) && s.pastor.members >= 150,
    text: (h) => `Honourable "Dividends" offers ${naira(h.s.pastor.members * 3000)} if you tell your members to vote for him.`,
    choices: [
      { label: 'Accept the money', run: (h) => { h.s.naira += h.s.pastor.members * 3000; h.grow('fame', 5); return h.fall('selling the pulpit'); } },
      { label: 'Pray for him, decline the money', run: (h) => { h.grow('character', 6); return 'You prayed for him and kept the pulpit pure. +6 character.'; } },
    ],
  },
  {
    id: 'yahooinvite', tempt: true, emoji: '💻', title: 'Easy money?', trigger: 'random',
    cond: (s) => !isPastor(s),
    text: () => 'Your secondary school friend from Festac just bought a Benz. "Guy, come join us. Na just chatting with oyinbo people online."',
    choices: [
      { label: 'Join him', run: (h) => { const m = h.s.salary * 10; h.s.naira += m; h.s.frauds += 1; return `First "client" paid ${naira(m)}. ${h.fall('fraud', 15)}`; } },
      { label: 'No. I will work honestly', run: (h) => { h.grow('character', 6); return 'He laughed at you. You slept peacefully. +6 character.'; } },
    ],
  },
  {
    id: 'flirt', tempt: true, emoji: '📩', title: '"Good morning dear"', trigger: 'night',
    text: () => 'A married colleague keeps sending you late-night "Good morning dear" messages with heart emojis.',
    choices: [
      { label: 'Reply with heart emojis', run: (h) => h.fall('flirting with a married person', 8) },
      { label: 'Set boundaries politely', run: (h) => { h.grow('character', 5); return 'You told them clearly to stop. +5 character.'; } },
    ],
  },
  {
    id: 'beach', tempt: true, emoji: '🏖️', title: 'Beach party, Sunday morning', trigger: 'sunday-morning',
    cond: (s) => !isPastor(s) && !s.doneToday.sunday,
    text: () => 'Your friends call: "Boat ride to Tarkwa Bay beach today! Skip church jare, God understands."',
    choices: [
      { label: 'Go to the beach', run: (h) => { h.s.doneToday.sunday = true; h.s.skippedSunday = true; h.grow('faith', -6); h.s.points += 3; h.skip(6 * 60, 'Tarkwa Bay'); return 'Suya, music and sun. +3⭐, but you missed church. -6 faith.'; } },
      { label: 'Go to church, beach later', run: (h) => { h.grow('character', 3); return 'You chose God first. +3 character.'; } },
    ],
  },
  {
    id: 'derica', tempt: true, emoji: '⚖️', title: 'The small paint bucket', trigger: 'random',
    cond: (s) => s.job === 'Market trader',
    text: () => 'Your neighbour at the market uses a smaller "derica" to measure rice. "Everybody dey do am. You go make more money."',
    choices: [
      { label: 'Use the small bucket', run: (h) => { h.s.naira += h.s.salary * 2; return h.fall('cheating customers', 7); } },
      { label: 'Keep honest measures', run: (h) => { h.grow('character', 5); return 'Your customers trust you. One brought her sister to buy from you. +5 character.'; } },
    ],
  },
  {
    id: 'bribepark', tempt: true, emoji: '🚗', title: 'Park in the elders\' spot', trigger: 'service-start',
    cond: (s) => s.role === 'security',
    text: () => 'A big man in a Range Rover offers you ₦5,000 to let him park in the space reserved for the elderly.',
    choices: [
      { label: 'Collect the money', run: (h) => { h.s.naira += 5000; return h.fall('taking a bribe', 8); } },
      { label: 'Politely direct him elsewhere', run: (h) => { h.grow('character', 6); h.s.xp += 4; return 'He grumbled, but the Chief Security Officer saw it. +6 character.'; } },
    ],
  },
  {
    id: 'lostchild', emoji: '🧒', title: 'Lost child at the gate', trigger: 'service-start',
    cond: (s) => s.role === 'security',
    text: () => 'A crying 4-year-old is wandering near the gate during service.',
    choices: [{ label: 'Calm her and find her mum', run: (h) => { h.grow('character', 5); return 'You found her mother inside. She hugged you and cried.' + h.reward(6, 8); } }],
  },
  {
    id: 'offeringbag', tempt: true, emoji: '👜', title: 'The offering bag', trigger: 'service-end',
    cond: (s) => s.role === 'usher',
    text: () => 'After service you are alone with the offering bag before counting. Nobody would notice ₦2,000 missing.',
    choices: [
      { label: 'Take ₦2,000 "for transport"', run: (h) => { h.s.naira += 2000; return h.fall('stealing from God\'s house', 12); } },
      { label: 'Hand it over sealed', run: (h) => { h.grow('character', 6); h.s.xp += 4; return 'The Head Usher trusts you more than ever. +6 character.'; } },
    ],
  },
  {
    id: 'frontseat', emoji: '💺', title: '"I must sit in front"', trigger: 'service-start',
    cond: (s) => s.role === 'usher',
    text: () => 'A latecomer insists on the reserved front row because she "gave the biggest offering last week".',
    choices: [
      { label: 'Find her a good seat kindly', run: (h) => { h.grow('character', 3); return 'She calmed down and even smiled at the end.' + h.reward(4, 3); } },
      { label: 'Give her the reserved seat', run: (h) => { h.grow('character', -2); return 'The visiting elderly couple had to stand. -2 character.'; } },
    ],
  },
  {
    id: 'solo', tempt: true, emoji: '🎤', title: 'They gave the solo to her', trigger: 'service-start',
    cond: (s) => s.role === 'choir',
    text: () => 'The Choir Director gave today\'s solo to the new chorister instead of you.',
    choices: [
      { label: 'Gossip about her voice', run: (h) => h.fall('envy', 7) },
      { label: 'Support her and sing your part', run: (h) => { h.grow('character', 6); return 'She nailed it, and thanked you after. +6 character.'; } },
    ],
  },
  {
    id: 'nepa', emoji: '⚡', title: 'NEPA took light mid-service', trigger: 'service-start',
    cond: (s) => s.role === 'media',
    text: () => 'Power went off during the sermon and the livestream dropped.',
    choices: [
      { label: 'Switch to the generator fast', run: (h) => { h.grow('character', 3); return 'Back live in 40 seconds. The pastor gave you a thumbs up.' + h.reward(6, 5); } },
      { label: 'Wait for NEPA', run: (h) => { h.s.xp = Math.max(0, h.s.xp - 3); return 'NEPA did not come back. 300 people online left.'; } },
    ],
  },
  {
    id: 'editmistake', tempt: true, emoji: '🎞️', title: '"Cut that part"', trigger: 'random',
    cond: (s) => s.role === 'media',
    text: () => 'A deacon asks you to edit the video so it looks like he gave a big offering he never gave.',
    choices: [
      { label: 'Edit it for him', run: (h) => h.fall('deception', 7) },
      { label: 'Refuse respectfully', run: (h) => { h.grow('character', 6); return 'He was annoyed, but you kept your integrity. +6 character.'; } },
    ],
  },
  {
    id: 'meat', tempt: true, emoji: '🍗', title: 'Extra meat', trigger: 'service-end',
    cond: (s) => s.role === 'hospitality',
    text: () => 'There is extra chicken after the programme. Another volunteer is wrapping some to take home.',
    choices: [
      { label: 'Wrap some too', run: (h) => { h.eat(30); return `Your belle is happy. ${h.fall('taking what was not yours', 5)}`; } },
      { label: 'Ask the HOD what to do with it', run: (h) => { h.grow('character', 4); h.eat(20); return 'The HOD shared it among all the volunteers. You got some too!'; } },
    ],
  },
  {
    id: 'naughty', emoji: '🙃', title: 'Naughty child', trigger: 'service-start',
    cond: (s) => s.role === 'children',
    text: () => 'A boy keeps disrupting the class and threw crayons at a girl.',
    choices: [
      { label: 'Talk to him gently', run: (h) => { h.grow('character', 4); return 'He told you his parents fight at home. You prayed with him.' + h.reward(6, 5); } },
      { label: 'Shout at him', run: (h) => h.fall('anger', 5) },
    ],
  },
  {
    id: 'cursereq', tempt: true, emoji: '🗡️', title: '"Pray my enemy should die"', trigger: 'random',
    cond: (s) => s.role === 'prayer',
    text: () => 'Someone on the prayer line asks you to pray that their business rival "falls down and dies".',
    choices: [
      { label: 'Pray "fire" on the enemy', run: (h) => h.fall('cursing', 6) },
      { label: 'Pray for both of them', run: (h) => { h.grow('character', 5); h.grow('faith', 3); return 'You prayed for peace and blessing for both. +5 character.'; } },
    ],
  },

  /* ---------------------------------------------------------- blessings and life */
  {
    id: 'promotion', emoji: '📈', title: 'Promotion at work!', trigger: 'random',
    cond: (s) => !isPastor(s),
    text: () => 'Your hard work and good attitude have been noticed.',
    choices: [{ label: 'Thank God!', run: (h) => { h.s.salary = Math.round(h.s.salary * 1.25); return `Salary increased to ${naira(h.s.salary)}.`; } }],
  },
  {
    id: 'mentor', emoji: '🧓🏾', title: 'An elder takes interest', trigger: 'service-end',
    cond: (s) => !isPastor(s),
    text: () => 'After service, Deacon Adebayo offers to disciple you every week.',
    choices: [{ label: 'Gladly!', run: (h) => { h.grow('word', 5); h.grow('faith', 5); return '+5 word, +5 faith.'; } }],
  },
  {
    id: 'sick', emoji: '🤒', title: 'Malaria', trigger: 'night',
    text: () => 'You came down with malaria. Brethren from church came to pray for you.',
    choices: [{ label: 'Rest and recover', run: (h) => { h.gain('energy', -50); h.grow('faith', 3); return 'You recovered quickly. Your faith grew through it.'; } }],
  },
  {
    id: 'fruit', emoji: '🍇', title: 'Fruit of the Spirit', trigger: 'service-end',
    text: () => `Today's sermon was on the fruit of the Spirit.\n\n${verseText(V.fruit)}`,
    choices: [{ label: 'Lord, grow this fruit in me', run: (h) => { h.grow('character', 4); h.grow('word', 2); return '+4 character, +2 word.'; } }],
  },
  {
    id: 'money', emoji: '💸', title: 'Prosperity conference', trigger: 'random',
    cond: isPastor,
    text: () => `A visiting preacher says: "A pastor without a Jeep is not anointed!"\n\nYour mentor sends you a verse instead:\n\n${verseText(V.money)}`,
    choices: [{ label: 'Noted', run: (h) => { h.grow('word', 2); return 'You chose to remember what matters.'; } }],
  },
  {
    id: 'viral', emoji: '📱', title: 'Your sermon is spreading!', trigger: 'random',
    cond: isPastor,
    text: () => 'A clip of your sermon on forgiveness is being shared on WhatsApp all over Nigeria.',
    choices: [{ label: 'Glory to God!', run: (h) => { h.grow('fame', 10); const n = h.addMembers(15 * (1 + h.s.pastor.venue)); return `+10 fame, +${n} members came to visit.`; } }],
  },
  {
    id: 'rival', emoji: '🍛', title: 'New church opposite', trigger: 'random',
    cond: (s) => isPastor(s) && s.pastor.members >= 20,
    text: () => 'A new church opened across the road. They share free jollof after every service.',
    choices: [
      { label: 'Trust God and your choir', run: (h) => { if (h.s.pastor.choir >= 2) return 'Your worship is too sweet. Nobody left!'; const l = -h.addMembers(-h.s.pastor.members * 0.05); return `${l} members followed the jollof. Train your choir!`; } },
      { label: 'Bless them and keep preaching', run: (h) => { h.grow('character', 3); const l = -h.addMembers(-h.s.pastor.members * 0.02); return `You prayed for the new church. ${l} members left, but +3 character.`; } },
    ],
  },
  {
    id: 'wedding', emoji: '💍', title: 'Wedding in church!', trigger: 'random',
    cond: (s) => isPastor(s) && s.pastor.members >= 15,
    text: () => 'Two of your members are getting married.',
    choices: [{ label: 'Officiate', run: (h) => { const f = 15000 * (1 + h.s.pastor.venue); h.s.naira += f; return `A beautiful wedding. Thanksgiving offering: ${naira(f)}.`; } }],
  },
  {
    id: 'baby', emoji: '👶', title: 'A testimony!', trigger: 'random',
    cond: isPastor,
    text: () => 'Sister Ngozi, who waited 10 years for a child, just had twins! The whole street is talking.',
    choices: [{ label: 'Dance to the altar', run: (h) => { h.grow('faith', 5); h.grow('fame', 4); const n = h.addMembers(8 * (1 + h.s.pastor.venue)); return `+5 faith, +${n} members.`; } }],
  },
  {
    id: 'japa', emoji: '✈️', title: 'Members relocating abroad', trigger: 'random',
    cond: (s) => isPastor(s) && s.pastor.members >= 50,
    text: () => 'Several young members just got visas and are relocating.',
    choices: [{ label: 'Pray for journey mercies', run: (h) => { const l = -h.addMembers(-h.s.pastor.members * 0.03); return h.s.pastor.owned.livestream ? `${l} members relocated, but they'll keep worshipping online.` : `${l} members relocated. A livestream would keep them connected.`; } }],
  },
  {
    id: 'breakaway', emoji: '🕵🏾', title: 'Assistant pastor breaking away', trigger: 'random',
    cond: (s) => isPastor(s) && s.pastor.members >= 200,
    text: () => 'Your assistant pastor is starting his own church and is quietly inviting your members to follow him.',
    choices: [
      { label: 'Bless him and let him go', run: (h) => { const l = -h.addMembers(-h.s.pastor.members * 0.06); h.grow('character', 5); return `He left with ${l} members, but people respected your grace. +5 character.`; } },
      { label: 'Give him a raise', run: (h) => { const c = 30000 * (1 + h.s.pastor.venue); if (h.s.naira < c) { const l = -h.addMembers(-h.s.pastor.members * 0.1); return `You couldn't afford it. He left with ${l} members.`; } h.s.naira -= c; return `Paid ${naira(c)}. He's staying... for now.`; } },
      { label: 'Curse him from the pulpit', run: (h) => { const l = -h.addMembers(-h.s.pastor.members * 0.1); return `${l} members left in disgust. ${h.fall('bitterness')}`; } },
    ],
  },
  {
    id: 'landlord', emoji: '🧔🏾', title: 'Rent increase', trigger: 'random',
    cond: (s) => isPastor(s) && s.pastor.venue > 0,
    text: () => 'The landlord says rent is going up 30%.',
    choices: [
      { label: 'Accept and trust God', run: (h) => { h.s.pastor.rentMult *= 1.3; return `Rent is now ${naira(h.rent())}/week.`; } },
      { label: 'Negotiate politely', run: (h) => { if (h.chance(0.6)) return 'He agreed to keep the old price. God dey!'; h.s.pastor.rentMult *= 1.4; return `He insisted. Rent is now ${naira(h.rent())}/week.`; } },
    ],
  },

  /* ---------------------------------------------------------- special, fired directly */
  {
    id: 'expose', special: true, trigger: 'special', emoji: '📰', title: 'SCANDAL!',
    text: () => 'A journalist just published a story about the anointing oil, the "seed" offerings and the lifestyle. It\'s trending on X. How will you handle it?',
    choices: [
      { label: 'Confess publicly & refund the money', run: (h) => { const l = -h.addMembers(-h.s.pastor.members * 0.08); h.s.naira = Math.round(h.s.naira * 0.6); h.grow('character', 15); h.grow('fame', -8); h.s.convicted = false; h.s.repentances += 1; return `You apologised from the pulpit and refunded members. ${l} left, but many respected your honesty. +15 character.`; } },
      { label: 'Deny everything', run: (h) => { const l = -h.addMembers(-h.s.pastor.members * 0.2); h.grow('fame', -15); h.grow('character', -5); h.s.naira = Math.round(h.s.naira * 0.8); return `The receipts came out anyway. ${l} members left, lawyers took 20% of funds.`; } },
      { label: '"It\'s the attack of the enemy!"', run: (h) => { const l = -h.addMembers(-h.s.pastor.members * 0.12); h.grow('character', -8); return `Some believed you. ${l} members did not. -8 character.`; } },
    ],
  },
  {
    id: 'harvest', special: true, trigger: 'special', emoji: '🌽', title: 'Harvest & Thanksgiving!',
    text: () => 'It\'s the church\'s harvest. Members are bringing yams, goats and thanksgiving offerings.',
    choices: [{ label: 'Dance with thanksgiving', run: (h) => { const m = Math.round(h.s.pastor.members * 2000 * h.faithMult()); h.s.naira += m; return `Harvest raised ${naira(m)} for the work of God!`; } }],
  },
];

export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
