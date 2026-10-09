'use strict';

/* =========================================================================
   Amen City — a virtual church world
   Everyone has a place: worshipper, prayer warrior, security, usher, choir,
   media, hospitality, children's teacher, visitor, or the minister path
   (Bible school → ordination → shepherd your own church).
   Real-life temptations (quick money, vanity, compromise) are in the game
   as distractions, with real-life consequences.
   Scripture quotations are from the King James Version (public domain).
   All people and churches in the game are fictional.
   ========================================================================= */

const SAVE_KEY = 'amencity.v1';
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

const V_PRAYER = ['James 5:16', 'Confess your faults one to another, and pray one for another, that ye may be healed. The effectual fervent prayer of a righteous man availeth much.'];
const V_REQUEST = ['Philippians 4:6', 'Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God.'];
const V_DOOR = ['Psalm 84:10', 'For a day in thy courts is better than a thousand. I had rather be a doorkeeper in the house of my God, than to dwell in the tents of wickedness.'];
const V_HEARTILY = ['Colossians 3:23', 'And whatsoever ye do, do it heartily, as to the Lord, and not unto men;'];
const V_GLAD = ['Psalm 122:1', 'I was glad when they said unto me, Let us go into the house of the LORD.'];

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

/* ---------------- Lagos ---------------- */
// Real Lagos areas and public places. Churches and people stay fictional.
const LAGOS_AREAS = ['Yaba', 'Surulere', 'Ikeja', 'Ajegunle', 'Festac', 'Ikorodu', 'Mushin', 'Agege', 'Ojota', 'Lekki', 'Ketu', 'Oshodi'];

/* ---------------- evangelism missions ---------------- */
// Harder missions need more faith and character, cost more energy, and pay more.
// The naira is a stipend from the church's missions board; ⭐ come too.
const MISSIONS = [
  { id: 'm_tracts',   emoji: '📄', name: 'Share Tracts at Oshodi Bus Stop', level: 1, energy: 20, faith: 0,  character: 0,  cost: 0,    pay: 500,   points: 5,  souls: [0, 2],
    desc: 'Easy. Hand out tracts to people waiting for danfo under the bridge.',
    hard: ['An agbero shouted "Commot for road!" but you kept smiling.', 'Rain started and everybody ran.'] },
  { id: 'm_market',   emoji: '🛒', name: 'Preach at Balogun Market', level: 2, energy: 35, faith: 35, character: 40, cost: 0,    pay: 1500,  points: 10, souls: [1, 4],
    desc: 'Medium. Lagos Island at its busiest. Some traders will argue with you.',
    hard: ['A trader asked you to buy something before she would listen.', 'Two men argued with you about religion for an hour.'] },
  { id: 'm_hospital', emoji: '🏥', name: 'Visit LUTH & Kirikiri Prison', level: 3, energy: 45, faith: 45, character: 55, cost: 1000, pay: 3500,  points: 18, souls: [1, 5],
    desc: 'Hard. Pray with patients at LUTH, Idi-Araba, and inmates at Kirikiri. Bring provisions (₦1,000).',
    hard: ['A patient you prayed with last week passed away. You comforted the family.', 'The prison officer delayed you for hours at the gate.'] },
  { id: 'm_slum',     emoji: '🛶', name: 'Makoko Waterfront Outreach', level: 4, energy: 60, faith: 55, character: 60, cost: 2000, pay: 8000,  points: 30, souls: [3, 10],
    desc: 'Very hard. Canoe through the Makoko waterfront community with food and the Gospel. Boat and food: ₦2,000.',
    hard: ['Area boys demanded "settlement" before you could enter.', 'The canoe nearly capsized. Everyone prayed loudly.', 'A child there had a high fever. You took him to the clinic.'] },
  { id: 'm_village',  emoji: '🛖', name: 'Village Crusade in Epe', level: 5, energy: 85, faith: 70, character: 70, cost: 5000, pay: 18000, points: 50, souls: [8, 25],
    desc: 'Hardest. Weekend mission to a village past Epe. Transport and supplies: ₦5,000.',
    hard: ['The Lekki–Epe road was so bad the bus got stuck twice.', 'A local strongman threatened the team, then came forward at the altar call.', 'No light, no network, mosquitoes everywhere.'] },
];

/* ---------------- roles ---------------- */
// Every role has three ranks, its own duties (ACTIONS with `role`) and its own events.
const ROLES = {
  worshipper:  { emoji: '🙏', name: 'Worshipper', blurb: 'Come to church, worship, give, fellowship.', ranks: ['First-timer', 'Member', 'Pillar of the Church'] },
  prayer:      { emoji: '🕊️', name: 'Prayer Warrior', blurb: 'Live in the prayer room and pray for others.', ranks: ['Intercessor', 'Prayer Warrior', 'Prayer Coordinator'] },
  security:    { emoji: '🛡️', name: 'Security', blurb: 'Gate, car park and safety of God\'s house.', ranks: ['Security Volunteer', 'Gate Supervisor', 'Chief Security Officer'], verse: V_DOOR },
  usher:       { emoji: '🧤', name: 'Usher', blurb: 'Seat people, welcome visitors, carry the offering.', ranks: ['Usher', 'Senior Usher', 'Head Usher'] },
  choir:       { emoji: '🎶', name: 'Choir', blurb: 'Rehearse, minister in song, lead worship.', ranks: ['Chorister', 'Lead Vocalist', 'Choir Director'] },
  media:       { emoji: '🎥', name: 'Media & Sound', blurb: 'Mixer, projector, livestream. NEPA wahala included.', ranks: ['Media Volunteer', 'Sound Engineer', 'Head of Media'] },
  hospitality: { emoji: '🍲', name: 'Hospitality', blurb: 'Church kitchen and keeping God\'s house clean.', ranks: ['Kitchen Volunteer', 'Head Cook', 'Head of Hospitality'] },
  children:    { emoji: '🧒', name: 'Children\'s Teacher', blurb: 'Sunday school and the Christmas drama.', ranks: ['Assistant Teacher', 'Sunday School Teacher', 'Children\'s Church Coordinator'] },
  minister:    { emoji: '📖', name: 'Minister Path', blurb: 'Bible school, ordination, then your own church.', ranks: [] },
  visitor:     { emoji: '👀', name: 'Visitor', blurb: 'Just looking. No pressure.', ranks: ['Visitor', 'Regular Visitor', 'Member'] },
};
const RANK_XP = [0, 120, 450];
const isMinister = () => S.role === 'minister';

// Points (⭐) are earned by showing up, serving and praying. Naira is earned at work.
const SHOP = [
  { id: 'bible',      emoji: '📕', name: 'Study Bible',            naira: 4000,  desc: '+2 extra word every time you read.' },
  { id: 'mat',        emoji: '🧎', name: 'Prayer Mat',             points: 80,   desc: '+2 extra faith every time you pray.' },
  { id: 'tambourine', emoji: '🪘', name: 'Tambourine',             points: 60,   desc: 'Vigils hit different. +2 faith at vigils.' },
  { id: 'outfit',     emoji: '👔', name: 'Sunday Best (Ankara)',   naira: 12000, desc: 'Look sharp. +5⭐ every Sunday you attend.' },
  { id: 'bike',       emoji: '🚲', name: 'Bicycle',                naira: 45000, desc: 'Less trekking. Start each day with +10 energy.' },
  { id: 'phone',      emoji: '📱', name: 'Smartphone + Bible app', naira: 60000, desc: 'Reading the Bible costs 5 less energy.' },
  { id: 'gele',       emoji: '👑', name: 'Thanksgiving Aso-ebi',   points: 300,  desc: 'For the church anniversary. Pure vibes.' },
];

// Practice requests for the prayer room. With multiplayer these become real people's requests.
const SAMPLE_REQUESTS = [
  ['Chioma', 'My mum has surgery on Tuesday. Please pray for the doctors and for her healing.'],
  ['Emeka', 'Job interview on Thursday. I have been jobless for 2 years.'],
  ['Blessing', 'Safe delivery of my baby next month.'],
  ['Tunde', 'My JAMB result comes out this week.'],
  ['Halima', 'Peace in my home. My husband and I keep fighting.'],
  ['Kunle', 'My shop was robbed. Pray for provision and for the thieves to change.'],
  ['Ada', 'Visa interview on Monday. I want to study abroad.'],
  ['Femi', 'Deliverance from alcohol. I want to stop.'],
  ['Grace', 'My brother has been sick for months. The hospital cannot find the problem.'],
  ['Ibrahim', 'I just gave my life to Christ. Pray that I stay strong.'],
  ['Nkechi', 'My business is struggling. I have staff to pay this month.'],
  ['Segun', 'Travelling to the east by road this weekend. Journey mercies.'],
];

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

function newState(name, church, ctype, role) {
  const startId = Math.random() < 0.5 ? 'home' : 'convert';
  const st = STARTS[startId];
  return {
    name, church, ctype, role, start: startId,
    area: pick(LAGOS_AREAS), hunger: 80, rank: 0, xp: 0, points: 10, streak: 0, missedSundays: 0, items: {},
    prayed: 0, requests: [], testimonies: 0, frauds: 0, souls: 0,
    view: role === 'minister' ? 'home' : 'church',
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
  if (!isMinister()) return ROLES[S.role].ranks[S.rank];
  if (!isPastor()) return STAGES[S.stage];
  let t = TITLES[0][1];
  for (const [min, name] of TITLES) if (S.members >= min) t = name;
  return t;
}

// Mood, like Lagos Life: driven by faith, hunger and unconfessed sin.
function mood() {
  const score = S.faith * 0.5 + S.hunger * 0.4 - (S.convicted ? 25 : 0) + (S.character - 50) * 0.2;
  if (score >= 60) return ['😊', 'Joyful'];
  if (score >= 42) return ['🙂', 'Peaceful'];
  if (score >= 25) return ['😐', 'Okay'];
  return ['😣', 'Miserable'];
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

// Rewards for good things: experience in your role and ⭐ points.
function reward(xp, points) {
  S.xp += xp;
  S.points += points;
  return ` +${points}⭐`;
}

// A fall can always be repented of, but its character cost stays.
function fall(sin, characterCost = 8) {
  S.convicted = true;
  S.falls += 1;
  grow('character', -characterCost);
  grow('faith', -5);
  return `You fell into ${sin}. You feel convicted. "Confess & Repent" is on your Today tab.`;
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
      return 'You worshipped with the brethren. +10 faith, +3 word.' + reward(4, 5 + (S.items.outfit ? 5 : 0));
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
      return 'Great study on the book of Acts. +7 word, +4 faith.' + reward(3, 3);
    },
  },
  {
    id: 'mvigil', emoji: '🕯️', name: 'Attend Night Vigil', energy: 35, once: true,
    when: () => !isPastor(),
    avail: () => weekday() === 'Fri',
    desc: () => weekday() === 'Fri' ? 'Pray through the night with the church.' : 'Held on Friday nights.',
    run() {
      S.services += 1;
      const f = Math.round(12 * bonus('vigil')) + (S.items.tambourine ? 2 : 0);
      grow('faith', f); grow('character', 1);
      return `You prayed through the night till 5am. +${f} faith.` + reward(4, 4);
    },
  },
  {
    id: 'pray', emoji: '🙏', name: 'Pray', energy: 10, once: true,
    desc: () => 'Quiet time with the Lord.',
    run() {
      const f = Math.round(5 * bonus('prayer')) + (S.items.mat ? 2 : 0);
      grow('faith', f);
      return `You spent time in prayer. +${f} faith.` + reward(1, 1);
    },
  },
  {
    id: 'read', emoji: '📖', name: 'Read the Bible', energy: 15, once: true,
    energyFn: () => S.items.phone ? 10 : 15,
    desc: () => `Today: ${verseOfDay()[0]}`,
    run() {
      grow('word', 5 * bonus('study') + (S.items.bible ? 2 : 0)); grow('faith', 2);
      return `You meditated on ${verseOfDay()[0]}. +5 word.` + reward(1, 1);
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
      return 'You gave cheerfully. +6 character.' + reward(2, 3);
    },
  },
  {
    id: 'witness', emoji: '💬', name: 'Share the Gospel', energy: 20,
    when: () => (isMinister() ? S.stage >= 2 : S.stage >= 1) && !isPastor(),
    desc: () => 'Tell a colleague about Jesus.',
    run() {
      grow('faith', 3); grow('character', 2);
      if (chance(0.35)) return 'Your colleague gave their life to Christ! 🎉 +3 faith.' + reward(4, 8);
      return 'They listened politely and promised to think about it. +3 faith.';
    },
  },
  {
    id: 'serve', emoji: '🧹', name: 'Serve in Department', energy: 20, once: true,
    when: () => isMinister() && S.stage >= 2 && !isPastor(),
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
  // ---- food ----
  {
    id: 'buka', emoji: '🍛', name: 'Eat at the Buka', energy: 5,
    cost: () => 800,
    avail: () => S.hunger < 95,
    desc: () => 'Amala, ewedu and two pieces of meat. ₦800.',
    run() {
      S.hunger = clamp(S.hunger + 45, 0, 100);
      return 'Belle full. You feel strong again.';
    },
  },
  {
    id: 'cook', emoji: '🍳', name: 'Cook at Home', energy: 15,
    cost: () => 400,
    avail: () => S.hunger < 95,
    desc: () => 'Rice and stew. Cheaper, but takes time. ₦400.',
    run() {
      S.hunger = clamp(S.hunger + 35, 0, 100);
      return 'Home-cooked rice and stew. Mama would be proud.';
    },
  },
  // ---- prayer room (everyone) ----
  {
    id: 'prayroom', emoji: '🕯️', name: 'Pray in the Prayer Room', energy: 20, once: true,
    desc: () => 'Quiet hour at the altar, open 24/7.',
    run() {
      const f = Math.round(8 * bonus('prayer')) + (S.items.mat ? 2 : 0);
      grow('faith', f);
      return `An hour alone with God. +${f} faith.` + reward(S.role === 'prayer' ? 4 : 2, 3);
    },
  },
  {
    id: 'prayfor', emoji: '🤲', name: 'Pray for a Request', energy: 8, limit: 5,
    desc: () => `Pray for someone on the prayer wall (${5 - (S.doneToday.prayfor || 0)} left today).`,
    run() { prayForRequest(); return null; },
  },
  {
    id: 'mountain', emoji: '⛰️', name: 'Go Up Prayer Mountain (Ikorodu)', energy: 60, once: true,
    cost: () => 1500,
    avail: () => weekday() === 'Sat',
    desc: () => weekday() === 'Sat' ? 'Bus fare ₦1,500. A whole day of prayer.' : 'Saturdays only.',
    run() {
      grow('faith', 18); grow('character', 3);
      return 'You spent the day on Prayer Mountain. Your spirit feels renewed. +18 faith.' + reward(6, 12);
    },
  },
  // ---- evangelism missions ----
  ...MISSIONS.map((m) => ({
    id: m.id, emoji: m.emoji, name: m.name, energy: m.energy, once: true, mission: m,
    when: () => !isPastor() && (S.stage >= 1 || S.role === 'minister'),
    cost: m.cost ? () => m.cost : undefined,
    avail: () => S.faith >= m.faith && S.character >= m.character && (m.level < 5 || ['Sat', 'Sun'].includes(weekday())),
    desc: () => {
      const stars = '🔥'.repeat(m.level);
      if (S.faith < m.faith || S.character < m.character) return `${stars} Needs faith ${m.faith}+ and character ${m.character}+.`;
      if (m.level === 5 && !['Sat', 'Sun'].includes(weekday())) return `${stars} Weekends only.`;
      return `${stars} ${m.desc} Pays ${naira(m.pay)} + ${m.points}⭐.`;
    },
    run() {
      // Better prepared evangelists (faith + word) win more souls.
      const prep = 0.6 + (S.faith + S.word) / 250;
      const souls = Math.max(0, Math.round(rand(m.souls[0], m.souls[1]) * prep));
      S.souls += souls;
      S.funds += m.pay;
      grow('faith', 2 + m.level); grow('character', 1 + m.level);
      const trial = chance(0.25 + m.level * 0.1) ? ' ' + pick(m.hard) : '';
      return `${m.name}: ${souls ? `${souls} ${souls === 1 ? 'person' : 'people'} gave their lives to Christ! 🎉` : 'No one responded today, but seeds were sown.'}${trial} Missions stipend ${naira(m.pay)}.` + reward(3 + m.level * 3, m.points);
    },
  })),
  // ---- role duties ----
  {
    id: 'gate', emoji: '🚧', name: 'Gate & Car Park Duty', energy: 30, once: true, role: 'security',
    when: () => S.role === 'security',
    avail: () => ['Sun', 'Wed', 'Fri'].includes(weekday()),
    desc: () => 'Direct cars and watch the gate. (Service days)',
    run() {
      grow('character', 2); grow('faith', 2);
      return 'You parked 60 cars without one scratch. The Head of Security nodded at you.' + reward(10, 6);
    },
  },
  {
    id: 'patrol', emoji: '🔦', name: 'Night Patrol', energy: 30, once: true, role: 'security',
    when: () => S.role === 'security',
    avail: () => ['Fri', 'Sat'].includes(weekday()),
    desc: () => 'Guard the premises during vigil and on Saturday night.',
    run() {
      grow('character', 2);
      return 'Quiet night. You prayed while you patrolled.' + reward(8, 5);
    },
  },
  {
    id: 'seat', emoji: '🪑', name: 'Usher at Service', energy: 30, once: true, role: 'usher',
    when: () => S.role === 'usher',
    avail: () => ['Sun', 'Wed', 'Fri'].includes(weekday()),
    desc: () => 'Seat people and keep the aisles clear. (Service days)',
    run() {
      grow('character', 2); grow('faith', 2);
      return 'You seated 200 people and found a front seat for a pregnant woman.' + reward(10, 6);
    },
  },
  {
    id: 'welcome', emoji: '👋', name: 'Welcome First-timers', energy: 15, once: true, role: 'usher',
    when: () => S.role === 'usher',
    avail: () => isSunday(),
    desc: () => 'Smile, take their details, hand out welcome packs.',
    run() {
      grow('character', 3);
      return 'Three first-timers said they will come back next week.' + reward(6, 4);
    },
  },
  {
    id: 'rehearse', emoji: '🎼', name: 'Choir Rehearsal', energy: 25, once: true, role: 'choir',
    when: () => S.role === 'choir',
    avail: () => ['Tue', 'Thu', 'Sat'].includes(weekday()),
    desc: () => 'Practise Sunday\'s songs. (Tue, Thu, Sat)',
    run() {
      grow('faith', 3);
      return 'You finally got the alto line right.' + reward(8, 4);
    },
  },
  {
    id: 'ministersong', emoji: '🎤', name: 'Minister in Song', energy: 30, once: true, role: 'choir',
    when: () => S.role === 'choir',
    avail: () => isSunday(),
    desc: () => 'Lead the congregation in worship.',
    run() {
      grow('faith', 5);
      return 'The whole church was on its feet. Some people were in tears.' + reward(12, 8);
    },
  },
  {
    id: 'sound', emoji: '🎚️', name: 'Run Sound & Projection', energy: 30, once: true, role: 'media',
    when: () => S.role === 'media',
    avail: () => ['Sun', 'Wed', 'Fri'].includes(weekday()),
    desc: () => 'Mixer, lyrics on screen, livestream. (Service days)',
    run() {
      grow('character', 2);
      return 'No feedback, lyrics on time, livestream steady. Nobody noticed you, which means you did it right.' + reward(10, 6);
    },
  },
  {
    id: 'clips', emoji: '✂️', name: 'Edit Sermon Clips', energy: 20, once: true, role: 'media',
    when: () => S.role === 'media',
    avail: () => !isSunday(),
    desc: () => 'Post short clips on the church\'s pages.',
    run() {
      grow('word', 3);
      return 'Your clip of last Sunday\'s sermon got 4,000 views.' + reward(6, 4);
    },
  },
  {
    id: 'cook', emoji: '🍲', name: 'Cook for the Programme', energy: 35, once: true, role: 'hospitality',
    when: () => S.role === 'hospitality',
    avail: () => ['Sun', 'Fri'].includes(weekday()),
    desc: () => 'Jollof for workers and visitors. (Sun, Fri)',
    run() {
      grow('character', 3);
      return 'Jollof finished. Everybody chopped. Nobody complained.' + reward(10, 6);
    },
  },
  {
    id: 'clean', emoji: '🧹', name: 'Clean the Church', energy: 25, once: true, role: 'hospitality',
    when: () => S.role === 'hospitality',
    avail: () => weekday() === 'Sat',
    desc: () => 'Saturday sanitation, getting ready for Sunday.',
    run() {
      grow('character', 3);
      return 'The auditorium is shining for Sunday.' + reward(8, 5);
    },
  },
  {
    id: 'teach', emoji: '🧒', name: 'Teach Sunday School', energy: 30, once: true, role: 'children',
    when: () => S.role === 'children',
    avail: () => isSunday(),
    desc: () => 'Bible story, songs and a memory verse.',
    run() {
      grow('character', 3); grow('word', 2);
      return 'The kids acted out David and Goliath. Little Ayo played Goliath and refused to fall down.' + reward(12, 7);
    },
  },
  {
    id: 'lesson', emoji: '✏️', name: 'Prepare Next Lesson', energy: 15, once: true, role: 'children',
    when: () => S.role === 'children',
    avail: () => !isSunday(),
    desc: () => 'Plan Sunday\'s Bible story and craft.',
    run() {
      grow('word', 4);
      return 'Lesson ready: Noah\'s ark with paper animals.' + reward(6, 3);
    },
  },
  {
    id: 'intercede', emoji: '🔥', name: 'Intercession Session', energy: 30, once: true, role: 'prayer',
    when: () => S.role === 'prayer',
    desc: () => 'Stand in the gap for the church and the nation.',
    run() {
      grow('faith', 7 * bonus('prayer'));
      return 'You prayed for the church, the pastor, the sick and Nigeria.' + reward(10, 6);
    },
  },
  {
    id: 'prayerline', emoji: '☎️', name: 'Answer the Prayer Line', energy: 20, once: true, role: 'prayer',
    when: () => S.role === 'prayer',
    avail: () => !isSunday(),
    desc: () => 'People call in with needs. Listen and pray with them.',
    run() {
      grow('character', 3); grow('faith', 2);
      return 'A woman called crying about her son. You prayed with her for 20 minutes.' + reward(8, 5);
    },
  },
  {
    id: 'invite', emoji: '💌', name: 'Invite Someone to Church', energy: 15, once: true, role: 'worshipper',
    when: () => S.role === 'worshipper',
    desc: () => 'Your neighbour, a colleague, your barber.',
    run() {
      grow('character', 2);
      return 'Your barber said he will come on Sunday. We shall see.' + reward(6, 4);
    },
  },
  {
    id: 'fellowship', emoji: '🏠', name: 'House Fellowship', energy: 25, once: true, role: 'worshipper',
    when: () => S.role === 'worshipper',
    avail: () => ['Tue', 'Thu'].includes(weekday()),
    desc: () => 'Bible study and gist in a member\'s living room. (Tue, Thu)',
    run() {
      grow('faith', 4); grow('word', 3);
      return 'Good word, good small chops, good people.' + reward(8, 5);
    },
  },
  {
    id: 'explore', emoji: '🔎', name: 'Ask Questions About the Faith', energy: 15, once: true, role: 'visitor',
    when: () => S.role === 'visitor',
    desc: () => 'Chat with a member after service or online.',
    run() {
      grow('word', 3); grow('faith', 2);
      return 'You asked why Christians pray in Jesus\' name. The answer made sense.' + reward(8, 4);
    },
  },
  {
    id: 'followup', emoji: '🚪', name: 'Receive a Follow-up Visit', energy: 10, once: true, role: 'visitor',
    when: () => S.role === 'visitor',
    avail: () => weekday() === 'Tue',
    desc: () => 'Someone from the church comes to check on you. (Tue)',
    run() {
      grow('faith', 4);
      return 'Sister Funke visited with biscuits and a smile. You feel welcome.' + reward(6, 3);
    },
  },
  {
    id: 'changerole', emoji: '🔄', name: 'Change Role', energy: 0,
    when: () => !isPastor(),
    desc: () => 'Serve somewhere else. Your rank starts over.',
    run() { chooseRole(); return null; },
  },
  // ---- distractions: the devil is busy ----
  {
    id: 'viewing', emoji: '⚽', name: 'Football at the Viewing Centre', energy: 0, once: true, shady: true,
    when: () => !isPastor(),
    avail: () => isSunday() && !S.doneToday.sunday,
    cost: () => 500,
    desc: () => 'Big match this morning. Church can wait... abi?',
    run() {
      S.doneToday.sunday = true;
      S.skippedSunday = true;
      grow('faith', -6);
      S.energy = Math.min(100, S.energy + 15);
      return 'Your team won 2-1! But you missed church. -6 faith, +15 energy.';
    },
  },
  {
    id: 'sleepin', emoji: '🛌', name: 'Sleep In on Sunday', energy: 0, once: true, shady: true,
    when: () => !isPastor(),
    avail: () => isSunday() && !S.doneToday.sunday,
    desc: () => 'Your bed is calling you. Just this once.',
    run() {
      S.doneToday.sunday = true;
      S.skippedSunday = true;
      S.energy = Math.min(100, S.energy + 25);
      grow('faith', -4);
      return 'You slept till 1pm. +25 energy, but you missed church. -4 faith.';
    },
  },
  {
    id: 'bet', emoji: '🎰', name: 'Bet on Football', energy: 5, shady: true,
    cost: () => 1000,
    desc: () => 'Stake ₦1,000. "Sure banker" from your guy.',
    run() {
      const won = chance(0.3);
      if (won) S.funds += 3500;
      return (won ? 'You won ₦3,500! The devil smiles. ' : 'You lost ₦1,000. "Next one go enter." ') + fall('gambling', 4);
    },
  },
  {
    id: 'owambe', emoji: '🎉', name: 'Owambe Instead of Vigil', energy: 0, once: true, shady: true,
    when: () => !isPastor(),
    avail: () => weekday() === 'Fri' && !S.doneToday.mvigil,
    desc: () => 'Owambe in Surulere: jollof, small chops, DJ. Vigil will still be there next week.',
    run() {
      S.doneToday.mvigil = true;
      S.energy = Math.min(100, S.energy + 20);
      grow('faith', -5);
      S.points += 2;
      return 'You danced till 2am. +20 energy, +2⭐, but -5 faith.';
    },
  },
  {
    id: 'beer', emoji: '🍺', name: 'Gist at the Beer Parlour', energy: 10, once: true, shady: true,
    cost: () => 1500,
    desc: () => 'Pepper soup, cold drink, plenty gist about people.',
    run() {
      grow('faith', -3);
      return 'Good pepper soup. Plenty gossip. ' + fall('gossip and drunkenness', 4);
    },
  },
  {
    id: 'yahoo', emoji: '💻', name: 'Join the "Yahoo" Boys', energy: 30, once: true, shady: true,
    when: () => !isPastor(),
    desc: () => 'Your old friend says one "client" pays more than a year of work.',
    run() {
      const m = S.salary * rand(8, 15);
      S.funds += m;
      S.frauds += 1;
      return `You got ${naira(m)} from a "client" abroad. ` + fall('fraud', 15);
    },
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

const energyOf = (a) => a.energyFn ? a.energyFn() : a.energy;

function canDo(a) {
  if (S.over) return false;
  if (S.energy < energyOf(a)) return false;
  if (a.once && S.doneToday[a.id]) return false;
  if (a.limit && (S.doneToday[a.id] || 0) >= a.limit) return false;
  if (a.avail && !a.avail()) return false;
  if (a.cost && S.funds < a.cost()) return false;
  return true;
}

function doAction(id) {
  const a = ACTIONS.find((x) => x.id === id);
  if (!a || (a.when && !a.when()) || !canDo(a)) return;
  S.energy -= energyOf(a);
  if (a.cost) S.funds -= a.cost();
  if (a.once) S.doneToday[a.id] = true;
  if (a.limit) S.doneToday[a.id] = (S.doneToday[a.id] || 0) + 1;
  const msg = a.run();
  if (msg) { log(msg); toast(msg); }
  afterChange();
  checkCollapse();
}

/* ---------------- journey milestones ---------------- */

const examNeed = () => 25 + S.semester * 15; // 40, 55, 70
const BIBLE_SCHOOL_FEE = 60000;

function milestone() {
  return isMinister() ? ministerMilestone() : roleMilestone();
}

// Non-minister roles: baptism (except visitors), then two promotions.
function roleMilestone() {
  const r = ROLES[S.role];
  if (S.role !== 'visitor' && S.stage === 0) return baptismMilestone();
  if (S.rank >= 2) return null;
  const next = S.rank + 1;
  const need = RANK_XP[next];
  const reqs = [[`Experience ${Math.min(S.xp, need)}/${need}`, S.xp >= need]];
  if (next === 1) reqs.push(['Faith 40+', S.faith >= 40], ['Character 50+', S.character >= 50]);
  else reqs.push(['Faith 60+', S.faith >= 60], ['Character 70+', S.character >= 70], ['No unconfessed sin', !S.convicted]);
  return {
    label: `Become ${r.ranks[next]}`, emoji: r.emoji, reqs,
    go: () => {
      S.rank = next;
      S.points += 25 * next;
      if (S.role === 'visitor' && next === 2) {
        S.role = 'worshipper';
        S.rank = 1;
        showModal('🎉', 'Welcome to the family!', `You are now a member of ${S.church}. You can serve in any department with "Change Role".\n\n${verseText(V_GLAD)}`, [{ label: 'Halleluyah! 🙌' }]);
      } else {
        showModal(r.emoji, 'Promoted!', `You are now ${r.ranks[next]}. +${25 * next}⭐\n\n${verseText(r.verse || V_HEARTILY)}`, [{ label: 'To God be the glory' }]);
      }
      log(`Promoted to ${title()}.`);
    },
  };
}

function baptismMilestone() {
  return {
    label: 'Get baptized', emoji: '💧',
    reqs: [['Attend 2 services or vigils', S.services >= 2], ['Faith 30+', S.faith >= 30]],
    go: () => {
      S.stage = 1;
      S.points += 20;
      showModal('💧', 'Baptized!', `You went down into the water and came up a new creation. The whole church rejoiced! +20⭐\n\n${verseText(V_BAPTISM)}`, [{ label: 'Halleluyah! 🙌' }]);
      log('You were baptized! 💧');
    },
  };
}

function ministerMilestone() {
  switch (S.stage) {
    case 0: return baptismMilestone();
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

/* ---------------- prayer wall ---------------- */

function prayForRequest() {
  const [who, text] = SAMPLE_REQUESTS[(S.prayed + S.day) % SAMPLE_REQUESTS.length];
  showModal('🤲', `${who}'s request`, `"${text}"\n\n${verseText(V_PRAYER)}`, [
    { label: '🙏 Pray for them', fn: () => {
      S.prayed += 1;
      grow('faith', 2); grow('character', 1);
      const msg = `You prayed for ${who}.` + reward(S.role === 'prayer' ? 3 : 1, 2);
      log(msg); toast(msg); afterChange();
    } },
  ]);
}

function postRequest() {
  const el = $('req-text');
  const text = el.value.trim().slice(0, 200);
  if (!text) return;
  S.requests.unshift({ id: Date.now(), text, day: S.day, answered: false });
  if (S.requests.length > 20) S.requests.length = 20;
  el.value = '';
  log('You posted a prayer request.');
  toast('Request posted. Keep trusting God. 🙏');
  afterChange();
}

function markAnswered(id) {
  const r = S.requests.find((x) => x.id === id);
  if (!r || r.answered) return;
  r.answered = true;
  S.testimonies += 1;
  grow('faith', 6);
  S.points += 15;
  log(`Testimony! God answered: "${r.text}"`);
  showModal('🎉', 'Testimony!', `"${r.text}"\n\nGod answered your prayer. Share your testimony and encourage someone. +15⭐`, [
    { label: '📤 Share testimony', fn: openShare },
    { label: 'Thank You, Jesus 🙌' },
  ]);
  afterChange();
}

/* ---------------- shop ---------------- */

function buyItem(id) {
  const it = SHOP.find((x) => x.id === id);
  if (!it || S.items[id] || S.over) return;
  if (it.naira && S.funds < it.naira) return;
  if (it.points && S.points < it.points) return;
  if (it.naira) S.funds -= it.naira;
  if (it.points) S.points -= it.points;
  S.items[id] = true;
  log(`Bought ${it.name} ${it.emoji}`);
  toast(`${it.emoji} ${it.name} is yours!`);
  afterChange();
}

/* ---------------- roles ---------------- */

function chooseRole() {
  const ids = Object.keys(ROLES).filter((id) => id !== S.role);
  showModal('🔄', 'Where will you serve?', 'Your rank in the new role starts from the beginning.', ids.map((id) => ({
    label: `${ROLES[id].emoji} ${ROLES[id].name}`,
    fn: () => {
      S.role = id;
      S.rank = 0;
      S.xp = 0;
      log(`You now serve as: ${ROLES[id].name}.`);
      afterChange();
    },
  })).concat([{ label: 'Stay where I am' }]));
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
  if (S.over) return false;
  if (S.frauds >= 3 && chance(0.5)) {
    gameOver('🚓', 'EFCC dey come!', `EFCC traced the "client" money to ${S.name}'s account. Arrested on day ${S.day}.\n\n${verseText(V_REAP)}`);
    return true;
  }
  if (S.character > 0) return false;
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

  // Free will: skipping church has consequences, showing up builds a streak.
  if (wasSunday && !isPastor()) {
    if (S.doneToday.sunday && !S.skippedSunday) {
      S.streak += 1;
      const b = Math.min(5 * S.streak, 30);
      S.points += b;
      report.push(`Sunday streak: ${S.streak} week${S.streak === 1 ? '' : 's'}! +${b}⭐`);
    } else {
      S.streak = 0;
      S.missedSundays += 1;
      grow('faith', -6);
      if (S.role !== 'visitor' && S.role !== 'worshipper' && S.role !== 'minister') S.xp = Math.max(0, S.xp - 5);
      report.push(S.role === 'visitor' ? 'You did not go to church today.' : `You missed Sunday service. Your ${isMinister() || S.role === 'worshipper' ? 'cell leader' : 'Head of Department'} called to ask if you are okay. -6 faith.`);
    }
  }
  S.skippedSunday = false;

  grow('faith', -1.5);
  grow('word', -0.5);
  if (S.convicted) grow('character', -1);
  S.hunger = clamp(S.hunger - 30, 0, 100);

  S.day += 1;
  S.energy = S.hunger < 25 ? 70 : 100;
  if (S.items.bike) S.energy = Math.min(100, S.energy + 10);
  if (S.hunger < 25) report.push('You went to bed hungry. Less energy today. Eat something!');
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
  // The devil is busy: a temptation most nights, otherwise a life event.
  const ok = (e) => !e.special && (!e.cond || e.cond());
  const tempts = EVENTS.filter((e) => e.tempt && ok(e));
  const life = EVENTS.filter((e) => !e.tempt && ok(e));
  if (tempts.length && chance(0.45)) runEvent(pick(tempts));
  else if (life.length && chance(0.45)) runEvent(pick(life));
}

/* ---------------- events ---------------- */

const EVENTS = [
  // ---- temptations ----
  {
    id: 'gossip', tempt: true, emoji: '🗣️', title: 'Gossip after service',
    text: () => 'Some sisters are whispering about the choir leader\'s marriage. "Did you hear...?"',
    choices: [
      { label: 'Join the gist', fn: () => fall('gossip') },
      { label: 'Walk away kindly', fn: () => { grow('character', 4); return 'You changed the topic and walked away. +4 character.'; } },
    ],
  },
  {
    id: 'traffic', tempt: true, emoji: '🚌', title: 'Danfo wahala at Ojuelegba',
    text: () => 'A danfo driver hit your side mirror at Ojuelegba, then insulted you loudly in traffic.',
    choices: [
      { label: 'Give it back to him!', fn: () => fall('anger') },
      { label: 'Forgive and let it go', fn: () => { grow('character', 5); return `You forgave him. +5 character.\n${V_FORGIVE[0]}`; } },
    ],
  },
  {
    id: 'receipts', tempt: true, emoji: '🧾', title: 'Inflate the receipt?',
    cond: () => !isPastor(),
    text: () => `Your boss wants you to inflate a supplier receipt. "Na small thing. I'll add ${naira(S.salary * 3)} for you."`,
    choices: [
      { label: 'Do it', fn: () => { S.funds += S.salary * 3; return fall('dishonesty'); } },
      { label: 'Refuse respectfully', fn: () => { grow('character', 6); if (chance(0.4)) { S.salary = Math.round(S.salary * 1.3); return `The MD heard about your honesty and promoted you! Salary is now ${naira(S.salary)}.`; } return 'Your boss was annoyed, but your conscience is clear. +6 character.'; } },
    ],
  },
  {
    id: 'wallet', tempt: true, emoji: '👛', title: 'Found a wallet',
    text: () => 'You found a wallet with ₦50,000 and an ID card at the bus stop.',
    choices: [
      { label: 'Keep it', fn: () => { S.funds += 50000; return fall('stealing'); } },
      { label: 'Return it to the owner', fn: () => { grow('character', 7); S.funds += 5000; return 'The owner cried with joy and gave you ₦5,000 "for transport". +7 character.'; } },
    ],
  },
  {
    id: 'leak', tempt: true, emoji: '📄', title: 'Exam questions leaked',
    cond: () => S.stage === 3,
    text: () => 'A classmate whispers: "I have the exam questions. Want them?"',
    choices: [
      { label: 'Take a look', fn: () => fall('cheating') + ' The leak was discovered and the exam was rescheduled anyway.' },
      { label: 'No, I will study', fn: () => { grow('character', 5); grow('word', 3); return 'You studied honestly instead. +5 character, +3 word.'; } },
    ],
  },
  {
    id: 'pride', tempt: true, emoji: '🏆', title: 'Praise from everyone',
    cond: () => isPastor() && S.members >= 100,
    text: () => 'After a powerful service, people are calling you "the greatest man of God in this city".',
    choices: [
      { label: 'Enjoy it. I worked hard!', fn: () => { grow('fame', 5); return fall('pride'); } },
      { label: 'Give all glory to God', fn: () => { grow('character', 5); grow('faith', 3); return 'You pointed everyone to Jesus. +5 character.'; } },
    ],
  },
  {
    id: 'deacon', tempt: true, emoji: '💼', title: 'Rich member, one request',
    cond: () => isPastor() && S.members >= 30,
    text: () => `Chief Okafor will donate ${naira(S.members * 2000)}... if you make him a Deacon. He hasn't attended service in months.`,
    choices: [
      { label: 'Accept the donation', fn: () => { S.funds += S.members * 2000; return fall('compromise', 5); } },
      { label: 'Politely decline', fn: () => { grow('character', 4); grow('faith', 2); return 'You stood your ground. +4 character.'; } },
    ],
  },
  {
    id: 'politician', tempt: true, emoji: '🎩', title: 'A politician\'s offer',
    cond: () => isPastor() && S.members >= 150,
    text: () => `Honourable "Dividends" offers ${naira(S.members * 3000)} if you tell your members to vote for him.`,
    choices: [
      { label: 'Accept the money', fn: () => { S.funds += S.members * 3000; grow('fame', 5); return fall('selling the pulpit'); } },
      { label: 'Pray for him, decline the money', fn: () => { grow('character', 6); return 'You prayed for him and kept the pulpit pure. +6 character.'; } },
    ],
  },
  {
    id: 'yahooinvite', tempt: true, emoji: '💻', title: 'Easy money?',
    cond: () => !isPastor(),
    text: () => 'Your secondary school friend from Festac just bought a Benz. "Guy, come join us. Na just chatting with oyinbo people online."',
    choices: [
      { label: 'Join him', fn: () => { const m = S.salary * 10; S.funds += m; S.frauds += 1; return `First "client" paid ${naira(m)}. ` + fall('fraud', 15); } },
      { label: 'No. I will work honestly', fn: () => { grow('character', 6); return 'He laughed at you. You slept peacefully. +6 character.'; } },
    ],
  },
  {
    id: 'flirt', tempt: true, emoji: '📩', title: '"Good morning dear"',
    text: () => 'A married colleague keeps sending you late-night "Good morning dear 😘" messages.',
    choices: [
      { label: 'Reply with heart emojis', fn: () => fall('flirting with a married person', 8) },
      { label: 'Set boundaries politely', fn: () => { grow('character', 5); return 'You told them clearly to stop. +5 character.'; } },
    ],
  },
  {
    id: 'beach', tempt: true, emoji: '🏖️', title: 'Beach party, Sunday morning',
    cond: () => weekday() === 'Sun' && !isPastor(),
    text: () => 'Your friends call: "Boat ride to Tarkwa Bay beach today! Skip church jare, God understands."',
    choices: [
      { label: 'Go to the beach', fn: () => { S.doneToday.sunday = true; S.skippedSunday = true; grow('faith', -6); S.points += 3; return 'Suya, music and sun. +3⭐, but you missed church. -6 faith.'; } },
      { label: 'Go to church, beach later', fn: () => { grow('character', 3); return 'You chose God first. +3 character.'; } },
    ],
  },
  {
    id: 'derica', tempt: true, emoji: '⚖️', title: 'The small paint bucket',
    cond: () => S.job === 'Market trader',
    text: () => 'Your neighbour at the market uses a smaller "derica" to measure rice. "Everybody dey do am. You go make more money."',
    choices: [
      { label: 'Use the small bucket', fn: () => { S.funds += S.salary * 2; return fall('cheating customers', 7); } },
      { label: 'Keep honest measures', fn: () => { grow('character', 5); return 'Your customers trust you. One brought her sister to buy from you. +5 character.'; } },
    ],
  },
  {
    id: 'bribepark', tempt: true, emoji: '🚗', title: 'Park in the pastor\'s spot',
    cond: () => S.role === 'security',
    text: () => 'A big man in a Range Rover offers you ₦5,000 to let him park in the space reserved for the elderly.',
    choices: [
      { label: 'Collect the money', fn: () => { S.funds += 5000; return fall('taking a bribe', 8); } },
      { label: 'Politely direct him elsewhere', fn: () => { grow('character', 6); S.xp += 4; return 'He grumbled, but the Chief Security Officer saw it. +6 character.'; } },
    ],
  },
  {
    id: 'lostchild', emoji: '🧒', title: 'Lost child at the gate',
    cond: () => S.role === 'security',
    text: () => 'A crying 4-year-old is wandering near the gate during service.',
    choices: [{ label: 'Calm her and find her mum', fn: () => { grow('character', 5); return 'You found her mother inside. She hugged you and cried.' + reward(6, 8); } }],
  },
  {
    id: 'offeringbag', tempt: true, emoji: '👜', title: 'The offering bag',
    cond: () => S.role === 'usher',
    text: () => 'After service you are alone with the offering bag before counting. Nobody would notice ₦2,000 missing.',
    choices: [
      { label: 'Take ₦2,000 "for transport"', fn: () => { S.funds += 2000; return fall('stealing from God\'s house', 12); } },
      { label: 'Hand it over sealed', fn: () => { grow('character', 6); S.xp += 4; return 'The Head Usher trusts you more than ever. +6 character.'; } },
    ],
  },
  {
    id: 'frontseat', emoji: '💺', title: '"I must sit in front"',
    cond: () => S.role === 'usher',
    text: () => 'A latecomer insists on the reserved front row because she "gave the biggest offering last week".',
    choices: [
      { label: 'Find her a good seat kindly', fn: () => { grow('character', 3); return 'She calmed down and even smiled at the end.' + reward(4, 3); } },
      { label: 'Give her the reserved seat', fn: () => { grow('character', -2); return 'The visiting elderly couple had to stand. -2 character.'; } },
    ],
  },
  {
    id: 'solo', tempt: true, emoji: '🎤', title: 'They gave the solo to her',
    cond: () => S.role === 'choir',
    text: () => 'The Choir Director gave the Sunday solo to the new chorister instead of you.',
    choices: [
      { label: 'Gossip about her voice', fn: () => fall('envy', 7) },
      { label: 'Support her and sing your part', fn: () => { grow('character', 6); return 'She nailed it, and thanked you after. +6 character.'; } },
    ],
  },
  {
    id: 'nepa', emoji: '⚡', title: 'NEPA took light mid-service',
    cond: () => S.role === 'media',
    text: () => 'Power went off during the sermon and the livestream dropped.',
    choices: [
      { label: 'Switch to the generator fast', fn: () => { grow('character', 3); return 'Back live in 40 seconds. The pastor gave you a thumbs up.' + reward(6, 5); } },
      { label: 'Wait for NEPA', fn: () => { S.xp = Math.max(0, S.xp - 3); return 'NEPA did not come back. 300 people online left.'; } },
    ],
  },
  {
    id: 'editmistake', tempt: true, emoji: '🎞️', title: '"Cut that part"',
    cond: () => S.role === 'media',
    text: () => 'A deacon asks you to edit the video so it looks like he gave a big offering he never gave.',
    choices: [
      { label: 'Edit it for him', fn: () => fall('deception', 7) },
      { label: 'Refuse respectfully', fn: () => { grow('character', 6); return 'He was annoyed, but you kept your integrity. +6 character.'; } },
    ],
  },
  {
    id: 'meat', tempt: true, emoji: '🍗', title: 'Extra meat',
    cond: () => S.role === 'hospitality',
    text: () => 'There is extra chicken after the programme. Another volunteer is wrapping some to take home.',
    choices: [
      { label: 'Wrap some too', fn: () => { S.hunger = clamp(S.hunger + 30, 0, 100); return 'Your belle is happy. ' + fall('taking what was not yours', 5); } },
      { label: 'Ask the HOD what to do with it', fn: () => { grow('character', 4); S.hunger = clamp(S.hunger + 20, 0, 100); return 'The HOD shared it among all the volunteers. You got some too!'; } },
    ],
  },
  {
    id: 'naughty', emoji: '🙃', title: 'Naughty child',
    cond: () => S.role === 'children',
    text: () => 'A boy keeps disrupting the class and threw crayons at a girl.',
    choices: [
      { label: 'Talk to him gently', fn: () => { grow('character', 4); return 'He told you his parents fight at home. You prayed with him.' + reward(6, 5); } },
      { label: 'Shout at him', fn: () => fall('anger', 5) },
    ],
  },
  {
    id: 'cursereq', tempt: true, emoji: '🗡️', title: '"Pray my enemy should die"',
    cond: () => S.role === 'prayer',
    text: () => 'Someone on the prayer line asks you to pray that their business rival "falls down and dies".',
    choices: [
      { label: 'Pray "fire" on the enemy', fn: () => fall('cursing', 6) },
      { label: 'Pray for both of them', fn: () => { grow('character', 5); grow('faith', 3); return 'You prayed for peace and blessing for both. +5 character.'; } },
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
  $('hud-church').textContent = `${S.church} · ${S.area}`;
  $('hud-title').textContent = `${title()} ${S.name}`;
  $('hud-repent').classList.toggle('hidden', !S.convicted);
  $('hud-day').textContent = `Day ${S.day} · ${weekday()}`;
  $('hud-points').textContent = S.points;
  const [me, mt] = mood();
  $('hud-mood').textContent = `${me} ${mt}`;
  $('hud-mood').dataset.mood = mt.toLowerCase();
  $('hud-energy').textContent = S.energy;
  $('hud-energy-bar').style.width = S.energy + '%';
  setStat('hud-funds', naira(S.funds), isPastor() && S.funds < rent());
  setStat('hud-faith', Math.round(S.faith), S.faith < 25);
  setStat('hud-character', Math.round(S.character), S.character < 30);
  $('game').classList.toggle('is-pastor', isPastor());
  setMeter('meter-faith', S.faith, S.faith < 25);
  setMeter('meter-character', S.character, S.character < 30);
  if (isPastor()) {
    setStat('hud-word', Math.round(S.fame), false);
    setMeter('meter-word', S.fame, false);
    setStat('hud-members', `${num(S.members)}/${num(venue().cap)}`, false);
    setStat('hud-venue', venue().name, false);
  } else {
    setStat('hud-word', Math.round(S.word), false);
    setMeter('meter-word', S.word, false);
    setStat('hud-members', S.hunger < 25 ? 'Hungry' : Math.round(S.hunger), S.hunger < 25);
    setMeter('meter-food', S.hunger, S.hunger < 25);
    setStat('hud-venue', S.job, false);
  }
  $('hud-energy-meter').setAttribute('aria-valuenow', S.energy);
  $('verse').textContent = `“${verseOfDay()[1]}” — ${verseOfDay()[0]}`;
  $('btn-endday').disabled = S.over;
  $('btn-view').setAttribute('aria-label', S.view === 'home' ? 'Show church' : 'Show home');
  $('btn-view').querySelector('span').textContent = S.view === 'home' ? 'Church' : 'Home';
  renderMinistry();
  renderPrayer();
  renderBuild();
  renderLog();
  icons();
  if (window.World) World.update(S);
}

function icons() {
  if (window.lucide) lucide.createIcons({ attrs: { 'aria-hidden': 'true' } });
}

function setMeter(id, value, low) {
  const el = $(id);
  el.style.width = clamp(value, 0, 100) + '%';
  el.parentElement.classList.toggle('low', !!low);
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
  h.innerHTML = '<i data-lucide="flag"></i><span></span>';
  h.querySelector('span').textContent = `Next step: ${m.label}`;
  card.appendChild(h);
  const ul = document.createElement('ul');
  for (const [text, ok] of m.reqs) {
    const li = document.createElement('li');
    if (ok) li.className = 'ok';
    li.innerHTML = `<i data-lucide="${ok ? 'circle-check' : 'circle'}"></i><span></span>`;
    li.querySelector('span').textContent = text;
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
  const duties = ACTIONS.filter((a) => a.role && a.role === S.role).map((a) => a.id);
  const groups = isPastor()
    ? [['Shepherd the flock', ['service', 'evangelism', 'vigil', 'counsel', 'charity', 'crusade']],
       ['Your walk with God', ['repent', 'pray', 'read']],
       ['Daily life', ['work', 'buka', 'cook']],
       ['Distractions 😈 the devil is busy', ['oil', 'seed', 'poach', 'bet', 'beer']]]
    : [['Your walk with God', ['repent', 'sunday', 'biblestudy', 'mvigil', 'pray', 'read', 'witness', 'serve', 'help']],
       [`Your duty · ${ROLES[S.role].emoji} ${ROLES[S.role].name}`, [...duties, 'changerole']],
       ['Evangelism missions 📢 harder = more pay', MISSIONS.map((m) => m.id)],
       ['Bible School', ['lecture', 'exam']],
       ['Daily life', ['work', 'buka', 'cook']],
       ['Distractions 😈 the devil is busy', ['viewing', 'sleepin', 'owambe', 'bet', 'beer', 'yahoo']]];
  for (const [label, ids] of groups) {
    const list = ids.map((id) => visible.find((a) => a.id === id)).filter(Boolean);
    if (!list.length) continue;
    root.appendChild(sectionTitle(label));
    for (const a of list) {
      const parts = [`⚡${energyOf(a)}`];
      if (a.cost && a.cost() > 0) parts.push(naira(a.cost()));
      if ((a.once && S.doneToday[a.id]) || (a.limit && (S.doneToday[a.id] || 0) >= a.limit)) parts.push('done today');
      const cls = a.id === 'repent' ? 'repent' : a.shady ? 'shady' : '';
      root.appendChild(actionButton({
        emoji: a.emoji, name: actionName(a), desc: a.desc(), cost: parts.join('<br>'),
        disabled: !canDo(a), onClick: () => doAction(a.id), cls,
      }));
    }
  }
}

function renderPrayer() {
  const root = $('tab-prayer');
  root.innerHTML = '';
  const intro = document.createElement('div');
  intro.className = 'prayer-hero';
  intro.innerHTML = '<div class="prayer-count"><strong></strong><span>requests you have prayed for</span></div><p class="prayer-verse"></p>';
  intro.querySelector('strong').textContent = S.prayed;
  intro.querySelector('.prayer-verse').textContent = `"${V_REQUEST[1]}" — ${V_REQUEST[0]}`;
  root.appendChild(intro);

  root.appendChild(sectionTitle('Prayer room'));
  for (const id of ['prayroom', 'prayfor', 'mountain']) {
    const a = ACTIONS.find((x) => x.id === id);
    const parts = [`⚡${energyOf(a)}`];
    if (a.cost) parts.push(naira(a.cost()));
    root.appendChild(actionButton({ emoji: a.emoji, name: actionName(a), desc: a.desc(), cost: parts.join('<br>'), disabled: !canDo(a), onClick: () => doAction(a.id) }));
  }
  const note = document.createElement('p');
  note.className = 'note';
  note.textContent = 'The requests on the wall are examples for now. When multiplayer launches, they will be real requests from real people, and others will pray for yours.';
  root.appendChild(note);

  root.appendChild(sectionTitle('Your prayer requests'));
  const form = document.createElement('div');
  form.className = 'req-form';
  form.innerHTML = '<label for="req-text" class="sr-only">Your prayer request</label><textarea id="req-text" maxlength="200" rows="2" placeholder="What should we pray about?"></textarea><button class="btn primary" id="req-post"><i data-lucide="send"></i>Post</button>';
  form.querySelector('#req-post').addEventListener('click', postRequest);
  root.appendChild(form);
  if (!S.requests.length) {
    const empty = document.createElement('p');
    empty.className = 'note';
    empty.textContent = 'No requests yet. Philippians 4:6 says: in everything, let your requests be made known unto God.';
    root.appendChild(empty);
  }
  for (const r of S.requests) {
    const card = document.createElement('div');
    card.className = 'req' + (r.answered ? ' answered' : '');
    const t = document.createElement('p');
    t.textContent = r.text;
    const meta = document.createElement('div');
    meta.className = 'req-meta';
    meta.textContent = r.answered ? `🎉 Answered · posted day ${r.day}` : `Posted day ${r.day}`;
    card.append(t, meta);
    if (!r.answered) {
      const b = document.createElement('button');
      b.className = 'btn secondary sm';
      b.textContent = 'God answered! 🙌';
      b.addEventListener('click', () => markAnswered(r.id));
      card.appendChild(b);
    }
    root.appendChild(card);
  }
}

function renderBuild() {
  const root = $('tab-build');
  root.innerHTML = '';

  const wallet = document.createElement('div');
  wallet.className = 'wallet';
  wallet.innerHTML = '<div><span>Naira</span><strong id="w-naira"></strong></div><div><span>Points</span><strong id="w-points"></strong></div>';
  wallet.querySelector('#w-naira').textContent = naira(S.funds);
  wallet.querySelector('#w-points').textContent = `${S.points}⭐`;
  root.appendChild(wallet);

  root.appendChild(sectionTitle('Shop'));
  for (const it of SHOP) {
    const owned = !!S.items[it.id];
    const price = it.naira ? naira(it.naira) : `${it.points}⭐`;
    const afford = it.naira ? S.funds >= it.naira : S.points >= it.points;
    root.appendChild(actionButton({
      emoji: it.emoji, name: it.name, desc: it.desc, cost: owned ? '✅' : price,
      disabled: S.over || owned || !afford, onClick: () => buyItem(it.id), cls: owned ? 'owned' : '',
    }));
  }
  if (!isPastor()) return;

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
  const first = box.querySelector('button');
  if (first) first.focus({ preventScroll: true });
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

const days = (n) => `${n} day${n === 1 ? '' : 's'}`;

function shareLine() {
  if (S.over) return `EFCC came for Pastor ${S.name} on day ${S.day} 😭`;
  if (isPastor()) return `I became ${title()} in ${days(S.day)} 🙌`;
  return `I'm now ${title()} at ${S.church} after ${days(S.day)} 🙏`;
}

function drawShareCard() {
  const c = $('share-canvas');
  const x = c.getContext('2d');
  const W = c.width, H = c.height;
  const ink = '#000000';
  x.fillStyle = '#fffdf7';
  x.fillRect(0, 0, W, H);
  // faint grid paper
  x.strokeStyle = 'rgba(0,0,0,0.05)';
  x.lineWidth = 2;
  for (let g = 0; g <= W; g += 60) { x.beginPath(); x.moveTo(g, 0); x.lineTo(g, H); x.stroke(); x.beginPath(); x.moveTo(0, g); x.lineTo(W, g); x.stroke(); }

  const card = (l, t, w, h, fill, shadow = 10, r = 24) => {
    x.fillStyle = ink;
    roundRect(x, l + shadow, t + shadow, w, h, r);
    x.fill();
    x.fillStyle = fill;
    roundRect(x, l, t, w, h, r);
    x.fill();
    x.lineWidth = 5;
    x.strokeStyle = ink;
    x.stroke();
  };

  // logo + name
  card(90, 70, 96, 96, '#86efac', 6, 18);
  x.textAlign = 'center';
  x.font = '56px system-ui, sans-serif';
  x.fillText('⛪', 138, 138);
  x.textAlign = 'left';
  x.fillStyle = ink;
  x.font = 'bold 60px "Space Grotesk", system-ui, sans-serif';
  x.fillText('Amen City', 214, 138);

  // headline on a tilted pink highlight
  x.save();
  x.translate(W / 2, 300);
  x.rotate(-0.025);
  card(-460, -80, 920, 170, '#ff9ebb', 8, 20);
  x.restore();
  x.fillStyle = ink;
  x.textAlign = 'center';
  x.font = 'bold 54px "Space Grotesk", system-ui, sans-serif';
  wrapText(x, shareLine(), W / 2, 296, W - 260, 62);

  x.fillStyle = '#3f3f46';
  x.font = '600 36px Inter, system-ui, sans-serif';
  wrapText(x, `${title()} ${S.name} · ${S.church}`, W / 2, 470, W - 180, 46);

  const rows = isPastor()
    ? [['👥 Members', num(S.members), '#bfdbfe'], [venue().emoji + ' Venue', venue().name, '#fde047'], ['🙏 Faith', Math.round(S.faith) + '/100', '#c4b5fd'], ['🍇 Character', Math.round(S.character) + '/100', '#86efac']]
    : [['🙏 Faith', Math.round(S.faith) + '/100', '#c4b5fd'], ['🙌 Souls won', String(S.souls), '#bfdbfe'], ['🍇 Character', Math.round(S.character) + '/100', '#86efac'], ['⭐ Points', String(S.points), '#fde047']];
  const cw = 420, ch = 130, gx = 40;
  rows.forEach(([k, v, col], i) => {
    const l = W / 2 - cw - gx / 2 + (i % 2) * (cw + gx);
    const t = 560 + Math.floor(i / 2) * (ch + 36);
    card(l, t, cw, ch, col, 7, 18);
    x.textAlign = 'left';
    x.fillStyle = '#18181b';
    x.font = '600 30px Inter, system-ui, sans-serif';
    x.fillText(k, l + 26, t + 50);
    x.font = 'bold 42px "Space Grotesk", system-ui, sans-serif';
    x.fillText(v, l + 26, t + 102);
  });

  // footer call to action
  card(90, H - 170, W - 180, 110, ink, 0, 18);
  x.fillStyle = '#ffffff';
  x.textAlign = 'center';
  x.font = 'bold 36px "Space Grotesk", system-ui, sans-serif';
  x.fillText('Start your faith journey. Play free →', W / 2, H - 120);
  x.fillStyle = '#fde047';
  x.font = '600 26px Inter, system-ui, sans-serif';
  const url = GAME_URL.replace(/^https?:\/\//, '');
  x.fillText(url.length > 52 ? url.slice(0, 51) + '…' : url, W / 2, H - 80);
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
  const text = `${shareLine()} in Amen City ⛪ Start your own faith journey: ${GAME_URL}`;
  $('btn-share-wa').href = 'https://wa.me/?text=' + encodeURIComponent(text);
  $('btn-share-x').href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text);
  $('btn-share-native').onclick = () => {
    $('share-canvas').toBlob(async (blob) => {
      const file = new File([blob], 'amen-city.png', { type: 'image/png' });
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
  a.download = 'amen-city.png';
  a.href = $('share-canvas').toDataURL('image/png');
  a.click();
}

/* ---------------- boot ---------------- */

function showScreen(id) {
  for (const s of ['start', 'reveal', 'game']) $(s).classList.toggle('hidden', s !== id);
  if (window.World) World.setMode(id);
}

function switchTab(name) {
  for (const t of document.querySelectorAll('.nav-item[data-tab]')) {
    const on = t.dataset.tab === name;
    t.classList.toggle('active', on);
    if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  }
  for (const n of ['ministry', 'prayer', 'build', 'log']) $('tab-' + n).classList.toggle('hidden', n !== name);
}

function beginNew() {
  const name = $('in-name').value.trim() || 'Tunde';
  const church = $('in-church').value.trim() || 'Grace Assembly';
  const roleEl = document.querySelector('input[name="role"]:checked');
  S = newState(name, church, $('in-ctype').value, roleEl ? roleEl.value : 'worshipper');
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
    const r = ROLES[S.role];
    const future = S.role === 'minister' ? `One day, you'll pastor "${church}".` : `You start as ${r.ranks[0]} at ${church}, ${S.area}.`;
    $('reveal-text').textContent = `${st.text}\n\nRole: ${r.emoji} ${r.name}\nChurch: ${ct.emoji} ${ct.name} (${ct.perk.toLowerCase()})\nHome: ${S.area}, Lagos · Job: ${st.job}\nSavings: ${naira(st.funds)}\n\n${future}`;
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
  const roleBox = $('role-picker');
  Object.entries(ROLES).forEach(([id, r], i) => {
    const l = document.createElement('label');
    l.className = 'role-option';
    l.innerHTML = '<input type="radio" name="role"><span class="re"></span><span class="rn"></span><span class="rb"></span>';
    const input = l.querySelector('input');
    input.value = id;
    input.checked = i === 0;
    l.querySelector('.re').textContent = r.emoji;
    l.querySelector('.rn').textContent = r.name;
    l.querySelector('.rb').textContent = r.blurb;
    roleBox.appendChild(l);
  });
  const saved = load();
  if (saved && !saved.over) $('btn-continue').classList.remove('hidden');
  $('btn-view').addEventListener('click', () => { if (!S) return; S.view = S.view === 'home' ? 'church' : 'home'; afterChange(); });

  $('btn-start').addEventListener('click', beginNew);
  $('btn-continue').addEventListener('click', () => { S = saved; enterGame(); });
  $('btn-begin').addEventListener('click', enterGame);
  $('btn-endday').addEventListener('click', endDay);
  $('btn-share').addEventListener('click', openShare);
  $('btn-share-dl').addEventListener('click', downloadCard);
  $('btn-share-close').addEventListener('click', () => $('share').classList.add('hidden'));
  for (const tab of document.querySelectorAll('.nav-item[data-tab]')) tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  initControls();
  icons();
}

/* ---------------- character controls ---------------- */

function showControls() {
  $('controls').classList.remove('hidden');
  $('btn-controls-close').focus({ preventScroll: true });
}

function initControls() {
  $('btn-controls').addEventListener('click', showControls);
  $('btn-controls-close').addEventListener('click', () => $('controls').classList.add('hidden'));
  // Touch pad: hold an arrow to walk, tap a button to act.
  for (const b of document.querySelectorAll('.dpad [data-move]')) {
    const on = (e) => { e.preventDefault(); b.classList.add('on'); if (window.World) World.setMove(b.dataset.move, true); };
    const off = () => { b.classList.remove('on'); if (window.World) World.setMove(b.dataset.move, false); };
    b.addEventListener('pointerdown', on);
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, off);
  }
  for (const b of document.querySelectorAll('.pad-actions [data-act]')) {
    b.addEventListener('click', () => { if (window.World) World.act(b.dataset.act); });
  }
  // Game shortcuts (movement keys are handled by the 3D world).
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('controls').classList.contains('hidden')) $('controls').classList.add('hidden');
      if (!$('share').classList.contains('hidden')) $('share').classList.add('hidden');
      return;
    }
    const el = document.activeElement;
    if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
    if (document.querySelector('.modal:not(.hidden)') || $('game').classList.contains('hidden') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '?') showControls();
    if (e.code === 'KeyN' && !e.repeat) endDay();
    if (e.code === 'KeyV' && !e.repeat && S) { S.view = S.view === 'home' ? 'church' : 'home'; afterChange(); }
  });
}

init();
