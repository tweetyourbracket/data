data
=================

The data and DB for [bracket.club](https://bracket.club).

[![Build Status](https://travis-ci.org/bracketclub/data.svg?branch=master)](https://travis-ci.org/bracketclub/data)


## Running each watcher

**Watchers**

- `entries`
- `scores`

**Sports**

- `ncaam`
- `ncaaw`
- `nba`
- `nhl`

```sh
node watchers/$WATCHER --sport=$SPORT --year=$YEAR
```


## Via pm2

```sh
# Any command run through this npm run-script will use NODE_ENV=production
# They will also use the current year for $YEAR

# Start only one
npm start $WATCHER $SPORT

# Run other pm2 commnads
npm start $WATCHER $SPORT restart
npm start $WATCHER $SPORT stop
npm start $WATCHER $SPORT delete
npm start $WATCHER $SPORT logs
```


## Integration Tests

```sh
# Connects to the DB and adds masters/entries/users to all sports every 5 seconds
npm run integration
```


## So you missed a finished score in production

```sh
# Want you probably want to do if you missed something today.
# Since order of masters matters in the database the --teams param order
# is important. This will take the current bracket and look up the scores for today
# (or use --date) and apply each result that the teams played in.
NODE_ENV=production npm run insert-by-team -- --sport ncaaw --teams uconn "notre dame"
```

## Dumping a database

```sh
# Connection string will come from NODE_ENV and it will save to sql/$ENV.sql
NODE_ENV=production npm run dump
```

## Setting up environment variables

```sh
# Create a .env file with all the necessary env vars for production
echo "TWITTER_KEY=$TWITTER_KEY" >> .env
echo "TWITTER_SECRET=$TWITTER_SECRET" >> .env
echo "TWITTER_TOKEN=$TWITTER_TOKEN" >> .env
echo "TWITTER_TOKEN_SECRET=$TWITTER_TOKEN_SECRET" >> .env
echo "POSTGRES_URL=$POSTGRES_URL" >> .env
```

## Production Database on Heroku

```sh
# Open a psql shell
npm run heroku:psql

# Import current local sql file to production
npm run heroku:psql < sql/production.sql

# Open webpage to heroku DB
npm run heroku:web
```

## Linode CLI Commands

```sh
# Create or rebuild the linode based on the current stackscript
# Pass it a path to a public key in order to allow SSH access
# The .env file will be used to populate vars to the Linode
npm run deploy build ./linode.pub

# Update the stackscript with whats in the repo
npm run deploy stackscript

# IP address of linode
npm run deploy ip

# Delete linode
npm run deploy delete
```
