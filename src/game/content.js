// Amen City content: scripture, quiz, roles, missions, shop, schedule and other
// static data ported from the legacy prototype (legacy/game.js). Pure data, no DOM.
// Scripture is quoted from the King James Version (public domain).
// Real Lagos places are used; every church, pastor and person is fictional.

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const SUN = 6;
export const WIN_MEMBERS = 25000;
export const CHURCH_NAME = 'Grace Assembly';
export const CHURCH_AREA = 'Yaba';

/* ---------------------------------------------------------------- scripture */

/** @typedef {[ref: string, text: string]} Verse */

/** @type {Verse[]} Verse of the day rotation. */
export const VERSES = [
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

/** Verses used by specific moments in the story. */
export const V = {
  study: VERSES[14],
  refuge: VERSES[10],
  confess: ['1 John 1:9', 'If we confess our sins, he is faithful and just to forgive us our sins, and to cleanse us from all unrighteousness.'],
  baptism: ['Matthew 28:19', 'Go ye therefore, and teach all nations, baptizing them in the name of the Father, and of the Son, and of the Holy Ghost.'],
  forgive: ['Ephesians 4:32', 'And be ye kind one to another, tenderhearted, forgiving one another, even as God for Christ\'s sake hath forgiven you.'],
  fruit: ['Galatians 5:22-23', 'But the fruit of the Spirit is love, joy, peace, longsuffering, gentleness, goodness, faith, meekness, temperance: against such there is no law.'],
  growth: ['Acts 2:47', 'And the Lord added to the church daily such as should be saved.'],
  money: ['1 Timothy 6:10', 'For the love of money is the root of all evil: which while some coveted after, they have erred from the faith, and pierced themselves through with many sorrows.'],
  reap: ['Galatians 6:7', 'Be not deceived; God is not mocked: for whatsoever a man soweth, that shall he also reap.'],
  prayer: ['James 5:16', 'Confess your faults one to another, and pray one for another, that ye may be healed. The effectual fervent prayer of a righteous man availeth much.'],
  request: ['Philippians 4:6', 'Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God.'],
  door: ['Psalm 84:10', 'For a day in thy courts is better than a thousand. I had rather be a doorkeeper in the house of my God, than to dwell in the tents of wickedness.'],
  heartily: ['Colossians 3:23', 'And whatsoever ye do, do it heartily, as to the Lord, and not unto men;'],
  glad: ['Psalm 122:1', 'I was glad when they said unto me, Let us go into the house of the LORD.'],
};

/** @param {Verse} v */
export const verseText = (v) => `"${v[1]}"\n— ${v[0]} (KJV)`;

/* ---------------------------------------------------------------- Bible quiz */

/** [question, correct answer, wrong, wrong, wrong] */
export const QUIZ = [
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

/* ---------------------------------------------------------------- church life */

/** Each tradition strengthens a different part of the walk. */
export const CHURCH_TYPES = {
  pentecostal: { emoji: '🔥', name: 'Pentecostal', perk: 'Stronger vigils and crusades', bonus: { vigil: 1.5, crusade: 1.25 } },
  mission: { emoji: '⛪', name: 'Mission (Anglican / Methodist)', perk: 'Richer services and liturgy', bonus: { service: 1.25, study: 1.15 } },
  baptist: { emoji: '📖', name: 'Baptist', perk: 'Deeper Bible study', bonus: { study: 1.4 } },
  aladura: { emoji: '🤍', name: 'White Garment (Aladura)', perk: 'Powerful prayer life', bonus: { prayer: 1.6, vigil: 1.25 } },
};

/** Real Lagos areas (home towns in the backstory). */
export const LAGOS_AREAS = ['Yaba', 'Surulere', 'Ikeja', 'Ajegunle', 'Festac', 'Ikorodu', 'Mushin', 'Agege', 'Ojota', 'Lekki', 'Ketu', 'Oshodi'];

/** How your story begins. */
export const STARTS = {
  home: {
    emoji: '🏡', title: 'Raised in a Christian Home',
    text: 'You grew up singing in children\'s church, but now you must make the faith your own.',
    faith: 30, word: 20, character: 45, naira: 15000, salary: 3000, job: 'Apprentice tailor',
  },
  convert: {
    emoji: '✨', title: 'New Convert',
    text: 'A colleague invited you to church last Sunday and you gave your life to Christ. Everything is new!',
    faith: 20, word: 5, character: 40, naira: 40000, salary: 5000, job: 'Market trader',
  },
};

/**
 * Roles. `post` = world zones where a worker serves during a service (null: sit in the hall).
 * `color` is a UI accent token.
 */
export const ROLES = {
  worshipper: { emoji: '🙏', name: 'Worshipper', blurb: 'Come to church, worship, give, fellowship.', ranks: ['First-timer', 'Member', 'Pillar of the Church'], post: null, color: 'yellow' },
  prayer: { emoji: '🕊️', name: 'Prayer Warrior', blurb: 'Live in the prayer room and pray for others.', ranks: ['Intercessor', 'Prayer Warrior', 'Prayer Coordinator'], post: ['prayer-room'], postLabel: 'the prayer room', color: 'purple' },
  security: { emoji: '🛡️', name: 'Security', blurb: 'Gate, car park and safety of God\'s house.', ranks: ['Security Volunteer', 'Gate Supervisor', 'Chief Security Officer'], verse: V.door, post: ['gate', 'carpark'], postLabel: 'the gate or car park', color: 'blue' },
  usher: { emoji: '🧤', name: 'Usher', blurb: 'Seat people, welcome visitors, carry the offering.', ranks: ['Usher', 'Senior Usher', 'Head Usher'], post: ['church-hall', 'altar'], postLabel: 'the aisles of the hall', color: 'pink' },
  choir: { emoji: '🎶', name: 'Choir', blurb: 'Rehearse, minister in song, lead worship.', ranks: ['Chorister', 'Lead Vocalist', 'Choir Director'], post: ['choir'], postLabel: 'the choir stand', color: 'purple' },
  media: { emoji: '🎥', name: 'Media & Sound', blurb: 'Mixer, projector, livestream. NEPA wahala included.', ranks: ['Media Volunteer', 'Sound Engineer', 'Head of Media'], post: ['media'], postLabel: 'the media desk', color: 'blue' },
  hospitality: { emoji: '🍲', name: 'Hospitality', blurb: 'Church kitchen and keeping God\'s house clean.', ranks: ['Kitchen Volunteer', 'Head Cook', 'Head of Hospitality'], post: ['kitchen'], postLabel: 'the church kitchen', color: 'green' },
  children: { emoji: '🧒', name: 'Children\'s Teacher', blurb: 'Sunday school and the Christmas drama.', ranks: ['Assistant Teacher', 'Sunday School Teacher', 'Children\'s Church Coordinator'], post: ['children'], postLabel: 'children\'s church', color: 'yellow' },
  visitor: { emoji: '👀', name: 'Visitor', blurb: 'Just looking. No pressure.', ranks: ['Visitor', 'Regular Visitor', 'Member'], post: null, color: 'blue' },
  minister: { emoji: '📖', name: 'Minister Path', blurb: 'Bible school, ordination, then your own church.', ranks: [], post: null, color: 'green' },
};
export const ROLE_IDS = Object.keys(ROLES);

/** Experience needed for rank 0, 1, 2. */
export const RANK_XP = [0, 120, 450];

/** Minister path stages. */
export const STAGES = ['New Convert', 'Member', 'Worker', 'Bible School Student', 'Bible School Graduate', 'Pastor'];
export const STAGE = { convert: 0, member: 1, worker: 2, student: 3, graduate: 4, pastor: 5 };
export const BIBLE_SCHOOL_FEE = 60000;
/** Word needed to sit the exam of a semester (1-based). */
export const examNeed = (semester) => 25 + semester * 15;

export const DEPARTMENTS = [
  { id: 'choir', emoji: '🎶', name: 'Choir' },
  { id: 'ushers', emoji: '🧤', name: 'Ushering' },
  { id: 'evang', emoji: '📢', name: 'Evangelism' },
  { id: 'sunday', emoji: '🧒', name: 'Children\'s Church' },
];

/** Zones that count as "in the church hall". */
export const HALL_ZONES = ['church-hall', 'altar', 'choir', 'media'];

/* ---------------------------------------------------------------- schedule */

/**
 * Weekly services (in-game time). `weekday` 0 = Monday … 6 = Sunday; `start` and
 * `duration` in in-game minutes. `music` = minutes of worship music from the start (Infinity = all).
 */
export const SERVICES = [
  { kind: 'sunday', name: 'Sunday Service', short: 'Service', emoji: '⛪', weekday: 6, start: 9 * 60, duration: 150, music: Infinity, credit: 0.5 },
  { kind: 'study', name: 'Bible Study', short: 'Bible Study', emoji: '📚', weekday: 2, start: 18 * 60, duration: 90, music: 20, credit: 0.5 },
  { kind: 'vigil', name: 'Friday Vigil', short: 'Vigil', emoji: '🕯️', weekday: 4, start: 22 * 60, duration: 240, music: Infinity, credit: 0.4 },
  // Saturday is for the workers: the sanctuary gets cleaned in the morning and the choir rehearses in the afternoon.
  { kind: 'cleaning', name: 'Sanctuary Cleaning', short: 'Cleaning', emoji: '🧹', weekday: 5, start: 8 * 60, duration: 120, music: 0, credit: 0.4,
    roles: ['hospitality', 'usher', 'security', 'media', 'children', 'prayer'], anywhere: true },
  { kind: 'practice', name: 'Choir Practice', short: 'Practice', emoji: '🎼', weekday: 5, start: 16 * 60, duration: 120, music: Infinity, credit: 0.5, roles: ['choir'] },
];

/** Services that start for everyone (the NPC congregation fills the hall for these). */
export const WORSHIP_KINDS = ['sunday', 'study', 'vigil'];

/** The weekly schedule for a role: worship services plus that role's own meetings. */
export function servicesFor(role) {
  return SERVICES.filter((x) => !x.roles || x.roles.includes(role));
}

/** Zones of the church compound (for meetings that count anywhere on the premises). */
export const CHURCH_ZONES = ['compound', 'gate', 'carpark', 'church-hall', 'altar', 'choir', 'media', 'prayer-room', 'kitchen', 'children'];

/* ---------------------------------------------------------------- missions */

/**
 * Evangelism missions in real Lagos places. Harder missions need more faith and
 * character, cost more energy and time, and pay more (stipend from the missions board).
 */
export const MISSIONS = [
  { id: 'm_tracts', emoji: '📄', name: 'Share Tracts at Oshodi Bus Stop', place: 'Oshodi', level: 1, energy: 20, faith: 0, character: 0, cost: 0, pay: 500, points: 5, souls: [0, 2], hours: 2,
    desc: 'Easy. Hand out tracts to people waiting for danfo under the bridge.',
    hard: ['An agbero shouted "Commot for road!" but you kept smiling.', 'Rain started and everybody ran.'] },
  { id: 'm_market', emoji: '🛒', name: 'Preach at Balogun Market', place: 'Balogun Market', level: 2, energy: 35, faith: 35, character: 40, cost: 0, pay: 1500, points: 10, souls: [1, 4], hours: 3,
    desc: 'Medium. Lagos Island at its busiest. Some traders will argue with you.',
    hard: ['A trader asked you to buy something before she would listen.', 'Two men argued with you about religion for an hour.'] },
  { id: 'm_hospital', emoji: '🏥', name: 'Visit LUTH & Kirikiri Prison', place: 'Idi-Araba & Kirikiri', level: 3, energy: 45, faith: 45, character: 55, cost: 1000, pay: 3500, points: 18, souls: [1, 5], hours: 5,
    desc: 'Hard. Pray with patients at LUTH, Idi-Araba, and inmates at Kirikiri. Bring provisions (₦1,000).',
    hard: ['A patient you prayed with last week passed away. You comforted the family.', 'The prison officer delayed you for hours at the gate.'] },
  { id: 'm_slum', emoji: '🛶', name: 'Makoko Waterfront Outreach', place: 'Makoko', level: 4, energy: 60, faith: 55, character: 60, cost: 2000, pay: 8000, points: 30, souls: [3, 10], hours: 6,
    desc: 'Very hard. Canoe through the Makoko waterfront community with food and the Gospel. Boat and food: ₦2,000.',
    hard: ['Area boys demanded "settlement" before you could enter.', 'The canoe nearly capsized. Everyone prayed loudly.', 'A child there had a high fever. You took him to the clinic.'] },
  { id: 'm_village', emoji: '🛖', name: 'Village Crusade in Epe', place: 'Epe', level: 5, energy: 85, faith: 70, character: 70, cost: 5000, pay: 18000, points: 50, souls: [8, 25], hours: 10,
    desc: 'Hardest. Weekend mission to a village past Epe. Transport and supplies: ₦5,000.',
    hard: ['The Lekki–Epe road was so bad the bus got stuck twice.', 'A local strongman threatened the team, then came forward at the altar call.', 'No light, no network, mosquitoes everywhere.'] },
];

/* ---------------------------------------------------------------- shop */

/** Every item does something. Priced in naira or ⭐ points. */
export const SHOP = [
  { id: 'bible', emoji: '📕', name: 'Study Bible', naira: 4000, desc: '+2 extra word every time you read.' },
  { id: 'mat', emoji: '🧎', name: 'Prayer Mat', points: 80, desc: '+2 extra faith every time you pray.' },
  { id: 'tambourine', emoji: '🪘', name: 'Tambourine', points: 60, desc: 'Vigils hit different. +2 faith at vigils.' },
  { id: 'outfit', emoji: '👔', name: 'Sunday Best (Ankara)', naira: 12000, desc: 'Look sharp. +5⭐ every Sunday you attend.' },
  { id: 'bike', emoji: '🚲', name: 'Bicycle', naira: 45000, desc: 'Less trekking. Wake up with +10 energy.' },
  { id: 'phone', emoji: '📱', name: 'Smartphone + Bible app', naira: 60000, desc: 'Reading the Bible costs 5 less energy.' },
  { id: 'gele', emoji: '👑', name: 'Thanksgiving Aso-ebi', points: 300, desc: 'For the church anniversary. Pure vibes.' },
];

/** Food you can buy at places in the world (by world interactable id). */
export const FOOD = {
  buka: { emoji: '🍛', name: 'Amala, ewedu and two meat', where: 'Mama Nkechi\'s buka', naira: 800, hunger: 45, energy: 5 },
  canteen: { emoji: '🍚', name: 'Jollof rice and chicken', where: 'the church canteen', naira: 1000, hunger: 50, energy: 5 },
  'buy-water': { emoji: '💧', name: 'Pure water', where: 'the pure-water seller', naira: 20, hunger: 4, energy: 3 },
  'pos-kiosk': { emoji: '🍪', name: 'Gala and a cold Malta', where: 'the kiosk', naira: 300, hunger: 15, energy: 4 },
};

/* ---------------------------------------------------------------- prayer wall */

/** Practice requests on the prayer wall. With multiplayer these become real people's. */
export const SAMPLE_REQUESTS = [
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

/* ---------------------------------------------------------------- pastoring */

export const VENUES = [
  { name: 'House Fellowship', emoji: '🏠', cap: 20, rent: 0, cost: 0 },
  { name: 'Rented Shop', emoji: '🏚️', cap: 50, rent: 5000, cost: 60000 },
  { name: 'School Classroom', emoji: '🏫', cap: 150, rent: 20000, cost: 250000 },
  { name: 'Warehouse', emoji: '🏭', cap: 500, rent: 80000, cost: 1200000 },
  { name: 'Auditorium', emoji: '🏛️', cap: 2500, rent: 350000, cost: 8000000 },
  { name: 'Cathedral', emoji: '⛪', cap: 9000, rent: 1500000, cost: 50000000 },
  { name: 'Camp Ground', emoji: '🏕️', cap: 30000, rent: 4000000, cost: 250000000 },
];

/** [members needed, title] */
export const TITLES = [
  [0, 'Pastor'],
  [150, 'Senior Pastor'],
  [600, 'Reverend'],
  [2500, 'Bishop'],
  [9000, 'Archbishop'],
  [WIN_MEMBERS, 'General Overseer'],
];

/** Church equipment. `q` adds to service quality. Vanity items trade character for fame. */
export const UPGRADES = [
  { id: 'pa', emoji: '🎤', name: 'PA System', cost: 25000, q: 0.15, desc: 'So everyone at the back can hear the Word.' },
  { id: 'generator', emoji: '🔌', name: 'Generator', cost: 40000, q: 0, desc: 'Power cuts can no longer interrupt service. Fuel costs extra.' },
  { id: 'keyboard', emoji: '🎹', name: 'Keyboard & Drums', cost: 60000, q: 0.15, desc: 'Praise and worship that lifts the house.' },
  { id: 'chairs', emoji: '🪑', name: 'New Chairs', cost: 100000, q: 0.1, desc: 'No more standing during long services.' },
  { id: 'livestream', emoji: '📱', name: 'Livestream Setup', cost: 800000, q: 0.2, desc: 'Reach the sick, the travelling and the diaspora. +Fame daily.' },
  { id: 'bus', emoji: '🚌', name: 'Church Bus', cost: 2500000, q: 0.1, desc: 'Bring members to church. More people join daily.' },
  { id: 'school', emoji: '🏫', name: 'Mission School', cost: 20000000, q: 0.2, desc: 'Educate the community\'s children. +Character.', character: 10 },
  { id: 'jeep', emoji: '🚙', name: 'Pastor\'s Jeep', cost: 15000000, q: 0, desc: 'Big fame boost. Some members will start asking questions.', vanity: true, fame: 15, character: -6 },
  { id: 'jet', emoji: '🛩️', name: 'Private Jet', cost: 2000000000, q: 0, desc: 'For "kingdom business". Journalists will be watching.', vanity: true, fame: 30, character: -15 },
];

/** Branches open once the church owns an Auditorium. Each sends daily support. */
export const BRANCHES = [
  { id: 'abuja', flag: '🇳🇬', name: 'Abuja', cost: 5000000, daily: 60000 },
  { id: 'ph', flag: '🇳🇬', name: 'Port Harcourt', cost: 5000000, daily: 60000 },
  { id: 'accra', flag: '🇬🇭', name: 'Accra', cost: 15000000, daily: 150000 },
  { id: 'london', flag: '🇬🇧', name: 'London', cost: 60000000, daily: 600000 },
  { id: 'houston', flag: '🇺🇸', name: 'Houston', cost: 80000000, daily: 800000 },
  { id: 'toronto', flag: '🇨🇦', name: 'Toronto', cost: 80000000, daily: 800000 },
];

/** Zone labels used in hints ("Go to the buka"). Mirrors world zone ids. */
export const ZONE_LABELS = {
  street: 'the street', busstop: 'the bus stop', market: 'the market', gate: 'the church gate', carpark: 'the car park',
  compound: 'the church compound', 'church-hall': 'the church hall', altar: 'the altar', choir: 'the choir stand',
  media: 'the media desk', 'prayer-room': 'the prayer room', kitchen: 'the church kitchen', children: 'children\'s church', home: 'home',
};

/* ---------------------------------------------------------------- formatting */

/** Compact naira: ₦800, ₦12,400, ₦45k, ₦1.2M, ₦2B. */
export function naira(n) {
  const sign = n < 0 ? '-' : '';
  n = Math.abs(Math.round(n));
  if (n >= 1e9) return `${sign}₦${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)}B`;
  if (n >= 1e6) return `${sign}₦${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e5) return `${sign}₦${(n / 1e3).toFixed(0)}k`;
  return `${sign}₦${n.toLocaleString('en-NG')}`;
}

/** Compact count: 1,234 / 12.3k / 1.2M. */
export function num(n) {
  n = Math.round(n);
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  return n.toLocaleString('en-NG');
}
