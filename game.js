'use strict';

/* =========================================================================
   Pastor Life — a virtual Christian journey
   New convert → baptism → worker → Bible school → ordination → shepherd.
   Real-life temptations (quick money, vanity, compromise) are in the game
   as distractions, with real-life consequences.
   Scripture quotations are from the King James Version (public domain).
   All people and churches in the game are fictional.
   ========================================================================= */

const SAVE_KEY = 'pastorlife.v2';
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WIN_MEMBERS = 25000;

/* ---------------- scripture ---------------- */

const VERSES = [
  ['John 3:16', 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.'],
  ['Philippians 4:13', 'I can do all things through Christ which strengtheneth me.'],
  ['Proverbs 3:5', 'Trust in the LORD with all thine heart; and lean not unto thine own understanding.'],
  ['Psalm 23:1', 'The LORD is my shepherd; I shall not want.'],
  ['Joshua 1:9', 'Have not I commanded thee? Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.'],
  ['Romans 8:28', 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.'],
  ['Matthew 6:33', 'But seek ye first the kingdom of God, and his righteousness; and all these things shall be added unto you.'],
  ['Isaiah 40:31', 'But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.'],
  ['Psalm 119:105', 'Thy word is a lamp unto my feet, and a light unto my path.'],
  ['Hebrews 11:1', 'Now faith is the substance of things hoped for, the evidence of things not seen.'],
  ['Psalm 46:1', 'God is our refuge and strength, a very present help in trouble.'],
  ['Jeremiah 29:11', 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.'],
  ['1 Thessalonians 5:17', 'Pray without ceasing.'],
  ['Hebrews 10:25', 'Not forsaking the assembling of ourselves together, as the manner of some is; but exhorting one another: and so much the more, as ye see the day approaching.'],
  ['2 Timothy 2:15', 'Study to shew thyself approved unto God, a workman that needeth not to be ashamed, rightly dividing the word of truth.'],
];
const V_STUDY = VERSES[14];
const V_REFUGE = VERSES[10];
const V_CONFESS = ['1 John 1:9', 'If we confess our sins, he is faithful and just to forgive us our sins, and to cleanse us from all unrighteousness.'];
const V_BAPTISM = ['Matthew 28:19', 'Go ye therefore, and teach all nations, baptizing them in the name of the Father, and of the Son, and of the Holy Ghost.'];
const V_FORGIVE = ['Ephesians 4:32', 'And be ye kind one to another, tenderhearted, forgiving one another, even as God for Christ\'s sake hath forgiven you.'];
const V_FRUIT = ['Galatians 5:22-23', 'But the fruit of the Spirit is love, joy, peace, longsuffering, gentleness, goodness, faith, meekness, temperance: against such there is no law.'];
const V_GROWTH = ['Acts 2:47', 'And the Lord added to the church daily such as should be saved.'];
const V_MONEY = ['1 Timothy 6:10', 'For the love of money is the root of all evil: which while some coveted after, they have erred from the faith, and pierced themselves through with many sorrows.'];
const V_REAP = ['Galatians 6:7', 'Be not deceived; God is not mocked: for whatsoever a man soweth, that shall he also reap.'];

const verseText = (v) => `"${v[1]}"\n— ${v[0]} (KJV)`;

/* ---------------- Bible school quiz ---------------- */
// [question, correct answer, wrong, wrong, wrong]
const QUIZ = [
  ['Who built the ark?', 'Noah', 'Moses', 'Abraham', 'Elijah'],
  ['What is the first book of the Bible?', 'Genesis', 'Exodus', 'Matthew', 'Psalms'],
  ['How many disciples did Jesus choose?', '12', '10', '7', '70'],
  ['Who was swallowed by a great fish?', 'Jonah', 'Peter', 'Elisha', 'Job'],
  ['In which town was Jesus born?', 'Bethlehem', 'Nazareth', 'Jerusalem', 'Capernaum'],
  ['Who killed Goliath?', 'David', 'Saul', 'Samson', 'Jonathan'],
  ['Who led Israel out of Egypt?', 'Moses', 'Joshua', 'Aaron', 'Joseph'],
  ['Which disciple denied Jesus three times?', 'Peter', 'Judas', 'Thomas', 'John'],
  ['What was Jesus\' first miracle (John 2)?', 'Turning water into wine', 'Feeding the 5,000', 'Walking on water', 'Raising Lazarus'],
  ['How many books are in the Protestant Bible?', '66', '73', '39', '72'],
  ['Who was thrown into the lions\' den?', 'Daniel', 'Shadrach', 'Jeremiah', 'Ezekiel'],
  ['Who betrayed Jesus?', 'Judas Iscariot', 'Peter', 'Pilate', 'Barabbas'],
  ['Who was the first king of Israel?', 'Saul', 'David', 'Solomon', 'Samuel'],
  ['Who wrote most of the Psalms?', 'David', 'Solomon', 'Moses', 'Asaph'],
  ['Which king asked God for wisdom?', 'Solomon', 'David', 'Hezekiah', 'Josiah'],
  ['Who was sold into slavery by his brothers?', 'Joseph', 'Benjamin', 'Jacob', 'Reuben'],
  ['Whose great strength was connected to his uncut hair?', 'Samson', 'Gideon', 'Goliath', 'Absalom'],
  ['On which day did God rest after creation?', 'The seventh day', 'The sixth day', 'The first day', 'The third day'],
  ['What is the last book of the Bible?', 'Revelation', 'Jude', 'Malachi', 'Acts'],
  ['Who baptized Jesus?', 'John the Baptist', 'Peter', 'Andrew', 'Elijah'],
  ['In which river was Jesus baptized?', 'Jordan', 'Nile', 'Euphrates', 'Tigris'],
  ['Saul of Tarsus is better known as...?', 'Paul', 'Silas', 'Barnabas', 'Timothy'],
  ['Which prophet went up to heaven by a whirlwind?', 'Elijah', 'Elisha', 'Isaiah', 'Moses'],
  ['How many days did Jesus fast in the wilderness?', '40', '7', '3', '21'],
  ['Who is the oldest man recorded in the Bible?', 'Methuselah', 'Noah', 'Adam', 'Abraham'],
  ['What did God give Moses on Mount Sinai?', 'The Ten Commandments', 'The Ark', 'A golden calf', 'Manna'],
  ['Who was Abraham\'s son of promise, born to Sarah?', 'Isaac', 'Ishmael', 'Jacob', 'Esau'],
  ['Which disciple doubted until he saw the risen Jesus?', 'Thomas', 'Philip', 'Matthew', 'James'],
  ['Which tax collector climbed a sycamore tree to see Jesus?', 'Zacchaeus', 'Matthew', 'Nicodemus', 'Bartimaeus'],
  ['Whom did Jesus raise after four days in the tomb?', 'Lazarus', 'Jairus\' daughter', 'Dorcas', 'Eutychus'],
  ['In which book is the "fruit of the Spirit" listed?', 'Galatians', 'Romans', 'Ephesians', 'James'],
  ['Which chapter is called the "love chapter"?', '1 Corinthians 13', 'John 3', 'Psalm 23', 'Romans 8'],
  ['Who replaced Judas among the twelve apostles?', 'Matthias', 'Stephen', 'Barnabas', 'Silas'],
  ['On what feast did the Holy Spirit come upon the disciples in Acts 2?', 'Pentecost', 'Passover', 'Tabernacles', 'Purim'],
  ['Who was Ruth\'s mother-in-law?', 'Naomi', 'Orpah', 'Hannah', 'Leah'],
  ['Who interpreted Pharaoh\'s dreams?', 'Joseph', 'Daniel', 'Moses', 'Jacob'],
  ['Which queen risked her life to save the Jews?', 'Esther', 'Vashti', 'Jezebel', 'Sheba'],
  ['How many loaves fed the five thousand?', 'Five', 'Seven', 'Twelve', 'Two'],
  ['Which Gospel writer was a physician?', 'Luke', 'Mark', 'Matthew', 'John'],
  ['Who killed his brother Abel?', 'Cain', 'Seth', 'Esau', 'Lamech'],
  ['The walls of which city fell after Israel marched around it?', 'Jericho', 'Ai', 'Babylon', 'Nineveh'],
  ['Who spoke for Moses before Pharaoh?', 'Aaron', 'Joshua', 'Caleb', 'Jethro'],
  ['Which Psalm begins "The LORD is my shepherd"?', 'Psalm 23', 'Psalm 1', 'Psalm 91', 'Psalm 121'],
  ['How many books are in the New Testament?', '27', '39', '24', '30'],
  ['Who wrote the letter to the Romans?', 'Paul', 'Peter', 'James', 'John'],
];

/* ---------------- world data ---------------- */

// Each church tradition strengthens different parts of the walk.
const CHURCH_TYPES = {
  pentecostal: { emoji: '🔥', name: 'Pentecostal', perk: 'Stronger vigils and crusades', bonus: { vigil: 1.5, crusade: 1.25 } },
  mission:     { emoji: '⛪', name: 'Mission (Anglican / Methodist)', perk: 'Richer services and liturgy', bonus: { service: 1.25, study: 1.15 } },
  baptist:     { emoji: '📖', name: 'Baptist', perk: 'Deeper Bible study', bonus: { study: 1.4 } },
  aladura:     { emoji: '🤍', name: 'White Garment (Aladura)', perk: 'Powerful prayer life', bonus: { prayer: 1.6, vigil: 1.25 } },
};
const bonus = (tag) => (CHURCH_TYPES[S.ctype] && CHURCH_TYPES[S.ctype].bonus[tag]) || 1;

const STAGES = ['New Convert', 'Member', 'Worker', 'Bible School Student', 'Bible School Graduate', 'Pastor'];

const DEPARTMENTS = [
  { id: 'choir',  emoji: '🎶', name: 'Choir' },
  { id: 'ushers', emoji: '🧤', name: 'Ushering' },
  { id: 'evang',  emoji: '📢', name: 'Evangelism' },
  { id: 'sunday', emoji: '🧒', name: 'Children\'s Church' },
];

const VENUES = [
  { name: 'House Fellowship', emoji: '🏠', cap: 20,    rent: 0,       cost: 0 },
  { name: 'Rented Shop',      emoji: '🏚️', cap: 50,    rent: 5000,    cost: 60000 },
  { name: 'School Classroom', emoji: '🏫', cap: 150,   rent: 20000,   cost: 250000 },
  { name: 'Warehouse',        emoji: '🏭', cap: 500,   rent: 80000,   cost: 1200000 },
  { name: 'Auditorium',       emoji: '🏛️', cap: 2500,  rent: 350000,  cost: 8000000 },
  { name: 'Cathedral',        emoji: '⛪', cap: 9000,  rent: 1500000, cost: 50000000 },
  { name: 'Camp Ground',      emoji: '🏕️', cap: 30000, rent: 4000000, cost: 250000000 },
];

const TITLES = [
  [0, 'Pastor'],
  [150, 'Senior Pastor'],
  [600, 'Reverend'],
  [2500, 'Bishop'],
  [9000, 'Archbishop'],
  [WIN_MEMBERS, 'General Overseer'],
];

// Church equipment. `q` adds to service quality. Vanity items trade character for fame.
const UPGRADES = [
  { id: 'pa',         emoji: '🎤', name: 'PA System',         cost: 25000,      q: 0.15, desc: 'So everyone at the back can hear the Word.' },
  { id: 'generator',  emoji: '🔌', name: 'Generator',         cost: 40000,      q: 0,    desc: 'Power cuts can no longer interrupt service. Fuel costs extra.' },
  { id: 'keyboard',   emoji: '🎹', name: 'Keyboard & Drums',  cost: 60000,      q: 0.15, desc: 'Praise and worship that lifts the house.' },
  { id: 'chairs',     emoji: '🪑', name: 'New Chairs',        cost: 100000,     q: 0.1,  desc: 'No more standing during long services.' },
  { id: 'livestream', emoji: '📱', name: 'Livestream Setup',  cost: 800000,     q: 0.2,  desc: 'Reach the sick, the travelling and the diaspora. +Fame daily.' },
  { id: 'bus',        emoji: '🚌', name: 'Church Bus',        cost: 2500000,    q: 0.1,  desc: 'Bring members to church. More people join daily.' },
  { id: 'school',     emoji: '🏫', name: 'Mission School',    cost: 20000000,   q: 0.2,  desc: 'Educate the community\'s children. +Character.', character: 10 },
  { id: 'jeep',       emoji: '🚙', name: 'Pastor\'s Jeep',    cost: 15000000,   q: 0,    desc: 'Big fame boost. Some members will start asking questions.', vanity: true, fame: 15, character: -6 },
  { id: 'jet',        emoji: '🛩️', name: 'Private Jet',       cost: 2000000000, q: 0,    desc: 'For "kingdom business". Journalists will be watching.', vanity: true, fame: 30, character: -15 },
];

// Branches: opened once the church owns an Auditorium. Each sends daily support and fame.
const BRANCHES = [
  { id: 'abuja',   flag: '🇳🇬', name: 'Abuja',         cost: 5000000,   daily: 60000 },
  { id: 'ph',      flag: '🇳🇬', name: 'Port Harcourt', cost: 5000000,   daily: 60000 },
  { id: 'accra',   flag: '🇬🇭', name: 'Accra',         cost: 15000000,  daily: 150000 },
  { id: 'london',  flag: '🇬🇧', name: 'London',        cost: 60000000,  daily: 600000 },
  { id: 'houston', flag: '🇺🇸', name: 'Houston',       cost: 80000000,  daily: 800000 },
  { id: 'toronto', flag: '🇨🇦', name: 'Toronto',       cost: 80000000,  daily: 800000 },
];

const STARTS = {
  home: {
    emoji: '🏡', title: 'Raised in a Christian Home',
    text: 'You grew up singing in children\'s church, but now you must make the faith your own.',
    faith: 30, word: 20, character: 45, funds: 15000, salary: 3000, job: 'Apprentice tailor',
  },
  convert: {
    emoji: '✨', title: 'New Convert',
    text: 'A colleague invited you to church last Sunday and you gave your life to Christ. Everything is new!',
    faith: 20, word: 5, character: 40, funds: 40000, salary: 5000, job: 'Market trader',
  },
};

/* ---------------- state ---------------- */

let S = null;

function newState(name, church, ctype) {
  const startId = Math.random() < 0.5 ? 'home' : 'convert';
  const st = STARTS[startId];
  return {
    name, church, ctype, start: startId,
    day: 1, energy: 100,
    funds: st.funds, salary: st.salary, job: st.job,
    faith: st.faith, word: st.word, character: st.character, fame: 0,
    stage: 0, services: 0, dept: null, semester: 1,
    convicted: false, falls: 0, repentances: 0,
    members: 0, venue: 0, choir: 0, owned: {}, branches: {}, rentMult: 1, missedRent: 0,
    doneToday: {}, won: false, over: false, log: [],
  };
}

function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ }
}
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}

/* ---------------- helpers ---------------- */

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const chance = (p) => Math.random() < p;
const pick = (arr) => arr[randInt(0, arr.length - 1)];
const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

function naira(n) {
  const sign = n < 0 ? '-' : '';
  n = Math.abs(Math.round(n));
  if (n >= 1e9) return sign + '₦' + (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'B';
  if (n >= 1e6) return sign + '₦' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  if (n >= 1e4) return sign + '₦' + (n / 1e3).toFixed(0) + 'k';
  return sign + '₦' + n.toLocaleString('en-NG');
}
function num(n) {
  n = Math.round(n);
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
  return n.toLocaleString('en-NG');
}

const isPastor = () => S.stage >= 5;
const venue = () => VENUES[S.venue];
const weekday = () => WEEKDAYS[(S.day - 1) % 7];
const isSunday = () => weekday() === 'Sun';
const rent = () => Math.round(venue().rent * S.rentMult);
const has = (id) => !!S.owned[id];
const verseOfDay = () => VERSES[(S.day - 1) % VERSES.length];

function title() {
  if (!isPastor()) return STAGES[S.stage];
  let t = TITLES[0][1];
  for (const [min, name] of TITLES) if (S.members >= min) t = name;
  return t;
}

function quality() {
  let q = 1 + S.choir * 0.1;
  for (const u of UPGRADES) if (has(u.id)) q += u.q;
  return q;
}
const faithMult = () => 0.6 + S.faith / 125;
const charMult = () => 0.5 + S.character / 100;
const fameMult = () => 1 + S.fame / 100;

function addMembers(n) {
  const before = S.members;
  S.members = clamp(Math.round(S.members + n), 0, venue().cap);
  return S.members - before;
}
// Faith growth is hindered while carrying unconfessed sin.
function grow(key, delta) {
  if (delta > 0 && S.convicted && key === 'faith') delta = delta / 2;
  S[key] = clamp(S[key] + delta, 0, 100);
}
function log(text) {
  S.log.unshift({ d: S.day, t: text });
  if (S.log.length > 60) S.log.length = 60;
}

// A fall can always be repented of, but its character cost stays.
function fall(sin, characterCost = 8) {
  S.convicted = true;
  S.falls += 1;
  grow('character', -characterCost);
  grow('faith', -5);
  return `You fell into ${sin}. You feel convicted. "Confess & Repent" is on your Ministry tab.`;
}

/* ---------------- actions ---------------- */
// `when` controls whether an action is shown; canDo controls enabling.

const ACTIONS = [
  // ---- personal walk ----
  {
    id: 'sunday', emoji: '⛪', name: 'Attend Sunday Service', energy: 25, once: true,
    when: () => !isPastor(),
    avail: () => isSunday(),
    desc: () => isSunday() ? 'Worship, the Word, and fellowship.' : 'Available on Sundays.',
    run() {
      S.services += 1;
      grow('faith', 10 * bonus('service')); grow('word', 3); grow('character', 2);
      return 'You worshipped with the brethren. +10 faith, +3 word.';
    },
  },
  {
    id: 'biblestudy', emoji: '📚', name: 'Midweek Bible Study', energy: 20, once: true,
    when: () => !isPastor(),
    avail: () => weekday() === 'Wed',
    desc: () => weekday() === 'Wed' ? 'Dig deep into the Scriptures together.' : 'Available on Wednesdays.',
    run() {
      S.services += 1;
      grow('word', 7 * bonus('study')); grow('faith', 4);
      return 'Great study on the book of Acts. +7 word, +4 faith.';
    },
  },
  {
    id: 'mvigil', emoji: '🕯️', name: 'Attend Night Vigil', energy: 35, once: true,
    when: () => !isPastor(),
    avail: () => weekday() === 'Fri',
    desc: () => weekday() === 'Fri' ? 'Pray through the night with the church.' : 'Held on Friday nights.',
    run() {
      S.services += 1;
      const f = Math.round(12 * bonus('vigil'));
      grow('faith', f); grow('character', 1);
      return `You prayed through the night till 5am. +${f} faith.`;
    },
  },
  {
    id: 'pray', emoji: '🙏', name: 'Pray', energy: 10, once: true,
    desc: () => 'Quiet time with the Lord.',
    run() {
      const f = Math.round(5 * bonus('prayer'));
      grow('faith', f);
      return `You spent time in prayer. +${f} faith.`;
    },
  },
  {
    id: 'read', emoji: '📖', name: 'Read the Bible', energy: 15, once: true,
    desc: () => `Today: ${verseOfDay()[0]}`,
    run() {
      grow('word', 5 * bonus('study')); grow('faith', 2);
      return `You meditated on ${verseOfDay()[0]}. +5 word.`;
    },
  },
  {
    id: 'repent', emoji: '💧', name: 'Confess & Repent', energy: 10,
    when: () => S.convicted,
    desc: () => 'Bring it to God. He is faithful to forgive.',
    run() {
      S.convicted = false;
      S.repentances += 1;
      grow('faith', 6); grow('character', 3);
      showModal('🕊️', 'Forgiven', `You poured out your heart to God and turned away from the sin.\n\n${verseText(V_CONFESS)}`, [{ label: 'Thank You, Lord 🙌' }]);
      return 'You are forgiven. +6 faith, +3 character.';
    },
  },
  {
    id: 'work', emoji: '💼', name: 'Go to Work', energy: 40, once: true,
    when: () => !isSunday(),
    desc: () => `${S.job}. Earn about ${naira(S.salary)}.`,
    run() {
      const pay = S.salary * rand(0.8, 1.2);
      S.funds += pay;
      return `Worked hard. Earned ${naira(pay)}.`;
    },
  },
  {
    id: 'help', emoji: '🤲', name: 'Help Someone in Need', energy: 15, once: true,
    when: () => !isPastor(),
    cost: () => Math.max(1000, Math.round(S.salary / 2)),
    desc: () => 'A widow next door needs food money.',
    run() {
      grow('character', 6); grow('faith', 2);
      return 'You gave cheerfully. +6 character.';
    },
  },
  {
    id: 'witness', emoji: '💬', name: 'Share the Gospel', energy: 20,
    when: () => S.stage >= 2 && !isPastor(),
    desc: () => 'Tell a colleague about Jesus.',
    run() {
      grow('faith', 3); grow('character', 2);
      if (chance(0.35)) return 'Your colleague gave their life to Christ! 🎉 +3 faith.';
      return 'They listened politely and promised to think about it. +3 faith.';
    },
  },
  {
    id: 'serve', emoji: '🧹', name: 'Serve in Department', energy: 20, once: true,
    when: () => S.stage >= 2 && !isPastor(),
    desc: () => { const d = DEPARTMENTS.find((x) => x.id === S.dept); return d ? `${d.emoji} ${d.name} duty.` : 'Serve in church.'; },
    run() {
      grow('character', 5); grow('faith', 3);
      return 'You served faithfully in your department. +5 character.';
    },
  },
  // ---- Bible school ----
  {
    id: 'lecture', emoji: '🎓', name: 'Attend Lectures', energy: 30, once: true,
    when: () => S.stage === 3,
    avail: () => !['Sat', 'Sun'].includes(weekday()),
    desc: () => ['Sat', 'Sun'].includes(weekday()) ? 'No lectures on weekends.' : 'Theology, Church History, Homiletics.',
    run() {
      grow('word', 8 * bonus('study'));
      return 'Attended lectures on Homiletics. +8 word.';
    },
  },
  {
    id: 'exam', emoji: '📝', name: () => `Write Semester ${S.semester} Exam`, energy: 30, once: true,
    when: () => S.stage === 3,
    avail: () => S.word >= examNeed(),
    desc: () => S.word >= examNeed() ? '5 Bible questions. Score 4 or more to pass.' : `Study more: needs ${examNeed()} word.`,
    run() { startExam(); return null; },
  },
  // ---- pastoral ministry ----
  {
    id: 'service', emoji: '🙌', name: 'Hold Service', energy: 30, once: true,
    when: isPastor,
    desc: () => isSunday() ? 'Sunday service! The whole flock gathers.' : 'Midweek service. Sunday offerings are bigger.',
    run() {
      let q = quality();
      let note = '';
      if (!has('generator') && S.venue > 0 && chance(0.3)) {
        q *= 0.6;
        const lost = -addMembers(-S.members * 0.03);
        note = ` NEPA took light mid-sermon 😩 You preached by phone torchlight.${lost > 0 ? ` ${lost} members went home.` : ''}`;
      }
      const offering = S.members * 350 * q * bonus('service') * faithMult() * (isSunday() ? 3 : 1) * rand(0.8, 1.2);
      S.funds += offering;
      grow('faith', 3); grow('word', 1);
      const joined = addMembers(Math.max(1, S.members * 0.012 * q * charMult()));
      return `Service done. Offerings: ${naira(offering)}.${joined > 0 ? ` +${joined} new members.` : ''}${note}`;
    },
  },
  {
    id: 'evangelism', emoji: '📢', name: 'Outreach & Evangelism', energy: 25,
    when: isPastor,
    desc: () => 'Take the Gospel to the streets and markets.',
    run() {
      const n = addMembers(randInt(2, 5) * (1 + S.venue) * charMult() * fameMult());
      grow('faith', 1);
      return n > 0 ? `Souls were won at the market. +${n} members.` : 'The church is full! Move to a bigger venue to grow.';
    },
  },
  {
    id: 'vigil', emoji: '🕯️', name: 'Night Vigil', energy: 35, once: true,
    when: isPastor,
    desc: () => weekday() === 'Fri' ? 'Friday vigil: the whole church prays.' : 'All-night prayer. Fridays bring more people.',
    run() {
      const f = Math.round((weekday() === 'Fri' ? 12 : 6) * bonus('vigil'));
      grow('faith', f);
      const n = addMembers(S.members * 0.02 * bonus('vigil') + 1);
      return `Prayed through the night. +${f} faith, +${n} members.`;
    },
  },
  {
    id: 'counsel', emoji: '🤝', name: 'Counsel & Visit Members', energy: 20,
    when: isPastor,
    desc: () => 'Pray with the sick, guide young couples.',
    run() {
      grow('character', 3);
      grow('fame', 1);
      return 'Your members feel cared for. +3 character.';
    },
  },
  {
    id: 'charity', emoji: '🍚', name: 'Community Outreach', energy: 25,
    when: isPastor,
    cost: () => 10000 * (1 + S.venue * 2),
    desc: () => 'Feed families, visit the hospital and prison.',
    run() {
      grow('character', 6);
      grow('fame', 3);
      const n = addMembers(randInt(3, 8) * (1 + S.venue));
      return `You showed Christ's love to the community. +6 character, +${n} members.`;
    },
  },
  {
    id: 'crusade', emoji: '🏟️', name: 'Hold a Crusade', energy: 50, once: true,
    when: () => isPastor() && S.venue >= 1,
    cost: () => 50000 * Math.pow(3, S.venue - 1),
    desc: () => 'Open-air Gospel crusade.',
    run() {
      const n = addMembers((S.members * 0.08 + 20 * S.venue) * bonus('crusade') * charMult() * fameMult() * rand(0.7, 1.3));
      grow('faith', 5);
      grow('fame', 8);
      return `Many gave their lives to Christ! +${n} members, +8 fame.`;
    },
  },
  // ---- temptations (real life, virtual consequences) ----
  {
    id: 'oil', emoji: '🫙', name: 'Sell "Anointing Oil"', energy: 15, once: true, shady: true,
    when: () => isPastor() && S.members >= 10,
    desc: () => 'Groundnut oil in small bottles, ₦2,000 each. Quick money...',
    run() {
      const m = S.members * 150 * rand(0.8, 1.2);
      S.funds += m;
      return `Sold out: ${naira(m)}. ` + fall('greed', 6);
    },
  },
  {
    id: 'seed', emoji: '🌱', name: '"Special Seed" Offering', energy: 20, once: true, shady: true,
    when: () => isPastor() && S.members >= 10,
    desc: () => '"Sow ₦50k and your visa will come through." Hmm.',
    run() {
      const m = S.members * 800 * rand(0.8, 1.2);
      S.funds += m;
      const lost = -addMembers(-S.members * 0.02);
      return `Collected ${naira(m)}.${lost > 0 ? ` ${lost} members left quietly.` : ''} ` + fall('manipulating the flock', 10);
    },
  },
  {
    id: 'poach', emoji: '🎣', name: 'Poach Members', energy: 25, once: true, shady: true,
    when: () => isPastor() && S.members >= 10,
    desc: () => 'Promise the choir of the church down the road a "better anointing".',
    run() {
      const n = addMembers(randInt(5, 12) * (1 + S.venue));
      return `+${n} members from another church. ` + fall('sheep stealing', 7);
    },
  },
];

const actionName = (a) => typeof a.name === 'function' ? a.name() : a.name;

function canDo(a) {
  if (S.over) return false;
  if (S.energy < a.energy) return false;
  if (a.once && S.doneToday[a.id]) return false;
  if (a.avail && !a.avail()) return false;
  if (a.cost && S.funds < a.cost()) return false;
  return true;
}

function doAction(id) {
  const a = ACTIONS.find((x) => x.id === id);
  if (!a || (a.when && !a.when()) || !canDo(a)) return;
  S.energy -= a.energy;
  if (a.cost) S.funds -= a.cost();
  if (a.once) S.doneToday[a.id] = true;
  const msg = a.run();
  if (msg) { log(msg); toast(msg); }
  afterChange();
  checkCollapse();
}

/* ---------------- journey milestones ---------------- */

const examNeed = () => 25 + S.semester * 15; // 40, 55, 70
const BIBLE_SCHOOL_FEE = 60000;

function milestone() {
  switch (S.stage) {
    case 0: return {
      label: 'Get baptized', emoji: '💧',
      reqs: [['Attend 2 services or vigils', S.services >= 2], ['Faith 30+', S.faith >= 30]],
      go: () => {
        S.stage = 1;
        showModal('💧', 'Baptized!', `You went down into the water and came up a new creation. The whole church rejoiced!\n\n${verseText(V_BAPTISM)}`, [{ label: 'Halleluyah! 🙌' }]);
        log('You were baptized! 💧');
      },
    };
    case 1: return {
      label: 'Join a department', emoji: '🧤',
      reqs: [['Attend 6 services or vigils', S.services >= 6], ['Faith 45+', S.faith >= 45], ['Character 50+', S.character >= 50]],
      go: () => showModal('🧤', 'Become a worker', 'Which department will you serve in?', DEPARTMENTS.map((d) => ({
        label: `${d.emoji} ${d.name}`,
        fn: () => { S.stage = 2; S.dept = d.id; log(`You joined the ${d.name} department. You are now a church worker!`); afterChange(); },
      }))),
    };
    case 2: return {
      label: 'Enroll in Bible School', emoji: '🎓',
      reqs: [['Faith 55+', S.faith >= 55], ['Word 30+', S.word >= 30], [`Save ${naira(BIBLE_SCHOOL_FEE)} for fees`, S.funds >= BIBLE_SCHOOL_FEE]],
      go: () => {
        S.funds -= BIBLE_SCHOOL_FEE;
        S.stage = 3;
        showModal('🎓', 'Welcome to Bible School!', `Three semesters stand between you and graduation. Attend lectures and pass your exams.\n\n${verseText(V_STUDY)}`, [{ label: 'Let\'s study 📚' }]);
        log('You enrolled in Bible School.');
      },
    };
    case 3: return {
      label: `Semester ${S.semester} of 3`, emoji: '📝',
      reqs: [[`Word ${examNeed()}+ to write the exam`, S.word >= examNeed()], ['Pass the exam (see below)', false]],
      go: null,
    };
    case 4: return {
      label: 'Be ordained', emoji: '🕊️',
      reqs: [['Faith 70+', S.faith >= 70], ['Character 70+', S.character >= 70], ['No unconfessed sin', !S.convicted]],
      go: () => {
        S.stage = 5;
        S.members = 7;
        S.venue = 0;
        showModal('🕊️', 'Ordained!', `The elders laid hands on you and prayed. You are now Pastor ${S.name}!\n\nYou start ${S.church} in your living room with 7 people. Feed the flock, and watch out for the love of money.\n\n${verseText(V_GROWTH)}`, [{ label: 'Here I am, Lord. Send me.' }]);
        log(`You were ordained and planted ${S.church}! 🕊️`);
      },
    };
    default: return null;
  }
}

function completeMilestone() {
  const m = milestone();
  if (!m || !m.go || !m.reqs.every((r) => r[1])) return;
  m.go();
  afterChange();
}

/* ---------------- Bible school exam ---------------- */

function startExam() {
  const qs = shuffle(QUIZ).slice(0, 5);
  let i = 0, score = 0;
  const ask = () => {
    if (i >= qs.length) return finishExam(score);
    const [q, right, ...wrong] = qs[i];
    showModal('📝', `Question ${i + 1} of 5`, q, shuffle([right, ...wrong]).map((opt) => ({
      label: opt,
      fn: () => {
        if (opt === right) { score += 1; toast('✅ Correct!'); } else toast(`❌ Answer: ${right}`);
        i += 1;
        ask();
      },
    })));
  };
  ask();
}

function finishExam(score) {
  if (score >= 4) {
    log(`Passed Semester ${S.semester} exam with ${score}/5! 🎓`);
    if (S.semester >= 3) {
      S.stage = 4;
      showModal('🎓', 'Graduated!', `You scored ${score}/5 and completed Bible School!\n\nNext: grow in faith and character to be ordained.`, [{ label: 'To God be the glory' }]);
    } else {
      S.semester += 1;
      showModal('✅', 'Passed!', `You scored ${score}/5. On to Semester ${S.semester}.`, [{ label: 'Keep studying' }]);
    }
  } else {
    grow('word', -5);
    log(`Scored ${score}/5 in the Semester ${S.semester} exam. You'll retake it.`);
    showModal('📖', 'Not this time', `You scored ${score}/5. You need 4 to pass.\nKeep studying and try again tomorrow.\n\n${verseText(V_STUDY)}`, [{ label: 'I will study harder' }]);
  }
  afterChange();
}

/* ---------------- build / upgrades ---------------- */

function choirCost() { return 20000 * Math.pow(S.choir + 1, 2); }

function buyUpgrade(id) {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u || S.over || has(id) || S.funds < u.cost) return;
  S.funds -= u.cost;
  S.owned[id] = true;
  if (u.fame) grow('fame', u.fame);
  if (u.character) grow('character', u.character);
  log(`Bought: ${u.name} ${u.emoji}`);
  toast(u.vanity ? `${u.emoji} ${u.name}! The congregation is whispering...` : `${u.emoji} ${u.name} dedicated to God's work!`);
  afterChange();
  checkCollapse();
}

function upgradeChoir() {
  if (S.over || S.choir >= 5 || S.funds < choirCost()) return;
  S.funds -= choirCost();
  S.choir += 1;
  log(`Choir grew to level ${S.choir} 🎶`);
  toast(`🎶 Choir is now level ${S.choir}`);
  afterChange();
}

function moveVenue() {
  const next = VENUES[S.venue + 1];
  if (S.over || !next || S.funds < next.cost) return;
  S.funds -= next.cost;
  S.venue += 1;
  S.rentMult = 1;
  S.missedRent = 0;
  grow('fame', 5);
  log(`Moved into a ${next.name} ${next.emoji}! Dedication service held.`);
  showModal(next.emoji, 'New building!', `${S.church} has moved into a ${next.name}.\nCapacity: ${num(next.cap)} members.\nWeekly rent: ${naira(next.rent)}.`, [{ label: 'To God be the glory 🙌' }]);
  afterChange();
}

function openBranch(id) {
  const b = BRANCHES.find((x) => x.id === id);
  if (!b || S.over || S.branches[id] || S.venue < 4 || S.funds < b.cost) return;
  S.funds -= b.cost;
  S.branches[id] = true;
  grow('fame', 6);
  log(`Opened a branch in ${b.name} ${b.flag}!`);
  showModal(b.flag, `${S.church}, ${b.name}`, `A new branch has been planted in ${b.name}. A pastor you trained will lead it.\n\n${verseText(V_BAPTISM)}`, [{ label: 'Glory to God 🌍' }]);
  afterChange();
}

/* ---------------- collapse & endings ---------------- */

// Character hitting zero is the one way to lose: for a pastor, EFCC; before that, church discipline.
function checkCollapse() {
  if (S.over || S.character > 0) return false;
  if (isPastor()) {
    gameOver('🚓', 'EFCC dey come!', `After ${S.day} days, EFCC invited Pastor ${S.name} "for questioning" over the oil, the seeds and the money. ${S.church} is in the newspapers for the wrong reasons.\n\n${verseText(V_REAP)}`);
  } else {
    S.character = 15;
    S.energy = 0;
    log('The elders placed you under church discipline.');
    showModal('🧑🏾‍⚖️', 'Church discipline', `The elders called you in. Your conduct has become a stumbling block. You are suspended from your duties for a while.\n\nIt is not the end. Repent, rebuild, and keep walking.\n\n${verseText(V_CONFESS)}`, [{ label: 'I accept correction' }]);
    afterChange();
  }
  return true;
}

function gameOver(emoji, t, text) {
  S.over = true;
  save();
  render();
  showModal(emoji, t, text, [
    { label: '📤 Share my story', fn: openShare },
    { label: 'Start a new journey', fn: () => { clearSave(); location.reload(); } },
  ]);
}

/* ---------------- end of day ---------------- */

function endDay() {
  if (S.over) return;
  const wasSunday = isSunday();
  const report = [];

  if (isPastor()) {
    if (wasSunday && rent() > 0) {
      const r = rent();
      if (S.funds >= r) {
        S.funds -= r;
        S.missedRent = 0;
        report.push(`Paid weekly rent: ${naira(r)}.`);
      } else {
        S.missedRent += 1;
        report.push(`⚠️ Couldn't pay rent (${naira(r)}). Landlord warning ${S.missedRent}/3.`);
        if (S.missedRent >= 3) {
          S.venue -= 1;
          S.missedRent = 0;
          S.rentMult = 1;
          addMembers(0); // apply the smaller capacity
          report.push(`You had to move back to a ${venue().name}. God is still faithful.`);
        }
      }
    }
    if (has('generator')) {
      const fuel = 1500 * (1 + S.venue);
      S.funds -= fuel;
      report.push(`Generator fuel: ${naira(fuel)}.`);
    }
    if (has('livestream')) {
      const g = S.members * 50;
      S.funds += g;
      grow('fame', 1);
      report.push(`Online offerings: ${naira(g)}.`);
    }
    const branchIncome = BRANCHES.filter((b) => S.branches[b.id]).reduce((t, b) => t + b.daily, 0);
    if (branchIncome) {
      S.funds += branchIncome;
      report.push(`Support from branches: ${naira(branchIncome)}.`);
    }
    const wom = S.members * 0.015 * quality() * charMult() * faithMult() * (0.7 + S.fame / 100) + (has('bus') ? 5 : 0);
    const grew = addMembers(wom);
    if (grew > 0) report.push(`Members invited friends: +${grew}.`);
    if (S.faith < 25 || S.character < 30) {
      const lost = -addMembers(-S.members * 0.02);
      if (lost > 0) report.push(`${lost} members drifted away. The flock needs a shepherd who is close to God.`);
    }
    grow('fame', -0.5);
  }

  grow('faith', -1.5);
  grow('word', -0.5);
  if (S.convicted) grow('character', -1);

  S.day += 1;
  S.energy = 100;
  S.doneToday = {};

  if (report.length) log(report.join(' '));
  afterChange();
  if (checkCollapse()) return;

  // Grace instead of game over.
  if (S.faith <= 0) {
    S.faith = 20;
    log('A brother visited and prayed with you. Your faith was restored.');
    afterChange();
    return showModal('🫂', 'You\'ve drifted away...', `Days went by without prayer or fellowship. Then Brother Emeka knocked on your door. "We missed you," he said, and prayed with you.\n\nGod never stopped loving you.\n\n${verseText(V_REFUGE)}`, [{ label: 'I\'m coming back home 🙏' }]);
  }

  if (isPastor() && !S.won && S.members >= WIN_MEMBERS) {
    S.won = true;
    save();
    return showModal('👑', 'General Overseer!', `${S.church} has grown to ${num(S.members)} members in ${S.day} days. Well done, good and faithful servant!\n\nShare your testimony!`, [
      { label: '📤 Share testimony', fn: openShare },
      { label: 'Keep shepherding' },
    ]);
  }

  if (isPastor() && S.character < 30 && S.fame > 25 && chance(0.15)) return runEvent(EVENTS.find((e) => e.id === 'expose'));
  if (isPastor() && S.day % 30 === 0) return runEvent(EVENTS.find((e) => e.id === 'harvest'));
  if (chance(0.5)) {
    const pool = EVENTS.filter((e) => !e.special && (!e.cond || e.cond()));
    if (pool.length) runEvent(pick(pool));
  }
}

/* ---------------- events ---------------- */

const EVENTS = [
  // ---- temptations ----
  {
    id: 'gossip', emoji: '🗣️', title: 'Gossip after service',
    text: () => 'Some sisters are whispering about the choir leader\'s marriage. "Did you hear...?"',
    choices: [
      { label: 'Join the gist', fn: () => fall('gossip') },
      { label: 'Walk away kindly', fn: () => { grow('character', 4); return 'You changed the topic and walked away. +4 character.'; } },
    ],
  },
  {
    id: 'traffic', emoji: '🚌', title: 'Danfo driver wahala',
    text: () => 'A danfo driver hit your side mirror, then insulted you loudly in traffic.',
    choices: [
      { label: 'Give it back to him!', fn: () => fall('anger') },
      { label: 'Forgive and let it go', fn: () => { grow('character', 5); return `You forgave him. +5 character.\n${V_FORGIVE[0]}`; } },
    ],
  },
  {
    id: 'receipts', emoji: '🧾', title: 'Inflate the receipt?',
    cond: () => !isPastor(),
    text: () => `Your boss wants you to inflate a supplier receipt. "Na small thing. I'll add ${naira(S.salary * 3)} for you."`,
    choices: [
      { label: 'Do it', fn: () => { S.funds += S.salary * 3; return fall('dishonesty'); } },
      { label: 'Refuse respectfully', fn: () => { grow('character', 6); if (chance(0.4)) { S.salary = Math.round(S.salary * 1.3); return `The MD heard about your honesty and promoted you! Salary is now ${naira(S.salary)}.`; } return 'Your boss was annoyed, but your conscience is clear. +6 character.'; } },
    ],
  },
  {
    id: 'wallet', emoji: '👛', title: 'Found a wallet',
    text: () => 'You found a wallet with ₦50,000 and an ID card at the bus stop.',
    choices: [
      { label: 'Keep it', fn: () => { S.funds += 50000; return fall('stealing'); } },
      { label: 'Return it to the owner', fn: () => { grow('character', 7); S.funds += 5000; return 'The owner cried with joy and gave you ₦5,000 "for transport". +7 character.'; } },
    ],
  },
  {
    id: 'leak', emoji: '📄', title: 'Exam questions leaked',
    cond: () => S.stage === 3,
    text: () => 'A classmate whispers: "I have the exam questions. Want them?"',
    choices: [
      { label: 'Take a look', fn: () => fall('cheating') + ' The leak was discovered and the exam was rescheduled anyway.' },
      { label: 'No, I will study', fn: () => { grow('character', 5); grow('word', 3); return 'You studied honestly instead. +5 character, +3 word.'; } },
    ],
  },
  {
    id: 'pride', emoji: '🏆', title: 'Praise from everyone',
    cond: () => isPastor() && S.members >= 100,
    text: () => 'After a powerful service, people are calling you "the greatest man of God in this city".',
    choices: [
      { label: 'Enjoy it. I worked hard!', fn: () => { grow('fame', 5); return fall('pride'); } },
      { label: 'Give all glory to God', fn: () => { grow('character', 5); grow('faith', 3); return 'You pointed everyone to Jesus. +5 character.'; } },
    ],
  },
  {
    id: 'deacon', emoji: '💼', title: 'Rich member, one request',
    cond: () => isPastor() && S.members >= 30,
    text: () => `Chief Okafor will donate ${naira(S.members * 2000)}... if you make him a Deacon. He hasn't attended service in months.`,
    choices: [
      { label: 'Accept the donation', fn: () => { S.funds += S.members * 2000; return fall('compromise', 5); } },
      { label: 'Politely decline', fn: () => { grow('character', 4); grow('faith', 2); return 'You stood your ground. +4 character.'; } },
    ],
  },
  {
    id: 'politician', emoji: '🎩', title: 'A politician\'s offer',
    cond: () => isPastor() && S.members >= 150,
    text: () => `Honourable "Dividends" offers ${naira(S.members * 3000)} if you tell your members to vote for him.`,
    choices: [
      { label: 'Accept the money', fn: () => { S.funds += S.members * 3000; grow('fame', 5); return fall('selling the pulpit'); } },
      { label: 'Pray for him, decline the money', fn: () => { grow('character', 6); return 'You prayed for him and kept the pulpit pure. +6 character.'; } },
    ],
  },
  // ---- blessings & life ----
  {
    id: 'promotion', emoji: '📈', title: 'Promotion at work!',
    cond: () => !isPastor(),
    text: () => 'Your hard work and good attitude have been noticed.',
    choices: [{ label: 'Thank God! 🙌', fn: () => { S.salary = Math.round(S.salary * 1.25); return `Salary increased to ${naira(S.salary)}.`; } }],
  },
  {
    id: 'mentor', emoji: '🧓🏾', title: 'An elder takes interest',
    cond: () => !isPastor(),
    text: () => 'Deacon Adebayo offers to disciple you every week.',
    choices: [{ label: 'Gladly!', fn: () => { grow('word', 5); grow('faith', 5); return '+5 word, +5 faith.'; } }],
  },
  {
    id: 'sick', emoji: '🤒', title: 'Malaria',
    text: () => 'You came down with malaria. Brethren from church came to pray for you.',
    choices: [{ label: 'Rest and recover', fn: () => { S.energy = Math.max(0, S.energy - 50); grow('faith', 3); return 'You recovered quickly. Your faith grew through it.'; } }],
  },
  {
    id: 'fruit', emoji: '🍇', title: 'Fruit of the Spirit',
    text: () => `Today's sermon was on the fruit of the Spirit.\n\n${verseText(V_FRUIT)}`,
    choices: [{ label: 'Lord, grow this fruit in me', fn: () => { grow('character', 4); grow('word', 2); return '+4 character.'; } }],
  },
  {
    id: 'money', emoji: '💸', title: 'Prosperity conference',
    cond: isPastor,
    text: () => `A visiting preacher says: "A pastor without a Jeep is not anointed!"\n\nYour mentor sends you a verse instead:\n\n${verseText(V_MONEY)}`,
    choices: [{ label: 'Noted 🙏', fn: () => { grow('word', 2); return 'You chose to remember what matters.'; } }],
  },
  {
    id: 'viral', emoji: '📱', title: 'Your sermon is spreading!',
    cond: isPastor,
    text: () => 'A clip of your sermon on forgiveness is being shared on WhatsApp all over Nigeria.',
    choices: [{ label: 'Glory to God! 🔥', fn: () => { grow('fame', 10); const n = addMembers(15 * (1 + S.venue)); return `+10 fame, +${n} members came to visit.`; } }],
  },
  {
    id: 'rival', emoji: '🍛', title: 'New church opposite',
    cond: () => isPastor() && S.members >= 20,
    text: () => 'A new church opened across the road. They share free jollof after every service.',
    choices: [
      { label: 'Trust God and your choir', fn: () => { if (S.choir >= 2) return 'Your worship is too sweet. Nobody left!'; const l = -addMembers(-S.members * 0.05); return `${l} members followed the jollof. Train your choir!`; } },
      { label: 'Bless them and keep preaching', fn: () => { grow('character', 3); const l = -addMembers(-S.members * 0.02); return `You prayed for the new church. ${l} members left, but +3 character.`; } },
    ],
  },
  {
    id: 'wedding', emoji: '💍', title: 'Wedding in church!',
    cond: () => isPastor() && S.members >= 15,
    text: () => 'Two of your members are getting married.',
    choices: [{ label: 'Officiate 💒', fn: () => { const f = 15000 * (1 + S.venue); S.funds += f; return `A beautiful wedding. Thanksgiving offering: ${naira(f)}.`; } }],
  },
  {
    id: 'baby', emoji: '👶', title: 'A testimony!',
    cond: isPastor,
    text: () => 'Sister Ngozi, who waited 10 years for a child, just had twins! The whole street is talking.',
    choices: [{ label: 'Dance to the altar 💃', fn: () => { grow('faith', 5); grow('fame', 4); const n = addMembers(8 * (1 + S.venue)); return `+5 faith, +${n} members.`; } }],
  },
  {
    id: 'japa', emoji: '✈️', title: 'Members relocating abroad',
    cond: () => isPastor() && S.members >= 50,
    text: () => 'Several young members just got visas and are relocating.',
    choices: [{ label: 'Pray for journey mercies', fn: () => { const l = -addMembers(-S.members * 0.03); return has('livestream') ? `${l} members relocated, but they'll keep worshipping online.` : `${l} members relocated. A livestream would keep them connected.`; } }],
  },
  {
    id: 'breakaway', emoji: '🕵🏾', title: 'Assistant pastor breaking away',
    cond: () => isPastor() && S.members >= 200,
    text: () => 'Your assistant pastor is starting his own church and is quietly inviting your members to follow him.',
    choices: [
      { label: 'Bless him and let him go', fn: () => { const l = -addMembers(-S.members * 0.06); grow('character', 5); return `He left with ${l} members, but people respected your grace. +5 character.`; } },
      { label: 'Give him a raise (₦)', fn: () => { const c = 30000 * (1 + S.venue); if (S.funds < c) { const l = -addMembers(-S.members * 0.1); return `You couldn't afford it. He left with ${l} members.`; } S.funds -= c; return `Paid ${naira(c)}. He's staying... for now.`; } },
      { label: 'Curse him from the pulpit', fn: () => { const l = -addMembers(-S.members * 0.1); return `${l} members left in disgust. ` + fall('bitterness'); } },
    ],
  },
  {
    id: 'landlord', emoji: '🧔🏾', title: 'Rent increase',
    cond: () => isPastor() && S.venue > 0,
    text: () => 'The landlord says rent is going up 30%.',
    choices: [
      { label: 'Accept and trust God', fn: () => { S.rentMult *= 1.3; return 'Rent is now ' + naira(rent()) + '/week.'; } },
      { label: 'Negotiate politely', fn: () => chance(0.6) ? 'He agreed to keep the old price. God dey!' : (S.rentMult *= 1.4, 'He insisted. Rent is now ' + naira(rent()) + '/week.') },
    ],
  },
  // ---- special, triggered directly ----
  {
    id: 'expose', special: true, emoji: '📰', title: 'SCANDAL!',
    text: () => 'A journalist just published a story about the anointing oil, the "seed" offerings and the lifestyle. It\'s trending on X. How will you handle it?',
    choices: [
      { label: 'Confess publicly & refund the money', fn: () => { const l = -addMembers(-S.members * 0.08); S.funds *= 0.6; grow('character', 15); grow('fame', -8); S.convicted = false; S.repentances += 1; return `You apologised from the pulpit and refunded members. ${l} left, but many respected your honesty. +15 character.`; } },
      { label: 'Deny everything', fn: () => { const l = -addMembers(-S.members * 0.2); grow('fame', -15); grow('character', -5); S.funds *= 0.8; return `The receipts came out anyway. ${l} members left, lawyers took 20% of funds.`; } },
      { label: '"It\'s the attack of the enemy!"', fn: () => { const l = -addMembers(-S.members * 0.12); grow('character', -8); return `Some believed you. ${l} members did not. -8 character.`; } },
    ],
  },
  {
    id: 'harvest', special: true, emoji: '🌽', title: 'Harvest & Thanksgiving!',
    text: () => 'It\'s the church\'s harvest. Members are bringing yams, goats and thanksgiving offerings.',
    choices: [{ label: 'Dance with thanksgiving 💃', fn: () => { const m = S.members * 2000 * faithMult(); S.funds += m; return `Harvest raised ${naira(m)} for the work of God!`; } }],
  },
];

function runEvent(e) {
  if (!e) return;
  showModal(e.emoji, e.title, e.text(), e.choices.map((c) => ({
    label: c.label,
    fn: () => {
      const result = c.fn();
      log(`${e.emoji} ${e.title}: ${result}`);
      afterChange();
      if (result) toast(result);
      checkCollapse();
    },
  })));
}

/* ---------------- rendering ---------------- */

function afterChange() {
  S.funds = Math.round(S.funds);
  save();
  render();
}

function render() {
  if (!S) return;
  $('hud-church').textContent = S.church;
  $('hud-title').textContent = `${title()} ${S.name}${S.convicted ? ' · 💧 needs repentance' : ''}`;
  $('hud-day').textContent = `Day ${S.day} · ${weekday()}`;
  $('hud-energy').textContent = S.energy;
  $('hud-energy-bar').style.width = S.energy + '%';
  setStat('hud-funds', naira(S.funds), isPastor() && S.funds < rent());
  setStat('hud-faith', Math.round(S.faith), S.faith < 25);
  setStat('hud-character', Math.round(S.character), S.character < 30);
  if (isPastor()) {
    $('hud-word-k').textContent = '📣 Fame';
    setStat('hud-word', Math.round(S.fame), false);
    $('hud-members-k').textContent = '👥 Members';
    setStat('hud-members', `${num(S.members)}/${num(venue().cap)}`, false);
    $('hud-venue-k').textContent = '🏠 Venue';
    setStat('hud-venue', venue().emoji + ' ' + venue().name, false);
  } else {
    $('hud-word-k').textContent = '📖 Word';
    setStat('hud-word', Math.round(S.word), false);
    $('hud-members-k').textContent = '⛪ Services';
    setStat('hud-members', S.services, false);
    $('hud-venue-k').textContent = '💼 Job';
    setStat('hud-venue', S.job, false);
  }
  $('verse').textContent = `“${verseOfDay()[1]}” — ${verseOfDay()[0]}`;
  $('tab-btn-build').classList.toggle('hidden', !isPastor());
  $('btn-endday').disabled = S.over;
  renderMinistry();
  if (isPastor()) renderBuild();
  renderLog();
  if (window.World) World.update(S);
}

function setStat(id, text, low) {
  const el = $(id);
  el.textContent = text;
  el.classList.toggle('low', !!low);
}

function actionButton({ emoji, name, desc, cost, disabled, onClick, cls }) {
  const b = document.createElement('button');
  b.className = 'action' + (cls ? ' ' + cls : '');
  b.disabled = disabled;
  b.innerHTML = `<span class="ic"></span><span class="body"><span class="name"></span><br><span class="desc"></span></span><span class="cost"></span>`;
  b.querySelector('.ic').textContent = emoji;
  b.querySelector('.name').textContent = name;
  b.querySelector('.desc').textContent = desc;
  b.querySelector('.cost').innerHTML = cost;
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

function sectionTitle(text) {
  const d = document.createElement('div');
  d.className = 'section-title';
  d.textContent = text;
  return d;
}

function renderJourney(root) {
  const m = milestone();
  if (!m) return;
  const card = document.createElement('div');
  card.className = 'journey';
  const ready = m.go && m.reqs.every((r) => r[1]);
  const h = document.createElement('div');
  h.className = 'journey-title';
  h.textContent = `${m.emoji} Next step: ${m.label}`;
  card.appendChild(h);
  const ul = document.createElement('ul');
  for (const [text, ok] of m.reqs) {
    const li = document.createElement('li');
    if (ok) li.className = 'ok';
    li.textContent = `${ok ? '✅' : '⬜'} ${text}`;
    ul.appendChild(li);
  }
  card.appendChild(ul);
  if (m.go) {
    const b = document.createElement('button');
    b.className = 'btn primary';
    b.textContent = ready ? `${m.label} →` : 'Keep growing...';
    b.disabled = !ready || S.over;
    b.addEventListener('click', completeMilestone);
    card.appendChild(b);
  }
  root.appendChild(card);
}

function renderMinistry() {
  const root = $('tab-ministry');
  root.innerHTML = '';
  renderJourney(root);
  const visible = ACTIONS.filter((a) => !a.when || a.when());
  const groups = isPastor()
    ? [['Shepherd the flock', ['service', 'evangelism', 'vigil', 'counsel', 'charity', 'crusade']],
       ['Your walk with God', ['repent', 'pray', 'read', 'work']],
       ['Shortcuts (temptation)', ['oil', 'seed', 'poach']]]
    : [['Your walk with God', ['repent', 'sunday', 'biblestudy', 'mvigil', 'pray', 'read', 'witness', 'serve', 'help']],
       ['Bible School', ['lecture', 'exam']],
       ['Daily life', ['work']]];
  for (const [label, ids] of groups) {
    const list = ids.map((id) => visible.find((a) => a.id === id)).filter(Boolean);
    if (!list.length) continue;
    root.appendChild(sectionTitle(label));
    for (const a of list) {
      const parts = [`⚡${a.energy}`];
      if (a.cost && a.cost() > 0) parts.push(naira(a.cost()));
      if (a.once && S.doneToday[a.id]) parts.push('done today');
      const cls = a.id === 'repent' ? 'repent' : a.shady ? 'shady' : '';
      root.appendChild(actionButton({
        emoji: a.emoji, name: actionName(a), desc: a.desc(), cost: parts.join('<br>'),
        disabled: !canDo(a), onClick: () => doAction(a.id), cls,
      }));
    }
  }
}

function renderBuild() {
  const root = $('tab-build');
  root.innerHTML = '';

  root.appendChild(sectionTitle('Venue'));
  const next = VENUES[S.venue + 1];
  if (next) {
    root.appendChild(actionButton({
      emoji: next.emoji, name: `Move to ${next.name}`,
      desc: `Capacity ${num(next.cap)} · rent ${naira(next.rent)}/week`,
      cost: naira(next.cost), disabled: S.over || S.funds < next.cost, onClick: moveVenue,
    }));
  } else {
    root.appendChild(actionButton({ emoji: '🏕️', name: 'Camp Ground', desc: 'Room for the whole flock.', cost: '✅', disabled: true, cls: 'owned' }));
  }

  root.appendChild(sectionTitle('Choir'));
  root.appendChild(actionButton({
    emoji: '🎶', name: `Choir level ${S.choir}/5`,
    desc: S.choir >= 5 ? 'Heaven-sent worship.' : 'Train and equip the choir.',
    cost: S.choir >= 5 ? '✅' : naira(choirCost()),
    disabled: S.over || S.choir >= 5 || S.funds < choirCost(), onClick: upgradeChoir, cls: S.choir >= 5 ? 'owned' : '',
  }));

  root.appendChild(sectionTitle('Branches'));
  for (const b of BRANCHES) {
    const open = !!S.branches[b.id];
    root.appendChild(actionButton({
      emoji: b.flag, name: `Branch: ${b.name}`,
      desc: open ? `Sends ${naira(b.daily)} a day.` : S.venue < 4 ? 'Needs an Auditorium first.' : `Will send ${naira(b.daily)} a day.`,
      cost: open ? '✅' : naira(b.cost),
      disabled: S.over || open || S.venue < 4 || S.funds < b.cost, onClick: () => openBranch(b.id), cls: open ? 'owned' : '',
    }));
  }

  for (const [label, vanity] of [['Equipment & projects', false], ['Lifestyle (temptation)', true]]) {
    root.appendChild(sectionTitle(label));
    for (const u of UPGRADES.filter((x) => !!x.vanity === vanity)) {
      const owned = has(u.id);
      root.appendChild(actionButton({
        emoji: u.emoji, name: u.name, desc: u.desc,
        cost: owned ? '✅' : naira(u.cost),
        disabled: S.over || owned || S.funds < u.cost, onClick: () => buyUpgrade(u.id),
        cls: owned ? 'owned' : (u.vanity ? 'shady' : ''),
      }));
    }
  }
}

function renderLog() {
  const ul = $('log');
  ul.innerHTML = '';
  for (const e of S.log) {
    const li = document.createElement('li');
    const d = document.createElement('span');
    d.className = 'd';
    d.textContent = `Day ${e.d}`;
    li.appendChild(d);
    li.appendChild(document.createTextNode(e.t));
    ul.appendChild(li);
  }
}

/* ---------------- modal / toast ---------------- */

function showModal(emoji, t, text, choices) {
  $('modal-emoji').textContent = emoji;
  $('modal-title').textContent = t;
  $('modal-text').textContent = text;
  const box = $('modal-choices');
  box.innerHTML = '';
  for (const c of choices) {
    const b = document.createElement('button');
    b.className = 'btn primary';
    b.textContent = c.label;
    b.addEventListener('click', () => {
      $('modal').classList.add('hidden');
      if (c.fn) c.fn();
    });
    box.appendChild(b);
  }
  $('modal').classList.remove('hidden');
}

let toastTimer = null;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3200);
}

/* ---------------- share card ---------------- */

const GAME_URL = location.origin + location.pathname;

function shareLine() {
  if (S.over) return `EFCC came for Pastor ${S.name} on day ${S.day} 😭`;
  if (isPastor()) return `I became ${title()} in ${S.day} days 🙌`;
  return `I'm now a ${STAGES[S.stage]} after ${S.day} days 🙏`;
}

function drawShareCard() {
  const c = $('share-canvas');
  const x = c.getContext('2d');
  const W = c.width, H = c.height;
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#c4e0f5');
  g.addColorStop(1, '#eef4ec');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);

  x.textAlign = 'center';
  x.fillStyle = '#1f2937';
  x.font = 'bold 64px system-ui, sans-serif';
  x.fillText('⛪ Pastor Life', W / 2, 120);

  x.fillStyle = '#1a9b61';
  x.font = 'bold 54px system-ui, sans-serif';
  wrapText(x, shareLine(), W / 2, 240, W - 140, 66);

  x.fillStyle = '#6b7280';
  x.font = '40px system-ui, sans-serif';
  wrapText(x, `${title()} ${S.name} · ${S.church}`, W / 2, 400, W - 140, 50);

  const rows = isPastor()
    ? [['👥 Members', num(S.members)], [venue().emoji + ' Venue', venue().name], ['🙏 Faith', Math.round(S.faith) + '/100'], ['🍇 Character', Math.round(S.character) + '/100']]
    : [['🙏 Faith', Math.round(S.faith) + '/100'], ['📖 Word', Math.round(S.word) + '/100'], ['🍇 Character', Math.round(S.character) + '/100'], ['💧 Repentances', String(S.repentances)]];
  let y = 580;
  for (const [k, v] of rows) {
    x.fillStyle = '#ffffff';
    roundRect(x, 110, y - 58, W - 220, 84, 18);
    x.fill();
    x.textAlign = 'left';
    x.fillStyle = '#6b7280';
    x.font = '38px system-ui, sans-serif';
    x.fillText(k, 140, y);
    x.textAlign = 'right';
    x.fillStyle = '#1f2937';
    x.font = 'bold 40px system-ui, sans-serif';
    x.fillText(v, W - 140, y);
    y += 104;
  }

  x.textAlign = 'center';
  x.fillStyle = '#1a9b61';
  x.font = 'bold 38px system-ui, sans-serif';
  x.fillText('Start your faith journey. Play free 👇', W / 2, H - 80);
  x.fillStyle = '#6b7280';
  x.font = '30px system-ui, sans-serif';
  x.fillText(GAME_URL.replace(/^https?:\/\//, ''), W / 2, H - 36);
}

function wrapText(x, text, cx, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (x.measureText(test).width > maxW && line) {
      x.fillText(line, cx, y);
      line = w;
      y += lh;
    } else {
      line = test;
    }
  }
  x.fillText(line, cx, y);
}

function roundRect(x, l, t, w, h, r) {
  x.beginPath();
  x.moveTo(l + r, t);
  x.arcTo(l + w, t, l + w, t + h, r);
  x.arcTo(l + w, t + h, l, t + h, r);
  x.arcTo(l, t + h, l, t, r);
  x.arcTo(l, t, l + w, t, r);
  x.closePath();
}

function openShare() {
  drawShareCard();
  const text = `${shareLine()} in Pastor Life ⛪ Start your own faith journey: ${GAME_URL}`;
  $('btn-share-wa').href = 'https://wa.me/?text=' + encodeURIComponent(text);
  $('btn-share-x').href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text);
  $('btn-share-native').onclick = () => {
    $('share-canvas').toBlob(async (blob) => {
      const file = new File([blob], 'pastor-life.png', { type: 'image/png' });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text });
        } else if (navigator.share) {
          await navigator.share({ text });
        } else {
          downloadCard();
        }
      } catch (e) { /* user cancelled */ }
    });
  };
  $('share').classList.remove('hidden');
}

function downloadCard() {
  const a = document.createElement('a');
  a.download = 'pastor-life.png';
  a.href = $('share-canvas').toDataURL('image/png');
  a.click();
}

/* ---------------- boot ---------------- */

function showScreen(id) {
  for (const s of ['start', 'reveal', 'game']) $(s).classList.toggle('hidden', s !== id);
  if (window.World) World.setMode(id);
}

function switchTab(name) {
  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t.dataset.tab === name);
  for (const n of ['ministry', 'build', 'log']) $('tab-' + n).classList.toggle('hidden', n !== name);
}

function beginNew() {
  const name = $('in-name').value.trim() || 'Tunde';
  const church = $('in-church').value.trim() || 'Grace Assembly';
  S = newState(name, church, $('in-ctype').value);
  const st = STARTS[S.start];
  showScreen('reveal');
  $('reveal-emoji').textContent = '🎲';
  $('reveal-title').textContent = 'Your story begins...';
  $('reveal-text').textContent = '';
  $('btn-begin').classList.add('hidden');
  setTimeout(() => {
    $('reveal-emoji').textContent = st.emoji;
    $('reveal-title').textContent = st.title;
    const ct = CHURCH_TYPES[S.ctype];
    $('reveal-text').textContent = `${st.text}\n\nChurch: ${ct.emoji} ${ct.name} (${ct.perk.toLowerCase()}).\nJob: ${st.job}. Savings: ${naira(st.funds)}.\nOne day, you'll pastor "${church}".`;
    log(`Your journey began as: ${st.title}.`);
    save();
    $('btn-begin').classList.remove('hidden');
  }, 1200);
}

function enterGame() {
  showScreen('game');
  switchTab('ministry');
  render();
}

function init() {
  for (const [id, ct] of Object.entries(CHURCH_TYPES)) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = `${ct.emoji} ${ct.name} — ${ct.perk}`;
    $('in-ctype').appendChild(o);
  }
  const saved = load();
  if (saved && !saved.over) $('btn-continue').classList.remove('hidden');

  $('btn-start').addEventListener('click', beginNew);
  $('btn-continue').addEventListener('click', () => { S = saved; enterGame(); });
  $('btn-begin').addEventListener('click', enterGame);
  $('btn-endday').addEventListener('click', endDay);
  $('btn-share').addEventListener('click', openShare);
  $('btn-share-dl').addEventListener('click', downloadCard);
  $('btn-share-close').addEventListener('click', () => $('share').classList.add('hidden'));
  for (const tab of document.querySelectorAll('.tab')) tab.addEventListener('click', () => switchTab(tab.dataset.tab));
}

init();
