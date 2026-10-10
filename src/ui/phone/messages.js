// Messages on your phone: church and department WhatsApp-style groups, your pastor, your
// mum, your prayer partner, the "Yaba · online" room with real players, and the scam texts
// the devil sends. Pure logic over a plain store (persisted by the phone UI).
import { VERSES, V, ROLES } from '../../game/content.js';

/** Department group per role. */
const DEPT = {
  choir: ['Choir Department', '🎶'], usher: ['Ushering Unit', '🧤'], security: ['Security Unit', '🛡️'], media: ['Media & Sound', '🎥'],
  hospitality: ['Hospitality Unit', '🍲'], children: ['Children\'s Church Teachers', '🧒'], prayer: ['Intercessors', '🕊️'],
  minister: ['Bible School Class', '📖'], worshipper: ['House Fellowship, Yaba', '🏠'], visitor: ['New Members Class', '👋'],
};

/** Threads, in the order shown when nothing is newer. */
export function threadDefs(role) {
  const [deptName, deptEmoji] = DEPT[role] || DEPT.worshipper;
  return [
    { id: 'church', name: 'Grace Assembly Family', emoji: '⛪', group: true },
    { id: 'dept', name: deptName, emoji: deptEmoji, group: true },
    { id: 'pastor', name: 'Pastor Ade', emoji: '👨🏿‍💼' },
    { id: 'mum', name: 'Mum ❤️', emoji: '👩🏿' },
    { id: 'partner', name: 'Sis. Chioma (prayer partner)', emoji: '🙋🏿‍♀️' },
    { id: 'live', name: 'Yaba · people online', emoji: '🌍', group: true, live: true },
    { id: 'scam', name: '+234 803 *** 4411', emoji: '❓', hidden: true },
  ];
}

const MEMBERS = ['Bro. Tunde', 'Sis. Ngozi', 'Deacon Femi', 'Mama Titi', 'Bro. Emeka', 'Sis. Blessing', 'Bro. Kunle', 'Sis. Ada'];
const AMENS = ['Amen 🙏', 'Hallelujah! 🙌', 'God bless you', 'Received 👍', 'Amen and amen', 'Thank you Jesus!', 'Glory!', '🙏🙏🙏'];
const MUM = ['Ehen, have you eaten today?', 'Don\'t forget church on Sunday o. Wear something fine.', 'I am proud of you, my child. Keep serving God.', 'Your uncle is asking of you. Call him.', 'Did you pray this morning? Pray before you go out.', 'NEPA took light here since morning. How is Yaba?'];
const SCAMS = [
  'Dear customer, your BVN will be blocked today. Send your BVN and OTP to reactivate. – Bank Support',
  'Congrats!! You won ₦2,500,000 in the MTN promo. Pay ₦25,000 processing fee to claim. Hurry!',
  'Join our investment: 50% profit every week. My pastor is a member too. Send ₦25,000 to start.',
  'Hi dear 😘 I saw your profile. Are you free tonight? Don\'t tell anyone.',
];

/** Pastor's replies by what you wrote (KJV verses). */
const PASTOR_REPLIES = [
  [/sick|ill|hospital|pain|fever|malaria/i, 'Sorry, I\'m praying for you now. "For I will restore health unto thee, and I will heal thee of thy wounds, saith the LORD" (Jeremiah 30:17). Rest and take your drugs.'],
  [/money|broke|job|work|rent|bills?|school fees?/i, 'God will provide. "But my God shall supply all your need according to his riches in glory by Christ Jesus" (Philippians 4:19). Come to the church office on Tuesday, let us talk.'],
  [/sin|sorry|fell|fall|repent|ashamed|guilty/i, `Come back to Him, He is waiting. ${V.confess[1].replace(/\.$/, '')} (${V.confess[0]}). You are forgiven when you confess.`],
  [/tired|weak|stress|discourag|sad|cry|alone|lonely/i, '"But they that wait upon the LORD shall renew their strength" (Isaiah 40:31). You are not alone. See me after service.'],
  [/pray|prayer/i, `I'm praying for you right now. "${V.prayer[1].split(': ')[1] || V.prayer[1]}" (${V.prayer[0]}).`],
  [/thank|bless|grace|god is good/i, 'To God be the glory! See you on Sunday. Bring someone along.'],
  [/marr|wife|husband|relationship|date|dating/i, 'Pray about it and don\'t rush. Let the man or woman love God first. Come for counselling, my door is open.'],
];

const dayOf = (T) => Math.floor(T / 1440);

/** A fresh store. */
export function newStore(startT = 0) {
  return { v: 1, startT, sent: {}, threads: {}, unread: {}, notes: '', gallery: [], scamOpen: null };
}

/** Add a message. @returns the message */
export function post(store, thread, msg) {
  const list = (store.threads[thread] ||= []);
  const m = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ...msg };
  list.push(m);
  if (list.length > 80) list.splice(0, list.length - 80);
  if (!m.me) store.unread[thread] = (store.unread[thread] || 0) + 1;
  return m;
}

/**
 * Messages that arrive by themselves at the right time of day (devotion, service reminders,
 * live service, mum, prayer partner, scams). Call when the clock changes.
 * @param {object} store
 * @param {object} s game state
 * @param {object} c game.clock
 * @param {{items: {kind: string, name: string, time: string}[]}} plan game.plan
 * @param {() => number} [rng]
 * @returns {{thread: string, msg: object}[]} new messages
 */
export function scheduled(store, s, c, plan, rng = Math.random) {
  const out = [];
  const day = dayOf(c.T);
  const h = c.hour + (c.minute % 60) / 60;
  const once = (key, thread, msg) => {
    const k = `${day}:${key}`;
    if (store.sent[k]) return;
    store.sent[k] = true;
    out.push({ thread, msg: post(store, thread, { ...msg, T: c.T }) });
  };
  const verse = VERSES[(day + 3) % VERSES.length];
  if (h >= 6) once('devotion', 'church', { from: 'Pastor Ade', text: `Good morning family! 🌅 Today's word: "${verse[1]}" — ${verse[0]}. Have a blessed ${c.weekdayName}.` });
  for (const item of plan?.items || []) {
    const [hh, mm] = item.time.split(':').map(Number);
    const start = hh + mm / 60;
    const thread = item.kind === 'practice' || item.kind === 'cleaning' ? 'dept' : 'church';
    if (h >= start - 2 && h < start) once(`remind:${item.kind}`, thread, { from: 'Church Office', text: `Reminder: ${item.name} today at ${item.time}. ${item.kind === 'cleaning' ? 'Bring a broom and your joy 😄' : item.kind === 'practice' ? 'Altos, please come early.' : 'Come early, bring a friend!'}` });
    if (h >= start && item.live) once(`live:${item.kind}`, 'church', { from: 'Media Unit', text: `🔴 We are LIVE: ${item.name}. Open the Live app on your phone if you can't make it.` });
  }
  if (h >= 10 && rng() < 0.5) once('announce', 'church', { from: MEMBERS[day % MEMBERS.length], text: ['Happy birthday to our Sis. Funke! 🎂 May God bless your new age.', 'Please pray for Bro. Segun, he travels to Abuja by road today.', 'Welfare: Mama Titi needs help moving house on Saturday. Volunteers?', 'Testimony! My visa came out. God did it! 🙌', 'Joint prayer at 9pm tonight on this group. Prepare your requests.'][day % 5] });
  if (h >= 12 && (day % 3 !== 1)) once('mum', 'mum', { from: 'Mum', text: MUM[(day * 7) % MUM.length] });
  if (h >= 20) once('partner', 'partner', { from: 'Sis. Chioma', text: 'Have you prayed today? Send me your prayer points, let\'s pray at 9pm. 🙏' });
  if (h >= 15 && day % 2 === 0) {
    const k = `${day}:scam`;
    if (!store.sent[k]) {
      store.sent[k] = true;
      store.scamOpen = day;
      out.push({ thread: 'scam', msg: post(store, 'scam', { from: 'Unknown', text: SCAMS[day % SCAMS.length], T: c.T, choices: ['Block & report', 'Reply'] }) });
    }
  }
  return out;
}

/** Someone answers what you wrote (after a short "typing…"). */
export function replyTo(thread, text, me = 'You', rng = Math.random) {
  if (thread === 'pastor') {
    const hit = PASTOR_REPLIES.find(([re]) => re.test(text));
    return { from: 'Pastor Ade', text: hit ? hit[1] : `God bless you, ${me}. Keep studying the Word: "Study to shew thyself approved unto God" (2 Timothy 2:15). We'll talk after service.` };
  }
  if (thread === 'mum') return { from: 'Mum', text: /eat|food|chop/i.test(text) ? 'Good. Eat well, don\'t buy rubbish from the roadside.' : /church|service|pray/i.test(text) ? 'That is my child! God will keep you. 🙏' : ['Okay my dear. Take care of yourself.', 'Ehen! Call me later, credit is finishing.', 'God bless you. Greet your pastor for me.'][Math.floor(rng() * 3)] };
  if (thread === 'partner') return { from: 'Sis. Chioma', text: /pray|need|help/i.test(text) ? 'I\'m standing with you in prayer. "Be careful for nothing; but in every thing by prayer…" (Philippians 4:6) 🙏' : 'Amen! See you in church. 😊' };
  if (thread === 'church' || thread === 'dept') return { from: MEMBERS[Math.floor(rng() * MEMBERS.length)], text: AMENS[Math.floor(rng() * AMENS.length)] };
  return null;
}

/** A short preview line for the chat list. */
export function preview(store, thread) {
  const list = store.threads[thread] || [];
  const m = list[list.length - 1];
  if (!m) return '';
  return `${m.me ? 'You: ' : m.from && thread !== 'pastor' && thread !== 'mum' ? `${m.from}: ` : ''}${m.text}`.slice(0, 70);
}

/** Welcome messages for a new phone. */
export function seed(store, s) {
  const role = ROLES[s.role]?.name || 'member';
  post(store, 'church', { from: 'Church Office', text: `Welcome ${s.name}! 🎉 You have been added to the Grace Assembly Family group. Services: Sunday 9am, Wednesday 6pm Bible study, Friday 10pm vigil.`, T: s.T });
  post(store, 'pastor', { from: 'Pastor Ade', text: `Welcome to Grace Assembly, ${s.name}! I'm Pastor Ade. You are with us as a ${role}. If you need prayer or counsel, message me here any time.`, T: s.T });
  post(store, 'mum', { from: 'Mum', text: 'My child, you have settled in Yaba? Find a good church and stay there o.', T: s.T });
  store.unread = { church: 1, pastor: 1, mum: 1 };
}
