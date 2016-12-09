'use strict';

const Generator = require('bracket-generator');

const createLogger = require('../lib/logger');
const createSaveEntry = require('../lib/saveEntry');
const {sport, year, id} = require('../lib/sportYear');

const logger = createLogger(`entries:${id}`);
const saveEntry = createSaveEntry({logger, sport, year});
const bracket = new Generator({sport, year});

const INITIAL = 5000;
const INTERVAL = 5000;

const A = 65;
const numbers = () => Math.random().toString().slice(2);
const letters = () => numbers().split('').map((n) => String.fromCharCode(parseInt(n, 10) + A)).join('');

setTimeout(() => setInterval(() => saveEntry({
  data_id: numbers(),
  user_id: numbers(),
  username: letters(),
  name: letters(),
  profile_pic: '',
  bracket: bracket.generate('random'),
  created: new Date().toJSON()
}), INTERVAL), INITIAL);
