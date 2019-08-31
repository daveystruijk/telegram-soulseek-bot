require('dotenv').config();

const _ = require('lodash');
const slsk = require('slsk-client');
const Telegraf = require('telegraf');

const FILTER_WORDS = [
  'remix', 'rmx', 'edit', 'cover', 'live', 'mix', 'bootleg', 'acapella',
  'mashup',
];

const humanFilesize = (size) => {
  var i = Math.floor( Math.log(size) / Math.log(1024) );
  return ( size / Math.pow(1024, i) ).toFixed(2) * 1 + ' ' + ['B', 'kB', 'MB', 'GB', 'TB'][i];
};

const handleErr = (ctx, err) => {
  console.error(err);
  if (ctx) {
    ctx.reply(err);
  }
};

const sendMessage = (ctx, msg) => {
  console.log(msg);
  if (ctx) {
    ctx.reply(msg);
  }
};

const basename = (filename) => {
  const split = filename.split("\\");
  return split[split.length - 1];
};

const filterResult = (r, query) => {
  const filename = basename(r.file);
  const splitQuery = query.split(' - ');
  const splitFilename = filename.split(' - ');

  return (r.bitrate >= 320
          && r.slots === true
          && r.file.endsWith('.mp3')
          && _.every(splitQuery, (piece, i) => {
            try {
              return splitFilename[i].toLowerCase().includes(piece.toLowerCase());
            } catch (e) {
              return false;
            }
          })
          && _.every(FILTER_WORDS, (word) => {
            return !filename.toLowerCase().includes(word)
              || query.toLowerCase().includes(word)
          })
         )
};

const formatResult = (r) => {
  return `${basename(r.file)} (${humanFilesize(r.size)})`;
};

const retrieveFile = (soulseek, ctx, result, filename) => {
  soulseek.download({
    file: result,
    path: __dirname + '/download/' + filename,
  }, (err, data) => {
    if (err) { handleErr(ctx, err); }
    sendMessage(ctx, `Download of "${filename}" completed!`);
  });
}

const onDownload = async (soulseek, ctx, query) => {
  sendMessage(ctx, `Searching: ${query}`);
  const req = query.toLowerCase().replace(' - ', ' ');
  soulseek.search({ req, timeout: 20000 }, (err, rawResults) => {
    if (err) { handleErr(ctx, err); }
    const results = rawResults.filter((r) => { return filterResult(r, query) });
    const sorted = _.sortBy(results, 'speed');
    const bestResult = sorted[sorted.length - 1];
    sendMessage(ctx, `Found ${results.length} results (${rawResults.length} unfiltered)\nBest result: ${formatResult(bestResult)}`);
    retrieveFile(soulseek, ctx, bestResult, `${query}.mp3`);
  });
}

const main = async (soulseek) => {
  const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
  bot.command('download', (ctx) => {
    const query = ctx.update.message.text.replace('/download ', '').trim();
    onDownload(soulseek, ctx, query);
  });
  bot.launch();
};

(async () => {
  slsk.connect({
    user: process.env.SLSK_USER,
    pass: process.env.SLSK_PASS,
  }, async (err, client) => {
    await main(client);
  });
})().catch(err => { console.error(err) });

