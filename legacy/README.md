# Amen City ⛪

A free browser game for Nigerian Christians: a virtual church world set in real Lagos. Everyone has a place in God's house. Everything that happens in real church life happens here, virtually, and the devil is busy.

## Pick who you are

| Role | Ranks | Daily duties |
|---|---|---|
| 🙏 Worshipper | First-timer → Member → Pillar of the Church | Invite people to church, house fellowship |
| 🕊️ Prayer Warrior | Intercessor → Prayer Warrior → Prayer Coordinator | Intercession sessions, the prayer line |
| 🛡️ Security | Security Volunteer → Gate Supervisor → Chief Security Officer | Gate and car park duty, night patrol |
| 🧤 Usher | Usher → Senior Usher → Head Usher | Seat people, welcome first-timers |
| 🎶 Choir | Chorister → Lead Vocalist → Choir Director | Rehearsals, ministering in song |
| 🎥 Media & Sound | Media Volunteer → Sound Engineer → Head of Media | Mixer and livestream, sermon clips |
| 🍲 Hospitality | Kitchen Volunteer → Head Cook → Head of Hospitality | Cooking for programmes, cleaning the church |
| 🧒 Children's Teacher | Assistant Teacher → Sunday School Teacher → Coordinator | Teaching Sunday school, preparing lessons |
| 👀 Visitor | Visitor → Regular Visitor → Member | Asking questions, follow-up visits |
| 📖 Minister Path | New Convert → … → Bible School → Ordained Pastor → General Overseer | Bible school exams (real Bible quizzes), then planting and growing your own church |

You can change roles any time; your rank starts over. Promotions need experience, faith and character.

## How it plays

- **Free will:** nobody forces you to church. Sunday service, midweek Bible study and Friday vigil are there, but you can sleep in, watch football at the viewing centre, or go to an owambe. Skipping costs faith and your **Sunday streak**; showing up earns streak bonuses.
- **⭐ Points and ₦ naira:** points come from showing up, serving, praying and evangelism. Naira comes from your job and missions stipends. Spend them in the **Shop** (study Bible, prayer mat, tambourine, Sunday best, bicycle, smartphone, aso-ebi). Every item does something.
- **Needs and mood, like Lagos Life:** you get hungry (eat at the buka or cook at home), energy runs out, and your mood (Joyful → Miserable) follows your faith, hunger and conscience.
- **Prayer tab:** pray in the prayer room, go up Prayer Mountain on Saturdays, and pray for requests on the prayer wall (examples for now; real people's requests once multiplayer is live). Post your own requests and mark them answered as testimonies.
- **Evangelism missions in real Lagos:** the harder the mission, the more it needs and the more it pays.
  1. Tracts at Oshodi bus stop
  2. Preaching at Balogun Market
  3. LUTH and Kirikiri prison visits
  4. Makoko waterfront outreach
  5. A village crusade past Epe
- **The devil is busy:** most nights bring a temptation, and every role has its own (the usher and the offering bag, security offered a bribe, the choir solo given to someone else, the hospitality "extra meat"). There's also a "Distractions 😈" list: sports betting, the beer parlour, "Yahoo" money. Falls can be confessed and forgiven (1 John 1:9), but the damage to Character stays. Repeated fraud ends with EFCC.
- **Real Lagos:** your home and church are in a real area (Yaba, Surulere, Ikeja, Ajegunle, Festac…). Events happen at Ojuelegba, Tarkwa Bay, Festac and other real places. Churches and people are fictional.
- **3D world with your own character:** a low-poly dollhouse view of your home or the church, with you at your post (security at the gate booth, usher in the aisle, media at the sound desk, prayer warrior kneeling at the altar, worshippers in the front seat).

## Controls

| Key | Action |
|---|---|
| `W` `A` `S` `D` or arrows | Walk |
| `Shift` | Run |
| `Space` | Jump |
| `C` | Sit / stand |
| `P` | Kneel and pray |
| `E` | Wave |
| `Q` / `R` | Turn the camera |
| `V` | Switch between home and church |
| `N` | End the day |
| `?` | Show the controls list |

On phones there's an on-screen arrow pad with Jump, Sit, Wave and Pray buttons, and you can drag the scene to turn the camera.

## Design

Neo-brutalist UI after the SpendsIn template:
- **Look:** cream grid paper, 2px black borders, hard offset shadows, pastel blocks, Space Grotesk and Inter, Lucide icons.
- **Effects:** progressive top blur, alpha-masked lists, gradient borders, CSS glass and the `animationIn` intro.
- **Accessibility:** WCAG AA contrast, focus rings and large touch targets.

Scripture is quoted from the King James Version, which is public domain.

## Run it

The game is plain HTML, CSS and JavaScript with no build step. [Three.js](https://threejs.org) r128 (MIT) and [Lucide](https://lucide.dev) 0.460 (ISC) are included in `vendor/`. Open `index.html`, or serve the folder:

```
npx serve .
```

To deploy for free, push the repo to Cloudflare Pages or Vercel as a static site.

## Roadmap

**Next: more of the Lagos Life blueprint**
- A map of Lagos places with transport choices (danfo, okada, keke, BRT) that cost time and naira
- Real-time days, so Sunday service is on a real Sunday at 9am WAT
- A daily verse hunt with prizes, the faith version of the gem hunt

**Multiplayer (Supabase free tier)**
- Nickname logins with minimal personal data
- See other real players with @names in the church; church chat
- A real Prayer Wall: people post requests and others pray ("214 people prayed for you")
- Live Sunday service and Friday vigil with everyone in the same auditorium; "12,430 believers online"

**Money (Paystack / Flutterwave)**
- Small purchases from ₦200 to ₦1,000: cosmetics, outfits, energy. **Faith and character can never be bought**
- Christian businesses advertising at the church gate
- Real churches paying for their own virtual branch where their members gather

**Rules to stay out of trouble**
- In-game money can never be withdrawn as real cash
- Collect minimal personal data (Nigeria's data protection law, NDPA)
- Real places are fine; real churches, pastors and people stay fictional
