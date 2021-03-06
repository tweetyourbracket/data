#!/usr/bin/env node

"use strict";

require("dotenv").config();

const scoresParse = require("scores/lib/parse");
const async = require("async");
const config = require("getconfig");
const Updater = require("bracket-updater");
const yargs = require("yargs");
const _ = require("lodash");

const onSaveMaster = require("../lib/saveMaster");
const createLogger = require("../lib/logger");
const latestBracket = require("../lib/latestBracket");

const today = `${new Date().getFullYear()}${
  new Date().getMonth() + 1
}${new Date().getDate()}`;
const usage = `Usage: $0 --date [yyyymmdd] --sport [SPORT] --teams [TEAM1] [TEAM2]
If any team is not found in scores from DATE/SPORT, all inserts will be aborted.`;

const { sport, date: DATE, teams: TEAMS, game: GAME } = yargs
  .usage(usage)
  // Date
  .string("date")
  .default("date", today)
  .describe("date", "Load scores from this date")
  // Sport
  .string("sport")
  .require("sport")
  .describe("sport", "Load scores for this sport")
  // Teams
  .array("teams")
  .describe(
    "teams",
    "Completed games will be saved as new brackets in this order"
  )
  // Game
  .string("game")
  .describe("game", "A string to override checking the actual results")
  .coerce("game", (val) => {
    const gameMatch = /^([a-zA-Z]+) (\d+) ?([a-zA-Z\s]+)? over (\d+) ?([a-zA-Z\s]+)? in (\d+)$/;
    const match = val.match(gameMatch);
    if (!match)
      throw new Error(
        "Game should be: REGION SEED WINNER over SEED LOSER in SERIES"
      );
    const [, region, winnerSeed, winner, loserSeed, loser, series] = match;
    return {
      region,
      series: { playedCompetitions: series },
      winner: { name: [winner], seed: winnerSeed },
      loser: { name: [loser], seed: loserSeed },
    };
  }).argv;

if (!TEAMS && !GAME) {
  throw new Error("teams or game is required");
}

const year = DATE.match(/^\d{4}/)[0];
const scoreConfig = config.scores[sport];
const logger = createLogger(`insert-bracket-${sport}-${year}`);

// Partially-ish applied functions based on predetermined options
const saveMaster = onSaveMaster({ logger, sport, year });
const updater = new Updater({ sport, year });
const parseDate = (cb) =>
  scoresParse(scoreConfig.url.replace("{date}", DATE), scoreConfig.parse, cb);
const getCurrent = (cb) => latestBracket({ logger, sport, year }, cb);

// Helpers to normalize team names and seeds
const transformTeam = (team) =>
  _.omitBy({ seed: team.rank, name: team.names }, (value) => value == null);
const normalizeTeamName = (name) => name.toLowerCase().replace(/[^\w\s-]/g, "");
const matchTeam = (all, team) =>
  all.map(normalizeTeamName).indexOf(normalizeTeamName(team)) > -1;
const getNames = (team) =>
  (team.names || team.name).map(normalizeTeamName).join("|");

// eslint-disable-next-line no-process-exit
const exit = () => process.exit(0);

// Of all events find one that matches the team and return relevant event data
const findGame = (events, team) => {
  const event = events.find(
    (e) => matchTeam(e.home.names, team) || matchTeam(e.away.names, team)
  );

  if (!event || !event.status.completed) return null;

  return {
    region: event.region,
    series: event.series,
    winner: transformTeam(event.home.winner ? event.home : event.away),
    loser: transformTeam(event.home.winner ? event.away : event.home),
  };
};

// Generate a readable message for any case where a team is inputted but doesnt
// match the events on the master list
const missingMessage = ({ events, teams, missing }) => {
  const teamsMessage = normalizeTeamName(teams[missing]);
  const eventsMessage = events
    .map((e) =>
      [
        `completed: ${e.status.completed}`,
        `home: ${getNames(e.home)}`,
        `away: ${getNames(e.away)}`,
      ].join("\n")
    )
    .join("\n\n");
  return `Could not find completed game for: ${teamsMessage}\n\nPossible values:\n\n${eventsMessage}`;
};

const updateGames = (currentMaster, games, cb) =>
  async.map(
    games,
    (game, gameCb) => {
      const {
        region,
        winner,
        loser,
        series: { playedCompetitions },
      } = game;

      logger.log(
        `Updating ${winner.seed} ${winner.name[0]} over ${loser.seed} ${loser.name[0]} from ${region} in ${playedCompetitions}`
      );

      const update = {
        currentMaster,
        winner,
        loser,
        playedCompetitions,
        fromRegion: region,
      };

      logger.log(JSON.stringify(update));

      currentMaster = updater.update(update);

      if (currentMaster instanceof Error) {
        gameCb(currentMaster);
        return;
      }

      saveMaster(currentMaster, gameCb);
    },
    cb
  );

// Takes the current master and a list of teams and looks through the results
// for each team. If all teams are found, then it goes through each team in
// order and inserts each new bracket.
const updateCurrent = (currentMaster, teams, cb) =>
  parseDate((err, events) => {
    if (err) return cb(err);

    const games = teams.map((team) => findGame(events, team));
    const missing = games.indexOf(null);

    if (missing > -1) {
      logger.warn(missingMessage({ events, teams, missing }));
      return cb(new Error("Missing team"));
    }

    logger.log(`Updating for ${games.length} games`);

    return updateGames(currentMaster, games, cb);
  });

// Run the whole thing
getCurrent((currentErr, current) => {
  if (currentErr) {
    logger.error("Could not get current bracket", currentErr);
    throw currentErr;
  }

  logger.log("Starting with", current);

  const update = (updateErr, brackets) => {
    if (updateErr) {
      logger.error("Aboring update", updateErr.message);
      return exit();
    }

    logger.log("Success!");
    brackets.map((b) => logger.log(b));
    logger.log("=============== Restart the score worker! ===============");

    return exit();
  };

  if (GAME) {
    updateGames(current, [GAME], update);
  } else {
    updateCurrent(current, TEAMS, update);
  }
});
