# UCDegens fantasy football hub

A mobile-first Next.js dashboard for the single Sleeper league `1389131126982860800`.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The league ID is configured in `src/lib/sleeper.ts`; set `SLEEPER_LEAGUE_ID` in `.env.local` if you want to point the app at a different league. The Sleeper API is read-only, so lineup and roster changes still happen in Sleeper.

## Dashboard

- League overview and current NFL week
- Weekly matchup scores and records
- Standings sorted by wins and points for
- Current-week waiver, free-agent, and trade activity
- League format, scoring, lineup slots, and playoff settings

League data is fetched server-side. Most endpoints refresh every two minutes; Sleeper's player directory is cached for a day, as recommended in its [API documentation](https://docs.sleeper.com/).
