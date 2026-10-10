// Daily assignments: every day the church gives you three small tasks of Christian life:
// visit the sick, pay your tithe, call your pastor, read the Word, take food to the children's
// home, share the gospel at the betting shop… Done-ness is read from the state (what you
// actually did today), so any way of doing it counts. Finishing all three earns a bonus.
import { rng32 } from '../map/geography.js';

const week = (s) => Math.floor(s.T / (1440 * 7));

/**
 * `done(s)` reads the state. `roles` limits who gets it. `where` hints where to go.
 */
export const ASSIGNMENTS = [
  { id: 'read', emoji: '📖', text: 'Read a chapter of the Bible (quiet time)', where: 'Phone → Bible', points: 4, done: (s) => !!s.doneToday.read },
  { id: 'pray', emoji: '🙏', text: 'Kneel and pray (P) for at least one session', where: 'Anywhere', points: 4, done: (s) => !!s.doneToday.pray || !!s.doneToday.prayroom },
  { id: 'prayfor', emoji: '🤲', text: 'Pray for two requests on the prayer wall', where: 'Phone → Prayer Wall', points: 6, done: (s) => (s.doneToday.prayfor || 0) >= 2 },
  { id: 'callpastor', emoji: '📞', text: 'Call Pastor Ade and ask him to pray with you', where: 'Phone → Phone', points: 4, done: (s) => !!s.doneToday['phone:callPastor'] },
  { id: 'callmum', emoji: '👩🏿', text: 'Call your mum (honour your parents)', where: 'Phone → Phone', points: 3, done: (s) => !!s.doneToday['phone:callMum'] },
  { id: 'sermon', emoji: '🎙️', text: 'Listen to last Sunday\'s sermon', where: 'Phone → Church Live', points: 3, done: (s) => !!s.doneToday['phone:sermon'] },
  { id: 'tithe', emoji: '🙌', text: 'Pay your tithe for this week', where: 'Phone → AmenPay', points: 6, done: (s) => s.gifts?.tithe === week(s) },
  { id: 'witness', emoji: '💬', text: 'Share the Gospel with someone', where: 'Today tab', points: 6, done: (s) => !!s.doneToday.witness },
  { id: 'visitsick', emoji: '🏥', text: 'Visit the sick at LUTH and pray with them', where: 'Map → LUTH', points: 10, done: (s) => !!s.doneToday['act:visitsick'] },
  { id: 'orphans', emoji: '🧸', text: 'Take food and gifts to Hope Children\'s Home', where: 'Map → Ikeja', points: 10, done: (s) => !!s.doneToday['act:orphanvisit'] || !!s.doneToday['act:teachkids'] },
  { id: 'betshop', emoji: '🎰', text: 'Tell the boys at the betting shop about Jesus (don\'t bet!)', where: 'Map → Ojuelegba', points: 10, done: (s) => !!s.doneToday['act:witnessbet'] },
  { id: 'cell', emoji: '🚓', text: 'Pray with the people in the police cell at Sabo', where: 'Map → Police Station', points: 10, done: (s) => !!s.doneToday['act:preachcell'] },
  { id: 'beachpray', emoji: '🌅', text: 'Pray by the sea at Elegushi', where: 'Map → Elegushi Beach', points: 6, done: (s) => !!s.doneToday['act:beachpray'] },
  { id: 'clean', emoji: '🧹', text: 'Help keep God\'s house clean', where: 'Grace Assembly', points: 6, roles: ['hospitality', 'usher', 'worshipper'], done: (s) => !!s.doneToday.clean || !!s.doneToday.cleaning || !!s.doneToday.serve },
  { id: 'rehearse', emoji: '🎼', text: 'Rehearse your songs for Sunday', where: 'Grace Assembly · keyboard', points: 6, roles: ['choir'], done: (s) => !!s.doneToday.rehearse || !!s.doneToday.practice },
  { id: 'patrol', emoji: '🔦', text: 'Do a patrol round of the church compound', where: 'Grace Assembly', points: 6, roles: ['security'], done: (s) => !!s.doneToday.patrol },
  { id: 'clips', emoji: '✂️', text: 'Edit sermon clips for the church page', where: 'Media desk', points: 6, roles: ['media'], done: (s) => !!s.doneToday.clips },
  { id: 'lesson', emoji: '✏️', text: 'Prepare next Sunday\'s children\'s lesson', where: 'Children\'s church', points: 6, roles: ['children'], done: (s) => !!s.doneToday.lesson },
  { id: 'intercede', emoji: '🔥', text: 'Lead an intercession session', where: 'Prayer room', points: 6, roles: ['prayer'], done: (s) => !!s.doneToday.intercede },
  { id: 'invite', emoji: '💌', text: 'Invite a neighbour to church on Sunday', where: 'Today tab', points: 6, roles: ['worshipper', 'visitor', 'usher'], done: (s) => !!s.doneToday.invite },
  { id: 'give', emoji: '🪙', text: 'Give an offering or support missions', where: 'Phone → AmenPay', points: 4, done: (s) => !!s.doneToday.given },
];
export const ASSIGNMENT_BY_ID = Object.fromEntries(ASSIGNMENTS.map((a) => [a.id, a]));
export const ALL_DONE_BONUS = 10;

/** Today's three assignments for this life (the same all day). */
export function todaysAssignments(s) {
  const day = Math.floor(s.T / 1440);
  const r = rng32(day * 7919 + (s.startT | 0));
  const pool = ASSIGNMENTS.filter((a) => !a.roles || a.roles.includes(s.role));
  const roleTask = pool.filter((a) => a.roles);
  const general = pool.filter((a) => !a.roles);
  const pick = [];
  if (roleTask.length) pick.push(roleTask[Math.floor(r() * roleTask.length)]);
  while (pick.length < 3 && general.length) {
    const a = general.splice(Math.floor(r() * general.length), 1)[0];
    pick.push(a);
  }
  return pick.map((a) => a.id);
}

/**
 * Keep `s.assign` for today, and reward newly finished assignments. Mutates `s`.
 * @returns {string[]} toast lines for what was just finished
 */
export function checkAssignments(s) {
  const day = Math.floor(s.T / 1440);
  if (!s.assign || s.assign.day !== day) s.assign = { day, ids: todaysAssignments(s), done: {}, bonus: false };
  const out = [];
  for (const id of s.assign.ids) {
    const a = ASSIGNMENT_BY_ID[id];
    if (!a || s.assign.done[id] || !a.done(s)) continue;
    s.assign.done[id] = true;
    s.points += a.points;
    out.push(`${a.emoji} Assignment done: ${a.text}. +${a.points}⭐`);
  }
  if (!s.assign.bonus && s.assign.ids.every((id) => s.assign.done[id])) {
    s.assign.bonus = true;
    s.points += ALL_DONE_BONUS;
    s.faith = Math.min(100, s.faith + 3);
    out.push(`🏆 All of today's assignments are done! "Well done, thou good and faithful servant" (Matthew 25:21). +${ALL_DONE_BONUS}⭐`);
  }
  return out;
}

/** Today's assignments with their state, for the UI. */
export function assignmentView(s) {
  if (!s.assign || s.assign.day !== Math.floor(s.T / 1440)) return [];
  return s.assign.ids.map((id) => ({ ...ASSIGNMENT_BY_ID[id], finished: !!s.assign.done[id] }));
}
