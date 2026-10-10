// Player actions ported from legacy/game.js. Each action is data plus a `run(h)` that
// mutates the state through the helper `h` (see systems.js → helpers()). Actions that
// can happen in the 3D world say where (`zone`) and how long (`stay` = minutes spent at
// the place, `away` = minutes off the map, e.g. at work), so the UI can guide the player.
import {
  MISSIONS, DEPARTMENTS, STAGE, examNeed, naira, V, verseText, VERSES,
} from './content.js';

/**
 * @typedef {object} Action
 * @property {string} id
 * @property {string} emoji
 * @property {string|((s: object) => string)} name
 * @property {'walk'|'duty'|'school'|'mission'|'life'|'prayer'|'shady'|'pastor'} group
 * @property {number|((s: object) => number)} energy
 * @property {(s: object) => number} [cost] naira
 * @property {boolean} [once] once per in-game day
 * @property {number} [limit] times per day
 * @property {(s: object) => boolean} [when] visible at all
 * @property {(s: object, c: object) => true|string} [avail] true or the reason it is not available now
 * @property {string[]} [zone] where it must be done (world zone ids)
 * @property {string} [where] label for the zone hint
 * @property {number} [stay] in-game minutes spent at the zone (a shift)
 * @property {number} [away] in-game minutes off the map (the clock skips ahead)
 * @property {boolean} [skipsService] allowed to overlap a service (free will)
 * @property {boolean} [kneel] done by kneeling (P) in the world
 * @property {boolean} [shady] a temptation
 * @property {(s: object, c: object) => string} desc
 * @property {(h: object) => (string|{text: string, modal?: object}|null)} run
 */

const isPastor = (s) => s.stage >= STAGE.pastor && s.role === 'minister';
const isMinister = (s) => s.role === 'minister';
const days = (c, list) => list.includes(c.weekdayShort);
const between = (c, from, to) => (from <= to ? c.hour >= from && c.hour < to : c.hour >= from || c.hour < to);
const verseOfDay = (s, c) => VERSES[(c.day - 1 + VERSES.length * 10) % VERSES.length];

/** @type {Action[]} */
export const ACTIONS = [
  /* ---------------------------------------------------------- walk with God */
  {
    id: 'repent', emoji: '💧', name: 'Confess & Repent', group: 'walk', energy: 10,
    when: (s) => s.convicted,
    desc: () => 'Bring it to God. He is faithful to forgive.',
    run(h) {
      const { s } = h;
      s.convicted = false;
      s.repentances += 1;
      h.grow('faith', 6); h.grow('character', 3);
      h.sound('pray');
      return { text: 'You are forgiven. +6 faith, +3 character.', modal: { emoji: '🕊️', title: 'Forgiven', text: `You poured out your heart to God and turned away from the sin.\n\n${verseText(V.confess)}`, ok: 'Thank You, Lord' } };
    },
  },
  {
    id: 'pray', emoji: '🙏', name: 'Quiet Time', group: 'walk', energy: 10, once: true, kneel: true,
    desc: () => 'Kneel anywhere (P) and spend time with the Lord.',
    run(h) {
      const f = Math.round(5 * h.bonus('prayer')) + (h.s.items.mat ? 2 : 0);
      h.grow('faith', f);
      h.sound('pray');
      return `You spent time in prayer. +${f} faith.` + h.reward(1, 1);
    },
  },
  {
    id: 'read', emoji: '📖', name: 'Read the Bible', group: 'walk', energy: (s) => (s.items.phone ? 10 : 15), once: true,
    desc: (s, c) => `Today: ${verseOfDay(s, c)[0]}`,
    run(h) {
      const w = Math.round(5 * h.bonus('study')) + (h.s.items.bible ? 2 : 0);
      h.grow('word', w); h.grow('faith', 2);
      const v = verseOfDay(h.s, h.c);
      return { text: `You meditated on ${v[0]}. +${w} word.` + h.reward(1, 1), modal: { emoji: '📖', title: v[0], text: `"${v[1]}"\n\nKing James Version`, ok: 'Amen' } };
    },
  },
  {
    id: 'quiz', emoji: '❓', name: 'Daily Bible Quiz', group: 'walk', energy: 5, once: true,
    desc: () => '3 questions. +3⭐ for each right answer.',
    run(h) { h.startQuiz('quiz', 3); return null; },
  },
  {
    id: 'help', emoji: '🤲', name: 'Help Someone in Need', group: 'walk', energy: 15, once: true,
    when: (s) => !isPastor(s),
    cost: (s) => Math.max(1000, Math.round(s.salary / 2)),
    desc: () => 'Mama Bisi next door needs food money for her grandchildren.',
    run(h) {
      h.grow('character', 6); h.grow('faith', 2);
      return 'You gave cheerfully. +6 character.' + h.reward(2, 3);
    },
  },
  {
    id: 'witness', emoji: '💬', name: 'Share the Gospel', group: 'walk', energy: 20,
    when: (s) => (isMinister(s) ? s.stage >= STAGE.worker : s.stage >= STAGE.member) && !isPastor(s),
    desc: () => 'Tell a colleague about Jesus.',
    run(h) {
      h.grow('faith', 3); h.grow('character', 2);
      if (h.chance(0.35)) { h.s.souls += 1; return 'Your colleague gave their life to Christ! +3 faith.' + h.reward(4, 8); }
      return 'They listened politely and promised to think about it. +3 faith.';
    },
  },
  {
    id: 'serve', emoji: '🧹', name: 'Serve in Department', group: 'walk', energy: 20, once: true,
    when: (s) => isMinister(s) && s.stage >= STAGE.worker && !isPastor(s),
    zone: ['church-hall', 'altar', 'choir', 'media', 'children', 'compound', 'gate', 'kitchen'], where: 'the church',
    stay: 15,
    desc: (s) => { const d = DEPARTMENTS.find((x) => x.id === s.dept); return d ? `${d.emoji} ${d.name} duty at church.` : 'Serve in church.'; },
    run(h) {
      h.grow('character', 5); h.grow('faith', 3);
      return 'You served faithfully in your department. +5 character.';
    },
  },

  /* ---------------------------------------------------------- prayer room */
  {
    id: 'prayroom', emoji: '🕯️', name: 'Pray in the Prayer Room', group: 'prayer', energy: 20, once: true, kneel: true,
    zone: ['prayer-room'], where: 'the prayer room',
    desc: () => 'Open 24/7. Kneel (P) at the altar rail and pray.',
    run(h) {
      const f = Math.round(8 * h.bonus('prayer')) + (h.s.items.mat ? 2 : 0);
      h.grow('faith', f);
      h.sound('pray');
      return `An hour alone with God. +${f} faith.` + h.reward(h.s.role === 'prayer' ? 4 : 2, 3);
    },
  },
  {
    id: 'prayfor', emoji: '🤲', name: 'Pray for a Request', group: 'prayer', energy: 8, limit: 5,
    desc: (s) => `Pray for someone on the prayer wall (${5 - (s.doneToday.prayfor || 0)} left today).`,
    run(h) { h.prayForRequest(); return null; },
  },
  {
    id: 'mountain', emoji: '⛰️', name: 'Prayer Mountain (Ikorodu)', group: 'prayer', energy: 60, once: true, away: 9 * 60,
    cost: () => 1500,
    zone: ['busstop'], where: 'the bus stop',
    avail: (s, c) => (c.weekdayShort === 'Sat' ? (between(c, 5, 12) ? true : 'Buses leave 5am–12pm') : 'Saturdays only'),
    desc: () => 'Bus fare ₦1,500. A whole day of prayer and fasting.',
    run(h) {
      h.grow('faith', 18); h.grow('character', 3);
      return 'You spent the day on Prayer Mountain. Your spirit feels renewed. +18 faith.' + h.reward(6, 12);
    },
  },

  /* ---------------------------------------------------------- daily life */
  {
    id: 'work', emoji: '💼', name: 'Go to Work', group: 'life', energy: 40, once: true, away: 8 * 60,
    when: (s) => !isPastor(s),
    zone: ['busstop'], where: 'the bus stop',
    avail: (s, c) => (c.weekdayShort === 'Sun' ? 'Rest day' : between(c, 6, 14) ? true : 'Work starts 6am–2pm'),
    desc: (s) => `${s.job}. Earn about ${naira(s.salary)}. Takes 8 hours.`,
    run(h) {
      const pay = Math.round(h.s.salary * h.rand(0.8, 1.2));
      h.s.naira += pay;
      h.sound('coin');
      return `Long day at work. Earned ${naira(pay)}.`;
    },
  },
  {
    id: 'buka', emoji: '🍛', name: 'Eat at the Buka', group: 'life', energy: 5,
    cost: () => 800,
    zone: ['market'], where: 'the market',
    avail: (s) => (s.hunger < 95 ? true : 'You are full'),
    desc: () => 'Amala, ewedu and two pieces of meat at Mama Nkechi\'s. ₦800.',
    run(h) { h.eat(45); return 'Belle full. You feel strong again.'; },
  },
  {
    id: 'cook', emoji: '🍳', name: 'Cook at Home', group: 'life', energy: 15, stay: 20,
    cost: () => 400,
    zone: ['home'], where: 'home',
    avail: (s) => (s.hunger < 95 ? true : 'You are full'),
    desc: () => 'Rice and stew. Cheaper, but it takes time. ₦400.',
    run(h) { h.eat(35); return 'Home-cooked rice and stew. Mama would be proud.'; },
  },
  {
    id: 'sleep', emoji: '🛏️', name: 'Sleep', group: 'life', energy: 0, skipsService: true,
    zone: ['home'], where: 'home',
    avail: (s, c) => (c.hour >= 20 || c.hour < 5 || s.energy < 35 ? true : 'Not tired yet (after 8pm)'),
    desc: (s, c) => (c.hour >= 20 || c.hour < 5 ? 'Sleep till 6am. Energy refills.' : 'Bedtime is after 8pm, or when you are exhausted.'),
    run(h) { h.sleep(); return null; },
  },

  /* ---------------------------------------------------------- Bible school */
  {
    id: 'lecture', emoji: '🎓', name: 'Attend Lectures', group: 'school', energy: 30, once: true, away: 3 * 60,
    when: (s) => s.stage === STAGE.student,
    zone: ['church-hall', 'compound', 'children'], where: 'the church',
    avail: (s, c) => (['Sat', 'Sun'].includes(c.weekdayShort) ? 'No lectures on weekends' : between(c, 8, 16) ? true : 'Lectures run 8am–4pm'),
    desc: () => 'Theology, Church History, Homiletics. 3 hours.',
    run(h) {
      const w = Math.round(8 * h.bonus('study'));
      h.grow('word', w);
      return `Attended lectures on Homiletics. +${w} word.`;
    },
  },
  {
    id: 'exam', emoji: '📝', name: (s) => `Write Semester ${s.semester} Exam`, group: 'school', energy: 30, once: true,
    when: (s) => s.stage === STAGE.student,
    avail: (s) => (s.word >= examNeed(s.semester) ? true : `Needs ${examNeed(s.semester)} word`),
    desc: (s) => (s.word >= examNeed(s.semester) ? '5 Bible questions. Score 4 or more to pass.' : `Study more first: needs ${examNeed(s.semester)} word.`),
    run(h) { h.startQuiz('exam', 5); return null; },
  },

  /* ---------------------------------------------------------- evangelism missions */
  ...MISSIONS.map((m) => ({
    id: m.id, emoji: m.emoji, name: m.name, group: 'mission', energy: m.energy, once: true, mission: m, away: m.hours * 60,
    zone: ['busstop'], where: 'the bus stop',
    when: (s) => !isPastor(s) && (s.stage >= STAGE.member || s.role === 'minister'),
    cost: m.cost ? () => m.cost : undefined,
    avail: (s, c) => {
      if (s.faith < m.faith || s.character < m.character) return `Needs faith ${m.faith}+ and character ${m.character}+`;
      if (m.level === 5 && !['Sat', 'Sun'].includes(c.weekdayShort)) return 'Weekends only';
      if (!between(c, 6, 18)) return 'Danfos run to the mission field 6am–6pm';
      return true;
    },
    desc: () => `${'🔥'.repeat(m.level)} ${m.desc} Pays ${naira(m.pay)} + ${m.points}⭐.`,
    run(h) {
      const { s } = h;
      const prep = 0.6 + (s.faith + s.word) / 250;
      const souls = Math.max(0, Math.round(h.rand(m.souls[0], m.souls[1]) * prep));
      s.souls += souls;
      s.naira += m.pay;
      h.grow('faith', 2 + m.level); h.grow('character', 1 + m.level);
      h.sound('coin');
      const trial = h.chance(0.25 + m.level * 0.1) ? ` ${h.pick(m.hard)}` : '';
      return `${m.name}: ${souls ? `${souls} ${souls === 1 ? 'person' : 'people'} gave their lives to Christ!` : 'No one responded today, but seeds were sown.'}${trial} Missions stipend ${naira(m.pay)}.` + h.reward(3 + m.level * 3, m.points);
    },
  })),

  /* ---------------------------------------------------------- role duties (outside services) */
  {
    id: 'welcome', emoji: '👋', name: 'Welcome First-timers', group: 'duty', role: 'usher', energy: 15, once: true,
    when: (s) => s.role === 'usher',
    zone: ['gate', 'compound', 'church-hall'], where: 'the church entrance',
    avail: (s, c) => (c.weekdayShort === 'Sun' && between(c, 7, 12) ? true : 'Sunday 7am–12pm'),
    desc: () => 'Smile, take their details, hand out welcome packs.',
    run(h) { h.grow('character', 3); return 'Three first-timers said they will come back next week.' + h.reward(6, 4); },
  },
  {
    id: 'patrol', emoji: '🔦', name: 'Night Patrol', group: 'duty', role: 'security', energy: 30, once: true, stay: 25,
    when: (s) => s.role === 'security',
    zone: ['gate', 'carpark', 'compound'], where: 'the church compound',
    avail: (s, c) => (['Fri', 'Sat'].includes(c.weekdayShort) && between(c, 20, 4) ? true : 'Fri & Sat nights, 8pm–4am'),
    desc: () => 'Walk the compound while the church sleeps (or prays).',
    run(h) { h.grow('character', 2); return 'Quiet night. You prayed while you patrolled.' + h.reward(8, 5); },
  },
  {
    id: 'rehearse', emoji: '🎼', name: 'Choir Rehearsal', group: 'duty', role: 'choir', energy: 25, once: true, stay: 25,
    when: (s) => s.role === 'choir',
    zone: ['choir', 'church-hall', 'altar'], where: 'the choir stand',
    avail: (s, c) => (['Tue', 'Thu', 'Sat'].includes(c.weekdayShort) && between(c, 16, 21) ? true : 'Tue, Thu, Sat 4pm–9pm'),
    desc: () => 'Practise Sunday\'s songs with the band.',
    run(h) { h.grow('faith', 3); return 'You finally got the alto line right.' + h.reward(8, 4); },
  },
  {
    id: 'clips', emoji: '✂️', name: 'Edit Sermon Clips', group: 'duty', role: 'media', energy: 20, once: true, stay: 15,
    when: (s) => s.role === 'media',
    zone: ['media', 'home'], where: 'the media desk or home',
    avail: (s, c) => (c.weekdayShort === 'Sun' ? 'Not on Sunday' : true),
    desc: () => 'Post short clips on the church\'s pages.',
    run(h) { h.grow('word', 3); return `Your clip of last Sunday's sermon got ${h.randInt(2, 9)},000 views.` + h.reward(6, 4); },
  },
  {
    id: 'clean', emoji: '🧹', name: 'Clean the Church', group: 'duty', role: 'hospitality', energy: 25, once: true, stay: 25,
    when: (s) => s.role === 'hospitality',
    zone: ['church-hall', 'altar', 'kitchen'], where: 'the church hall',
    avail: (s, c) => (c.weekdayShort === 'Sat' && between(c, 7, 19) ? true : 'Saturdays 7am–7pm'),
    desc: () => 'Saturday sanitation, getting ready for Sunday.',
    run(h) { h.grow('character', 3); return 'The auditorium is shining for Sunday.' + h.reward(8, 5); },
  },
  {
    id: 'lesson', emoji: '✏️', name: 'Prepare Next Lesson', group: 'duty', role: 'children', energy: 15, once: true, stay: 15,
    when: (s) => s.role === 'children',
    zone: ['home', 'children'], where: 'home or children\'s church',
    avail: (s, c) => (c.weekdayShort === 'Sun' ? 'Not on Sunday' : true),
    desc: () => 'Plan Sunday\'s Bible story and craft.',
    run(h) { h.grow('word', 4); return 'Lesson ready: Noah\'s ark with paper animals.' + h.reward(6, 3); },
  },
  {
    id: 'intercede', emoji: '🔥', name: 'Intercession Session', group: 'duty', role: 'prayer', energy: 30, once: true, kneel: true,
    when: (s) => s.role === 'prayer',
    zone: ['prayer-room', 'altar'], where: 'the prayer room',
    avail: (s, c) => (c.current ? 'During services you intercede at your post' : true),
    desc: () => 'Kneel (P) in the prayer room and stand in the gap for the church and the nation.',
    run(h) { const f = Math.round(7 * h.bonus('prayer')); h.grow('faith', f); return `You prayed for the church, the pastor, the sick and Nigeria. +${f} faith.` + h.reward(10, 6); },
  },
  {
    id: 'prayerline', emoji: '☎️', name: 'Answer the Prayer Line', group: 'duty', role: 'prayer', energy: 20, once: true,
    when: (s) => s.role === 'prayer',
    avail: (s, c) => (c.weekdayShort === 'Sun' ? 'Not on Sunday' : between(c, 8, 22) ? true : 'Lines open 8am–10pm'),
    desc: () => 'People call in with needs. Listen and pray with them.',
    run(h) { h.grow('character', 3); h.grow('faith', 2); return 'A woman called crying about her son. You prayed with her for 20 minutes.' + h.reward(8, 5); },
  },
  {
    id: 'invite', emoji: '💌', name: 'Invite Someone to Church', group: 'duty', role: 'worshipper', energy: 15, once: true,
    when: (s) => s.role === 'worshipper',
    zone: ['street', 'market', 'busstop'], where: 'the street or market',
    desc: () => 'Your neighbour, a trader, your barber.',
    run(h) { h.grow('character', 2); return h.pick(['Your barber said he will come on Sunday. We shall see.', 'Mama Titi at the market promised to come with her children.', 'The okada man laughed, then asked for the address.']) + h.reward(6, 4); },
  },
  {
    id: 'fellowship', emoji: '🏠', name: 'House Fellowship', group: 'duty', role: 'worshipper', energy: 25, once: true, away: 2 * 60,
    when: (s) => s.role === 'worshipper' || (isMinister(s) && !isPastor(s)),
    avail: (s, c) => (['Tue', 'Thu'].includes(c.weekdayShort) && between(c, 17, 21) ? true : 'Tue & Thu, 5pm–9pm'),
    desc: () => 'Bible study and gist in a member\'s living room in Sabo. 2 hours.',
    run(h) { h.grow('faith', 4); h.grow('word', 3); return 'Good word, good small chops, good people.' + h.reward(8, 5); },
  },
  {
    id: 'explore', emoji: '🔎', name: 'Ask Questions About the Faith', group: 'duty', role: 'visitor', energy: 15, once: true,
    when: (s) => s.role === 'visitor',
    zone: ['church-hall', 'compound', 'gate', 'kitchen'], where: 'the church',
    desc: () => 'Chat with a member after service.',
    run(h) { h.grow('word', 3); h.grow('faith', 2); return 'You asked why Christians pray in Jesus\' name. The answer made sense.' + h.reward(8, 4); },
  },
  {
    id: 'followup', emoji: '🚪', name: 'Receive a Follow-up Visit', group: 'duty', role: 'visitor', energy: 10, once: true,
    when: (s) => s.role === 'visitor',
    zone: ['home'], where: 'home',
    avail: (s, c) => (c.weekdayShort === 'Tue' && between(c, 10, 20) ? true : 'Tuesdays, 10am–8pm'),
    desc: () => 'Someone from the church comes to check on you.',
    run(h) { h.grow('faith', 4); return 'Sister Funke visited with biscuits and a smile. You feel welcome.' + h.reward(6, 3); },
  },
  {
    id: 'changerole', emoji: '🔄', name: 'Change Role', group: 'duty', energy: 0,
    when: (s) => !isPastor(s),
    desc: () => 'Serve somewhere else. Your rank starts over.',
    run(h) { h.chooseRole(); return null; },
  },

  /* ---------------------------------------------------------- distractions */
  {
    id: 'viewing', emoji: '⚽', name: 'Football at the Viewing Centre', group: 'shady', energy: 0, once: true, shady: true, away: 3 * 60, skipsService: true,
    when: (s) => !isPastor(s),
    cost: () => 500,
    avail: (s, c) => (c.weekdayShort === 'Sun' && between(c, 6, 11) && !s.doneToday.sunday ? true : 'Sunday mornings'),
    desc: () => 'Big match this morning. Church can wait... abi?',
    run(h) {
      const { s } = h;
      s.doneToday.sunday = true; s.skippedSunday = true;
      h.grow('faith', -6); h.gain('energy', 15);
      return 'Your team won 2-1! But you missed church. -6 faith, +15 energy.';
    },
  },
  {
    id: 'sleepin', emoji: '🛌', name: 'Sleep In on Sunday', group: 'shady', energy: 0, once: true, shady: true, away: 5 * 60, skipsService: true,
    when: (s) => !isPastor(s),
    zone: ['home'], where: 'home',
    avail: (s, c) => (c.weekdayShort === 'Sun' && between(c, 5, 10) && !s.doneToday.sunday ? true : 'Sunday mornings'),
    desc: () => 'Your bed is calling you. Just this once.',
    run(h) {
      const { s } = h;
      s.doneToday.sunday = true; s.skippedSunday = true;
      h.gain('energy', 25); h.grow('faith', -4);
      return 'You slept till 1pm. +25 energy, but you missed church. -4 faith.';
    },
  },
  {
    id: 'bet', emoji: '🎰', name: 'Bet on Football', group: 'shady', energy: 5, shady: true,
    cost: () => 1000,
    desc: () => 'Stake ₦1,000. "Sure banker" from your guy.',
    run(h) {
      const won = h.chance(0.3);
      if (won) h.s.naira += 3500;
      return (won ? 'You won ₦3,500! The devil smiles. ' : 'You lost ₦1,000. "Next one go enter." ') + h.fall('gambling', 4);
    },
  },
  {
    id: 'owambe', emoji: '🎉', name: 'Owambe Instead of Vigil', group: 'shady', energy: 0, once: true, shady: true, away: 5 * 60, skipsService: true,
    when: (s) => !isPastor(s),
    avail: (s, c) => (c.weekdayShort === 'Fri' && between(c, 18, 23) && !s.doneToday.vigil ? true : 'Friday nights'),
    desc: () => 'Owambe in Surulere: jollof, small chops, DJ. Vigil will still be there next week.',
    run(h) {
      h.s.doneToday.vigil = true;
      h.gain('energy', 20); h.grow('faith', -5); h.s.points += 2;
      return 'You danced till 2am. +20 energy, +2⭐, but -5 faith.';
    },
  },
  {
    id: 'beer', emoji: '🍺', name: 'Gist at the Beer Parlour', group: 'shady', energy: 10, once: true, shady: true,
    cost: () => 1500,
    zone: ['market', 'street', 'busstop'], where: 'the street',
    desc: () => 'Pepper soup, cold drink, plenty gist about people.',
    run(h) { h.grow('faith', -3); return 'Good pepper soup. Plenty gossip. ' + h.fall('gossip and drunkenness', 4); },
  },
  {
    id: 'yahoo', emoji: '💻', name: 'Join the "Yahoo" Boys', group: 'shady', energy: 30, once: true, shady: true,
    when: (s) => !isPastor(s),
    desc: () => 'Your old friend says one "client" pays more than a year of work.',
    run(h) {
      const m = Math.round(h.s.salary * h.rand(8, 15));
      h.s.naira += m;
      h.s.frauds += 1;
      return `You got ${naira(m)} from a "client" abroad. ` + h.fall('fraud', 15);
    },
  },

  /* ---------------------------------------------------------- pastoral ministry (after ordination) */
  {
    id: 'service', emoji: '🙌', name: 'Hold Service', group: 'pastor', energy: 30, once: true, away: 3 * 60,
    when: isPastor,
    desc: (s, c) => (c.weekdayShort === 'Sun' ? 'Sunday service! The whole flock gathers.' : 'Midweek service. Sunday offerings are bigger.'),
    run(h) {
      const { s } = h;
      const P = s.pastor;
      let q = h.quality();
      let note = '';
      if (!P.owned.generator && P.venue > 0 && h.chance(0.3)) {
        q *= 0.6;
        const lost = -h.addMembers(-P.members * 0.03);
        note = ` NEPA took light mid-sermon. You preached by phone torchlight.${lost > 0 ? ` ${lost} members went home.` : ''}`;
      }
      const offering = P.members * 350 * q * h.bonus('service') * h.faithMult() * (h.c.weekdayShort === 'Sun' ? 3 : 1) * h.rand(0.8, 1.2);
      s.naira += Math.round(offering);
      h.grow('faith', 3); h.grow('word', 1);
      const joined = h.addMembers(Math.max(1, P.members * 0.012 * q * h.charMult()));
      h.sound('coin');
      return `Service done. Offerings: ${naira(offering)}.${joined > 0 ? ` +${joined} new members.` : ''}${note}`;
    },
  },
  {
    id: 'evangelism', emoji: '📢', name: 'Outreach & Evangelism', group: 'pastor', energy: 25, away: 2 * 60,
    when: isPastor,
    desc: () => 'Take the Gospel to the streets and markets of Yaba.',
    run(h) {
      const P = h.s.pastor;
      const n = h.addMembers(h.randInt(2, 5) * (1 + P.venue) * h.charMult() * h.fameMult());
      h.grow('faith', 1);
      return n > 0 ? `Souls were won at the market. +${n} members.` : 'The church is full! Move to a bigger venue to grow.';
    },
  },
  {
    id: 'pvigil', emoji: '🕯️', name: 'Night Vigil (your church)', group: 'pastor', energy: 35, once: true, away: 4 * 60, skipsService: true,
    when: isPastor,
    avail: (s, c) => (between(c, 20, 2) ? true : 'Vigils start after 8pm'),
    desc: (s, c) => (c.weekdayShort === 'Fri' ? 'Friday vigil: the whole church prays.' : 'All-night prayer. Fridays bring more people.'),
    run(h) {
      const f = Math.round((h.c.weekdayShort === 'Fri' ? 12 : 6) * h.bonus('vigil'));
      h.grow('faith', f);
      const n = h.addMembers(h.s.pastor.members * 0.02 * h.bonus('vigil') + 1);
      return `Prayed through the night. +${f} faith, +${n} members.`;
    },
  },
  {
    id: 'counsel', emoji: '🤝', name: 'Counsel & Visit Members', group: 'pastor', energy: 20,
    when: isPastor,
    desc: () => 'Pray with the sick, guide young couples.',
    run(h) { h.grow('character', 3); h.grow('fame', 1); return 'Your members feel cared for. +3 character.'; },
  },
  {
    id: 'charity', emoji: '🍚', name: 'Community Outreach', group: 'pastor', energy: 25, away: 3 * 60,
    when: isPastor,
    cost: (s) => 10000 * (1 + s.pastor.venue * 2),
    desc: () => 'Feed families, visit the hospital and the prison.',
    run(h) {
      h.grow('character', 6); h.grow('fame', 3);
      const n = h.addMembers(h.randInt(3, 8) * (1 + h.s.pastor.venue));
      return `You showed Christ's love to the community. +6 character, +${n} members.`;
    },
  },
  {
    id: 'crusade', emoji: '🏟️', name: 'Hold a Crusade', group: 'pastor', energy: 50, once: true, away: 6 * 60,
    when: (s) => isPastor(s) && s.pastor.venue >= 1,
    cost: (s) => 50000 * 3 ** (s.pastor.venue - 1),
    desc: () => 'Open-air Gospel crusade at Tafawa Balewa Square.',
    run(h) {
      const P = h.s.pastor;
      const n = h.addMembers((P.members * 0.08 + 20 * P.venue) * h.bonus('crusade') * h.charMult() * h.fameMult() * h.rand(0.7, 1.3));
      h.grow('faith', 5); h.grow('fame', 8);
      return `Many gave their lives to Christ! +${n} members, +8 fame.`;
    },
  },
  {
    id: 'oil', emoji: '🫙', name: 'Sell "Anointing Oil"', group: 'shady', energy: 15, once: true, shady: true,
    when: (s) => isPastor(s) && s.pastor.members >= 10,
    desc: () => 'Groundnut oil in small bottles, ₦2,000 each. Quick money...',
    run(h) {
      const m = h.s.pastor.members * 150 * h.rand(0.8, 1.2);
      h.s.naira += Math.round(m);
      return `Sold out: ${naira(m)}. ` + h.fall('greed', 6);
    },
  },
  {
    id: 'seed', emoji: '🌱', name: '"Special Seed" Offering', group: 'shady', energy: 20, once: true, shady: true,
    when: (s) => isPastor(s) && s.pastor.members >= 10,
    desc: () => '"Sow ₦50k and your visa will come through." Hmm.',
    run(h) {
      const m = h.s.pastor.members * 800 * h.rand(0.8, 1.2);
      h.s.naira += Math.round(m);
      const lost = -h.addMembers(-h.s.pastor.members * 0.02);
      return `Collected ${naira(m)}.${lost > 0 ? ` ${lost} members left quietly.` : ''} ` + h.fall('manipulating the flock', 10);
    },
  },
  {
    id: 'poach', emoji: '🎣', name: 'Poach Members', group: 'shady', energy: 25, once: true, shady: true,
    when: (s) => isPastor(s) && s.pastor.members >= 10,
    desc: () => 'Promise the choir of the church down the road a "better anointing".',
    run(h) {
      const n = h.addMembers(h.randInt(5, 12) * (1 + h.s.pastor.venue));
      return `+${n} members from another church. ` + h.fall('sheep stealing', 7);
    },
  },
];

export const ACTION_BY_ID = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));

/**
 * Service duty credited at the end of a service when a worker stayed at their post.
 * Keyed by role. `kinds` = services where the duty applies.
 */
export const SERVICE_DUTIES = {
  security: { id: 'gate', emoji: '🚧', name: 'Gate & Car Park Duty', energy: 30, kinds: ['sunday', 'study', 'vigil'],
    run(h) { h.grow('character', 2); h.grow('faith', 2); return `You parked ${h.randInt(40, 80)} cars without one scratch. The Head of Security nodded at you.` + h.reward(10, 6); } },
  usher: { id: 'seat', emoji: '🪑', name: 'Usher at Service', energy: 30, kinds: ['sunday', 'study', 'vigil'],
    run(h) { h.grow('character', 2); h.grow('faith', 2); return 'You seated 200 people and found a front seat for a pregnant woman.' + h.reward(10, 6); } },
  choir: { id: 'ministersong', emoji: '🎤', name: 'Minister in Song', energy: 30, kinds: ['sunday', 'vigil'],
    run(h) { h.grow('faith', 5); return 'The whole church was on its feet. Some people were in tears.' + h.reward(12, 8); } },
  media: { id: 'sound', emoji: '🎚️', name: 'Run Sound & Projection', energy: 30, kinds: ['sunday', 'study', 'vigil'],
    run(h) { h.grow('character', 2); return 'No feedback, lyrics on time, livestream steady. Nobody noticed you, which means you did it right.' + h.reward(10, 6); } },
  hospitality: { id: 'cookprog', emoji: '🍲', name: 'Cook for the Programme', energy: 35, kinds: ['sunday', 'vigil'],
    run(h) { h.grow('character', 3); h.eat(20); return 'Jollof finished. Everybody chopped. Nobody complained.' + h.reward(10, 6); } },
  children: { id: 'teach', emoji: '🧒', name: 'Teach Sunday School', energy: 30, kinds: ['sunday'],
    run(h) { h.grow('character', 3); h.grow('word', 2); return 'The kids acted out David and Goliath. Little Ayo played Goliath and refused to fall down.' + h.reward(12, 7); } },
  prayer: { id: 'standgap', emoji: '🔥', name: 'Intercede During Service', energy: 25, kinds: ['sunday', 'study', 'vigil'],
    run(h) { const f = Math.round(6 * h.bonus('prayer')); h.grow('faith', f); return `You covered the service in prayer. +${f} faith.` + h.reward(10, 6); } },
};

/** Attendance credit for each service kind (sitting in the hall or serving at your post). */
export const SERVICE_CREDIT = {
  sunday: {
    energy: 25,
    run(h) {
      h.s.services += 1;
      const f = Math.round(10 * h.bonus('service'));
      h.grow('faith', f); h.grow('word', 3); h.grow('character', 2);
      return `You worshipped with the brethren. +${f} faith, +3 word.` + h.reward(4, 5 + (h.s.items.outfit ? 5 : 0));
    },
  },
  study: {
    energy: 20,
    run(h) {
      h.s.services += 1;
      const w = Math.round(7 * h.bonus('study'));
      h.grow('word', w); h.grow('faith', 4);
      return `Great study on the book of Acts. +${w} word, +4 faith.` + h.reward(3, 3);
    },
  },
  vigil: {
    energy: 35,
    run(h) {
      h.s.services += 1;
      const f = Math.round(12 * h.bonus('vigil')) + (h.s.items.tambourine ? 2 : 0);
      h.grow('faith', f); h.grow('character', 1);
      return `You prayed through the night. +${f} faith.` + h.reward(4, 4);
    },
  },
  cleaning: {
    energy: 25,
    run(h) {
      h.grow('character', 3); h.grow('faith', 2);
      return `The sanctuary is shining for tomorrow. ${h.pick(['Somebody found ₦500 under a pew and returned it.', 'Mama Titi brought zobo for everyone.', 'You mopped the altar steps twice.'])}` + h.reward(6, 5);
    },
  },
  practice: {
    energy: 25,
    run(h) {
      h.s.services += 1;
      h.grow('faith', 4); h.grow('word', 2);
      return `Choir practice done. The director finally said the alto part was "not bad". Tomorrow will be glorious.` + h.reward(8, 6);
    },
  },
};

/** Ordered sections for the Today tab. */
export const GROUPS = [
  ['walk', 'Your walk with God'],
  ['duty', 'Your duty'],
  ['school', 'Bible school'],
  ['pastor', 'Shepherd the flock'],
  ['mission', 'Evangelism missions · harder pays more'],
  ['life', 'Daily life'],
  ['shady', 'Distractions · the devil is busy'],
];

export { isPastor, isMinister };
