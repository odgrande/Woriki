# Pastor Life ⛪

A free browser game for Nigerian Christians. It's a virtual walk of faith: everything that happens in real church life happens here, but virtually.

**The journey:** New Convert → Baptism → Church Worker → Bible School (3 semesters of Bible-quiz exams) → Ordination → plant a church in your living room → grow it to a Camp Ground with branches in Abuja, Accra, London, Houston and Toronto.

## How it plays

- **Church tradition:** pick Pentecostal, Mission (Anglican/Methodist), Baptist or White Garment (Aladura). Each one strengthens different things, such as vigils, liturgy, Bible study or prayer.
- **Your walk with God:** attend Sunday service, midweek Bible study or the Friday night vigil. Pray, read the Bible (there's a verse of the day), serve in your department, help people in need, and go to work to pay your way.
- **Bible school:** attend lectures and pass the exams. The questions are real Bible questions.
- **Temptations, as in real life:** gossip, anger in traffic, inflated receipts, a found wallet, leaked exam questions. Choosing wrong is a *fall*. You can always **Confess & Repent** (1 John 1:9), but the damage to your Character stays.
- **Pastoral ministry:** services, vigils, crusades, outreach, choir, equipment, venues and branches abroad. There are also events like rent increases, members relocating abroad, a rival church across the road, weddings, testimonies, harvest, and an assistant pastor breaking away.
- **Shortcuts (distractions):** selling "anointing oil", "special seed" offerings, poaching members, buying a Jeep or private jet, taking a politician's money. They pay fast, but they drain Character. That leads to a **scandal** (confess, deny, or blame the enemy) and eventually the **EFCC ending**.
- **Grace:** if your faith runs dry, a brother visits and restores you. The only way to "lose" is a pastor whose Character hits zero.
- **Share card:** a testimony image for WhatsApp, X and TikTok.
- **3D world:** a low-poly "dollhouse" view, like Lagos Life. Before ordination you see your own room (a bookshelf appears in Bible school, a certificate when you graduate). As a pastor you see your church, cut away so you can look inside, and it changes as you grow:
  - **Venues:** living room → shop → classroom → warehouse → auditorium → cathedral → Camp Ground
  - **Inside:** members fill the seats, the choir wears your tradition's robes (white for Aladura), and the pastor stands at the pulpit
  - **Your purchases:** speakers, keyboard and drums, livestream camera, and a generator, bus, Jeep, jet and mission school outside
  - Drag the scene to rotate it

**UI** is neo-brutalist, after the SpendsIn template: cream grid paper, 2px black borders, hard offset shadows, pastel blocks (green, yellow, pink, blue), tilted badges, Space Grotesk headings and Inter body text, and Lucide icons. Effects: a progressive blur over the top of the 3D scene, an alpha mask fading the edges of the scrolling action list, gradient borders on dark surfaces, CSS glass on the stats bar, and the `animationIn` intro (switched off when the device asks for reduced motion). It keeps WCAG AA contrast, focus rings and 44px touch targets. Phones get a bottom navigation bar and desktops a sidebar.

Scripture is quoted from the King James Version, which is public domain. All people and churches are fictional.

## Run it

The game is plain HTML, CSS and JavaScript with no build step. The 3D scene uses [Three.js](https://threejs.org) r128 (MIT licence) and the icons use [Lucide](https://lucide.dev) 0.460 (ISC licence). Both are included in `vendor/` so the game doesn't depend on a CDN. Open `index.html`, or serve the folder:

```
npx serve .
```

To deploy for free, push the repo to Cloudflare Pages or Vercel as a static site.

## Roadmap

### Phase 1: single player (this version)
- [x] The full journey, temptations, scandal and endings
- [x] Church types, branches abroad, share card
- [x] Progress saved on the device (localStorage)

### Phase 2: multiplayer, like Lagos Life (Supabase free tier)
- Player accounts by phone number or a nickname only, so we collect as little data as possible
- A **shared world**: every pastor's church is real. Other players can visit, attend Sunday service or a vigil there, become members, and serve as workers (choir, ushers, evangelism).
- Players choose which church to attend, so the membership count is made of real people
- Live counter ("12,430 believers online"), leaderboards by church size and by Character
- Church chat or prayer wall (moderated)

### Phase 3: making money (Paystack or Flutterwave)
- Small purchases from ₦200 to ₦1,000: energy refills, cosmetics (choir robes, church decor, building skins), extra save slots. **Faith and Character can never be bought.**
- In-game billboards and sponsorships from Christian businesses (bookshops, gospel artists, events)
- Gospel creator and streamer partnerships

### Rules to stay out of trouble
- In-game money can **never** be withdrawn as real cash. Otherwise it becomes gambling.
- Collect the minimum personal data, because Nigeria's data protection law (NDPA) applies.
- Keep everyone fictional: no real pastors, churches or ministries.
