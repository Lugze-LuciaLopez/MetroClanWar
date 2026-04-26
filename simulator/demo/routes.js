// Static demo routes used by the graphical UI to drive the player-peer.
// These replace the GPS capture for the hackathon demo.
//
// Each station carries a tOffsetSecs from the start of the route. The
// route-runner scales these offsets by `timeScale` so the demo doesn't
// take real metro-time to run.

export const POINTS_PER_STATION = 3

export const validRouteL4 = {
  routeId: 'L4-BCN-URQ',
  label: 'L4 Barceloneta → Urquinaona',
  lineId: 'L4',
  stations: [
    { stationId: 'BARCELONETA', tOffsetSecs: 0 },
    { stationId: 'JAUME_I',     tOffsetSecs: 180 },
    { stationId: 'URQUINAONA',  tOffsetSecs: 360 }
  ]
}

export const validRouteL2 = {
  routeId: 'L2-PAR-PG',
  label: 'L2 Paral·lel → Passeig de Gràcia',
  lineId: 'L2',
  stations: [
    { stationId: 'PARALLEL',          tOffsetSecs: 0 },
    { stationId: 'SANT_ANTONI',       tOffsetSecs: 180 },
    { stationId: 'UNIVERSITAT',       tOffsetSecs: 360 },
    { stationId: 'PASSEIG_DE_GRACIA', tOffsetSecs: 540 }
  ]
}

export const cheatRoute = {
  routeId: 'CHEAT',
  label: 'Trampa: Barceloneta → Hospital de Bellvitge',
  lineId: 'L4',
  stations: [
    { stationId: 'BARCELONETA',           tOffsetSecs: 0 },
    { stationId: 'HOSPITAL_DE_BELLVITGE', tOffsetSecs: 10 }
  ]
}

export const demoRoutes = {
  [validRouteL4.routeId]: validRouteL4,
  [validRouteL2.routeId]: validRouteL2,
  [cheatRoute.routeId]:   cheatRoute
}

export function describeRoutes() {
  return Object.values(demoRoutes).map(r => ({
    routeId: r.routeId,
    label: r.label,
    lineId: r.lineId,
    stationCount: r.stations.length
  }))
}
