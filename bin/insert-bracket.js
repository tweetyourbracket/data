#!/usr/bin/env node

'use strict';

const scoresParse = require('scores/lib/parse');
const async = require('async');
const config = require('getconfig');
const Updater = require('bracket-updater');
const yargs = require('yargs');

const onSaveMaster = require('../lib/saveMaster');
const createLogger = require('../lib/logger');
const latestBracket = require('../lib/latestBracket');

const today = `${new Date().getFullYear()}${new Date().getMonth() + 1}${new Date().getDate()}`;
const usage = `Usage: $0 --date [yyyymmdd] --sport [SPORT] --teams [TEAM1,TEAM2]
If any team is not found in scores from DATE/SPORT, all inserts will be aborted.`;

const {
  sport,
  date: DATE,
  teams: TEAMS
} = yargs
  .usage(usage)
  // Date
  .string('date')
  .default('date', today)
  .describe('date', 'Load scores from this date')
  // Sport
  .string('sport')
  .require('sport')
  .describe('sport', 'Load scores for this sport')
  // Teams
  .array('teams')
  .require('teams')
  .describe('teams', 'Completed games will be saved as new brackets in this order')
  .argv;

const year = DATE.match(/^\d{4}/)[0];
const scoreConfig = config.scores[sport];
const logger = createLogger(`insert-bracket:${sport}-${year}`);

// Partially-ish applied functions based on predetermined options
const saveMaster = onSaveMaster({logger, sport, year});
const updater = new Updater({sport, year});
const parseDate = (cb) => scoresParse(scoreConfig.url.replace('{date}', DATE), scoreConfig.parse, cb);
const getCurrent = (cb) => latestBracket({logger, sport, year}, cb);

// Helpers to normalize team names and seeds
const transformTeam = (team) => ({seed: team.rank, name: team.names});
const normalizeTeamName = (name) => name.toLowerCase().replace(/[^\w\s-]/g, '');
const matchTeam = (all, team) => all.map(normalizeTeamName).indexOf(normalizeTeamName(team)) > -1;

// Of all events find one that matches the team and return relevant event data
const findGame = (events) => (team) => {
  const event = events.find((e) => matchTeam(e.home.names, team) || matchTeam(e.away.names, team));

  if (!event || !event.status.completed) return null;

  return {
    region: event.region,
    series: event.series,
    winner: transformTeam(event.home.winner ? event.home : event.away),
    loser: transformTeam(event.home.winner ? event.away : event.home)
  };
};

// Generate a readable message for any case where a team is inputted but doesnt
// match the events on the master list
const missingMessage = ({events, teams, missing}) => {
  const teamsMessage = normalizeTeamName(teams[missing]);
  const eventsMessage = events.map((e) => {
    const h = e.home.names.map(normalizeTeamName).join('|');
    const a = e.away.names.map(normalizeTeamName).join('|');
    return `${e.status.completed}\n${h}\n${a}`;
  }).join('\n\n');

  return `Could not find completed game for: ${teamsMessage}\n\nPossible values:\n\n${eventsMessage}`;
};

// Takes the current master and a list of teams and looks through the results
// for each team. If all teams are found, then it goes through each team in
// order and inserts each new bracket.
const updateGames = (currentMaster, teams, cb) => parseDate((err, events) => {
  if (err) return cb(err);

  const games = teams.map(findGame(events));
  const missing = games.indexOf(null);

  if (missing > -1) return cb(null, new Error(missingMessage({events, teams, missing})));

  return async.map(games, (game, gameCb) => {
    currentMaster = updater.update({
      currentMaster,
      fromRegion: game.region,
      playedCompetitions: game.series.playedCompetitions,
      winner: game.winner,
      loser: game.loser
    });

    saveMaster(currentMaster, gameCb);
  }, cb);
});

// Run the whole thing
getCurrent((currentErr, current) => {
  if (currentErr) {
    logger.error('Could not get current bracket', currentErr);
    throw currentErr;
  }

  updateGames(current, TEAMS, (updateErr, brackets) => {
    if (updateErr) {
      logger.error('Erroring updating games', updateErr);
      throw updateErr;
    }

    logger.log('Success!');
    brackets.map((b) => logger.log(b));
    logger.log('===============\nRestart the score worker!\n===============');
  });
});